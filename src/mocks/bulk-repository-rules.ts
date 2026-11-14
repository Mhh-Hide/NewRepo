import type { QuoteState, QuoteInput } from '../domain/quotations';
import { quoteFields } from './quote-command';
export const bulkObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const date = (v: unknown) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));
const strings = (v: unknown) =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');
export function draftShape(v: unknown): v is Partial<QuoteInput> {
  if (
    !bulkObject(v) ||
    Object.keys(v).some(
      (k) => !quoteFields.includes(k as (typeof quoteFields)[number]),
    )
  )
    return false;
  for (const [k, x] of Object.entries(v)) {
    if (k === 'discount' || k === 'inquiryVersion') {
      if (
        !(x === null && k === 'inquiryVersion') &&
        (typeof x !== 'number' || !Number.isFinite(x))
      )
        return false;
    } else if (k === 'priceSpec') {
      if (
        !bulkObject(x) ||
        !['currency', 'referencePriceSource', 'specification'].every(
          (n) => x[n] === null || typeof x[n] === 'string',
        ) ||
        !Array.isArray(x.rates) ||
        !x.rates.every(
          (r) =>
            bulkObject(r) &&
            typeof r.dimension === 'string' &&
            typeof r.quantity === 'number' &&
            Number.isFinite(r.quantity) &&
            typeof r.unit === 'string' &&
            (r.amount === null || typeof r.amount === 'string'),
        )
      )
        return false;
    } else if (x === null) {
      if (
        ![
          'demandId',
          'demandItemId',
          'inquiryId',
          'previousQuoteId',
          'effectiveFrom',
          'effectiveUntil',
          'supplierQuotedAt',
          'supplierSubmitterReference',
        ].includes(k)
      )
        return false;
    } else if (typeof x !== 'string') return false;
  }
  return true;
}
export function bulkShape(v: Record<string, unknown>): boolean {
  if (
    !Array.isArray(v.batches) ||
    !Array.isArray(v.batchEvents) ||
    !Array.isArray(v.batchSubmissions)
  )
    return false;
  if (
    !v.batches.every(
      (b) =>
        bulkObject(b) &&
        [
          'id',
          'batchNo',
          'supplierId',
          'createdBy',
          'sourceReference',
          'sharedReason',
        ].every((k) => typeof b[k] === 'string') &&
        ['draft', 'submitted'].includes(String(b.status)) &&
        date(b.createdAt) &&
        date(b.updatedAt) &&
        Number.isSafeInteger(b.version) &&
        Number(b.version) > 0 &&
        (b.submittedBy === null || typeof b.submittedBy === 'string') &&
        (b.submittedAt === null || date(b.submittedAt)) &&
        Array.isArray(b.items) &&
        b.items.every(
          (i) =>
            bulkObject(i) &&
            ['itemId', 'batchId', 'channelId'].every(
              (k) => typeof i[k] === 'string',
            ) &&
            (i.previousQuoteId === null ||
              typeof i.previousQuoteId === 'string') &&
            date(i.createdAt) &&
            date(i.updatedAt) &&
            draftShape(i.proposedQuoteInput),
        ),
    )
  )
    return false;
  if (
    !v.batchEvents.every(
      (e) =>
        bulkObject(e) &&
        ['id', 'batchId', 'actorUserId', 'reason', 'requestId'].every(
          (k) => typeof e[k] === 'string',
        ) &&
        ['created', 'edited', 'submitted'].includes(String(e.action)) &&
        date(e.occurredAt) &&
        (e.beforeVersion === null || Number.isSafeInteger(e.beforeVersion)) &&
        Number.isSafeInteger(e.afterVersion) &&
        [
          'addedItemIds',
          'removedItemIds',
          'quoteIds',
          'channelIds',
          'demandIds',
          'demandItemIds',
        ].every((k) => strings(e[k])) &&
        Array.isArray(e.changes) &&
        e.changes.every(
          (c) =>
            bulkObject(c) &&
            (c.itemId === null || typeof c.itemId === 'string') &&
            typeof c.field === 'string' &&
            [c.before, c.after].every(
              (x) => x === null || typeof x === 'string',
            ),
        ),
    )
  )
    return false;
  return v.batchSubmissions.every(
    (r) =>
      bulkObject(r) &&
      ['id', 'batchId', 'actorUserId', 'requestId'].every(
        (k) => typeof r[k] === 'string',
      ) &&
      date(r.submittedAt) &&
      r.result === 'succeeded' &&
      Array.isArray(r.mappings) &&
      r.mappings.every(
        (m) =>
          bulkObject(m) &&
          typeof m.itemId === 'string' &&
          typeof m.quoteId === 'string',
      ),
  );
}
export function bulkReferences(s: Pick<QuoteState, 'batches' | 'batchEvents'>) {
  return {
    suppliers: s.batches.map((b) => b.supplierId),
    channels: [
      ...s.batches.flatMap((b) => b.items.map((i) => i.channelId)),
      ...s.batchEvents.flatMap((e) => e.channelIds),
    ].filter(Boolean),
    demands: [
      ...s.batches.flatMap((b) =>
        b.items.flatMap((i) =>
          i.proposedQuoteInput.demandId ? [i.proposedQuoteInput.demandId] : [],
        ),
      ),
      ...s.batchEvents.flatMap((e) => e.demandIds),
    ],
    demandItems: [
      ...s.batches.flatMap((b) =>
        b.items.flatMap((i) =>
          i.proposedQuoteInput.demandItemId
            ? [i.proposedQuoteInput.demandItemId]
            : [],
        ),
      ),
      ...s.batchEvents.flatMap((e) => e.demandItemIds),
    ],
  };
}
