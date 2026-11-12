import type { BusinessDomain, Supplier } from '../domain/entities';
import type {
  SupplierMasterScope,
  SupplierChangeEvent,
  SupplierInput,
} from '../domain/suppliers';
import {
  cooperationStatusLabels,
  supplierCategoryLabels,
  supplierEditableFields,
} from '../domain/suppliers';
import type { UserSupplierGrant } from '../auth/types';
import { fixture } from './data';
import { modelDomain } from '../domain/rules';
import { SupplierError } from '../services/supplier-types';
export const supplierStorageKey = 'maas-supplier-demo-v1';
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface SupplierStore {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly suppliers: readonly Supplier[];
  readonly scopes: readonly SupplierMasterScope[];
  readonly maintenance: readonly UserSupplierGrant[];
  readonly history: readonly SupplierChangeEvent[];
}
const textFields = [
  'id',
  'name',
  'shortCode',
  'contactName',
  'contactEmail',
  'contactPhone',
  'ownerUserId',
  'createdAt',
  'updatedAt',
  'countryOrRegion',
  'description',
  'contactPosition',
  'alternativeContact',
  'remark',
  'createdBy',
  'updatedBy',
] as const;
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const known = (o: Record<string, unknown>, names: readonly string[]) =>
  Object.keys(o).every((k) => names.includes(k));
const procurement = (id: string) =>
  fixture.users.some((u) => u.id === id && u.role === 'Procurement');
export function normalizeSupplierInput(
  input: SupplierInput,
): Pick<Supplier, (typeof supplierEditableFields)[number]> {
  if (!record(input) || !known(input, supplierEditableFields))
    throw new SupplierError(
      'VALIDATION',
      '供应商字段不合法，不能修改内部 ID、版本或系统记录。',
    );
  if (
    typeof input.name !== 'string' ||
    typeof input.shortCode !== 'string' ||
    typeof input.ownerUserId !== 'string'
  )
    throw new SupplierError('VALIDATION', '请填写名称、缩写及采购负责人。');
  if (
    !Object.hasOwn(cooperationStatusLabels, input.cooperationStatus) ||
    !Object.hasOwn(supplierCategoryLabels, input.supplierCategory)
  )
    throw new SupplierError('VALIDATION', '请选择有效的供应商类别和合作状态。');
  const strings: Record<string, string> = {};
  for (const field of supplierEditableFields) {
    const value = input[field];
    if (value !== undefined && typeof value !== 'string')
      throw new SupplierError('VALIDATION', '资料字段必须为文本。');
    strings[field] = (value ?? '').trim();
    if (
      strings[field]!.length >
      (['description', 'remark'].includes(field) ? 1000 : 160)
    )
      throw new SupplierError('VALIDATION', '输入内容过长，请缩短后重试。');
  }
  if (!strings.name || !strings.shortCode)
    throw new SupplierError('VALIDATION', '供应商名称和缩写不能为空。');
  if (!procurement(input.ownerUserId))
    throw new SupplierError('VALIDATION', '请选择模拟用户目录中的采购负责人。');
  if (
    strings.contactEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strings.contactEmail)
  )
    throw new SupplierError('VALIDATION', '请输入有效的联系人邮箱。');
  return {
    name: strings.name,
    shortCode: strings.shortCode,
    ownerUserId: input.ownerUserId,
    cooperationStatus: input.cooperationStatus,
    supplierCategory: input.supplierCategory,
    countryOrRegion: strings.countryOrRegion!,
    description: strings.description!,
    contactName: strings.contactName!,
    contactEmail: strings.contactEmail!,
    contactPhone: strings.contactPhone!,
    contactPosition: strings.contactPosition!,
    alternativeContact: strings.alternativeContact!,
    remark: strings.remark!,
  };
}
export function isSupplier(value: unknown): value is Supplier {
  if (
    !record(value) ||
    value.source !== 'mock' ||
    !textFields.every((k) => typeof value[k] === 'string') ||
    !known(value, [
      ...textFields,
      'source',
      'status',
      'supplierCategory',
      'cooperationStatus',
      'externalAccountStatus',
      'version',
    ])
  )
    return false;
  if (
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 1 ||
    !['enabled', 'disabled'].includes(String(value.status)) ||
    !Object.hasOwn(supplierCategoryLabels, String(value.supplierCategory)) ||
    !Object.hasOwn(cooperationStatusLabels, String(value.cooperationStatus)) ||
    !['not_created', 'invited', 'active', 'disabled'].includes(
      String(value.externalAccountStatus),
    )
  )
    return false;
  if (
    !procurement(String(value.ownerUserId)) ||
    !fixture.users.some((u) => u.id === value.createdBy) ||
    !fixture.users.some((u) => u.id === value.updatedBy)
  )
    return false;
  return (
    !!String(value.id).trim() &&
    !!String(value.name).trim() &&
    !!String(value.shortCode).trim() &&
    Number.isFinite(Date.parse(String(value.createdAt))) &&
    Number.isFinite(Date.parse(String(value.updatedAt)))
  );
}
function isState(v: unknown): v is SupplierStore {
  if (
    !record(v) ||
    v.schemaVersion !== 1 ||
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 0 ||
    !known(v, [
      'schemaVersion',
      'revision',
      'suppliers',
      'scopes',
      'maintenance',
      'history',
    ])
  )
    return false;
  const { suppliers, scopes, maintenance, history } = v;
  if (
    !Array.isArray(suppliers) ||
    !suppliers.every(isSupplier) ||
    !Array.isArray(scopes) ||
    !Array.isArray(maintenance) ||
    !Array.isArray(history)
  )
    return false;
  const rows: Supplier[] = suppliers;
  for (const field of ['id', 'name', 'shortCode'] as const)
    if (
      new Set(rows.map((s) => s[field].trim().toLowerCase())).size !==
      rows.length
    )
      return false;
  if (!fixture.suppliers.every((base) => rows.some((s) => s.id === base.id)))
    return false;
  if (
    !scopes.every(
      (g) =>
        record(g) &&
        known(g, ['supplierId', 'managementDomains']) &&
        rows.some((s) => s.id === g.supplierId) &&
        Array.isArray(g.managementDomains) &&
        g.managementDomains.length > 0 &&
        g.managementDomains.every(
          (d: unknown) => d === 'domestic' || d === 'overseas',
        ),
    )
  )
    return false;
  if (!rows.every((s) => scopes.some((g) => g.supplierId === s.id)))
    return false;
  if (
    !maintenance.every(
      (g) =>
        record(g) &&
        known(g, ['supplierId', 'userId']) &&
        typeof g.userId === 'string' &&
        procurement(g.userId) &&
        rows.some((s) => s.id === g.supplierId),
    )
  )
    return false;
  if (
    !rows.every((s) =>
      maintenance.some(
        (g) => g.supplierId === s.id && g.userId === s.ownerUserId,
      ),
    )
  )
    return false;
  return history.every(
    (e) =>
      record(e) &&
      known(e, [
        'id',
        'supplierId',
        'action',
        'actorUserId',
        'occurredAt',
        'reason',
        'changedFields',
        'beforeSnapshot',
        'afterSnapshot',
      ]) &&
      typeof e.id === 'string' &&
      typeof e.reason === 'string' &&
      typeof e.occurredAt === 'string' &&
      Number.isFinite(Date.parse(e.occurredAt)) &&
      fixture.users.some((u) => u.id === e.actorUserId) &&
      ['created', 'edited', 'owner_assigned', 'status_changed'].includes(
        String(e.action),
      ) &&
      isSupplier(e.afterSnapshot) &&
      e.afterSnapshot.id === e.supplierId &&
      (e.beforeSnapshot === null ||
        (isSupplier(e.beforeSnapshot) &&
          e.beforeSnapshot.id === e.supplierId)) &&
      Array.isArray(e.changedFields) &&
      e.changedFields.every(
        (k: unknown) =>
          typeof k === 'string' &&
          ([...supplierEditableFields, 'status'] as readonly string[]).includes(
            k,
          ),
      ),
  );
}
function initialState(): SupplierStore {
  return {
    schemaVersion: 1,
    revision: 0,
    suppliers: structuredClone(fixture.suppliers),
    scopes: fixture.suppliers.map((s) => ({
      supplierId: s.id,
      managementDomains: [
        ...new Set(
          fixture.channels
            .filter((c) => c.supplierId === s.id)
            .map((c) =>
              modelDomain(
                fixture.models.find((m) => m.id === c.modelId)!,
                fixture.vendors,
              ),
            ),
        ),
      ],
    })),
    maintenance: fixture.supplierGrants.filter((g) => procurement(g.userId)),
    history: fixture.suppliers.map((s) => ({
      id: `supplier-created:${s.id}`,
      supplierId: s.id,
      action: 'created',
      actorUserId: s.createdBy,
      occurredAt: s.createdAt,
      reason: '初始模拟主档',
      changedFields: [...supplierEditableFields],
      beforeSnapshot: null,
      afterSnapshot: structuredClone(s),
    })),
  };
}
/** One supplier store shared by legacy reads, management queries and mutations. */
export class SupplierRepository {
  constructor(private readonly storage: StoragePort) {}
  private raw(): string | null {
    try {
      return this.storage.getItem(supplierStorageKey);
    } catch {
      throw new SupplierError(
        'STORAGE',
        '演示数据读取失败，请检查浏览器存储权限后重试。',
      );
    }
  }
  read(): SupplierStore {
    const raw = this.raw();
    if (raw === null) return initialState();
    try {
      const state: unknown = JSON.parse(raw);
      if (!isState(state)) throw new Error('schema');
      return structuredClone(state);
    } catch {
      throw new SupplierError(
        'STORAGE',
        '演示数据损坏或版本不兼容，请由双域产品运营在全部业务域视角重置演示数据。',
      );
    }
  }
  transact<T>(
    update: (state: SupplierStore) => { state: SupplierStore; result: T },
  ): T {
    const raw = this.raw();
    const state = this.read();
    if (this.raw() !== raw)
      throw new SupplierError('CONFLICT', '演示数据已变化，请重新加载后重试。');
    const next = update(state);
    if (next.state === state) return structuredClone(next.result);
    const saved = { ...next.state, revision: state.revision + 1 };
    if (!isState(saved))
      throw new SupplierError(
        'VALIDATION',
        '供应商数据关联校验失败，未保存更改。',
      );
    if (this.raw() !== raw)
      throw new SupplierError('CONFLICT', '演示数据已变化，请重新加载后重试。');
    this.save(saved);
    return structuredClone(next.result);
  }
  private save(state: SupplierStore): void {
    try {
      this.storage.setItem(supplierStorageKey, JSON.stringify(state));
    } catch {
      throw new SupplierError(
        'STORAGE',
        '演示数据保存失败，请检查浏览器存储空间和权限后重试。',
      );
    }
  }
  reset(): void {
    this.save(initialState());
  }
}
const browserStorage: StoragePort = {
  getItem: (key) => globalThis.localStorage.getItem(key),
  setItem: (key, value) => globalThis.localStorage.setItem(key, value),
};
export const supplierRepository = new SupplierRepository(browserStorage);
export function assertSupplierUnique(
  state: SupplierStore,
  input: Pick<Supplier, 'name' | 'shortCode'>,
  id?: string,
): void {
  for (const field of ['name', 'shortCode'] as const)
    if (
      state.suppliers.some(
        (s) =>
          s.id !== id &&
          s[field].trim().toLowerCase() === input[field].trim().toLowerCase(),
      )
    )
      throw new SupplierError(
        'DUPLICATE',
        field === 'name'
          ? '供应商名称已被使用，请更换名称。'
          : '供应商缩写已被使用，请更换缩写。',
      );
}
export function appendSupplierChange(
  state: SupplierStore,
  before: Supplier | null,
  after: Supplier,
  actorUserId: string,
): SupplierStore {
  const changedFields = before
    ? [...supplierEditableFields, 'status' as const].filter(
        (k) => before[k] !== after[k],
      )
    : [...supplierEditableFields];
  const action: SupplierChangeEvent['action'] =
    before === null
      ? 'created'
      : before.status !== after.status
        ? 'status_changed'
        : before.ownerUserId !== after.ownerUserId
          ? 'owner_assigned'
          : 'edited';
  const reason = {
    created: '创建模拟供应商',
    edited: '编辑供应商资料',
    owner_assigned: '调整采购负责人',
    status_changed: '变更主档启用状态',
  }[action];
  const event: SupplierChangeEvent = {
    id: `supplier-event-${crypto.randomUUID()}`,
    supplierId: after.id,
    action,
    actorUserId,
    occurredAt: after.updatedAt,
    reason,
    changedFields,
    beforeSnapshot: before,
    afterSnapshot: after,
  };
  return {
    ...state,
    suppliers: before
      ? state.suppliers.map((s) => (s.id === after.id ? after : s))
      : [...state.suppliers, after],
    history: [...state.history, event],
  };
}
export function activeManagementDomains(
  domains: readonly BusinessDomain[],
  selected?: BusinessDomain,
): readonly BusinessDomain[] {
  return selected ? domains.filter((d) => d === selected) : domains;
}
