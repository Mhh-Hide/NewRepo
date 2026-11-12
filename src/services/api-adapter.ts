import type { SupplierApi } from './supplier-types';
import type { DemoInfo } from '../domain/demo';
import type {
  AuditEvent,
  ChannelQuote,
  DemandChannelMatch,
  Model,
  ModelVendor,
  QualityExemption,
} from '../domain/entities';
import type {
  ChannelView,
  DemandItemView,
  DemandView,
  RemediationView,
  SupplierView,
  SupplierIncidentView,
  TestExecutionView,
  TestTaskView,
} from '../auth/view-models';
export interface DemandDetail {
  readonly demand: DemandView;
  readonly items: readonly DemandItemView[];
  readonly matches: readonly DemandChannelMatch[];
  readonly channels: readonly ChannelView[];
}
/** Unified domain contract. Supplier writes are Demo-only; no raw store escape hatch. */
export interface ApiAdapter extends SupplierApi {
  getDemoInfo(): Promise<DemoInfo>;
  listVendors(): Promise<readonly ModelVendor[]>;
  listModels(): Promise<readonly Model[]>;
  listSuppliers(): Promise<readonly SupplierView[]>;
  listChannels(filter?: {
    readonly modelId?: string;
    readonly supplierId?: string;
  }): Promise<readonly ChannelView[]>;
  getQuoteHistory(channelId: string): Promise<readonly ChannelQuote[]>;
  listDemands(): Promise<readonly DemandView[]>;
  getDemand(id: string): Promise<DemandDetail | null>;
  listTestTasks(channelId?: string): Promise<readonly TestTaskView[]>;
  listTestExecutions(taskId: string): Promise<readonly TestExecutionView[]>;
  listQualityExemptions(
    channelId: string,
  ): Promise<readonly QualityExemption[]>;
  listRemediations(channelId?: string): Promise<readonly RemediationView[]>;
  listIncidents(): Promise<readonly SupplierIncidentView[]>;
  listAuditEvents(): Promise<readonly AuditEvent[]>;
}
