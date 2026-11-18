import { isPrivateData } from '../services/runtime-data';
import type { AccessContext } from '../auth/types';
import type { Model } from '../domain/entities';
import type {
  ModelResponsibility,
  ResponsibilityApi,
} from '../services/responsibility-types';
import type { StoragePort } from './supplier-repository';
import { fixture } from './data';
import { SupplierError } from '../services/supplier-types';
const key = 'maas-model-responsibilities-v1';
export const defaultResponsibility = (m: Model): ModelResponsibility => {
  const domestic =
    fixture.vendors.find((v) => v.id === m.vendorId)?.businessDomain ===
    'domestic';
  return {
    modelId: m.id,
    procurementOwnerId: isPrivateData()
      ? 'unassigned-proc'
      : domestic
        ? 'u-proc-cn'
        : 'u-proc-os',
    operationsOwnerId: isPrivateData()
      ? 'unassigned-ops'
      : domestic
        ? 'u-domestic'
        : 'u-overseas',
    version: 0,
  };
};

export const readResponsibilities = (
  storage: StoragePort,
): ModelResponsibility[] => {
  const value: unknown = JSON.parse(storage.getItem(key) ?? '[]');
  if (
    !Array.isArray(value) ||
    !value.every(
      (r) =>
        r &&
        typeof r === 'object' &&
        typeof r.modelId === 'string' &&
        typeof r.procurementOwnerId === 'string' &&
        typeof r.operationsOwnerId === 'string' &&
        Number.isSafeInteger(r.version) &&
        r.version >= 0,
    )
  )
    throw new SupplierError('VALIDATION', '负责人设置损坏，请恢复演示数据。');
  return value as ModelResponsibility[];
};
export function createResponsibilityApi(
  ctx: AccessContext | null,
  models: () => readonly Model[],
  storage: StoragePort,
  active: () => boolean,
): ResponsibilityApi {
  const read = () => readResponsibilities(storage);
  const defaults = defaultResponsibility;
  return {
    async modelResponsibilities() {
      if (
        !ctx ||
        ![
          'ProductOperations',
          'Procurement',
          'Testing',
          'OperationsSupport',
        ].includes(ctx.user.role)
      )
        return [];
      const rows = read();
      return models().map(
        (m) => rows.find((r) => r.modelId === m.id) ?? defaults(m),
      );
    },
    async assignModelOwners(
      modelId,
      version,
      procurementOwnerId,
      operationsOwnerId,
    ) {
      const m = models().find((m) => m.id === modelId);
      if (!active() || ctx?.user.role !== 'ProductOperations' || !m)
        throw new SupplierError(
          'FORBIDDEN',
          '只有授权运营可调整模型默认负责人。',
        );
      const domain = fixture.vendors.find(
        (v) => v.id === m.vendorId,
      )!.businessDomain;
      for (const [id, role] of [
        [procurementOwnerId, 'Procurement'],
        [operationsOwnerId, 'ProductOperations'],
      ])
        if (
          !fixture.users.some((u) => u.id === id && u.role === role) ||
          !fixture.domainGrants.some(
            (g) => g.userId === id && g.businessDomain === domain,
          )
        )
          throw new SupplierError('VALIDATION', '负责人岗位或厂商范围不匹配。');
      const rows = read(),
        old = rows.find((r) => r.modelId === modelId) ?? defaults(m);
      if (old.version !== version)
        throw new SupplierError('CONFLICT', '负责人已变化，请刷新后再操作。');
      storage.setItem(
        key,
        JSON.stringify([
          ...rows.filter((r) => r.modelId !== modelId),
          {
            modelId,
            procurementOwnerId,
            operationsOwnerId,
            version: version + 1,
          },
        ]),
      );
    },
  };
}
