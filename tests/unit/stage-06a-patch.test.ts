import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analysisValidity,
  channelPriceViews,
  compareAnalysis,
  isCurrentFormal,
  summarizeAnalysis,
} from '../../src/domain/procurement-analytics';
import type {
  AnalysisQuote,
  AnalysisRecord,
} from '../../src/domain/procurement-analytics';
import { compareQuotes } from '../../src/domain/quotations';
import { discountBps } from '../../src/domain/rules';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { SupplierRepository } from '../../src/mocks/supplier-repository';
import type { StoragePort } from '../../src/mocks/supplier-repository';
import { ChannelRepository } from '../../src/mocks/channel-repository';
import { SourcingRepository } from '../../src/mocks/sourcing-repository';
import { QuoteRepository } from '../../src/mocks/quote-repository';
import { loadDashboard } from '../../src/services/dashboard';
const now = Date.parse('2026-11-13T08:00:00Z');
const start = '2026-11-13T00:00:00Z',
  end = '2026-11-14T00:00:00Z';
const record = (overrides: Partial<AnalysisQuote> = {}): AnalysisRecord => ({
  quote: {
    id: 'mock-quote',
    channelId: 'mock-channel',
    discount: discountBps(6000),
    priceStatus: 'effective',
    sourceType: 'contract',
    createdAt: start,
    supplierQuotedAt: null,
    effectiveFrom: start,
    effectiveUntil: end,
    previousQuoteId: null,
    demandId: null,
    demandItemId: null,
    confirmedBy: 'u-ops',
    confirmedAt: start,
    priceSpec: {
      currency: 'CNY',
      referencePriceSource: 'mock:basis',
      specification: 'mock:text-spec',
      rates: [
        {
          dimension: 'input_token',
          quantity: 1000000,
          unit: 'Token',
          amount: '0.123456',
        },
      ],
    },
    ...overrides,
  },
  recordedStatus: 'effective',
  verified: true,
  channel: { id: 'mock-channel', name: '模拟渠道', status: 'enabled' },
  supplier: { id: 'mock-supplier', name: '模拟供应商', status: 'enabled' },
  model: { id: 'mock-model', name: '模拟文本模型' },
  vendor: { id: 'mock-vendor', name: '模拟厂商', domain: 'domestic' },
});
afterEach(() => vi.useRealTimers());
describe('separate historical comparability from query-time validity', () => {
  it.each([
    ['current', start, end, 'in_period'],
    ['expired', '2026-11-10T00:00:00Z', '2026-11-12T00:00:00Z', 'expired'],
    ['future', '2026-11-14T00:00:00Z', '2026-11-15T00:00:00Z', 'scheduled'],
    ['missing', null, null, 'unspecified'],
    ['missing start', null, end, 'unspecified'],
  ] as const)(
    '%s quotes preserve same-basis historical comparison but report actual temporal state',
    (_name, from, until, expected) => {
      const a = record({ effectiveFrom: from, effectiveUntil: until });
      const b = record({
        id: 'mock-second',
        effectiveFrom: from,
        effectiveUntil: until,
        discount: discountBps(5500),
      });
      const result = compareAnalysis(a, b, now);
      expect(result).toMatchObject({
        comparable: true,
        specComparable: true,
        discountDifferenceBps: 500,
        currentValidity: {
          first: expected,
          second: expected,
          bothInPeriod: expected === 'in_period',
        },
      });
      expect(result.procurementNotice).toContain(
        '历史口径可比不等于当前可执行采购价格',
      );
      expect(result.procurementNotice).toContain('时间有效也不替代正式依据');
      expect(
        compareQuotes(a.quote, b.quote, a.model.id, b.model.id),
      ).toMatchObject({ comparable: true, discountDifferenceBps: 500 });
    },
  );
  it.each([
    ['bad date', 'invalid', end],
    ['reverse', end, start],
    ['zero-length', start, start],
  ] as const)(
    'rejects anomalous validity %s without claiming price specifications differ',
    (_name, from, until) => {
      const a = record({ effectiveFrom: from, effectiveUntil: until });
      const result = compareAnalysis(a, a, now);
      expect(result.specComparable).toBe(true);
      expect(result.comparable).toBe(false);
      expect(result.currentValidity).toEqual({
        first: 'invalid',
        second: 'invalid',
        bothInPeriod: false,
      });
      expect(result.reasons).toContain('有效期异常，无法比较');
      expect(result.discountDifferenceBps).toBeNull();
    },
  );
  it.each([
    [Date.parse(start) - 1, 'scheduled', false],
    [Date.parse(start), 'in_period', true],
    [Date.parse(end) - 1, 'in_period', true],
    [Date.parse(end), 'expired', false],
  ] as const)(
    'uses the explicit query instant %s at interval boundaries',
    (at, expected, active) => {
      const a = record();
      const result = compareAnalysis(a, a, at);
      expect(analysisValidity(a.quote, at)).toBe(expected);
      expect(result.currentValidity.bothInPeriod).toBe(active);
      expect(result.currentValidity.first).toBe(expected);
      expect(isCurrentFormal(a.quote, at)).toBe(active);
    },
  );
  it('specifications and current validity remain independent for a currency mismatch', () => {
    const a = record(),
      b = record({ priceSpec: { ...a.quote.priceSpec, currency: 'USD' } });
    const result = compareAnalysis(a, b, now);
    expect(result.specComparable).toBe(false);
    expect(result.comparable).toBe(false);
    expect(result.currentValidity.bothInPeriod).toBe(true);
    expect(result.reasons).toContain('币种不同');
  });
  it('same specifications do not bypass Stage05B differences in status or applicable intervals', () => {
    const a = record();
    for (const b of [
      record({ effectiveUntil: '2026-11-15T00:00:00Z' }),
      record({
        priceStatus: 'reference',
        confirmedAt: null,
        confirmedBy: null,
      }),
    ]) {
      const result = compareAnalysis(a, b, now);
      expect(result.specComparable).toBe(true);
      expect(result.comparable).toBe(false);
      expect(result.currentValidity.bothInPeriod).toBe(true);
      const original = compareQuotes(a.quote, b.quote, a.model.id, b.model.id);
      expect(result.reasons).toEqual(original.reasons);
      expect(result.discountDifferenceBps).toBeNull();
    }
  });
  it('one future quote cannot be presented as both quotes currently effective', () => {
    const result = compareAnalysis(
      record(),
      record({
        effectiveFrom: '2026-11-14T00:00:00Z',
        effectiveUntil: '2026-11-15T00:00:00Z',
      }),
      now,
    );
    expect(result.currentValidity).toEqual({
      first: 'in_period',
      second: 'scheduled',
      bothInPeriod: false,
    });
    expect(result.specComparable).toBe(true);
    expect(result.comparable).toBe(false);
  });
  it('rejects an invalid query timestamp rather than silently treating it as current', () => {
    expect(() => compareAnalysis(record(), record(), NaN)).toThrow('查询时刻');
  });
});
describe('latest confirmed history and all active formal records', () => {
  it.each([
    ['expired', { effectiveUntil: '2026-11-13T08:00:00Z' }, true, false],
    [
      'future',
      {
        effectiveFrom: '2026-11-14T00:00:00Z',
        effectiveUntil: '2026-11-15T00:00:00Z',
      },
      true,
      false,
    ],
    ['current', {}, true, true],
    ['unconfirmed', { confirmedBy: null, confirmedAt: null }, false, false],
    ['invalid confirmation', { confirmedAt: 'invalid' }, false, false],
    ['missing start', { effectiveFrom: null }, true, false],
    ['abnormal interval', { effectiveUntil: start }, true, false],
  ] satisfies readonly [string, Partial<AnalysisQuote>, boolean, boolean][])(
    '%s is classified consistently in channel views and counts',
    (_name, overrides, history, active) => {
      const r = record(overrides),
        view = channelPriceViews([r], now)[0]!;
      expect(view.latest?.quote.id).toBe(r.quote.id);
      expect(view.latestFormal?.quote.id ?? null).toBe(
        history ? r.quote.id : null,
      );
      expect(view.activeFormals).toEqual(active ? [r] : []);
      expect(summarizeAnalysis([r], [], now).effective).toBe(active ? 1 : 0);
      expect(summarizeAnalysis([r], [], now).formalChannels).toBe(
        history ? 1 : 0,
      );
    },
  );
  it('never falls back to an expired or future history record when no formal price is active', () => {
    const expired = record({
      id: 'expired',
      effectiveUntil: new Date(now).toISOString(),
    });
    const future = record({
      id: 'future',
      createdAt: '2026-11-13T01:00:00Z',
      effectiveFrom: end,
      effectiveUntil: '2026-11-15T00:00:00Z',
    });
    const latest = record({
      id: 'reference',
      createdAt: '2026-11-13T02:00:00Z',
      priceStatus: 'reference',
      confirmedBy: null,
      confirmedAt: null,
    });
    const view = channelPriceViews([expired, future, latest], now)[0]!;
    expect(view.latest?.quote.id).toBe('reference');
    expect(view.latestFormal?.quote.id).toBe('future');
    expect(view.activeFormals).toEqual([]);
    expect(
      summarizeAnalysis([expired, future, latest], [], now).effective,
    ).toBe(0);
  });
  it('retains multiple concurrent formal records and promotions without picking a settlement price', () => {
    const a = record({ id: 'a' }),
      b = record({
        id: 'b',
        createdAt: '2026-11-13T01:00:00Z',
        discount: discountBps(5500),
      });
    const promo = record({
      id: 'promo',
      priceStatus: 'temporary',
      sourceType: 'promotion',
      confirmedBy: null,
      confirmedAt: null,
      createdAt: '2026-11-13T02:00:00Z',
    });
    const before = structuredClone([a, b, promo]),
      view = channelPriceViews([a, b, promo], now)[0]!;
    expect(view.latest?.quote.id).toBe('promo');
    expect(view.latestFormal?.quote.id).toBe('b');
    expect(view.activeFormals.map((r) => r.quote.id)).toEqual(['b', 'a']);
    expect(view.activePromotions).toEqual([promo]);
    expect(summarizeAnalysis([a, b, promo], [], now)).toMatchObject({
      effective: 2,
      temporary: 1,
    });
    expect(view).not.toHaveProperty('settlementPrice');
    expect([a, b, promo]).toEqual(before);
  });
});
class Memory implements StoragePort {
  values = new Map<string, string>();
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.values.set(k, v);
  }
}
it('authorized current Repository queries use one asOf for history, all active prices, quote statistics and Dashboard reminders', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const memory = new Memory();
  const suppliers = new SupplierRepository(memory),
    channels = new ChannelRepository(memory),
    sourcing = new SourcingRepository(memory),
    quotes = new QuoteRepository(memory);
  const api = createMockAdapter(
    'u-ops',
    undefined,
    suppliers,
    () => true,
    channels,
    sourcing,
    quotes,
  );
  async function formal(from: string, until: string) {
    const r = await api.createQuote(
      {
        channelId: 'ch-3',
        demandId: null,
        demandItemId: null,
        inquiryId: null,
        inquiryVersion: null,
        previousQuoteId: null,
        discount: discountBps(6000),
        priceStatus: 'reference',
        sourceType: 'contract',
        effectiveFrom: from,
        effectiveUntil: until,
        evidenceReference: 'mock:contract',
        supplierSubmitterReference: null,
        supplierQuotedAt: null,
        reason: '模拟时间边界校验',
        priceSpec: record().quote.priceSpec,
      },
      crypto.randomUUID(),
    );
    await api.verifyQuote(
      r.quote.id,
      1,
      'mock:verify',
      '模拟核验',
      crypto.randomUUID(),
    );
    await api.confirmQuote(
      r.quote.id,
      2,
      'mock:confirm',
      from,
      '模拟确认',
      crypto.randomUUID(),
    );
    vi.setSystemTime(Date.now() + 1);
    return r.quote.id;
  }
  const expired = await formal(start, '2026-11-14T08:00:00Z');
  const active = await formal(start, '2026-11-18T00:00:00Z');
  const future = await formal('2026-11-16T00:00:00Z', '2026-11-20T00:00:00Z');
  vi.setSystemTime(Date.parse('2026-11-15T08:00:00Z'));
  const saved = new Map(memory.values),
    result = await api.queryProcurementAnalytics({ channelId: 'ch-3' });
  const view = result.channelPrices[0]!;
  expect(result.asOf).toBe(new Date(Date.now()).toISOString());
  expect(view.latestFormal?.quote.id).toBe(future);
  expect(view.activeFormals.map((r) => r.quote.id)).toEqual([active]);
  expect(view.records.some((r) => r.quote.id === expired)).toBe(true);
  expect(result.stats.effective).toBe(view.activeFormals.length);
  expect(
    (await api.queryQuotes({ channelId: 'ch-3' })).rows.filter(
      (r) => r.quote.priceStatus === 'effective' && r.validity === 'in_period',
    ),
  ).toHaveLength(1);
  const all = await api.queryProcurementAnalytics(),
    pricing = await api.queryQuotes(),
    dashboard = await loadDashboard(api, () => true);
  expect(all.stats.effective).toBe(pricing.stats.effective);
  expect(dashboard.metrics.find((m) => m.id === 'quote-expiring')?.value).toBe(
    all.stats.expiring,
  );
  expect(all.stats.expiring).toBe(pricing.stats.expiring);
  expect(memory.values).toEqual(saved);
  await expect(
    createMockAdapter(
      'u-sales',
      undefined,
      suppliers,
      () => true,
      channels,
      sourcing,
      quotes,
    ).queryProcurementAnalytics(),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
