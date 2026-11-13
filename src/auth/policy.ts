import type {
  AccessContext,
  PermissionAction,
  Role,
  SensitiveField,
} from './types';
import type { BusinessDomain } from '../domain/entities';
const frontRoles: readonly Role[] = [
  'Sales',
  'AccountManager',
  'SolutionArchitect',
];
export const isFrontOffice = (role: Role): boolean => frontRoles.includes(role);
const technical: readonly PermissionAction[] = [
  'vendor:read',
  'model:read',
  'channel:read',
];
const actions: Record<Role, readonly PermissionAction[]> = {
  ProductOperations: [
    'channel:create',
    'channel:update',
    'channel:toggle',
    'channel:bind-op',
    'channel:history',
    ...technical,
    'supplier:read',
    'quote:read',
    'demand:read',
    'test:read',
    'remediation:read',
    'incident:read',
    'audit:read',
    'operations:manage',
    'supplier:create',
    'supplier:assign',
    'supplier:toggle',
    'supplier:history',
    'demo:reset',
    'supplier:maintain',
    'demand:process',
    'quote:maintain',
    'incident:record',
  ],
  Procurement: [
    ...technical,
    'supplier:read',
    'quote:read',
    'demand:read',
    'incident:read',
    'supplier:maintain',
    'supplier:history',
    'demand:process',
    'quote:maintain',
    'incident:record',
  ],
  Testing: [...technical, 'supplier:read', 'test:read', 'remediation:read'],
  OperationsSupport: [
    ...technical,
    'supplier:read',
    'demand:read',
    'incident:read',
    'incident:record',
  ],
  SupplierUser: [
    ...technical,
    'supplier:read',
    'test:read',
    'remediation:read',
  ],
  Sales: [...technical, 'demand:read'],
  AccountManager: [...technical, 'demand:read'],
  SolutionArchitect: [...technical, 'demand:read'],
};
const fields: Record<SensitiveField, readonly Role[]> = {
  supplierIdentity: [
    'ProductOperations',
    'Procurement',
    'Testing',
    'OperationsSupport',
    'SupplierUser',
  ],
  supplierContact: ['ProductOperations', 'Procurement', 'SupplierUser'],
  customerIdentity: ['ProductOperations', 'OperationsSupport', ...frontRoles],
  customerPrice: ['ProductOperations'],
  purchaseDiscount: ['ProductOperations', 'Procurement'],
  internalMetadata: [
    'ProductOperations',
    'Procurement',
    'Testing',
    'OperationsSupport',
  ],
};
export function can(ctx: AccessContext, action: PermissionAction): boolean {
  return (
    Object.hasOwn(actions, ctx.user.role) &&
    actions[ctx.user.role].includes(action)
  );
}
export function canSeeField(
  ctx: AccessContext,
  field: SensitiveField,
): boolean {
  return Object.hasOwn(fields, field) && fields[field].includes(ctx.user.role);
}
export function hasDomain(ctx: AccessContext, domain: BusinessDomain): boolean {
  return ctx.domains.includes(domain);
}
/** Roles do not imply unrestricted customer access. */
export function hasCustomer(ctx: AccessContext, customerId: string): boolean {
  return (
    ctx.user.role === 'ProductOperations' ||
    ctx.user.role === 'OperationsSupport' ||
    (isFrontOffice(ctx.user.role) && ctx.customerIds.includes(customerId))
  );
}
export function hasSupplier(ctx: AccessContext, supplierId: string): boolean {
  return (
    (ctx.user.role !== 'SupplierUser' && ctx.user.role !== 'Procurement') ||
    ctx.supplierIds.includes(supplierId)
  );
}
