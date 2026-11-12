import type {
  AuditEvent,
  Channel,
  ChannelQuote,
  Customer,
  Demand,
  DemandChannelMatch,
  DemandItem,
  Model,
  ModelVendor,
  QualityExemption,
  Remediation,
  Supplier,
  SupplierIncident,
  TestExecution,
  TestTask,
} from './entities';
import type {
  DemoUser,
  UserCustomerGrant,
  UserDomainGrant,
  UserSupplierGrant,
} from '../auth/types';
export interface DomainStore {
  readonly vendors: readonly ModelVendor[];
  readonly models: readonly Model[];
  readonly suppliers: readonly Supplier[];
  readonly channels: readonly Channel[];
  readonly demands: readonly Demand[];
  readonly demandItems: readonly DemandItem[];
  readonly matches: readonly DemandChannelMatch[];
  readonly quotes: readonly ChannelQuote[];
  readonly testTasks: readonly TestTask[];
  readonly testExecutions: readonly TestExecution[];
  readonly exemptions: readonly QualityExemption[];
  readonly remediations: readonly Remediation[];
  readonly incidents: readonly SupplierIncident[];
  readonly audits: readonly AuditEvent[];
  readonly customers: readonly Customer[];
  readonly users: readonly DemoUser[];
  readonly domainGrants: readonly UserDomainGrant[];
  readonly supplierGrants: readonly UserSupplierGrant[];
  readonly customerGrants: readonly UserCustomerGrant[];
}
