import { fixture } from './data';
import type { SourcingState } from '../domain/sourcing';
import { priorityLabels, matchStatusLabels } from '../domain/sourcing';
import { sourcingStatusLabels } from '../domain/statuses';
import { validateStore } from '../domain/validation';
import type { StoragePort, SupplierRepository } from './supplier-repository';
import type { ChannelRepository } from './channel-repository';
import { SupplierError } from '../services/supplier-types';
export const sourcingStorageKey = 'maas-sourcing-demo-v1';
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: Record<string, unknown>, keys: readonly string[]) =>
  keys.every((k) => typeof v[k] === 'string');
const numeric = (v: unknown, integer = true) =>
  v === null ||
  (typeof v === 'number' &&
    Number.isFinite(v) &&
    v >= 0 &&
    (!integer || Number.isSafeInteger(v)));
function shape(v: unknown): v is SourcingState {
  if (
    !record(v) ||
    v.schemaVersion !== 1 ||
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 0 ||
    !Array.isArray(v.demands) ||
    !Array.isArray(v.items) ||
    !Array.isArray(v.matches) ||
    !Array.isArray(v.history)
  )
    return false;
  if (
    !v.demands.every(
      (d) =>
        record(d) &&
        d.source === 'mock' &&
        text(d, [
          'id',
          'demandCode',
          'requesterUserId',
          'title',
          'description',
          'sharedTitle',
          'sharedSummary',
          'createdBy',
          'updatedBy',
          'createdAt',
          'updatedAt',
        ]) &&
        (d.customerId === null || typeof d.customerId === 'string') &&
        (d.dueAt === null || typeof d.dueAt === 'string') &&
        typeof d.priority === 'string' &&
        Object.hasOwn(priorityLabels, d.priority) &&
        typeof d.status === 'string' &&
        Object.hasOwn(sourcingStatusLabels, d.status) &&
        Number.isSafeInteger(d.version) &&
        Number(d.version) > 0,
    )
  )
    return false;
  if (
    !v.items.every(
      (i) =>
        record(i) &&
        i.source === 'mock' &&
        text(i, [
          'id',
          'demandId',
          'modelId',
          'requiredRegion',
          'createdAt',
          'updatedAt',
        ]) &&
        typeof i.status === 'string' &&
        Object.hasOwn(sourcingStatusLabels, i.status) &&
        typeof i.priority === 'string' &&
        Object.hasOwn(priorityLabels, i.priority) &&
        ['requiredTpm', 'requiredRpm', 'requiredConcurrency'].every((k) =>
          numeric(i[k]),
        ) &&
        numeric(i.requiredTtftMs, false) &&
        typeof i.targetPurchaseDiscount === 'number' &&
        Number.isSafeInteger(i.targetPurchaseDiscount) &&
        i.targetPurchaseDiscount >= 0 &&
        i.targetPurchaseDiscount <= 10000,
    )
  )
    return false;
  if (
    !v.matches.every(
      (m) =>
        record(m) &&
        m.source === 'mock' &&
        text(m, [
          'id',
          'demandItemId',
          'channelId',
          'assessment',
          'createdBy',
          'createdAt',
          'updatedAt',
        ]) &&
        typeof m.matchStatus === 'string' &&
        Object.hasOwn(matchStatusLabels, m.matchStatus),
    )
  )
    return false;
  if (
    !v.history.every(
      (e) =>
        record(e) &&
        text(e, [
          'id',
          'demandId',
          'action',
          'actorUserId',
          'occurredAt',
          'note',
        ]) &&
        [
          'created',
          'updated',
          'candidate_added',
          'candidate_updated',
          'progress',
        ].includes(String(e.action)) &&
        (e.demandItemId === null || typeof e.demandItemId === 'string') &&
        (e.matchId === null || typeof e.matchId === 'string') &&
        Array.isArray(e.changes) &&
        e.changes.every(
          (c) =>
            record(c) &&
            typeof c.field === 'string' &&
            [c.before, c.after].every(
              (x) =>
                x === null ||
                ['string', 'boolean'].includes(typeof x) ||
                (typeof x === 'number' && Number.isFinite(x)),
            ),
        ),
    )
  )
    return false;
  return true;
}
function seed(): SourcingState {
  return {
    schemaVersion: 1,
    revision: 0,
    demands: fixture.demands.map((d, i) => ({
      ...d,
      demandCode: `MOCK-REQ-00${i + 1}`,
      title: `${fixture.customers.find((c) => c.id === d.customerId)?.name ?? '模拟内部'}资源需求`,
      description: '模拟运营受限说明，不向采购共享。',
      sharedTitle: `模拟资源优化需求 ${i + 1}`,
      sharedSummary:
        '寻求符合模型能力条件的上游模拟资源，不含客户身份或销售价格。',
      priority: 'normal',
      dueAt: null,
      version: 1,
      createdBy: d.requesterUserId,
      updatedBy: d.requesterUserId,
    })),
    items: fixture.demandItems.map((i) => ({
      ...i,
      requiredRegion: '',
      priority: 'normal',
      createdAt: '2026-11-13T00:00:00.000Z',
      updatedAt: '2026-11-13T00:00:00.000Z',
    })),
    matches: fixture.matches.map((m) => ({
      ...m,
      assessment: '模拟已有候选记录，需继续人工核实。',
      createdBy: 'u-proc',
      updatedAt: m.createdAt,
    })),
    history: [],
  };
}
export class SourcingRepository {
  constructor(private storage: StoragePort) {}
  read(): SourcingState {
    try {
      const raw = this.storage.getItem(sourcingStorageKey);
      if (raw === null) return seed();
      const data: unknown = JSON.parse(raw);
      if (!shape(data)) throw Error();
      return structuredClone(data);
    } catch {
      throw new SupplierError(
        'STORAGE',
        '寻源演示数据读取失败或版本不兼容；不会自动覆盖，请检查存储或明确重置。',
      );
    }
  }
  validate(
    s: SourcingState,
    channels: ChannelRepository,
    suppliers: SupplierRepository,
  ) {
    if (!shape(s)) throw new SupplierError('VALIDATION', '寻源数据结构无效。');
    const errors = validateStore({
      ...fixture,
      suppliers: suppliers.read().suppliers,
      channels: channels.read().channels,
      testTasks: channels.read().tasks,
      demands: s.demands,
      demandItems: s.items,
      matches: s.matches,
    });
    if (new Set(s.demands.map((d) => d.demandCode)).size !== s.demands.length)
      throw new SupplierError('DUPLICATE', '需求编号重复。');
    if (
      new Set(
        s.matches.map((m) => JSON.stringify([m.demandItemId, m.channelId])),
      ).size !== s.matches.length
    )
      throw new SupplierError(
        'DUPLICATE',
        '同一明细不能重复关联同一渠道，请更新已有关系。',
      );
    if (
      s.demands.some((d) => !s.items.some((i) => i.demandId === d.id)) ||
      s.history.some(
        (e) =>
          !s.demands.some((d) => d.id === e.demandId) ||
          (e.demandItemId !== null &&
            !s.items.some(
              (i) => i.id === e.demandItemId && i.demandId === e.demandId,
            )) ||
          (e.matchId !== null && !s.matches.some((m) => m.id === e.matchId)),
      )
    )
      throw new SupplierError('VALIDATION', '需求明细或历史关联不完整。');
    if (errors.length)
      throw new SupplierError(
        'VALIDATION',
        '寻源关联校验失败：' + errors.join('; '),
      );
  }
  write(
    before: SourcingState,
    next: SourcingState,
    channels: ChannelRepository,
    suppliers: SupplierRepository,
  ) {
    this.validate(next, channels, suppliers);
    if (this.read().revision !== before.revision)
      throw new SupplierError('CONFLICT', '寻源数据已变化，请重新加载。');
    try {
      this.storage.setItem(
        sourcingStorageKey,
        JSON.stringify({ ...next, revision: before.revision + 1 }),
      );
    } catch {
      throw new SupplierError(
        'STORAGE',
        '寻源保存失败，未提交主单、明细或候选的部分记录。',
      );
    }
  }
  reset(channels: ChannelRepository, suppliers: SupplierRepository) {
    const next = seed();
    this.validate(next, channels, suppliers);
    let revision = 0;
    try {
      revision = this.read().revision;
    } catch {
      /* Explicit confirmed recovery. */
    }
    try {
      this.storage.setItem(
        sourcingStorageKey,
        JSON.stringify({ ...next, revision: revision + 1 }),
      );
    } catch {
      throw new SupplierError('STORAGE', '寻源重置失败，其他模块未更改。');
    }
  }
}
export const sourcingRepository = new SourcingRepository({
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
});
