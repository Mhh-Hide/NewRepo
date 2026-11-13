import type {
  CooperationStatus,
  SupplierCategory,
  SupplierAccountStatus,
} from './suppliers';
import type {
  AvailabilityStatus,
  ChannelType,
  ConnectivityStatus,
  EntityStatus,
  IncidentStatus,
  IntegrationStatus,
  QualityStatus,
  QuoteStatus,
  RemediationStatus,
  SourcingStatus,
  TaskStatus,
  TestType,
} from './statuses';
export type BusinessDomain = 'domestic' | 'overseas';
export interface MockRecord {
  readonly source: 'mock';
}
export interface Identified extends MockRecord {
  readonly id: string;
}
export interface Timestamps {
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface ModelVendor extends Identified, Timestamps {
  readonly name: string;
  readonly code: string;
  readonly businessDomain: BusinessDomain;
  readonly status: EntityStatus;
}
export interface Model extends Identified, Timestamps {
  readonly vendorId: string;
  readonly name: string;
  readonly modelCode: string;
  readonly version: string;
  readonly regionVariant: 'domestic' | 'overseas' | 'global' | 'other';
  readonly category:
    'text' | 'image' | 'video' | 'audio' | 'multimodal' | 'other';
  readonly status: EntityStatus;
}
export interface Supplier extends Identified, Timestamps {
  readonly name: string;
  readonly shortCode: string;
  readonly status: EntityStatus;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly ownerUserId: string;
  readonly cooperationStatus: CooperationStatus;
  readonly supplierCategory: SupplierCategory;
  readonly countryOrRegion: string;
  readonly description: string;
  readonly contactPosition: string;
  readonly alternativeContact: string;
  readonly remark: string;
  readonly externalAccountStatus: SupplierAccountStatus;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly version: number;
}
export interface Channel extends Identified, Timestamps {
  readonly supplierId: string;
  readonly modelId: string;
  readonly channelType: ChannelType;
  readonly displayName: string;
  readonly opChannelId: string | null;
  readonly modelInvocationName: string;
  readonly endpointReference: string;
  readonly sourceVerificationStatus: 'unverified' | 'verified' | 'rejected';
  readonly tpm: number | null;
  readonly rpm: number | null;
  readonly concurrencyLimit: number | null;
  readonly ttftMs: number | null;
  readonly resourceStatus: EntityStatus;
  readonly qualityStatus: QualityStatus;
  readonly connectivityStatus: ConnectivityStatus;
  readonly integrationStatus: IntegrationStatus;
  readonly availabilityStatus: AvailabilityStatus;
}
/** Integer basis points: 10000 = full price, 8000 = 八折. */
export type DiscountBps = number & { readonly __discountBps: unique symbol };
export interface Demand extends Identified, Timestamps {
  readonly requesterUserId: string;
  readonly customerId: string | null;
  readonly status: SourcingStatus;
}
export interface DemandItem extends Identified {
  readonly demandId: string;
  readonly modelId: string;
  readonly targetPurchaseDiscount: DiscountBps;
  readonly requiredTpm: number | null;
  readonly requiredRpm: number | null;
  readonly requiredTtftMs: number | null;
  readonly requiredConcurrency: number | null;
  readonly status: SourcingStatus;
}
export interface DemandChannelMatch extends Identified {
  readonly demandItemId: string;
  readonly channelId: string;
  readonly matchStatus: 'candidate' | 'suitable' | 'unsuitable' | 'excluded';
  readonly createdAt: string;
}
export interface ChannelQuote extends Identified {
  readonly channelId: string;
  readonly discount: DiscountBps;
  readonly priceStatus: QuoteStatus;
  readonly reason: string;
  readonly sourceType:
    'supplier_submission' | 'contract' | 'promotion' | 'correction';
  readonly effectiveFrom: string | null;
  readonly effectiveUntil: string | null;
  readonly evidenceReference: string | null;
  readonly submittedBy: string;
  readonly confirmedBy: string | null;
  readonly confirmedAt: string | null;
  readonly createdAt: string;
  readonly previousQuoteId: string | null;
}
export interface TestTask extends Identified, Timestamps {
  readonly channelId: string;
  readonly testType: TestType;
  readonly status: TaskStatus;
  readonly assignedTo: string | null;
}
export interface TestExecution extends Identified {
  readonly taskId: string;
  readonly externalTestId: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly result: 'passed' | 'failed' | 'inconclusive' | null;
  readonly failureReason: string | null;
  readonly reportReference: string | null;
  readonly createdAt: string;
}
export interface QualityExemption extends Identified {
  readonly channelId: string;
  readonly verifiedBy: string;
  readonly verifiedAt: string;
  readonly evidenceReference: string;
  readonly reason: string;
}
export interface Remediation extends Identified, Timestamps {
  readonly channelId: string;
  readonly relatedTestExecutionId: string | null;
  readonly description: string;
  readonly status: RemediationStatus;
  readonly supplierResponse: string | null;
  readonly submittedBy: string;
  readonly updatedBy: string;
}
export type IncidentSummaryCode =
  | 'resource_unavailable'
  | 'service_feedback'
  | 'compliance_review'
  | 'other_issue';
export interface SupplierIncident extends Identified, Timestamps {
  readonly supplierId: string;
  readonly channelId: string | null;
  readonly category: 'complaint' | 'outage' | 'violation' | 'other';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly summaryCode: IncidentSummaryCode;
  /** Unclassified free text may mix sensitivities; ProductOperations only. */
  readonly description: string;
  readonly customer: Pick<Customer, 'id' | 'name'> | null;
  readonly salesPriceMinorUnits: number | null;
  readonly purchaseDiscount: DiscountBps | null;
  readonly status: IncidentStatus;
  readonly reportedBy: string;
}
export type SnapshotValue = string | number | boolean | null;
export type AuditSnapshot = Readonly<Record<string, SnapshotValue>>;
export interface AuditEvent extends Identified {
  readonly entityType:
    'quote' | 'channel' | 'test' | 'remediation' | 'incident';
  readonly entityId: string;
  readonly action: 'created' | 'updated' | 'confirmed';
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly changeSummary: string;
  readonly beforeSnapshot: AuditSnapshot | null;
  readonly afterSnapshot: AuditSnapshot;
}
/** Explicit sensitive fixture for projection tests, not a sales pricing workflow. */
export interface Customer extends Identified {
  readonly name: string;
  readonly salesPriceMinorUnits: number;
}
