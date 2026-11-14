import { bulkShape, bulkReferences } from './bulk-repository-rules';
import { fixture } from './data';
import { appendQuote } from '../domain/rules';
import { validateStore } from '../domain/validation';
import {
  inquiryStatusLabels,
  quoteSourceLabels,
  validatePriceSpec,
} from '../domain/quotations';
import type { QuoteState, ManagedQuote } from '../domain/quotations';
import { quoteStatusLabels } from '../domain/statuses';
import type { StoragePort, SupplierRepository } from './supplier-repository';
import type { ChannelRepository } from './channel-repository';
import type { SourcingRepository } from './sourcing-repository';
import { SupplierError } from '../services/supplier-types';
export const quoteStorageKey = 'maas-quote-demo-v1';
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: Record<string, unknown>, ks: readonly string[]) =>
  ks.every((k) => typeof v[k] === 'string');
const nullable = (v: Record<string, unknown>, ks: readonly string[]) =>
  ks.every((k) => v[k] === null || typeof v[k] === 'string');
const date = (v: unknown) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));
function shape(v: unknown): v is QuoteState {
  if (
    !obj(v) ||
    ![1, 2].includes(v.schemaVersion as number) ||
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 0 ||
    !Array.isArray(v.quotes) ||
    !Array.isArray(v.inquiries) ||
    !Array.isArray(v.decisions) ||
    !Array.isArray(v.history) ||
    !Array.isArray(v.requests)
  )
    return false;
  if (
    !v.quotes.every(
      (q) =>
        obj(q) &&
        q.source === 'mock' &&
        strings(q, ['id', 'channelId', 'reason', 'submittedBy']) &&
        nullable(q, [
          'inquiryId',
          'demandId',
          'demandItemId',
          'previousQuoteId',
          'recordedBy',
          'supplierSubmitterReference',
          'supplierQuotedAt',
          'effectiveFrom',
          'effectiveUntil',
          'evidenceReference',
          'confirmedBy',
          'confirmedAt',
        ]) &&
        date(q.createdAt) &&
        typeof q.discount === 'number' &&
        Number.isSafeInteger(q.discount) &&
        q.discount >= 0 &&
        q.discount <= 10000 &&
        typeof q.priceStatus === 'string' &&
        Object.hasOwn(quoteStatusLabels, q.priceStatus) &&
        typeof q.sourceType === 'string' &&
        Object.hasOwn(quoteSourceLabels, q.sourceType) &&
        obj(q.priceSpec),
    )
  )
    return false;
  for (const q of v.quotes) {
    try {
      validatePriceSpec((q as ManagedQuote).priceSpec);
    } catch {
      return false;
    }
  }
  if (
    !v.inquiries.every(
      (i) =>
        obj(i) &&
        strings(i, ['id', 'channelId', 'requestedBy', 'followUpNote']) &&
        nullable(i, ['demandItemId', 'responseDueAt']) &&
        date(i.requestedAt) &&
        date(i.createdAt) &&
        date(i.updatedAt) &&
        Number.isSafeInteger(i.version) &&
        Number(i.version) > 0 &&
        typeof i.status === 'string' &&
        Object.hasOwn(inquiryStatusLabels, i.status),
    )
  )
    return false;
  if (
    !v.decisions.every(
      (d) =>
        obj(d) &&
        strings(d, [
          'id',
          'quoteId',
          'actorUserId',
          'evidenceReference',
          'reason',
        ]) &&
        nullable(d, ['effectiveFrom']) &&
        date(d.occurredAt) &&
        ['verify', 'confirm'].includes(String(d.kind)),
    )
  )
    return false;
  if (
    !v.history.every(
      (e) =>
        obj(e) &&
        strings(e, ['id', 'targetId', 'action', 'actorUserId', 'reason']) &&
        ['quote', 'inquiry'].includes(String(e.targetType)) &&
        date(e.occurredAt) &&
        Array.isArray(e.changes) &&
        e.changes.every(
          (c) =>
            obj(c) &&
            typeof c.field === 'string' &&
            [c.before, c.after].every(
              (x) =>
                x === null ||
                typeof x === 'string' ||
                (typeof x === 'number' && Number.isFinite(x)),
            ),
        ),
    )
  )
    return false;
  return (
    (v.schemaVersion === 1
      ? ['batches', 'batchEvents', 'batchSubmissions'].every(
          (k) => v[k] === undefined,
        )
      : bulkShape(v)) &&
    v.requests.every(
      (r) =>
        obj(r) &&
        strings(r, [
          'id',
          'actorUserId',
          'operation',
          'fingerprint',
          'resultId',
        ]),
    )
  );
}
function seed(): QuoteState {
  return {
    schemaVersion: 2,
    batches: [],
    batchEvents: [],
    batchSubmissions: [],
    revision: 0,
    quotes: fixture.quotes.map((q) => ({
      ...q,
      inquiryId: null,
      demandId: null,
      demandItemId: null,
      recordedBy: null,
      supplierSubmitterReference: null,
      supplierQuotedAt: null,
      priceSpec: {
        currency: null,
        referencePriceSource: null,
        specification: null,
        rates: [],
      },
    })),
    inquiries: [],
    decisions: [],
    history: [],
    requests: [],
  };
}
export class QuoteRepository {
  constructor(private storage: StoragePort) {}
  read(): QuoteState {
    try {
      const raw = this.storage.getItem(quoteStorageKey);
      if (raw === null) return seed();
      const v: unknown = JSON.parse(raw);
      if (!shape(v)) throw Error();
      const version = Number(v.schemaVersion);
      return structuredClone(
        version === 1
          ? {
              ...v,
              schemaVersion: 2,
              batches: [],
              batchEvents: [],
              batchSubmissions: [],
            }
          : v,
      );
    } catch {
      throw new SupplierError(
        'STORAGE',
        '报价演示数据读取失败或版本不兼容；不会自动覆盖，请检查存储或明确重置。',
      );
    }
  }
  validate(
    s: QuoteState,
    channels: ChannelRepository,
    suppliers: SupplierRepository,
    sourcing: SourcingRepository,
  ) {
    if (!shape(s) || s.schemaVersion !== 2)
      throw new SupplierError('VALIDATION', '报价数据结构无效。');
    const c = channels.read(),
      d = sourcing.read();
    const errors = validateStore({
      ...fixture,
      suppliers: suppliers.read().suppliers,
      channels: c.channels,
      testTasks: c.tasks,
      demands: d.demands,
      demandItems: d.items,
      matches: d.matches,
      quotes: s.quotes,
    });
    let history: readonly ManagedQuote[] = [];
    for (const q of s.quotes) {
      try {
        appendQuote(history, q);
      } catch (e) {
        throw new SupplierError(
          'VALIDATION',
          e instanceof Error ? e.message : '报价历史无效',
        );
      }
      history = [...history, q];
      const channel = c.channels.find((c) => c.id === q.channelId);
      const item = d.items.find((i) => i.id === q.demandItemId);
      const inquiry = s.inquiries.find((i) => i.id === q.inquiryId);
      if (
        (q.demandId !== null && !d.demands.some((v) => v.id === q.demandId)) ||
        (q.demandItemId !== null &&
          (!item ||
            item.demandId !== q.demandId ||
            item.modelId !== channel?.modelId)) ||
        (q.inquiryId !== null &&
          (!inquiry ||
            inquiry.channelId !== q.channelId ||
            inquiry.demandItemId !== q.demandItemId))
      )
        throw new SupplierError(
          'VALIDATION',
          '报价需求、明细或询价关联不一致。',
        );
    }
    for (const i of s.inquiries) {
      const channel = c.channels.find((c) => c.id === i.channelId);
      if (
        !channel ||
        (i.demandItemId !== null &&
          !d.items.some(
            (v) => v.id === i.demandItemId && v.modelId === channel.modelId,
          ))
      )
        throw new SupplierError('VALIDATION', '询价渠道或需求明细引用无效。');
    }
    const ids = (values: readonly { readonly id: string }[]) =>
      new Set(values.map((v) => v.id)).size === values.length;
    if (
      ![s.inquiries, s.decisions, s.history, s.requests].every(ids) ||
      s.decisions.some((e) => !s.quotes.some((q) => q.id === e.quoteId)) ||
      s.history.some(
        (e) =>
          !(e.targetType === 'quote' ? s.quotes : s.inquiries).some(
            (v) => v.id === e.targetId,
          ),
      )
    )
      throw new SupplierError('VALIDATION', '询价、确认或历史关联不完整。');
    const unique = (xs: readonly string[]) => new Set(xs).size === xs.length;
    const refs = bulkReferences(s);
    if (
      ![
        s.batches.map((b) => b.id),
        s.batches.map((b) => b.batchNo),
        s.batchEvents.map((e) => e.id),
        s.batchSubmissions.map((r) => r.id),
        s.batchSubmissions.map((r) => r.batchId),
        s.batches.flatMap((b) => b.items.map((i) => i.itemId)),
        s.batchSubmissions.flatMap((r) => r.mappings.map((m) => m.quoteId)),
      ].every(unique) ||
      refs.suppliers.some(
        (id) => !suppliers.read().suppliers.some((v) => v.id === id),
      ) ||
      refs.channels.some((id) => !c.channels.some((v) => v.id === id)) ||
      refs.demands.some((id) => !d.demands.some((v) => v.id === id)) ||
      refs.demandItems.some((id) => !d.items.some((v) => v.id === id))
    )
      throw new SupplierError('VALIDATION', '批次身份或跨模块引用不完整。');
    for (const b of s.batches) {
      const receipt = s.batchSubmissions.find((r) => r.batchId === b.id);
      if (
        (b.status === 'submitted') !== !!receipt ||
        (b.status === 'draft' &&
          (b.submittedAt !== null || b.submittedBy !== null)) ||
        (b.status === 'submitted' && (!b.submittedAt || !b.submittedBy))
      )
        throw new SupplierError('VALIDATION', '批次提交状态与结果不一致。');
      for (const i of b.items) {
        const channel = c.channels.find((v) => v.id === i.channelId),
          input = i.proposedQuoteInput;
        if (
          i.batchId !== b.id ||
          i.channelId !== (input.channelId ?? '') ||
          i.previousQuoteId !== (input.previousQuoteId ?? null) ||
          (i.channelId && (!channel || channel.supplierId !== b.supplierId)) ||
          (i.previousQuoteId &&
            !s.quotes.some(
              (q) => q.id === i.previousQuoteId && q.channelId === i.channelId,
            )) ||
          (input.demandId && !d.demands.some((v) => v.id === input.demandId)) ||
          (input.demandItemId &&
            !d.items.some(
              (v) =>
                v.id === input.demandItemId &&
                v.demandId === input.demandId &&
                v.modelId === channel?.modelId,
            )) ||
          (input.inquiryId &&
            !s.inquiries.some(
              (v) =>
                v.id === input.inquiryId &&
                v.channelId === i.channelId &&
                v.demandItemId === (input.demandItemId ?? null),
            ))
        )
          throw new SupplierError('VALIDATION', '批次行关联不一致。');
      }
      if (
        receipt &&
        (receipt.actorUserId !== b.submittedBy ||
          receipt.submittedAt !== b.submittedAt ||
          receipt.mappings.length !== b.items.length ||
          !unique(receipt.mappings.map((m) => m.itemId)) ||
          receipt.mappings.some(
            (m) =>
              !b.items.some(
                (i) =>
                  i.itemId === m.itemId &&
                  s.quotes.some(
                    (q) => q.id === m.quoteId && q.channelId === i.channelId,
                  ),
              ),
          ) ||
          !s.requests.some(
            (r) =>
              r.id === `${receipt.actorUserId}:${receipt.requestId}` &&
              r.operation === 'bulk:submit' &&
              r.resultId === receipt.id,
          ))
      )
        throw new SupplierError('VALIDATION', '批次提交结果映射不完整。');
    }
    if (
      s.batchEvents.some(
        (e) =>
          !s.batches.some((b) => b.id === e.batchId) ||
          e.quoteIds.some((id) => !s.quotes.some((q) => q.id === id)),
      )
    )
      throw new SupplierError('VALIDATION', '批次历史关联不完整。');
    if (errors.length)
      throw new SupplierError(
        'VALIDATION',
        '报价关联校验失败：' + errors.join('; '),
      );
  }
  write(
    before: QuoteState,
    next: QuoteState,
    channels: ChannelRepository,
    suppliers: SupplierRepository,
    sourcing: SourcingRepository,
  ) {
    const current = this.read();
    this.validate(current, channels, suppliers, sourcing);
    this.validate(next, channels, suppliers, sourcing);
    if (JSON.stringify(current) !== JSON.stringify(before))
      throw new SupplierError('CONFLICT', '报价数据已变化，请重新加载。');
    const protectedCollections = [
      'quotes',
      'decisions',
      'history',
      'requests',
      'batchEvents',
      'batchSubmissions',
    ] as const;
    if (
      protectedCollections.some(
        (collection) =>
          next[collection].length < before[collection].length ||
          before[collection].some(
            (record, i) =>
              JSON.stringify(next[collection][i]) !== JSON.stringify(record),
          ),
      )
    )
      throw new SupplierError(
        'VALIDATION',
        '报价、确认、审计、幂等请求及批次历史只允许追加，不能覆盖或删除。',
      );
    for (const b of before.batches) {
      const after = next.batches.find((v) => v.id === b.id);
      if (
        !after ||
        b.supplierId !== after.supplierId ||
        b.batchNo !== after.batchNo ||
        b.createdAt !== after.createdAt ||
        b.createdBy !== after.createdBy ||
        (b.status === 'submitted' &&
          JSON.stringify(after) !== JSON.stringify(b)) ||
        (after &&
          JSON.stringify(after) !== JSON.stringify(b) &&
          (after.version !== b.version + 1 ||
            !next.batchEvents
              .slice(before.batchEvents.length)
              .some(
                (e) =>
                  e.batchId === b.id &&
                  e.beforeVersion === b.version &&
                  e.afterVersion === after.version &&
                  e.action ===
                    (after.status === 'submitted' ? 'submitted' : 'edited'),
              )))
      )
        throw new SupplierError(
          'VALIDATION',
          '已提交批次与结果不可修改，草稿不可删除身份。',
        );
    }
    try {
      this.storage.setItem(
        quoteStorageKey,
        JSON.stringify({ ...next, revision: before.revision + 1 }),
      );
    } catch {
      throw new SupplierError(
        'STORAGE',
        '报价保存失败，未提交报价、询价或确认的部分记录。',
      );
    }
  }
  reset(
    channels: ChannelRepository,
    suppliers: SupplierRepository,
    sourcing: SourcingRepository,
  ) {
    const next = seed();
    this.validate(next, channels, suppliers, sourcing);
    let revision = 0;
    try {
      revision = this.read().revision;
    } catch {
      /* Explicit confirmed recovery. */
    }
    try {
      this.storage.setItem(
        quoteStorageKey,
        JSON.stringify({ ...next, revision: revision + 1 }),
      );
    } catch {
      throw new SupplierError('STORAGE', '报价重置失败，其他模块未更改。');
    }
  }
}
export const quoteRepository = new QuoteRepository({
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
});
