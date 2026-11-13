import type {
  ManagedDemand,
  ManagedDemandItem,
  ManagedMatch,
  SourcingEvent,
  Priority,
  Coverage,
  Fit,
} from '../domain/sourcing';
import type { Model, ModelVendor, Customer } from '../domain/entities';
import type { SourcingStatus } from '../domain/statuses';
import type { ChannelView } from '../auth/view-models';
import type { ResourceSupplier } from './resource-types';
export type SourcingItemInput = Pick<
  ManagedDemandItem,
  | 'modelId'
  | 'requiredTpm'
  | 'requiredRpm'
  | 'requiredConcurrency'
  | 'requiredTtftMs'
  | 'targetPurchaseDiscount'
  | 'requiredRegion'
  | 'priority'
> & { readonly id?: string };
export interface SourcingInput {
  readonly title: string;
  readonly description: string;
  readonly sharedTitle: string;
  readonly sharedSummary: string;
  readonly priority: Priority;
  readonly customerId: string | null;
  readonly dueAt: string | null;
  readonly items: readonly SourcingItemInput[];
}
export interface SourcingDemandView extends Pick<
  ManagedDemand,
  | 'source'
  | 'id'
  | 'demandCode'
  | 'title'
  | 'description'
  | 'sharedTitle'
  | 'sharedSummary'
  | 'priority'
  | 'dueAt'
  | 'version'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'createdBy'
  | 'updatedBy'
> {
  readonly customerId?: string | null;
  readonly customer?: Pick<Customer, 'id' | 'name'> | null;
}
export interface SourcingRow {
  readonly demand: SourcingDemandView;
  readonly modelCount: number;
  readonly gapItems: number;
  readonly notStartedItems: number;
  readonly pendingItems: number;
}
export interface CandidateView {
  readonly match: ManagedMatch;
  readonly channel: ChannelView;
  readonly supplier: ResourceSupplier;
  readonly fit: Fit;
}
export interface SourcingItemDetail {
  readonly item: ManagedDemandItem;
  readonly model: Model;
  readonly vendor: ModelVendor;
  readonly coverage: Coverage;
  readonly candidates: readonly CandidateView[];
}
export interface SourcingDetail {
  readonly demand: SourcingDemandView;
  readonly items: readonly SourcingItemDetail[];
  readonly history: readonly SourcingEvent[];
  readonly canEdit: boolean;
  readonly canMatch: boolean;
  readonly canProgress: boolean;
  readonly transitions: readonly SourcingStatus[];
}
export interface SourcingQuery {
  readonly search?: string;
  readonly modelId?: string;
  readonly status?: SourcingStatus;
  readonly priority?: Priority;
  readonly from?: string;
  readonly to?: string;
  readonly sort?: 'createdAt' | 'updatedAt' | 'demandCode';
  readonly order?: 'asc' | 'desc';
  readonly page?: number;
  readonly pageSize?: number;
}
export interface SourcingPage {
  readonly rows: readonly SourcingRow[];
  readonly total: number;
  readonly stats: {
    readonly total: number;
    readonly sourcing: number;
    readonly gaps: number;
    readonly matched: number;
    readonly urgent: number;
  };
  readonly canCreate: boolean;
  readonly canReset: boolean;
}
export interface SourcingApi {
  querySourcing(query?: SourcingQuery): Promise<SourcingPage>;
  getSourcingDemand(id: string): Promise<SourcingDetail | null>;
  listSourcingCustomers(): Promise<readonly Pick<Customer, 'id' | 'name'>[]>;
  createSourcingDemand(
    input: SourcingInput,
    requestId: string,
  ): Promise<SourcingDemandView>;
  updateSourcingDemand(
    id: string,
    version: number,
    input: SourcingInput,
  ): Promise<SourcingDemandView>;
  sourcingCandidates(
    id: string,
    itemId: string,
  ): Promise<readonly Omit<CandidateView, 'match'>[]>;
  addSourcingCandidate(
    id: string,
    version: number,
    itemId: string,
    channelId: string,
    assessment: string,
  ): Promise<void>;
  updateSourcingCandidate(
    id: string,
    version: number,
    matchId: string,
    status: ManagedMatch['matchStatus'],
    assessment: string,
  ): Promise<void>;
  progressSourcing(
    id: string,
    version: number,
    status: SourcingStatus,
    note: string,
  ): Promise<void>;
  resetSourcingDemo(confirmed: boolean): Promise<void>;
}
