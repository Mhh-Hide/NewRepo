import type { ApiAdapter } from '../services/api-adapter';
import type { AccessContext } from '../auth/types';
import type { Channel, Demand, Model } from '../domain/entities';
import {
  can,
  canSeeField,
  hasCustomer,
  hasDomain,
  hasSupplier,
} from '../auth/policy';
import {
  projectChannel,
  projectDemand,
  projectDemandItem,
  projectExecution,
  projectRemediation,
  projectSupplier,
  projectTestTask,
} from '../auth/projections';
import { modelDomain } from '../domain/rules';
import { fixture as data } from './data';
import { validateStore } from '../domain/validation';
const fixtureErrors = validateStore(data);
if (fixtureErrors.length) throw new Error(fixtureErrors.join('; '));
/** Demo persona selector, NOT authentication. Never accept this as backend authority. */
export function createMockAdapter(userId?: string): ApiAdapter {
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
  const modelAllowed = (m: Model): boolean =>
    ctx !== null &&
    hasDomain(ctx, modelDomain(m, data.vendors)) &&
    (ctx.user.role !== 'SupplierUser' ||
      data.channels.some(
        (c) => c.modelId === m.id && hasSupplier(ctx, c.supplierId),
      ));
  const channelAllowed = (c: Channel): boolean =>
    ctx !== null &&
    hasSupplier(ctx, c.supplierId) &&
    data.models.some((m) => m.id === c.modelId && modelAllowed(m));
  const channels = () => data.channels.filter(channelAllowed);
  const supplierAllowed = (id: string): boolean =>
    ctx !== null &&
    hasSupplier(ctx, id) &&
    channels().some((c) => c.supplierId === id);
  const itemsFor = (d: Demand) =>
    data.demandItems.filter(
      (i) =>
        i.demandId === d.id &&
        data.models.some((m) => m.id === i.modelId && modelAllowed(m)),
    );
  const demandAllowed = (d: Demand): boolean =>
    ctx !== null &&
    can(ctx, 'demand:read') &&
    itemsFor(d).length > 0 &&
    (ctx.user.role === 'Procurement' || hasCustomer(ctx, d.customerId));
  const channelById = (id: string) => channels().find((c) => c.id === id);
  // Clone each response so client mutation cannot contaminate the backing fixture or another role.
  const copy = <T>(value: T): T => structuredClone(value);
  return {
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
    async listSuppliers() {
      return copy(
        ctx && can(ctx, 'supplier:read')
          ? data.suppliers
              .filter((s) => supplierAllowed(s.id))
              .flatMap((s) => {
                const view = projectSupplier(ctx, s);
                return view ? [view] : [];
              })
          : [],
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
          ? data.quotes.filter((q) => q.channelId === channelId)
          : [],
      );
    },
    async listDemands() {
      return copy(
        ctx
          ? data.demands.filter(demandAllowed).map((d) =>
              projectDemand(
                ctx,
                d,
                data.customers.find((c) => c.id === d.customerId)!,
              ),
            )
          : [],
      );
    },
    async getDemand(id) {
      const d = data.demands.find((d) => d.id === id && demandAllowed(d));
      if (!ctx || !d) return null;
      const items = itemsFor(d);
      const matches = data.matches.filter(
        (m) =>
          items.some((i) => i.id === m.demandItemId) &&
          channelById(m.channelId),
      );
      return copy({
        demand: projectDemand(
          ctx,
          d,
          data.customers.find((c) => c.id === d.customerId)!,
        ),
        items: items.map((i) => projectDemandItem(ctx, i)),
        matches,
        channels: channels()
          .filter((c) => matches.some((m) => m.channelId === c.id))
          .map((c) => projectChannel(ctx, c)),
      });
    },
    async listTestTasks(channelId) {
      return copy(
        ctx && can(ctx, 'test:read')
          ? data.testTasks
              .filter(
                (t) =>
                  channelById(t.channelId) &&
                  (!channelId || t.channelId === channelId),
              )
              .map((t) => projectTestTask(ctx, t))
          : [],
      );
    },
    async listTestExecutions(taskId) {
      const task = data.testTasks.find((t) => t.id === taskId);
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
          ? data.incidents.filter(
              (i) =>
                supplierAllowed(i.supplierId) &&
                (i.channelId === null || channelById(i.channelId)),
            )
          : [],
      );
    },
    async listAuditEvents() {
      return copy(
        ctx && can(ctx, 'audit:read')
          ? data.audits.filter((a) => {
              switch (a.entityType) {
                case 'quote':
                  return data.quotes.some(
                    (q) => q.id === a.entityId && channelById(q.channelId),
                  );
                case 'channel':
                  return !!channelById(a.entityId);
                case 'test':
                  return data.testTasks.some(
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
}
/** Anonymous until a demo persona is explicitly selected by future application wiring. */
export const mockAdapter: ApiAdapter = createMockAdapter();
