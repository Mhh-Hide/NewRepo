import type { AccessContext } from '../auth/types';
import { can } from '../auth/policy';
import {
  canReadSupplierMaster,
  supplierCapabilities,
} from '../auth/supplier-policy';
import { projectSupplier } from '../auth/projections';
import type { BusinessDomain, Channel, Supplier } from '../domain/entities';
import { channelTypeLabels } from '../domain/statuses';
import type {
  SupplierApi,
  SupplierPage,
  SupplierQuery,
  SupplierRecordView,
} from '../services/supplier-types';
import { SupplierError } from '../services/supplier-types';
import { supplierEditableFields } from '../domain/suppliers';
import { fixture } from './data';
import {
  activeManagementDomains,
  appendSupplierChange,
  assertSupplierUnique,
  normalizeSupplierInput,
} from './supplier-repository';
import type { SupplierRepository, SupplierStore } from './supplier-repository';
interface Dependencies {
  ctx: AccessContext | null;
  domain: BusinessDomain | undefined;
  repository: SupplierRepository;
  channels: () => readonly Channel[];
  writeActive: () => boolean;
}
export function createSupplierApi({
  ctx,
  domain,
  repository,
  channels,
  writeActive,
}: Dependencies): SupplierApi & {
  listSuppliers: () => Promise<
    readonly import('../auth/view-models').SupplierView[]
  >;
} {
  const domains = ctx ? activeManagementDomains(ctx.domains, domain) : [];
  const canCreate = () =>
    !!ctx && domains.length > 0 && can(ctx, 'supplier:create');
  const canReset = () =>
    !!ctx &&
    can(ctx, 'demo:reset') &&
    domain === undefined &&
    ctx.domains.includes('domestic') &&
    ctx.domains.includes('overseas');
  const readable = (state: SupplierStore, s: Supplier) =>
    !!ctx &&
    canReadSupplierMaster(
      ctx,
      s,
      state.scopes,
      state.maintenance,
      domains,
      channels().some((c) => c.supplierId === s.id),
    );
  const view = (state: SupplierStore, s: Supplier): SupplierRecordView => ({
    supplier: projectSupplier(ctx!, s)!,
    capabilities: supplierCapabilities(ctx!, s, true, state.maintenance),
  });
  const requireWrite = () => {
    if (!ctx || !writeActive())
      throw new SupplierError(
        'FORBIDDEN',
        '当前演示身份无写入权限或已切换，请重新加载。',
      );
    return ctx;
  };
  const findEditable = (state: SupplierStore, id: string) => {
    const actor = requireWrite();
    const s = state.suppliers.find((s) => s.id === id);
    if (
      !s ||
      !readable(state, s) ||
      !supplierCapabilities(actor, s, true, state.maintenance).edit
    )
      throw new SupplierError('FORBIDDEN', '当前身份无此供应商的维护权限。');
    return s;
  };
  const checkVersion = (s: Supplier, expected: number) => {
    if (s.version !== expected)
      throw new SupplierError(
        'CONFLICT',
        '资料已被其他操作修改，请重新加载最新资料后再保存。',
      );
  };
  return {
    async listSuppliers() {
      if (!ctx || !can(ctx, 'supplier:read') || !domains.length) return [];
      const state = repository.read();
      return state.suppliers
        .filter((s) => readable(state, s))
        .map((s) => view(state, s).supplier);
    },
    async querySuppliers(query: SupplierQuery = {}) {
      if (!ctx || !can(ctx, 'supplier:read'))
        throw new SupplierError('FORBIDDEN', '当前演示身份无此模块访问权限');
      const state = repository.read();
      const authorized = state.suppliers.filter((s) => readable(state, s));
      const search = query.search?.trim().toLowerCase() ?? '';
      const filtered = authorized.filter(
        (s) =>
          (!search ||
            s.name.toLowerCase().includes(search) ||
            s.shortCode.toLowerCase().includes(search)) &&
          (!query.cooperationStatus ||
            s.cooperationStatus === query.cooperationStatus) &&
          (!query.status || s.status === query.status) &&
          (!query.supplierCategory ||
            s.supplierCategory === query.supplierCategory) &&
          (!query.ownerUserId ||
            (['ProductOperations', 'Procurement'].includes(ctx.user.role) &&
              s.ownerUserId === query.ownerUserId)),
      );
      const key = query.sort === 'name' ? 'name' : 'updatedAt';
      const direction = query.order === 'asc' ? 1 : -1;
      filtered.sort(
        (a, b) =>
          direction * a[key].localeCompare(b[key], 'zh-CN') ||
          a.id.localeCompare(b.id),
      );
      const pageSize = [5, 10, 20, 50].includes(query.pageSize ?? 10)
        ? (query.pageSize ?? 10)
        : 10;
      const requested =
        Number.isSafeInteger(query.page) && Number(query.page) > 0
          ? Number(query.page)
          : 1;
      const page = Math.min(
        requested,
        Math.max(1, Math.ceil(filtered.length / pageSize)),
      );
      const result: SupplierPage = {
        rows: filtered
          .slice((page - 1) * pageSize, page * pageSize)
          .map((s) => view(state, s)),
        total: filtered.length,
        page,
        pageSize,
        stats: {
          total: authorized.length,
          cooperating: authorized.filter(
            (s) => s.cooperationStatus === 'cooperating',
          ).length,
          negotiating: authorized.filter(
            (s) => s.cooperationStatus === 'negotiating',
          ).length,
          inactive: authorized.filter(
            (s) =>
              s.cooperationStatus === 'paused' ||
              s.cooperationStatus === 'terminated',
          ).length,
        },
        canCreate: canCreate(),
        canReset: canReset(),
      };
      return structuredClone(result);
    },
    async getSupplier(id) {
      if (!ctx || !can(ctx, 'supplier:read')) return null;
      const state = repository.read();
      const s = state.suppliers.find((s) => s.id === id);
      if (!s || !readable(state, s)) return null;
      const related = channels().filter((c) => c.supplierId === id);
      return structuredClone({
        ...view(state, s),
        resources: {
          modelCount: new Set(related.map((c) => c.modelId)).size,
          channelCount: related.length,
          channelTypes: [
            ...new Set(related.map((c) => channelTypeLabels[c.channelType])),
          ],
        },
      });
    },
    async listSupplierOwners() {
      return ctx && domains.length > 0 && can(ctx, 'supplier:maintain')
        ? fixture.users
            .filter((u) => u.role === 'Procurement')
            .map((u) => ({ id: u.id, name: u.name }))
        : [];
    },
    async createSupplier(input) {
      const actor = requireWrite();
      if (!canCreate())
        throw new SupplierError(
          'FORBIDDEN',
          '仅有授权管理范围的产品运营可以新增供应商。',
        );
      const normalized = normalizeSupplierInput(input);
      return repository.transact((state) => {
        assertSupplierUnique(state, normalized);
        const now = new Date().toISOString();
        const s: Supplier = {
          ...normalized,
          source: 'mock',
          id: `mock-supplier-${crypto.randomUUID()}`,
          status: 'enabled',
          externalAccountStatus: 'not_created',
          createdBy: actor.user.id,
          updatedBy: actor.user.id,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        let next = appendSupplierChange(state, null, s, actor.user.id);
        next = {
          ...next,
          scopes: [
            ...next.scopes,
            { supplierId: s.id, managementDomains: domains },
          ],
          maintenance: [
            ...next.maintenance,
            { supplierId: s.id, userId: s.ownerUserId },
          ],
        };
        return { state: next, result: projectSupplier(actor, s)! };
      });
    },
    async updateSupplier(id, expectedVersion, input) {
      const actor = requireWrite();
      return repository.transact((state) => {
        const before = findEditable(state, id);
        checkVersion(before, expectedVersion);
        const normalized = normalizeSupplierInput(input);
        if (
          normalized.ownerUserId !== before.ownerUserId &&
          !can(actor, 'supplier:assign')
        )
          throw new SupplierError(
            'FORBIDDEN',
            '只有产品运营可以调整采购负责人。',
          );
        assertSupplierUnique(state, normalized, id);
        if (supplierEditableFields.every((k) => before[k] === normalized[k]))
          return { state, result: projectSupplier(actor, before)! };
        const after: Supplier = {
          ...before,
          ...normalized,
          updatedBy: actor.user.id,
          updatedAt: new Date().toISOString(),
          version: before.version + 1,
        };
        let next = appendSupplierChange(state, before, after, actor.user.id);
        if (after.ownerUserId !== before.ownerUserId)
          next = {
            ...next,
            maintenance: [
              ...next.maintenance.filter((g) => g.supplierId !== id),
              { supplierId: id, userId: after.ownerUserId },
            ],
          };
        return { state: next, result: projectSupplier(actor, after)! };
      });
    },
    async setSupplierStatus(id, expectedVersion, status) {
      const actor = requireWrite();
      return repository.transact((state) => {
        const before = findEditable(state, id);
        if (!can(actor, 'supplier:toggle'))
          throw new SupplierError(
            'FORBIDDEN',
            '只有产品运营可以启用或停用供应商。',
          );
        checkVersion(before, expectedVersion);
        if (status !== 'enabled' && status !== 'disabled')
          throw new SupplierError('VALIDATION', '启停状态无效。');
        if (before.status === status)
          return { state, result: projectSupplier(actor, before)! };
        const after: Supplier = {
          ...before,
          status,
          version: before.version + 1,
          updatedBy: actor.user.id,
          updatedAt: new Date().toISOString(),
        };
        return {
          state: appendSupplierChange(state, before, after, actor.user.id),
          result: projectSupplier(actor, after)!,
        };
      });
    },
    async listSupplierHistory(id) {
      if (!ctx || !can(ctx, 'supplier:history')) return [];
      const state = repository.read();
      const s = state.suppliers.find((s) => s.id === id);
      if (!s || !readable(state, s)) return [];
      return structuredClone(
        state.history
          .filter((e) => e.supplierId === id)
          .map((e) => ({
            ...e,
            beforeSnapshot: e.beforeSnapshot
              ? projectSupplier(ctx, e.beforeSnapshot)
              : null,
            afterSnapshot: projectSupplier(ctx, e.afterSnapshot)!,
          })),
      );
    },
    async resetSupplierDemo(confirmed) {
      requireWrite();
      if (!canReset())
        throw new SupplierError(
          'FORBIDDEN',
          '只有双域授权的产品运营在全部业务域视角可重置演示数据。',
        );
      if (confirmed !== true)
        throw new SupplierError('VALIDATION', '请先确认重置演示数据。');
      repository.reset();
    },
  };
}
