import type { ManagedQuote, PriceSpec } from '../../domain/quotations';
import { dimensionLabels } from '../../domain/quotations';
export const displayDate = (s: string | null) =>
  s
    ? new Date(s).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    : '未提供';
export const dateInput = (s: string | null) =>
  s
    ? new Date(s).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
    : '';
export const dateISO = (s: string | undefined | null) =>
  s ? new Date(`${s}T00:00:00+08:00`).toISOString() : null;
export const priceSpecText = (s: PriceSpec) =>
  `${s.currency ?? '币种未提供'} · ${s.rates.length ? s.rates.map((r) => `${r.amount ?? '金额未提供'} / ${r.quantity} ${r.unit}（${dimensionLabels[r.dimension]}）`).join('；') : '计量单位未提供'}`;
export const quoteDiscount = (q: ManagedQuote) =>
  `${q.discount} 基点（${q.discount / 1000} 折）`;
