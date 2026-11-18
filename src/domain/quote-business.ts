import type { ManagedQuote } from './quotations';
import { quoteValidity } from './quotations';
import type { ContractStage } from './lifecycle';
export const businessQuoteLabels = {
  quoted: '仅报价',
  pending: '待合同确认',
  signing: '合同签署中',
  effective: '合同已生效',
  promotion: '临时优惠',
  ended: '已结束',
} as const;
export type BusinessQuoteStatus = keyof typeof businessQuoteLabels;
export function quoteBusinessStatus(
  q: ManagedQuote,
  contract?: ContractStage,
): BusinessQuoteStatus {
  if (quoteValidity(q) === 'expired' || contract === 'terminated')
    return 'ended';
  if (q.priceStatus === 'temporary' && quoteValidity(q) === 'in_period')
    return 'promotion';
  if (contract === 'effective') return 'effective';
  if (contract === 'signing') return 'signing';
  if (q.priceStatus === 'pending_contract' || q.priceStatus === 'effective')
    return 'pending';
  return 'quoted';
}
