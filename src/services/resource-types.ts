import type { Model, ModelVendor, BusinessDomain } from '../domain/entities';
import type { ChannelView, SupplierView } from '../auth/view-models';
import type {
  QualityStatus,
  ConnectivityStatus,
  IntegrationStatus,
  AvailabilityStatus,
  ChannelType,
} from '../domain/statuses';
import { SupplierError } from './supplier-types';
export interface StateCount<T extends string = string> {
  readonly code: T;
  readonly label: string;
  readonly count: number;
}
export interface ResourceStates {
  readonly quality: readonly StateCount<QualityStatus>[];
  readonly connectivity: readonly StateCount<ConnectivityStatus>[];
  readonly integration: readonly StateCount<IntegrationStatus>[];
  readonly availability: readonly StateCount<AvailabilityStatus>[];
}
export type ResourceSupplier = Pick<
  SupplierView,
  'source' | 'id' | 'name' | 'shortCode' | 'status'
>;
export type ChannelResourceSummary = Pick<
  ChannelView,
  | 'source'
  | 'id'
  | 'modelId'
  | 'anonymousCode'
  | 'displayName'
  | 'channelType'
  | 'tpm'
  | 'rpm'
  | 'concurrencyLimit'
  | 'ttftMs'
  | 'resourceStatus'
  | 'qualityStatus'
  | 'connectivityStatus'
  | 'integrationStatus'
  | 'availabilityStatus'
> & { readonly supplier?: ResourceSupplier };
export interface ModelResourceSummary {
  readonly model: Model;
  readonly vendor: ModelVendor;
  readonly businessDomain: BusinessDomain;
  readonly channelCount: number;
  readonly supplierCount?: number;
  readonly channelTypes: readonly {
    readonly code: ChannelType;
    readonly count: number;
  }[];
  readonly states: ResourceStates;
}
export interface SupplierCoverage {
  readonly supplier: ResourceSupplier;
  readonly channelCount: number;
  readonly states: ResourceStates;
}
export interface ModelResourceDetail {
  readonly summary: ModelResourceSummary;
  readonly suppliers: readonly SupplierCoverage[];
  readonly channels: readonly ChannelResourceSummary[];
  readonly supplierIdentityVisible: boolean;
}
export type ChannelResourceDetail = ChannelResourceSummary & {
  readonly model: Model;
  readonly vendor: ModelVendor;
  readonly businessDomain: BusinessDomain;
} & Partial<
    Pick<
      ChannelView,
      | 'opChannelId'
      | 'modelInvocationName'
      | 'endpointReference'
      | 'sourceVerificationStatus'
    >
  >;
export interface ModelResourceQuery {
  readonly search?: string;
  readonly vendorId?: string;
  readonly category?: Model['category'];
  readonly regionVariant?: Model['regionVariant'];
  readonly status?: Model['status'];
  readonly hasChannels?: 'yes' | 'no';
  readonly supplierCoverage?: 'zero' | 'one_two' | 'three_plus';
  readonly supplierId?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: 'name' | 'channelCount';
  readonly order?: 'asc' | 'desc';
}
export interface ModelResourcePage {
  readonly rows: readonly ModelResourceSummary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly vendors: readonly ModelVendor[];
  readonly supplierIdentityVisible: boolean;
  readonly appliedSupplier?: ResourceSupplier;
  readonly stats: {
    readonly models: number;
    readonly withChannels: number;
    readonly withoutChannels: number;
    readonly channels: number;
    readonly threeSupplierModels?: number;
  };
}
export interface ResourceApi {
  queryModelResources(query?: ModelResourceQuery): Promise<ModelResourcePage>;
  getModelResource(modelId: string): Promise<ModelResourceDetail | null>;
  getChannelResource(channelId: string): Promise<ChannelResourceDetail | null>;
}
/** Existing authorized query boundary: replace underlying readers for Stage 04B repositories. */
export interface ResourceReaders {
  listVendors(): Promise<readonly ModelVendor[]>;
  listModels(): Promise<readonly Model[]>;
  listSuppliers(): Promise<readonly SupplierView[]>;
  listChannels(): Promise<readonly ChannelView[]>;
}
export class ResourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceError';
  }
}
export function resourceErrorMessage(error: unknown): string {
  return error instanceof ResourceError || error instanceof SupplierError
    ? error.message
    : '资源数据查询失败，请稍后重试。';
}
