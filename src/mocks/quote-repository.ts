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
    v.schemaVersion !== 1 ||
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
  return v.requests.every(
    (r) =>
      obj(r) &&
      strings(r, ['id', 'actorUserId', 'operation', 'fingerprint', 'resultId']),
  );
}
function seed(): QuoteState {
  return {
    schemaVersion: 1,
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
      return structuredClone(v);
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
    if (!shape(s)) throw new SupplierError('VALIDATION', '报价数据结构无效。');
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
    this.validate(next, channels, suppliers, sourcing);
    if (this.read().revision !== before.revision)
      throw new SupplierError('CONFLICT', '报价数据已变化，请重新加载。');
    if (
      before.quotes.some(
        (q, i) => JSON.stringify(next.quotes[i]) !== JSON.stringify(q),
      ) ||
      before.decisions.some(
        (e, i) => JSON.stringify(next.decisions[i]) !== JSON.stringify(e),
      ) ||
      before.history.some(
        (e, i) => JSON.stringify(next.history[i]) !== JSON.stringify(e),
      )
    )
      throw new SupplierError(
        'VALIDATION',
        '报价、确认和审计历史只允许追加，不能覆盖。',
      );
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
