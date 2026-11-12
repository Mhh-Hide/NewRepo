import type { BusinessDomain, Supplier } from './entities';
export const cooperationStatusLabels = {
  potential: '潜在合作',
  negotiating: '洽谈中',
  cooperating: '合作中',
  paused: '暂停合作',
  terminated: '已终止',
} as const;
export type CooperationStatus = keyof typeof cooperationStatusLabels;
export const supplierCategoryLabels = {
  official_vendor: '官方厂商',
  cloud_provider: '云服务商',
  third_party: '第三方供应商',
  other: '其他',
} as const;
export type SupplierCategory = keyof typeof supplierCategoryLabels;
export type SupplierAccountStatus =
  'not_created' | 'invited' | 'active' | 'disabled';
export const supplierEditableFields = [
  'name',
  'shortCode',
  'supplierCategory',
  'cooperationStatus',
  'countryOrRegion',
  'description',
  'contactName',
  'contactEmail',
  'contactPhone',
  'contactPosition',
  'alternativeContact',
  'ownerUserId',
  'remark',
] as const;
export type SupplierEditableField = (typeof supplierEditableFields)[number];
export type SupplierInput = Pick<
  Supplier,
  | 'name'
  | 'shortCode'
  | 'supplierCategory'
  | 'cooperationStatus'
  | 'ownerUserId'
> &
  Partial<
    Pick<
      Supplier,
      Exclude<
        SupplierEditableField,
        | 'name'
        | 'shortCode'
        | 'supplierCategory'
        | 'cooperationStatus'
        | 'ownerUserId'
      >
    >
  >;
/** Access scope, NOT a vendor/model business-domain truth. */
export interface SupplierMasterScope {
  readonly supplierId: string;
  readonly managementDomains: readonly BusinessDomain[];
}
export interface SupplierChangeEvent {
  readonly id: string;
  readonly supplierId: string;
  readonly action: 'created' | 'edited' | 'status_changed' | 'owner_assigned';
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly changedFields: readonly string[];
  readonly beforeSnapshot: Supplier | null;
  readonly afterSnapshot: Supplier;
}
