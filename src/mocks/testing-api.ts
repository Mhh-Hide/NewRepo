import type { AccessContext, PermissionAction } from '../auth/types';
import { can } from '../auth/policy';
import type { Channel, TestTask } from '../domain/entities';
import type { TestType } from '../domain/statuses';
import type { ChannelState, ManagedChannel } from '../services/channel-types';
import type {
  TestingApi,
  TestSummary,
  TechnicalConclusion,
  TestTaskDetail,
  AdoptionToken,
} from '../services/testing-types';
import type { ExecutionRecord, TestAudit } from '../domain/testing';
import {
  activeExemptions,
  currentConclusion,
  pendingExecutions,
  conclusionVersion,
} from '../domain/testing';
import { canExemptQuality, modelDomain } from '../domain/rules';
import { SupplierError } from '../services/supplier-types';
import type { ChannelRepository } from './channel-repository';
import type { SupplierRepository } from './supplier-repository';
import { fixture } from './data';
import { basisFor, initialDefinition } from './testing-state';
const fingerprint = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(fingerprint).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${JSON.stringify(k)}:${fingerprint(v)}`)
          .join(',')}}`
      : String(JSON.stringify(v));
const text = (v: string, field = '说明', optional = false) => {
  if (typeof v !== 'string' || (!optional && !v.trim()) || v.length > 4000)
    throw new SupplierError(
      'VALIDATION',
      `${field}须为有效模拟文本（最多4000字）。`,
    );
  return v.trim();
};
const evidence = (v: string) => {
  if (typeof v !== 'string' || !/^mock:[A-Za-z0-9_:/.-]{1,150}$/.test(v))
    throw new SupplierError(
      'VALIDATION',
      '证据仅接受 mock: 模拟引用，不得填写真实文件、凭据或网址。',
    );
  return v;
};
const fields = (v: object, allowed: readonly string[]) => {
  if (!v || Object.keys(v).some((k) => !allowed.includes(k)))
    throw new SupplierError('VALIDATION', '只允许指定的测试字段。');
};
export function createTestingApi(
  ctx: AccessContext | null,
  repo: ChannelRepository,
  suppliers: SupplierRepository,
  channels: () => readonly Channel[],
  active: () => boolean,
): TestingApi {
  const guard = (action: PermissionAction) => {
    if (!ctx || !active() || !ctx.domains.length || !can(ctx, action))
      throw new SupplierError('FORBIDDEN', '当前身份或业务域无此测试权限。');
    return ctx;
  };
  const channel = (s: ChannelState, id: string) => {
    const c = s.channels.find((c) => c.id === id);
    if (!c || !channels().some((c) => c.id === id))
      throw new SupplierError('FORBIDDEN', '记录不存在或不在当前授权范围。');
    return c;
  };
  const task = (s: ChannelState, id: string) => {
    const t = s.tasks.find((t) => t.id === id);
    if (!t)
      throw new SupplierError('FORBIDDEN', '记录不存在或不在当前授权范围。');
    channel(s, t.channelId);
    return t;
  };
  const def = (s: ChannelState, t: TestTask, v?: number) => {
    const d = s.taskDefinitions.find((d) => d.taskId === t.id)!;
    if (v !== undefined && d.version !== v)
      throw new SupplierError('CONFLICT', '任务版本已变化，请重新加载。');
    return d;
  };
  const execution = (s: ChannelState, id: string) => {
    const e = s.executions.find((e) => e.id === id);
    if (!e)
      throw new SupplierError('FORBIDDEN', '记录不存在或不在当前授权范围。');
    return { e, t: task(s, e.taskId) };
  };
  const replay = (
    s: ChannelState,
    key: string,
    op: string,
    payload: unknown,
  ) => {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new SupplierError('VALIDATION', '请求标识无效。');
    const r = s.testRequests.find((r) => r.id === `${ctx!.user.id}:${key}`);
    if (r && (r.operation !== op || r.fingerprint !== fingerprint(payload)))
      throw new SupplierError('CONFLICT', '请求标识已用于不同内容。');
    return r;
  };
  const audit = (
    channelId: string,
    action: string,
    reason: string,
    key: string,
    taskId: string | null = null,
    executionId: string | null = null,
    changes: TestAudit['changes'] = [],
  ): TestAudit => ({
    id: crypto.randomUUID(),
    channelId,
    taskId,
    executionId,
    action,
    actorUserId: ctx!.user.id,
    occurredAt: new Date().toISOString(),
    reason,
    requestId: key,
    changes,
  });
  const save = (
    before: ChannelState,
    next: ChannelState,
    key: string,
    op: string,
    payload: unknown,
    resultId: string,
    action: PermissionAction,
  ) => {
    guard(action);
    repo.write(
      before,
      {
        ...next,
        testRequests: [
          ...before.testRequests,
          {
            id: `${ctx!.user.id}:${key}`,
            actorUserId: ctx!.user.id,
            operation: op,
            fingerprint: fingerprint(payload),
            resultId,
          },
        ],
      },
      suppliers,
    );
  };
  const modifyTask = (
    s: ChannelState,
    t: TestTask,
    status: TestTask['status'],
    changes: Partial<ChannelState['taskDefinitions'][number]> = {},
  ): ChannelState => ({
    ...s,
    tasks: s.tasks.map((v) =>
      v.id === t.id ? { ...v, status, updatedAt: new Date().toISOString() } : v,
    ),
    taskDefinitions: s.taskDefinitions.map((d) =>
      d.taskId === t.id ? { ...d, ...changes, version: d.version + 1 } : d,
    ),
  });
  const assignee = (id: string | null, c: Channel) => {
    if (id === null) return;
    const u = fixture.users.find((u) => u.id === id),
      m = fixture.models.find((m) => m.id === c.modelId)!;
    if (
      !u ||
      !['ProductOperations', 'Testing'].includes(u.role) ||
      !fixture.domainGrants.some(
        (g) =>
          g.userId === id &&
          g.businessDomain === modelDomain(m, fixture.vendors),
      )
    )
      throw new SupplierError(
        'VALIDATION',
        '负责人须为该渠道业务域内的运营或测试人员。',
      );
  };
  const currentBasis = (s: ChannelState, t: TestTask) => {
    const d = def(s, t);
    if (d.basis !== basisFor(channel(s, t.channelId)))
      throw new SupplierError(
        'CONFLICT',
        '渠道关键配置已变化，旧任务不能用于新目标，请取消旧任务并建立新任务。',
      );
    return d;
  };
  const technical = (
    s: ChannelState,
    c: Channel,
    type: TestType,
  ): TechnicalConclusion => {
    const basis = basisFor(c),
      con = currentConclusion(s, c.id, type, basis),
      legacy = s.legacyTestStates.find((l) => l.channelId === c.id),
      legacyStatus = legacy
        ? type === 'quality'
          ? legacy.qualityStatus
          : legacy.connectivityStatus
        : null;
    const pending = pendingExecutions(s, c.id, type),
      ts = new Set(
        s.tasks
          .filter((t) => t.channelId === c.id && t.testType === type)
          .map((t) => t.id),
      );
    const latest = s.executions
      .filter((e) => ts.has(e.taskId) && e.termination === 'finished')
      .at(-1);
    const legacyResult =
      legacy?.basis === basis &&
      (legacyStatus === 'passed' || legacyStatus === 'failed')
        ? legacyStatus
        : null;
    return {
      origin: con ? 'adopted' : legacyResult ? 'legacy' : 'none',
      result: con?.result ?? legacyResult,
      status: type === 'quality' ? c.qualityStatus : c.connectivityStatus,
      adoptedAt: con?.adoptedAt ?? null,
      legacyStatus,
      basisChanged: !!legacy && legacy.basis !== basis,
      pendingReview: pending.length,
      newFailureRisk: pending.some((e) => e.result === 'failed'),
      latestTestedAt: latest?.finishedAt ?? null,
      technicalSummary:
        latest?.origin === 'recorded' ? latest.technicalSummary : null,
    };
  };
  const summary = (s: ChannelState, c: Channel): TestSummary => {
    const m = fixture.models.find((m) => m.id === c.modelId)!,
      sp = suppliers.read().suppliers.find((v) => v.id === c.supplierId)!;
    return {
      channel: {
        id: c.id,
        name: c.displayName,
        anonymousCode: `DEMO-${c.id}`,
        status: c.resourceStatus,
      },
      model: { id: m.id, name: m.name },
      supplier: { id: sp.id, name: sp.name },
      quality: technical(s, c, 'quality'),
      connectivity: technical(s, c, 'connectivity'),
      exempted: activeExemptions(s, c, basisFor(c)).length > 0,
      pendingTasks: s.tasks.filter(
        (t) => t.channelId === c.id && t.status === 'pending',
      ).length,
      runningTasks: s.tasks.filter(
        (t) => t.channelId === c.id && t.status === 'running',
      ).length,
    };
  };
  const projectTask = (t: TestTask): TestTask => ({
    id: t.id,
    source: t.source,
    channelId: t.channelId,
    testType: t.testType,
    ...(t.stageLabel ? { stageLabel: t.stageLabel } : {}),
    status: t.status,
    assignedTo: t.assignedTo,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  });
  const projectExecution = (e: ExecutionRecord): ExecutionRecord => ({
    id: e.id,
    source: e.source,
    taskId: e.taskId,
    externalTestId: e.externalTestId,
    startedAt: e.startedAt,
    finishedAt: e.finishedAt,
    result: e.result,
    failureReason: e.failureReason,
    reportReference: e.reportReference,
    createdAt: e.createdAt,
    origin: e.origin,
    performedBy: e.performedBy,
    round: e.round,
    targetVersion: e.targetVersion,
    basis: e.basis,
    version: 1,
    technicalSummary: e.technicalSummary,
    internalNotes: e.internalNotes,
    evidenceReference: e.evidenceReference,
    termination: e.termination,
  });
  const detail = (s: ChannelState, t: TestTask): TestTaskDetail => {
    const c = channel(s, t.channelId),
      d = def(s, t),
      ids = new Set(
        s.executions.filter((e) => e.taskId === t.id).map((e) => e.id),
      );
    return {
      targetCurrent: d.basis === basisFor(c),
      latestExecution:
        s.executions
          .filter((e) => e.taskId === t.id)
          .map((e) => ({
            result: e.result,
            finishedAt: e.finishedAt,
            origin: e.origin,
            performedBy: e.performedBy,
            round: e.round,
          }))
          .at(-1) ?? null,
      task: projectTask(t),
      definition: {
        taskId: d.taskId,
        version: d.version,
        targetReference: d.targetReference,
        targetVersion: d.targetVersion,
        basis: d.basis,
        createdBy: d.createdBy,
        cancelledBy: d.cancelledBy,
        cancelledAt: d.cancelledAt,
        cancellationReason: d.cancellationReason,
      },
      summary: summary(s, c),
      executions: s.executions
        .filter((e) => e.taskId === t.id)
        .map(projectExecution),
      activeRun:
        s.runs
          .filter(
            (r) =>
              r.taskId === t.id && !s.executions.some((e) => e.id === r.id),
          )
          .map((r) => ({
            id: r.id,
            taskId: r.taskId,
            round: r.round,
            performedBy: r.performedBy,
            startedAt: r.startedAt,
            targetVersion: r.targetVersion,
            basis: r.basis,
          }))[0] ?? null,
      conclusions: s.conclusions
        .filter((v) => v.channelId === c.id && v.testType === t.testType)
        .map((v) => ({
          id: v.id,
          channelId: v.channelId,
          testType: v.testType,
          executionId: v.executionId,
          result: v.result,
          adoptedBy: v.adoptedBy,
          adoptedAt: v.adoptedAt,
          reason: v.reason,
          targetVersion: v.targetVersion,
          basis: v.basis,
        })),
      reviews: s.reviews
        .filter((v) => ids.has(v.executionId))
        .map((v) => ({
          id: v.id,
          executionId: v.executionId,
          reviewedBy: v.reviewedBy,
          reviewedAt: v.reviewedAt,
          reason: v.reason,
          disposition: v.disposition,
        })),
      history: s.testHistory
        .filter((v) => v.channelId === c.id)
        .map((v) => ({
          id: v.id,
          channelId: v.channelId,
          taskId: v.taskId,
          executionId: v.executionId,
          action: v.action,
          actorUserId: v.actorUserId,
          occurredAt: v.occurredAt,
          reason: v.reason,
          requestId: v.requestId,
          changes: v.changes.map((v) => ({
            field: v.field,
            before: v.before,
            after: v.after,
          })),
        })),
      token: {
        taskVersion: d.version,
        conclusionVersion: conclusionVersion(s, c.id, t.testType),
      },
      sourceVerifications: s.sourceVerifications
        .filter((v) => v.channelId === c.id)
        .map((v) => ({
          id: v.id,
          channelId: v.channelId,
          sourceType: v.sourceType,
          status: v.status,
          evidenceReference: v.evidenceReference,
          actorUserId: v.actorUserId,
          occurredAt: v.occurredAt,
          reason: v.reason,
          basis: v.basis,
        })),
      exemptions: s.exemptions
        .filter((v) => v.channelId === c.id)
        .map((v) => ({
          id: v.id,
          source: v.source,
          channelId: v.channelId,
          verifiedBy: v.verifiedBy,
          verifiedAt: v.verifiedAt,
          evidenceReference: v.evidenceReference,
          reason: v.reason,
          origin: v.origin,
          sourceVerificationId: v.sourceVerificationId,
          recordedBy: v.recordedBy,
          recordedAt: v.recordedAt,
          basis: v.basis,
        })),
      exemptionRevocations: s.exemptionRevocations
        .filter((v) => v.channelId === c.id)
        .map((v) => ({
          id: v.id,
          exemptionId: v.exemptionId,
          channelId: v.channelId,
          action: v.action,
          actorUserId: v.actorUserId,
          occurredAt: v.occurredAt,
          reason: v.reason,
        })),
    };
  };
  const checkDecision = (
    s: ChannelState,
    e: ExecutionRecord,
    t: TestTask,
    token: AdoptionToken,
  ) => {
    fields(token, ['taskVersion', 'executionVersion', 'conclusionVersion']);
    def(s, t, token.taskVersion);
    if (
      token.executionVersion !== e.version ||
      token.conclusionVersion !== conclusionVersion(s, t.channelId, t.testType)
    )
      throw new SupplierError(
        'CONFLICT',
        '执行或当前结论版本已变化，请重新加载。',
      );
    if (
      e.origin !== 'recorded' ||
      e.termination !== 'finished' ||
      e.result === null
    )
      throw new SupplierError(
        'VALIDATION',
        '仅可处理有明确目标依据的新完成执行；legacy 不补造采纳。',
      );
    if (
      s.conclusions.some((v) => v.executionId === e.id) ||
      s.reviews.some((v) => v.executionId === e.id)
    )
      throw new SupplierError('CONFLICT', '该执行已处理，不会再次覆盖结论。');
  };
  const channelVersion = (c: ManagedChannel, v: number) => {
    if (c.version !== v)
      throw new SupplierError('CONFLICT', '渠道版本已变化，请重新加载。');
  };
  const channelNext = (s: ChannelState, c: ManagedChannel) => ({
    ...s,
    channels: s.channels.map((v) =>
      v.id === c.id
        ? {
            ...v,
            version: v.version + 1,
            updatedAt: new Date().toISOString(),
            updatedBy: ctx!.user.id,
          }
        : v,
    ),
  });
  return {
    async queryTestSummaries(query = {}) {
      guard('test:summary');
      fields(query, ['channelId', 'modelId']);
      const s = repo.read(),
        cs = channels().filter(
          (c) =>
            (!query.channelId || c.id === query.channelId) &&
            (!query.modelId || c.modelId === query.modelId),
        );
      const rows = cs.map((c) => summary(s, c));
      return structuredClone({
        rows,
        stats: {
          pendingTasks: rows.reduce((n, r) => n + r.pendingTasks, 0),
          runningTasks: rows.reduce((n, r) => n + r.runningTasks, 0),
          currentFailedChannels: rows.filter((r) =>
            [r.quality, r.connectivity].some(
              (v) => v.origin === 'adopted' && v.result === 'failed',
            ),
          ).length,
          legacyFailedChannels: rows.filter((r) =>
            [r.quality, r.connectivity].some(
              (v) => v.origin === 'legacy' && v.result === 'failed',
            ),
          ).length,
          reviewChannels: rows.filter(
            (r) => r.quality.pendingReview + r.connectivity.pendingReview > 0,
          ).length,
          newFailureChannels: rows.filter(
            (r) => r.quality.newFailureRisk || r.connectivity.newFailureRisk,
          ).length,
          exemptedChannels: rows.filter((r) => r.exempted).length,
          connectivityUnverifiedChannels: rows.filter(
            (r) => r.connectivity.origin !== 'adopted',
          ).length,
        },
      });
    },
    async queryTestTasks(query = {}) {
      guard('test:detail');
      fields(query, ['channelId', 'modelId', 'testType', 'status']);
      const s = repo.read(),
        allowed = channels().filter(
          (c) =>
            (!query.channelId || c.id === query.channelId) &&
            (!query.modelId || c.modelId === query.modelId),
        );
      return structuredClone(
        s.tasks
          .filter(
            (t) =>
              allowed.some((c) => c.id === t.channelId) &&
              (!query.testType || t.testType === query.testType) &&
              (!query.status || t.status === query.status),
          )
          .map((t) => ({
            latestExecution: detail(s, t).latestExecution,
            task: projectTask(t),
            definition: detail(s, t).definition,
            summary: summary(
              s,
              allowed.find((c) => c.id === t.channelId)!,
            ),
          })),
      );
    },
    async getTestTask(id) {
      guard('test:detail');
      guard('test:history');
      const s = repo.read(),
        t = s.tasks.find(
          (t) => t.id === id && channels().some((c) => c.id === t.channelId),
        );
      return t ? structuredClone(detail(s, t)) : null;
    },
    async testingOptions() {
      guard('test:detail');
      return {
        channels: channels().map((c) => ({
          id: c.id,
          label: `${fixture.models.find((m) => m.id === c.modelId)!.name} · ${c.displayName}`,
        })),
        assignees: fixture.users
          .filter(
            (u) =>
              ['Testing', 'ProductOperations'].includes(u.role) &&
              fixture.domainGrants.some(
                (g) =>
                  g.userId === u.id && ctx!.domains.includes(g.businessDomain),
              ),
          )
          .map((u) => ({ id: u.id, name: u.name })),
      };
    },
    async createTestTask(input, key) {
      const actor = guard('test:create');
      fields(input, ['channelId', 'testType', 'targetReference', 'assignedTo']);
      const s = repo.read(),
        c = channel(s, input.channelId);
      if (!['quality', 'connectivity'].includes(input.testType))
        throw new SupplierError('VALIDATION', '测试类型无效。');
      text(input.targetReference, '测试目标');
      assignee(input.assignedTo, c);
      const r = replay(s, key, 'test:create', input);
      if (r) return r.resultId;
      const at = new Date().toISOString(),
        id = `mock-task-${crypto.randomUUID()}`,
        t: TestTask = {
          id,
          source: 'mock',
          channelId: c.id,
          testType: input.testType,
          status: 'pending',
          assignedTo: input.assignedTo,
          createdAt: at,
          updatedAt: at,
        },
        d = {
          ...initialDefinition(t, c, actor.user.id),
          targetReference: input.targetReference.trim(),
          targetVersion: crypto.randomUUID(),
        };
      save(
        s,
        {
          ...s,
          tasks: [...s.tasks, t],
          taskDefinitions: [...s.taskDefinitions, d],
          testHistory: [
            ...s.testHistory,
            audit(c.id, 'task_created', d.targetReference, key, id),
          ],
        },
        key,
        'test:create',
        input,
        id,
        'test:create',
      );
      return id;
    },
    async updateTestTask(id, v, targetReference, assignedTo, key) {
      guard('test:update');
      const s = repo.read(),
        t = task(s, id),
        payload = { id, v, targetReference, assignedTo };
      if (replay(s, key, 'test:update', payload)) return;
      const d = def(s, t, v);
      if (t.status === 'cancelled' || t.status === 'running')
        throw new SupplierError(
          'VALIDATION',
          '执行中或已取消任务不能修改资料。',
        );
      const ref = text(targetReference, '测试目标');
      assignee(assignedTo, channel(s, t.channelId));
      if (
        ref !== d.targetReference &&
        (s.runs.some((r) => r.taskId === id) ||
          s.executions.some((e) => e.taskId === id))
      )
        throw new SupplierError(
          'VALIDATION',
          '已有执行的目标不可修改，请建立新任务。',
        );
      if (ref === d.targetReference && assignedTo === t.assignedTo) return;
      const next = modifyTask(s, t, t.status, {
        targetReference: ref,
        ...(ref !== d.targetReference
          ? { targetVersion: crypto.randomUUID() }
          : {}),
      });
      save(
        s,
        {
          ...next,
          tasks: next.tasks.map((t) =>
            t.id === id ? { ...t, assignedTo } : t,
          ),
          testHistory: [
            ...s.testHistory,
            audit(
              t.channelId,
              'task_updated',
              '模拟任务资料维护',
              key,
              id,
              null,
              [
                {
                  field: 'targetReference',
                  before: d.targetReference,
                  after: ref,
                },
                {
                  field: 'assignedTo',
                  before: t.assignedTo,
                  after: assignedTo,
                },
              ],
            ),
          ],
        },
        key,
        'test:update',
        payload,
        id,
        'test:update',
      );
    },
    async startTestTask(id, v, key) {
      const actor = guard('test:execute'),
        s = repo.read(),
        t = task(s, id),
        payload = { id, v };
      const r = replay(s, key, 'test:start', payload);
      if (r) return r.resultId;
      def(s, t, v);
      const d = currentBasis(s, t);
      if (
        !['pending', 'completed'].includes(t.status) ||
        s.runs.some(
          (r) => r.taskId === id && !s.executions.some((e) => e.id === r.id),
        )
      )
        throw new SupplierError(
          'CONFLICT',
          '同一任务不能并行执行，已取消任务不能重开。',
        );
      const run = {
          id: `mock-execution-${crypto.randomUUID()}`,
          taskId: id,
          round: s.runs.filter((r) => r.taskId === id).length + 1,
          performedBy: actor.user.id,
          startedAt: new Date().toISOString(),
          targetVersion: d.targetVersion,
          basis: d.basis,
        },
        next = modifyTask(s, t, 'running');
      save(
        s,
        {
          ...next,
          runs: [...s.runs, run],
          testHistory: [
            ...s.testHistory,
            audit(
              t.channelId,
              'execution_started',
              '开始人工模拟执行，不调用真实模型。',
              key,
              id,
              run.id,
            ),
          ],
        },
        key,
        'test:start',
        payload,
        run.id,
        'test:execute',
      );
      return run.id;
    },
    async finishTestExecution(id, v, executionId, input, key) {
      guard('test:execute');
      fields(input, [
        'result',
        'technicalSummary',
        'internalNotes',
        'evidenceReference',
        'failureCategory',
      ]);
      const s = repo.read(),
        t = task(s, id),
        payload = { id, v, executionId, input };
      if (replay(s, key, 'test:finish', payload)) return;
      def(s, t, v);
      currentBasis(s, t);
      const run = s.runs.find((r) => r.id === executionId && r.taskId === id);
      if (
        t.status !== 'running' ||
        !run ||
        s.executions.some((e) => e.id === executionId)
      )
        throw new SupplierError(
          'CONFLICT',
          '执行已结束或任务状态已变化，请重新加载。',
        );
      if (!['passed', 'failed', 'inconclusive'].includes(input.result))
        throw new SupplierError('VALIDATION', '完成执行必须选择明确结果。');
      const shared = text(input.technicalSummary, '共享技术摘要'),
        notes = text(input.internalNotes, '内部技术说明', true),
        ref = evidence(input.evidenceReference);
      if (
        input.failureCategory !== null &&
        ![
          'timeout',
          'authentication',
          'invalid_response',
          'quality',
          'other',
        ].includes(input.failureCategory)
      )
        throw new SupplierError('VALIDATION', '技术错误类别无效。');
      const at = new Date().toISOString(),
        e: ExecutionRecord = {
          id: run.id,
          source: 'mock',
          taskId: id,
          externalTestId: null,
          startedAt: run.startedAt,
          finishedAt: at,
          result: input.result,
          failureReason: input.failureCategory,
          reportReference: ref,
          createdAt: at,
          origin: 'recorded',
          performedBy: run.performedBy,
          round: run.round,
          targetVersion: run.targetVersion,
          basis: run.basis,
          version: 1,
          technicalSummary: shared,
          internalNotes: notes,
          evidenceReference: ref,
          termination: 'finished',
        };
      const next = modifyTask(s, t, 'completed');
      save(
        s,
        {
          ...next,
          executions: [...s.executions, e],
          testHistory: [
            ...s.testHistory,
            audit(t.channelId, 'execution_finished', shared, key, id, e.id, [
              { field: 'result', before: null, after: e.result },
            ]),
          ],
        },
        key,
        'test:finish',
        payload,
        e.id,
        'test:execute',
      );
    },
    async cancelTestTask(id, v, reason, key) {
      const actor = guard('test:cancel'),
        s = repo.read(),
        t = task(s, id),
        payload = { id, v, reason };
      if (replay(s, key, 'test:cancel', payload)) return;
      def(s, t, v);
      if (!['pending', 'running'].includes(t.status))
        throw new SupplierError('VALIDATION', '只能取消待执行或进行中任务。');
      const note = text(reason, '取消原因'),
        at = new Date().toISOString(),
        run = s.runs.find(
          (r) => r.taskId === id && !s.executions.some((e) => e.id === r.id),
        );
      let next = modifyTask(s, t, 'cancelled', {
        cancelledBy: actor.user.id,
        cancelledAt: at,
        cancellationReason: note,
      });
      if (run) {
        const e: ExecutionRecord = {
          id: run.id,
          source: 'mock',
          taskId: id,
          externalTestId: null,
          startedAt: run.startedAt,
          finishedAt: at,
          result: null,
          failureReason: null,
          reportReference: null,
          createdAt: at,
          origin: 'recorded',
          performedBy: run.performedBy,
          round: run.round,
          targetVersion: run.targetVersion,
          basis: run.basis,
          version: 1,
          technicalSummary: '模拟执行已人工取消；未形成结果。',
          internalNotes: note,
          evidenceReference: 'mock:cancellation',
          termination: 'cancelled',
        };
        next = { ...next, executions: [...s.executions, e] };
      }
      save(
        s,
        {
          ...next,
          testHistory: [
            ...s.testHistory,
            audit(
              t.channelId,
              'task_cancelled',
              note,
              key,
              id,
              run?.id ?? null,
            ),
          ],
        },
        key,
        'test:cancel',
        payload,
        id,
        'test:cancel',
      );
    },
    async adoptTestExecution(id, token, reason, key) {
      const actor = guard('test:adopt'),
        s = repo.read(),
        { e, t } = execution(s, id),
        payload = { id, token, reason };
      if (replay(s, key, 'test:adopt', payload)) return;
      checkDecision(s, e, t, token);
      currentBasis(s, t);
      if (e.result !== 'passed' && e.result !== 'failed')
        throw new SupplierError(
          'VALIDATION',
          '不确定结果不能采纳为通过或失败，请记录独立审阅。',
        );
      const note = text(reason, '采纳说明'),
        at = new Date().toISOString(),
        c = channel(s, t.channelId),
        event = {
          id: crypto.randomUUID(),
          channelId: c.id,
          testType: t.testType,
          executionId: e.id,
          result: e.result,
          adoptedBy: actor.user.id,
          adoptedAt: at,
          reason: note,
          targetVersion: e.targetVersion!,
          basis: e.basis!,
        };
      const next = channelNext(s, c);
      save(
        s,
        {
          ...next,
          conclusions: [...s.conclusions, event],
          testHistory: [
            ...s.testHistory,
            audit(c.id, 'conclusion_adopted', note, key, t.id, e.id, [
              {
                field: 'adoptedResult',
                before:
                  currentConclusion(s, c.id, t.testType, basisFor(c))?.result ??
                  null,
                after: e.result,
              },
            ]),
          ],
        },
        key,
        'test:adopt',
        payload,
        event.id,
        'test:adopt',
      );
    },
    async reviewTestExecution(id, token, reason, key) {
      const actor = guard('test:review'),
        s = repo.read(),
        { e, t } = execution(s, id),
        payload = { id, token, reason };
      if (replay(s, key, 'test:review', payload)) return;
      checkDecision(s, e, t, token);
      if (
        e.result !== 'inconclusive' &&
        e.basis === basisFor(channel(s, t.channelId))
      )
        throw new SupplierError(
          'VALIDATION',
          '当前目标下通过或失败应明确采纳，不能用无结论审阅绕过。',
        );
      const note = text(reason, '审阅说明'),
        event = {
          id: crypto.randomUUID(),
          executionId: e.id,
          reviewedBy: actor.user.id,
          reviewedAt: new Date().toISOString(),
          disposition: 'reviewed_without_conclusion' as const,
          reason: note,
        };
      save(
        s,
        {
          ...s,
          reviews: [...s.reviews, event],
          testHistory: [
            ...s.testHistory,
            audit(t.channelId, 'execution_reviewed', note, key, t.id, e.id),
          ],
        },
        key,
        'test:review',
        payload,
        event.id,
        'test:review',
      );
    },
    async verifyTestSource(id, v, status, ref, reason, key) {
      const actor = guard('test:source-verify'),
        s = repo.read(),
        c = channel(s, id),
        payload = { id, v, status, ref, reason };
      if (replay(s, key, 'test:source', payload)) return;
      channelVersion(c, v);
      if (!['verified', 'revoked'].includes(status))
        throw new SupplierError('VALIDATION', '来源核验动作无效。');
      const note = text(reason, '来源核验说明'),
        at = new Date().toISOString(),
        event = {
          id: crypto.randomUUID(),
          channelId: id,
          sourceType: c.channelType,
          status,
          evidenceReference: evidence(ref),
          actorUserId: actor.user.id,
          occurredAt: at,
          reason: note,
          basis: basisFor(c),
        };
      const invalidated =
        status === 'revoked'
          ? activeExemptions(s, c, basisFor(c)).map((e) => ({
              id: crypto.randomUUID(),
              exemptionId: e.id,
              channelId: id,
              action: 'invalidated' as const,
              actorUserId: actor.user.id,
              occurredAt: at,
              reason: note,
            }))
          : [];
      const next = channelNext(s, c);
      save(
        s,
        {
          ...next,
          sourceVerifications: [...s.sourceVerifications, event],
          exemptionRevocations: [...s.exemptionRevocations, ...invalidated],
          testHistory: [
            ...s.testHistory,
            audit(
              id,
              status === 'verified' ? 'source_verified' : 'source_revoked',
              note,
              key,
            ),
          ],
        },
        key,
        'test:source',
        payload,
        event.id,
        'test:source-verify',
      );
    },
    async recordQualityExemption(id, v, ref, reason, key) {
      const actor = guard('test:exemption'),
        s = repo.read(),
        c = channel(s, id),
        payload = { id, v, ref, reason };
      const r = replay(s, key, 'test:exemption', payload);
      if (r) return r.resultId;
      channelVersion(c, v);
      const verification = s.sourceVerifications
        .filter((v) => v.channelId === id)
        .at(-1);
      if (
        !verification ||
        verification.status !== 'verified' ||
        verification.basis !== basisFor(c)
      )
        throw new SupplierError(
          'VALIDATION',
          '请先登记本目标下的独立模拟来源核验。',
        );
      const note = text(reason, '豁免说明'),
        at = new Date().toISOString(),
        e = {
          id: `mock-exemption-${crypto.randomUUID()}`,
          source: 'mock' as const,
          channelId: id,
          verifiedBy: actor.user.id,
          verifiedAt: at,
          evidenceReference: evidence(ref),
          reason: note,
          origin: 'recorded' as const,
          sourceVerificationId: verification.id,
          recordedBy: actor.user.id,
          recordedAt: at,
          basis: basisFor(c),
        };
      if (!canExemptQuality(c, [e]))
        throw new SupplierError(
          'VALIDATION',
          '质量豁免仅适用于已核验的官方原厂渠道及独立有效证据。',
        );
      if (activeExemptions(s, c, basisFor(c)).length)
        throw new SupplierError('CONFLICT', '已有有效质量豁免，不重复登记。');
      const next = channelNext(s, c);
      save(
        s,
        {
          ...next,
          exemptions: [...s.exemptions, e],
          testHistory: [
            ...s.testHistory,
            audit(id, 'quality_exempted', note, key),
          ],
        },
        key,
        'test:exemption',
        payload,
        e.id,
        'test:exemption',
      );
      return e.id;
    },
    async revokeQualityExemption(id, v, reason, key) {
      const actor = guard('test:exemption'),
        s = repo.read(),
        e = s.exemptions.find((e) => e.id === id);
      if (!e)
        throw new SupplierError('FORBIDDEN', '记录不存在或不在当前授权范围。');
      const c = channel(s, e.channelId),
        payload = { id, v, reason };
      if (replay(s, key, 'test:revoke', payload)) return;
      channelVersion(c, v);
      if (s.exemptionRevocations.some((r) => r.exemptionId === id))
        throw new SupplierError('CONFLICT', '豁免已撤销或失效。');
      const note = text(reason, '撤销原因'),
        event = {
          id: crypto.randomUUID(),
          exemptionId: id,
          channelId: c.id,
          action: 'revoked' as const,
          actorUserId: actor.user.id,
          occurredAt: new Date().toISOString(),
          reason: note,
        };
      const next = channelNext(s, c);
      save(
        s,
        {
          ...next,
          exemptionRevocations: [...s.exemptionRevocations, event],
          testHistory: [
            ...s.testHistory,
            audit(c.id, 'exemption_revoked', note, key),
          ],
        },
        key,
        'test:revoke',
        payload,
        event.id,
        'test:exemption',
      );
    },
  };
}
