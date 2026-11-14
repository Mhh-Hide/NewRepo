import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import {
  SupplierRepository,
  type StoragePort,
} from '../../src/mocks/supplier-repository';
import { ChannelRepository } from '../../src/mocks/channel-repository';
import { SourcingRepository } from '../../src/mocks/sourcing-repository';
import {
  QuoteRepository,
  quoteStorageKey,
} from '../../src/mocks/quote-repository';
import { discountBps } from '../../src/domain/rules';
import type {
  QuoteInput,
  QuoteState,
  PriceSpec,
} from '../../src/domain/quotations';
import type { BulkBatchDetail } from '../../src/services/bulk-quotation-types';
import type { BulkDraftInput } from '../../src/domain/bulk-quotations';
class Memory implements StoragePort {
  values = new Map<string, string>();
  fail = false;
  writes = 0;
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw Error('quota');
    this.writes++;
    this.values.set(k, v);
  }
}
let storage: Memory,
  suppliers: SupplierRepository,
  channels: ChannelRepository,
  sourcing: SourcingRepository,
  quotes: QuoteRepository;
const api = (
  id = 'u-ops',
  domain?: 'domestic' | 'overseas',
  active = () => true,
) =>
  createMockAdapter(id, domain, suppliers, active, channels, sourcing, quotes);
const key = () => crypto.randomUUID();
const spec = (p: Partial<PriceSpec> = {}): PriceSpec => ({
  currency: 'CNY',
  referencePriceSource: 'mock:catalog',
  specification: 'mock:spec',
  rates: [
    { dimension: 'input_token', quantity: 1000, unit: 'Token', amount: null },
  ],
  ...p,
});
const input = (p: Partial<QuoteInput> = {}): QuoteInput => ({
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
  supplierQuotedAt: null,
  supplierSubmitterReference: 'mock:contact',
  evidenceReference: 'mock:evidence:bulk',
  reason: '模拟批次记录',
  priceSpec: spec(),
  ...p,
});
const batch = (a = api(), supplierId = 's-1') =>
  a.createBulkBatch(
    {
      supplierId,
      sourceReference: 'mock:evidence:batch',
      sharedReason: '模拟共同说明',
    },
    key(),
  );
const edit = (
  d: BulkBatchDetail,
  rows: readonly Partial<QuoteInput>[],
): BulkDraftInput => ({
  sourceReference: d.batch.sourceReference,
  sharedReason: d.batch.sharedReason,
  items: rows.map((p) => ({ itemId: `item-${key()}`, proposedQuoteInput: p })),
});
async function draft(
  rows: readonly Partial<QuoteInput>[] = [input()],
  a = api(),
) {
  const d = await batch(a);
  return a.updateBulkDraft(d.batch.id, d.batch.version, edit(d, rows), key());
}
const preview = (d: BulkBatchDetail, a = api()) =>
  a.previewBulkBatch(d.batch.id, d.batch.version);
async function submit(d: BulkBatchDetail, a = api(), request = key()) {
  const p = await preview(d, a);
  return a.submitBulkBatch(d.batch.id, d.batch.version, p.token, true, request);
}
const raw = () => storage.getItem(quoteStorageKey);
const write = (s: QuoteState, n: QuoteState) =>
  quotes.write(s, n, channels, suppliers, sourcing);
beforeEach(() => {
  storage = new Memory();
  suppliers = new SupplierRepository(storage);
  channels = new ChannelRepository(storage);
  sourcing = new SourcingRepository(storage);
  quotes = new QuoteRepository(storage);
});
describe('Stage 06B draft and all-or-none submission', () => {
  it.each(['u-ops', 'u-proc'])(
    '%s creates, saves, reloads and submits multiple same-channel rows with stable mappings',
    async (actor) => {
      const a = api(actor),
        d = await draft(
          [
            input(),
            input({ discount: discountBps(7000) }),
            input({ channelId: 'ch-2', priceSpec: spec({ currency: 'USD' }) }),
          ],
          a,
        ),
        before = quotes.read();
      const restored = (await a.getBulkBatch(d.batch.id))!;
      expect(restored.batch.items.map((i) => i.itemId)).toEqual(
        d.batch.items.map((i) => i.itemId),
      );
      const writes = storage.writes,
        result = await submit(restored, a);
      expect(storage.writes - writes).toBe(1);
      expect(result.mappings.map((m) => m.itemId)).toEqual(
        d.batch.items.map((i) => i.itemId),
      );
      expect(new Set(result.mappings.map((m) => m.quoteId)).size).toBe(3);
      const after = quotes.read();
      expect(after.quotes.slice(0, before.quotes.length)).toEqual(
        before.quotes,
      );
      expect(after.quotes.length).toBe(before.quotes.length + 3);
      expect(after.decisions).toEqual(before.decisions);
      expect(after.batchSubmissions).toHaveLength(1);
      for (const m of result.mappings) {
        const q = (await a.getQuote(m.quoteId))!;
        expect(q.row.verified).toBe(false);
        expect(q.row.quote.priceStatus).toBe('reference');
        expect(q.row.quote.confirmedAt).toBeNull();
        expect(await a.getBulkQuoteOrigin(m.quoteId)).toMatchObject({
          batchId: d.batch.id,
          itemId: m.itemId,
        });
      }
    },
  );
  it('supports one supplier spanning models and both domains, but entirely conceals mixed batch from partial scope', async () => {
    const d = await draft([input(), input({ channelId: 'ch-5' })]);
    expect((await preview(d)).canSubmit).toBe(true);
    for (const a of [
      api('u-domestic'),
      api('u-ops', 'domestic'),
      api('u-ops', 'overseas'),
    ]) {
      expect(await a.queryBulkBatches()).toEqual([]);
      expect(await a.getBulkBatch(d.batch.id)).toBeNull();
      await expect(preview(d, a)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        a.updateBulkDraft(
          d.batch.id,
          d.batch.version,
          edit(d, [input()]),
          key(),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    expect((await submit(d)).mappings).toHaveLength(2);
  });
  it('removed mixed-domain rows still protect sensitive history and cannot be resurrected with reused IDs', async () => {
    const d = await draft([input(), input({ channelId: 'ch-5' })]);
    const removed = d.batch.items[1]!;
    const updated = await api().updateBulkDraft(
      d.batch.id,
      d.batch.version,
      {
        ...edit(d, []),
        items: [
          { itemId: d.batch.items[0]!.itemId, proposedQuoteInput: input() },
        ],
      },
      key(),
    );
    expect(await api('u-domestic').getBulkBatch(d.batch.id)).toBeNull();
    expect(await api('u-domestic').queryBulkBatches()).toEqual([]);
    await expect(
      api().updateBulkDraft(
        d.batch.id,
        updated.batch.version,
        {
          ...edit(updated, []),
          items: [{ itemId: removed.itemId, proposedQuoteInput: input() }],
        },
        key(),
      ),
    ).rejects.toThrow('历史');
  });
  it('allows authorized procurement to edit an operations-created batch; no creator-only rule', async () => {
    const d = await batch();
    const changed = await api('u-proc').updateBulkDraft(
      d.batch.id,
      1,
      edit(d, [input()]),
      key(),
    );
    expect(changed.batch.version).toBe(2);
    expect(changed.history.at(-1)?.actorUserId).toBe('u-proc');
  });
  it('warns exact duplicate rows without merging, deleting or blocking them', async () => {
    const d = await draft([input(), input()]),
      p = await preview(d);
    expect(p.canSubmit).toBe(true);
    expect(
      p.rows.every((r) => r.warnings.some((w) => w.message.includes('重复'))),
    ).toBe(true);
    expect((await submit(d)).mappings).toHaveLength(2);
  });
  it('keeps incomplete draft values unknown, exposes field error, and persists nothing on failed submission', async () => {
    const d = await draft([input(), { channelId: 'ch-1' }]),
      p = await preview(d),
      before = raw();
    expect(p.canSubmit).toBe(false);
    expect(p.rows[1]?.errors[0]?.field).toBe('discount');
    await expect(
      api().submitBulkBatch(d.batch.id, d.batch.version, p.token, true, key()),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(raw()).toBe(before);
    expect((await api().getBulkBatch(d.batch.id))?.batch.status).toBe('draft');
  });
  it('does not increment versions or create audit or request on an unchanged save', async () => {
    const d = await draft(),
      before = raw();
    const saved = await api().updateBulkDraft(
      d.batch.id,
      d.batch.version,
      {
        sourceReference: d.batch.sourceReference,
        sharedReason: d.batch.sharedReason,
        items: d.batch.items.map((i) => ({
          itemId: i.itemId,
          proposedQuoteInput: i.proposedQuoteInput,
        })),
      },
      key(),
    );
    expect(saved.batch.version).toBe(d.batch.version);
    expect(raw()).toBe(before);
  });
  it('preserves removed-row history and row timestamps; rejects stale edits', async () => {
    const d = await draft([input(), input({ channelId: 'ch-2' })]);
    const kept = d.batch.items[0]!;
    const changed = await api().updateBulkDraft(
      d.batch.id,
      d.batch.version,
      {
        ...edit(d, []),
        items: [
          { itemId: kept.itemId, proposedQuoteInput: kept.proposedQuoteInput },
        ],
      },
      key(),
    );
    expect(changed.batch.items[0]?.createdAt).toBe(kept.createdAt);
    expect(changed.history.at(-1)?.removedItemIds).toEqual([
      d.batch.items[1]!.itemId,
    ]);
    await expect(
      api().updateBulkDraft(d.batch.id, d.batch.version, edit(d, []), key()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it.each([-1, 10001, 0.5])(
    'invalid discount %s blocks all rows',
    async (n) => {
      const d = await draft([
          input(),
          input({ discount: n as QuoteInput['discount'] }),
        ]),
        p = await preview(d),
        before = raw();
      expect(p.rows[1]?.errors[0]?.field).toBe('discount');
      await expect(submit(d)).rejects.toThrow();
      expect(raw()).toBe(before);
    },
  );
  it.each([0, 10000])('discount boundary %s succeeds', async (n) => {
    expect(
      (await submit(await draft([input({ discount: discountBps(n) })])))
        .mappings,
    ).toHaveLength(1);
  });
  it.each(['-1', '1.1234567', '1e3', 'NaN'])(
    'invalid money %s blocks preview',
    async (amount) => {
      const d = await draft([
        input({
          priceSpec: spec({
            rates: [{ dimension: 'image', quantity: 1, unit: '张', amount }],
          }),
        }),
      ]);
      expect((await preview(d)).rows[0]?.errors[0]?.field).toBe('priceSpec');
    },
  );
  it('unknown currency/amount/spec is not fabricated and produces completeness warnings', async () => {
    const d = await draft([
      input({
        priceSpec: spec({
          currency: null,
          referencePriceSource: null,
          specification: null,
          rates: [],
        }),
      }),
    ]);
    const p = await preview(d);
    expect(p.canSubmit).toBe(true);
    expect(p.rows[0]?.warnings.some((w) => w.field === 'priceSpec')).toBe(true);
    const r = await submit(d);
    expect(
      (await api().getQuote(r.mappings[0]!.quoteId))?.row.quote.priceSpec
        .currency,
    ).toBeNull();
  });
  it('separates specifications, commercial comparison, period validity and numerical difference', async () => {
    const prior = await api().createQuote(
      input({
        effectiveFrom: '2020-01-01T00:00:00Z',
        effectiveUntil: '2021-01-01T00:00:00Z',
      }),
      key(),
    );
    const d = await draft([
        input({
          previousQuoteId: prior.quote.id,
          discount: discountBps(5000),
          priceStatus: 'pending_contract',
        }),
      ]),
      r = (await preview(d)).rows[0]!;
    expect(r.numericDifferenceBps).toBe(-1000);
    expect(r.comparison?.specComparable).toBe(true);
    expect(r.comparison?.comparable).toBe(false);
    expect(r.comparison?.currentValidity.first).toBe('expired');
    expect(r.comparison?.procurementNotice).toContain('不等于');
  });
  it.each([
    { currency: 'USD' },
    {
      rates: [
        { dimension: 'image' as const, quantity: 1, unit: '张', amount: null },
      ],
    },
  ])('does not commercially compare changed basis %j', async (delta) => {
    const q = await api().createQuote(input(), key()),
      d = await draft([
        input({ previousQuoteId: q.quote.id, priceSpec: spec(delta) }),
      ]);
    expect((await preview(d)).rows[0]?.comparison?.specComparable).toBe(false);
  });
  it('requires an explicit reference and reason for corrections; preserves original record', async () => {
    const invalid = await draft([
      input({ sourceType: 'correction', previousQuoteId: null }),
    ]);
    expect((await preview(invalid)).canSubmit).toBe(false);
    const q = await api().createQuote(input(), key()),
      d = await draft([
        input({
          sourceType: 'correction',
          previousQuoteId: q.quote.id,
          discount: discountBps(5000),
          reason: '模拟纠错',
        }),
      ]);
    expect((await preview(d)).canSubmit).toBe(true);
    await submit(d);
    expect(quotes.read().quotes.find((r) => r.id === q.quote.id)).toEqual(
      q.quote,
    );
  });
  it.each([
    { effectiveFrom: 'bad' },
    { effectiveFrom: '2026-02-01', effectiveUntil: '2026-01-01' },
    {
      sourceType: 'promotion' as const,
      priceStatus: 'temporary' as const,
      effectiveFrom: null,
      effectiveUntil: null,
    },
  ])('invalid periods block %j', async (p) => {
    expect((await preview(await draft([input(p)]))).canSubmit).toBe(false);
  });
  it('temporary promotions remain independent and visible immediately in analytics without replacing formals', async () => {
    const before = quotes.read(),
      now = Date.now(),
      d = await draft([
        input({
          sourceType: 'promotion',
          priceStatus: 'temporary',
          effectiveFrom: new Date(now - 86400000).toISOString(),
          effectiveUntil: new Date(now + 2 * 86400000).toISOString(),
        }),
      ]);
    const result = await submit(d);
    expect(quotes.read().quotes.slice(0, before.quotes.length)).toEqual(
      before.quotes,
    );
    expect(
      (await api().getQuote(result.mappings[0]!.quoteId))?.row.quote
        .priceStatus,
    ).toBe('temporary');
    const analysis = await api().queryProcurementAnalytics();
    expect(JSON.stringify(analysis)).toContain(result.mappings[0]!.quoteId);
  });
  it('one inquiry shared by multiple rows is followed once, in the same commit', async () => {
    const a = api(),
      inquiry = await a.createInquiry(
        {
          channelId: 'ch-1',
          demandItemId: 'di-1',
          responseDueAt: null,
          followUpNote: '模拟',
        },
        key(),
      );
    const p = input({
        demandId: 'd-1',
        demandItemId: 'di-1',
        inquiryId: inquiry.id,
        inquiryVersion: inquiry.version,
      }),
      d = await draft([p, p]);
    const source = JSON.stringify(sourcing.read());
    await submit(d);
    const i = quotes.read().inquiries.find((i) => i.id === inquiry.id)!;
    expect(i.status).toBe('quoted');
    expect(i.version).toBe(inquiry.version + 1);
    expect(JSON.stringify(sourcing.read())).toBe(source);
  });
});
describe('authorization, replay, freshness and storage failure', () => {
  it.each([
    'u-test',
    'u-support',
    'u-supplier',
    'u-sales',
    'u-account',
    'u-solution',
    'u-no-domain',
  ])('denies every bulk endpoint to %s', async (id) => {
    const d = await draft(),
      p = await preview(d),
      a = api(id),
      before = raw();
    for (const call of [
      () => a.bulkQuoteOptions(),
      () => a.queryBulkBatches(),
      () => a.getBulkBatch(d.batch.id),
      () => batch(a),
      () =>
        a.updateBulkDraft(
          d.batch.id,
          d.batch.version,
          edit(d, [input()]),
          key(),
        ),
      () => preview(d, a),
      () =>
        a.submitBulkBatch(d.batch.id, d.batch.version, p.token, true, key()),
      () => a.getBulkQuoteOrigin('q-1'),
    ])
      await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(raw()).toBe(before);
  });
  it('uses the same generic response for guessed and unauthorized batch IDs', async () => {
    expect(await api('u-proc-alt').getBulkBatch('does-not-exist')).toBeNull();
    const d = await batch(api(), 's-3');
    expect(await api('u-proc-alt').getBulkBatch(d.batch.id)).toBeNull();
    await expect(
      api('u-proc-alt').createBulkBatch(
        { supplierId: 's-3', sourceReference: '', sharedReason: '' },
        key(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('rejects cross-supplier row atomically and does not disclose its metadata', async () => {
    const d = await batch(),
      before = raw();
    await expect(
      api('u-proc').updateBulkDraft(
        d.batch.id,
        d.batch.version,
        edit(d, [input({ channelId: 'ch-3' })]),
        key(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(raw()).toBe(before);
  });
  it('revoked sessions cannot read or write and cannot replay a successful request', async () => {
    let active = true;
    const a = api('u-ops', undefined, () => active),
      d = await draft([input()], a),
      p = await preview(d, a),
      request = key();
    await a.submitBulkBatch(
      d.batch.id,
      d.batch.version,
      p.token,
      true,
      request,
    );
    const before = raw();
    active = false;
    await expect(
      a.submitBulkBatch(d.batch.id, d.batch.version, p.token, true, request),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(raw()).toBe(before);
  });
  it('returns the durable full mapping for identical replay without duplicate quotes/audits', async () => {
    const d = await draft([input(), input()]),
      p = await preview(d),
      request = key(),
      r = await api().submitBulkBatch(
        d.batch.id,
        d.batch.version,
        p.token,
        true,
        request,
      ),
      before = raw();
    expect(
      await api().submitBulkBatch(
        d.batch.id,
        d.batch.version,
        p.token,
        true,
        request,
      ),
    ).toEqual(r);
    expect(raw()).toBe(before);
    await expect(
      api().submitBulkBatch(
        d.batch.id,
        d.batch.version,
        p.token + 'x',
        true,
        request,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(raw()).toBe(before);
    await expect(
      api().submitBulkBatch(d.batch.id, d.batch.version, p.token, true, key()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      api().updateBulkDraft(d.batch.id, d.batch.version, edit(d, []), key()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('detects referenced quote verification changes after preview', async () => {
    const a = api(),
      q = await a.createQuote(input(), key()),
      d = await draft([input({ previousQuoteId: q.quote.id })]),
      p = await preview(d);
    await a.verifyQuote(
      q.quote.id,
      q.version,
      'mock:verify',
      '模拟核验',
      key(),
    );
    const before = raw();
    await expect(
      a.submitBulkBatch(d.batch.id, d.batch.version, p.token, true, key()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(raw()).toBe(before);
    expect((await preview(d)).rows[0]?.priorVersion).toBe(q.version + 1);
    expect((await submit(d)).mappings).toHaveLength(1);
  });
  it('detects unrelated quote revision changes conservatively instead of accepting stale preview', async () => {
    const d = await draft(),
      p = await preview(d);
    await api().createQuote(input(), key());
    await expect(
      api().submitBulkBatch(d.batch.id, d.batch.version, p.token, true, key()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('requires explicit second confirmation', async () => {
    const d = await draft(),
      p = await preview(d),
      before = raw();
    await expect(
      api().submitBulkBatch(d.batch.id, d.batch.version, p.token, false, key()),
    ).rejects.toThrow('二次确认');
    expect(raw()).toBe(before);
  });
  it('storage quota failure leaves the draft, historical prefixes, request and result unchanged; retry succeeds', async () => {
    const d = await draft([input(), input()]),
      p = await preview(d),
      before = raw(),
      request = key();
    storage.fail = true;
    await expect(
      api().submitBulkBatch(
        d.batch.id,
        d.batch.version,
        p.token,
        true,
        request,
      ),
    ).rejects.toMatchObject({ code: 'STORAGE' });
    expect(raw()).toBe(before);
    storage.fail = false;
    const r = await api().submitBulkBatch(
      d.batch.id,
      d.batch.version,
      p.token,
      true,
      request,
    );
    expect(r.mappings).toHaveLength(2);
    expect(quotes.read().batchSubmissions).toHaveLength(1);
  });
  it('procurement can verify but cannot formally confirm a bulk quote', async () => {
    const a = api('u-proc'),
      r = await submit(await draft([input()], a), a),
      q = (await a.getQuote(r.mappings[0]!.quoteId))!;
    await a.verifyQuote(
      q.row.quote.id,
      q.row.version,
      'mock:verify',
      '模拟',
      key(),
    );
    await expect(
      a.confirmQuote(
        q.row.quote.id,
        q.row.version + 1,
        'mock:contract',
        new Date().toISOString(),
        '模拟',
        key(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('returned objects cannot mutate durable state', async () => {
    const d = await draft(),
      before = raw();
    (d.batch.items as unknown[]).pop();
    expect(raw()).toBe(before);
    expect((await api().getBulkBatch(d.batch.id))?.batch.items).toHaveLength(1);
  });
});
describe('v2 migration and immutable aggregate', () => {
  async function v1() {
    await api().createQuote(input(), key());
    const s = quotes.read();
    const { batches, batchEvents, batchSubmissions, ...old } = s;
    expect(
      [batches, batchEvents, batchSubmissions].every((a) => a.length === 0),
    ).toBe(true);
    const raw = JSON.stringify({ ...old, schemaVersion: 1 });
    storage.values.set(quoteStorageKey, raw);
    return { s, raw };
  }
  it('normalizes v1 only in memory, preserves all five arrays and IDs; upgrades once on validated successful write', async () => {
    const old = await v1(),
      writes = storage.writes;
    expect(quotes.read()).toEqual(old.s);
    expect(quotes.read()).toEqual(old.s);
    expect(raw()).toBe(old.raw);
    expect(storage.writes).toBe(writes);
    const s = quotes.read();
    write(s, s);
    const persisted = JSON.parse(raw()!) as QuoteState;
    expect(persisted.schemaVersion).toBe(2);
    for (const k of [
      'quotes',
      'inquiries',
      'decisions',
      'history',
      'requests',
    ] as const)
      expect(persisted[k]).toEqual(old.s[k]);
    const upgraded = raw();
    quotes.read();
    quotes.read();
    expect(raw()).toBe(upgraded);
  });
  it.each([99, '1', null])(
    'rejects unknown/malformed schema %s without clearing storage',
    async (schemaVersion) => {
      await v1();
      const v = { ...JSON.parse(raw()!), schemaVersion };
      storage.values.set(quoteStorageKey, JSON.stringify(v));
      const before = raw();
      expect(() => quotes.read()).toThrow();
      expect(raw()).toBe(before);
    },
  );
  it('rejects corrupt JSON and corrupt v1 reference migration without replacing data', async () => {
    storage.values.set(quoteStorageKey, '{broken');
    expect(() => quotes.read()).toThrow();
    expect(raw()).toBe('{broken');
    storage.values.delete(quoteStorageKey);
    await v1();
    const bad = JSON.parse(raw()!);
    bad.quotes[0].channelId = 'missing';
    storage.values.set(quoteStorageKey, JSON.stringify(bad));
    const before = raw();
    expect(() => write(quotes.read(), quotes.read())).toThrow();
    expect(raw()).toBe(before);
  });
  it('migration storage failure leaves original v1 untouched and can retry', async () => {
    const old = await v1(),
      s = quotes.read();
    storage.fail = true;
    expect(() => write(s, s)).toThrow('保存失败');
    expect(raw()).toBe(old.raw);
    storage.fail = false;
    write(s, s);
    expect(JSON.parse(raw()!).schemaVersion).toBe(2);
  });
  it('rejects a stale v1-era aggregate after another client has created v2 batch', async () => {
    await v1();
    const stale = quotes.read();
    await batch();
    const before = raw();
    expect(() => write(stale, stale)).toThrow();
    expect(raw()).toBe(before);
  });
  it.each([
    'quotes',
    'decisions',
    'history',
    'requests',
    'batchEvents',
    'batchSubmissions',
  ] as const)(
    'cannot truncate %s; failure preserves persisted bytes',
    async (k) => {
      const q = await api().createQuote(input(), key());
      await api().verifyQuote(q.quote.id, 1, 'mock:verify', '模拟', key());
      await submit(await draft());
      const s = quotes.read(),
        next = structuredClone(s);
      (next[k] as unknown[]).pop();
      const before = raw();
      expect(() => write(s, next)).toThrow();
      expect(raw()).toBe(before);
    },
  );
  it.each([
    'quotes',
    'decisions',
    'history',
    'requests',
    'batchEvents',
    'batchSubmissions',
  ] as const)('cannot overwrite %s', async (k) => {
    const q = await api().createQuote(input(), key());
    await api().verifyQuote(q.quote.id, 1, 'mock:verify', '模拟', key());
    await submit(await draft());
    const s = quotes.read(),
      next = structuredClone(s);
    Object.assign(next[k][0]!, { id: 'changed' });
    const before = raw();
    expect(() => write(s, next)).toThrow();
    expect(raw()).toBe(before);
  });
  it('rejects unaudited draft version edits and submitted batch mutations', async () => {
    const d = await draft(),
      s = quotes.read(),
      next = structuredClone(s);
    Object.assign(next.batches[0]!, { sharedReason: 'untracked' });
    expect(() => write(s, next)).toThrow();
    await submit(d);
    const before = quotes.read(),
      after = structuredClone(before);
    Object.assign(after.batches[0]!, { sharedReason: 'overwrite' });
    const stored = raw();
    expect(() => write(before, after)).toThrow();
    expect(raw()).toBe(stored);
  });
  it('quote reset requires explicit confirmation, retains other repositories and clears the complete batch aggregate', async () => {
    await submit(await draft());
    const before = raw(),
      source = JSON.stringify(sourcing.read());
    await expect(api().resetQuoteDemo(false)).rejects.toThrow();
    expect(raw()).toBe(before);
    await expect(api('u-proc').resetQuoteDemo(true)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await api().resetQuoteDemo(true);
    expect(quotes.read().batches).toEqual([]);
    expect(quotes.read().batchEvents).toEqual([]);
    expect(quotes.read().batchSubmissions).toEqual([]);
    expect(JSON.stringify(sourcing.read())).toBe(source);
  });
});
describe('current dependency versions and cross-module references', () => {
  it('a channel change invalidates preview; revalidation preserves disabled-channel historical recording', async () => {
    const d = await draft(),
      p = await preview(d),
      version = (await api().channelVersion('ch-1'))!;
    await api().toggleChannel('ch-1', version, 'disabled');
    const before = raw();
    await expect(
      api().submitBulkBatch(d.batch.id, d.batch.version, p.token, true, key()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(raw()).toBe(before);
    const fresh = await preview(d);
    expect(
      fresh.rows[0]?.warnings.some((w) => w.message.includes('停用')),
    ).toBe(true);
    expect((await submit(d)).mappings).toHaveLength(1);
  });
  it('new batch edits invalidate a prior preview and preserve the saved draft', async () => {
    const d = await draft(),
      p = await preview(d);
    await api().updateBulkDraft(
      d.batch.id,
      d.batch.version,
      {
        ...edit(d, []),
        items: d.batch.items.map((i) => ({
          itemId: i.itemId,
          proposedQuoteInput: {
            ...i.proposedQuoteInput,
            discount: discountBps(7500),
          },
        })),
      },
      key(),
    );
    const before = raw();
    await expect(
      api().submitBulkBatch(d.batch.id, d.batch.version, p.token, true, key()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(raw()).toBe(before);
  });
  it('new quotes appear in channel, supplier, sourcing and analytics queries while source targets and statuses remain unchanged', async () => {
    const a = api(),
      src = JSON.stringify(sourcing.read()),
      ch = JSON.stringify(channels.read()),
      sp = JSON.stringify(suppliers.read()),
      r = await submit(
        await draft([input({ demandId: 'd-1', demandItemId: 'di-1' })]),
      );
    const id = r.mappings[0]!.quoteId;
    expect(
      (await a.queryQuotes({ demandItemId: 'di-1' })).rows.some(
        (q) => q.quote.id === id,
      ),
    ).toBe(true);
    expect(await a.getChannelResource('ch-1')).not.toBeNull();
    expect(
      (await a.queryQuotes({ channelId: 'ch-1' })).rows.some(
        (q) => q.quote.id === id,
      ),
    ).toBe(true);
    expect(
      (await a.queryQuotes({ supplierId: 's-1' })).rows.some(
        (q) => q.quote.id === id,
      ),
    ).toBe(true);
    expect(JSON.stringify(await a.queryProcurementAnalytics())).toContain(id);
    expect(JSON.stringify(sourcing.read())).toBe(src);
    expect(JSON.stringify(channels.read())).toBe(ch);
    expect(JSON.stringify(suppliers.read())).toBe(sp);
  });
  it.each(['draft', 'submitted', 'deleted-row-history'] as const)(
    'dynamic channel reset is blocked by %s batch reference',
    async (state) => {
      const a = api(),
        c = await a.createChannel({
          displayName: '模拟批次动态渠道',
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
      const d = await draft([input({ channelId: c.id })]);
      if (state === 'submitted') await submit(d);
      if (state === 'deleted-row-history')
        await a.updateBulkDraft(
          d.batch.id,
          d.batch.version,
          edit(d, []),
          key(),
        );
      const before = JSON.stringify(channels.read());
      await expect(a.resetChannelDemo(true)).rejects.toThrow(
        '先独立确认重置报价',
      );
      expect(JSON.stringify(channels.read())).toBe(before);
      await a.resetQuoteDemo(true);
      await a.resetChannelDemo(true);
    },
  );
  it.each(['draft', 'deleted-row-history'] as const)(
    'dynamic demand reset is blocked by %s',
    async (state) => {
      const a = api(),
        demand = await a.createSourcingDemand(
          {
            title: '模拟批次需求',
            description: '',
            sharedTitle: '模拟共享需求',
            sharedSummary: '模拟需求摘要',
            priority: 'normal',
            customerId: null,
            dueAt: null,
            items: [
              {
                modelId: 'm-seed-cn',
                requiredTpm: null,
                requiredRpm: null,
                requiredConcurrency: null,
                requiredTtftMs: null,
                targetPurchaseDiscount: discountBps(7000),
                requiredRegion: '',
                priority: 'normal',
              },
            ],
          },
          key(),
        );
      const item = (await a.getSourcingDemand(demand.id))!.items[0]!.item;
      const d = await draft([
        input({ demandId: demand.id, demandItemId: item.id }),
      ]);
      if (state === 'deleted-row-history')
        await a.updateBulkDraft(
          d.batch.id,
          d.batch.version,
          edit(d, []),
          key(),
        );
      const before = JSON.stringify(sourcing.read());
      await expect(a.resetSourcingDemo(true)).rejects.toThrow(
        '先独立确认重置报价',
      );
      expect(JSON.stringify(sourcing.read())).toBe(before);
    },
  );
});
describe('preview dependency and historical formal safeguards', () => {
  it('supplier status revision invalidates prior preview', async () => {
    const d = await draft(),
      p = await preview(d),
      s = (await api().getSupplier('s-1'))!.supplier;
    await api().setSupplierStatus('s-1', s.version!, 'disabled');
    const before = raw();
    await expect(
      api().submitBulkBatch(d.batch.id, d.batch.version, p.token, true, key()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(raw()).toBe(before);
    expect(
      (await preview(d)).rows[0]?.warnings.some((w) =>
        w.message.includes('停用'),
      ),
    ).toBe(true);
  });
  it('expired preview cannot cross a proposed validity boundary silently', async () => {
    const start = Date.now(),
      clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    try {
      const d = await draft([
          input({
            effectiveFrom: new Date(start + 1000).toISOString(),
            effectiveUntil: new Date(start + 2000).toISOString(),
          }),
        ]),
        p = await preview(d);
      clock.mockReturnValue(start + 1000);
      const before = raw();
      await expect(
        api().submitBulkBatch(
          d.batch.id,
          d.batch.version,
          p.token,
          true,
          key(),
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(raw()).toBe(before);
      expect((await submit(d)).mappings).toHaveLength(1);
    } finally {
      clock.mockRestore();
    }
  });
  it('two current formal prices and a promotion survive bulk creation; normal individual verify/confirm remains available', async () => {
    const a = api(),
      from = new Date(Date.now() - 86400000).toISOString();
    async function formal(n: number) {
      const q = await a.createQuote(
        input({ discount: discountBps(n), effectiveFrom: from }),
        key(),
      );
      await a.verifyQuote(q.quote.id, 1, 'mock:verify', '模拟', key());
      await a.confirmQuote(
        q.quote.id,
        2,
        'mock:contract',
        from,
        '模拟确认',
        key(),
      );
      return (await a.getQuote(q.quote.id))!;
    }
    const first = await formal(7200),
      second = await formal(7300);
    const before = quotes.read();
    const d = await draft([
      input({ previousQuoteId: first.row.quote.id }),
      input({
        sourceType: 'promotion',
        priceStatus: 'temporary',
        effectiveFrom: from,
        effectiveUntil: new Date(Date.now() + 86400000).toISOString(),
      }),
    ]);
    expect((await preview(d)).rows.every((r) => r.activeFormalCount >= 2)).toBe(
      true,
    );
    const r = await submit(d);
    expect(quotes.read().quotes.slice(0, before.quotes.length)).toEqual(
      before.quotes,
    );
    expect((await a.getQuote(first.row.quote.id))?.row.quote).toEqual(
      first.row.quote,
    );
    expect((await a.getQuote(second.row.quote.id))?.row.quote).toEqual(
      second.row.quote,
    );
    const fresh = (await a.getQuote(r.mappings[0]!.quoteId))!;
    await a.verifyQuote(fresh.row.quote.id, 1, 'mock:verify', '模拟', key());
    await a.confirmQuote(
      fresh.row.quote.id,
      2,
      'mock:contract',
      from,
      '模拟',
      key(),
    );
    expect((await a.getQuote(fresh.row.quote.id))?.row.quote.priceStatus).toBe(
      'effective',
    );
  });
  it('rechecks procurement maintenance after preview before any replay or submit', async () => {
    const a = api('u-proc'),
      d = await draft([input()], a),
      p = await preview(d, a),
      s = (await api().getSupplier('s-1'))!.supplier;
    await api().updateSupplier('s-1', s.version!, {
      name: s.name,
      shortCode: s.shortCode,
      supplierCategory: s.supplierCategory,
      cooperationStatus: s.cooperationStatus,
      ownerUserId: 'u-proc-alt',
    });
    const before = raw();
    expect(await a.getBulkBatch(d.batch.id)).toBeNull();
    await expect(
      a.submitBulkBatch(d.batch.id, d.batch.version, p.token, true, key()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(raw()).toBe(before);
  });
  it('supplier reset is blocked by a channel-free draft referencing a dynamic supplier', async () => {
    const a = api(),
      s = await a.createSupplier({
        name: '虚构批次供应商（模拟）',
        shortCode: 'MOCK-BULK',
        supplierCategory: 'third_party',
        cooperationStatus: 'potential',
        ownerUserId: 'u-proc',
      });
    await batch(a, s.id);
    await expect(a.resetSupplierDemo(true)).rejects.toThrow('批次引用');
    await a.resetQuoteDemo(true);
    await a.resetSupplierDemo(true);
  });
});
describe('explicit unknown-value and migration boundary', () => {
  it('shows proposed validity even without a historical reference', async () => {
    const start = Date.now();
    const d = await draft([
      input({ effectiveFrom: new Date(start + 86400000).toISOString() }),
    ]);
    const r = (await preview(d)).rows[0]!;
    expect(r.prior).toBeNull();
    expect(r.comparison).toBeNull();
    expect(r.proposedValidity).toBe('scheduled');
    expect(r.numericDifferenceBps).toBeNull();
  });
  it('rejects explicit null for non-nullable draft fields instead of silently inventing defaults', async () => {
    const d = await batch();
    for (const field of [
      'channelId',
      'sourceType',
      'priceStatus',
      'reason',
      'evidenceReference',
    ]) {
      const before = raw();
      await expect(
        api().updateBulkDraft(
          d.batch.id,
          d.batch.version,
          edit(d, [{ ...input(), [field]: null }]),
          key(),
        ),
      ).rejects.toThrow('结构无效');
      expect(raw()).toBe(before);
    }
  });
  it('rejects conflicting v1 metadata carrying v2 batch collections rather than discarding them', () => {
    const before = JSON.stringify({ ...quotes.read(), schemaVersion: 1 });
    storage.values.set(quoteStorageKey, before);
    expect(() => quotes.read()).toThrow('版本不兼容');
    expect(raw()).toBe(before);
  });
});
