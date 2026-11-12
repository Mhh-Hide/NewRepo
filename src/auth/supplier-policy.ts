import type { AccessContext } from './types';
import type { BusinessDomain, Supplier } from '../domain/entities';
import type { SupplierMasterScope } from '../domain/suppliers';
import type { UserSupplierGrant } from './types';
import type { SupplierCapabilities } from '../services/supplier-types';
import { can } from './policy';
export function canReadSupplierMaster(
  ctx: AccessContext,
  s: Supplier,
  scopes: readonly SupplierMasterScope[],
  maintenance: readonly UserSupplierGrant[],
  activeDomains: readonly BusinessDomain[],
  hasVisibleChannel: boolean,
): boolean {
  if (!can(ctx, 'supplier:read') || activeDomains.length === 0) return false;
  if (ctx.user.role === 'ProductOperations')
    return (
      hasVisibleChannel ||
      scopes.some(
        (g) =>
          g.supplierId === s.id &&
          g.managementDomains.some((d) => activeDomains.includes(d)),
      )
    );
  if (ctx.user.role === 'Procurement')
    return maintenance.some(
      (g) => g.supplierId === s.id && g.userId === ctx.user.id,
    );
  if (ctx.user.role === 'SupplierUser') return ctx.supplierIds.includes(s.id);
  return hasVisibleChannel;
}
export function supplierCapabilities(
  ctx: AccessContext,
  s: Supplier,
  readable: boolean,
  maintenance: readonly UserSupplierGrant[],
): SupplierCapabilities {
  const edit =
    readable &&
    can(ctx, 'supplier:maintain') &&
    (ctx.user.role === 'ProductOperations' ||
      maintenance.some(
        (g) => g.supplierId === s.id && g.userId === ctx.user.id,
      ));
  return {
    edit,
    assign: edit && can(ctx, 'supplier:assign'),
    toggle: edit && can(ctx, 'supplier:toggle'),
    history: readable && can(ctx, 'supplier:history'),
  };
}
