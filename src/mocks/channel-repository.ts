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
    v.schemaVersion !== 1 ||
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
  return true;
}
function seed(): ChannelState {
  return {
    schemaVersion: 1,
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
  constructor(private storage: StoragePort) {}
  read(): ChannelState {
    try {
      const raw = this.storage.getItem(channelStorageKey);
      if (raw === null) return seed();
      const data: unknown = JSON.parse(raw);
      if (!shape(data)) throw Error();
      return structuredClone(data);
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
      suppliers: suppliers.read().suppliers,
      channels: state.channels,
      testTasks: state.tasks,
    });
    if (errors.length)
      throw new SupplierError(
        'VALIDATION',
        '渠道关联校验失败：' + errors.join('; '),
      );
  }
  write(
    before: ChannelState,
    next: ChannelState,
    suppliers: SupplierRepository,
  ) {
    this.validate(next, suppliers);
    if (this.read().revision !== before.revision)
      throw new SupplierError('CONFLICT', '渠道数据已变化，请重新加载。');
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
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
});
