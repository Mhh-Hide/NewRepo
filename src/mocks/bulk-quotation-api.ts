import type { AccessContext, PermissionAction } from '../auth/types';
import { can } from '../auth/policy';
import { canReadSupplierMaster } from '../auth/supplier-policy';
import type { BusinessDomain, Channel } from '../domain/entities';
import type {
  QuoteInput,
  ManagedQuote,
  QuoteState,
} from '../domain/quotations';
import type {
  BulkQuoteBatch,
  BulkQuoteEvent,
  BulkQuoteItem,
  BulkQuoteSubmission,
  BulkPreview,
  BulkIssue,
} from '../domain/bulk-quotations';
import type {
  BulkQuotationApi,
  BulkBatchDetail,
} from '../services/bulk-quotation-types';
import type { QuotationApi } from '../services/quotation-types';
import type { QuoteRepository } from './quote-repository';
import type { ChannelRepository } from './channel-repository';
import type { SupplierRepository } from './supplier-repository';
import type { SourcingRepository } from './sourcing-repository';
import { SupplierError } from '../services/supplier-types';
import { fixture } from './data';
import { draftShape } from './bulk-repository-rules';
import {
  prepareQuote,
  completeDraftQuote,
  stableFingerprint,
  quoteEvidence,
  quoteSpec,
  QuoteInputError,
  quoteFields,
} from './quote-command';
import { projectQuote, resolvedQuote } from './quotation-api';
import {
  compareAnalysis,
  isCurrentFormal,
  analysisValidity,
  completeness,
} from '../domain/procurement-analytics';
export function createBulkQuotationApi(
  ctx: AccessContext | null,
  domain: BusinessDomain | undefined,
  repo: QuoteRepository,
  channelRepo: ChannelRepository,
  suppliers: SupplierRepository,
  sourcing: SourcingRepository,
  channels: () => readonly Channel[],
  active: () => boolean,
  quotation: QuotationApi,
): BulkQuotationApi {
  const guard = (action: PermissionAction) => {
    if (
      !ctx ||
      !active() ||
      !ctx.domains.length ||
      !can(ctx, action) ||
      !can(ctx, 'quote:read')
    )
      throw new SupplierError(
        'FORBIDDEN',
        '当前身份或业务域无批量采购报价权限。',
      );
    return ctx;
  };
  const supplier = (id: string) => {
    const state = suppliers.read(),
      s = state.suppliers.find((v) => v.id === id);
    return s &&
      ctx &&
      (ctx.user.role !== 'Procurement' ||
        state.scopes.some(
          (scope) =>
            scope.supplierId === id &&
            scope.managementDomains.some((d) =>
              (domain ? [domain] : ctx.domains).includes(d),
            ),
        ) ||
        channels().some((c) => c.supplierId === id)) &&
      canReadSupplierMaster(
        ctx,
        s,
        state.scopes,
        state.maintenance,
        domain ? [domain] : ctx.domains,
        channels().some((c) => c.supplierId === id),
      )
      ? s
      : null;
  };
  const allowed = (b: BulkQuoteBatch) =>
    !!supplier(b.supplierId) &&
    repo
      .read()
      .batchEvents.filter((e) => e.batchId === b.id)
      .every((e) =>
        e.channelIds.every((id) =>
          channels().some((c) => c.id === id && c.supplierId === b.supplierId),
        ),
      ) &&
    b.items.every(
      (i) =>
        !i.channelId ||
        channels().some(
          (c) => c.id === i.channelId && c.supplierId === b.supplierId,
        ),
    );
  const find = (s: QuoteState, id: string) => {
    const b = s.batches.find((b) => b.id === id);
    if (!b || !allowed(b))
      throw new SupplierError(
        'FORBIDDEN',
        '批次不存在或无完整授权，请重新选择授权范围。',
      );
    return b;
  };
  const cleanInput = (input: Partial<QuoteInput>): Partial<QuoteInput> => {
    const v: Partial<QuoteInput> = structuredClone(input);
    return {
      ...v,
      ...(v.priceSpec ? { priceSpec: quoteSpec(v.priceSpec) } : {}),
    };
  };
  const projectBatch = (b: BulkQuoteBatch): BulkQuoteBatch => ({
    id: b.id,
    batchNo: b.batchNo,
    supplierId: b.supplierId,
    status: b.status,
    createdBy: b.createdBy,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    version: b.version,
    sourceReference: b.sourceReference,
    sharedReason: b.sharedReason,
    submittedBy: b.submittedBy,
    submittedAt: b.submittedAt,
    items: b.items.map((i) => ({
      itemId: i.itemId,
      batchId: i.batchId,
      channelId: i.channelId,
      previousQuoteId: i.previousQuoteId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      proposedQuoteInput: cleanInput(i.proposedQuoteInput),
    })),
  });
  const projectReceipt = (r: BulkQuoteSubmission): BulkQuoteSubmission => ({
    id: r.id,
    batchId: r.batchId,
    actorUserId: r.actorUserId,
    submittedAt: r.submittedAt,
    requestId: r.requestId,
    result: r.result,
    mappings: r.mappings.map((m) => ({ itemId: m.itemId, quoteId: m.quoteId })),
  });
  const detail = (s: QuoteState, b: BulkQuoteBatch): BulkBatchDetail => {
    const sp = supplier(b.supplierId)!;
    return {
      batch: projectBatch(b),
      supplier: { id: sp.id, name: sp.name, status: sp.status },
      history: s.batchEvents
        .filter((e) => e.batchId === b.id)
        .map((e) => ({
          id: e.id,
          batchId: e.batchId,
          action: e.action,
          actorUserId: e.actorUserId,
          occurredAt: e.occurredAt,
          reason: e.reason,
          requestId: e.requestId,
          beforeVersion: e.beforeVersion,
          afterVersion: e.afterVersion,
          addedItemIds: [...e.addedItemIds],
          removedItemIds: [...e.removedItemIds],
          quoteIds: [...e.quoteIds],
          channelIds: [...e.channelIds],
          demandIds: [...e.demandIds],
          demandItemIds: [...e.demandItemIds],
          changes: e.changes.map((c) => ({
            itemId: c.itemId,
            field: c.field,
            before: c.before,
            after: c.after,
          })),
        })),
      submission: s.batchSubmissions.find((r) => r.batchId === b.id)
        ? projectReceipt(s.batchSubmissions.find((r) => r.batchId === b.id)!)
        : null,
    };
  };
  const prior = (s: QuoteState, id: string) => {
    const q = s.quotes.find((q) => q.id === id);
    if (!q || !channels().some((c) => c.id === q.channelId))
      throw new SupplierError('FORBIDDEN', '参照报价不存在或无权访问。');
    return q;
  };
  const request = (
    s: QuoteState,
    key: string,
    op: string,
    payload: unknown,
  ) => {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new SupplierError('VALIDATION', '请求标识无效。');
    const r = s.requests.find((r) => r.id === `${ctx!.user.id}:${key}`);
    if (
      r &&
      (r.operation !== op || r.fingerprint !== stableFingerprint(payload))
    )
      throw new SupplierError(
        'CONFLICT',
        '请求标识已用于不同内容，请重新打开操作。',
      );
    return r;
  };
  const metadata = (input: {
    sourceReference: string;
    sharedReason: string;
  }) => {
    if (
      typeof input.sourceReference !== 'string' ||
      input.sourceReference.length > 155 ||
      typeof input.sharedReason !== 'string' ||
      input.sharedReason.length > 2000
    )
      throw new SupplierError('VALIDATION', '共同来源或说明字段无效。');
  };
  const event = (
    before: BulkQuoteBatch | null,
    after: BulkQuoteBatch,
    action: BulkQuoteEvent['action'],
    key: string,
    ids: readonly string[] = [],
  ): BulkQuoteEvent => {
    const changes: BulkQuoteEvent['changes'][number][] = [];
    for (const field of ['sourceReference', 'sharedReason', 'status'] as const)
      if (before?.[field] !== after[field])
        changes.push({
          itemId: null,
          field,
          before: before?.[field] ?? null,
          after: after[field],
        });
    for (const i of after.items) {
      const old = before?.items.find((v) => v.itemId === i.itemId);
      for (const field of quoteFields)
        if (
          stableFingerprint(old?.proposedQuoteInput[field]) !==
          stableFingerprint(i.proposedQuoteInput[field])
        )
          changes.push({
            itemId: i.itemId,
            field,
            before:
              old?.proposedQuoteInput[field] === undefined
                ? null
                : JSON.stringify(old.proposedQuoteInput[field]),
            after:
              i.proposedQuoteInput[field] === undefined
                ? null
                : JSON.stringify(i.proposedQuoteInput[field]),
          });
    }
    for (const i of before?.items ?? [])
      if (!after.items.some((v) => v.itemId === i.itemId))
        changes.push({
          itemId: i.itemId,
          field: 'removed',
          before: JSON.stringify(i.proposedQuoteInput),
          after: null,
        });
    const all = [...(before?.items ?? []), ...after.items];
    return {
      id: crypto.randomUUID(),
      batchId: after.id,
      action,
      actorUserId: ctx!.user.id,
      occurredAt: after.updatedAt,
      reason: after.sharedReason || '模拟批次操作',
      requestId: key,
      beforeVersion: before?.version ?? null,
      afterVersion: after.version,
      addedItemIds: after.items
        .filter((i) => !before?.items.some((v) => v.itemId === i.itemId))
        .map((i) => i.itemId),
      removedItemIds: (before?.items ?? [])
        .filter((i) => !after.items.some((v) => v.itemId === i.itemId))
        .map((i) => i.itemId),
      changes,
      quoteIds: [...ids],
      channelIds: [...new Set(all.map((i) => i.channelId).filter(Boolean))],
      demandIds: [
        ...new Set(
          all.flatMap((i) =>
            i.proposedQuoteInput.demandId
              ? [i.proposedQuoteInput.demandId]
              : [],
          ),
        ),
      ],
      demandItemIds: [
        ...new Set(
          all.flatMap((i) =>
            i.proposedQuoteInput.demandItemId
              ? [i.proposedQuoteInput.demandItemId]
              : [],
          ),
        ),
      ],
    };
  };
  const save = (
    s: QuoteState,
    next: QuoteState,
    key: string,
    op: string,
    payload: unknown,
    resultId: string,
  ) => {
    guard(
      op === 'bulk:create'
        ? 'bulk:create'
        : op === 'bulk:update'
          ? 'bulk:update'
          : 'bulk:submit',
    );
    repo.write(
      s,
      {
        ...next,
        requests: [
          ...s.requests,
          {
            id: `${ctx!.user.id}:${key}`,
            actorUserId: ctx!.user.id,
            operation: op,
            fingerprint: stableFingerprint(payload),
            resultId,
          },
        ],
      },
      channelRepo,
      suppliers,
      sourcing,
    );
  };
  const prepared = (
    s: QuoteState,
    b: BulkQuoteBatch,
    i: BulkQuoteItem,
    id: string,
    at: string,
  ) => {
    const c = channels().find(
      (c) => c.id === i.channelId && c.supplierId === b.supplierId,
    );
    if (!c)
      throw new QuoteInputError('channelId', '请选择本供应商的授权渠道。');
    const input = completeDraftQuote({
      ...i.proposedQuoteInput,
      evidenceReference:
        i.proposedQuoteInput.evidenceReference || b.sourceReference,
      reason: i.proposedQuoteInput.reason || b.sharedReason,
    });
    if (
      !can(
        ctx!,
        input.sourceType === 'correction' ? 'quote:correct' : 'quote:create',
      )
    )
      throw new SupplierError('FORBIDDEN', '无此报价录入权限。');
    return prepareQuote(
      input,
      c,
      s,
      sourcing.read(),
      (id) => prior(s, id),
      ctx!.user.id,
      id,
      at,
    );
  };
  const analysisRecord = (
    q: ManagedQuote,
    stored: ManagedQuote['priceStatus'],
  ) => {
    const c = channels().find((c) => c.id === q.channelId)!,
      sp = supplier(c.supplierId)!,
      m = fixture.models.find((m) => m.id === c.modelId)!,
      v = fixture.vendors.find((v) => v.id === m.vendorId)!;
    return {
      quote: q,
      recordedStatus: stored,
      verified: false,
      channel: { id: c.id, name: c.displayName, status: c.resourceStatus },
      supplier: { id: sp.id, name: sp.name, status: sp.status },
      model: { id: m.id, name: m.name },
      vendor: { id: v.id, name: v.name, domain: v.businessDomain },
    };
  };
  const preview = (
    s: QuoteState,
    b: BulkQuoteBatch,
    now: number,
  ): BulkPreview => {
    const errors: BulkIssue[] = [];
    if (!b.items.length)
      errors.push({ field: 'items', message: '请至少添加一条报价行。' });
    if (b.sourceReference) {
      try {
        quoteEvidence(b.sourceReference);
      } catch (e) {
        errors.push({
          field: 'sourceReference',
          message: e instanceof Error ? e.message : '来源无效',
        });
      }
    }
    const fingerprints = b.items.map((i) =>
      stableFingerprint(i.proposedQuoteInput),
    );
    const rows = b.items.map((i, index) => {
      const c = channels().find((c) => c.id === i.channelId),
        m = fixture.models.find((m) => m.id === c?.modelId),
        old = i.previousQuoteId ? prior(s, i.previousQuoteId) : null,
        original = old ? resolvedQuote(s, old) : null;
      const issues: BulkIssue[] = [],
        warnings: BulkIssue[] = [];
      let q: ManagedQuote | null = null;
      try {
        q = prepared(
          s,
          b,
          i,
          `preview-${i.itemId}`,
          new Date(now).toISOString(),
        );
      } catch (e) {
        issues.push({
          field: e instanceof QuoteInputError ? e.field : 'quote',
          message: e instanceof Error ? e.message : '报价无效',
        });
      }
      if (fingerprints.filter((v) => v === fingerprints[index]).length > 1)
        warnings.push({
          field: 'quote',
          message: '疑似完全重复报价；不会自动合并或删除，请人工核实。',
        });
      if (
        c?.resourceStatus === 'disabled' ||
        supplier(b.supplierId)?.status === 'disabled'
      )
        warnings.push({
          field: 'channelId',
          message:
            '供应商或渠道已停用；仅登记历史商业资料，不代表可开展新采购。',
        });
      if (!original)
        warnings.push({
          field: 'previousQuoteId',
          message:
            '未选择参照报价，作为无参照的新记录；不会自动选择最近或最低价。',
        });
      if (q)
        for (const message of completeness(q.priceSpec))
          warnings.push({ field: 'priceSpec', message });
      const comparison =
        q && original
          ? compareAnalysis(
              analysisRecord(original, old!.priceStatus),
              analysisRecord(q, q.priceStatus),
              now,
            )
          : null;
      return {
        itemId: i.itemId,
        rowNumber: index + 1,
        channelName: c?.displayName ?? '未选择渠道',
        modelName: m?.name ?? '待选择',
        errors: issues,
        warnings,
        prior: original ? projectQuote(original) : null,
        priorRecordedStatus: old?.priceStatus ?? null,
        priorVersion: old
          ? 1 + s.decisions.filter((d) => d.quoteId === old.id).length
          : null,
        proposedValidity: q ? analysisValidity(q, now) : null,
        activeFormalCount: s.quotes.filter(
          (q) =>
            q.channelId === i.channelId &&
            isCurrentFormal(resolvedQuote(s, q), now),
        ).length,
        input: cleanInput(i.proposedQuoteInput),
        numericDifferenceBps:
          q && original ? q.discount - original.discount : null,
        comparison,
      };
    });
    const token = stableFingerprint({
      version: b.version,
      quoteRevision: s.revision,
      supplierRevision: suppliers.read().revision,
      channelRevision: channelRepo.read().revision,
      sourcingRevision: sourcing.read().revision,
      user: ctx!.user.id,
      domain: domain ?? 'all',
      states: rows.map((r, n) => ({
        itemId: r.itemId,
        priorVersion: r.priorVersion,
        priorValidity: r.prior ? analysisValidity(r.prior, now) : null,
        active: s.quotes
          .filter(
            (q) =>
              q.channelId === b.items[n]!.channelId &&
              isCurrentFormal(resolvedQuote(s, q), now),
          )
          .map((q) => q.id),
        proposed: (() => {
          try {
            return analysisValidity(
              prepared(
                s,
                b,
                b.items[n]!,
                `preview-${r.itemId}`,
                new Date(now).toISOString(),
              ),
              now,
            );
          } catch {
            return null;
          }
        })(),
      })),
    });
    return {
      batchId: b.id,
      version: b.version,
      asOf: new Date(now).toISOString(),
      token,
      canSubmit: !errors.length && rows.every((r) => !r.errors.length),
      errors,
      rows,
    };
  };
  return {
    async queryBulkBatches(query = {}) {
      guard('bulk:read');
      const s = repo.read();
      return s.batches
        .filter(
          (b) =>
            allowed(b) &&
            (!query.supplierId || b.supplierId === query.supplierId) &&
            (!query.status || b.status === query.status) &&
            (!query.search ||
              b.batchNo.toLowerCase().includes(query.search.toLowerCase())),
        )
        .map((b) => ({
          id: b.id,
          batchNo: b.batchNo,
          supplier: { id: b.supplierId, name: supplier(b.supplierId)!.name },
          status: b.status,
          itemCount: b.items.length,
          createdBy: b.createdBy,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
          submittedAt: b.submittedAt,
        }))
        .reverse();
    },
    async getBulkBatch(id) {
      guard('bulk:read');
      guard('bulk:history');
      const s = repo.read(),
        b = s.batches.find((b) => b.id === id);
      return b && allowed(b) ? structuredClone(detail(s, b)) : null;
    },
    async bulkQuoteOptions() {
      guard('bulk:read');
      return {
        suppliers: suppliers
          .read()
          .suppliers.filter((v) => supplier(v.id))
          .map((v) => ({ id: v.id, name: v.name, status: v.status })),
        quoteOptions: await quotation.quoteOptions(),
      };
    },
    async createBulkBatch(input, key) {
      const actor = guard('bulk:create');
      if (
        Object.keys(input).some(
          (k) => !['supplierId', 'sourceReference', 'sharedReason'].includes(k),
        ) ||
        !supplier(input.supplierId)
      )
        throw new SupplierError('FORBIDDEN', '供应商不存在或无权操作。');
      metadata(input);
      const s = repo.read(),
        r = request(s, key, 'bulk:create', input);
      if (r) return detail(s, find(s, r.resultId));
      const at = new Date().toISOString(),
        id = `mock-batch-${crypto.randomUUID()}`;
      const b: BulkQuoteBatch = {
        id,
        batchNo: `MOCK-BATCH-${id.slice(11)}`,
        supplierId: input.supplierId,
        status: 'draft',
        createdBy: actor.user.id,
        createdAt: at,
        updatedAt: at,
        version: 1,
        sourceReference: input.sourceReference,
        sharedReason: input.sharedReason,
        submittedBy: null,
        submittedAt: null,
        items: [],
      };
      const next = {
        ...s,
        batches: [...s.batches, b],
        batchEvents: [...s.batchEvents, event(null, b, 'created', key)],
      };
      const result = detail(next, b);
      save(s, next, key, 'bulk:create', input, id);
      return result;
    },
    async updateBulkDraft(id, v, input, key) {
      guard('bulk:update');
      metadata(input);
      const s = repo.read(),
        b = find(s, id),
        payload = { id, v, input };
      if (request(s, key, 'bulk:update', payload)) return detail(s, b);
      if (b.status !== 'draft' || b.version !== v)
        throw new SupplierError(
          'CONFLICT',
          '批次版本已变化或已提交，请重新加载。',
        );
      if (
        Object.keys(input).some(
          (k) => !['items', 'sourceReference', 'sharedReason'].includes(k),
        ) ||
        !Array.isArray(input.items) ||
        input.items.some(
          (i) =>
            Object.keys(i).some(
              (k) => !['itemId', 'proposedQuoteInput'].includes(k),
            ) ||
            !draftShape(i.proposedQuoteInput) ||
            !/^[A-Za-z0-9_-]{8,100}$/.test(i.itemId),
        )
      )
        throw new SupplierError('VALIDATION', '草稿行结构无效。');
      const oldIds = new Set(
        s.batchEvents.flatMap((e) => [...e.addedItemIds, ...e.removedItemIds]),
      );
      if (
        new Set(input.items.map((i) => i.itemId)).size !== input.items.length ||
        input.items.some(
          (i) =>
            !b.items.some((v) => v.itemId === i.itemId) && oldIds.has(i.itemId),
        )
      )
        throw new SupplierError('VALIDATION', '行ID重复或已被历史使用。');
      const at = new Date().toISOString();
      const items: BulkQuoteItem[] = input.items.map((i) => {
        const old = b.items.find((v) => v.itemId === i.itemId),
          p = cleanInput(i.proposedQuoteInput);
        return {
          itemId: i.itemId,
          batchId: id,
          channelId: p.channelId ?? '',
          previousQuoteId: p.previousQuoteId ?? null,
          proposedQuoteInput: p,
          createdAt: old?.createdAt ?? at,
          updatedAt:
            old &&
            stableFingerprint(old.proposedQuoteInput) === stableFingerprint(p)
              ? old.updatedAt
              : at,
        };
      });
      const after = {
        ...b,
        items,
        sourceReference: input.sourceReference,
        sharedReason: input.sharedReason,
      };
      if (!allowed(after))
        throw new SupplierError(
          'FORBIDDEN',
          '批次中存在无完整授权的渠道，不能保存整个批次。',
        );
      for (const i of items)
        if (
          i.previousQuoteId &&
          prior(s, i.previousQuoteId).channelId !== i.channelId
        )
          throw new SupplierError('VALIDATION', '参照报价必须属于同一渠道。');
      if (
        stableFingerprint({
          sourceReference: b.sourceReference,
          sharedReason: b.sharedReason,
          items: b.items.map((i) => ({
            itemId: i.itemId,
            proposedQuoteInput: i.proposedQuoteInput,
          })),
        }) === stableFingerprint(input)
      )
        return detail(s, b);
      const updated = { ...after, updatedAt: at, version: b.version + 1 },
        next = {
          ...s,
          batches: s.batches.map((x) => (x.id === id ? updated : x)),
          batchEvents: [...s.batchEvents, event(b, updated, 'edited', key)],
        };
      const result = detail(next, updated);
      save(s, next, key, 'bulk:update', payload, id);
      return result;
    },
    async previewBulkBatch(id, v) {
      guard('bulk:preview');
      const s = repo.read(),
        b = find(s, id);
      if (b.status !== 'draft' || b.version !== v)
        throw new SupplierError(
          'CONFLICT',
          '批次已变化或已提交，请重新加载后预览。',
        );
      return structuredClone(preview(s, b, Date.now()));
    },
    async submitBulkBatch(id, v, token, confirmed, key) {
      guard('bulk:submit');
      const s = repo.read(),
        b = find(s, id),
        payload = { id, v, token, confirmed };
      const replay = request(s, key, 'bulk:submit', payload);
      if (replay) {
        const r = s.batchSubmissions.find((r) => r.id === replay.resultId);
        if (!r) throw new SupplierError('VALIDATION', '提交结果缺失。');
        return projectReceipt(r);
      }
      if (confirmed !== true)
        throw new SupplierError(
          'VALIDATION',
          '请先二次确认：仅模拟报价录入，不代表正式确认。',
        );
      if (b.status !== 'draft' || b.version !== v)
        throw new SupplierError(
          'CONFLICT',
          '批次已变化或已提交，不能再次生成报价。',
        );
      const now = Date.now(),
        checked = preview(s, b, now);
      if (checked.token !== token)
        throw new SupplierError(
          'CONFLICT',
          '预览依据或授权版本已变化，请重新加载并重新校验。',
        );
      if (!checked.canSubmit)
        throw new SupplierError(
          'VALIDATION',
          '存在阻断错误，整批未提交，请修正后重新预览。',
        );
      const at = new Date(now).toISOString(),
        newQuotes = b.items.map((i) =>
          prepared(s, b, i, `mock-quote-${crypto.randomUUID()}`, at),
        );
      const mappings = b.items.map((i, n) => ({
        itemId: i.itemId,
        quoteId: newQuotes[n]!.id,
      }));
      const receipt: BulkQuoteSubmission = {
        id: crypto.randomUUID(),
        batchId: id,
        actorUserId: ctx!.user.id,
        submittedAt: at,
        requestId: key,
        result: 'succeeded',
        mappings,
      };
      const updated: BulkQuoteBatch = {
        ...b,
        status: 'submitted',
        version: b.version + 1,
        updatedAt: at,
        submittedAt: at,
        submittedBy: ctx!.user.id,
      };
      const replied = new Set(
        newQuotes.flatMap((q) => (q.inquiryId ? [q.inquiryId] : [])),
      );
      const changed = s.inquiries.filter(
        (i) => replied.has(i.id) && i.status !== 'quoted',
      );
      const next: QuoteState = {
        ...s,
        quotes: [...s.quotes, ...newQuotes],
        inquiries: s.inquiries.map((i) =>
          changed.some((v) => v.id === i.id)
            ? { ...i, status: 'quoted', version: i.version + 1, updatedAt: at }
            : i,
        ),
        batches: s.batches.map((x) => (x.id === id ? updated : x)),
        batchSubmissions: [...s.batchSubmissions, receipt],
        batchEvents: [
          ...s.batchEvents,
          event(
            b,
            updated,
            'submitted',
            key,
            newQuotes.map((q) => q.id),
          ),
        ],
        history: [
          ...s.history,
          ...newQuotes.map((q) => ({
            id: crypto.randomUUID(),
            targetType: 'quote' as const,
            targetId: q.id,
            action: q.sourceType === 'correction' ? 'corrected' : 'recorded',
            actorUserId: ctx!.user.id,
            occurredAt: at,
            reason: q.reason,
            changes: quoteFields.map((field) => ({
              field,
              before: null,
              after:
                field === 'discount'
                  ? q.discount
                  : JSON.stringify(
                      (q as unknown as Record<string, unknown>)[field] ?? null,
                    ),
            })),
          })),
          ...changed.map((i) => ({
            id: crypto.randomUUID(),
            targetType: 'inquiry' as const,
            targetId: i.id,
            action: 'reply_recorded',
            actorUserId: ctx!.user.id,
            occurredAt: at,
            reason: '批次录入模拟报价，不表示核验或正式确认。',
            changes: [{ field: 'status', before: i.status, after: 'quoted' }],
          })),
        ],
      };
      save(s, next, key, 'bulk:submit', payload, receipt.id);
      return projectReceipt(receipt);
    },
    async getBulkQuoteOrigin(id) {
      guard('bulk:read');
      const s = repo.read(),
        q = s.quotes.find(
          (q) => q.id === id && channels().some((c) => c.id === q.channelId),
        );
      if (!q) return null;
      const r = s.batchSubmissions.find((r) =>
          r.mappings.some((m) => m.quoteId === id),
        ),
        b = r ? s.batches.find((b) => b.id === r.batchId) : null;
      if (!b || !allowed(b)) return null;
      return {
        batchId: b.id,
        batchNo: b.batchNo,
        itemId: r!.mappings.find((m) => m.quoteId === id)!.itemId,
      };
    },
  };
}
