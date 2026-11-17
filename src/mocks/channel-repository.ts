import { businessStorage } from '../services/runtime-data';
import {
  LifecycleRepository,
  assertLifecycleReferences,
} from './lifecycle-repository';
import {
  RemediationRepository,
  assertRemediationReferences,
  projectLegacyRemediation,
} from './remediation-repository';
import {
  initialTesting,
  testingShape,
  validateTesting,
  testingSnapshot,
  reconcileTestConfiguration,
} from './testing-state';
import { fixture } from './data';
import { validateStore } from '../domain/validation';
import { SupplierError } from '../services/supplier-types';
import {
  channelTypeLabels,
  qualityStatusLabels,
  connectivityStatusLabels,
  integrationStatusLabels,
  availabilityStatusLabels,
} from '../domain/statuses';
import type { ManagedChannel, ChannelState } from '../services/channel-types';
import type { StoragePort, SupplierRepository } from './supplier-repository';
export const channelStorageKey = 'maas-channel-demo-v1';
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function channelShape(v: unknown): v is ManagedChannel {
  if (!record(v)) return false;
  const strings = [
    'id',
    'supplierId',
    'modelId',
    'displayName',
    'modelInvocationName',
    'endpointReference',
    'createdBy',
    'updatedBy',
    'createdAt',
    'updatedAt',
  ];
  if (
    !strings.every((k) => typeof v[k] === 'string') ||
    !v.id ||
    !Number.isSafeInteger(v.version) ||
    Number(v.version) < 1 ||
    v.source !== 'mock'
  )
    return false;
  if (
    !['createdAt', 'updatedAt'].every((k) =>
      Number.isFinite(Date.parse(v[k] as string)),
    )
  )
    return false;
  if (
    v.opChannelId !== null &&
    (typeof v.opChannelId !== 'string' || !v.opChannelId.trim())
  )
    return false;
  for (const [k, labels] of Object.entries({
    channelType: channelTypeLabels,
    qualityStatus: qualityStatusLabels,
    connectivityStatus: connectivityStatusLabels,
    integrationStatus: integrationStatusLabels,
    availabilityStatus: availabilityStatusLabels,
    resourceStatus: { enabled: 1, disabled: 1 },
    sourceVerificationStatus: { unverified: 1, verified: 1, rejected: 1 },
  }))
    if (typeof v[k] !== 'string' || !Object.hasOwn(labels, v[k])) return false;
  return ['tpm', 'rpm', 'concurrencyLimit', 'ttftMs'].every(
    (k) =>
      v[k] === null ||
      (typeof v[k] === 'number' &&
        Number.isFinite(v[k]) &&
        v[k] >= 0 &&
        (k === 'ttftMs' || Number.isSafeInteger(v[k]))),
  );
}
function shape(v: unknown): v is ChannelState {
  if (
    !record(v) ||
    ![1, 2].includes(v.schemaVersion as number) ||
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 0 ||
    !Array.isArray(v.channels) ||
    !v.channels.every(channelShape) ||
    !Array.isArray(v.tasks) ||
    !Array.isArray(v.history)
  )
    return false;
  if (
    !v.tasks.every(
      (t) =>
        record(t) &&
        typeof t.id === 'string' &&
        typeof t.channelId === 'string' &&
        ['quality', 'connectivity'].includes(String(t.testType)) &&
        ['pending', 'running', 'completed', 'cancelled'].includes(
          String(t.status),
        ) &&
        t.source === 'mock' &&
        (t.assignedTo === null || typeof t.assignedTo === 'string') &&
        typeof t.createdAt === 'string' &&
        typeof t.updatedAt === 'string',
    )
  )
    return false;
  if (
    !v.history.every(
      (e) =>
        record(e) &&
        typeof e.id === 'string' &&
        typeof e.channelId === 'string' &&
        [
          'channel:create',
          'channel:update',
          'channel:toggle',
          'channel:bind-op',
        ].includes(String(e.action)) &&
        typeof e.actorUserId === 'string' &&
        typeof e.occurredAt === 'string' &&
        typeof e.reason === 'string' &&
        Array.isArray(e.changedFields) &&
        e.changedFields.every((k) => typeof k === 'string') &&
        (e.beforeSnapshot === null || channelShape(e.beforeSnapshot)) &&
        channelShape(e.afterSnapshot),
    )
  )
    return false;
  return v.schemaVersion === 1
    ? [
        'executions',
        'conclusions',
        'taskDefinitions',
        'reviews',
        'runs',
        'exemptions',
        'sourceVerifications',
        'exemptionRevocations',
        'testHistory',
        'testRequests',
        'legacyTestStates',
      ].every((k) => v[k] === undefined)
    : testingShape(v);
}
function seed(): ChannelState {
  return {
    schemaVersion: 2,
    ...initialTesting(fixture.channels, fixture.testTasks),
    revision: 0,
    channels: fixture.channels.map((c) => ({
      ...c,
      version: 1,
      createdBy: 'u-ops',
      updatedBy: 'u-ops',
    })),
    tasks: structuredClone(fixture.testTasks),
    history: [],
  };
}
export class ChannelRepository {
  readonly remediations: RemediationRepository;
  readonly lifecycle: LifecycleRepository;
  constructor(private storage: StoragePort) {
    this.remediations = new RemediationRepository(storage);
    this.lifecycle = new LifecycleRepository(storage);
  }
  read(): ChannelState {
    try {
      const raw = this.storage.getItem(channelStorageKey);
      if (raw === null) return seed();
      const data: unknown = JSON.parse(raw);
      if (!shape(data)) throw Error();
      return structuredClone(
        data.schemaVersion === 2
          ? data
          : {
              ...data,
              ...initialTesting(data.channels, data.tasks),
              schemaVersion: 2,
            },
      );
    } catch {
      throw new SupplierError(
        'STORAGE',
        '渠道演示数据读取失败或版本不兼容，请检查存储或确认重置。',
      );
    }
  }
  validate(state: ChannelState, suppliers: SupplierRepository) {
    if (!shape(state))
      throw new SupplierError('VALIDATION', '渠道数据结构无效。');
    const errors = validateStore({
      ...fixture,
      remediations: this.remediations
        .read()
        .records.map(projectLegacyRemediation),
      suppliers: suppliers.read().suppliers,
      channels: state.channels,
      ...testingSnapshot(state),
    });
    if (errors.length)
      throw new SupplierError(
        'VALIDATION',
        '渠道关联校验失败：' + errors.join('; '),
      );
    validateTesting(state);
    assertRemediationReferences(this.remediations.read(), state);
  }
  write(
    before: ChannelState,
    next: ChannelState,
    suppliers: SupplierRepository,
  ) {
    const current = this.read();
    this.validate(current, suppliers);
    next = reconcileTestConfiguration(before, next);
    this.validate(next, suppliers);
    if (JSON.stringify(current) !== JSON.stringify(before))
      throw new SupplierError('CONFLICT', '渠道数据已变化，请重新加载。');
    for (const key of [
      'history',
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
      if (
        next[key].length < before[key].length ||
        before[key].some(
          (v, i) => JSON.stringify(v) !== JSON.stringify(next[key][i]),
        )
      )
        throw new SupplierError(
          'VALIDATION',
          '渠道及测试历史仅允许追加，不能覆盖或删除。',
        );
    }
    if (before.tasks.some((t, i) => next.tasks[i]?.id !== t.id))
      throw new SupplierError(
        'VALIDATION',
        '原任务顺序不可改变，新任务只能追加。',
      );
    for (const t of before.tasks) {
      const n = next.tasks.find((v) => v.id === t.id),
        d = before.taskDefinitions.find((v) => v.taskId === t.id)!,
        nd = next.taskDefinitions.find((v) => v.taskId === t.id);
      if (
        !n ||
        !nd ||
        t.channelId !== n.channelId ||
        t.testType !== n.testType ||
        t.createdAt !== n.createdAt ||
        d.createdBy !== nd.createdBy
      )
        throw new SupplierError('VALIDATION', '测试任务身份不可覆盖或删除。');
      if (
        (JSON.stringify(t) !== JSON.stringify(n) ||
          JSON.stringify(d) !== JSON.stringify(nd)) &&
        (nd.version !== d.version + 1 ||
          !next.testHistory
            .slice(before.testHistory.length)
            .some((e) => e.taskId === t.id))
      )
        throw new SupplierError('VALIDATION', '任务修改需要匹配的版本与审计。');
      if (nd.basis !== d.basis)
        throw new SupplierError(
          'VALIDATION',
          '任务配置依据不可变，请建立新任务。',
        );
      const transitions = {
        pending: ['pending', 'running', 'cancelled'],
        running: ['running', 'completed', 'cancelled'],
        completed: ['completed', 'running'],
        cancelled: ['cancelled'],
      };
      if (!transitions[t.status].includes(n.status))
        throw new SupplierError('VALIDATION', '测试任务状态流转无效。');
      if (
        (before.runs.some((r) => r.taskId === t.id) ||
          before.executions.some((e) => e.taskId === t.id)) &&
        (nd.targetVersion !== d.targetVersion ||
          nd.basis !== d.basis ||
          nd.targetReference !== d.targetReference)
      )
        throw new SupplierError(
          'VALIDATION',
          '已有执行的目标不可修改，请建立新任务。',
        );
      if (
        t.status === 'cancelled' &&
        (JSON.stringify(t) !== JSON.stringify(n) ||
          JSON.stringify(d) !== JSON.stringify(nd))
      )
        throw new SupplierError('VALIDATION', '已取消任务不可重开。');
    }
    try {
      this.storage.setItem(
        channelStorageKey,
        JSON.stringify({ ...next, revision: before.revision + 1 }),
      );
    } catch {
      throw new SupplierError('STORAGE', '渠道保存失败，未提交任何更改。');
    }
  }
  reset(suppliers: SupplierRepository) {
    const next = seed();
    assertLifecycleReferences(this.lifecycle.read(), next);
    assertRemediationReferences(this.remediations.read(), next);
    this.validate(next, suppliers);
    // Explicit confirmed reset is also the recovery path for incompatible/corrupt channel data.
    let revision = 0;
    try {
      revision = this.read().revision;
    } catch {
      /* The caller has confirmed discarding channel demo data. */
    }
    try {
      this.storage.setItem(
        channelStorageKey,
        JSON.stringify({ ...next, revision: revision + 1 }),
      );
    } catch {
      throw new SupplierError('STORAGE', '渠道重置失败，未更改供应商资料。');
    }
  }
}
export const channelRepository = new ChannelRepository({
  getItem: (k) => businessStorage.getItem(k),
  setItem: (k, v) => businessStorage.setItem(k, v),
});
