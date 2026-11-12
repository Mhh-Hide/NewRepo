import type {
  Channel,
  Customer,
  Demand,
  DemandItem,
  Remediation,
  Supplier,
  SupplierIncident,
  TestExecution,
  TestTask,
} from '../domain/entities';
/** Sensitive properties are absent rather than present with undefined or masked values. */
export type SupplierView = Pick<
  Supplier,
  'source' | 'id' | 'status' | 'name' | 'shortCode'
> &
  Partial<
    Pick<
      Supplier,
      'contactName' | 'contactEmail' | 'contactPhone' | 'ownerUserId'
    >
  >;
export type ChannelView = { readonly anonymousCode: string } & Pick<
  Channel,
  | 'source'
  | 'id'
  | 'modelId'
  | 'channelType'
  | 'displayName'
  | 'tpm'
  | 'rpm'
  | 'concurrencyLimit'
  | 'ttftMs'
  | 'resourceStatus'
  | 'qualityStatus'
  | 'connectivityStatus'
  | 'integrationStatus'
  | 'availabilityStatus'
> &
  Partial<
    Pick<
      Channel,
      | 'supplierId'
      | 'opChannelId'
      | 'modelInvocationName'
      | 'endpointReference'
      | 'sourceVerificationStatus'
      | 'createdAt'
      | 'updatedAt'
    >
  >;
export type CustomerView = Pick<Customer, 'source' | 'id' | 'name'> &
  Partial<Pick<Customer, 'salesPriceMinorUnits'>>;
export type DemandView = Pick<
  Demand,
  'source' | 'id' | 'status' | 'createdAt' | 'updatedAt'
> & {
  readonly customer?: CustomerView;
  readonly customerId?: string;
  readonly requesterUserId?: string;
};
export type DemandItemView = Omit<DemandItem, 'targetPurchaseDiscount'> &
  Partial<Pick<DemandItem, 'targetPurchaseDiscount'>>;
export type TestTaskView = Omit<TestTask, 'assignedTo'> &
  Partial<Pick<TestTask, 'assignedTo'>>;
export type TestExecutionView = Omit<
  TestExecution,
  'externalTestId' | 'reportReference'
> &
  Partial<Pick<TestExecution, 'externalTestId' | 'reportReference'>>;
export type RemediationView = Omit<Remediation, 'submittedBy' | 'updatedBy'> &
  Partial<Pick<Remediation, 'submittedBy' | 'updatedBy'>>;

/** Explicit allowlist so future raw fields do not silently enter API responses. */
export type SupplierIncidentView = Pick<
  SupplierIncident,
  | 'source'
  | 'id'
  | 'supplierId'
  | 'channelId'
  | 'category'
  | 'severity'
  | 'summaryCode'
  | 'status'
  | 'reportedBy'
  | 'createdAt'
  | 'updatedAt'
> & { readonly summary: string } & Partial<
    Pick<
      SupplierIncident,
      'description' | 'customer' | 'salesPriceMinorUnits' | 'purchaseDiscount'
    >
  >;
