import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { SupplierRepository } from '../../src/mocks/supplier-repository';
import type { StoragePort } from '../../src/mocks/supplier-repository';
import { ChannelRepository } from '../../src/mocks/channel-repository';
import { SourcingRepository } from '../../src/mocks/sourcing-repository';
import { QuoteRepository } from '../../src/mocks/quote-repository';
import { discountBps } from '../../src/domain/rules';
import type { QuoteInput } from '../../src/services/quotation-types';
import {
  analysisValidity,
  analyticsWeek,
  buildChannelTrend,
  compareAnalysis,
  summarizeAnalysis,
  timestamp,
} from '../../src/domain/procurement-analytics';
import type { AnalysisRecord } from '../../src/domain/procurement-analytics';
import {
  projectAnalysisRecord,
  createAnalysis,
} from '../../src/services/procurement-analytics';
import { loadDashboard } from '../../src/services/dashboard';
class Memory implements StoragePort {
  values = new Map<string, string>();
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.values.set(k, v);
  }
}
let memory: Memory,
  suppliers: SupplierRepository,
  channels: ChannelRepository,
  sourcing: SourcingRepository,
  quotes: QuoteRepository;
const now = Date.parse('2026-11-13T08:00:00Z');
const key = () => crypto.randomUUID();
const api = (
  id = 'u-ops',
  domain?: 'domestic' | 'overseas',
  active = () => true,
) =>
  createMockAdapter(id, domain, suppliers, active, channels, sourcing, quotes);
const input = (extra: Partial<QuoteInput> = {}): QuoteInput => ({
  channelId: 'ch-1',
  demandId: null,
  demandItemId: null,
  inquiryId: null,
  inquiryVersion: null,
  previousQuoteId: null,
  discount: discountBps(6000),
  priceStatus: 'reference',
  sourceType: 'supplier_submission',
  effectiveFrom: null,
  effectiveUntil: null,
  evidenceReference: 'mock:evidence:analysis',
  supplierSubmitterReference: 'mock:contact',
  supplierQuotedAt: null,
  reason: '模拟报价供分析；非官方价格',
  priceSpec: {
    currency: 'CNY',
    referencePriceSource: 'mock:basis',
    specification: 'mock:spec',
    rates: [
      {
        dimension: 'input_token',
        quantity: 1000000,
        unit: 'Token',
        amount: '0.123456',
      },
    ],
  },
  ...extra,
});
const create = (extra: Partial<QuoteInput> = {}) =>
  api().createQuote(input(extra), key());
async function record(extra: Partial<QuoteInput> = {}) {
  return projectAnalysisRecord(await create(extra));
}
const keys = (v: unknown): string[] =>
  v && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, v]) => [k, ...keys(v)])
    : [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  memory = new Memory();
  suppliers = new SupplierRepository(memory);
  channels = new ChannelRepository(memory);
  sourcing = new SourcingRepository(memory);
  quotes = new QuoteRepository(memory);
});
afterEach(() => vi.useRealTimers());
describe('current authorized procurement analytics', () => {
  it('deduplicates suppliers by stable ID rather than quote or multi-channel counts', async () => {
    const d = await api().queryProcurementAnalytics();
    expect(d.stats.channels).toBe(3);
    expect(d.stats.suppliers).toBe(1);
    expect(d.stats.models).toBe(2);
    await create({ channelId: 'ch-3' });
    const next = await api().queryProcurementAnalytics();
    expect(next.stats.channels).toBe(4);
    expect(next.stats.suppliers).toBe(2);
  });
  it('separates historical coverage from current effective and temporary records', async () => {
    const d = await api().queryProcurementAnalytics();
    const original = await api().queryQuotes();
    expect(d.stats.pending).toBe(original.stats.pending);
    expect(d.stats.reference).toBe(original.stats.reference);
    expect(d.stats.effective).toBe(original.stats.effective);
    expect(d.stats.temporary).toBe(original.stats.temporary);
    expect(d.stats.formalChannels).toBeGreaterThan(0);
    expect(d.stats.promotionChannels).toBe(1);
    expect(d.stats.incomplete).toBe(7);
    expect(d.stats.incomparable).toBe(7);
  });
  it('refreshes after append without caching and never writes during analysis', async () => {
    const before = await api().queryProcurementAnalytics();
    const r = await create({ channelId: 'ch-3' });
    const raw = new Map(memory.values);
    const d = await api().queryProcurementAnalytics();
    expect(d.records.length).toBe(before.records.length + 1);
    expect(d.records.some((a) => a.quote.id === r.quote.id)).toBe(true);
    expect(memory.values).toEqual(raw);
    expect(d.stats.channels).toBe(before.stats.channels + 1);
  });
  it('reads all quote pages rather than silently truncating at 50', async () => {
    for (let i = 0; i < 46; i++) await create();
    const d = await api().queryProcurementAnalytics();
    expect(d.records).toHaveLength(53);
    expect(d.stats.reference).toBe(48);
  });
  it('verification and confirmation refresh metadata and status but do not append a trend price point', async () => {
    const a = api();
    const r = await create({ priceStatus: 'pending_contract' });
    const before = await a.queryProcurementAnalytics({ channelId: 'ch-1' });
    const previous = buildChannelTrend(before.records, 'ch-1');
    await a.verifyQuote(r.quote.id, 1, 'mock:verify', '模拟核验', key());
    const verified = await a.queryProcurementAnalytics();
    expect(
      verified.records.find((q) => q.quote.id === r.quote.id)?.verified,
    ).toBe(true);
    await a.confirmQuote(
      r.quote.id,
      2,
      'mock:formal',
      '2026-11-13T00:00:00Z',
      '模拟确认',
      key(),
    );
    const d = await a.queryProcurementAnalytics({ channelId: 'ch-1' });
    expect(d.stats.effective).toBe(before.stats.effective + 1);
    expect(d.stats.pending).toBe(before.stats.pending - 1);
    const after = buildChannelTrend(d.records, 'ch-1');
    expect(after.series).toEqual(
      previous.series.map((s) => ({
        ...s,
        points: s.points.map((p) =>
          p.record.quote.id === r.quote.id
            ? {
                ...p,
                record: d.records.find((q) => q.quote.id === r.quote.id)!,
              }
            : p,
        ),
      })),
    );
    expect(after.priceEvents).toBe(previous.priceEvents);
    expect(d.records).toHaveLength(before.records.length);
  });
  it('latest quote remains distinct from formal price and independent active offers', async () => {
    const a = api();
    const r = await create();
    await a.verifyQuote(r.quote.id, 1, 'mock:v', '模拟核验', key());
    await a.confirmQuote(
      r.quote.id,
      2,
      'mock:f',
      '2026-11-13T00:00:00Z',
      '模拟确认',
      key(),
    );
    vi.setSystemTime(now + 1000);
    const later = await create({ discount: discountBps(5000) });
    vi.setSystemTime(now + 2000);
    await create({
      priceStatus: 'temporary',
      sourceType: 'promotion',
      effectiveFrom: '2026-11-12T00:00:00Z',
      effectiveUntil: '2026-11-16T00:00:00Z',
    });
    const d = await a.queryProcurementAnalytics();
    const c = d.channelPrices.find((c) => c.channelId === 'ch-1')!;
    expect(c.latest?.quote.priceStatus).toBe('temporary');
    expect(c.latestFormal?.quote.id).toBe(r.quote.id);
    expect(c.activePromotions).toHaveLength(2);
    expect(c.records.some((q) => q.quote.id === later.quote.id)).toBe(true);
    expect(d.promotions.every((v) => v.formalExists)).toBe(true);
  });
  it('correction retains predecessor but never counts as a genuine supplier price event', async () => {
    const r = await create();
    const before = await api().queryProcurementAnalytics();
    const original = buildChannelTrend(before.records, 'ch-1');
    await create({
      sourceType: 'correction',
      previousQuoteId: r.quote.id,
      discount: discountBps(5800),
    });
    const d = await api().queryProcurementAnalytics();
    const trend = buildChannelTrend(d.records, 'ch-1');
    expect(trend.corrections).toBe(original.corrections + 1);
    expect(trend.priceEvents).toBe(original.priceEvents);
    expect(
      trend.series.flatMap((s) => s.points).filter((p) => p.correction),
    ).toHaveLength(1);
    expect(
      d.records.find((v) => v.quote.id === r.quote.id)?.quote.discount,
    ).toBe(6000);
  });
  it('retains history and current resource state after channel disable', async () => {
    const a = api();
    const r = await create();
    await a.toggleChannel('ch-1', 1, 'disabled');
    const d = await a.queryProcurementAnalytics();
    expect(
      d.records.find((v) => v.quote.id === r.quote.id)?.channel.status,
    ).toBe('disabled');
    expect(
      d.warnings.find((v) => v.quoteId === r.quote.id)?.reasons.join(''),
    ).toContain('已停用');
  });
  it('resolves current supplier name from SupplierRepository', async () => {
    const a = api();
    const original = await a.getSupplier('s-1');
    expect(original).not.toBeNull();
    const supplier = original!.supplier;
    await a.updateSupplier('s-1', supplier.version, {
      name: '模拟改名供应商',
      shortCode: supplier.shortCode,
      supplierCategory: supplier.supplierCategory,
      cooperationStatus: supplier.cooperationStatus,
      ownerUserId: supplier.ownerUserId!,
    });
    expect(
      (await a.queryProcurementAnalytics()).records
        .filter((r) => r.supplier.id === 's-1')
        .every((r) => r.supplier.name === '模拟改名供应商'),
    ).toBe(true);
  });
  it('procurement only receives current maintained suppliers, including filter choices', async () => {
    const a = api('u-proc-alt');
    const d = await a.queryProcurementAnalytics();
    expect(d.records).toEqual([]);
    expect(d.options.suppliers).toEqual([]);
    expect(d.options.channels).toEqual([]);
    const expected = await api('u-proc').queryQuotes();
    const proc = await api('u-proc').queryProcurementAnalytics();
    expect(proc.records).toHaveLength(expected.total);
  });
  it('isolates manufacturer business domains and both Seedance regional variants', async () => {
    const domestic = await api('u-ops', 'domestic').queryProcurementAnalytics();
    expect(domestic.records.every((r) => r.vendor.domain === 'domestic')).toBe(
      true,
    );
    expect(domestic.options.models.map((m) => m.id)).toEqual(
      expect.arrayContaining(['m-seed-cn', 'm-seed-os']),
    );
    const foreign = await api(
      'u-overseas',
      'overseas',
    ).queryProcurementAnalytics();
    expect(foreign.records.every((r) => r.vendor.domain === 'overseas')).toBe(
      true,
    );
    expect(
      (await api('u-domestic').queryProcurementAnalytics({ channelId: 'ch-5' }))
        .records,
    ).toEqual([]);
    expect(domestic.options.suppliers.some((s) => s.id === 's-3')).toBe(false);
  });
  it.each([
    'u-test',
    'u-support',
    'u-supplier',
    'u-sales',
    'u-account',
    'u-solution',
    'u-no-domain',
    undefined,
  ])(
    '%s cannot read analysis or options/drilldown through forged query',
    async (id) => {
      const a =
        id === undefined
          ? createMockAdapter(
              undefined,
              undefined,
              suppliers,
              () => true,
              channels,
              sourcing,
              quotes,
            )
          : api(id);
      await expect(
        a.queryProcurementAnalytics({ channelId: 'ch-1' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );
  it('revoked API references cannot read new analysis results', async () => {
    let active = true;
    const a = api('u-ops', undefined, () => active);
    active = false;
    await expect(a.queryProcurementAnalytics()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
  it('explicitly projects every analysis field and does not expose sensitive snapshots or free text', async () => {
    const r = await create({ demandId: 'd-1', demandItemId: 'di-1' });
    const raw = quotes.read();
    memory.setItem(
      'maas-quote-demo-v1',
      JSON.stringify({
        ...raw,
        quotes: raw.quotes.map((q) =>
          q.id === r.quote.id
            ? {
                ...q,
                customerId: 'PRIVATE',
                description: 'PRIVATE',
                priceSpec: { ...q.priceSpec, secret: 'PRIVATE' },
              }
            : q,
        ),
      }),
    );
    const d = await api('u-proc').queryProcurementAnalytics();
    expect(JSON.stringify(d)).not.toContain('PRIVATE');
    for (const k of [
      'customer',
      'customerId',
      'salesPriceMinorUnits',
      'beforeSnapshot',
      'afterSnapshot',
      'followUpNote',
      'reason',
      'submittedBy',
      'evidenceReference',
    ]) {
      if (k === 'reason') continue; // Safe fixed diagnostic reasons are part of the analysis contract.
      expect(keys(d)).not.toContain(k);
    }
    expect(JSON.stringify(d)).not.toContain('模拟运营受限说明');
  });
  it('Dashboard and unfiltered analytics use matching pending, expiring and recent-channel definitions', async () => {
    await create({ priceStatus: 'pending_contract', channelId: 'ch-2' });
    const a = api();
    const d = await a.queryProcurementAnalytics();
    const board = await loadDashboard(a, () => true);
    expect(board.metrics.find((m) => m.id === 'quotes')?.value).toBe(
      d.stats.pending,
    );
    expect(board.metrics.find((m) => m.id === 'quote-expiring')?.value).toBe(
      d.stats.expiring,
    );
    expect(
      board.metrics.find((m) => m.id === 'quote-new-channels')?.value,
    ).toBe(d.stats.newChannels);
    expect(board.todos.find((t) => t.label === '七天内到期优惠')?.path).toBe(
      '/analytics/procurement',
    );
  });
  it('model, supplier, channel, vendor, status, currency and Beijing creation dates filter authorized records', async () => {
    const r = await create({ channelId: 'ch-2' });
    const d = await api().queryProcurementAnalytics({
      modelId: 'm-seed-cn',
      supplierId: 's-1',
      channelId: 'ch-2',
      vendorId: 'v-byte',
      status: 'reference',
      currency: 'CNY',
      createdFrom: '2026-11-13',
      createdTo: '2026-11-13',
    });
    expect(d.records.map((r) => r.quote.id)).toEqual([r.quote.id]);
    expect(d.stats.channels).toBe(1);
    expect(
      (await api().queryProcurementAnalytics({ supplierId: 'hidden' })).records,
    ).toEqual([]);
  });
  it.each([
    { createdFrom: 'invalid' },
    { createdFrom: '2026-02-30' },
    { createdFrom: '2026-12-01', createdTo: '2026-11-01' },
  ])('rejects invalid filter date %j', async (q) => {
    await expect(api().queryProcurementAnalytics(q)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });
  it('returns meaningful zero metrics and explanations when authorized selection is empty', async () => {
    const d = await api().queryProcurementAnalytics({ channelId: 'no-record' });
    expect(d.stats.channels).toBe(0);
    expect(d.stats.inquiry.pending).toBe(0);
    expect(d.verifiedTargetRate).toBeNull();
    expect(buildChannelTrend(d.records, 'no-record').issues.join('')).toContain(
      '没有报价历史',
    );
  });
});
describe('conservative temporal and comparable analysis', () => {
  it.each(['currency', 'referencePriceSource', 'specification'] as const)(
    'unknown %s cannot form a comparable price',
    async (field) => {
      const a = await record();
      const b = {
        ...a,
        quote: {
          ...a.quote,
          priceSpec: { ...a.quote.priceSpec, [field]: null },
        },
      };
      expect(compareAnalysis(a, b).comparable).toBe(false);
      expect(buildChannelTrend([b], b.channel.id).series).toEqual([]);
    },
  );
  it('different units and input/output cannot be compared; no rate savings or currency conversion', async () => {
    const a = await record();
    for (const extra of [
      { currency: 'USD' },
      {
        rates: [
          {
            dimension: 'output_token' as const,
            quantity: 1000,
            unit: 'Token',
            amount: '0.1',
          },
        ],
      },
      {
        rates: [
          {
            dimension: 'input_token' as const,
            quantity: 1000,
            unit: 'Token',
            amount: '0.1',
          },
        ],
      },
    ]) {
      const b = {
        ...a,
        quote: { ...a.quote, priceSpec: { ...a.quote.priceSpec, ...extra } },
      };
      expect(compareAnalysis(a, b).comparable).toBe(false);
      expect(compareAnalysis(a, b).rates).toEqual([]);
    }
  });
  it('complete same basis reuses quote comparison, with only exact discount basis-point differences', async () => {
    const a = await record();
    const b = await record({ channelId: 'ch-2', discount: discountBps(5500) });
    expect(compareAnalysis(a, b)).toMatchObject({
      comparable: true,
      discountDifferenceBps: 500,
    });
  });
  it('trend groups media, currencies, bases, units and original statuses without mixing lines', async () => {
    const a = await record();
    const b = {
      ...a,
      quote: {
        ...a.quote,
        id: 'other',
        priceSpec: { ...a.quote.priceSpec, currency: 'USD' },
      },
    };
    const c = {
      ...a,
      quote: { ...a.quote, id: 'promo', priceStatus: 'temporary' as const },
      recordedStatus: 'temporary' as const,
    };
    const differentUnit = {
      ...a,
      quote: {
        ...a.quote,
        id: 'unit-variant',
        priceSpec: {
          ...a.quote.priceSpec,
          rates: a.quote.priceSpec.rates.map((r) => ({ ...r, quantity: 1000 })),
        },
      },
    };
    const d = buildChannelTrend([a, b, c, differentUnit], a.channel.id);
    expect(d.series).toHaveLength(4);
    expect(new Set(d.series.map((v) => v.label)).size).toBe(d.series.length);
    expect(d.issues.join('')).toContain('不绘制连续调价线');
  });
  it('trend uses actual creation/supplier dates; missing supplier date never falls back to recording date', async () => {
    const a = await record({ supplierQuotedAt: '2026-11-10T00:00:00Z' });
    const b = await record();
    const d = buildChannelTrend([a, b], a.channel.id, 'supplier');
    expect(d.series.flatMap((s) => s.points)).toHaveLength(1);
    expect(d.series[0]?.points[0]?.at).toBe('2026-11-10T00:00:00Z');
    expect(d.issues.join('')).toContain('供应商报价时间缺失');
  });
  it('abnormal validity intervals do not produce comparable prices or trend points', async () => {
    const a = await record();
    const invalid = { ...a, quote: { ...a.quote, effectiveFrom: 'bad' } };
    expect(compareAnalysis(invalid, invalid).comparable).toBe(false);
    expect(buildChannelTrend([invalid], a.channel.id).series).toEqual([]);
    expect(
      buildChannelTrend([invalid], a.channel.id).issues.join(''),
    ).toContain('有效期异常');
  });
  it('orders historical points chronologically rather than by confirmation or array order', async () => {
    const a = await record();
    const b = {
      ...a,
      quote: {
        ...a.quote,
        id: 'earlier',
        createdAt: '2026-11-01T00:00:00Z',
        discount: discountBps(5500),
      },
    };
    const d = buildChannelTrend([a, b], a.channel.id);
    expect(d.series[0]?.points.map((p) => p.record.quote.id)).toEqual([
      'earlier',
      a.quote.id,
    ]);
  });
  it('expiry boundary excludes now and includes exactly seven days, future offers are not active', async () => {
    const base = await record();
    const offer = (id: string, from: number, end: number): AnalysisRecord => ({
      ...base,
      quote: {
        ...base.quote,
        id,
        priceStatus: 'temporary',
        effectiveFrom: new Date(from).toISOString(),
        effectiveUntil: new Date(end).toISOString(),
      },
    });
    const values = [
      offer('now', now - 1000, now),
      offer('edge', now - 1000, now + analyticsWeek),
      offer('beyond', now - 1000, now + analyticsWeek + 1),
      offer('future', now + 1000, now + analyticsWeek),
    ];
    const s = summarizeAnalysis(values, [], now);
    expect(s.temporary).toBe(2);
    expect(s.expiring).toBe(1);
    expect(s.expired).toBe(1);
    expect(s.scheduled).toBe(1);
  });
  it('invalid dates remain diagnostic rather than creating effective prices or zero dates', async () => {
    const a = await record();
    const q = { ...a.quote, effectiveFrom: 'bad', createdAt: 'bad' };
    expect(timestamp('bad')).toBeNull();
    expect(analysisValidity(q, now)).toBe('invalid');
    const values = [{ ...a, quote: q }];
    expect(summarizeAnalysis(values, [], now).newChannels).toBe(0);
    expect(buildChannelTrend(values, a.channel.id).issues.join('')).toContain(
      '创建时间异常',
    );
  });
  it('only sent inquiries with a known elapsed deadline count overdue; no fabricated response duration', async () => {
    const a = api();
    const i = await a.createInquiry(
      {
        channelId: 'ch-2',
        demandItemId: null,
        responseDueAt: '2026-11-12T00:00:00Z',
        followUpNote: '模拟',
      },
      key(),
    );
    let d = await a.queryProcurementAnalytics();
    expect(d.stats.inquiry.draft).toBe(1);
    expect(d.stats.inquiry.overdue).toBe(0);
    await a.updateInquiry(i.id, 1, 'sent', '人工登记', key());
    d = await a.queryProcurementAnalytics();
    expect(d.stats.inquiry).toMatchObject({
      initiated: 1,
      pending: 1,
      overdue: 1,
      responseHours: null,
    });
    await a.createQuote(
      input({ channelId: 'ch-2', inquiryId: i.id, inquiryVersion: 2 }),
      key(),
    );
    d = await a.queryProcurementAnalytics();
    expect(d.stats.inquiry).toMatchObject({
      received: 1,
      pending: 0,
      overdue: 0,
      responseHours: null,
    });
    await a.updateInquiry(i.id, 3, 'closed', '模拟关闭', key());
    expect((await a.queryProcurementAnalytics()).stats.inquiry.closed).toBe(1);
  });
  it('inquiry scope includes authorized channels with no prices and ignores quote-only filters', async () => {
    const a = api();
    const i = await a.createInquiry(
      {
        channelId: 'ch-2',
        demandItemId: null,
        responseDueAt: null,
        followUpNote: '模拟',
      },
      key(),
    );
    await a.updateInquiry(i.id, 1, 'sent', '模拟询价', key());
    const d = await a.queryProcurementAnalytics({
      currency: 'USD',
      channelId: 'ch-2',
    });
    expect(d.records).toEqual([]);
    expect(d.stats.inquiry.pending).toBe(1);
    expect(d.stats.inquiry.overdue).toBe(0);
  });
  it('target difference is numeric only; no verified attainment rate or invented real savings', async () => {
    const r = await create({
      demandId: 'd-1',
      demandItemId: 'di-1',
      discount: discountBps(5500),
    });
    const d = await api().queryProcurementAnalytics();
    const target = d.targets.find((t) => t.quoteId === r.quote.id)!;
    expect(target.numericDifferenceBps).toBe(-2500);
    expect(target.commerciallyComparable).toBe(false);
    expect(target.verifiedAchieved).toBeNull();
    expect(d.verifiedTargetRate).toBeNull();
    expect(target.reason).toContain('同基准可比性未确认');
    expect(keys(d)).not.toContain('savingsAmount');
  });
  it('data-quality checks expose abnormal dates without mutating the source view', async () => {
    const a = api();
    const r = await create();
    const row = (await a.getQuote(r.quote.id))!.row;
    const options = await a.quoteOptions();
    const bad = {
      ...row,
      quote: { ...row.quote, createdAt: 'invalid', effectiveUntil: 'bad' },
    };
    const d = createAnalysis([bad], options, {}, now);
    expect(d.warnings[0]?.reasons.join('')).toContain('创建日期异常');
    expect(d.warnings[0]?.reasons.join('')).toContain('有效期异常');
    expect(bad.quote.createdAt).toBe('invalid');
  });
});
