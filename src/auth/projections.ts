import type { AccessContext } from './types';
import type {
  Channel,
  Customer,
  Demand,
  DemandItem,
  Remediation,
  Supplier,
  TestExecution,
  TestTask,
} from '../domain/entities';
import type {
  ChannelView,
  CustomerView,
  DemandItemView,
  DemandView,
  RemediationView,
  SupplierView,
  TestExecutionView,
  TestTaskView,
} from './view-models';
import { canSeeField } from './policy';
/** Record authorization happens before these pure field projections in the Adapter. */
export function projectSupplier(
  ctx: AccessContext,
  s: Supplier,
): SupplierView | null {
  if (!canSeeField(ctx, 'supplierIdentity')) return null;
  return {
    source: s.source,
    id: s.id,
    status: s.status,
    name: s.name,
    shortCode: s.shortCode,
    ...(canSeeField(ctx, 'supplierContact')
      ? {
          contactName: s.contactName,
          contactEmail: s.contactEmail,
          contactPhone: s.contactPhone,
          ownerUserId: s.ownerUserId,
        }
      : {}),
  };
}
export function projectChannel(ctx: AccessContext, c: Channel): ChannelView {
  return {
    source: c.source,
    id: c.id,
    modelId: c.modelId,
    channelType: c.channelType,
    displayName: canSeeField(ctx, 'supplierIdentity')
      ? c.displayName
      : '模拟资源（供应商已脱敏）',
    tpm: c.tpm,
    rpm: c.rpm,
    concurrencyLimit: c.concurrencyLimit,
    ttftMs: c.ttftMs,
    resourceStatus: c.resourceStatus,
    qualityStatus: c.qualityStatus,
    connectivityStatus: c.connectivityStatus,
    integrationStatus: c.integrationStatus,
    availabilityStatus: c.availabilityStatus,
    ...(canSeeField(ctx, 'supplierIdentity')
      ? { supplierId: c.supplierId }
      : {}),
    ...(canSeeField(ctx, 'internalMetadata')
      ? {
          opChannelId: c.opChannelId,
          modelInvocationName: c.modelInvocationName,
          endpointReference: c.endpointReference,
          sourceVerificationStatus: c.sourceVerificationStatus,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }
      : {}),
  };
}
export function projectCustomer(
  ctx: AccessContext,
  c: Customer,
): CustomerView | null {
  if (!canSeeField(ctx, 'customerIdentity')) return null;
  return {
    source: c.source,
    id: c.id,
    name: c.name,
    ...(canSeeField(ctx, 'customerPrice')
      ? { salesPriceMinorUnits: c.salesPriceMinorUnits }
      : {}),
  };
}
export function projectDemand(
  ctx: AccessContext,
  d: Demand,
  customer: Customer,
): DemandView {
  const view = projectCustomer(ctx, customer);
  return {
    source: d.source,
    id: d.id,
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    ...(view
      ? {
          customerId: d.customerId,
          requesterUserId: d.requesterUserId,
          customer: view,
        }
      : {}),
  };
}
export function projectDemandItem(
  ctx: AccessContext,
  i: DemandItem,
): DemandItemView {
  return {
    source: i.source,
    id: i.id,
    demandId: i.demandId,
    modelId: i.modelId,
    requiredTpm: i.requiredTpm,
    requiredRpm: i.requiredRpm,
    requiredTtftMs: i.requiredTtftMs,
    requiredConcurrency: i.requiredConcurrency,
    status: i.status,
    ...(canSeeField(ctx, 'purchaseDiscount')
      ? { targetPurchaseDiscount: i.targetPurchaseDiscount }
      : {}),
  };
}
export function projectTestTask(ctx: AccessContext, t: TestTask): TestTaskView {
  return {
    source: t.source,
    id: t.id,
    channelId: t.channelId,
    testType: t.testType,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    ...(canSeeField(ctx, 'internalMetadata')
      ? { assignedTo: t.assignedTo }
      : {}),
  };
}
export function projectExecution(
  ctx: AccessContext,
  e: TestExecution,
): TestExecutionView {
  return {
    source: e.source,
    id: e.id,
    taskId: e.taskId,
    startedAt: e.startedAt,
    finishedAt: e.finishedAt,
    result: e.result,
    failureReason: e.failureReason,
    createdAt: e.createdAt,
    ...(canSeeField(ctx, 'internalMetadata')
      ? { externalTestId: e.externalTestId, reportReference: e.reportReference }
      : {}),
  };
}
export function projectRemediation(
  ctx: AccessContext,
  r: Remediation,
): RemediationView {
  return {
    source: r.source,
    id: r.id,
    channelId: r.channelId,
    relatedTestExecutionId: r.relatedTestExecutionId,
    description: r.description,
    status: r.status,
    supplierResponse: r.supplierResponse,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ...(canSeeField(ctx, 'internalMetadata')
      ? { submittedBy: r.submittedBy, updatedBy: r.updatedBy }
      : {}),
  };
}
