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
  InquiryRecord,
  QuoteInput,
  QuoteState,
} from '../../src/domain/quotations';
import type { BulkBatchDetail } from '../../src/services/bulk-quotation-types';
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
  discount: discountBps(6200),
  priceStatus: 'reference',
  sourceType: 'supplier_submission',
  effectiveFrom: null,
  effectiveUntil: null,
  evidenceReference: 'mock:evidence:patch',
  supplierSubmitterReference: 'mock:contact',
  supplierQuotedAt: null,
  reason: '模拟询价关联专项复核',
  priceSpec: {
    currency: null,
    referencePriceSource: null,
    specification: null,
    rates: [],
  },
  ...extra,
});
async function inquiry(
  status: InquiryRecord['status'] = 'draft',
  channelId = 'ch-1',
) {
  const a = api(),
    i = await a.createInquiry(
      {
        channelId,
        demandItemId: null,
        responseDueAt: null,
        followUpNote: '模拟询价',
      },
      key(),
    );
  if (status !== 'draft')
    await a.updateInquiry(i.id, i.version, 'sent', '模拟已询价', key());
  if (status === 'quoted')
    await a.createQuote(linked({ ...i, version: 2 }), key());
  if (status === 'closed')
    await a.updateInquiry(i.id, 2, 'closed', '模拟关闭', key());
  return (await a.listInquiries()).find((v) => v.id === i.id)!;
}
const linked = (i: InquiryRecord, extra: Partial<QuoteInput> = {}) =>
  input({
    channelId: i.channelId,
    inquiryId: i.id,
    inquiryVersion: i.version,
    ...extra,
  });
async function draft(
  rows: readonly Partial<QuoteInput>[] = [input()],
  a = api(),
) {
  const d = await a.createBulkBatch(
    {
      supplierId: 's-1',
      sourceReference: 'mock:evidence:patch',
      sharedReason: '模拟专项复核',
    },
    key(),
  );
  return a.updateBulkDraft(
    d.batch.id,
    d.batch.version,
    {
      sourceReference: d.batch.sourceReference,
      sharedReason: d.batch.sharedReason,
      items: rows.map((v) => ({
        itemId: `item-${key()}`,
        proposedQuoteInput: v,
      })),
    },
    key(),
  );
}
const preview = (d: BulkBatchDetail, a = api()) =>
  a.previewBulkBatch(d.batch.id, d.batch.version);
const send = (d: BulkBatchDetail, token: string, request = key(), a = api()) =>
  a.submitBulkBatch(d.batch.id, d.batch.version, token, true, request);
const raw = () => storage.getItem(quoteStorageKey);
const snapshot = () => ({ raw: raw(), writes: storage.writes });
const unchanged = (before: ReturnType<typeof snapshot>) => {
  expect(raw()).toBe(before.raw);
  expect(storage.writes).toBe(before.writes);
};
const replies = (s: QuoteState, id: string) =>
  s.history.filter(
    (e) =>
      e.targetType === 'inquiry' &&
      e.targetId === id &&
      e.action === 'reply_recorded',
  );
const write = (before: QuoteState, next: QuoteState) =>
  quotes.write(before, next, channels, suppliers, sourcing);
beforeEach(() => {
  storage = new Memory();
  suppliers = new SupplierRepository(storage);
  channels = new ChannelRepository(storage);
  sourcing = new SourcingRepository(storage);
  quotes = new QuoteRepository(storage);
});
describe('accepted Stage 05B inquiry semantics', () => {
  it('single-quote API accepts multiple quotes for the same inquiry without repeated reply updates', async () => {
    const i = await inquiry('sent'),
      a = api();
    const first = await a.createQuote(linked(i), key());
    const received = (await a.listInquiries()).find((v) => v.id === i.id)!;
    expect(received).toEqual({
      ...i,
      status: 'quoted',
      version: i.version + 1,
      updatedAt: received.updatedAt,
    });
    const second = await a.createQuote(
      linked(received, { discount: discountBps(6300) }),
      key(),
    );
    expect(second.quote.id).not.toBe(first.quote.id);
    expect((await a.listInquiries()).find((v) => v.id === i.id)).toEqual(
      received,
    );
    expect(replies(quotes.read(), i.id)).toHaveLength(1);
    expect(
      quotes.read().quotes.filter((q) => q.inquiryId === i.id),
    ).toHaveLength(2);
  });
  it.each(['draft', 'sent', 'quoted'] as const)(
    'bulk repeated inquiry in %s matches single-entry state/version/audit semantics',
    async (status) => {
      const i = await inquiry(status),
        d = await draft([
          linked(i),
          linked(i, { discount: discountBps(6400) }),
        ]),
        p = await preview(d),
        before = quotes.read();
      expect(p.canSubmit).toBe(true);
      const writes = storage.writes,
        r = await send(d, p.token),
        after = quotes.read();
      expect(storage.writes - writes).toBe(1);
      expect(r.mappings).toHaveLength(2);
      const current = after.inquiries.find((v) => v.id === i.id)!;
      expect(current).toEqual({
        ...i,
        status: 'quoted',
        version: i.version + (status === 'quoted' ? 0 : 1),
        updatedAt: status === 'quoted' ? i.updatedAt : r.submittedAt,
      });
      const added = after.history
        .slice(before.history.length)
        .filter((e) => e.targetType === 'inquiry');
      expect(added).toHaveLength(status === 'quoted' ? 0 : 1);
      if (status !== 'quoted')
        expect(added[0]).toMatchObject({
          targetId: i.id,
          action: 'reply_recorded',
          actorUserId: 'u-ops',
          occurredAt: r.submittedAt,
          changes: [{ field: 'status', before: status, after: 'quoted' }],
        });
      expect(
        after.quotes.slice(before.quotes.length).map((q) => q.inquiryId),
      ).toEqual([i.id, i.id]);
      expect(after.decisions).toEqual(before.decisions);
    },
  );
  it('three rows referencing two inquiries update and audit each distinct inquiry once in one write', async () => {
    const first = await inquiry('sent'),
      second = await inquiry('draft', 'ch-2'),
      d = await draft([
        linked(first),
        linked(first, { discount: discountBps(6500) }),
        linked(second),
      ]),
      p = await preview(d),
      before = quotes.read(),
      writes = storage.writes;
    const r = await send(d, p.token),
      after = quotes.read();
    expect(storage.writes - writes).toBe(1);
    expect(after.revision).toBe(before.revision + 1);
    expect(r.mappings.map((m) => m.itemId)).toEqual(
      d.batch.items.map((i) => i.itemId),
    );
    for (const i of [first, second]) {
      expect(after.inquiries.find((v) => v.id === i.id)).toMatchObject({
        status: 'quoted',
        version: i.version + 1,
        updatedAt: r.submittedAt,
      });
      expect(replies(after, i.id)).toHaveLength(1);
    }
    for (const m of r.mappings) {
      const item = d.batch.items.find((i) => i.itemId === m.itemId)!;
      expect(after.quotes.find((q) => q.id === m.quoteId)).toMatchObject({
        channelId: item.channelId,
        inquiryId: item.proposedQuoteInput.inquiryId,
        confirmedAt: null,
      });
      expect(
        after.history
          .slice(before.history.length)
          .filter((e) => e.targetType === 'quote' && e.targetId === m.quoteId),
      ).toHaveLength(1);
    }
    expect(after.batches.find((b) => b.id === d.batch.id)).toMatchObject({
      status: 'submitted',
      submittedBy: r.actorUserId,
      submittedAt: r.submittedAt,
    });
    expect(after.batchEvents.at(-1)).toMatchObject({
      action: 'submitted',
      quoteIds: r.mappings.map((m) => m.quoteId),
      requestId: r.requestId,
    });
    expect(after.batchSubmissions.at(-1)).toEqual(r);
    expect(after.requests.at(-1)).toMatchObject({
      id: `u-ops:${r.requestId}`,
      operation: 'bulk:submit',
      resultId: r.id,
    });
  });
  it.each(['closed', 'stale-row', 'invalid-row'] as const)(
    '%s prevents all quotes, inquiry updates, audits and receipts',
    async (failure) => {
      const first = await inquiry('sent'),
        second = await inquiry(
          failure === 'closed' ? 'closed' : 'sent',
          'ch-2',
        );
      const bad = linked(
        second,
        failure === 'stale-row'
          ? { inquiryVersion: second.version - 1 }
          : failure === 'invalid-row'
            ? { discount: 10001 as QuoteInput['discount'] }
            : {},
      );
      const d = await draft([linked(first), bad]),
        p = await preview(d),
        before = snapshot();
      expect(p.canSubmit).toBe(false);
      expect(p.rows[1]?.errors[0]?.field).toBe(
        failure === 'closed'
          ? 'inquiryId'
          : failure === 'stale-row'
            ? 'inquiryVersion'
            : 'discount',
      );
      await expect(send(d, p.token)).rejects.toMatchObject({
        code: 'VALIDATION',
      });
      unchanged(before);
    },
  );
  it.each(['sent', 'closed'] as const)(
    'inquiry changed to %s after preview invalidates token without touching other inquiry',
    async (status) => {
      const first = await inquiry('sent'),
        second = await inquiry(),
        d = await draft([linked(first), linked(second)]),
        p = await preview(d);
      await api().updateInquiry(
        second.id,
        second.version,
        status,
        '模拟预览后跟进',
        key(),
      );
      const before = snapshot();
      await expect(send(d, p.token)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      unchanged(before);
      const fresh = await preview(d);
      expect(fresh.canSubmit).toBe(false);
      expect(fresh.rows[1]?.errors[0]?.field).toBe(
        status === 'closed' ? 'inquiryId' : 'inquiryVersion',
      );
    },
  );
  it('storage failure preserves inquiry versions and all collections, then same request retries once', async () => {
    const i = await inquiry('sent'),
      d = await draft([linked(i), linked(i)]),
      p = await preview(d),
      request = key(),
      before = snapshot();
    storage.fail = true;
    await expect(send(d, p.token, request)).rejects.toMatchObject({
      code: 'STORAGE',
    });
    unchanged(before);
    storage.fail = false;
    const result = await send(d, p.token, request),
      received = quotes.read();
    expect(replies(received, i.id)).toHaveLength(1);
    expect(received.inquiries.find((v) => v.id === i.id)?.version).toBe(
      i.version + 1,
    );
    expect(received.batchSubmissions).toEqual([result]);
    const saved = snapshot();
    expect(await send(d, p.token, request)).toEqual(result);
    unchanged(saved);
  });
});
describe('aggregate atomicity and immutable receipts', () => {
  it.each(['missing-receipt', 'missing-quote', 'draft-with-receipt'] as const)(
    'repository validation rejects %s before persistence',
    async (kind) => {
      const d = await draft(),
        p = await preview(d);
      await send(d, p.token);
      const s = quotes.read();
      const next: QuoteState =
        kind === 'missing-receipt'
          ? { ...s, batchSubmissions: [] }
          : kind === 'missing-quote'
            ? {
                ...s,
                quotes: s.quotes.filter(
                  (q) =>
                    !s.batchSubmissions[0]!.mappings.some(
                      (m) => m.quoteId === q.id,
                    ),
                ),
              }
            : {
                ...s,
                batches: s.batches.map((b) => ({
                  ...b,
                  status: 'draft',
                  submittedAt: null,
                  submittedBy: null,
                })),
              };
      const before = snapshot();
      expect(() =>
        quotes.validate(next, channels, suppliers, sourcing),
      ).toThrow();
      expect(() => write(s, next)).toThrow();
      unchanged(before);
    },
  );
  it('a held v2 draft snapshot cannot overwrite a later valid quote write', async () => {
    const d = await draft(),
      stale = quotes.read();
    await api().createQuote(input(), key());
    const before = snapshot();
    expect(() => write(stale, { ...stale })).toThrow('报价数据已变化');
    unchanged(before);
    expect(quotes.read().batches.find((b) => b.id === d.batch.id)?.status).toBe(
      'draft',
    );
  });
  it('two adapter clients submitting one preview with different request IDs produce one receipt and one conflict', async () => {
    const d = await draft(),
      p = await preview(d),
      a = api(),
      b = api(),
      writes = storage.writes;
    const results = await Promise.allSettled([
      send(d, p.token, key(), a),
      send(d, p.token, key(), b),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(results[1]).toMatchObject({
      status: 'rejected',
      reason: { code: 'CONFLICT' },
    });
    expect(storage.writes - writes).toBe(1);
    expect(quotes.read().batchSubmissions).toHaveLength(1);
  });
  it('two adapter clients retrying the identical request share the first complete receipt', async () => {
    const d = await draft([input(), input()]),
      p = await preview(d),
      request = key(),
      writes = storage.writes;
    const [first, second] = await Promise.all([
      send(d, p.token, request, api()),
      send(d, p.token, request, api()),
    ]);
    expect(second).toEqual(first);
    expect(storage.writes - writes).toBe(1);
    expect(quotes.read().batchSubmissions).toEqual([first]);
  });
  it('successful result ignored by caller is replayed from storage after adapter/repository reconstruction', async () => {
    const d = await draft([input(), input()]),
      p = await preview(d),
      request = key();
    await send(d, p.token, request);
    const receipt = structuredClone(quotes.read().batchSubmissions[0]!),
      before = snapshot();
    quotes = new QuoteRepository(storage);
    const replay = await send(d, p.token, request);
    expect(replay).toEqual(receipt);
    expect(Object.keys(replay).sort()).toEqual(
      [
        'id',
        'batchId',
        'actorUserId',
        'submittedAt',
        'requestId',
        'result',
        'mappings',
      ].sort(),
    );
    unchanged(before);
  });
  it.each(['version', 'token', 'confirmed', 'batch'] as const)(
    'same request with changed %s conflicts without writes',
    async (field) => {
      const d = await draft(),
        other = await draft(),
        p = await preview(d),
        request = key();
      await send(d, p.token, request);
      const before = snapshot();
      await expect(
        api().submitBulkBatch(
          field === 'batch' ? other.batch.id : d.batch.id,
          field === 'version' ? d.batch.version + 1 : d.batch.version,
          field === 'token' ? p.token + 'changed' : p.token,
          field !== 'confirmed',
          request,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      unchanged(before);
    },
  );
});
describe('fresh preview dependencies and authorized replay', () => {
  it('formal confirmation of selected reference invalidates preview and revalidation reflects its decision version', async () => {
    const a = api(),
      q = await a.createQuote(input(), key());
    await a.verifyQuote(q.quote.id, 1, 'mock:verify', '模拟来源核验', key());
    const d = await draft([input({ previousQuoteId: q.quote.id })]),
      p = await preview(d);
    expect(p.rows[0]?.priorVersion).toBe(2);
    await a.confirmQuote(
      q.quote.id,
      2,
      'mock:contract',
      new Date(Date.now() - 86400000).toISOString(),
      '模拟正式确认',
      key(),
    );
    const before = snapshot();
    await expect(send(d, p.token)).rejects.toMatchObject({ code: 'CONFLICT' });
    unchanged(before);
    const fresh = await preview(d);
    expect(fresh.rows[0]?.priorVersion).toBe(3);
    expect(fresh.rows[0]?.prior?.priceStatus).toBe('effective');
    expect(fresh.rows[0]?.activeFormalCount).toBe(
      p.rows[0]!.activeFormalCount + 1,
    );
  });
  it.each(['start', 'end'] as const)(
    'crossing proposed %s boundary invalidates preview with unchanged revisions',
    async (boundary) => {
      const now = Date.now(),
        clock = vi.spyOn(Date, 'now').mockReturnValue(now);
      try {
        const d = await draft([
            input({
              sourceType: 'promotion',
              priceStatus: 'temporary',
              effectiveFrom: new Date(
                now + (boundary === 'start' ? 1000 : -1000),
              ).toISOString(),
              effectiveUntil: new Date(now + 2000).toISOString(),
            }),
          ]),
          p = await preview(d),
          before = snapshot();
        clock.mockReturnValue(now + (boundary === 'start' ? 1000 : 2000));
        await expect(send(d, p.token)).rejects.toMatchObject({
          code: 'CONFLICT',
        });
        unchanged(before);
        expect((await preview(d)).rows[0]?.proposedValidity).toBe(
          boundary === 'start' ? 'in_period' : 'expired',
        );
      } finally {
        clock.mockRestore();
      }
    },
  );
  it('sourcing revision invalidates preview even when quote revision did not change', async () => {
    const d = await draft(),
      p = await preview(d),
      s = (await api().getSourcingDemand('d-1'))!;
    await api().progressSourcing(
      'd-1',
      s.demand.version,
      'closed',
      '模拟资源预览后关闭',
    );
    const before = snapshot();
    await expect(send(d, p.token)).rejects.toMatchObject({ code: 'CONFLICT' });
    unchanged(before);
  });
  it.each([
    'domain',
    'role',
    'revoked',
    'maintenance',
    'deleted-row-scope',
  ] as const)(
    'successful replay cannot bypass changed %s authorization',
    async (changed) => {
      let active = true;
      const original = api('u-proc', undefined, () => active),
        mixed = changed === 'domain' || changed === 'deleted-row-scope';
      let d = await draft(
        mixed ? [input(), input({ channelId: 'ch-5' })] : [input()],
        original,
      );
      if (changed === 'deleted-row-scope')
        d = await original.updateBulkDraft(
          d.batch.id,
          d.batch.version,
          {
            sourceReference: d.batch.sourceReference,
            sharedReason: d.batch.sharedReason,
            items: [
              { itemId: d.batch.items[0]!.itemId, proposedQuoteInput: input() },
            ],
          },
          key(),
        );
      const p = await preview(d, original),
        request = key();
      await send(d, p.token, request, original);
      let retry = original;
      if (changed === 'domain' || changed === 'deleted-row-scope')
        retry = api('u-proc', 'domestic');
      if (changed === 'role') retry = api('u-sales');
      if (changed === 'revoked') active = false;
      if (changed === 'maintenance') {
        const s = (await api().getSupplier('s-1'))!.supplier;
        await api().updateSupplier('s-1', s.version!, {
          name: s.name,
          shortCode: s.shortCode,
          supplierCategory: s.supplierCategory,
          cooperationStatus: s.cooperationStatus,
          ownerUserId: 'u-proc-alt',
        });
      }
      const before = snapshot();
      await expect(send(d, p.token, request, retry)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      unchanged(before);
      if (changed !== 'revoked' && changed !== 'role')
        expect(await retry.getBulkBatch(d.batch.id)).toBeNull();
    },
  );
  it('supplier and channel revisions each invalidate preview without quote writes', async () => {
    const d = await draft(),
      p = await preview(d),
      v = (await api().channelVersion('ch-1'))!;
    await api().toggleChannel('ch-1', v, 'disabled');
    let before = snapshot();
    await expect(send(d, p.token)).rejects.toMatchObject({ code: 'CONFLICT' });
    unchanged(before);
    const fresh = await preview(d),
      s = (await api().getSupplier('s-1'))!.supplier;
    await api().setSupplierStatus('s-1', s.version!, 'disabled');
    before = snapshot();
    await expect(send(d, fresh.token)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    unchanged(before);
  });
});
describe('additional replay identity and time-state boundaries', () => {
  it('another authorized actor cannot replay the original actor request as their own', async () => {
    const d = await draft([input()], api('u-proc')),
      p = await preview(d, api('u-proc')),
      request = key();
    await send(d, p.token, request, api('u-proc'));
    const before = snapshot();
    await expect(send(d, p.token, request, api('u-ops'))).rejects.toMatchObject(
      { code: 'CONFLICT' },
    );
    unchanged(before);
  });
  it('request ID reused for another operation is refused without an extra batch', async () => {
    const d = await draft(),
      p = await preview(d),
      request = key();
    await send(d, p.token, request);
    const before = snapshot();
    await expect(
      api().createBulkBatch(
        {
          supplierId: 's-1',
          sourceReference: 'mock:evidence:patch',
          sharedReason: '模拟',
        },
        request,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    unchanged(before);
  });
  it('expiration of an unselected current formal price invalidates preview with no repository revision change', async () => {
    const now = Date.now(),
      a = api(),
      q = await a.createQuote(
        input({
          effectiveFrom: new Date(now - 86400000).toISOString(),
          effectiveUntil: new Date(now + 10000).toISOString(),
        }),
        key(),
      );
    await a.verifyQuote(q.quote.id, 1, 'mock:verify', '模拟', key());
    await a.confirmQuote(
      q.quote.id,
      2,
      'mock:contract',
      q.quote.effectiveFrom!,
      '模拟',
      key(),
    );
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const d = await draft(),
        p = await preview(d),
        before = snapshot();
      expect(p.rows[0]?.prior).toBeNull();
      clock.mockReturnValue(now + 10000);
      await expect(send(d, p.token)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      unchanged(before);
      const fresh = await preview(d);
      expect(fresh.rows[0]?.proposedValidity).toBe(p.rows[0]?.proposedValidity);
      expect(fresh.rows[0]?.activeFormalCount).toBe(
        p.rows[0]!.activeFormalCount - 1,
      );
    } finally {
      clock.mockRestore();
    }
  });
});
