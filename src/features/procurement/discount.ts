import { discountBps } from '../../domain/rules';
export function discountText(bps: number) {
  return `${Number((bps / 1000).toFixed(2))} 折`;
}
export function discountInput(value: number) {
  return discountBps(Math.round(value * 1000));
}
