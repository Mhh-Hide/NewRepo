import type { ChannelView, SupplierView } from '../auth/view-models';
import { modelDomain } from '../domain/rules';
import {
  qualityStatusLabels,
  connectivityStatusLabels,
  integrationStatusLabels,
  availabilityStatusLabels,
} from '../domain/statuses';
import type {
  ResourceApi,
  ResourceReaders,
  ResourceStates,
  StateCount,
  ResourceSupplier,
  ChannelResourceSummary,
  ModelResourceSummary,
  ModelResourceQuery,
} from '../services/resource-types';
import { ResourceError } from '../services/resource-types';
function stateCounts<T extends string>(
  labels: Readonly<Record<T, string>>,
  values: readonly T[],
): readonly StateCount<T>[] {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return (Object.keys(labels) as T[]).map((code) => ({
    code,
    label: labels[code],
    count: counts.get(code) ?? 0,
  }));
}
function states(channels: readonly ChannelView[]): ResourceStates {
  return {
    quality: stateCounts(
      qualityStatusLabels,
      channels.map((c) => c.qualityStatus),
    ),
    connectivity: stateCounts(
      connectivityStatusLabels,
      channels.map((c) => c.connectivityStatus),
    ),
    integration: stateCounts(
      integrationStatusLabels,
      channels.map((c) => c.integrationStatus),
    ),
    availability: stateCounts(
      availabilityStatusLabels,
      channels.map((c) => c.availabilityStatus),
    ),
  };
}
function supplierIdentity(s: SupplierView): ResourceSupplier {
  return {
    source: s.source,
    id: s.id,
    name: s.name,
    shortCode: s.shortCode,
    status: s.status,
  };
}
/** No fixture import, persistence, prices or per-model API calls. Readers already enforce access. */
export function createResourceApi(
  readers: ResourceReaders,
  identityVisible: boolean,
): ResourceApi {
  async function snapshot() {
    const [vendors, models, channels, suppliers] = await Promise.all([
      readers.listVendors(),
      readers.listModels(),
      readers.listChannels(),
      identityVisible ? readers.listSuppliers() : Promise.resolve([]),
    ]);
    const modelMap = new Map(models.map((m) => [m.id, m]));
    const vendorMap = new Map(vendors.map((v) => [v.id, v]));
    const supplierMap = new Map(
      suppliers.map((s) => [s.id, supplierIdentity(s)]),
    );
    // Defense in depth: channels without a readable model are not joinable into details.
    const visibleChannels = channels.filter((c) => modelMap.has(c.modelId));
    const byModel = new Map<string, ChannelView[]>();
    for (const c of visibleChannels) {
      const rows = byModel.get(c.modelId) ?? [];
      rows.push(c);
      byModel.set(c.modelId, rows);
    }
    const summary = (m: (typeof models)[number]): ModelResourceSummary => {
      const vendor = vendorMap.get(m.vendorId);
      if (!vendor)
        throw new ResourceError('授权模型与厂商关联不完整，请重新加载。');
      const related = byModel.get(m.id) ?? [];
      const ids = new Set(
        related.flatMap((c) => (c.supplierId ? [c.supplierId] : [])),
      );
      const types = new Map<ChannelView['channelType'], number>();
      for (const c of related)
        types.set(c.channelType, (types.get(c.channelType) ?? 0) + 1);
      return {
        model: m,
        vendor,
        businessDomain: modelDomain(m, vendors),
        channelCount: related.length,
        ...(identityVisible ? { supplierCount: ids.size } : {}),
        channelTypes: [...types].map(([code, count]) => ({ code, count })),
        states: states(related),
      };
    };
    const channelSummary = (c: ChannelView): ChannelResourceSummary => {
      const supplier =
        identityVisible && c.supplierId
          ? supplierMap.get(c.supplierId)
          : undefined;
      return {
        source: c.source,
        id: c.id,
        modelId: c.modelId,
        anonymousCode: c.anonymousCode,
        displayName: c.displayName,
        channelType: c.channelType,
        tpm: c.tpm,
        rpm: c.rpm,
        concurrencyLimit: c.concurrencyLimit,
        ttftMs: c.ttftMs,
        resourceStatus: c.resourceStatus,
        qualityStatus: c.qualityStatus,
        connectivityStatus: c.connectivityStatus,
        integrationStatus: c.integrationStatus,
        availabilityStatus: c.availabilityStatus,
        ...(supplier ? { supplier } : {}),
      };
    };
    return {
      vendors,
      models,
      visibleChannels,
      byModel,
      modelMap,
      vendorMap,
      supplierMap,
      summary,
      channelSummary,
    };
  }
  return {
    async queryModelResources(query: ModelResourceQuery = {}) {
      if (
        !identityVisible &&
        (query.supplierCoverage !== undefined || query.supplierId !== undefined)
      )
        throw new ResourceError(
          '当前身份无供应商覆盖或身份筛选权限，请清除供应商筛选。',
        );
      const s = await snapshot();
      const appliedSupplier = query.supplierId
        ? s.supplierMap.get(query.supplierId)
        : undefined;
      const summaries = s.models
        .filter(
          (m) =>
            !query.supplierId ||
            (appliedSupplier &&
              (s.byModel.get(m.id) ?? []).some(
                (c) => c.supplierId === appliedSupplier.id,
              )),
        )
        .map(s.summary);
      const search = query.search?.trim().toLowerCase() ?? '';
      const rows = summaries.filter(
        (r) =>
          (!search ||
            r.model.name.toLowerCase().includes(search) ||
            r.model.modelCode.toLowerCase().includes(search)) &&
          (!query.vendorId || r.vendor.id === query.vendorId) &&
          (!query.category || r.model.category === query.category) &&
          (!query.regionVariant ||
            r.model.regionVariant === query.regionVariant) &&
          (!query.status || r.model.status === query.status) &&
          (!query.hasChannels ||
            (query.hasChannels === 'yes'
              ? r.channelCount > 0
              : r.channelCount === 0)) &&
          (!query.supplierCoverage ||
            (query.supplierCoverage === 'zero'
              ? r.supplierCount === 0
              : query.supplierCoverage === 'one_two'
                ? (r.supplierCount ?? 0) >= 1 && (r.supplierCount ?? 0) <= 2
                : (r.supplierCount ?? 0) >= 3)),
      );
      const direction = query.order === 'desc' ? -1 : 1;
      rows.sort(
        (a, b) =>
          direction *
            (query.sort === 'channelCount'
              ? a.channelCount - b.channelCount
              : a.model.name.localeCompare(b.model.name, 'zh-CN')) ||
          a.model.id.localeCompare(b.model.id),
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
        Math.max(1, Math.ceil(rows.length / pageSize)),
      );
      return structuredClone({
        rows: rows.slice((page - 1) * pageSize, page * pageSize),
        total: rows.length,
        page,
        pageSize,
        vendors: s.vendors,
        supplierIdentityVisible: identityVisible,
        ...(appliedSupplier ? { appliedSupplier } : {}),
        stats: {
          models: summaries.length,
          channels: summaries.reduce((n, r) => n + r.channelCount, 0),
          withChannels: summaries.filter((r) => r.channelCount > 0).length,
          withoutChannels: summaries.filter((r) => r.channelCount === 0).length,
          ...(identityVisible
            ? {
                threeSupplierModels: summaries.filter(
                  (r) => (r.supplierCount ?? 0) >= 3,
                ).length,
              }
            : {}),
        },
      });
    },
    async getModelResource(id) {
      const s = await snapshot();
      const model = s.modelMap.get(id);
      if (!model) return null;
      const related = s.byModel.get(id) ?? [];
      const bySupplier = new Map<string, ChannelView[]>();
      if (identityVisible)
        for (const c of related) {
          if (c.supplierId && s.supplierMap.has(c.supplierId)) {
            const group = bySupplier.get(c.supplierId) ?? [];
            group.push(c);
            bySupplier.set(c.supplierId, group);
          }
        }
      return structuredClone({
        summary: s.summary(model),
        channels: related.map(s.channelSummary),
        suppliers: [...bySupplier].map(([supplierId, channels]) => ({
          supplier: s.supplierMap.get(supplierId)!,
          channelCount: channels.length,
          states: states(channels),
        })),
        supplierIdentityVisible: identityVisible,
      });
    },
    async getChannelResource(id) {
      const s = await snapshot();
      const c = s.visibleChannels.find((c) => c.id === id);
      if (!c) return null;
      const model = s.modelMap.get(c.modelId)!;
      const vendor = s.vendorMap.get(model.vendorId);
      if (!vendor)
        throw new ResourceError('授权模型与厂商关联不完整，请重新加载。');
      return structuredClone({
        ...s.channelSummary(c),
        model,
        vendor,
        businessDomain: modelDomain(model, s.vendors),
        ...(c.opChannelId !== undefined ? { opChannelId: c.opChannelId } : {}),
        ...(c.modelInvocationName !== undefined
          ? { modelInvocationName: c.modelInvocationName }
          : {}),
        ...(c.endpointReference !== undefined
          ? { endpointReference: c.endpointReference }
          : {}),
        ...(c.sourceVerificationStatus !== undefined
          ? { sourceVerificationStatus: c.sourceVerificationStatus }
          : {}),
      });
    },
  };
}
