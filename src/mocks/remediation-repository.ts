import { LifecycleRepository } from './lifecycle-repository';
import type {
  ManagedRemediation,
  RemediationState,
} from '../domain/remediations';
import type { ChannelState } from '../services/channel-types';
import type { StoragePort } from './supplier-repository';
import { fixture } from './data';
import { SupplierError } from '../services/supplier-types';
export const remediationStorageKey = 'maas-remediation-demo-v1';
export const fingerprint = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(fingerprint).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${JSON.stringify(k)}:${fingerprint(v)}`)
          .join(',')}}`
      : String(JSON.stringify(v));
export const remediationSeed = (): RemediationState => ({
  schemaVersion: 1,
  revision: 0,
  records: fixture.remediations.map((r) => ({
    ...r,
    supplierId: fixture.channels.find((c) => c.id === r.channelId)!.supplierId,
    version: 1,
    sourceType: 'legacy',
    sourceTaskId: null,
    sourceBasis: null,
    sourceTargetVersion: null,
    category: null,
    verificationScope: null,
    targetReference: null,
    sharedSummary: null,
    internalNotes: null,
    assigneeUserId: null,
    dueAt: null,
    createdBy: null,
    activeRound: null,
    splitReason: null,
  })),
  submissions: [],
  links: [],
  closures: [],
  events: [],
  requests: [],
});
const fail = (message: string): never => {
  throw new SupplierError('VALIDATION', message);
};
function validate(s: RemediationState) {
  if (
    !s ||
    s.schemaVersion !== 1 ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0
  )
    fail('整改数据版本无效。');
  for (const key of [
    'records',
    'submissions',
    'links',
    'closures',
    'events',
    'requests',
  ] as const) {
    if (
      !Array.isArray(s[key]) ||
      new Set(s[key].map((r) => r.id)).size !== s[key].length ||
      s[key].some((r) => !r.id)
    )
      fail('整改集合损坏。');
  }
  const allowed: Record<string, readonly string[]> = {
    records: Object.keys(remediationSeed().records[0]!),
    submissions: [
      'id',
      'remediationId',
      'round',
      'submittedBy',
      'submittedAt',
      'version',
      'sharedSummary',
      'internalNotes',
      'evidenceReference',
    ],
    links: [
      'id',
      'remediationId',
      'round',
      'executionId',
      'taskId',
      'targetVersion',
      'basis',
      'linkedBy',
      'linkedAt',
      'applicabilityReason',
    ],
    closures: [
      'id',
      'remediationId',
      'round',
      'closureType',
      'exceptionCategory',
      'verificationExecutionId',
      'verificationConclusionId',
      'closedBy',
      'closedAt',
      'reason',
      'verificationToken',
    ],
    events: [
      'id',
      'remediationId',
      'action',
      'actorUserId',
      'occurredAt',
      'reason',
      'requestId',
      'beforeVersion',
      'afterVersion',
      'beforeStatus',
      'afterStatus',
      'round',
      'changes',
    ],
    requests: ['id', 'operation', 'fingerprint', 'resultId'],
  };
  for (const key of Object.keys(allowed) as (keyof typeof allowed)[]) {
    const rows =
      s[
        key as keyof Pick<
          RemediationState,
          | 'records'
          | 'submissions'
          | 'links'
          | 'closures'
          | 'events'
          | 'requests'
        >
      ];
    for (const row of rows)
      if (
        !row ||
        Object.keys(row).length !== allowed[key]!.length ||
        Object.keys(row).some((k) => !allowed[key]!.includes(k))
      )
        fail('整改字段缺失或包含未批准字段。');
  }
  for (const e of s.events)
    if (
      !e.reason ||
      !fixture.users.some((u) => u.id === e.actorUserId) ||
      !Number.isFinite(Date.parse(e.occurredAt)) ||
      !Number.isSafeInteger(e.afterVersion) ||
      !Array.isArray(e.changes)
    )
      fail('整改事件损坏。');
  for (const l of s.links)
    if (
      !l.applicabilityReason ||
      !l.executionId ||
      !l.taskId ||
      !Number.isSafeInteger(l.round) ||
      l.round < 1 ||
      !Number.isFinite(Date.parse(l.linkedAt))
    )
      fail('复测关联损坏。');
  for (const q of s.requests)
    if (
      !q.fingerprint ||
      !q.operation ||
      !s.records.some((r) => r.id === q.resultId)
    )
      fail('整改幂等记录损坏。');
  for (const key of ['submissions', 'links', 'closures'] as const) {
    const ids = s[key].map((row) =>
      key === 'closures'
        ? row.remediationId
        : JSON.stringify([
            row.remediationId,
            row.round,
            key === 'links'
              ? (row as RemediationState['links'][number]).executionId
              : null,
          ]),
    );
    if (new Set(ids).size !== ids.length)
      fail('重复的整改轮次、复测关联或关闭记录。');
  }
  for (const r of s.records) {
    for (const k of [
      'sourceTaskId',
      'sourceBasis',
      'sourceTargetVersion',
      'targetReference',
      'sharedSummary',
      'internalNotes',
      'assigneeUserId',
      'dueAt',
      'createdBy',
      'splitReason',
      'relatedTestExecutionId',
      'supplierResponse',
    ] as const)
      if (r[k] !== null && typeof r[k] !== 'string')
        fail('整改可空字段类型损坏。');
    for (const k of [
      'id',
      'supplierId',
      'channelId',
      'description',
      'submittedBy',
      'updatedBy',
      'createdAt',
      'updatedAt',
    ] as const)
      if (typeof r[k] !== 'string') fail('整改文本字段类型损坏。');

    if (
      r.source !== 'mock' ||
      !['open', 'in_progress', 'submitted', 'closed'].includes(r.status) ||
      !Number.isSafeInteger(r.version) ||
      r.version < 1 ||
      !['legacy', 'manual', 'failed_execution'].includes(r.sourceType) ||
      !r.channelId ||
      !r.supplierId ||
      !Number.isFinite(Date.parse(r.updatedAt)) ||
      !Number.isFinite(Date.parse(r.createdAt))
    )
      fail('整改主档损坏。');
    if (
      r.category !== null &&
      ![
        'quality',
        'timeout',
        'authentication',
        'invalid_response',
        'other',
      ].includes(r.category)
    )
      fail('问题分类无效。');
    if (
      r.verificationScope !== null &&
      !['quality', 'connectivity'].includes(r.verificationScope)
    )
      fail('验证范围无效。');
    if (r.dueAt !== null && !Number.isFinite(Date.parse(r.dueAt)))
      fail('期限损坏。');
    if (
      r.activeRound !== null &&
      (!Number.isSafeInteger(r.activeRound) || r.activeRound < 1)
    )
      fail('整改轮次无效。');
    if (
      r.sourceType !== 'legacy' &&
      (!r.category ||
        !r.verificationScope ||
        !r.targetReference ||
        !r.sharedSummary ||
        !r.internalNotes ||
        !r.createdBy)
    )
      fail('整改必填字段缺失。');
  }
  for (const key of ['submissions', 'links', 'closures', 'events'] as const)
    for (const row of s[key])
      if (!s.records.some((r) => r.id === row.remediationId))
        fail('整改历史引用不存在。');
  for (const row of s.submissions)
    if (
      !row.sharedSummary ||
      !row.internalNotes ||
      !/^mock:[A-Za-z0-9_:/.-]+$/.test(row.evidenceReference) ||
      !Number.isFinite(Date.parse(row.submittedAt))
    )
      fail('整改提交记录无效。');
  for (const row of s.closures)
    if (
      !s.records.some(
        (r) => r.id === row.remediationId && r.status === 'closed',
      ) ||
      !row.reason ||
      (row.closureType === 'normal' &&
        (!row.verificationExecutionId ||
          !row.verificationConclusionId ||
          !row.verificationToken))
    )
      fail('关闭记录无效。');
}
export function assertRemediationReferences(
  s: RemediationState,
  c: ChannelState,
) {
  for (const r of s.records) {
    if (
      !c.channels.some(
        (v) => v.id === r.channelId && v.supplierId === r.supplierId,
      )
    )
      fail('整改历史引用保护：关联渠道不能删除或更换供应商。');
    if (r.relatedTestExecutionId) {
      const e = c.executions.find((e) => e.id === r.relatedTestExecutionId);
      if (
        !e ||
        !c.tasks.some((t) => t.id === e.taskId && t.channelId === r.channelId)
      )
        fail('整改历史引用保护：来源执行不能删除。');
    }
    if (
      r.sourceTaskId &&
      !c.tasks.some(
        (t) => t.id === r.sourceTaskId && t.channelId === r.channelId,
      )
    )
      fail('整改任务引用保护。');
  }
  for (const l of s.links) {
    const r = s.records.find((r) => r.id === l.remediationId)!;
    if (
      !c.executions.some(
        (e) => e.id === l.executionId && e.taskId === l.taskId,
      ) ||
      !c.tasks.some((t) => t.id === l.taskId && t.channelId === r.channelId)
    )
      fail('整改历史复测引用保护：不能删除关联测试。');
  }
  for (const cl of s.closures)
    if (
      cl.verificationConclusionId &&
      !c.conclusions.some(
        (v) =>
          v.id === cl.verificationConclusionId &&
          v.executionId === cl.verificationExecutionId,
      )
    )
      fail('整改关闭结论引用保护。');
}
export class RemediationRepository {
  constructor(private readonly storage: StoragePort) {}
  read(): RemediationState {
    try {
      const raw = this.storage.getItem(remediationStorageKey);
      if (raw === null) return remediationSeed();
      const s: RemediationState = JSON.parse(raw);
      validate(s);
      return structuredClone(s);
    } catch {
      throw new SupplierError(
        'STORAGE',
        '整改数据损坏、读取失败或版本不兼容，请由双域运营明确重置。',
      );
    }
  }
  write(
    before: RemediationState,
    next: RemediationState,
    channels: ChannelState,
  ) {
    validate(next);
    assertRemediationReferences(next, channels);
    if (fingerprint(this.read()) !== fingerprint(before))
      throw new SupplierError('CONFLICT', '整改已变化，请重新加载。');
    for (const key of [
      'submissions',
      'links',
      'closures',
      'events',
      'requests',
    ] as const)
      if (
        next[key].length < before[key].length ||
        before[key].some((v, i) => fingerprint(v) !== fingerprint(next[key][i]))
      )
        fail('整改历史只能追加。');
    for (const key of ['submissions', 'links', 'closures', 'events'] as const)
      for (const row of next[key].slice(before[key].length))
        if (
          before.records.some(
            (r) => r.id === row.remediationId && r.status === 'closed',
          )
        )
          fail('已关闭事项不能追加新的业务历史。');
    for (const r of before.records) {
      const n = next.records.find((n) => n.id === r.id);
      if (!n) fail('整改不能删除。');
      if (fingerprint(r) !== fingerprint(n)) {
        for (const k of [
          'sourceTaskId',
          'sourceBasis',
          'sourceTargetVersion',
          'description',
          'supplierResponse',
          'submittedBy',
          'createdAt',
          'createdBy',
        ] as const)
          if (n![k] !== r[k]) fail('原始来源与 legacy 字段不可改写。');

        if (
          r.status === 'closed' ||
          n!.version !== r.version + 1 ||
          n!.channelId !== r.channelId ||
          n!.supplierId !== r.supplierId ||
          n!.sourceType !== r.sourceType ||
          n!.relatedTestExecutionId !== r.relatedTestExecutionId ||
          !next.events
            .slice(before.events.length)
            .some(
              (e) =>
                e.remediationId === r.id &&
                e.beforeVersion === r.version &&
                e.afterVersion === n!.version,
            )
        )
          fail('整改变更需要版本及审计，关闭为终态。');
        const transitions = {
          open: ['open', 'in_progress', 'closed'],
          in_progress: ['in_progress', 'submitted', 'closed'],
          submitted: ['submitted', 'in_progress', 'closed'],
          closed: ['closed'],
        };
        if (!transitions[r.status].includes(n!.status))
          fail('整改状态流转无效。');
      }
    }
    try {
      this.storage.setItem(
        remediationStorageKey,
        JSON.stringify({ ...next, revision: before.revision + 1 }),
      );
    } catch {
      throw new SupplierError(
        'STORAGE',
        '整改保存失败，未提交更改；已保存的测试仍保留，尚未关联整改时可重试。',
      );
    }
  }
  reset() {
    if (
      new LifecycleRepository(this.storage)
        .read()
        .events.some((e) => e.remediationId)
    )
      throw new SupplierError(
        'VALIDATION',
        '生命周期已引用整改轮次，拒绝重置；交付和测试历史保留。',
      );
    try {
      this.storage.setItem(
        remediationStorageKey,
        JSON.stringify(remediationSeed()),
      );
    } catch {
      throw new SupplierError('STORAGE', '整改重置失败。');
    }
  }
}
export const remediationRepository = new RemediationRepository({
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
});
export function projectLegacyRemediation(r: ManagedRemediation) {
  return {
    id: r.id,
    source: r.source,
    channelId: r.channelId,
    relatedTestExecutionId: r.relatedTestExecutionId,
    description: r.description,
    status: r.status,
    supplierResponse: r.supplierResponse,
    submittedBy: r.submittedBy,
    updatedBy: r.updatedBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
