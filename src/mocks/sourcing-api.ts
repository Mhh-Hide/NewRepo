import type { AccessContext, PermissionAction } from '../auth/types';
import { can } from '../auth/policy';
import { projectChannel } from '../auth/projections';
import type {
  BusinessDomain,
  Channel,
  SnapshotValue,
} from '../domain/entities';
import { discountBps, modelDomain } from '../domain/rules';
import {
  priorityLabels,
  matchStatusLabels,
  sourcingCoverage,
  assessCapacity,
  sourcingTransitions,
} from '../domain/sourcing';
import type {
  ManagedDemand,
  ManagedDemandItem,
  ManagedMatch,
  SourcingState,
  SourcingEvent,
} from '../domain/sourcing';
import type {
  SourcingApi,
  SourcingInput,
  SourcingDemandView,
  SourcingDetail,
  SourcingItemInput,
} from '../services/sourcing-types';
import { SupplierError } from '../services/supplier-types';
import type { SourcingRepository } from './sourcing-repository';
import type { ChannelRepository } from './channel-repository';
import type { SupplierRepository } from './supplier-repository';
import { fixture } from './data';
const sharedHistoryFields = new Set([
  'sharedTitle',
  'sharedSummary',
  'priority',
  'dueAt',
  'modelId',
  'requiredTpm',
  'requiredRpm',
  'requiredConcurrency',
  'requiredTtftMs',
  'targetPurchaseDiscount',
  'requiredRegion',
  'channelId',
  'matchStatus',
  'assessment',
  'status',
]);
const headFields = [
  'title',
  'description',
  'sharedTitle',
  'sharedSummary',
  'priority',
  'customerId',
  'dueAt',
] as const;
const itemFields = [
  'modelId',
  'requiredTpm',
  'requiredRpm',
  'requiredConcurrency',
  'requiredTtftMs',
  'targetPurchaseDiscount',
  'requiredRegion',
  'priority',
] as const;
const differences = (
  before: Record<string, SnapshotValue> | null,
  after: Record<string, SnapshotValue>,
) =>
  Object.entries(after).flatMap(([field, value]) =>
    before?.[field] === value
      ? []
      : [{ field, before: before?.[field] ?? null, after: value }],
  );
export function createSourcingApi(
  ctx: AccessContext | null,
  domain: BusinessDomain | undefined,
  repo: SourcingRepository,
  channelRepo: ChannelRepository,
  supplierRepo: SupplierRepository,
  channels: () => readonly Channel[],
  active: () => boolean,
): SourcingApi {
  const allowedModel = (id: string) => {
    const m = fixture.models.find((m) => m.id === id);
    return (
      !!ctx &&
      !!m &&
      ctx.domains.includes(modelDomain(m, fixture.vendors)) &&
      (!domain || modelDomain(m, fixture.vendors) === domain)
    );
  };
  const readable = () =>
    !!ctx && can(ctx, 'sourcing:read') && ctx.domains.length > 0;
  const guard = (action: PermissionAction) => {
    if (!ctx || !active() || !ctx.domains.length || !can(ctx, action))
      throw new SupplierError(
        'FORBIDDEN',
        '当前身份或业务域无此寻源操作权限。',
      );
    return ctx;
  };
  const itemsFor = (s: SourcingState, id: string) =>
    s.items.filter((i) => i.demandId === id && allowedModel(i.modelId));
  const visible = (s: SourcingState, id: string) =>
    readable() && itemsFor(s, id).length > 0;
  const whole = (s: SourcingState, id: string) =>
    s.items
      .filter((i) => i.demandId === id)
      .every((i) => allowedModel(i.modelId));
  const project = (d: ManagedDemand): SourcingDemandView => {
    const ops = ctx!.user.role === 'ProductOperations';
    return {
      source: d.source,
      id: d.id,
      demandCode: d.demandCode,
      title: ops ? d.title : d.sharedTitle,
      description: ops ? d.description : d.sharedSummary,
      sharedTitle: d.sharedTitle,
      sharedSummary: d.sharedSummary,
      priority: d.priority,
      dueAt: d.dueAt,
      status: d.status,
      version: d.version,
      createdBy: d.createdBy,
      updatedBy: d.updatedBy,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      ...(ops
        ? {
            customerId: d.customerId,
            customer: d.customerId
              ? (fixture.customers
                  .filter((c) => c.id === d.customerId)
                  .map((c) => ({ id: c.id, name: c.name }))[0] ?? null)
              : null,
          }
        : {}),
    };
  };
  const projectItem = (i: ManagedDemandItem): ManagedDemandItem => ({
    source: i.source,
    id: i.id,
    demandId: i.demandId,
    modelId: i.modelId,
    targetPurchaseDiscount: i.targetPurchaseDiscount,
    requiredTpm: i.requiredTpm,
    requiredRpm: i.requiredRpm,
    requiredConcurrency: i.requiredConcurrency,
    requiredTtftMs: i.requiredTtftMs,
    requiredRegion: i.requiredRegion,
    priority: i.priority,
    status: i.status,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  });
  const projectMatch = (m: ManagedMatch): ManagedMatch => ({
    source: m.source,
    id: m.id,
    demandItemId: m.demandItemId,
    channelId: m.channelId,
    matchStatus: m.matchStatus,
    assessment: m.assessment,
    createdBy: m.createdBy,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  });
  const candidate = (c: Channel, item: ManagedDemandItem) => {
    const s = supplierRepo.read().suppliers.find((s) => s.id === c.supplierId)!;
    return {
      channel: projectChannel(ctx!, c),
      supplier: {
        source: s.source,
        id: s.id,
        name: s.name,
        shortCode: s.shortCode,
        status: s.status,
      },
      fit: assessCapacity(item, c),
    };
  };
  const detail = (s: SourcingState, id: string): SourcingDetail | null => {
    if (!visible(s, id)) return null;
    const d = s.demands.find((d) => d.id === id);
    if (!d) return null;
    const cs = channels();
    const items = itemsFor(s, id).map((item) => {
      const model = fixture.models.find((m) => m.id === item.modelId)!;
      return {
        item: projectItem(item),
        model,
        vendor: fixture.vendors.find((v) => v.id === model.vendorId)!,
        coverage: sourcingCoverage(item, s.matches, cs, d.status),
        candidates: s.matches
          .filter((m) => m.demandItemId === item.id)
          .flatMap((match) => {
            const c = cs.find((c) => c.id === match.channelId);
            return c
              ? [{ match: projectMatch(match), ...candidate(c, item) }]
              : [];
          }),
      };
    });
    const history = s.history
      .filter(
        (e) =>
          e.demandId === id &&
          (!e.demandItemId ||
            items.some((i) => i.item.id === e.demandItemId)) &&
          (!e.matchId ||
            items.some((i) =>
              i.candidates.some((c) => c.match.id === e.matchId),
            )),
      )
      .flatMap((e) => {
        const changes =
          ctx!.user.role === 'ProductOperations'
            ? e.changes
            : e.changes.filter((c) => sharedHistoryFields.has(c.field));
        return changes.length
          ? [
              {
                id: e.id,
                demandId: e.demandId,
                demandItemId: e.demandItemId,
                matchId: e.matchId,
                action: e.action,
                actorUserId: e.actorUserId,
                occurredAt: e.occurredAt,
                note: e.note,
                changes: changes.map((c) => ({
                  field: c.field,
                  before: c.before,
                  after: c.after,
                })),
              },
            ]
          : [];
      });
    const full = whole(s, id);
    const writable = d.status !== 'closed' && active();
    return {
      demand: project(d),
      items,
      history,
      canEdit: writable && full && can(ctx!, 'sourcing:update'),
      canMatch: writable && can(ctx!, 'sourcing:match'),
      canProgress: writable && full && can(ctx!, 'sourcing:progress'),
      transitions: full ? sourcingTransitions[d.status] : [],
    };
  };
  const check = (
    s: SourcingState,
    id: string,
    version: number,
    full = false,
  ) => {
    const d = s.demands.find((d) => d.id === id);
    if (!d || !visible(s, id) || (full && !whole(s, id)))
      throw new SupplierError(
        'FORBIDDEN',
        '需求不存在、跨域明细未完整授权或无权操作。',
      );
    if (d.version !== version)
      throw new SupplierError('CONFLICT', '需求版本已变化，请重新加载后保存。');
    if (d.status === 'closed')
      throw new SupplierError('VALIDATION', '已关闭需求不可继续编辑或寻源。');
    return d;
  };
  const event = (
    demandId: string,
    action: SourcingEvent['action'],
    changes: SourcingEvent['changes'],
    demandItemId: string | null = null,
    matchId: string | null = null,
    note = '模拟寻源操作',
  ): SourcingEvent => ({
    id: crypto.randomUUID(),
    demandId,
    demandItemId,
    matchId,
    action,
    changes,
    actorUserId: ctx!.user.id,
    occurredAt: new Date().toISOString(),
    note,
  });
  const commit = (
    s: SourcingState,
    d: ManagedDemand,
    next: Partial<SourcingState>,
    events: readonly SourcingEvent[],
  ) => {
    if (!events.some((e) => e.changes.length)) return;
    repo.write(
      s,
      {
        ...s,
        ...next,
        demands: (next.demands ?? s.demands).map((v) =>
          v.id === d.id
            ? {
                ...v,
                version: d.version + 1,
                updatedBy: ctx!.user.id,
                updatedAt: new Date().toISOString(),
              }
            : v,
        ),
        history: [...s.history, ...events.filter((e) => e.changes.length)],
      },
      channelRepo,
      supplierRepo,
    );
  };
  const validateItem = (i: SourcingItemInput) => {
    if (
      !i ||
      Object.keys(i).some((k) => ![...itemFields, 'id'].includes(k)) ||
      !allowedModel(i.modelId)
    )
      throw new SupplierError(
        'FORBIDDEN',
        '明细模型不在当前授权业务域或包含不允许的字段。',
      );
    try {
      discountBps(i.targetPurchaseDiscount);
    } catch {
      throw new SupplierError(
        'VALIDATION',
        '目标采购折扣须为 0–10000 的整数基点。',
      );
    }
    if (
      !Object.hasOwn(priorityLabels, i.priority) ||
      typeof i.requiredRegion !== 'string' ||
      i.requiredRegion.length > 300
    )
      throw new SupplierError('VALIDATION', '明细优先级或地区限制无效。');
    for (const k of [
      'requiredTpm',
      'requiredRpm',
      'requiredConcurrency',
      'requiredTtftMs',
    ] as const) {
      const n = i[k];
      if (
        n !== null &&
        (!Number.isFinite(n) ||
          n < 0 ||
          (k !== 'requiredTtftMs' && !Number.isSafeInteger(n)))
      )
        throw new SupplierError(
          'VALIDATION',
          '需求能力须为空或有效非负数，TPM/RPM/并发须为整数，TTFT 为毫秒。',
        );
    }
  };
  const validate = (input: SourcingInput) => {
    if (
      !input ||
      Object.keys(input).some((k) => ![...headFields, 'items'].includes(k)) ||
      !Array.isArray(input.items) ||
      !input.items.length
    )
      throw new SupplierError(
        'VALIDATION',
        '请填写主单并添加至少一条有效模型明细。',
      );
    for (const k of ['title', 'sharedTitle', 'sharedSummary'] as const)
      if (
        typeof input[k] !== 'string' ||
        !input[k].trim() ||
        input[k].length > 2000
      )
        throw new SupplierError(
          'VALIDATION',
          '运营标题、共享标题和共享需求摘要必须独立填写（最多2000字）。',
        );
    if (
      typeof input.description !== 'string' ||
      input.description.length > 4000 ||
      !Object.hasOwn(priorityLabels, input.priority) ||
      (input.dueAt !== null && !Number.isFinite(Date.parse(input.dueAt))) ||
      (input.customerId !== null &&
        !fixture.customers.some((c) => c.id === input.customerId))
    )
      throw new SupplierError(
        'VALIDATION',
        '运营说明、客户关联、日期或优先级无效。',
      );
    input.items.forEach(validateItem);
  };
  const itemValues = (i: SourcingItemInput) =>
    Object.fromEntries(itemFields.map((k) => [k, i[k]])) as Pick<
      ManagedDemandItem,
      (typeof itemFields)[number]
    >;
  const textNote = (s: string) => {
    if (typeof s !== 'string' || !s.trim() || s.length > 2000)
      throw new SupplierError(
        'VALIDATION',
        '请填写不含客户身份/售价的共享判断依据或跟进说明（最多2000字）。',
      );
    return s.trim();
  };
  return {
    async querySourcing(q = {}) {
      if (!readable())
        throw new SupplierError(
          'FORBIDDEN',
          '当前身份无内部采购寻源访问权限。',
        );
      const s = repo.read();
      const all = s.demands.flatMap((d) => {
        const v = detail(s, d.id);
        return v
          ? [
              {
                demand: v.demand,
                modelCount: v.items.length,
                gapItems: v.items.filter(
                  (i) =>
                    i.coverage.phase !== 'not_started' &&
                    i.coverage.missing > 0,
                ).length,
                notStartedItems: v.items.filter(
                  (i) => i.coverage.phase === 'not_started',
                ).length,
                pendingItems: v.items.filter(
                  (i) => i.coverage.phase === 'pending',
                ).length,
              },
            ]
          : [];
      });
      const term = q.search?.trim().toLowerCase();
      const rows = all
        .filter(
          (r) =>
            (!term ||
              `${r.demand.demandCode} ${r.demand.title}`
                .toLowerCase()
                .includes(term)) &&
            (!q.modelId ||
              itemsFor(s, r.demand.id).some((i) => i.modelId === q.modelId)) &&
            (!q.status || r.demand.status === q.status) &&
            (!q.priority || r.demand.priority === q.priority) &&
            (!q.from || r.demand.createdAt.slice(0, 10) >= q.from) &&
            (!q.to || r.demand.createdAt.slice(0, 10) <= q.to),
        )
        .sort(
          (a, b) =>
            a.demand[q.sort ?? 'updatedAt'].localeCompare(
              b.demand[q.sort ?? 'updatedAt'],
            ) * (q.order === 'asc' ? 1 : -1),
        );
      const page = Math.max(1, Math.floor(q.page ?? 1));
      const size = Math.min(50, Math.max(1, Math.floor(q.pageSize ?? 10)));
      return structuredClone({
        rows: rows.slice((page - 1) * size, page * size),
        total: rows.length,
        stats: {
          total: all.length,
          sourcing: all.filter((r) => r.demand.status === 'sourcing').length,
          gaps: all.filter(
            (r) => r.demand.status !== 'closed' && r.gapItems > 0,
          ).length,
          matched: all.filter((r) => r.demand.status === 'matched').length,
          urgent: all.filter((r) => r.demand.priority === 'urgent').length,
        },
        canCreate: !!ctx && active() && can(ctx, 'sourcing:create'),
        canReset:
          !!ctx &&
          active() &&
          can(ctx, 'demo:reset') &&
          !domain &&
          ctx.domains.length === 2,
      });
    },
    async getSourcingDemand(id) {
      if (!readable()) return null;
      return structuredClone(detail(repo.read(), id));
    },
    async listSourcingCustomers() {
      return ctx?.user.role === 'ProductOperations' && ctx.domains.length
        ? fixture.customers.map((c) => ({ id: c.id, name: c.name }))
        : [];
    },
    async createSourcingDemand(input, requestId) {
      const actor = guard('sourcing:create');
      validate(input);
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId))
        throw new SupplierError(
          'VALIDATION',
          '创建请求标识无效，请重新打开表单。',
        );
      const state = repo.read();
      const id = `mock-demand-${requestId}`;
      const existing = state.demands.find((d) => d.id === id);
      if (existing) {
        if (existing.createdBy !== actor.user.id || !whole(state, id))
          throw new SupplierError('CONFLICT', '创建请求标识已使用。');
        return project(existing);
      }
      const now = new Date().toISOString();
      const d: ManagedDemand = {
        source: 'mock',
        id,
        demandCode: `MOCK-REQ-${String(state.demands.length + 1).padStart(4, '0')}`,
        requesterUserId: actor.user.id,
        title: input.title.trim(),
        description: input.description,
        sharedTitle: input.sharedTitle.trim(),
        sharedSummary: input.sharedSummary.trim(),
        customerId: input.customerId,
        priority: input.priority,
        dueAt: input.dueAt,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        createdBy: actor.user.id,
        updatedBy: actor.user.id,
        version: 1,
      };
      const items: ManagedDemandItem[] = input.items.map((i) => {
        if (i.id)
          throw new SupplierError('VALIDATION', '新增明细 ID 由系统生成。');
        return {
          ...itemValues(i),
          source: 'mock',
          id: crypto.randomUUID(),
          demandId: d.id,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        };
      });
      const head = Object.fromEntries(headFields.map((k) => [k, d[k]]));
      repo.write(
        state,
        {
          ...state,
          demands: [...state.demands, d],
          items: [...state.items, ...items],
          history: [
            ...state.history,
            event(d.id, 'created', differences(null, head)),
            ...items.map((i) =>
              event(d.id, 'created', differences(null, itemValues(i)), i.id),
            ),
          ],
        },
        channelRepo,
        supplierRepo,
      );
      return project(d);
    },
    async updateSourcingDemand(id, version, input) {
      guard('sourcing:update');
      const s = repo.read();
      const d = check(s, id, version, true);
      validate(input);
      const oldItems = s.items.filter((i) => i.demandId === id);
      if (
        oldItems.some((i) => !input.items.some((v) => v.id === i.id)) ||
        new Set(input.items.flatMap((i) => (i.id ? [i.id] : []))).size !==
          input.items.filter((i) => i.id).length
      )
        throw new SupplierError(
          'VALIDATION',
          '已有明细不得删除或重复，关联迁移需独立流程。',
        );
      const now = new Date().toISOString();
      const nextItems = input.items.map((i) => {
        const old = i.id ? oldItems.find((v) => v.id === i.id) : undefined;
        if (i.id && (!old || old.modelId !== i.modelId))
          throw new SupplierError('VALIDATION', '已有明细的模型关联不可修改。');
        return {
          ...itemValues(i),
          source: 'mock' as const,
          id: old?.id ?? crypto.randomUUID(),
          demandId: id,
          status: old?.status ?? d.status,
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
        };
      });
      const after = {
        ...d,
        ...Object.fromEntries(headFields.map((k) => [k, input[k]])),
      } as ManagedDemand;
      const events = [
        event(
          id,
          'updated',
          differences(
            Object.fromEntries(headFields.map((k) => [k, d[k]])),
            Object.fromEntries(headFields.map((k) => [k, after[k]])),
          ),
        ),
        ...nextItems.map((i) => {
          const old = oldItems.find((v) => v.id === i.id);
          return event(
            id,
            'updated',
            differences(old ? itemValues(old) : null, itemValues(i)),
            i.id,
          );
        }),
      ];
      commit(
        s,
        d,
        {
          demands: s.demands.map((v) => (v.id === id ? after : v)),
          items: [...s.items.filter((i) => i.demandId !== id), ...nextItems],
        },
        events,
      );
      return project(repo.read().demands.find((v) => v.id === id)!);
    },
    async sourcingCandidates(id, itemId) {
      if (!readable()) return [];
      const s = repo.read();
      if (!visible(s, id)) return [];
      const item = itemsFor(s, id).find((i) => i.id === itemId);
      return item
        ? structuredClone(
            channels()
              .filter((c) => c.modelId === item.modelId)
              .map((c) => candidate(c, item)),
          )
        : [];
    },
    async addSourcingCandidate(id, version, itemId, channelId, assessment) {
      const actor = guard('sourcing:match');
      const s = repo.read();
      const d = check(s, id, version);
      const item = itemsFor(s, id).find((i) => i.id === itemId);
      const c = channels().find((c) => c.id === channelId);
      if (!item || !c || c.modelId !== item.modelId)
        throw new SupplierError(
          'FORBIDDEN',
          '候选渠道无效、未授权或与明细模型不一致。',
        );
      if (
        s.matches.some(
          (m) => m.demandItemId === itemId && m.channelId === channelId,
        )
      )
        throw new SupplierError(
          'DUPLICATE',
          '此渠道已有候选关系（含已排除记录），请修改已有关系。',
        );
      const now = new Date().toISOString();
      const match: ManagedMatch = {
        source: 'mock',
        id: crypto.randomUUID(),
        demandItemId: itemId,
        channelId,
        matchStatus: 'candidate',
        assessment: textNote(assessment),
        createdBy: actor.user.id,
        createdAt: now,
        updatedAt: now,
      };
      commit(s, d, { matches: [...s.matches, match] }, [
        event(
          id,
          'candidate_added',
          differences(null, {
            channelId,
            matchStatus: match.matchStatus,
            assessment: match.assessment,
          }),
          itemId,
          match.id,
        ),
      ]);
    },
    async updateSourcingCandidate(id, version, matchId, status, assessment) {
      guard('sourcing:match');
      const s = repo.read();
      const d = check(s, id, version);
      const match = s.matches.find((m) => m.id === matchId);
      const item = itemsFor(s, id).find((i) => i.id === match?.demandItemId);
      const c = channels().find((c) => c.id === match?.channelId);
      if (!match || !item || !c)
        throw new SupplierError('FORBIDDEN', '候选关联不存在或无权操作。');
      if (!Object.hasOwn(matchStatusLabels, status))
        throw new SupplierError('VALIDATION', '匹配状态无效。');
      if (status === 'suitable' && assessCapacity(item, c).result === 'no')
        throw new SupplierError(
          'VALIDATION',
          '当前资源明确不符合或已停用，不能标记初步符合。',
        );
      const note = textNote(assessment);
      commit(
        s,
        d,
        {
          matches: s.matches.map((m) =>
            m.id === match.id
              ? {
                  ...m,
                  matchStatus: status,
                  assessment: note,
                  updatedAt: new Date().toISOString(),
                }
              : m,
          ),
        },
        [
          event(
            id,
            'candidate_updated',
            differences(
              { matchStatus: match.matchStatus, assessment: match.assessment },
              { matchStatus: status, assessment: note },
            ),
            item.id,
            match.id,
          ),
        ],
      );
    },
    async progressSourcing(id, version, status, note) {
      guard('sourcing:progress');
      const s = repo.read();
      const d = check(s, id, version, true);
      if (!sourcingTransitions[d.status].includes(status))
        throw new SupplierError('VALIDATION', '不允许此寻源状态流转。');
      const items = itemsFor(s, id);
      const coverages = items.map((i) =>
        sourcingCoverage(i, s.matches, channels(), d.status),
      );
      if (status === 'matched' && coverages.some((c) => c.missing > 0))
        throw new SupplierError(
          'VALIDATION',
          '各明细至少三家人工初步符合且无明确不符的供应商后才能标记已匹配。',
        );
      if (status === 'gap' && !coverages.some((c) => c.missing > 0))
        throw new SupplierError(
          'VALIDATION',
          '当前明细已初步覆盖三家，不应标记资源不足。',
        );
      commit(
        s,
        d,
        {
          demands: s.demands.map((v) => (v.id === id ? { ...v, status } : v)),
          items: s.items.map((i) =>
            i.demandId === id
              ? { ...i, status, updatedAt: new Date().toISOString() }
              : i,
          ),
        },
        [
          event(
            id,
            'progress',
            differences({ status: d.status }, { status }),
            null,
            null,
            textNote(note),
          ),
        ],
      );
    },
    async resetSourcingDemo(confirmed) {
      const actor = guard('sourcing:update');
      if (confirmed !== true || domain || actor.domains.length !== 2)
        throw new SupplierError(
          'FORBIDDEN',
          '仅双域运营在全部域二次确认后可重置需求、明细、候选和寻源历史；保留供应商和渠道。',
        );
      repo.reset(channelRepo, supplierRepo);
    },
  };
}
