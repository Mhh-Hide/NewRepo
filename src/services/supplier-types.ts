import type {
  SupplierInput,
  CooperationStatus,
  SupplierCategory,
  SupplierChangeEvent,
} from '../domain/suppliers';
import type { SupplierView } from '../auth/view-models';
export class SupplierError extends Error {
  constructor(
    readonly code:
      'FORBIDDEN' | 'VALIDATION' | 'DUPLICATE' | 'CONFLICT' | 'STORAGE',
    message: string,
  ) {
    super(message);
    this.name = 'SupplierError';
  }
}
export function supplierErrorMessage(error: unknown): string {
  return error instanceof SupplierError
    ? error.message
    : '供应商数据查询或保存失败，请稍后重试。';
}
export interface SupplierCapabilities {
  readonly edit: boolean;
  readonly assign: boolean;
  readonly toggle: boolean;
  readonly history: boolean;
}
export interface SupplierRecordView {
  readonly supplier: SupplierView;
  readonly capabilities: SupplierCapabilities;
}
export interface SupplierQuery {
  readonly search?: string;
  readonly cooperationStatus?: CooperationStatus;
  readonly status?: 'enabled' | 'disabled';
  readonly supplierCategory?: SupplierCategory;
  readonly ownerUserId?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: 'name' | 'updatedAt';
  readonly order?: 'asc' | 'desc';
}
export interface SupplierPage {
  readonly rows: readonly SupplierRecordView[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly stats: {
    readonly total: number;
    readonly cooperating: number;
    readonly negotiating: number;
    readonly inactive: number;
  };
  readonly canCreate: boolean;
  readonly canReset: boolean;
}
export interface SupplierDetail extends SupplierRecordView {
  readonly resources: {
    readonly modelCount: number;
    readonly channelCount: number;
    readonly channelTypes: readonly string[];
  };
}
export interface SupplierHistoryView extends Omit<
  SupplierChangeEvent,
  'beforeSnapshot' | 'afterSnapshot'
> {
  readonly beforeSnapshot: SupplierView | null;
  readonly afterSnapshot: SupplierView;
}
export interface SupplierOwner {
  readonly id: string;
  readonly name: string;
}
export interface SupplierApi {
  querySuppliers(query?: SupplierQuery): Promise<SupplierPage>;
  getSupplier(id: string): Promise<SupplierDetail | null>;
  listSupplierOwners(): Promise<readonly SupplierOwner[]>;
  createSupplier(input: SupplierInput): Promise<SupplierView>;
  updateSupplier(
    id: string,
    expectedVersion: number,
    input: SupplierInput,
  ): Promise<SupplierView>;
  setSupplierStatus(
    id: string,
    expectedVersion: number,
    status: 'enabled' | 'disabled',
  ): Promise<SupplierView>;
  listSupplierHistory(id: string): Promise<readonly SupplierHistoryView[]>;
  resetSupplierDemo(confirmed: boolean): Promise<void>;
}
