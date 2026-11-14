import { fixture } from './data';
import type { Channel, TestTask, Remediation } from '../domain/entities';
import type { ChannelState } from '../services/channel-types';
import type { TestingState, TaskDefinition } from '../domain/testing';
import {
  activeExemptions,
  currentConclusion,
  testBasis,
} from '../domain/testing';
import { SupplierError } from '../services/supplier-types';
export const basisFor = (c: Channel) =>
  testBasis(
    c,
    fixture.models.find((m) => m.id === c.modelId)?.version ?? 'unknown-model',
  );
export const initialDefinition = (
  t: TestTask,
  c: Channel,
  createdBy: string | null = null,
): TaskDefinition => ({
  taskId: t.id,
  version: 1,
  targetReference: '历史目标未提供',
  targetVersion: `initial:${t.id}`,
  basis: basisFor(c),
  createdBy,
  cancelledBy: null,
  cancelledAt: null,
  cancellationReason: null,
});
export function initialTesting(
  channels: readonly Channel[],
  tasks: readonly TestTask[],
): TestingState {
  return {
    taskDefinitions: tasks.map((t) =>
      initialDefinition(
        t,
        channels.find((c) => c.id === t.channelId)!,
      ),
    ),
    runs: [],
    executions: fixture.testExecutions.map((e) => ({
      ...e,
      origin: 'legacy',
      performedBy: null,
      round: null,
      targetVersion: null,
      basis: null,
      version: 1,
      technicalSummary: null,
      internalNotes: null,
      evidenceReference: null,
      termination: 'finished',
    })),
    conclusions: [],
    reviews: [],
    sourceVerifications: [],
    exemptions: fixture.exemptions.map((e) => ({
      ...e,
      origin: 'legacy',
      sourceVerificationId: null,
      recordedBy: null,
      recordedAt: null,
      basis: null,
    })),
    exemptionRevocations: [],
    testHistory: [],
    testRequests: [],
    legacyTestStates: channels.map((c) => ({
      channelId: c.id,
      qualityStatus: c.qualityStatus,
      connectivityStatus: c.connectivityStatus,
      sourceVerificationStatus: c.sourceVerificationStatus,
      basis: basisFor(c),
    })),
  };
}
export function projectedTestChannels(
  s: ChannelState,
): ChannelState['channels'] {
  return s.channels.map((c) => {
    const basis = basisFor(c),
      legacy = s.legacyTestStates.find((l) => l.channelId === c.id),
      v = s.sourceVerifications.filter((v) => v.channelId === c.id).at(-1);
    const sourceVerificationStatus = v
      ? v.basis === basis && v.status === 'verified'
        ? ('verified' as const)
        : ('unverified' as const)
      : legacy?.basis === basis
        ? legacy.sourceVerificationStatus
        : c.sourceVerificationStatus === 'rejected'
          ? ('rejected' as const)
          : ('unverified' as const);
    const channel = { ...c, sourceVerificationStatus },
      exempt = activeExemptions(s, channel, basis).length > 0;
    return {
      ...channel,
      qualityStatus: exempt
        ? ('exempted' as const)
        : (currentConclusion(s, c.id, 'quality', basis)?.result ??
          (legacy?.basis === basis && legacy.qualityStatus !== 'exempted'
            ? legacy.qualityStatus
            : 'pending')),
      connectivityStatus:
        currentConclusion(s, c.id, 'connectivity', basis)?.result ??
        (legacy?.basis === basis ? legacy.connectivityStatus : 'pending'),
    };
  });
}
export function reconcileTestConfiguration(
  before: ChannelState,
  next: ChannelState,
): ChannelState {
  let result = next;
  for (const candidate of next.channels) {
    let c = candidate;
    const old = before.channels.find((v) => v.id === c.id);
    if (!old || basisFor(old) === basisFor(c)) continue;
    c = { ...c, testConfigurationVersion: crypto.randomUUID() };
    result = {
      ...result,
      channels: result.channels.map((v) => (v.id === c.id ? c : v)),
    };
    const reason =
        '渠道关键配置已变化，来源核验及质量豁免依据失效；请建立新目标任务。',
      at = c.updatedAt,
      actor = c.updatedBy,
      requestId = `channel-config:${before.revision + 1}`;
    const active = activeExemptions(before, old, basisFor(old));
    result = {
      ...result,
      sourceVerifications:
        old.sourceVerificationStatus === 'verified'
          ? [
              ...result.sourceVerifications,
              {
                id: crypto.randomUUID(),
                channelId: c.id,
                sourceType: c.channelType,
                status: 'revoked',
                evidenceReference: 'mock:configuration-change',
                actorUserId: actor,
                occurredAt: at,
                reason,
                basis: basisFor(c),
              },
            ]
          : result.sourceVerifications,
      exemptionRevocations: [
        ...result.exemptionRevocations,
        ...active.map((e) => ({
          id: crypto.randomUUID(),
          exemptionId: e.id,
          channelId: c.id,
          action: 'invalidated' as const,
          actorUserId: actor,
          occurredAt: at,
          reason,
        })),
      ],
      testHistory: [
        ...result.testHistory,
        {
          id: crypto.randomUUID(),
          channelId: c.id,
          taskId: null,
          executionId: null,
          action: 'configuration_changed',
          actorUserId: actor,
          occurredAt: at,
          reason,
          requestId,
          changes: [
            { field: 'basis', before: basisFor(old), after: basisFor(c) },
          ],
        },
      ],
    };
  }
  const projected = projectedTestChannels(result);
  return {
    ...result,
    channels: projected,
    history: result.history.map((event, i) => {
      if (i < before.history.length) return event;
      const after = projected.find((c) => c.id === event.channelId)!;
      return {
        ...event,
        afterSnapshot: after,
        changedFields: [
          ...new Set([
            ...event.changedFields,
            ...(
              [
                'sourceVerificationStatus',
                'qualityStatus',
                'connectivityStatus',
              ] as const
            ).filter(
              (k) =>
                event.beforeSnapshot && event.beforeSnapshot[k] !== after[k],
            ),
          ]),
        ],
      };
    }),
  };
}
export function testingSnapshot(s: ChannelState) {
  return {
    testTasks: s.tasks,
    testExecutions: s.executions,
    exemptions: s.channels.flatMap((c) => activeExemptions(s, c, basisFor(c))),
  };
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (o: Record<string, unknown>, ks: readonly string[]) =>
  ks.every((k) => typeof o[k] === 'string');
const nullable = (o: Record<string, unknown>, ks: readonly string[]) =>
  ks.every((k) => o[k] === null || typeof o[k] === 'string');
const date = (v: unknown) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));
export function testingShape(v: Record<string, unknown>): boolean {
  const rows = (key: string, check: (o: Record<string, unknown>) => boolean) =>
    Array.isArray(v[key]) &&
    v[key].every((x: unknown) => object(x) && check(x));
  return (
    rows(
      'taskDefinitions',
      (o) =>
        str(o, ['taskId', 'targetReference', 'targetVersion', 'basis']) &&
        Number.isSafeInteger(o.version) &&
        Number(o.version) > 0 &&
        nullable(o, [
          'createdBy',
          'cancelledBy',
          'cancelledAt',
          'cancellationReason',
        ]),
    ) &&
    rows(
      'runs',
      (o) =>
        str(o, ['id', 'taskId', 'performedBy', 'targetVersion', 'basis']) &&
        date(o.startedAt) &&
        Number.isSafeInteger(o.round) &&
        Number(o.round) > 0,
    ) &&
    rows(
      'executions',
      (o) =>
        str(o, ['id', 'taskId', 'source', 'startedAt', 'createdAt']) &&
        o.source === 'mock' &&
        date(o.startedAt) &&
        date(o.createdAt) &&
        nullable(o, [
          'externalTestId',
          'finishedAt',
          'failureReason',
          'reportReference',
          'performedBy',
          'targetVersion',
          'basis',
          'technicalSummary',
          'internalNotes',
          'evidenceReference',
        ]) &&
        o.version === 1 &&
        ['legacy', 'recorded'].includes(String(o.origin)) &&
        ['finished', 'cancelled'].includes(String(o.termination)) &&
        (o.round === null ||
          (Number.isSafeInteger(o.round) && Number(o.round) > 0)) &&
        (o.result === null ||
          ['passed', 'failed', 'inconclusive'].includes(String(o.result))),
    ) &&
    rows(
      'conclusions',
      (o) =>
        str(o, [
          'id',
          'channelId',
          'testType',
          'executionId',
          'adoptedBy',
          'adoptedAt',
          'reason',
          'targetVersion',
          'basis',
        ]) &&
        date(o.adoptedAt) &&
        ['passed', 'failed'].includes(String(o.result)) &&
        ['quality', 'connectivity'].includes(String(o.testType)),
    ) &&
    rows(
      'reviews',
      (o) =>
        str(o, ['id', 'executionId', 'reviewedBy', 'reviewedAt', 'reason']) &&
        date(o.reviewedAt) &&
        o.disposition === 'reviewed_without_conclusion',
    ) &&
    rows(
      'sourceVerifications',
      (o) =>
        str(o, [
          'id',
          'channelId',
          'sourceType',
          'evidenceReference',
          'actorUserId',
          'occurredAt',
          'reason',
          'basis',
        ]) &&
        date(o.occurredAt) &&
        ['verified', 'revoked'].includes(String(o.status)),
    ) &&
    rows(
      'exemptions',
      (o) =>
        str(o, [
          'id',
          'source',
          'channelId',
          'verifiedBy',
          'verifiedAt',
          'evidenceReference',
          'reason',
        ]) &&
        o.source === 'mock' &&
        date(o.verifiedAt) &&
        ['legacy', 'recorded'].includes(String(o.origin)) &&
        nullable(o, [
          'sourceVerificationId',
          'recordedBy',
          'recordedAt',
          'basis',
        ]),
    ) &&
    rows(
      'exemptionRevocations',
      (o) =>
        str(o, [
          'id',
          'exemptionId',
          'channelId',
          'action',
          'actorUserId',
          'occurredAt',
          'reason',
        ]) &&
        date(o.occurredAt) &&
        ['revoked', 'invalidated'].includes(String(o.action)),
    ) &&
    rows(
      'testHistory',
      (o) =>
        str(o, [
          'id',
          'channelId',
          'action',
          'actorUserId',
          'occurredAt',
          'reason',
          'requestId',
        ]) &&
        date(o.occurredAt) &&
        nullable(o, ['taskId', 'executionId']) &&
        Array.isArray(o.changes) &&
        o.changes.every(
          (c: unknown) =>
            object(c) && str(c, ['field']) && nullable(c, ['before', 'after']),
        ),
    ) &&
    rows('testRequests', (o) =>
      str(o, ['id', 'actorUserId', 'operation', 'fingerprint', 'resultId']),
    ) &&
    rows('legacyTestStates', (o) =>
      str(o, [
        'channelId',
        'qualityStatus',
        'connectivityStatus',
        'sourceVerificationStatus',
        'basis',
      ]),
    )
  );
}
export function validateTesting(s: ChannelState): void {
  const fail = (msg: string): never => {
    throw new SupplierError('VALIDATION', msg);
  };
  const channel = (id: string) => s.channels.find((c) => c.id === id),
    task = (id: string) => s.tasks.find((t) => t.id === id),
    meta = (id: string) => s.taskDefinitions.find((d) => d.taskId === id),
    user = (id: string | null) =>
      id === null || fixture.users.some((u) => u.id === id);
  for (const key of [
    'taskDefinitions',
    'runs',
    'executions',
    'conclusions',
    'reviews',
    'sourceVerifications',
    'exemptions',
    'exemptionRevocations',
    'testHistory',
    'testRequests',
    'legacyTestStates',
  ] as const) {
    const ids = s[key].map((v) =>
      'id' in v ? v.id : 'taskId' in v ? v.taskId : v.channelId,
    );
    if (new Set(ids).size !== ids.length) fail('测试记录 ID 不唯一。');
  }
  if (
    s.taskDefinitions.length !== s.tasks.length ||
    s.legacyTestStates.length !== s.channels.length
  )
    fail('测试任务或历史状态定义不完整。');
  for (const l of s.legacyTestStates)
    if (!channel(l.channelId)) fail('历史状态关联无效。');
  for (const t of s.tasks) {
    const d = meta(t.id);
    if (
      !channel(t.channelId) ||
      !d ||
      !user(d.createdBy) ||
      !user(t.assignedTo)
    )
      fail('测试任务关联无效。');
    if (
      d &&
      (d.cancelledBy || d.cancelledAt || d.cancellationReason) &&
      (t.status !== 'cancelled' ||
        !d.cancelledBy ||
        !user(d.cancelledBy) ||
        !date(d.cancelledAt) ||
        !d.cancellationReason?.trim())
    )
      fail('取消事实不完整或状态不一致。');
    const active = s.runs.filter(
      (r) => r.taskId === t.id && !s.executions.some((e) => e.id === r.id),
    );
    if (active.length > 1 || (active.length === 1 && t.status !== 'running'))
      fail('任务存在冲突的进行中执行。');
    if (t.status === 'running' && d?.createdBy !== null && active.length !== 1)
      fail('执行中的新任务必须有独立执行。');
    if (
      t.status === 'cancelled' &&
      d?.createdBy !== null &&
      (!d?.cancelledBy || !d.cancelledAt || !d.cancellationReason)
    )
      fail('任务取消缺少独立说明。');
  }
  for (const r of s.runs)
    if (
      !task(r.taskId) ||
      !user(r.performedBy) ||
      !meta(r.taskId) ||
      r.targetVersion !== meta(r.taskId)?.targetVersion ||
      r.basis !== meta(r.taskId)?.basis
    )
      fail('执行起始信息与测试目标不一致。');
  for (const e of s.executions) {
    if (
      !task(e.taskId) ||
      !e.finishedAt ||
      !date(e.finishedAt) ||
      Date.parse(e.finishedAt) < Date.parse(e.startedAt)
    )
      fail('执行时间或任务关联无效。');
    if (e.origin === 'recorded') {
      const r = s.runs.find((r) => r.id === e.id);
      if (
        !r ||
        r.taskId !== e.taskId ||
        r.startedAt !== e.startedAt ||
        r.performedBy !== e.performedBy ||
        r.basis !== e.basis ||
        r.targetVersion !== e.targetVersion ||
        r.round !== e.round ||
        !e.technicalSummary?.trim() ||
        !e.evidenceReference?.startsWith('mock:') ||
        (e.termination === 'finished' && e.result === null) ||
        (e.termination === 'cancelled' && e.result !== null)
      )
        fail('执行结果与独立轮次不一致。');
    }
  }
  const resolved = new Set<string>();
  for (const c of s.conclusions) {
    const e = s.executions.find((e) => e.id === c.executionId),
      t = e ? task(e.taskId) : null;
    if (
      !e ||
      e.origin !== 'recorded' ||
      e.termination !== 'finished' ||
      !t ||
      t.channelId !== c.channelId ||
      t.testType !== c.testType ||
      e.result !== c.result ||
      e.targetVersion !== c.targetVersion ||
      e.basis !== c.basis ||
      !user(c.adoptedBy) ||
      fixture.users.find((u) => u.id === c.adoptedBy)?.role !==
        'ProductOperations' ||
      resolved.has(e.id)
    )
      fail('采纳必须对应独立且尚未处理的已完成执行。');
    resolved.add(c.executionId);
  }
  for (const r of s.reviews) {
    const e = s.executions.find((e) => e.id === r.executionId);
    if (
      !e ||
      (e.result !== 'inconclusive' &&
        e.basis ===
          (channel(task(e.taskId)?.channelId ?? '')
            ? basisFor(channel(task(e.taskId)?.channelId ?? '')!)
            : null)) ||
      e.origin !== 'recorded' ||
      resolved.has(e.id) ||
      fixture.users.find((u) => u.id === r.reviewedBy)?.role !==
        'ProductOperations'
    )
      fail('不确定结果审阅无效。');
    resolved.add(r.executionId);
  }
  for (const v of s.sourceVerifications)
    if (
      !channel(v.channelId) ||
      fixture.users.find((u) => u.id === v.actorUserId)?.role !==
        'ProductOperations' ||
      !v.evidenceReference.startsWith('mock:')
    )
      fail('来源核验关联无效。');
  for (const e of s.exemptions) {
    if (!channel(e.channelId) || !user(e.verifiedBy)) fail('豁免关联无效。');
    if (e.origin === 'recorded') {
      const v = s.sourceVerifications.find(
        (v) => v.id === e.sourceVerificationId,
      );
      if (
        !v ||
        v.channelId !== e.channelId ||
        v.status !== 'verified' ||
        v.sourceType !== 'official_direct' ||
        v.basis !== e.basis ||
        e.recordedBy !== e.verifiedBy ||
        !e.recordedAt ||
        fixture.users.find((u) => u.id === e.verifiedBy)?.role !==
          'ProductOperations'
      )
        fail('有效豁免缺少独立来源核验。');
    }
  }
  for (const e of s.exemptionRevocations)
    if (
      !s.exemptions.some(
        (v) => v.id === e.exemptionId && v.channelId === e.channelId,
      ) ||
      fixture.users.find((u) => u.id === e.actorUserId)?.role !==
        'ProductOperations'
    )
      fail('豁免撤销关联无效。');
  for (const a of s.testHistory)
    if (
      !channel(a.channelId) ||
      !user(a.actorUserId) ||
      (a.taskId &&
        !s.tasks.some(
          (t) => t.id === a.taskId && t.channelId === a.channelId,
        )) ||
      (a.executionId &&
        ![...s.runs, ...s.executions].some(
          (e) =>
            e.id === a.executionId &&
            task(e.taskId)?.channelId === a.channelId &&
            (a.taskId === null || a.taskId === e.taskId),
        ))
    )
      fail('测试审计关联无效。');
  const results = new Set(
    [
      ...s.tasks,
      ...s.runs,
      ...s.executions,
      ...s.conclusions,
      ...s.reviews,
      ...s.sourceVerifications,
      ...s.exemptions,
      ...s.exemptionRevocations,
    ].map((v) => v.id),
  );
  for (const r of s.testRequests)
    if (
      !user(r.actorUserId) ||
      !r.id.startsWith(`${r.actorUserId}:`) ||
      !results.has(r.resultId)
    )
      fail('测试幂等记录关联无效。');
  if (JSON.stringify(projectedTestChannels(s)) !== JSON.stringify(s.channels))
    fail('渠道状态必须与当前采纳、来源及豁免权威事实一致。');
}

/** Guard stable external execution references even when their channel is a seed channel. */
export function assertTestResetReferences(
  next: ChannelState,
  remediations: readonly Remediation[],
) {
  for (const r of remediations) {
    const e = next.executions.find((e) => e.id === r.relatedTestExecutionId);
    if (
      !next.channels.some((c) => c.id === r.channelId) ||
      (r.relatedTestExecutionId !== null &&
        (!e ||
          !next.tasks.some(
            (t) => t.id === e.taskId && t.channelId === r.channelId,
          )))
    )
      throw new SupplierError(
        'VALIDATION',
        '整改历史引用了将被移除的测试执行，拒绝重置；不会级联清理整改。',
      );
  }
}
