import type { BusinessDomain, Identified } from '../domain/entities';
export const roleLabels = {
  ProductOperations: '产品运营',
  Procurement: '采购',
  Testing: '测试',
  OperationsSupport: '运维',
  SupplierUser: '供应商',
  Sales: '销售',
  AccountManager: '大客户经理',
  SolutionArchitect: '解决方案',
} as const;
export type Role = keyof typeof roleLabels;
/** One active role per demo session; multi-role merging is TBD. */
export interface DemoUser extends Identified {
  readonly name: string;
  readonly role: Role;
  readonly salesPriceLevel: 'sales' | 'director' | 'vp' | null;
}
export interface UserDomainGrant {
  readonly userId: string;
  readonly businessDomain: BusinessDomain;
}
/** Supplier membership and procurement maintenance scope are separate from roles. */
export interface UserSupplierGrant {
  readonly userId: string;
  readonly supplierId: string;
}
export interface UserCustomerGrant {
  readonly userId: string;
  readonly customerId: string;
}
export interface AccessContext {
  readonly user: DemoUser;
  readonly domains: readonly BusinessDomain[];
  readonly supplierIds: readonly string[];
  readonly customerIds: readonly string[];
}
export type PermissionAction =
  | 'bulk:read'
  | 'bulk:create'
  | 'bulk:update'
  | 'bulk:preview'
  | 'bulk:submit'
  | 'bulk:history'
  | 'sourcing:read'
  | 'sourcing:create'
  | 'sourcing:update'
  | 'sourcing:match'
  | 'sourcing:progress'
  | 'sourcing:history'
  | 'vendor:read'
  | 'model:read'
  | 'supplier:read'
  | 'channel:read'
  | 'channel:create'
  | 'channel:update'
  | 'channel:toggle'
  | 'channel:bind-op'
  | 'channel:history'
  | 'quote:create'
  | 'quote:verify'
  | 'quote:confirm'
  | 'quote:correct'
  | 'quote:history'
  | 'inquiry:read'
  | 'inquiry:create'
  | 'inquiry:update'
  | 'quote:read'
  | 'demand:read'
  | 'test:read'
  | 'remediation:read'
  | 'incident:read'
  | 'audit:read'
  | 'supplier:maintain'
  | 'supplier:create'
  | 'supplier:assign'
  | 'supplier:toggle'
  | 'supplier:history'
  | 'demo:reset'
  | 'demand:process'
  | 'quote:maintain'
  | 'incident:record'
  | 'operations:manage';
export type SensitiveField =
  | 'supplierIdentity'
  | 'supplierContact'
  | 'customerIdentity'
  | 'customerPrice'
  | 'purchaseDiscount'
  | 'internalMetadata';
