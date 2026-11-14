import { createBulkQuotationApi } from './bulk-quotation-api';
import { bulkReferences } from './bulk-repository-rules';
import { createProcurementAnalyticsApi } from '../services/procurement-analytics';
import { quoteRepository, type QuoteRepository } from './quote-repository';
import { createQuotationApi, resolvedQuote } from './quotation-api';
import {
  sourcingRepository,
  type SourcingRepository,
} from './sourcing-repository';
import { createSourcingApi } from './sourcing-api';
import {
  channelRepository,
  type ChannelRepository,
} from './channel-repository';
import { SupplierError } from '../services/supplier-types';
import { createChannelApi } from './channel-api';
import { createResourceApi } from './resource-api';
import type { ResourceApi } from '../services/resource-types';
import { createSupplierApi } from './supplier-api';
import {
  supplierRepository,
  type SupplierRepository,
} from './supplier-repository';
import type { ApiAdapter } from '../services/api-adapter';
import type { AccessContext } from '../auth/types';
import type {
  BusinessDomain,
  Channel,
  Demand,
  Model,
} from '../domain/entities';
import {
  can,
  canSeeField,
  hasCustomer,
  hasDomain,
  hasSupplier,
} from '../auth/policy';
import {
  projectChannel,
  projectIncident,
  projectDemand,
  projectDemandItem,
  projectExecution,
  projectRemediation,
  projectTestTask,
} from '../auth/projections';
import { modelDomain } from '../domain/rules';
import { fixture as data } from './data';
import { validateStore } from '../domain/validation';
const fixtureErrors = validateStore(data);
if (fixtureErrors.length) throw new Error(fixtureErrors.join('; '));
/** Demo persona selector, NOT authentication. Never accept this as backend authority. */
export function createMockAdapter(
  userId?: string,
  businessDomain?: BusinessDomain,
  repository: SupplierRepository = supplierRepository,
  writeActive: () => boolean = () => true,
  channelRepo: ChannelRepository = channelRepository,
  sourcingRepo: SourcingRepository = sourcingRepository,
  quoteRepo: QuoteRepository = quoteRepository,
): ApiAdapter {
  const user = data.users.find((u) => u.id === userId);
  if (userId !== undefined && !user) throw new Error('Unknown demo user');
  const ctx: AccessContext | null = user
    ? {
        user,
        domains: data.domainGrants
          .filter((g) => g.userId === user.id)
          .map((g) => g.businessDomain),
        supplierIds: data.supplierGrants
          .filter((g) => g.userId === user.id)
          .map((g) => g.supplierId),
        customerIds: data.customerGrants
          .filter((g) => g.userId === user.id)
          .map((g) => g.customerId),
      }
    : null;
  if (businessDomain !== undefined) {
    if (!ctx || !ctx.domains.includes(businessDomain))
      throw new Error('未授权的业务域');
    // Narrow the existing grants; a query parameter can never expand them.
  }
  const modelAllowed = (m: Model): boolean =>
    ctx !== null &&
    hasDomain(ctx, modelDomain(m, data.vendors)) &&
    (businessDomain === undefined ||
      modelDomain(m, data.vendors) === businessDomain) &&
    (ctx.user.role !== 'SupplierUser' ||
      channelRepo
        .read()
        .channels.some(
          (c) => c.modelId === m.id && hasSupplier(ctx, c.supplierId),
        ));
  const channelAllowed = (c: Channel): boolean =>
    ctx !== null &&
    (ctx.user.role === 'Procurement'
      ? repository
          .read()
          .maintenance.some(
            (g) => g.userId === ctx.user.id && g.supplierId === c.supplierId,
          )
      : hasSupplier(ctx, c.supplierId)) &&
    data.models.some((m) => m.id === c.modelId && modelAllowed(m));
  const channels = () => channelRepo.read().channels.filter(channelAllowed);
  const supplierAllowed = (id: string): boolean =>
    ctx !== null &&
    hasSupplier(ctx, id) &&
    channels().some((c) => c.supplierId === id);
  const itemsFor = (d: Demand) =>
    sourcingRepo
      .read()
      .items.filter(
        (i) =>
          i.demandId === d.id &&
          data.models.some((m) => m.id === i.modelId && modelAllowed(m)),
      );
  const demandAllowed = (d: Demand): boolean =>
    ctx !== null &&
    can(ctx, 'demand:read') &&
    itemsFor(d).length > 0 &&
    (ctx.user.role === 'Procurement' ||
      ctx.user.role === 'ProductOperations' ||
      (d.customerId !== null && hasCustomer(ctx, d.customerId)));
  const channelById = (id: string) => channels().find((c) => c.id === id);
  // Clone each response so client mutation cannot contaminate the backing fixture or another role.
  const copy = <T>(value: T): T => structuredClone(value);
  const supplierApi = createSupplierApi({
    ctx,
    domain: businessDomain,
    repository,
    channels,
    writeActive,
  });
  const channelApi = createChannelApi(
    ctx,
    businessDomain,
    channelRepo,
    repository,
    channels,
    writeActive,
  );
  const sourcingApi = createSourcingApi(
    ctx,
    businessDomain,
    sourcingRepo,
    channelRepo,
    repository,
    channels,
    writeActive,
  );
  const quotationApi = createQuotationApi(
    ctx,
    businessDomain,
    quoteRepo,
    channelRepo,
    repository,
    sourcingRepo,
    channels,
    writeActive,
  );
  const base: Omit<ApiAdapter, keyof ResourceApi> = {
    ...supplierApi,
    ...channelApi,
    ...quotationApi,
    ...createBulkQuotationApi(
      ctx,
      businessDomain,
      quoteRepo,
      channelRepo,
      repository,
      sourcingRepo,
      channels,
      writeActive,
      quotationApi,
    ),
    ...createProcurementAnalyticsApi(ctx, writeActive, quotationApi),
    ...sourcingApi,
    async resetChannelDemo(confirmed) {
      if (
        !ctx ||
        !writeActive() ||
        !can(ctx, 'channel:create') ||
        businessDomain ||
        ctx.domains.length !== 2 ||
        confirmed !== true
      )
        throw new SupplierError(
          'FORBIDDEN',
          '须由双域运营在全部域二次确认重置。',
        );
      const pricing = quoteRepo.read();
      const batchRefs = bulkReferences(pricing);
      if (
        batchRefs.channels.some(
          (id) => !data.channels.some((c) => c.id === id),
        ) ||
        pricing.quotes.some(
          (q) => !data.channels.some((c) => c.id === q.channelId),
        ) ||
        pricing.inquiries.some(
          (i) => !data.channels.some((c) => c.id === i.channelId),
        )
      )
        throw new SupplierError(
          'VALIDATION',
          '渠道被批次、报价或询价历史引用，请先独立确认重置报价演示数据，再重置渠道。',
        );
      if (
        sourcingRepo
          .read()
          .matches.some((m) => !data.channels.some((c) => c.id === m.channelId))
      )
        throw new SupplierError(
          'VALIDATION',
          '渠道被寻源候选或历史引用，请先独立确认重置寻源演示数据，再重置渠道；不会静默删除寻源记录。',
        );
      return channelApi.resetChannelDemo(confirmed);
    },
    async resetSourcingDemo(confirmed) {
      if (
        !ctx ||
        !writeActive() ||
        !can(ctx, 'sourcing:update') ||
        businessDomain ||
        ctx.domains.length !== 2 ||
        confirmed !== true
      )
        throw new SupplierError(
          'FORBIDDEN',
          '须由双域运营在全部域二次确认重置。',
        );
      const pricing = quoteRepo.read();
      const batchRefs = bulkReferences(pricing);
      if (
        batchRefs.demands.some(
          (id) => !data.demands.some((d) => d.id === id),
        ) ||
        batchRefs.demandItems.some(
          (id) => !data.demandItems.some((i) => i.id === id),
        ) ||
        pricing.quotes.some(
          (q) =>
            (q.demandId !== null &&
              !data.demands.some((d) => d.id === q.demandId)) ||
            (q.demandItemId !== null &&
              !data.demandItems.some((i) => i.id === q.demandItemId)),
        ) ||
        pricing.inquiries.some(
          (i) =>
            i.demandItemId !== null &&
            !data.demandItems.some((d) => d.id === i.demandItemId),
        )
      )
        throw new SupplierError(
          'VALIDATION',
          '寻源需求被批次、报价或询价引用，请先独立确认重置报价演示数据，再重置寻源。',
        );
      return sourcingApi.resetSourcingDemo(confirmed);
    },
    async resetSupplierDemo(confirmed) {
      if (
        !ctx ||
        !writeActive() ||
        !can(ctx, 'demo:reset') ||
        businessDomain ||
        ctx.domains.length !== 2
      )
        throw new SupplierError(
          'FORBIDDEN',
          '须由双域运营在全部域二次确认重置。',
        );
      if (confirmed !== true)
        throw new SupplierError('VALIDATION', '请先确认重置演示数据。');
      if (
        bulkReferences(quoteRepo.read()).suppliers.some(
          (id) => !data.suppliers.some((s) => s.id === id),
        )
      )
        throw new SupplierError(
          'VALIDATION',
          '供应商被批次引用，请先独立确认重置报价演示数据。',
        );
      if (
        channelRepo
          .read()
          .channels.some(
            (c) => !data.suppliers.some((s) => s.id === c.supplierId),
          )
      )
        throw new SupplierError(
          'VALIDATION',
          '请先确认重置渠道演示数据，再重置供应商，避免悬空引用。',
        );
      return supplierApi.resetSupplierDemo(confirmed);
    },
    async getDemoInfo() {
      return {
        source: 'mock',
        projectName: 'MaaS Resource Lifecycle Management',
        stage: '00',
      };
    },
    async listVendors() {
      return copy(
        ctx && can(ctx, 'vendor:read')
          ? data.vendors.filter(
              (v) =>
                hasDomain(ctx, v.businessDomain) &&
                data.models.some((m) => m.vendorId === v.id && modelAllowed(m)),
            )
          : [],
      );
    },
    async listModels() {
      return copy(
        ctx && can(ctx, 'model:read') ? data.models.filter(modelAllowed) : [],
      );
    },
    async listChannels(filter = {}) {
      if (!ctx || !can(ctx, 'channel:read')) return [];
      if (filter.supplierId && !canSeeField(ctx, 'supplierIdentity')) return [];
      return copy(
        channels()
          .filter(
            (c) =>
              (!filter.modelId || c.modelId === filter.modelId) &&
              (!filter.supplierId || c.supplierId === filter.supplierId),
          )
          .map((c) => projectChannel(ctx, c)),
      );
    },
    async getQuoteHistory(channelId) {
      return copy(
        ctx && can(ctx, 'quote:read') && channelById(channelId)
          ? quoteRepo
              .read()
              .quotes.filter((q) => q.channelId === channelId)
              .map((q) => resolvedQuote(quoteRepo.read(), q))
          : [],
      );
    },
    async listDemands() {
      return copy(
        ctx
          ? sourcingRepo
              .read()
              .demands.filter(demandAllowed)
              .map((d) =>
                projectDemand(
                  ctx,
                  d,
                  data.customers.find((c) => c.id === d.customerId) ?? null,
                ),
              )
          : [],
      );
    },
    async getDemand(id) {
      const d = sourcingRepo
        .read()
        .demands.find((d) => d.id === id && demandAllowed(d));
      if (!ctx || !d) return null;
      const items = itemsFor(d);
      const matches = sourcingRepo
        .read()
        .matches.filter(
          (m) =>
            items.some((i) => i.id === m.demandItemId) &&
            channelById(m.channelId),
        );
      return copy({
        demand: projectDemand(
          ctx,
          d,
          data.customers.find((c) => c.id === d.customerId) ?? null,
        ),
        items: items.map((i) => projectDemandItem(ctx, i)),
        matches: matches.map((m) => ({
          source: m.source,
          id: m.id,
          demandItemId: m.demandItemId,
          channelId: m.channelId,
          matchStatus: m.matchStatus,
          createdAt: m.createdAt,
        })),
        channels: channels()
          .filter((c) => matches.some((m) => m.channelId === c.id))
          .map((c) => projectChannel(ctx, c)),
      });
    },
    async listTestTasks(channelId) {
      return copy(
        ctx && can(ctx, 'test:read')
          ? channelRepo
              .read()
              .tasks.filter(
                (t) =>
                  channelById(t.channelId) &&
                  (!channelId || t.channelId === channelId),
              )
              .map((t) => projectTestTask(ctx, t))
          : [],
      );
    },
    async listTestExecutions(taskId) {
      const task = channelRepo.read().tasks.find((t) => t.id === taskId);
      return copy(
        ctx && can(ctx, 'test:read') && task && channelById(task.channelId)
          ? data.testExecutions
              .filter((e) => e.taskId === taskId)
              .map((e) => projectExecution(ctx, e))
          : [],
      );
    },
    async listQualityExemptions(channelId) {
      return copy(
        ctx &&
          can(ctx, 'test:read') &&
          canSeeField(ctx, 'internalMetadata') &&
          channelById(channelId)
          ? data.exemptions.filter((e) => e.channelId === channelId)
          : [],
      );
    },
    async listRemediations(channelId) {
      return copy(
        ctx && can(ctx, 'remediation:read')
          ? data.remediations
              .filter(
                (r) =>
                  channelById(r.channelId) &&
                  (!channelId || r.channelId === channelId),
              )
              .map((r) => projectRemediation(ctx, r))
          : [],
      );
    },
    async listIncidents() {
      return copy(
        ctx && can(ctx, 'incident:read')
          ? data.incidents
              .filter(
                (i) =>
                  supplierAllowed(i.supplierId) &&
                  (i.channelId === null || channelById(i.channelId)),
              )
              .flatMap((i) => {
                const view = projectIncident(ctx, i);
                return view ? [view] : [];
              })
          : [],
      );
    },
    async listAuditEvents() {
      return copy(
        ctx && can(ctx, 'audit:read')
          ? data.audits.filter((a) => {
              switch (a.entityType) {
                case 'quote':
                  return quoteRepo
                    .read()
                    .quotes.some(
                      (q) => q.id === a.entityId && channelById(q.channelId),
                    );
                case 'channel':
                  return !!channelById(a.entityId);
                case 'test':
                  return channelRepo
                    .read()
                    .tasks.some(
                      (t) => t.id === a.entityId && channelById(t.channelId),
                    );
                case 'remediation':
                  return data.remediations.some(
                    (r) => r.id === a.entityId && channelById(r.channelId),
                  );
                case 'incident':
                  return data.incidents.some(
                    (i) =>
                      i.id === a.entityId &&
                      supplierAllowed(i.supplierId) &&
                      (i.channelId === null || channelById(i.channelId)),
                  );
              }
            })
          : [],
      );
    },
  };
  return {
    ...base,
    ...createResourceApi(base, !!ctx && canSeeField(ctx, 'supplierIdentity')),
  };
}
/** Anonymous until a demo persona is explicitly selected by future application wiring. */
export const mockAdapter: ApiAdapter = createMockAdapter();
