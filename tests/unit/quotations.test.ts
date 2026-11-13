import { beforeEach, describe, expect, it } from 'vitest';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { SupplierRepository } from '../../src/mocks/supplier-repository';
import type { StoragePort } from '../../src/mocks/supplier-repository';
import { ChannelRepository } from '../../src/mocks/channel-repository';
import { SourcingRepository } from '../../src/mocks/sourcing-repository';
import {
  QuoteRepository,
  quoteStorageKey,
} from '../../src/mocks/quote-repository';
import { discountBps } from '../../src/domain/rules';
import {
  decimalMicros,
  compareQuotes,
  quoteValidity,
} from '../../src/domain/quotations';
import type { PriceSpec } from '../../src/domain/quotations';
import type { QuoteInput } from '../../src/services/quotation-types';
import { fixture } from '../../src/mocks/data';
import { loadDashboard } from '../../src/services/dashboard';
class Memory implements StoragePort {
  values = new Map<string, string>();
  fail = false;
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw Error('quota');
    this.values.set(k, v);
  }
}
let storage: Memory;
let suppliers: SupplierRepository;
let channels: ChannelRepository;
let sourcing: SourcingRepository;
let quotes: QuoteRepository;
const api = (
  id = 'u-ops',
  domain?: 'domestic' | 'overseas',
  active = () => true,
) =>
  createMockAdapter(id, domain, suppliers, active, channels, sourcing, quotes);
const spec = (overrides: Partial<PriceSpec> = {}): PriceSpec => ({
  currency: 'CNY',
  referencePriceSource: 'mock:catalog-reference',
  specification: 'mock:applicable-spec',
  rates: [
    {
      dimension: 'input_token',
      quantity: 1000000,
      unit: 'Token',
      amount: '0.123456',
    },
  ],
  ...overrides,
});
const input = (overrides: Partial<QuoteInput> = {}): QuoteInput => ({
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
  evidenceReference: 'mock:evidence:source',
  supplierSubmitterReference: 'mock:supplier:contact',
  supplierQuotedAt: null,
  reason: '模拟供应商原始报价转录；不代表真实合同',
  priceSpec: spec(),
  ...overrides,
});
const create = (v = input(), key = crypto.randomUUID()) =>
  api().createQuote(v, key);
const key = () => crypto.randomUUID();
const allKeys = (v: unknown): string[] =>
  v && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, v]) => [k, ...allKeys(v)])
    : [];
beforeEach(() => {
  storage = new Memory();
  suppliers = new SupplierRepository(storage);
  channels = new ChannelRepository(storage);
  sourcing = new SourcingRepository(storage);
  quotes = new QuoteRepository(storage);
});
describe('compatible append-only quote records', () => {
  it('preserves original fixture IDs and missing commercial metadata as unknown', async () => {
    expect(quotes.read().quotes.map((q) => q.id)).toEqual(
      fixture.quotes.map((q) => q.id),
    );
    const original = (await api().getQuote('q-1'))!.row;
    expect(original.quote.priceSpec).toEqual({
      currency: null,
      referencePriceSource: null,
      specification: null,
      rates: [],
    });
    expect(original.quote.recordedBy).toBeNull();
    expect(original.quote.confirmedBy).toBe(fixture.quotes[0]?.confirmedBy);
    expect(storage.values.size).toBe(0);
  });
  it('associates stable channel ID and derives current model and supplier without duplicated identity fields', async () => {
    const r = await create();
    expect(r.quote.channelId).toBe('ch-1');
    expect(r.model.id).toBe('m-seed-cn');
    expect(r.supplier.id).toBe('s-1');
    expect(r.quote).not.toHaveProperty('supplierId');
    expect(r.quote).not.toHaveProperty('modelId');
    expect(r.quote.recordedBy).toBe('u-ops');
  });
  it('supports a daily quote without demand or inquiry', async () => {
    const r = await create();
    expect(r.quote).toMatchObject({
      demandId: null,
      demandItemId: null,
      inquiryId: null,
    });
  });
  it('linked item must belong to both matching model and parent demand', async () => {
    await expect(
      create(input({ demandId: 'd-1', demandItemId: 'di-2' })),
    ).rejects.toThrow('模型');
    await expect(
      create(input({ demandId: 'd-2', demandItemId: 'di-1' })),
    ).rejects.toThrow('主单');
    await expect(create(input({ demandId: 'd-2' }))).rejects.toThrow('模型');
    await expect(create(input({ demandItemId: 'missing' }))).rejects.toThrow();
    const r = await create(input({ demandId: 'd-1', demandItemId: 'di-1' }));
    expect(r.quote.demandItemId).toBe('di-1');
  });
  it.each([-1, 10001, 8000.1, NaN, Infinity])(
    'rejects invalid discount %s',
    async (n) => {
      await expect(
        create(input({ discount: n as QuoteInput['discount'] })),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    },
  );
  it('requires original supplier submitter and explicit mock evidence; recording is not confirmation', async () => {
    await expect(
      create(input({ supplierSubmitterReference: null })),
    ).rejects.toThrow('原始提交人');
    await expect(
      create(input({ evidenceReference: 'https://real.example/contract' })),
    ).rejects.toThrow('模拟引用');
    const r = await api('u-proc').createQuote(input(), key());
    expect(r.quote).toMatchObject({
      sourceType: 'supplier_submission',
      priceStatus: 'reference',
      submittedBy: 'u-proc',
      recordedBy: 'u-proc',
      confirmedBy: null,
    });
    expect(r.verified).toBe(false);
  });
  it('cannot bypass confirmation through injected create fields or an effective status', async () => {
    await expect(
      create({ ...input(), confirmedBy: 'u-ops' } as QuoteInput),
    ).rejects.toThrow('指定商业字段');
    await expect(
      create({ ...input(), priceStatus: 'effective' } as unknown as QuoteInput),
    ).rejects.toThrow('正式价');
  });
  it('historical corrections must reference prior record with reason and remain distinct from true price changes', async () => {
    const a = await create();
    const original = quotes.read().quotes.find((q) => q.id === a.quote.id);
    await expect(create(input({ sourceType: 'correction' }))).rejects.toThrow(
      'Correction',
    );
    await expect(
      create(
        input({
          sourceType: 'correction',
          previousQuoteId: a.quote.id,
          reason: '',
        }),
      ),
    ).rejects.toThrow();
    const next = await create(
      input({ discount: discountBps(5500), previousQuoteId: a.quote.id }),
    );
    const corrected = await create(
      input({
        discount: discountBps(5800),
        previousQuoteId: next.quote.id,
        sourceType: 'correction',
        reason: '模拟录入有误，现补充更正记录',
      }),
    );
    expect(corrected.quote.sourceType).toBe('correction');
    expect(next.quote.sourceType).toBe('supplier_submission');
    expect(quotes.read().quotes.find((q) => q.id === a.quote.id)).toEqual(
      original,
    );
    expect(
      (await api().getQuote(corrected.quote.id))!.channelHistory.map(
        (v) => v.quote.id,
      ),
    ).toContain(next.quote.id);
  });
  it('forbids cross-channel previous-quote links', async () => {
    await expect(
      create(input({ channelId: 'ch-2', previousQuoteId: 'q-1' })),
    ).rejects.toThrow('同一渠道');
  });
  it('repository prohibits overwriting original quote and decision/audit history', async () => {
    const r = await create();
    const s = quotes.read();
    expect(() =>
      quotes.write(
        s,
        {
          ...s,
          quotes: s.quotes.map((q) =>
            q.id === r.quote.id ? { ...q, discount: discountBps(1) } : q,
          ),
        },
        channels,
        suppliers,
        sourcing,
      ),
    ).toThrow('只允许追加');
    await api().verifyQuote(r.quote.id, 1, 'mock:verify', '模拟核验', key());
    const next = quotes.read();
    expect(() =>
      quotes.write(
        next,
        { ...next, decisions: [] },
        channels,
        suppliers,
        sourcing,
      ),
    ).toThrow('只允许追加');
  });
  it('new quote is visible in channel history and associated sourcing query without modifying target', async () => {
    const before = sourcing.read();
    const r = await create(
      input({
        demandId: 'd-1',
        demandItemId: 'di-1',
        discount: discountBps(5500),
      }),
    );
    expect(
      (await api().getQuoteHistory('ch-1')).some((q) => q.id === r.quote.id),
    ).toBe(true);
    expect(
      (
        await api().queryQuotes({ demandId: 'd-1', demandItemId: 'di-1' })
      ).rows.map((v) => v.quote.id),
    ).toContain(r.quote.id);
    expect(sourcing.read()).toEqual(before);
    expect(
      (await api().getSourcingDemand('d-1'))?.items[0]?.item
        .targetPurchaseDiscount,
    ).toBe(8000);
  });
  it('duplicate requests are idempotent and mismatched payload reuse conflicts', async () => {
    const token = key();
    const a = await create(input(), token);
    const raw = storage.getItem(quoteStorageKey);
    const b = await create(input(), token);
    expect(a.quote.id).toBe(b.quote.id);
    expect(storage.getItem(quoteStorageKey)).toBe(raw);
    await expect(
      create(input({ discount: discountBps(7000) }), token),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('storage failure leaves quote, inquiry response and history uncommitted', async () => {
    const i = await api().createInquiry(
      {
        channelId: 'ch-1',
        demandItemId: null,
        responseDueAt: null,
        followUpNote: '模拟待询价',
      },
      key(),
    );
    const raw = storage.getItem(quoteStorageKey);
    storage.fail = true;
    await expect(
      create(input({ inquiryId: i.id, inquiryVersion: 1 })),
    ).rejects.toMatchObject({ code: 'STORAGE' });
    expect(storage.getItem(quoteStorageKey)).toBe(raw);
    expect((await api().listInquiries())[0]?.status).toBe('draft');
  });
  it('repository validates complete references and storage revision', () => {
    const s = quotes.read();
    quotes.write(s, s, channels, suppliers, sourcing);
    expect(() => quotes.write(s, s, channels, suppliers, sourcing)).toThrow(
      '数据已变化',
    );
    const now = quotes.read();
    expect(() =>
      quotes.write(
        now,
        {
          ...now,
          quotes: now.quotes.map((q) => ({ ...q, channelId: 'missing' })),
        },
        channels,
        suppliers,
        sourcing,
      ),
    ).toThrow();
  });
});
describe('repository immutable history boundaries', () => {
  const protectedCollections = [
    'quotes',
    'decisions',
    'history',
    'requests',
  ] as const;
  async function savedHistory() {
    const original = await create();
    await create(
      input({
        sourceType: 'correction',
        previousQuoteId: original.quote.id,
        reason: '模拟纠错，保留原记录',
      }),
    );
    await api().verifyQuote(
      original.quote.id,
      1,
      'mock:verify',
      '模拟核验',
      key(),
    );
    await api().confirmQuote(
      original.quote.id,
      2,
      'mock:formal',
      '2026-11-13T00:00:00Z',
      '模拟正式确认',
      key(),
    );
    return quotes.read();
  }
  for (const collection of protectedCollections) {
    it.each(['tail', 'all'] as const)(
      `${collection} rejects %s truncation without changing persistence`,
      async (mode) => {
        const before = await savedHistory();
        const raw = storage.getItem(quoteStorageKey);
        expect(before[collection].length).toBeGreaterThan(1);
        const next = {
          ...before,
          [collection]: mode === 'all' ? [] : before[collection].slice(0, -1),
        };
        expect(() =>
          quotes.write(before, next, channels, suppliers, sourcing),
        ).toThrow();
        expect(storage.getItem(quoteStorageKey)).toBe(raw);
        expect(quotes.read()).toEqual(before);
      },
    );
    it(`${collection} rejects overwriting an existing field without changing persistence`, async () => {
      const before = await savedHistory();
      const raw = storage.getItem(quoteStorageKey);
      const next = {
        ...before,
        [collection]: before[collection].map((record, i) =>
          i === 0
            ? {
                ...record,
                ...(collection === 'requests'
                  ? { fingerprint: 'modified' }
                  : { reason: '修改历史' }),
              }
            : record,
        ),
      };
      expect(() =>
        quotes.write(before, next, channels, suppliers, sourcing),
      ).toThrow('只允许追加');
      expect(storage.getItem(quoteStorageKey)).toBe(raw);
    });
    it(`${collection} rejects reordering existing records without changing persistence`, async () => {
      const before = await savedHistory();
      const raw = storage.getItem(quoteStorageKey);
      const next = {
        ...before,
        [collection]: [...before[collection]].reverse(),
      };
      expect(() =>
        quotes.write(before, next, channels, suppliers, sourcing),
      ).toThrow();
      expect(storage.getItem(quoteStorageKey)).toBe(raw);
    });
  }
  it('rejects nested price field deletion and audit difference overwrite without changing persistence', async () => {
    const before = await savedHistory();
    const raw = storage.getItem(quoteStorageKey);
    const next = {
      ...before,
      quotes: before.quotes.map((q, i) =>
        i === before.quotes.length - 1
          ? {
              ...q,
              priceSpec: { ...q.priceSpec, rates: [] },
            }
          : q,
      ),
    };
    expect(() =>
      quotes.write(before, next, channels, suppliers, sourcing),
    ).toThrow('只允许追加');
    expect(storage.getItem(quoteStorageKey)).toBe(raw);
    const changedAudit = {
      ...before,
      history: before.history.map((h, i) =>
        i === 0
          ? {
              ...h,
              changes: h.changes.map((c) => ({ ...c, after: '修改历史差异' })),
            }
          : h,
      ),
    };
    expect(() =>
      quotes.write(before, changedAudit, channels, suppliers, sourcing),
    ).toThrow('只允许追加');
    expect(storage.getItem(quoteStorageKey)).toBe(raw);
  });
  it('keeps existing prefixes while appending quotes, corrections, verification and confirmation', async () => {
    const before = await savedHistory();
    const original = await create();
    await create(
      input({
        previousQuoteId: original.quote.id,
        sourceType: 'correction',
        reason: '模拟更正',
      }),
    );
    await api().verifyQuote(
      original.quote.id,
      1,
      'mock:verify',
      '模拟核验',
      key(),
    );
    await api().confirmQuote(
      original.quote.id,
      2,
      'mock:formal',
      '2026-11-13T00:00:00Z',
      '模拟确认',
      key(),
    );
    const after = new QuoteRepository(storage).read();
    for (const collection of protectedCollections) {
      expect(after[collection].slice(0, before[collection].length)).toEqual(
        before[collection],
      );
      expect(after[collection].length).toBeGreaterThan(
        before[collection].length,
      );
    }
    expect(after.quotes.length - before.quotes.length).toBe(2);
    expect(
      after.decisions.slice(before.decisions.length).map((d) => d.kind),
    ).toEqual(['verify', 'confirm']);
    expect(after.revision).toBe(before.revision + 4);
  });
});
describe('independent verification and formal confirmation', () => {
  it('requires verification, explicit evidence, authorized confirmer and start time', async () => {
    const r = await create(input({ priceStatus: 'pending_contract' }));
    await expect(
      api().confirmQuote(
        r.quote.id,
        1,
        'mock:formal',
        '2026-11-13T00:00:00Z',
        '模拟确认',
        key(),
      ),
    ).rejects.toThrow('独立核验');
    await api('u-proc').verifyQuote(
      r.quote.id,
      1,
      'mock:verify',
      '已人工核实模拟原始来源',
      key(),
    );
    await expect(
      api('u-proc').confirmQuote(
        r.quote.id,
        2,
        'mock:formal',
        '2026-11-13T00:00:00Z',
        '模拟确认',
        key(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      api().confirmQuote(
        r.quote.id,
        2,
        '',
        '2026-11-13T00:00:00Z',
        '模拟确认',
        key(),
      ),
    ).rejects.toThrow('模拟引用');
    await expect(
      api().confirmQuote(r.quote.id, 2, 'mock:formal', '', '模拟确认', key()),
    ).rejects.toThrow('生效');
    await api().confirmQuote(
      r.quote.id,
      2,
      'mock:formal',
      '2026-11-13T00:00:00Z',
      '模拟正式依据，不代表真实合同',
      key(),
    );
    const view = (await api().getQuote(r.quote.id))!;
    expect(view.row.quote).toMatchObject({
      priceStatus: 'effective',
      confirmedBy: 'u-ops',
      evidenceReference: 'mock:formal',
      effectiveFrom: '2026-11-13T00:00:00Z',
    });
    expect(view.decisions.map((d) => d.kind)).toEqual(['verify', 'confirm']);
    expect(
      quotes.read().quotes.find((q) => q.id === r.quote.id)?.priceStatus,
    ).toBe('pending_contract');
    expect(
      (await api().getQuoteHistory('ch-1')).find((q) => q.id === r.quote.id)
        ?.priceStatus,
    ).toBe('effective');
  });
  it('detects stale quote versions and allows retry of same successful verification without extra events', async () => {
    const r = await create();
    const token = key();
    await api().verifyQuote(r.quote.id, 1, 'mock:verify', '模拟核验', token);
    const raw = storage.getItem(quoteStorageKey);
    await api().verifyQuote(r.quote.id, 1, 'mock:verify', '模拟核验', token);
    expect(storage.getItem(quoteStorageKey)).toBe(raw);
    await expect(
      api().confirmQuote(
        r.quote.id,
        1,
        'mock:formal',
        '2026-11-13T00:00:00Z',
        '模拟确认',
        key(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('temporary offers require bounded interval and never overwrite formal records or select settlement price', async () => {
    const before = quotes
      .read()
      .quotes.filter((q) => q.priceStatus === 'effective');
    await expect(
      create(input({ sourceType: 'promotion', priceStatus: 'temporary' })),
    ).rejects.toThrow('bounded');
    const r = await create(
      input({
        sourceType: 'promotion',
        priceStatus: 'temporary',
        effectiveFrom: '2020-01-01T00:00:00Z',
        effectiveUntil: '2020-01-10T00:00:00Z',
      }),
    );
    expect(r.validity).toBe('expired');
    expect(
      (await api().queryQuotes({ status: 'expired' })).rows.some(
        (v) => v.quote.id === r.quote.id,
      ),
    ).toBe(true);
    expect(
      quotes.read().quotes.filter((q) => q.priceStatus === 'effective'),
    ).toEqual(before);
    expect(r).not.toHaveProperty('settlementPrice');
    await api().verifyQuote(r.quote.id, 1, 'mock:verify', '模拟核验', key());
    await expect(
      api().confirmQuote(
        r.quote.id,
        2,
        'mock:formal',
        '2020-01-01T00:00:00Z',
        '模拟确认',
        key(),
      ),
    ).rejects.toThrow();
  });
  it.each([
    { effectiveFrom: 'invalid', effectiveUntil: null },
    {
      effectiveFrom: '2026-12-01T00:00:00Z',
      effectiveUntil: '2026-11-01T00:00:00Z',
    },
    { effectiveFrom: null, effectiveUntil: '2026-12-01T00:00:00Z' },
  ])('rejects invalid validity boundaries %j', async (period) => {
    await expect(create(input(period))).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });
  it('validity distinguishes ended, future and unknown periods without erasing status', () => {
    const q = quotes.read().quotes[0]!;
    const now = Date.parse('2026-11-13T00:00:00Z');
    expect(
      quoteValidity({ ...q, effectiveUntil: '2026-11-13T00:00:00Z' }, now),
    ).toBe('expired');
    expect(
      quoteValidity({ ...q, effectiveFrom: '2026-12-01T00:00:00Z' }, now),
    ).toBe('scheduled');
    expect(quoteValidity({ ...q, effectiveFrom: null }, now)).toBe(
      'unspecified',
    );
  });
});
describe('precise amounts and conservative comparability', () => {
  it('keeps six-decimal exact arithmetic and input/output dimensions separate', () => {
    expect(decimalMicros('0.100001') + decimalMicros('0.200002')).toBe(300003n);
    expect(decimalMicros('999999999999.999999')).toBe(999999999999999999n);
  });
  it.each([
    '-1',
    'NaN',
    'Infinity',
    '1e3',
    '0.1234567',
    '1000000000000',
    '01.1',
  ])('rejects unsafe decimal %s', async (amount) => {
    expect(() => decimalMicros(amount)).toThrow();
    await expect(
      create(
        input({
          priceSpec: spec({
            rates: [
              {
                dimension: 'input_token',
                quantity: 1000,
                unit: 'Token',
                amount,
              },
            ],
          }),
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  async function pair() {
    return [
      (await create()).quote,
      (await create(input({ channelId: 'ch-2', discount: discountBps(5500) })))
        .quote,
    ] as const;
  }
  it('compares only same complete basis and uses exact per-dimension amount ordering', async () => {
    const [a, b] = await pair();
    const result = compareQuotes(
      a,
      {
        ...b,
        priceSpec: spec({
          rates: [
            {
              dimension: 'input_token',
              quantity: 1000000,
              unit: 'Token',
              amount: '0.123457',
            },
          ],
        }),
      },
      'm-seed-cn',
      'm-seed-cn',
    );
    expect(result.comparable).toBe(true);
    expect(result.discountDifferenceBps).toBe(500);
    expect(result.rates[0]?.order).toBe('lower');
  });
  it.each([
    { currency: 'USD' },
    { referencePriceSource: 'different' },
    { specification: 'different' },
    {
      rates: [
        {
          dimension: 'output_token' as const,
          quantity: 1000000,
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
    {
      rates: [
        {
          dimension: 'video_second' as const,
          quantity: 1,
          unit: '秒',
          amount: '0.1',
        },
      ],
    },
  ])(
    'blocks currency, reference, specification, dimension or unit mismatch %j',
    async (change) => {
      const [a, b] = await pair();
      const result = compareQuotes(
        a,
        { ...b, priceSpec: spec(change) },
        'm-seed-cn',
        'm-seed-cn',
      );
      expect(result.comparable).toBe(false);
      expect(result.discountDifferenceBps).toBeNull();
      expect(result.rates).toEqual([]);
    },
  );
  it('does not compare absent historical basis, different models, statuses or periods', async () => {
    const [a, b] = await pair();
    for (const other of [
      {
        ...b,
        priceSpec: {
          currency: null,
          referencePriceSource: null,
          specification: null,
          rates: [],
        },
      },
      { ...b, priceStatus: 'temporary' as const },
      { ...b, effectiveFrom: '2026-12-01T00:00:00Z' },
    ])
      expect(compareQuotes(a, other, 'm-seed-cn', 'm-seed-cn').comparable).toBe(
        false,
      );
    expect(compareQuotes(a, b, 'm-seed-cn', 'm-gpt').comparable).toBe(false);
  });
  it('allows explicit non-token dimensions without inventing official model units, null amount stays unknown', async () => {
    const r = await create(
      input({
        priceSpec: spec({
          rates: [
            { dimension: 'image', quantity: 1, unit: '模拟图片', amount: null },
          ],
        }),
      }),
    );
    expect(r.quote.priceSpec.rates[0]?.amount).toBeNull();
    expect(
      (await api().compareQuoteRecords(r.quote.id, r.quote.id)).rates[0]?.order,
    ).toBeNull();
  });
});
describe('inquiries, permissions, reset and cross-module consistency', () => {
  it('inquiry status is versioned; a received quote is not verified and reply update is atomic', async () => {
    const a = api('u-proc');
    const i = await a.createInquiry(
      {
        channelId: 'ch-1',
        demandItemId: 'di-1',
        responseDueAt: null,
        followUpNote: '模拟待询价',
      },
      key(),
    );
    await a.updateInquiry(i.id, 1, 'sent', '人工登记已询价，不发送消息', key());
    await expect(
      a.updateInquiry(i.id, 1, 'quoted', '已回复', key()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      a.createQuote(
        input({
          demandId: 'd-1',
          demandItemId: 'di-1',
          inquiryId: i.id,
          inquiryVersion: 1,
        }),
        key(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const r = await a.createQuote(
      input({
        demandId: 'd-1',
        demandItemId: 'di-1',
        inquiryId: i.id,
        inquiryVersion: 2,
      }),
      key(),
    );
    expect((await a.listInquiries())[0]).toMatchObject({
      status: 'quoted',
      version: 3,
    });
    expect(r.verified).toBe(false);
    expect(r.quote.confirmedBy).toBeNull();
  });
  it('inquiry duplicate creation is idempotent, no-op follow-up does not append, and closed is terminal', async () => {
    const a = api();
    const token = key();
    const v = {
      channelId: 'ch-1',
      demandItemId: null,
      responseDueAt: null,
      followUpNote: '模拟待询价',
    };
    const i = await a.createInquiry(v, token);
    expect((await a.createInquiry(v, token)).id).toBe(i.id);
    const raw = storage.getItem(quoteStorageKey);
    await a.updateInquiry(i.id, 1, 'draft', v.followUpNote, key());
    expect(storage.getItem(quoteStorageKey)).toBe(raw);
    await a.updateInquiry(i.id, 1, 'closed', '模拟关闭', key());
    await expect(
      a.updateInquiry(i.id, 2, 'sent', '尝试重开', key()),
    ).rejects.toThrow('状态流转');
  });
  it('inquiry/model associations and quote/inquiry associations must match', async () => {
    await expect(
      api().createInquiry(
        {
          channelId: 'ch-1',
          demandItemId: 'di-2',
          responseDueAt: null,
          followUpNote: '模拟',
        },
        key(),
      ),
    ).rejects.toThrow('模型');
    const i = await api().createInquiry(
      {
        channelId: 'ch-2',
        demandItemId: null,
        responseDueAt: null,
        followUpNote: '模拟',
      },
      key(),
    );
    await expect(
      create(input({ inquiryId: i.id, inquiryVersion: 1 })),
    ).rejects.toThrow('询价关联');
  });
  it.each([
    'u-test',
    'u-support',
    'u-supplier',
    'u-sales',
    'u-account',
    'u-solution',
    'u-no-domain',
  ])(
    '%s cannot obtain prices, histories, comparisons or write through API',
    async (id) => {
      const a = api(id);
      expect(await a.getQuote('q-1')).toBeNull();
      expect(await a.getQuoteHistory('ch-1')).toEqual([]);
      expect(await a.listInquiries()).toEqual([]);
      await expect(a.queryQuotes()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(a.quoteOptions()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(a.createQuote(input(), key())).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(
        a.verifyQuote('q-1', 1, 'mock:ref', '模拟', key()),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        a.confirmQuote(
          'q-1',
          1,
          'mock:ref',
          '2026-11-13T00:00:00Z',
          '模拟',
          key(),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        a.createInquiry(
          {
            channelId: 'ch-1',
            demandItemId: null,
            responseDueAt: null,
            followUpNote: '模拟',
          },
          key(),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(a.compareQuoteRecords('q-1', 'q-2')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    },
  );
  it('applies domain and procurement supplier maintenance to every read/write option', async () => {
    const r = await create(input({ channelId: 'ch-5' }));
    const a = api('u-domestic');
    expect(await a.getQuote(r.quote.id)).toBeNull();
    expect(
      (await a.quoteOptions()).channels.every((c) => c.model.id !== 'm-gpt'),
    ).toBe(true);
    await expect(
      a.createQuote(input({ channelId: 'ch-5' }), key()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await api('u-proc-alt').queryQuotes()).rows).toEqual([]);
    await expect(
      api('u-proc-alt').createQuote(input(), key()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('revoked sessions lose every quotation write capability', async () => {
    let active = true;
    const a = api('u-ops', undefined, () => active);
    active = false;
    for (const op of [
      () => a.createQuote(input(), key()),
      () => a.verifyQuote('q-1', 1, 'mock:v', '模拟', key()),
      () =>
        a.confirmQuote(
          'q-1',
          1,
          'mock:v',
          '2026-11-13T00:00:00Z',
          '模拟',
          key(),
        ),
      () =>
        a.createInquiry(
          {
            channelId: 'ch-1',
            demandItemId: null,
            responseDueAt: null,
            followUpNote: '模拟',
          },
          key(),
        ),
      () => a.resetQuoteDemo(true),
    ])
      await expect(op()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('quote options never leak sourcing restricted text, customer identity or raw snapshots', async () => {
    const source = api();
    const d = await source.createSourcingDemand(
      {
        title: 'PRIVATE',
        description: 'PRIVATE',
        sharedTitle: '模拟共享标题',
        sharedSummary: '模拟共享摘要',
        priority: 'normal',
        customerId: 'customer-1',
        dueAt: null,
        items: [
          {
            modelId: 'm-seed-cn',
            targetPurchaseDiscount: discountBps(5000),
            requiredTpm: null,
            requiredRpm: null,
            requiredConcurrency: null,
            requiredTtftMs: null,
            requiredRegion: '',
            priority: 'normal',
          },
        ],
      },
      key(),
    );
    const item = (await source.getSourcingDemand(d.id))!.items[0]!.item;
    const r = await api('u-proc').createQuote(
      input({ demandId: d.id, demandItemId: item.id }),
      key(),
    );
    const payload = [
      await api('u-proc').quoteOptions(),
      await api('u-proc').getQuote(r.quote.id),
    ];
    expect(JSON.stringify(payload)).not.toContain('PRIVATE');
    for (const name of [
      'customer',
      'customerId',
      'salesPriceMinorUnits',
      'beforeSnapshot',
      'afterSnapshot',
    ])
      expect(allKeys(payload)).not.toContain(name);
  });
  it('dashboard pending and new-price channel metrics reflect current repository; confirming does not change sourcing', async () => {
    const a = api();
    const before = await a.queryQuotes();
    const r = await create(input({ priceStatus: 'pending_contract' }));
    const d = await loadDashboard(a, () => true);
    expect(d.metrics.find((m) => m.id === 'quotes')?.value).toBe(
      before.stats.pending + 1,
    );
    const src = JSON.stringify(sourcing.read());
    await a.verifyQuote(r.quote.id, 1, 'mock:v', '模拟核验', key());
    await a.confirmQuote(
      r.quote.id,
      2,
      'mock:f',
      '2026-11-13T00:00:00Z',
      '模拟确认',
      key(),
    );
    expect((await a.queryQuotes()).stats.pending).toBe(before.stats.pending);
    expect(JSON.stringify(sourcing.read())).toBe(src);
  });
  it('preserves quotes, decisions and inquiries after repository reconstruction', async () => {
    const i = await api().createInquiry(
      {
        channelId: 'ch-1',
        demandItemId: null,
        responseDueAt: null,
        followUpNote: '模拟',
      },
      key(),
    );
    const r = await create(input({ inquiryId: i.id, inquiryVersion: 1 }));
    await api().verifyQuote(r.quote.id, 1, 'mock:v', '模拟核验', key());
    quotes = new QuoteRepository(storage);
    expect((await api().getQuote(r.quote.id))?.row.verified).toBe(true);
    expect((await api().listInquiries())[0]?.status).toBe('quoted');
  });
  it('new quote and inquiry references block destructive channel reset; explicit quote reset retains other stores', async () => {
    const c = await api().createChannel({
      displayName: '模拟报价渠道',
      channelType: 'other',
      modelInvocationName: 'mock',
      endpointReference: 'mock',
      tpm: null,
      rpm: null,
      concurrencyLimit: null,
      ttftMs: null,
      supplierId: 's-1',
      modelId: 'm-seed-cn',
    });
    await create(input({ channelId: c.id }));
    await expect(api().resetChannelDemo(true)).rejects.toThrow(
      '先独立确认重置报价',
    );
    const snapshot = JSON.stringify([
      suppliers.read(),
      channels.read(),
      sourcing.read(),
    ]);
    await api().resetQuoteDemo(true);
    expect(
      JSON.stringify([suppliers.read(), channels.read(), sourcing.read()]),
    ).toBe(snapshot);
    await api().resetChannelDemo(true);
    quotes.validate(quotes.read(), channels, suppliers, sourcing);
  });
  it('new sourcing-item inquiry prevents unsafe sourcing reset even before a quote is received', async () => {
    const d = await api().createSourcingDemand(
      {
        title: '模拟受限',
        description: '',
        sharedTitle: '模拟共享',
        sharedSummary: '模拟摘要',
        priority: 'normal',
        customerId: null,
        dueAt: null,
        items: [
          {
            modelId: 'm-seed-cn',
            targetPurchaseDiscount: discountBps(5000),
            requiredTpm: null,
            requiredRpm: null,
            requiredConcurrency: null,
            requiredTtftMs: null,
            requiredRegion: '',
            priority: 'normal',
          },
        ],
      },
      key(),
    );
    const i = (await api().getSourcingDemand(d.id))!.items[0]!.item;
    await api().createInquiry(
      {
        channelId: 'ch-1',
        demandItemId: i.id,
        responseDueAt: null,
        followUpNote: '模拟',
      },
      key(),
    );
    await expect(api().resetSourcingDemo(true)).rejects.toThrow(
      '先独立确认重置报价',
    );
    expect(await api().getSourcingDemand(d.id)).not.toBeNull();
    await api().resetQuoteDemo(true);
    await api().resetSourcingDemo(true);
    quotes.validate(quotes.read(), channels, suppliers, sourcing);
  });
  it.each([
    ['u-proc', undefined, true],
    ['u-ops', 'domestic', true],
    ['u-ops', undefined, false],
  ])(
    'reset requires operator/full scope/confirmation %s %s %s',
    async (id, domain, confirm) => {
      await expect(
        api(String(id), domain as 'domestic' | undefined).resetQuoteDemo(
          Boolean(confirm),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );
  it.each([
    '{broken',
    '{"schemaVersion":99}',
    '{"schemaVersion":1,"revision":0,"quotes":[{}],"inquiries":[],"decisions":[],"history":[],"requests":[]}',
  ])('never silently overwrites incompatible quote data %s', async (raw) => {
    storage.values.set(quoteStorageKey, raw);
    await expect(api().queryQuotes()).rejects.toMatchObject({
      code: 'STORAGE',
    });
    expect(storage.getItem(quoteStorageKey)).toBe(raw);
    await api().resetQuoteDemo(true);
    expect(quotes.read().quotes).toHaveLength(fixture.quotes.length);
  });
});
