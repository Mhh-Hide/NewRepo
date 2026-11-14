import type { Channel } from '../domain/entities';
import type {
  QuoteInput,
  QuoteState,
  ManagedQuote,
  PriceSpec,
} from '../domain/quotations';
import type { SourcingState } from '../domain/sourcing';
import { appendQuote, discountBps } from '../domain/rules';
import { quoteSourceLabels, validatePriceSpec } from '../domain/quotations';
import { SupplierError } from '../services/supplier-types';
export const quoteFields = [
  'channelId',
  'demandId',
  'demandItemId',
  'inquiryId',
  'inquiryVersion',
  'previousQuoteId',
  'discount',
  'priceStatus',
  'sourceType',
  'effectiveFrom',
  'effectiveUntil',
  'evidenceReference',
  'supplierSubmitterReference',
  'supplierQuotedAt',
  'reason',
  'priceSpec',
] as const;
export class QuoteInputError extends SupplierError {
  constructor(
    readonly field: string,
    message: string,
    code: 'VALIDATION' | 'CONFLICT' = 'VALIDATION',
  ) {
    super(code, message);
  }
}
export const quoteIso = (v: string | null) =>
  v === null || (typeof v === 'string' && Number.isFinite(Date.parse(v)));
export const stableFingerprint = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(stableFingerprint).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .sort()
          .map(
            (k) =>
              `${JSON.stringify(k)}:${stableFingerprint((v as Record<string, unknown>)[k])}`,
          )
          .join(',')}}`
      : String(JSON.stringify(v));
export function quoteText(v: string) {
  if (typeof v !== 'string' || !v.trim() || v.length > 2000)
    throw new QuoteInputError(
      'reason',
      '请填写共享商业说明（最多2000字，不含客户身份或客户售价）。',
    );
  return v.trim();
}
export function quoteEvidence(v: string) {
  if (typeof v !== 'string' || !/^mock:[A-Za-z0-9_:/.-]{1,150}$/.test(v))
    throw new QuoteInputError(
      'evidenceReference',
      '证据仅接受 mock: 开头的非敏感模拟引用。',
    );
  return v;
}
export const quoteSpec = (p: PriceSpec): PriceSpec => ({
  currency: p.currency,
  referencePriceSource: p.referencePriceSource,
  specification: p.specification,
  rates: p.rates.map((r) => ({
    dimension: r.dimension,
    quantity: r.quantity,
    unit: r.unit,
    amount: r.amount,
  })),
});
export function completeDraftQuote(v: Partial<QuoteInput>): QuoteInput {
  if (v.discount === undefined)
    throw new QuoteInputError(
      'discount',
      '请填写实际报价整数基点；未知不能补零。',
    );
  return {
    channelId: v.channelId ?? '',
    demandId: v.demandId ?? null,
    demandItemId: v.demandItemId ?? null,
    inquiryId: v.inquiryId ?? null,
    inquiryVersion: v.inquiryVersion ?? null,
    previousQuoteId: v.previousQuoteId ?? null,
    discount: v.discount,
    priceStatus: v.priceStatus ?? 'reference',
    sourceType: v.sourceType ?? 'supplier_submission',
    effectiveFrom: v.effectiveFrom ?? null,
    effectiveUntil: v.effectiveUntil ?? null,
    evidenceReference: v.evidenceReference ?? '',
    supplierSubmitterReference: v.supplierSubmitterReference ?? null,
    supplierQuotedAt: v.supplierQuotedAt ?? null,
    reason: v.reason ?? '',
    priceSpec: v.priceSpec ?? {
      currency: null,
      referencePriceSource: null,
      specification: null,
      rates: [],
    },
  };
}
export function prepareQuote(
  input: QuoteInput,
  c: Channel,
  s: QuoteState,
  sourcing: SourcingState,
  prior: (id: string) => ManagedQuote,
  actorId: string,
  id: string,
  now: string,
): ManagedQuote {
  if (
    !input ||
    Object.keys(input).some(
      (k) => !quoteFields.includes(k as (typeof quoteFields)[number]),
    )
  )
    throw new QuoteInputError('quote', '报价仅允许录入指定商业字段。');
  const item = sourcing.items.find((i) => i.id === input.demandItemId);
  if (input.demandItemId !== null) {
    if (!item || item.demandId !== input.demandId || item.modelId !== c.modelId)
      throw new QuoteInputError(
        'demandItemId',
        '需求明细与渠道模型或主单不一致。',
      );
  } else if (
    input.demandId !== null &&
    !sourcing.items.some(
      (i) => i.demandId === input.demandId && i.modelId === c.modelId,
    )
  )
    throw new QuoteInputError('demandId', '需求不包含此渠道模型。');
  try {
    discountBps(input.discount);
  } catch (e) {
    throw new QuoteInputError(
      'discount',
      e instanceof Error ? e.message : '折扣无效',
    );
  }
  try {
    validatePriceSpec(input.priceSpec);
  } catch (e) {
    throw new QuoteInputError(
      'priceSpec',
      e instanceof Error ? e.message : '价格口径无效',
    );
  }
  if (
    !['reference', 'pending_contract', 'temporary'].includes(
      input.priceStatus,
    ) ||
    !Object.hasOwn(quoteSourceLabels, input.sourceType)
  )
    throw new QuoteInputError(
      'priceStatus',
      '新报价只能录入参考、待合同确认或临时优惠；正式价须单独确认。',
    );
  if (
    !quoteIso(input.effectiveFrom) ||
    !quoteIso(input.effectiveUntil) ||
    !quoteIso(input.supplierQuotedAt) ||
    (input.effectiveUntil !== null &&
      (!input.effectiveFrom ||
        Date.parse(input.effectiveUntil) <= Date.parse(input.effectiveFrom)))
  )
    throw new QuoteInputError(
      'effectiveUntil',
      '报价日期或有效期无效，截止时间须晚于生效时间。',
    );
  if (
    (input.priceStatus === 'temporary') !==
      (input.sourceType === 'promotion') &&
    input.sourceType !== 'correction'
  )
    throw new QuoteInputError('sourceType', '临时优惠状态须对应临时优惠来源。');
  if (
    input.sourceType === 'supplier_submission' &&
    (!input.supplierSubmitterReference ||
      !/^mock:/.test(input.supplierSubmitterReference))
  )
    throw new QuoteInputError(
      'supplierSubmitterReference',
      '手工转录供应商报价须保留 mock: 原始提交人引用。',
    );
  if (
    input.previousQuoteId !== null &&
    prior(input.previousQuoteId).channelId !== c.id
  )
    throw new QuoteInputError('previousQuoteId', '前序报价必须属于同一渠道。');
  const inquiry =
    input.inquiryId === null
      ? null
      : s.inquiries.find((i) => i.id === input.inquiryId);
  if (
    input.inquiryId !== null &&
    (!inquiry ||
      inquiry.channelId !== c.id ||
      inquiry.demandItemId !== input.demandItemId ||
      inquiry.status === 'closed')
  )
    throw new QuoteInputError('inquiryId', '询价关联不一致或已关闭。');
  if (inquiry && inquiry.version !== input.inquiryVersion)
    throw new QuoteInputError(
      'inquiryVersion',
      '询价版本已变化，请重新加载。',
      'CONFLICT',
    );
  const q: ManagedQuote = {
    source: 'mock',
    id,
    channelId: c.id,
    inquiryId: input.inquiryId,
    demandId: input.demandId,
    demandItemId: input.demandItemId,
    previousQuoteId: input.previousQuoteId,
    discount: input.discount,
    priceStatus: input.priceStatus,
    sourceType: input.sourceType,
    effectiveFrom: input.effectiveFrom,
    effectiveUntil: input.effectiveUntil,
    evidenceReference: quoteEvidence(input.evidenceReference),
    supplierSubmitterReference: input.supplierSubmitterReference,
    supplierQuotedAt: input.supplierQuotedAt,
    submittedBy: actorId,
    recordedBy: actorId,
    reason: quoteText(input.reason),
    confirmedBy: null,
    confirmedAt: null,
    createdAt: now,
    priceSpec: quoteSpec(input.priceSpec),
  };
  try {
    appendQuote(s.quotes, q);
  } catch (e) {
    throw new QuoteInputError(
      input.sourceType === 'correction' ? 'previousQuoteId' : 'quote',
      e instanceof Error ? e.message : '报价历史无效',
    );
  }
  return q;
}
