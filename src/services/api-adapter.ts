import type { DemoInfo } from '../domain/demo';
import type {
  AuditEvent,
  ChannelQuote,
  DemandChannelMatch,
  Model,
  ModelVendor,
  QualityExemption,
  SupplierIncident,
} from '../domain/entities';
import type {
  ChannelView,
  DemandItemView,
  DemandView,
  RemediationView,
  SupplierView,
  TestExecutionView,
  TestTaskView,
} from '../auth/view-models';
export interface DemandDetail {
  readonly demand: DemandView;
  readonly items: readonly DemandItemView[];
  readonly matches: readonly DemandChannelMatch[];
  readonly channels: readonly ChannelView[];
}
/** Read-only domain contract. No upstream DTOs and no raw store escape hatch. */
export interface ApiAdapter {
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
  listIncidents(): Promise<readonly SupplierIncident[]>;
  listAuditEvents(): Promise<readonly AuditEvent[]>;
}
