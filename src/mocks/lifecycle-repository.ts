import type { LifecycleState } from '../domain/lifecycle';
import type { ChannelState } from '../services/channel-types';
import type { StoragePort } from './supplier-repository';
import { SupplierError } from '../services/supplier-types';
import { fingerprint } from './remediation-repository';
export const lifecycleStorageKey = 'maas-lifecycle-demo-v1';
const seed = (): LifecycleState => ({
  schemaVersion: 1,
  revision: 0,
  records: [],
  verifications: [],
  tasks: [],
  events: [],
  comments: [],
  goals: [],
  communications: [],
  requests: [],
});
const fail = (m: string): never => {
  throw new SupplierError('VALIDATION', m);
};
function validate(s: LifecycleState) {
  if (
    !s ||
    s.schemaVersion !== 1 ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0
  )
    fail('交付数据版本不兼容。');
  for (const k of [
    'records',
    'verifications',
    'tasks',
    'events',
    'comments',
    'goals',
    'communications',
    'requests',
  ] as const)
    if (!Array.isArray(s[k])) fail('交付数据结构损坏。');
  for (const k of [
    'verifications',
    'tasks',
    'events',
    'comments',
    'requests',
  ] as const)
    if (new Set(s[k].map((r) => r.id)).size !== s[k].length)
      fail('交付标识重复。');
  if (new Set(s.records.map((r) => r.channelId)).size !== s.records.length)
    fail('渠道交付记录重复。');
  for (const r of s.records)
    if (
      !r.channelId ||
      !Number.isSafeInteger(r.version) ||
      r.version < 1 ||
      !r.procurementOwnerId ||
      !r.testerId ||
      !r.operatorId ||
      !['drafting', 'signing', 'effective', 'paused', 'terminated'].includes(
        r.contractStage,
      ) ||
      !['not_open', 'open', 'private', 'paused', 'disabled'].includes(
        r.dispatch,
      ) ||
      !Number.isFinite(Date.parse(r.updatedAt))
    )
      fail('交付主档无效。');
  for (const v of s.verifications)
    if (
      !s.records.some((r) => r.channelId === v.channelId) ||
      !v.executionId ||
      !['quality', 'connectivity'].includes(v.phase) ||
      !['passed', 'failed'].includes(v.conclusion) ||
      !/^mock:[\w:/.-]+$/.test(v.evidenceReference)
    )
      fail('阶段核验无效。');
  for (const t of s.tasks)
    if (
      !Number.isSafeInteger(t.version) ||
      t.version < 1 ||
      !Array.isArray(t.relatedChannelIds) ||
      !['open', 'completed', 'cancelled'].includes(t.status) ||
      !t.sourceId ||
      !t.assigneeId ||
      !Number.isFinite(Date.parse(t.createdAt)) ||
      (t.status === 'completed' &&
        (!t.completedAt || !t.completionActorId || !t.completionReason))
    )
      fail('协作任务无效。');
  for (const c of s.comments)
    if (
      !s.records.some((r) => r.channelId === c.channelId) ||
      !c.body ||
      !Array.isArray(c.recipientIds)
    )
      fail('评论引用无效。');
}
export function assertLifecycleReferences(s: LifecycleState, c: ChannelState) {
  for (const r of s.records)
    if (!c.channels.some((ch) => ch.id === r.channelId))
      fail('生命周期历史引用渠道，不能重置移除。');
  for (const v of s.verifications) {
    const e = c.executions.find((e) => e.id === v.executionId),
      t = c.tasks.find((t) => t.id === e?.taskId);
    if (!e || !t || t.channelId !== v.channelId || t.testType !== v.phase)
      fail('交付核验引用测试历史，拒绝重置。');
  }
  for (const e of s.events)
    if (e.executionId && !c.executions.some((v) => v.id === e.executionId))
      fail('交付通知引用测试执行，拒绝重置。');
}
export class LifecycleRepository {
  constructor(private storage: StoragePort) {}
  read(): LifecycleState {
    try {
      const raw = this.storage.getItem(lifecycleStorageKey);
      if (raw === null) return seed();
      const s: LifecycleState = JSON.parse(raw);
      validate(s);
      return structuredClone(s);
    } catch {
      throw new SupplierError(
        'STORAGE',
        '生命周期数据损坏、读取失败或版本不兼容；不会自动清空。',
      );
    }
  }
  write(before: LifecycleState, next: LifecycleState) {
    validate(next);
    if (fingerprint(this.read()) !== fingerprint(before))
      throw new SupplierError('CONFLICT', '交付记录已变化，请刷新。');
    for (const key of [
      'verifications',
      'events',
      'comments',
      'requests',
    ] as const)
      if (
        next[key].length < before[key].length ||
        before[key].some((v, i) => fingerprint(v) !== fingerprint(next[key][i]))
      )
        fail('交付历史只能追加。');
    for (const r of before.records) {
      const n = next.records.find((n) => n.channelId === r.channelId);
      if (
        !n ||
        (fingerprint(n) !== fingerprint(r) && n.version !== r.version + 1)
      )
        fail('交付主档需匹配版本且不可删除。');
    }
    if (
      next.tasks.length < before.tasks.length ||
      before.tasks.some((t, i) => next.tasks[i]?.id !== t.id)
    )
      fail('任务不能删除或重排。');
    for (const t of before.tasks) {
      const n = next.tasks.find((v) => v.id === t.id)!;
      for (const key of [
        'id',
        'objectType',
        'objectId',
        'channelId',
        'demandId',
        'type',
        'createdAt',
        'sourceId',
        'initiatorId',
      ] as const)
        if (n[key] !== t[key]) fail('任务业务来源不可改写。');
      if (fingerprint(t) !== fingerprint(n) && n.version <= t.version)
        fail('任务变更须递增版本。');
    }
    try {
      this.storage.setItem(
        lifecycleStorageKey,
        JSON.stringify({ ...next, revision: before.revision + 1 }),
      );
    } catch {
      throw new SupplierError(
        'STORAGE',
        '交付协作保存失败；已保存测试等原业务事实保留，可重试同步通知。',
      );
    }
  }
}
