import type {
  BulkQuoteBatch,
  BulkQuoteEvent,
  BulkQuoteSubmission,
} from './bulk-quotations';
import type { ChannelQuote } from './entities';
export const inquiryStatusLabels = {
  draft: '待询价',
  sent: '已询价待回复',
  quoted: '已收到报价',
  closed: '已关闭',
} as const;
export const quoteSourceLabels = {
  supplier_submission: '供应商报价',
  contract: '合同依据',
  promotion: '临时优惠',
  correction: '历史纠错',
} as const;
export const dimensionLabels = {
  input_token: '输入 Token',
  output_token: '输出 Token',
  image: '图像',
  video_second: '视频秒',
  request: '单次请求',
  other: '其他规格',
} as const;
export interface PriceRate {
  readonly dimension: keyof typeof dimensionLabels;
  readonly quantity: number;
  readonly unit: string;
  readonly amount: string | null;
}
export interface PriceSpec {
  readonly currency: string | null;
  readonly referencePriceSource: string | null;
  readonly specification: string | null;
  readonly rates: readonly PriceRate[];
}
/** Decimal strings are the stored truth; bigint is used only in calculations, never JSON. */
export function decimalMicros(value: string): bigint {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(value)
  )
    throw Error(
      '金额须为非负十进制字符串，最多12位整数、6位小数；不支持指数、NaN 或 Infinity。',
    );
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
export function validatePriceSpec(s: PriceSpec): void {
  if (
    !s ||
    !(
      s.currency === null ||
      (typeof s.currency === 'string' && /^[A-Z]{3}$/.test(s.currency))
    ) ||
    ![s.referencePriceSource, s.specification].every(
      (v) =>
        v === null ||
        (typeof v === 'string' && v.trim().length > 0 && v.length <= 300),
    ) ||
    !Array.isArray(s.rates)
  )
    throw Error('价格币种、基准或适用规格无效。');
  const dimensions = new Set<string>();
  for (const r of s.rates) {
    if (
      !r ||
      !Object.hasOwn(dimensionLabels, r.dimension) ||
      !Number.isSafeInteger(r.quantity) ||
      r.quantity <= 0 ||
      typeof r.unit !== 'string' ||
      !r.unit.trim() ||
      r.unit.length > 80 ||
      dimensions.has(r.dimension)
    )
      throw Error('各计量维度须唯一，计量数量为正整数并明确单位。');
    dimensions.add(r.dimension);
    if (r.amount !== null) decimalMicros(r.amount);
  }
}
export type ManagedQuote = ChannelQuote & {
  readonly inquiryId: string | null;
  readonly demandId: string | null;
  readonly demandItemId: string | null;
  readonly recordedBy: string | null;
  readonly supplierSubmitterReference: string | null;
  readonly supplierQuotedAt: string | null;
  readonly priceSpec: PriceSpec;
};
export interface InquiryRecord {
  readonly id: string;
  readonly channelId: string;
  readonly demandItemId: string | null;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly responseDueAt: string | null;
  readonly status: keyof typeof inquiryStatusLabels;
  readonly followUpNote: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface QuoteDecision {
  readonly id: string;
  readonly quoteId: string;
  readonly kind: 'verify' | 'confirm';
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly evidenceReference: string;
  readonly effectiveFrom: string | null;
  readonly reason: string;
}
export interface QuoteAudit {
  readonly id: string;
  readonly targetType: 'quote' | 'inquiry';
  readonly targetId: string;
  readonly action: string;
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly changes: readonly {
    readonly field: string;
    readonly before: string | number | null;
    readonly after: string | number | null;
  }[];
}
export interface QuoteRequest {
  readonly id: string;
  readonly actorUserId: string;
  readonly operation: string;
  readonly fingerprint: string;
  readonly resultId: string;
}
export interface QuoteInput {
  readonly channelId: string;
  readonly demandId: string | null;
  readonly demandItemId: string | null;
  readonly inquiryId: string | null;
  readonly inquiryVersion: number | null;
  readonly previousQuoteId: string | null;
  readonly discount: ChannelQuote['discount'];
  readonly priceStatus: 'reference' | 'pending_contract' | 'temporary';
  readonly sourceType: ChannelQuote['sourceType'];
  readonly effectiveFrom: string | null;
  readonly effectiveUntil: string | null;
  readonly evidenceReference: string;
  readonly supplierSubmitterReference: string | null;
  readonly supplierQuotedAt: string | null;
  readonly reason: string;
  readonly priceSpec: PriceSpec;
}
export interface QuoteState {
  readonly schemaVersion: 2;
  readonly revision: number;
  readonly quotes: readonly ManagedQuote[];
  readonly inquiries: readonly InquiryRecord[];
  readonly decisions: readonly QuoteDecision[];
  readonly history: readonly QuoteAudit[];
  readonly requests: readonly QuoteRequest[];
  readonly batches: readonly BulkQuoteBatch[];
  readonly batchEvents: readonly BulkQuoteEvent[];
  readonly batchSubmissions: readonly BulkQuoteSubmission[];
}
export const validityLabels = {
  expired: '已到期（历史保留）',
  scheduled: '尚未生效',
  in_period: '在记录有效期内',
  unspecified: '有效期未提供',
} as const;
export function quoteValidity(
  q: ChannelQuote,
  now = Date.now(),
): keyof typeof validityLabels {
  if (
    q.priceStatus === 'expired' ||
    (q.effectiveUntil !== null && Date.parse(q.effectiveUntil) <= now)
  )
    return 'expired';
  if (q.effectiveFrom !== null && Date.parse(q.effectiveFrom) > now)
    return 'scheduled';
  return q.effectiveFrom === null ? 'unspecified' : 'in_period';
}
export function basisDifferences(
  a: PriceSpec,
  b: PriceSpec,
): readonly string[] {
  const reasons: string[] = [];
  for (const [key, label] of [
    ['currency', '币种'],
    ['referencePriceSource', '价格基准'],
    ['specification', '适用规格'],
  ] as const) {
    if (!a[key] || !b[key]) reasons.push(`${label}未提供`);
    else if (a[key] !== b[key]) reasons.push(`${label}不同`);
  }
  if (!a.rates.length || !b.rates.length) reasons.push('计量维度或单位未提供');
  const basis = (s: PriceSpec) =>
    s.rates
      .map((r) => JSON.stringify([r.dimension, r.quantity, r.unit]))
      .sort();
  if (JSON.stringify(basis(a)) !== JSON.stringify(basis(b)))
    reasons.push('计量维度、数量或单位不同（不混合输入/输出或不同媒体）');
  return reasons;
}
export type ComparableQuote = Pick<
  ManagedQuote,
  'priceSpec' | 'priceStatus' | 'effectiveFrom' | 'effectiveUntil' | 'discount'
>;
export function compareQuotes(
  a: ComparableQuote,
  b: ComparableQuote,
  modelA: string,
  modelB: string,
) {
  const reasons = [...basisDifferences(a.priceSpec, b.priceSpec)];
  if (modelA !== modelB) reasons.push('模型不同');
  if (a.priceStatus !== b.priceStatus)
    reasons.push('价格状态不同，不能混合参考、正式或临时价格');
  if (
    a.effectiveFrom !== b.effectiveFrom ||
    a.effectiveUntil !== b.effectiveUntil
  )
    reasons.push('适用有效期不同');
  return {
    comparable: !reasons.length,
    reasons,
    discountDifferenceBps: reasons.length ? null : a.discount - b.discount,
    rates: reasons.length
      ? []
      : a.priceSpec.rates.map((r) => {
          const other = b.priceSpec.rates.find(
            (v) => v.dimension === r.dimension,
          )!;
          return {
            dimension: r.dimension,
            order:
              r.amount === null || other.amount === null
                ? null
                : decimalMicros(r.amount) < decimalMicros(other.amount)
                  ? ('lower' as const)
                  : decimalMicros(r.amount) > decimalMicros(other.amount)
                    ? ('higher' as const)
                    : ('equal' as const),
          };
        }),
  };
}
