import type { AccessContext, PermissionAction, Role } from '../auth/types';
import { can } from '../auth/policy';
import type { Channel, BusinessDomain } from '../domain/entities';
import type {
  DeliveryRecord,
  LifecycleState,
  Phase,
  PhaseVerification,
  WorkType,
  ActiveDeliveryStep,
  LifecycleTask,
} from '../domain/lifecycle';
import {
  contractLabels,
  dispatchLabels,
  deliveryProgress,
  workLabels,
  isLifecycleNotice,
  phaseFailureWork,
  progressStepId,
} from '../domain/lifecycle';
import type { LifecycleApi, LifecycleRow } from '../services/lifecycle-types';
import type { ChannelState } from '../services/channel-types';
import type { ChannelRepository } from './channel-repository';
import type { SupplierRepository } from './supplier-repository';
import type { SourcingRepository } from './sourcing-repository';
import type { QuoteRepository } from './quote-repository';
import { fixture } from './data';
import { modelDomain } from '../domain/rules';
import { basisFor } from './testing-state';
import { SupplierError } from '../services/supplier-types';
import { fingerprint } from './remediation-repository';
import { assertLifecycleReferences } from './lifecycle-repository';
const bad = (message: string): never => {
  throw new SupplierError('VALIDATION', message);
};
const text = (v: string) => {
  if (
    typeof v !== 'string' ||
    !v.trim() ||
    v.length > 2000 ||
    /\bsk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+/i.test(v)
  )
    bad('请仅填写非敏感模拟说明，不得包含凭据。');
  return v.trim();
};
const ref = (v: string) => {
  if (typeof v !== 'string' || !/^mock:[A-Za-z0-9_:/.-]{1,140}$/.test(v))
    bad('仅接受 mock: 安全占位引用，禁止真实 Key、网址或合同文件。');
  return v;
};
const date = (v: string | null) => {
  if (
    v !== null &&
    (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v) ||
      !Number.isFinite(Date.parse(v)))
  )
    bad('时间必须包含明确时区。');
  return v;
};
const measure = (v: number | null) => {
  if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0))
    bad('实测/承诺指标须为非负数或未知。');
  return v;
};
export function createLifecycleApi(
  ctx: AccessContext | null,
  channels: ChannelRepository,
  suppliers: SupplierRepository,
  sourcing: SourcingRepository,
  quotes: QuoteRepository,
  visible: () => readonly Channel[],
  active: () => boolean,
  domain?: BusinessDomain,
) {
  const repo = channels.lifecycle;
  const guard = (action: PermissionAction) => {
    if (!ctx || !active() || !ctx.domains.length || !can(ctx, action))
      throw new SupplierError('FORBIDDEN', '当前身份或业务域无此交付权限。');
    return ctx;
  };
  const channel = (id: string) => {
    const c = visible().find((v) => v.id === id);
    if (!c) throw new SupplierError('FORBIDDEN', '对象不存在或不在授权范围。');
    return c;
  };
  const userAllowed = (
    id: string,
    c: Channel,
    roles?: readonly Role[],
    scope?: ReturnType<SupplierRepository['read']>,
  ) => {
    const u = fixture.users.find((u) => u.id === id),
      domain = modelDomain(
        fixture.models.find((m) => m.id === c.modelId)!,
        fixture.vendors,
      );
    return (
      !!u &&
      (!roles || roles.includes(u.role)) &&
      [
        'ProductOperations',
        'Procurement',
        'Testing',
        'OperationsSupport',
      ].includes(u.role) &&
      fixture.domainGrants.some(
        (g) => g.userId === id && g.businessDomain === domain,
      ) &&
      (u.role !== 'Procurement' ||
        (scope ?? suppliers.read()).maintenance.some(
          (g) => g.userId === id && g.supplierId === c.supplierId,
        ))
    );
  };
  const requireUser = (id: string, c: Channel, role: Role) => {
    if (!userAllowed(id, c, [role]))
      bad('负责人须具备该渠道业务域、供应商范围及对应岗位授权。');
  };
  const verification = (
    s: LifecycleState,
    c: ChannelState,
    r: DeliveryRecord,
    phase: Phase,
  ) => {
    const ch = c.channels.find((c) => c.id === r.channelId)!;
    const v = s.verifications
      .filter((v) => v.channelId === r.channelId && v.phase === phase)
      .at(-1);
    if (!v) return null;
    const e = c.executions.find((e) => e.id === v.executionId),
      task = c.tasks.find((t) => t.id === e?.taskId),
      d = c.taskDefinitions.find((d) => d.taskId === task?.id);
    const laterFailure = c.executions.some(
      (x) =>
        x.termination === 'finished' &&
        x.result !== 'passed' &&
        x.basis === basisFor(ch) &&
        x.finishedAt! > v.occurredAt &&
        c.tasks.some(
          (t) =>
            t.id === x.taskId && t.channelId === ch.id && t.testType === phase,
        ),
    );
    if (
      !e ||
      !task ||
      e.origin !== 'recorded' ||
      e.termination !== 'finished' ||
      e.result !== 'passed' ||
      v.conclusion !== 'passed' ||
      v.basis !== basisFor(ch) ||
      d?.targetVersion !== v.targetVersion ||
      laterFailure
    )
      return null;
    if (
      phase === 'connectivity' &&
      (!r.configuredAt ||
        r.configuredBasis !== basisFor(ch) ||
        e.startedAt < r.configuredAt ||
        v.metering !== 'passed' ||
        v.billing !== 'passed')
    )
      return null;
    return v;
  };
  const enforceSafety = (
    state: LifecycleState,
    r: DeliveryRecord,
    actorId: string,
  ) => {
    const current = channels.read(),
      ch = current.channels.find((c) => c.id === r.channelId)!;
    const eligible =
      !!verification(state, current, r, 'quality') &&
      !!verification(state, current, r, 'connectivity') &&
      r.contractStage === 'effective' &&
      !!r.configuredAt &&
      !r.held &&
      !r.terminated &&
      ch.resourceStatus === 'enabled' &&
      !channels.remediations
        .read()
        .records.some((v) => v.channelId === ch.id && v.status !== 'closed');
    let changed = false;
    if (r.dispatch === 'open' && !eligible) {
      r.dispatch = 'paused';
      changed = true;
    }
    const availability =
      r.dispatch === 'open' && eligible
        ? ('open' as const)
        : r.dispatch === 'paused'
          ? ('suspended' as const)
          : ('closed' as const);
    if (ch.availabilityStatus !== availability) {
      const next = {
        ...ch,
        availabilityStatus: availability,
        version: ch.version + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: actorId,
      };
      channels.write(
        current,
        {
          ...current,
          channels: current.channels.map((c) => (c.id === ch.id ? next : c)),
          history: [
            ...current.history,
            {
              id: crypto.randomUUID(),
              channelId: ch.id,
              action: 'channel:update',
              actorUserId: actorId,
              occurredAt: next.updatedAt,
              reason:
                '生命周期安全条件重新核验；仅更新 Mock 调度状态，保留原历史。',
              changedFields: ['availabilityStatus'],
              beforeSnapshot: ch,
              afterSnapshot: next,
            },
          ],
        },
        suppliers,
      );
    }
    return changed;
  };
  const addTask = (
    s: LifecycleState,
    type: WorkType,
    c: Channel | null,
    demandId: string | null,
    assigneeId: string,
    sourceId: string,
    initiatorId: string,
    dueAt: string | null = null,
  ) => {
    const id = `lifecycle:${sourceId}:${type}:${assigneeId}`;
    const existing = s.tasks.find((t) => t.id === id);
    if (existing) {
      if (c && !existing.relatedChannelIds.includes(c.id)) {
        existing.relatedChannelIds.push(c.id);
        existing.version++;
      }
      return;
    }
    s.tasks.push({
      id,
      version: 1,
      archived: false,
      scopeDomains: c
        ? [
            modelDomain(
              fixture.models.find((m) => m.id === c.modelId)!,
              fixture.vendors,
            ),
          ]
        : [
            ...new Set(
              sourcing
                .read()
                .items.filter((i) => i.demandId === demandId)
                .map((i) =>
                  modelDomain(
                    fixture.models.find((m) => m.id === i.modelId)!,
                    fixture.vendors,
                  ),
                ),
            ),
          ],
      relatedChannelIds: c ? [c.id] : [],
      objectType: c ? 'channel' : 'demand',
      objectId: c?.id ?? demandId!,
      channelId: c?.id ?? null,
      demandId,
      type,
      title: workLabels[type],
      assigneeId,
      initiatorId,
      createdAt: new Date().toISOString(),
      dueAt,
      status: 'open',
      priority: ['supplier_feedback', 'supervise', 'replacement'].includes(type)
        ? 'high'
        : 'normal',
      sourceId,
      readAt: null,
      completedAt: null,
      completionActorId: null,
      completionReason: null,
    });
  };
  const finish = (
    s: LifecycleState,
    r: DeliveryRecord,
    types: WorkType[],
    actorId: string,
  ) => {
    for (const t of s.tasks)
      if (
        t.channelId === r.channelId &&
        types.includes(t.type) &&
        t.status === 'open'
      ) {
        t.version++;
        t.status = 'completed';
        t.completedAt = new Date().toISOString();
        t.completionActorId = actorId;
        t.completionReason = '对应业务事实已保存，系统同步完成。';
      }
  };
  const event = (
    s: LifecycleState,
    channelId: string | null,
    demandId: string | null,
    action: string,
    sourceId: string,
    actorId: string,
    reason: string,
    executionId: string | null = null,
    remediationId: string | null = null,
    before: DeliveryRecord | null = null,
    after: DeliveryRecord | null = null,
  ) => {
    s.events.push({
      id: crypto.randomUUID(),
      channelId,
      demandId,
      action,
      sourceId,
      actorId,
      reason,
      occurredAt: new Date().toISOString(),
      beforeVersion: before?.version ?? null,
      afterVersion: after?.version ?? null,
      executionId,
      remediationId,
      changes: fingerprint({ before, after }),
    });
  };
  const notifyFailure = (
    s: LifecycleState,
    r: DeliveryRecord,
    ch: Channel,
    phase: Phase,
    sourceId: string,
    actorId: string,
  ) => {
    for (const type of phaseFailureWork(phase)) {
      const assignee =
        type === 'supplier_feedback'
          ? r.testerId
          : type === 'supervise'
            ? r.operatorId
            : r.procurementOwnerId;
      const source =
        type === 'replacement' && r.demandId
          ? `replacement:${r.demandId}`
          : sourceId;
      addTask(
        s,
        type,
        ch,
        r.demandId,
        assignee,
        source,
        actorId,
        isLifecycleNotice(type) ? null : r.dueAt,
      );
    }
  };
  /** Only recognize deterministic automatic sources; handled/ambiguous records are preserved. */
  const mistakenTask = (
    s: LifecycleState,
    c: ChannelState,
    t: LifecycleTask,
  ): 'quality_passed_notice' | 'integration_failed_notice' | null => {
    if (
      !t.channelId ||
      t.id !== `lifecycle:${t.sourceId}:${t.type}:${t.assigneeId}` ||
      t.title !== workLabels[t.type]
    )
      return null;
    const v = s.verifications.find(
      (v) => v.id === t.sourceId && v.channelId === t.channelId,
    );
    if (
      t.type === 'supervise' &&
      v?.phase === 'quality' &&
      v.conclusion === 'passed'
    )
      return 'quality_passed_notice';
    if (t.type !== 'replacement') return null;
    const execution = c.executions.find(
      (e) =>
        `execution:${e.id}` === t.sourceId &&
        e.origin === 'recorded' &&
        e.termination === 'finished' &&
        e.result !== 'passed',
    );
    if (
      execution &&
      c.tasks.some(
        (task) =>
          task.id === execution.taskId &&
          task.channelId === t.channelId &&
          task.testType === 'connectivity',
      )
    )
      return 'integration_failed_notice';
    if (v?.phase === 'connectivity' && v.conclusion === 'failed')
      return 'integration_failed_notice';
    if (
      !t.demandId ||
      t.sourceId !== `replacement:${t.demandId}` ||
      !t.relatedChannelIds.length
    )
      return null;
    // An old grouped task can also contain a legitimate quality failure. Preserve it if uncertain.
    const onlyIntegration = t.relatedChannelIds.every((id) => {
      const r = s.records.find(
        (r) => r.channelId === id && r.demandId === t.demandId,
      );
      if (!r) return false;
      const qualityFailure =
        c.executions.some(
          (e) =>
            e.origin === 'recorded' &&
            e.termination === 'finished' &&
            e.result !== 'passed' &&
            e.startedAt >= r.acquiredAt &&
            c.tasks.some(
              (task) =>
                task.id === e.taskId &&
                task.channelId === id &&
                task.testType === 'quality',
            ),
        ) ||
        s.verifications.some(
          (v) =>
            v.channelId === id &&
            v.phase === 'quality' &&
            v.conclusion === 'failed',
        );
      return (
        !qualityFailure &&
        s.verifications.some(
          (v) =>
            v.channelId === id &&
            v.phase === 'connectivity' &&
            v.conclusion === 'failed' &&
            v.occurredAt <= t.createdAt,
        )
      );
    });
    return onlyIntegration ? 'integration_failed_notice' : null;
  };
  const reconcileTasks = (
    s: LifecycleState,
    c: ChannelState,
    audit = false,
  ) => {
    for (const task of [...s.tasks]) {
      const notice = mistakenTask(s, c, task);
      if (
        !notice ||
        task.status !== 'open' ||
        task.archived ||
        task.readAt ||
        task.completedAt ||
        task.completionActorId ||
        task.completionReason ||
        s.requests.some((r) => r.resultId === task.id)
      )
        continue;
      const allowed = new Set(visible().map((ch) => ch.id));
      if (
        !task.relatedChannelIds.length ||
        !task.relatedChannelIds.every((id) => allowed.has(id))
      )
        continue;
      const ch = c.channels.find((c) => c.id === task.channelId);
      if (!ch) continue;
      task.status = 'cancelled';
      task.version++;
      task.completionReason =
        'Stage 07D 验收兼容：自动任务与所属阶段不符，取消未处理待办并保留原来源。';
      task.completionActorId = audit ? ctx!.user.id : null;
      addTask(
        s,
        notice,
        ch,
        task.demandId,
        task.assigneeId,
        task.sourceId,
        task.initiatorId,
      );
      if (audit)
        event(
          s,
          task.channelId,
          task.demandId,
          'legacy-task-corrected',
          `compat-07d:${task.id}`,
          ctx!.user.id,
          task.completionReason,
        );
    }
  };
  const syncSignals = (id: string) => {
    const ch = channel(id),
      before = repo.read(),
      s = structuredClone(before),
      r = s.records.find((r) => r.channelId === id);
    if (!r) return;
    const c = channels.read();
    reconcileTasks(s, c, true);
    for (const e of c.executions.filter(
      (e) => e.origin === 'recorded' && e.termination === 'finished',
    )) {
      const t = c.tasks.find((t) => t.id === e.taskId);
      if (t?.channelId !== id || e.startedAt < r.acquiredAt) continue;
      const sourceId = `execution:${e.id}`;
      if (s.events.some((e) => e.sourceId === sourceId)) continue;
      event(
        s,
        id,
        r.demandId,
        'test-result',
        sourceId,
        e.performedBy ?? 'u-test',
        '新测试执行已保存；结果和采纳保持原模块权威。',
        e.id,
      );
      finish(
        s,
        r,
        [t.testType === 'quality' ? 'quality' : 'integration'],
        e.performedBy ?? r.testerId,
      );
      if (e.result === 'passed') {
        addTask(
          s,
          t.testType === 'quality' ? 'quality' : 'integration',
          ch,
          r.demandId,
          r.testerId,
          `phase-confirm:${e.id}`,
          e.performedBy ?? r.testerId,
          r.dueAt,
        );
        s.tasks
          .filter((t) => t.sourceId === `phase-confirm:${e.id}`)
          .forEach((t) => {
            t.title = '登记阶段核验与实测/计量计费指标';
          });
      }
      if (e.result !== 'passed')
        notifyFailure(
          s,
          r,
          ch,
          t.testType,
          sourceId,
          e.performedBy ?? r.testerId,
        );
    }
    if (fingerprint(s) !== fingerprint(before)) {
      if (enforceSafety(s, r, ctx!.user.id)) {
        r.version++;
        r.updatedAt = new Date().toISOString();
      }
      repo.write(before, s);
    }
  };
  const build = (
    c: ChannelState,
    s: LifecycleState,
    rem: ReturnType<ChannelRepository['remediations']['read']>,
    ch: Channel,
    sp: ReturnType<SupplierRepository['read']>,
    price: ReturnType<QuoteRepository['read']>,
  ): LifecycleRow => {
    const r = s.records.find((r) => r.channelId === ch.id) ?? null,
      m = fixture.models.find((m) => m.id === ch.modelId)!,
      supplier = sp.suppliers.find((v) => v.id === ch.supplierId)!;
    const q = r ? verification(s, c, r, 'quality') : null,
      i =
        r && q && r.contractStage === 'effective'
          ? verification(s, c, r, 'connectivity')
          : null;
    const activeRem = rem.records.filter(
      (v) => v.channelId === ch.id && v.status !== 'closed',
    );
    const failed = c.executions.filter(
      (e) =>
        e.origin === 'recorded' &&
        e.termination === 'finished' &&
        e.result !== 'passed' &&
        (!r || e.startedAt >= r.acquiredAt) &&
        c.tasks.some((t) => t.id === e.taskId && t.channelId === ch.id),
    );
    const unresolved = failed.filter(
      (e) =>
        !s.verifications.some(
          (v) =>
            v.channelId === ch.id &&
            v.conclusion === 'passed' &&
            v.occurredAt > e.finishedAt! &&
            c.tasks.some((t) => t.id === e.taskId && t.testType === v.phase),
        ),
    );
    const activeFailures = unresolved.filter(
      (e) =>
        !unresolved.some(
          (other) =>
            other.id !== e.id &&
            unresolved.indexOf(other) > unresolved.indexOf(e) &&
            c.tasks.find((t) => t.id === other.taskId)?.testType ===
              c.tasks.find((t) => t.id === e.taskId)?.testType,
        ),
    );
    const phaseFailure = s.verifications.filter(
      (v) =>
        v.channelId === ch.id &&
        v.conclusion === 'failed' &&
        !s.verifications.some(
          (p) =>
            p.channelId === ch.id &&
            p.phase === v.phase &&
            p.conclusion === 'passed' &&
            p.occurredAt > v.occurredAt,
        ),
    );
    const extra: ActiveDeliveryStep[] = [];
    const represented = new Set<string>();
    for (const phase of ['quality', 'connectivity'] as const) {
      const raw = activeFailures.find((e) =>
        c.tasks.some((t) => t.id === e.taskId && t.testType === phase),
      );
      const human = phaseFailure.filter((v) => v.phase === phase).at(-1);
      const executionId =
        human && (!raw || human.occurredAt >= raw.finishedAt!)
          ? human.executionId
          : raw?.id;
      if (!executionId) continue;
      const feedback = s.events
        .filter(
          (v) =>
            v.channelId === ch.id &&
            v.action === 'feedback' &&
            v.executionId === executionId,
        )
        .at(-1);
      const remedy = activeRem
        .filter(
          (v) =>
            v.relatedTestExecutionId === executionId ||
            (v.relatedTestExecutionId === null &&
              v.verificationScope === phase),
        )
        .at(-1);
      const base = { phase, executionId, ownerId: r?.testerId ?? null };
      extra.push({
        ...base,
        id: progressStepId(`${executionId}:failure`),
        kind: 'failure',
        label: '测试失败（历史事实，不计完成）',
        done: false,
        state: 'failed',
      });
      extra.push({
        ...base,
        id: progressStepId(`${executionId}:feedback`),
        kind: 'feedback',
        label: '反馈供应商',
        done: !!feedback,
        state: feedback ? 'completed' : 'waiting_feedback',
        completedAt: feedback?.occurredAt ?? null,
      });
      if (remedy) {
        represented.add(remedy.id);
        const submission = rem.submissions.find(
          (v) =>
            v.remediationId === remedy.id && v.round === remedy.activeRound,
        );
        extra.push({
          ...base,
          id: progressStepId(`${remedy.id}:${remedy.activeRound}`),
          kind: 'remediation',
          remediationId: remedy.id,
          round: remedy.activeRound,
          label: `整改第 ${remedy.activeRound ?? '旧'} 轮 · ${remedy.status === 'submitted' ? '等待复测' : remedy.status === 'in_progress' ? '供应商整改中' : '等待供应商整改'}`,
          done: remedy.status === 'submitted',
          state:
            remedy.status === 'submitted' ? 'waiting_retest' : 'remediating',
          completedAt: submission?.submittedAt ?? null,
          ownerId: remedy.assigneeUserId,
        });
      }
      extra.push({
        ...base,
        id: progressStepId(`${executionId}:retest`),
        kind: 'retest',
        label: '复测中或等待重新测试',
        done: false,
        state: 'waiting_retest',
        remediationId: remedy?.id ?? null,
        round: remedy?.activeRound ?? null,
      });
    }
    // Explicit/manual legacy remediation still needs attention even without a linked execution.
    for (const phase of ['quality', 'connectivity', null] as const) {
      const remedy = activeRem
        .filter((v) => v.verificationScope === phase && !represented.has(v.id))
        .at(-1);
      if (remedy)
        extra.push({
          id: progressStepId(`${remedy.id}:${remedy.activeRound}`),
          phase: phase ?? 'resource',
          kind: 'remediation',
          label: '存在未关闭整改，需人工核验',
          done: false,
          state:
            remedy.status === 'submitted' ? 'waiting_retest' : 'remediating',
          remediationId: remedy.id,
          round: remedy.activeRound,
          ownerId: remedy.assigneeUserId,
        });
    }
    const completed = [
      !!r,
      !!q,
      !!r && r.contractStage === 'effective' && !!r.electronicEffectiveAt,
      !!r?.configuredAt && r.configuredBasis === basisFor(ch),
      !!i,
      !!r?.openedAt,
    ];
    const p = deliveryProgress(
      completed,
      extra,
      !!r?.held,
      !!r?.terminated,
      r?.dispatch ?? 'not_open',
    );
    const milestoneOwners = [
      r?.procurementOwnerId,
      r?.testerId,
      r?.procurementOwnerId,
      r?.operatorId,
      r?.testerId,
      r?.operatorId,
    ];
    const milestoneTimes = [
      r?.acquiredAt,
      q?.occurredAt,
      r?.electronicEffectiveAt,
      r?.configuredAt,
      i?.occurredAt,
      r?.openedAt,
    ];
    p.steps.forEach((step, index) => {
      step.ownerId = milestoneOwners[index] ?? null;
      step.completedAt = step.done ? (milestoneTimes[index] ?? null) : null;
      step.executionId =
        index === 1
          ? (q?.executionId ?? null)
          : index === 4
            ? (i?.executionId ?? null)
            : null;
    });
    if (
      !can(ctx!, 'lifecycle:verify') &&
      !can(ctx!, 'production-config:update')
    )
      p.orderedSteps.forEach((step) => {
        step.executionId = null;
      });
    const stageIndex = completed.findIndex((v) => !v),
      stage = stageIndex < 0 ? '交付已完成' : p.steps[stageIndex]!.label;
    const ownerId = !r
      ? null
      : stageIndex === 1 || stageIndex === 4
        ? r.testerId
        : stageIndex === 0 || stageIndex === 2
          ? r.procurementOwnerId
          : r.operatorId;
    const abnormal =
      !!r?.held ||
      !!r?.terminated ||
      unresolved.length > 0 ||
      phaseFailure.length > 0 ||
      activeRem.length > 0 ||
      r?.dispatch === 'paused' ||
      r?.dispatch === 'disabled' ||
      r?.contractStage === 'paused' ||
      r?.contractStage === 'terminated';
    const schedulable =
      p.schedulable &&
      ch.resourceStatus === 'enabled' &&
      ch.availabilityStatus === 'open' &&
      !activeRem.length &&
      !unresolved.length;
    const blocker = !r
      ? '旧资料待补充核验；不能推断合同、配置和两阶段通过'
      : r.terminated
        ? '渠道交付已终止'
        : r.held
          ? '人工挂起，等待恢复'
          : activeRem.length
            ? '存在未关闭整改'
            : unresolved.length
              ? '测试失败或不确定，需供应商整改及新执行复测'
              : r.contractStage === 'paused' || r.contractStage === 'terminated'
                ? '合同暂停或终止'
                : p.delivered && !schedulable
                  ? '交付历史保留，当前不可调度'
                  : stageIndex === 1
                    ? '需要当前配置下实际质量通过执行及阶段确认'
                    : stageIndex === 2
                      ? '采购尚未登记有效电子合同'
                      : stageIndex === 3
                        ? '运营尚未完成生产配置'
                        : stageIndex === 4
                          ? '连通性、计量、计费和最终人工结论须分别通过'
                          : stageIndex === 5
                            ? '等待产品运营确认开放'
                            : '无';
    const last = s.verifications.filter((v) => v.channelId === ch.id).at(-1);
    const row: LifecycleRow = {
      id: ch.id,
      modelId: m.id,
      platformModelId: m.id,
      modelName: m.name,
      upstreamModelName: ch.modelInvocationName,
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierShortCode: supplier.shortCode,
      channelType: ch.channelType,
      channelName: ch.displayName,
      version: r?.version ?? 0,
      record: r ? structuredClone(r) : null,
      qualityVerificationId: q?.id ?? null,
      integrationVerificationId: i?.id ?? null,
      percent: p.percent,
      delivered: p.delivered || !!r?.openedAt,
      schedulable,
      legacy: !r,
      stage: r?.held ? '人工挂起' : r?.terminated ? '已终止' : stage,
      stageIndex,
      currentOwnerId: ownerId,
      currentOwner:
        fixture.users.find((u) => u.id === ownerId)?.name ?? '待分配',
      blocker,
      nextAction: !r
        ? '采购确认资源获取与岗位交接'
        : p.delivered
          ? '运营维护当前调度状态'
          : `${fixture.users.find((u) => u.id === ownerId)?.name ?? '对应岗位'}处理${stage}`,
      updatedAt: [
        ch.updatedAt,
        r?.updatedAt ?? '',
        ...s.events
          .filter((v) => v.channelId === ch.id)
          .map((e) => e.occurredAt),
        ...rem.records
          .filter((v) => v.channelId === ch.id)
          .map((r) => r.updatedAt),
      ]
        .sort()
        .at(-1)!,
      dueAt: r?.dueAt ?? null,
      overdue: !!r?.dueAt && !p.delivered && r.dueAt < new Date().toISOString(),
      abnormal,
      steps: p.steps,
      extra: p.extra,
      orderedSteps: p.orderedSteps,
      promised: {
        ttftMs: ch.ttftMs,
        rpm: ch.rpm,
        tpm: ch.tpm,
        concurrency: ch.concurrencyLimit,
      },
      measured: last
        ? {
            ttftMs: last.ttftMs,
            rpm: last.rpm,
            tpm: last.tpm,
            concurrency: last.concurrency,
          }
        : null,
      contractStage: r ? contractLabels[r.contractStage] : '待补充核验',
      dispatch: r ? dispatchLabels[r.dispatch] : '旧开放状态不代表新交付完成',
      quality: q ? '已核验通过' : '待补充核验',
      integration: i ? '连通性、计量及计费已核验' : '待补充核验',
      remediationIds: activeRem.map((r) => r.id),
    };
    if (can(ctx!, 'quote:read'))
      row.quoteStatus = `授权报价历史 ${price.quotes.filter((v) => v.channelId === ch.id).length} 条；不代表合同生效`;
    if (!can(ctx!, 'contract:read') && row.record) {
      row.record.contractNumber = null;
      row.record.contractHandler = '受限';
      row.record.nextAction = '由采购在授权范围推进合同';
      row.record.usageTerms = '仅采购及运营可见';
    }
    if (ctx!.user.role === 'OperationsSupport') row.record = null;
    return row;
  };
  const getRows = (requestedIds?: ReadonlySet<string>) => {
    const c = channels.read(),
      s = repo.read(),
      rem = channels.remediations.read(),
      sp = suppliers.read(),
      price = quotes.read(),
      allowed = new Set(visible().map((c) => c.id));
    return {
      c,
      s,
      rem,
      sp,
      price,
      rows: c.channels
        .filter(
          (c) => allowed.has(c.id) && (!requestedIds || requestedIds.has(c.id)),
        )
        .map((ch) => build(c, s, rem, ch, sp, price)),
    };
  };
  const request = (s: LifecycleState, key: string, payload: unknown) => {
    if (!/^[\w-]{8,100}$/.test(key)) bad('请求标识无效。');
    const old = s.requests.find((r) => r.id === `${ctx!.user.id}:${key}`);
    if (old && old.fingerprint !== fingerprint(payload))
      throw new SupplierError('CONFLICT', '请求标识冲突。');
    return old;
  };
  const checkDemand = (id: string) => {
    const s = sourcing.read(),
      d = s.demands.find((d) => d.id === id),
      items = s.items.filter((i) => i.demandId === id);
    if (
      !d ||
      !items.length ||
      !items.every((i) =>
        fixture.models.some(
          (m) =>
            m.id === i.modelId &&
            ctx!.domains.includes(modelDomain(m, fixture.vendors)) &&
            (!domain || modelDomain(m, fixture.vendors) === domain),
        ),
      )
    )
      throw new SupplierError('FORBIDDEN', '需求不存在或无完整业务域授权。');
    return d;
  };
  const api: LifecycleApi = {
    async queryLifecycle(filter = {}) {
      guard('lifecycle:read');
      const { rows, c, sp } = getRows();
      const stats = {
        total: rows.length,
        open: rows.filter((r) => r.schedulable).length,
        qualityPending: rows.filter((r) => r.stageIndex === 1 || r.legacy)
          .length,
        qualityRisk: rows.filter((r) => r.abnormal && r.stageIndex <= 2).length,
        contracts: rows.filter((r) => r.stageIndex === 2).length,
        configuration: rows.filter((r) => r.stageIndex === 3).length,
        integration: rows.filter((r) => r.stageIndex === 4).length,
        abnormal: rows.filter((r) => r.abnormal).length,
        mine: rows.filter((r) => r.currentOwnerId === ctx!.user.id).length,
      };
      return {
        rows: rows.filter(
          (r) =>
            (!filter.modelId || r.modelId === filter.modelId) &&
            (!filter.supplierId || r.supplierId === filter.supplierId) &&
            (!filter.stage || r.stage === filter.stage) &&
            (!filter.ownerId || r.currentOwnerId === filter.ownerId) &&
            (filter.open === undefined || r.schedulable === filter.open) &&
            (filter.abnormal === undefined || r.abnormal === filter.abnormal) &&
            (!filter.mine || r.currentOwnerId === ctx!.user.id) &&
            (!filter.overdue || r.overdue),
        ),
        stats,
        users: fixture.users
          .filter((u) =>
            rows.some((r) =>
              userAllowed(
                u.id,
                c.channels.find((c) => c.id === r.id)!,
                undefined,
                sp,
              ),
            ),
          )
          .map((u) => ({ id: u.id, name: u.name, role: u.role })),
      };
    },
    async getLifecycle(id) {
      guard('lifecycle:read');
      if (!visible().some((c) => c.id === id)) return null;
      const { c, s, rem, rows } = getRows(),
        row = rows.find((r) => r.id === id)!,
        technical = can(ctx!, 'lifecycle:verify');
      return {
        row,
        verifications:
          technical || can(ctx!, 'production-config:update')
            ? s.verifications.filter((v) => v.channelId === id)
            : [],
        events:
          ctx!.user.role === 'OperationsSupport'
            ? []
            : s.events
                .filter((v) => v.channelId === id)
                .map((e) => ({
                  ...e,
                  changes: can(ctx!, 'contract:read')
                    ? e.changes
                    : '受限业务版本变更',
                  reason:
                    !can(ctx!, 'contract:read') &&
                    !['verify', 'feedback'].includes(e.action)
                      ? '授权技术交付状态更新'
                      : e.reason,
                })),
        comments: s.comments.filter(
          (v) =>
            v.channelId === id &&
            (v.authorId === ctx!.user.id ||
              v.recipientIds.includes(ctx!.user.id)),
        ),
        executions: technical
          ? c.executions
              .filter(
                (e) =>
                  e.origin === 'recorded' &&
                  e.termination === 'finished' &&
                  c.tasks.some((t) => t.id === e.taskId && t.channelId === id),
              )
              .map((e) => ({
                id: e.id,
                taskId: e.taskId,
                phase: c.tasks.find((t) => t.id === e.taskId)!.testType,
                result: e.result,
                startedAt: e.startedAt,
                current: e.basis === basisFor(channel(id)),
              }))
          : [],
        remediations: rem.records
          .filter((r) => r.channelId === id)
          .map((r) => ({
            id: r.id,
            status: r.status,
            sourceExecutionId:
              technical || ctx!.user.role === 'ProductOperations'
                ? r.relatedTestExecutionId
                : null,
            round: r.activeRound,
          })),
        communication:
          ctx!.user.role === 'OperationsSupport'
            ? null
            : (s.communications.find((v) => v.supplierId === row.supplierId) ??
              null),
      };
    },
    async lifecycleOptions(id) {
      guard('lifecycle:read');
      const c = channel(id);
      return {
        users: fixture.users
          .filter((u) => userAllowed(u.id, c))
          .map((u) => ({ id: u.id, name: u.name, role: u.role })),
        demands: sourcing
          .read()
          .demands.filter((d) =>
            sourcing
              .read()
              .items.some(
                (i) => i.demandId === d.id && i.modelId === c.modelId,
              ),
          )
          .map((d) => ({ id: d.id, label: d.sharedTitle })),
      };
    },
    async changeLifecycle(id, version, input, reason, key) {
      const allowedFields: Record<string, readonly string[]> = {
        assign: ['procurementOwnerId', 'testerId', 'operatorId'],
        acquire: [
          'procurementOwnerId',
          'testerId',
          'operatorId',
          'demandId',
          'dueAt',
          'credentialStatus',
          'credentialReference',
          'credentialRecipientId',
          'usageTerms',
        ],
        resource: [
          'platformModelId',
          'upstreamModelName',
          'endpointReference',
          'ttftMs',
          'rpm',
          'tpm',
          'concurrency',
          'credentialStatus',
          'credentialReference',
          'usageTerms',
        ],
        verify: [
          'phase',
          'executionId',
          'ttftMs',
          'rpm',
          'tpm',
          'concurrency',
          'metering',
          'billing',
          'conclusion',
          'evidenceReference',
        ],
        contract: [
          'stage',
          'number',
          'handler',
          'nextAction',
          'nextOwnerId',
          'dueAt',
          'effectiveAt',
          'paperStatus',
        ],
        configuration: [
          'sent',
          'recipientId',
          'received',
          'configured',
          'reference',
        ],
        dispatch: ['state'],
        hold: [],
        resume: [],
        terminate: [],
        feedback: [
          'executionId',
          'remediationId',
          'recipientId',
          'feedbackAt',
          'summary',
        ],
        comment: ['body', 'recipientIds'],
        'supplier-communication': ['groupName', 'notes'],
      };
      if (
        !input ||
        !Object.hasOwn(allowedFields, input.action) ||
        Object.keys(input).some(
          (k) => k !== 'action' && !allowedFields[input.action]!.includes(k),
        )
      )
        bad('包含未批准的交付字段，拒绝写入未知凭据或数据。');
      if (
        input.action === 'configuration' &&
        [input.sent, input.received, input.configured].some(
          (v) => typeof v !== 'boolean',
        )
      )
        bad('生产配置状态必须为明确布尔值。');
      if (
        (input.action === 'acquire' || input.action === 'resource') &&
        !['pending', 'received'].includes(input.credentialStatus)
      )
        bad('凭据状态无效。');
      const permissions: Record<string, PermissionAction> = {
        assign: 'lifecycle:manage',
        acquire: 'resource:acquire',
        resource: 'resource:acquire',
        verify: 'lifecycle:verify',
        contract: 'contract:update',
        configuration: 'production-config:update',
        dispatch: 'lifecycle:open',
        hold: 'lifecycle:manage',
        resume: 'lifecycle:manage',
        terminate: 'lifecycle:manage',
        feedback: 'lifecycle:feedback',
        comment: 'notification:mention',
        'supplier-communication': 'resource:acquire',
      };
      const actor = guard(permissions[input.action] ?? 'lifecycle:manage'),
        ch = channel(id);
      text(reason);
      const before = repo.read(),
        s = structuredClone(before),
        payload = { id, version, input, reason };
      if (request(s, key, payload)) return;
      reconcileTasks(s, channels.read(), true);
      const old = s.records.find((r) => r.channelId === id) ?? null;
      if ((old?.version ?? 0) !== version)
        throw new SupplierError('CONFLICT', '交付版本变化，请刷新。');
      let r: DeliveryRecord;
      if (input.action === 'acquire') {
        if (old) bad('已确认获取，不重复初始化。');
        requireUser(input.procurementOwnerId, ch, 'Procurement');
        requireUser(input.testerId, ch, 'Testing');
        requireUser(input.operatorId, ch, 'ProductOperations');
        if (
          input.procurementOwnerId !==
          suppliers.read().suppliers.find((v) => v.id === ch.supplierId)!
            .ownerUserId
        )
          bad('采购负责人须沿用供应商当前采购负责人。');
        if (input.demandId) {
          checkDemand(input.demandId);
          if (
            !sourcing
              .read()
              .items.some(
                (i) =>
                  i.demandId === input.demandId && i.modelId === ch.modelId,
              )
          )
            bad('需求模型不匹配。');
        }
        date(input.dueAt);
        if (input.credentialReference !== null) ref(input.credentialReference);
        if (input.credentialStatus === 'received' && !input.credentialReference)
          bad('已接收测试凭据须填写安全占位引用。');
        requireUser(input.credentialRecipientId, ch, 'Testing');
        const at = new Date().toISOString();
        r = {
          channelId: id,
          version: 1,
          acquiredAt: at,
          procurementOwnerId: input.procurementOwnerId,
          testerId: input.testerId,
          operatorId: input.operatorId,
          demandId: input.demandId,
          dueAt: input.dueAt,
          credentialStatus: input.credentialStatus,
          credentialReference: input.credentialReference,
          credentialRecipientId: input.credentialRecipientId,
          usageTerms: text(input.usageTerms),
          contractStage: 'drafting',
          contractNumber: null,
          contractHandler: '采购',
          nextAction: '第一阶段质量测试',
          nextOwnerId: input.testerId,
          contractDueAt: null,
          electronicEffectiveAt: null,
          paperStatus: 'unknown',
          credentialSent: false,
          productionRecipientId: input.operatorId,
          productionReceived: false,
          productionReference: null,
          configuredAt: null,
          configuredBy: null,
          configuredBasis: null,
          dispatch: 'not_open',
          openedAt: null,
          openedBy: null,
          openingQualityId: null,
          openingIntegrationId: null,
          held: false,
          terminated: false,
          updatedAt: at,
        };
        s.records.push(r);
        addTask(
          s,
          'quality',
          ch,
          r.demandId,
          r.testerId,
          `acquire:${id}`,
          actor.user.id,
          r.dueAt,
        );
      } else {
        if (!old) bad('请先由采购确认资源获取与岗位交接。');
        r = {
          ...old!,
          version: old!.version + 1,
          updatedAt: new Date().toISOString(),
        };
        s.records = s.records.map((v) => (v.channelId === id ? r : v));
        if (r.terminated && input.action !== 'comment')
          bad('已终止的交付不能继续推进。');
        const c = channels.read();
        const q = verification(s, c, r, 'quality'),
          i = verification(s, c, r, 'connectivity');
        if (input.action === 'assign') {
          requireUser(input.procurementOwnerId, ch, 'Procurement');
          requireUser(input.testerId, ch, 'Testing');
          requireUser(input.operatorId, ch, 'ProductOperations');
          if (
            input.procurementOwnerId !==
            suppliers.read().suppliers.find((p) => p.id === ch.supplierId)!
              .ownerUserId
          )
            bad('采购交接须沿用当前供应商采购负责人。');
          r.procurementOwnerId = input.procurementOwnerId;
          r.testerId = input.testerId;
          r.operatorId = input.operatorId;
          for (const t of s.tasks.filter(
            (t) => t.channelId === id && t.status === 'open',
          )) {
            const to = ['quality', 'integration', 'supplier_feedback'].includes(
              t.type,
            )
              ? r.testerId
              : ['contract', 'replacement', 'backup'].includes(t.type)
                ? r.procurementOwnerId
                : ['configuration', 'opening', 'supervise'].includes(t.type)
                  ? r.operatorId
                  : t.assigneeId;
            if (t.assigneeId !== to) {
              t.assigneeId = to;
              t.readAt = null;
              t.version++;
            }
          }
        } else if (input.action === 'resource') {
          if (input.platformModelId !== ch.modelId)
            bad('平台模型必须沿用当前 Model/Channel 关联。');
          ref(input.endpointReference);
          if (input.credentialReference !== null)
            ref(input.credentialReference);
          text(input.upstreamModelName);
          [input.ttftMs, input.rpm, input.tpm, input.concurrency].forEach(
            measure,
          );
          r.credentialStatus = input.credentialStatus;
          r.credentialReference = input.credentialReference;
          r.usageTerms = text(input.usageTerms);
          const current = channels.read(),
            base = current.channels.find((v) => v.id === id)!,
            next = {
              ...base,
              modelInvocationName: input.upstreamModelName,
              endpointReference: input.endpointReference,
              ttftMs: input.ttftMs,
              rpm: input.rpm,
              tpm: input.tpm,
              concurrencyLimit: input.concurrency,
              version: base.version + 1,
              updatedAt: r.updatedAt,
              updatedBy: actor.user.id,
            };
          channels.write(
            current,
            {
              ...current,
              channels: current.channels.map((v) => (v.id === id ? next : v)),
              history: [
                ...current.history,
                {
                  id: crypto.randomUUID(),
                  channelId: id,
                  action: 'channel:update',
                  actorUserId: actor.user.id,
                  occurredAt: r.updatedAt,
                  reason,
                  changedFields: [
                    'modelInvocationName',
                    'endpointReference',
                    'ttftMs',
                    'rpm',
                    'tpm',
                    'concurrencyLimit',
                  ],
                  beforeSnapshot: base,
                  afterSnapshot: next,
                },
              ],
            },
            suppliers,
          );
        } else if (input.action === 'verify') {
          if (r.held) bad('挂起中不能确认交付节点。');
          if (actor.user.id !== r.testerId)
            throw new SupplierError(
              'FORBIDDEN',
              '仅当前测试负责人可确认阶段核验。',
            );
          const e = c.executions.find((e) => e.id === input.executionId),
            t = c.tasks.find((t) => t.id === e?.taskId),
            d = c.taskDefinitions.find((d) => d.taskId === t?.id);
          if (
            !e ||
            !t ||
            t.channelId !== id ||
            t.testType !== input.phase ||
            e.origin !== 'recorded' ||
            e.termination !== 'finished' ||
            e.basis !== basisFor(ch) ||
            e.targetVersion !== d?.targetVersion ||
            e.startedAt < r.acquiredAt
          )
            bad(
              '须选择本交付获取之后、当前目标及配置下真实保存的对应测试执行。',
            );
          if (
            input.phase === 'quality' &&
            (r.credentialStatus !== 'received' || !r.credentialReference)
          )
            bad('须先确认测试凭据安全引用已接收。');
          if (
            input.phase === 'connectivity' &&
            (!q ||
              r.contractStage !== 'effective' ||
              !r.configuredAt ||
              r.configuredBasis !== basisFor(ch) ||
              e!.startedAt < r.configuredAt)
          )
            bad(
              '第二阶段需要第一阶段、有效合同和当前生产配置，执行须在配置后开始。',
            );
          if (
            !['passed', 'failed'].includes(input.conclusion) ||
            !['pending', 'passed', 'failed'].includes(input.metering) ||
            !['pending', 'passed', 'failed'].includes(input.billing)
          )
            bad('阶段核验状态无效。');
          if (
            input.conclusion === 'passed' &&
            (e!.result !== 'passed' ||
              (input.phase === 'connectivity' &&
                (input.metering !== 'passed' || input.billing !== 'passed')))
          )
            bad('不能仅凭 API 成功确认第二阶段通过，计量和计费也必须通过。');
          if (s.verifications.some((v) => v.executionId === input.executionId))
            bad(
              '该执行已登记阶段核验；阶段失败后的复测须使用新执行，历史不可覆盖。',
            );
          const lastFailure = s.verifications
            .filter(
              (v) =>
                v.channelId === id &&
                v.phase === input.phase &&
                v.conclusion === 'failed',
            )
            .at(-1);
          if (
            input.conclusion === 'passed' &&
            lastFailure &&
            e!.startedAt < lastFailure.occurredAt
          )
            bad('阶段失败后必须开始新的真实复测，不能重用原执行改成通过。');
          const v: PhaseVerification = {
            id: crypto.randomUUID(),
            channelId: id,
            phase: input.phase,
            executionId: e!.id,
            basis: e!.basis!,
            targetVersion: e!.targetVersion!,
            ttftMs: measure(input.ttftMs),
            rpm: measure(input.rpm),
            tpm: measure(input.tpm),
            concurrency: measure(input.concurrency),
            metering: input.metering,
            billing: input.billing,
            conclusion: input.conclusion,
            evidenceReference: ref(input.evidenceReference),
            actorId: actor.user.id,
            occurredAt: r.updatedAt,
          };
          s.verifications.push(v);
          if (input.conclusion === 'passed') {
            finish(
              s,
              r,
              input.phase === 'quality'
                ? ['quality', 'supplier_feedback']
                : ['integration', 'supplier_feedback'],
              actor.user.id,
            );
            if (input.phase === 'quality') {
              addTask(
                s,
                'contract',
                ch,
                r.demandId,
                r.procurementOwnerId,
                v.id,
                actor.user.id,
                r.contractDueAt,
              );
              addTask(
                s,
                'quality_passed_notice',
                ch,
                r.demandId,
                r.operatorId,
                v.id,
                actor.user.id,
              );
            } else
              addTask(
                s,
                'opening',
                ch,
                r.demandId,
                r.operatorId,
                v.id,
                actor.user.id,
                r.dueAt,
              );
          } else {
            const failureSource =
              e!.result === 'passed' ? v.id : `execution:${e!.id}`;
            notifyFailure(s, r, ch, input.phase, failureSource, actor.user.id);
          }
        } else if (input.action === 'contract') {
          if (actor.user.id !== r.procurementOwnerId)
            throw new SupplierError(
              'FORBIDDEN',
              '仅原采购负责人登记合同进度。',
            );
          if (
            ![
              'drafting',
              'signing',
              'effective',
              'paused',
              'terminated',
            ].includes(input.stage)
          )
            bad('合同阶段无效。');
          if (
            !userAllowed(input.nextOwnerId, ch, [
              'Procurement',
              'ProductOperations',
            ])
          )
            bad('下一步责任人须为该渠道授权采购或运营。');
          r.contractNumber = text(input.number);
          r.contractHandler = text(input.handler);
          r.nextAction = text(input.nextAction);
          r.nextOwnerId = input.nextOwnerId;
          r.contractDueAt = date(input.dueAt);
          if (!['unknown', 'pending', 'returned'].includes(input.paperStatus))
            bad('纸质寄回状态无效。');
          r.paperStatus = input.paperStatus;
          if (input.stage === 'effective') {
            if (!q) bad('需先完成第一阶段实际通过核验。');
            if (!input.effectiveAt)
              bad('合同已生效必须登记有效电子合同生效时间。');
            date(input.effectiveAt);
            if (input.effectiveAt! > new Date().toISOString())
              bad('未来时间不代表当前已生效。');
            r.electronicEffectiveAt = input.effectiveAt;
            finish(s, r, ['contract'], actor.user.id);
            addTask(
              s,
              'configuration',
              ch,
              r.demandId,
              r.operatorId,
              `contract:${id}:${input.number}`,
              actor.user.id,
              r.dueAt,
            );
          }
          r.contractStage = input.stage;
        } else if (input.action === 'configuration') {
          if (actor.user.id !== r.operatorId)
            throw new SupplierError(
              'FORBIDDEN',
              '仅配置责任运营记录生产配置。',
            );
          if (!q || r.contractStage !== 'effective' || !r.electronicEffectiveAt)
            bad('需要质量测试通过和有效电子合同；不必等待纸质寄回。');
          requireUser(input.recipientId, ch, 'ProductOperations');
          r.credentialSent = input.sent;
          r.productionRecipientId = input.recipientId;
          r.productionReceived = input.received;
          r.productionReference = ref(input.reference);
          if (input.configured) {
            if (!input.sent || !input.received)
              bad('配置完成须已发送并确认接收生产凭据，仅保存安全占位引用。');
            const sameConfig =
              old!.configuredAt &&
              old!.configuredBasis === basisFor(ch) &&
              old!.productionRecipientId === input.recipientId &&
              old!.productionReference === input.reference;
            r.configuredAt = sameConfig ? old!.configuredAt : r.updatedAt;
            r.configuredBy = actor.user.id;
            r.configuredBasis = basisFor(ch);
            finish(s, r, ['configuration'], actor.user.id);
            addTask(
              s,
              'integration',
              ch,
              r.demandId,
              r.testerId,
              `configuration:${id}:${r.configuredAt}`,
              actor.user.id,
              r.dueAt,
            );
          } else {
            r.configuredAt = null;
            r.configuredBy = null;
            r.configuredBasis = null;
            addTask(
              s,
              'configuration',
              ch,
              r.demandId,
              r.operatorId,
              `configuration-pending:${id}:${r.version}`,
              actor.user.id,
              r.dueAt,
            );
          }
        } else if (input.action === 'dispatch') {
          if (actor.user.id !== r.operatorId)
            throw new SupplierError(
              'FORBIDDEN',
              '仅责任运营确认对客开放及调度状态。',
            );
          if (
            !['not_open', 'open', 'private', 'paused', 'disabled'].includes(
              input.state,
            )
          )
            bad('调度状态无效。');
          if (input.state === 'open') {
            if (
              r.held ||
              !q ||
              !i ||
              r.contractStage !== 'effective' ||
              !r.configuredAt ||
              channels.remediations
                .read()
                .records.some(
                  (x) => x.channelId === id && x.status !== 'closed',
                ) ||
              ch.resourceStatus !== 'enabled'
            )
              bad('开放条件未全部满足，或存在整改、挂起/停用风险。');
            r.openedAt = r.openedAt ?? r.updatedAt;
            r.openedBy = actor.user.id;
            r.openingQualityId = q!.id;
            r.openingIntegrationId = i!.id;
            finish(s, r, ['opening', 'supervise'], actor.user.id);
          }
          r.dispatch = input.state;
          const current = channels.read(),
            base = current.channels.find((v) => v.id === id)!,
            next = {
              ...base,
              availabilityStatus:
                input.state === 'open'
                  ? ('open' as const)
                  : input.state === 'paused'
                    ? ('suspended' as const)
                    : ('closed' as const),
              integrationStatus:
                input.state === 'open'
                  ? ('integrated' as const)
                  : base.integrationStatus,
              version: base.version + 1,
              updatedAt: r.updatedAt,
              updatedBy: actor.user.id,
            };
          channels.write(
            current,
            {
              ...current,
              channels: current.channels.map((v) => (v.id === id ? next : v)),
              history: [
                ...current.history,
                {
                  id: crypto.randomUUID(),
                  channelId: id,
                  action: 'channel:update',
                  actorUserId: actor.user.id,
                  occurredAt: r.updatedAt,
                  reason,
                  changedFields: ['availabilityStatus', 'integrationStatus'],
                  beforeSnapshot: base,
                  afterSnapshot: next,
                },
              ],
            },
            suppliers,
          );
        } else if (input.action === 'hold') r.held = true;
        else if (input.action === 'resume') r.held = false;
        else if (input.action === 'terminate') {
          r.terminated = true;
          r.held = true;
        } else if (input.action === 'feedback') {
          if (actor.user.id !== r.testerId)
            throw new SupplierError(
              'FORBIDDEN',
              '仅测试沟通负责人登记供应商反馈。',
            );
          const rem = channels.remediations
              .read()
              .records.find(
                (v) =>
                  v.id === input.remediationId &&
                  v.channelId === id &&
                  (v.relatedTestExecutionId === input.executionId ||
                    (v.sourceType === 'manual' &&
                      s.verifications.some(
                        (x) =>
                          x.executionId === input.executionId &&
                          x.conclusion === 'failed',
                      ))),
              ),
            e = c.executions.find((v) => v.id === input.executionId);
          if (
            !rem ||
            !e ||
            (e.result !== 'failed' &&
              !s.verifications.some(
                (x) => x.executionId === e.id && x.conclusion === 'failed',
              ))
          )
            bad('反馈须引用该渠道真实失败及原整改事项。');
          date(input.feedbackAt);
          text(input.summary);
          if (
            !userAllowed(input.recipientId, ch, [
              'ProductOperations',
              'Testing',
            ])
          )
            bad('反馈内部接收人无渠道授权。');
          event(
            s,
            id,
            r.demandId,
            'feedback',
            key,
            actor.user.id,
            `${input.feedbackAt} · ${text(input.summary)}`,
            e!.id,
            rem!.id,
          );
          finish(s, r, ['supplier_feedback'], actor.user.id);
        } else if (input.action === 'comment') {
          if (
            !Array.isArray(input.recipientIds) ||
            input.recipientIds.some((user) => !userAllowed(user, ch))
          )
            bad('@ 接收人必须有此渠道的内部查看权限。');
          const comment = {
            id: crypto.randomUUID(),
            channelId: id,
            authorId: actor.user.id,
            body: text(input.body),
            recipientIds: [...new Set(input.recipientIds)],
            occurredAt: r.updatedAt,
          };
          s.comments.push(comment);
          for (const user of comment.recipientIds)
            addTask(
              s,
              'mention',
              ch,
              r.demandId,
              user,
              comment.id,
              actor.user.id,
            );
        } else if (input.action === 'supplier-communication') {
          const row = s.communications.find(
              (v) => v.supplierId === ch.supplierId,
            ),
            next = {
              supplierId: ch.supplierId,
              groupName: text(input.groupName),
              notes: text(input.notes),
              version: (row?.version ?? 0) + 1,
              updatedAt: r.updatedAt,
            };
          s.communications = row
            ? s.communications.map((v) =>
                v.supplierId === ch.supplierId ? next : v,
              )
            : [...s.communications, next];
        } else bad('不支持的交付操作。');
      }
      guard(permissions[input.action]!);
      channel(id);
      enforceSafety(s, r, actor.user.id);
      event(
        s,
        id,
        r.demandId,
        input.action,
        key,
        actor.user.id,
        reason,
        input.action === 'verify' ? input.executionId : null,
        null,
        old,
        r,
      );
      s.requests.push({
        id: `${actor.user.id}:${key}`,
        fingerprint: fingerprint(payload),
        resultId: id,
      });
      assertLifecycleReferences(s, channels.read());
      repo.write(before, s);
    },
    async queryLifecycleTasks(view = 'mine') {
      guard('task:read');
      const s = structuredClone(repo.read()),
        allowed = new Set(visible().map((c) => c.id)),
        now = new Date().toISOString();
      reconcileTasks(s, channels.read());
      return s.tasks
        .filter((t) =>
          t.archived
            ? t.scopeDomains.every(
                (d) => ctx!.domains.includes(d) && (!domain || d === domain),
              )
            : t.channelId
              ? t.relatedChannelIds.some((id) => allowed.has(id))
              : (() => {
                  try {
                    checkDemand(t.demandId!);
                    return true;
                  } catch {
                    return false;
                  }
                })(),
        )
        .filter((t) =>
          view === 'mine'
            ? t.assigneeId === ctx!.user.id &&
              t.status === 'open' &&
              t.type !== 'mention' &&
              !isLifecycleNotice(t.type)
            : view === 'notifications'
              ? t.assigneeId === ctx!.user.id && isLifecycleNotice(t.type)
              : view === 'mentions'
                ? t.assigneeId === ctx!.user.id && t.type === 'mention'
                : view === 'sent'
                  ? t.initiatorId === ctx!.user.id
                  : view === 'waiting'
                    ? t.initiatorId === ctx!.user.id &&
                      t.assigneeId !== ctx!.user.id &&
                      !isLifecycleNotice(t.type) &&
                      t.status === 'open'
                    : view === 'completed'
                      ? t.assigneeId === ctx!.user.id &&
                        t.status === 'completed'
                      : t.assigneeId === ctx!.user.id &&
                        t.status === 'open' &&
                        !isLifecycleNotice(t.type) &&
                        !!t.dueAt &&
                        t.dueAt < now,
        )
        .map((t) => {
          const ids = t.relatedChannelIds.filter((id) => allowed.has(id));
          return {
            ...t,
            relatedChannelIds: ids,
            channelId: t.channelId ? (ids[0] ?? null) : null,
            objectId: t.channelId ? (ids[0] ?? t.objectId) : t.objectId,
          };
        });
    },
    async changeLifecycleTask(id, action, reason, key, version) {
      const actor = guard(
          action === 'read' ? 'notification:read' : 'task:complete',
        ),
        before = repo.read(),
        s = structuredClone(before);
      reconcileTasks(s, channels.read(), true);
      const t = s.tasks.find((t) => t.id === id);
      if (!t || t.assigneeId !== actor.user.id)
        throw new SupplierError(
          'FORBIDDEN',
          '任务不存在或不是当前负责人的任务。',
        );
      if (
        action !== 'read' &&
        (isLifecycleNotice(t.type) ||
          s.events.some((e) => e.sourceId === `compat-07d:${t.id}`))
      )
        bad('仅需知悉的通知或已兼容取消的误发任务不能作为待办推进。');
      if (t.archived) {
        if (
          !t.scopeDomains.every(
            (d) => ctx!.domains.includes(d) && (!domain || d === domain),
          )
        )
          throw new SupplierError('FORBIDDEN', '归档任务不在业务域范围。');
        if (!['read', 'cancel'].includes(action))
          bad('原需求已明确重置，归档通知不能重新推进。');
      } else if (t.channelId) t.relatedChannelIds.forEach((id) => channel(id));
      else checkDemand(t.demandId!);
      text(reason);
      if (request(s, key, { id, action, reason, version })) return;
      if (t.version !== version)
        throw new SupplierError('CONFLICT', '任务版本变化，请刷新。');
      t.version++;
      if (action === 'read') t.readAt = new Date().toISOString();
      else if (action === 'complete') {
        if (
          ![
            'mention',
            'supplier_feedback',
            'supervise',
            'replacement',
            'procure',
            'backup',
          ].includes(t.type)
        )
          bad('该任务须由对应合同、配置、阶段或开放事实完成，不能手工绕过。');
        t.status = 'completed';
        t.completedAt = new Date().toISOString();
        t.completionActorId = actor.user.id;
        t.completionReason = reason;
      } else if (action === 'cancel') {
        t.status = 'cancelled';
        t.completionReason = reason;
      } else if (action === 'reopen') {
        if (t.channelId) {
          const r = s.records.find((r) => r.channelId === t.channelId);
          if (r) {
            const state = channels.read();
            const done =
              t.type === 'quality'
                ? !!verification(s, state, r, 'quality')
                : t.type === 'integration'
                  ? !!verification(s, state, r, 'connectivity')
                  : t.type === 'contract'
                    ? r.contractStage === 'effective'
                    : t.type === 'configuration'
                      ? !!r.configuredAt &&
                        r.configuredBasis === basisFor(channel(r.channelId))
                      : t.type === 'opening'
                        ? r.dispatch === 'open'
                        : false;
            if (done)
              bad('该业务事实已完成，不能仅通过重开任务制造未完成状态。');
          }
        }

        if (t.status === 'open') bad('任务已在待办中。');
        t.status = 'open';
        t.completedAt = null;
        t.completionActorId = null;
        t.completionReason = reason;
      } else bad('任务操作无效。');
      event(
        s,
        t.channelId,
        t.demandId,
        `task:${action}`,
        key,
        actor.user.id,
        reason,
      );
      s.requests.push({
        id: `${actor.user.id}:${key}`,
        fingerprint: fingerprint({ id, action, reason, version }),
        resultId: id,
      });
      repo.write(before, s);
    },
    async recordCustomerContract(demandId, version, signedAt, key) {
      const actor = guard('lifecycle:customer-contract');
      checkDemand(demandId);
      date(signedAt);
      if (!signedAt || signedAt > new Date().toISOString())
        bad('须人工记录已发生的客户签约事实。');
      const before = repo.read(),
        s = structuredClone(before),
        g = s.goals.find((g) => g.demandId === demandId);
      if (request(s, key, { demandId, version, signedAt })) return;
      if ((g?.version ?? 0) !== version)
        throw new SupplierError('CONFLICT', '客户目标版本变化。');
      if (g) bad('客户签约事实已保存，不能重写。');
      s.goals.push({
        demandId,
        customerSignedAt: signedAt,
        recordedBy: actor.user.id,
        version: 1,
      });
      const d = sourcing.read(),
        itemIds = d.items
          .filter((i) => i.demandId === demandId)
          .map((i) => i.id),
        candidate = d.matches
          .filter((m) => itemIds.includes(m.demandItemId))
          .map((m) =>
            channels.read().channels.find((c) => c.id === m.channelId),
          )
          .find(Boolean);
      if (candidate) {
        const owner = suppliers
          .read()
          .suppliers.find((v) => v.id === candidate.supplierId)!.ownerUserId;
        addTask(
          s,
          'backup',
          candidate,
          demandId,
          owner,
          `customer:${demandId}`,
          actor.user.id,
        );
      } else {
        const proc = fixture.users.find(
          (u) =>
            u.role === 'Procurement' &&
            fixture.domainGrants.some(
              (g) =>
                g.userId === u.id && ctx!.domains.includes(g.businessDomain),
            ),
        )!;
        addTask(
          s,
          'backup',
          null,
          demandId,
          proc.id,
          `customer:${demandId}`,
          actor.user.id,
        );
      }
      event(
        s,
        null,
        demandId,
        'customer-contract',
        key,
        actor.user.id,
        '人工记录客户签约；供应商采购合同独立。',
      );
      s.requests.push({
        id: `${actor.user.id}:${key}`,
        fingerprint: fingerprint({ demandId, version, signedAt }),
        resultId: demandId,
      });
      repo.write(before, s);
    },
    async resourceGoal(demandId) {
      guard('lifecycle:read');
      checkDemand(demandId);
      const s = repo.read(),
        d = sourcing.read(),
        items = new Set(
          d.items.filter((i) => i.demandId === demandId).map((i) => i.id),
        ),
        ids = new Set(
          d.matches
            .filter(
              (m) => items.has(m.demandItemId) && m.matchStatus !== 'excluded',
            )
            .map((m) => m.channelId),
        ),
        rows = s.records.some((r) => ids.has(r.channelId))
          ? getRows(ids).rows
          : [],
        usable = rows.filter(
          (r) =>
            ids.has(r.id) &&
            (s.goals.some((g) => g.demandId === demandId)
              ? r.schedulable
              : !!r.qualityVerificationId),
        ),
        g = s.goals.find((g) => g.demandId === demandId);
      return {
        basis: g ? 'schedulable' : 'first_quality',
        customerSigned: !!g,
        targetChannels: g ? 3 : 1,
        usableChannels: usable.length,
        distinctSuppliers: new Set(usable.map((r) => r.supplierId)).size,
        version: g?.version ?? 0,
      };
    },
    async retryLifecycleSignals(id) {
      guard('notification:mention');
      syncSignals(id);
    },
  };
  return {
    api,
    syncSignals,
    syncSafety: (id: string) => {
      const before = repo.read(),
        s = structuredClone(before),
        r = s.records.find((r) => r.channelId === id);
      if (!r) return;
      channel(id);
      if (enforceSafety(s, r, ctx!.user.id)) {
        r.version++;
        r.updatedAt = new Date().toISOString();
        event(
          s,
          id,
          r.demandId,
          'safety-paused',
          `safety:${id}:${r.version}`,
          ctx!.user.id,
          '当前条件不再满足，自动暂停 Mock 调度，历史交付记录保留。',
        );
        repo.write(before, s);
      }
    },
    archiveDemands: (retainedIds: readonly string[], actorId: string) => {
      const before = repo.read(),
        s = structuredClone(before);
      for (const t of s.tasks) {
        if (
          t.objectType === 'demand' &&
          !retainedIds.includes(t.demandId!) &&
          !t.archived
        ) {
          t.archived = true;
          t.status = 'cancelled';
          t.version++;
          t.completionActorId = actorId;
          t.completionReason = '原采购需求已明确重置，通知历史保留。';
          event(
            s,
            null,
            t.demandId,
            'demand-archived',
            `archive:${t.id}`,
            actorId,
            t.completionReason,
          );
        }
      }
      if (fingerprint(s) !== fingerprint(before)) repo.write(before, s);
    },
    notifyRemediation: (id: string) => {
      const rem = channels.remediations.read(),
        item = rem.records.find((r) => r.id === id);
      if (!item || !item.verificationScope) return;
      const before = repo.read(),
        s = structuredClone(before),
        record = s.records.find((r) => r.channelId === item.channelId),
        submission = rem.submissions.find(
          (v) => v.remediationId === id && v.round === item.activeRound,
        );
      if (!record || !submission) return;
      const sourceId = `remediation:${submission.id}`;
      if (s.events.some((e) => e.sourceId === sourceId)) return;
      const ch = channel(record.channelId);
      addTask(
        s,
        item.verificationScope === 'quality' ? 'quality' : 'integration',
        ch,
        record.demandId,
        record.testerId,
        sourceId,
        submission.submittedBy,
        record.dueAt,
      );
      s.tasks
        .filter((t) => t.sourceId === sourceId)
        .forEach((t) => {
          t.title = '供应商反馈已提交，等待新执行复测';
        });
      event(
        s,
        ch.id,
        record.demandId,
        'remediation-submitted',
        sourceId,
        submission.submittedBy,
        '原整改本轮提交已保存，复测须通过原 TestingApi。',
        item.relatedTestExecutionId,
        id,
      );
      repo.write(before, s);
    },
    notifyDemand: (demandId: string, actorId: string) => {
      const before = repo.read(),
        s = structuredClone(before),
        sourceId = `demand:${demandId}`;
      if (s.events.some((e) => e.sourceId === sourceId)) return;
      const d = sourcing.read(),
        domains = new Set(
          d.items
            .filter((i) => i.demandId === demandId)
            .map((i) =>
              modelDomain(
                fixture.models.find((m) => m.id === i.modelId)!,
                fixture.vendors,
              ),
            ),
        ),
        proc = fixture.users.find(
          (u) =>
            u.role === 'Procurement' &&
            fixture.domainGrants.some(
              (g) => g.userId === u.id && domains.has(g.businessDomain),
            ),
        );
      if (proc)
        addTask(s, 'procure', null, demandId, proc.id, sourceId, actorId);
      event(
        s,
        null,
        demandId,
        'resource-demand',
        sourceId,
        actorId,
        '采购资源需求已人工提交。',
      );
      repo.write(before, s);
    },
  };
}
