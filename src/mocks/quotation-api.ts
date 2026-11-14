import {
  quoteFields,
  quoteIso as iso,
  quoteText as text,
  quoteEvidence as evidence,
  quoteSpec as spec,
  stableFingerprint as stable,
  prepareQuote,
} from './quote-command';
import type { AccessContext, PermissionAction } from '../auth/types';
import { can } from '../auth/policy';
import { projectChannel } from '../auth/projections';
import type { BusinessDomain, Channel } from '../domain/entities';
import {
  compareQuotes,
  inquiryStatusLabels,
  quoteValidity,
} from '../domain/quotations';
import type {
  ManagedQuote,
  QuoteState,
  QuoteAudit,
  InquiryRecord,
} from '../domain/quotations';
import type { QuotationApi, QuoteRow } from '../services/quotation-types';
import { SupplierError } from '../services/supplier-types';
import type { QuoteRepository } from './quote-repository';
import type { ChannelRepository } from './channel-repository';
import type { SupplierRepository } from './supplier-repository';
import type { SourcingRepository } from './sourcing-repository';
import { fixture } from './data';
export function projectQuote(q: ManagedQuote): ManagedQuote {
  return {
    source: q.source,
    id: q.id,
    channelId: q.channelId,
    discount: q.discount,
    priceStatus: q.priceStatus,
    reason: q.reason,
    sourceType: q.sourceType,
    effectiveFrom: q.effectiveFrom,
    effectiveUntil: q.effectiveUntil,
    evidenceReference: q.evidenceReference,
    submittedBy: q.submittedBy,
    confirmedBy: q.confirmedBy,
    confirmedAt: q.confirmedAt,
    createdAt: q.createdAt,
    previousQuoteId: q.previousQuoteId,
    inquiryId: q.inquiryId,
    demandId: q.demandId,
    demandItemId: q.demandItemId,
    recordedBy: q.recordedBy,
    supplierSubmitterReference: q.supplierSubmitterReference,
    supplierQuotedAt: q.supplierQuotedAt,
    priceSpec: spec(q.priceSpec),
  };
}
export function resolvedQuote(s: QuoteState, q: ManagedQuote): ManagedQuote {
  const confirmed = s.decisions
    .filter((e) => e.quoteId === q.id && e.kind === 'confirm')
    .at(-1);
  return projectQuote(
    confirmed
      ? {
          ...q,
          priceStatus: 'effective',
          confirmedBy: confirmed.actorUserId,
          confirmedAt: confirmed.occurredAt,
          effectiveFrom: confirmed.effectiveFrom,
          evidenceReference: confirmed.evidenceReference,
        }
      : q,
  );
}
const projectInquiry = (i: InquiryRecord): InquiryRecord => ({
  id: i.id,
  channelId: i.channelId,
  demandItemId: i.demandItemId,
  requestedBy: i.requestedBy,
  requestedAt: i.requestedAt,
  responseDueAt: i.responseDueAt,
  status: i.status,
  followUpNote: i.followUpNote,
  version: i.version,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
});
export function createQuotationApi(
  ctx: AccessContext | null,
  domain: BusinessDomain | undefined,
  repo: QuoteRepository,
  channelRepo: ChannelRepository,
  suppliers: SupplierRepository,
  sourcing: SourcingRepository,
  channels: () => readonly Channel[],
  active: () => boolean,
): QuotationApi {
  const read = () => !!ctx && ctx.domains.length > 0 && can(ctx, 'quote:read');
  const guard = (action: PermissionAction) => {
    if (!ctx || !active() || !ctx.domains.length || !can(ctx, action))
      throw new SupplierError(
        'FORBIDDEN',
        '当前身份或业务域无此报价操作权限。',
      );
    return ctx;
  };
  const channel = (id: string) => {
    const c = channels().find((c) => c.id === id);
    if (!c)
      throw new SupplierError(
        'FORBIDDEN',
        '渠道不存在或不在当前授权供应商/业务域内。',
      );
    return c;
  };
  const linked = (
    c: Channel,
    demandId: string | null,
    itemId: string | null,
  ) => {
    const s = sourcing.read();
    if (itemId !== null) {
      const i = s.items.find((i) => i.id === itemId);
      if (!i || i.demandId !== demandId || i.modelId !== c.modelId)
        throw new SupplierError(
          'VALIDATION',
          '需求明细与渠道模型或主单不一致。',
        );
    } else if (
      demandId !== null &&
      !s.items.some((i) => i.demandId === demandId && i.modelId === c.modelId)
    )
      throw new SupplierError('VALIDATION', '需求不包含此渠道模型。');
  };
  const row = (s: QuoteState, q: ManagedQuote): QuoteRow => {
    const c = channel(q.channelId);
    const model = fixture.models.find((m) => m.id === c.modelId)!;
    const supplier = suppliers
      .read()
      .suppliers.find((v) => v.id === c.supplierId)!;
    const decisions = s.decisions.filter((e) => e.quoteId === q.id);
    const resolved = resolvedQuote(s, q);
    return {
      quote: resolved,
      storedPriceStatus: q.priceStatus,
      channel: projectChannel(ctx!, c),
      supplier: {
        source: supplier.source,
        id: supplier.id,
        name: supplier.name,
        shortCode: supplier.shortCode,
        status: supplier.status,
      },
      model,
      vendor: fixture.vendors.find((v) => v.id === model.vendorId)!,
      version: 1 + decisions.length,
      verified: decisions.some((e) => e.kind === 'verify'),
      validity: quoteValidity(resolved),
      updatedAt: decisions.at(-1)?.occurredAt ?? q.createdAt,
    };
  };
  const accessible = (s: QuoteState, id: string) => {
    const q = s.quotes.find((q) => q.id === id);
    if (!q) throw new SupplierError('FORBIDDEN', '报价不存在或无权访问。');
    channel(q.channelId);
    return q;
  };
  const replay = (
    s: QuoteState,
    requestId: string,
    operation: string,
    payload: unknown,
  ) => {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId))
      throw new SupplierError(
        'VALIDATION',
        '请求标识无效，请重新打开操作表单。',
      );
    const id = `${ctx!.user.id}:${requestId}`;
    const previous = s.requests.find((r) => r.id === id);
    if (
      previous &&
      (previous.operation !== operation ||
        previous.fingerprint !== stable(payload))
    )
      throw new SupplierError(
        'CONFLICT',
        '请求标识已用于其他内容，请重新打开表单。',
      );
    return { id, previous };
  };
  const audit = (
    type: QuoteAudit['targetType'],
    id: string,
    action: string,
    reason: string,
    changes: QuoteAudit['changes'],
  ): QuoteAudit => ({
    id: crypto.randomUUID(),
    targetType: type,
    targetId: id,
    action,
    actorUserId: ctx!.user.id,
    occurredAt: new Date().toISOString(),
    reason,
    changes,
  });
  const save = (
    s: QuoteState,
    next: QuoteState,
    requestId: string,
    operation: string,
    payload: unknown,
    resultId: string,
  ) => {
    const id = `${ctx!.user.id}:${requestId}`;
    repo.write(
      s,
      {
        ...next,
        requests: [
          ...s.requests,
          {
            id,
            operation,
            actorUserId: ctx!.user.id,
            fingerprint: stable(payload),
            resultId,
          },
        ],
      },
      channelRepo,
      suppliers,
      sourcing,
    );
  };
  const version = (s: QuoteState, q: ManagedQuote, v: number) => {
    if (row(s, q).version !== v)
      throw new SupplierError('CONFLICT', '报价版本已变化，请重新加载后操作。');
  };
  return {
    async queryQuotes(query = {}) {
      if (!read())
        throw new SupplierError('FORBIDDEN', '当前身份无采购报价访问权限。');
      const s = repo.read();
      const ids = new Set(channels().map((c) => c.id));
      const all = s.quotes
        .filter((q) => ids.has(q.channelId))
        .map((q) => row(s, q));
      const now = Date.now(),
        week = 7 * 86400000;
      const filtered = all
        .filter(
          (r) =>
            (!query.search ||
              `${r.quote.id} ${r.channel.displayName} ${r.model.name} ${r.supplier.name}`
                .toLowerCase()
                .includes(query.search.toLowerCase())) &&
            (!query.channelId || r.channel.id === query.channelId) &&
            (!query.supplierId || r.supplier.id === query.supplierId) &&
            (!query.modelId || r.model.id === query.modelId) &&
            (!query.vendorId || r.vendor.id === query.vendorId) &&
            (!query.status ||
              (query.status === 'expired'
                ? r.validity === 'expired'
                : r.quote.priceStatus === query.status)) &&
            (!query.sourceType || r.quote.sourceType === query.sourceType) &&
            (!query.currency ||
              r.quote.priceSpec.currency === query.currency) &&
            (!query.demandId || r.quote.demandId === query.demandId) &&
            (!query.demandItemId ||
              r.quote.demandItemId === query.demandItemId) &&
            (!query.createdFrom ||
              new Date(r.quote.createdAt).toLocaleDateString('sv-SE', {
                timeZone: 'Asia/Shanghai',
              }) >= query.createdFrom) &&
            (!query.createdTo ||
              new Date(r.quote.createdAt).toLocaleDateString('sv-SE', {
                timeZone: 'Asia/Shanghai',
              }) <= query.createdTo) &&
            (!query.validFrom ||
              (r.quote.effectiveFrom !== null &&
                Date.parse(r.quote.effectiveFrom) >=
                  Date.parse(query.validFrom))) &&
            (!query.validTo ||
              (r.quote.effectiveUntil !== null &&
                Date.parse(r.quote.effectiveUntil) <=
                  Date.parse(query.validTo))),
        )
        .sort(
          (a, b) =>
            a.quote.createdAt.localeCompare(b.quote.createdAt) *
            (query.order === 'asc' ? 1 : -1),
        );
      const size = Math.min(50, Math.max(1, query.pageSize ?? 10));
      const page = Math.max(1, query.page ?? 1);
      return structuredClone({
        rows: filtered.slice((page - 1) * size, page * size),
        total: filtered.length,
        stats: {
          channels: new Set(all.map((r) => r.channel.id)).size,
          reference: all.filter(
            (r) =>
              r.quote.priceStatus === 'reference' && r.validity !== 'expired',
          ).length,
          pending: all.filter(
            (r) =>
              r.quote.priceStatus === 'pending_contract' &&
              r.validity !== 'expired',
          ).length,
          effective: all.filter(
            (r) =>
              r.quote.priceStatus === 'effective' && r.validity === 'in_period',
          ).length,
          temporary: all.filter(
            (r) =>
              r.quote.priceStatus === 'temporary' && r.validity === 'in_period',
          ).length,
          expiring: all.filter(
            (r) =>
              r.quote.priceStatus === 'temporary' &&
              r.validity === 'in_period' &&
              r.quote.effectiveUntil !== null &&
              Date.parse(r.quote.effectiveUntil) > now &&
              Date.parse(r.quote.effectiveUntil) <= now + week,
          ).length,
          newChannels: new Set(
            all
              .filter(
                (r) =>
                  Date.parse(r.quote.createdAt) >= now - week &&
                  Date.parse(r.quote.createdAt) <= now,
              )
              .map((r) => r.channel.id),
          ).size,
        },
      });
    },
    async getQuote(id) {
      if (!read()) return null;
      const s = repo.read();
      const q = s.quotes.find(
        (q) => q.id === id && channels().some((c) => c.id === q.channelId),
      );
      if (!q) return null;
      return structuredClone({
        row: row(s, q),
        decisions: s.decisions
          .filter((e) => e.quoteId === id)
          .map((e) => ({
            id: e.id,
            quoteId: e.quoteId,
            kind: e.kind,
            actorUserId: e.actorUserId,
            occurredAt: e.occurredAt,
            evidenceReference: e.evidenceReference,
            effectiveFrom: e.effectiveFrom,
            reason: e.reason,
          })),
        history: can(ctx!, 'quote:history')
          ? s.history
              .filter((e) => e.targetType === 'quote' && e.targetId === id)
              .map((e) => ({
                id: e.id,
                targetType: e.targetType,
                targetId: e.targetId,
                action: e.action,
                actorUserId: e.actorUserId,
                occurredAt: e.occurredAt,
                reason: e.reason,
                changes: e.changes
                  .filter((c) =>
                    [
                      'discount',
                      'previousQuoteId',
                      'verification',
                      'priceStatus',
                      'effectiveFrom',
                      'status',
                      'followUpNote',
                    ].includes(c.field),
                  )
                  .map((c) => ({
                    field: c.field,
                    before: c.before,
                    after: c.after,
                  })),
              }))
          : [],
        channelHistory: s.quotes
          .filter((v) => v.channelId === q.channelId)
          .map((v) => row(s, v)),
      });
    },
    async quoteOptions() {
      if (!read()) throw new SupplierError('FORBIDDEN', '无报价目录访问权限。');
      const cs = channels();
      const models = new Set(cs.map((c) => c.modelId));
      const src = sourcing.read();
      const qs = repo.read();
      return structuredClone({
        channels: cs.map((c) => {
          const supplier = suppliers
            .read()
            .suppliers.find((s) => s.id === c.supplierId)!;
          return {
            channel: projectChannel(ctx!, c),
            supplier: {
              id: supplier.id,
              source: supplier.source,
              name: supplier.name,
              shortCode: supplier.shortCode,
              status: supplier.status,
            },
            model: fixture.models.find((m) => m.id === c.modelId)!,
          };
        }),
        demands: src.items
          .filter((i) => models.has(i.modelId))
          .map((i) => ({
            id: i.id,
            demandId: i.demandId,
            modelId: i.modelId,
            label: `${src.demands.find((d) => d.id === i.demandId)!.demandCode} · ${src.demands.find((d) => d.id === i.demandId)!.sharedTitle} · ${fixture.models.find((m) => m.id === i.modelId)!.name}`,
            targetPurchaseDiscount: i.targetPurchaseDiscount,
          })),
        inquiries: qs.inquiries
          .filter((i) => cs.some((c) => c.id === i.channelId))
          .map(projectInquiry),
        quotes: qs.quotes
          .filter((q) => cs.some((c) => c.id === q.channelId))
          .map((q) => ({ id: q.id, channelId: q.channelId })),
      });
    },
    async createQuote(input, requestId) {
      const actor = guard(
        input.sourceType === 'correction' ? 'quote:correct' : 'quote:create',
      );
      if (
        !input ||
        Object.keys(input).some(
          (k) => !quoteFields.some((field) => field === k),
        )
      )
        throw new SupplierError('VALIDATION', '报价仅允许录入指定商业字段。');
      const c = channel(input.channelId);
      const s = repo.read();
      const prior = replay(s, requestId, 'quote:create', input);
      if (prior.previous)
        return structuredClone(row(s, accessible(s, prior.previous.resultId)));
      const now = new Date().toISOString();
      const q = prepareQuote(
        input,
        c,
        s,
        sourcing.read(),
        (id) => accessible(s, id),
        actor.user.id,
        `mock-quote-${crypto.randomUUID()}`,
        now,
      );
      const inquiry = s.inquiries.find((i) => i.id === input.inquiryId) ?? null;
      const changedInquiry =
        inquiry && inquiry.status !== 'quoted'
          ? {
              ...inquiry,
              status: 'quoted' as const,
              version: inquiry.version + 1,
              updatedAt: now,
            }
          : null;
      save(
        s,
        {
          ...s,
          quotes: [...s.quotes, q],
          inquiries: changedInquiry
            ? s.inquiries.map((i) =>
                i.id === changedInquiry.id ? changedInquiry : i,
              )
            : s.inquiries,
          history: [
            ...s.history,
            audit(
              'quote',
              q.id,
              q.sourceType === 'correction' ? 'corrected' : 'recorded',
              q.reason,
              [
                { field: 'discount', before: null, after: q.discount },
                {
                  field: 'previousQuoteId',
                  before: null,
                  after: q.previousQuoteId,
                },
              ],
            ),
            ...(changedInquiry
              ? [
                  audit(
                    'inquiry',
                    changedInquiry.id,
                    'reply_recorded',
                    '录入模拟报价，仅表示收到，不代表核验。',
                    [
                      {
                        field: 'status',
                        before: inquiry!.status,
                        after: 'quoted',
                      },
                    ],
                  ),
                ]
              : []),
          ],
        },
        requestId,
        'quote:create',
        input,
        q.id,
      );
      return structuredClone(row(repo.read(), q));
    },
    async verifyQuote(id, v, ref, reason, requestId) {
      guard('quote:verify');
      const s = repo.read();
      const q = accessible(s, id);
      const payload = { id, v, ref, reason };
      if (replay(s, requestId, 'verify', payload).previous) return;
      version(s, q, v);
      const e = {
        id: crypto.randomUUID(),
        quoteId: id,
        kind: 'verify' as const,
        actorUserId: ctx!.user.id,
        occurredAt: new Date().toISOString(),
        evidenceReference: evidence(ref),
        effectiveFrom: null,
        reason: text(reason),
      };
      save(
        s,
        {
          ...s,
          decisions: [...s.decisions, e],
          history: [
            ...s.history,
            audit('quote', id, 'verified', e.reason, [
              {
                field: 'verification',
                before: row(s, q).verified ? 'verified' : 'unverified',
                after: 'verified',
              },
            ]),
          ],
        },
        requestId,
        'verify',
        payload,
        e.id,
      );
    },
    async confirmQuote(id, v, ref, from, reason, requestId) {
      guard('quote:confirm');
      const s = repo.read();
      const q = accessible(s, id);
      const payload = { id, v, ref, from, reason };
      if (replay(s, requestId, 'confirm', payload).previous) return;
      version(s, q, v);
      if (
        !row(s, q).verified ||
        !['reference', 'pending_contract'].includes(row(s, q).quote.priceStatus)
      )
        throw new SupplierError(
          'VALIDATION',
          '须先独立核验参考/待合同报价；临时优惠、已失效或已正式确认的记录不能如此确认。',
        );
      if (
        !from ||
        !iso(from) ||
        (q.effectiveUntil !== null &&
          Date.parse(q.effectiveUntil) <= Date.parse(from)) ||
        quoteValidity(q) === 'expired'
      )
        throw new SupplierError(
          'VALIDATION',
          '正式确认须有有效生效时间，不能确认已结束的报价。',
        );
      const e = {
        id: crypto.randomUUID(),
        quoteId: id,
        kind: 'confirm' as const,
        actorUserId: ctx!.user.id,
        occurredAt: new Date().toISOString(),
        evidenceReference: evidence(ref),
        effectiveFrom: from,
        reason: text(reason),
      };
      save(
        s,
        {
          ...s,
          decisions: [...s.decisions, e],
          history: [
            ...s.history,
            audit('quote', id, 'confirmed', e.reason, [
              {
                field: 'priceStatus',
                before: q.priceStatus,
                after: 'effective',
              },
              { field: 'effectiveFrom', before: q.effectiveFrom, after: from },
            ]),
          ],
        },
        requestId,
        'confirm',
        payload,
        e.id,
      );
    },
    async listInquiries(channelId, demandItemId) {
      if (!ctx || !can(ctx, 'inquiry:read') || !ctx.domains.length) return [];
      return repo
        .read()
        .inquiries.filter(
          (i) =>
            channels().some((c) => c.id === i.channelId) &&
            (!channelId || i.channelId === channelId) &&
            (!demandItemId || i.demandItemId === demandItemId),
        )
        .map(projectInquiry);
    },
    async createInquiry(input, requestId) {
      const actor = guard('inquiry:create');
      const c = channel(input.channelId);
      if (
        Object.keys(input).some(
          (k) =>
            ![
              'channelId',
              'demandItemId',
              'responseDueAt',
              'followUpNote',
            ].includes(k),
        ) ||
        !iso(input.responseDueAt)
      )
        throw new SupplierError('VALIDATION', '询价字段或回复截止时间无效。');
      const src = sourcing.read();
      const item =
        input.demandItemId === null
          ? null
          : src.items.find((i) => i.id === input.demandItemId);
      if (input.demandItemId !== null && !item)
        throw new SupplierError('VALIDATION', '需求明细不存在。');
      linked(c, item?.demandId ?? null, input.demandItemId);
      const s = repo.read();
      const previous = replay(s, requestId, 'inquiry:create', input);
      if (previous.previous)
        return projectInquiry(
          s.inquiries.find((i) => i.id === previous.previous!.resultId)!,
        );
      const now = new Date().toISOString();
      const i: InquiryRecord = {
        id: `mock-inquiry-${crypto.randomUUID()}`,
        channelId: c.id,
        demandItemId: input.demandItemId,
        requestedBy: actor.user.id,
        requestedAt: now,
        responseDueAt: input.responseDueAt,
        status: 'draft',
        followUpNote: text(input.followUpNote),
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      save(
        s,
        {
          ...s,
          inquiries: [...s.inquiries, i],
          history: [
            ...s.history,
            audit('inquiry', i.id, 'created', i.followUpNote, [
              { field: 'status', before: null, after: 'draft' },
            ]),
          ],
        },
        requestId,
        'inquiry:create',
        input,
        i.id,
      );
      return projectInquiry(i);
    },
    async updateInquiry(id, v, status, note, requestId) {
      guard('inquiry:update');
      const s = repo.read();
      const i = s.inquiries.find((i) => i.id === id);
      if (!i) throw new SupplierError('FORBIDDEN', '询价不存在或无权访问。');
      channel(i.channelId);
      const payload = { id, v, status, note };
      if (replay(s, requestId, 'inquiry:update', payload).previous) return;
      if (i.version !== v)
        throw new SupplierError('CONFLICT', '询价版本已变化，请重新加载。');
      const transitions: Readonly<
        Record<InquiryRecord['status'], readonly InquiryRecord['status'][]>
      > = {
        draft: ['draft', 'sent', 'closed'],
        sent: ['sent', 'quoted', 'closed'],
        quoted: ['quoted', 'closed'],
        closed: [],
      };
      if (
        !Object.hasOwn(inquiryStatusLabels, status) ||
        !transitions[i.status].includes(status)
      )
        throw new SupplierError('VALIDATION', '不允许此询价状态流转。');
      const followUpNote = text(note);
      if (status === i.status && followUpNote === i.followUpNote) return;
      const after = {
        ...i,
        status,
        followUpNote,
        version: i.version + 1,
        updatedAt: new Date().toISOString(),
      };
      save(
        s,
        {
          ...s,
          inquiries: s.inquiries.map((v) => (v.id === id ? after : v)),
          history: [
            ...s.history,
            audit('inquiry', id, 'updated', followUpNote, [
              { field: 'status', before: i.status, after: status },
              {
                field: 'followUpNote',
                before: i.followUpNote,
                after: followUpNote,
              },
            ]),
          ],
        },
        requestId,
        'inquiry:update',
        payload,
        id,
      );
    },
    async compareQuoteRecords(a, b) {
      if (!read()) throw new SupplierError('FORBIDDEN', '无采购价格对比权限。');
      const s = repo.read();
      const first = row(s, accessible(s, a)),
        second = row(s, accessible(s, b));
      return compareQuotes(
        first.quote,
        second.quote,
        first.model.id,
        second.model.id,
      );
    },
    async resetQuoteDemo(confirmed) {
      const actor = guard('quote:confirm');
      if (confirmed !== true || domain || actor.domains.length !== 2)
        throw new SupplierError(
          'FORBIDDEN',
          '仅双域运营在全部业务域二次确认后可重置报价、批次草稿/提交结果/历史、询价、确认与审计；保留其他模块。',
        );
      repo.reset(channelRepo, suppliers, sourcing);
    },
  };
}
