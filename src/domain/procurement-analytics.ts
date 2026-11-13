import type { ManagedQuote, PriceSpec, InquiryRecord } from './quotations';
import {
  dimensionLabels,
  basisDifferences,
  compareQuotes,
  validatePriceSpec,
} from './quotations';
export const analyticsWeek = 7 * 86400000;
export const timestamp = (value: string | null): number | null => {
  if (value === null) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
};
export type AnalysisQuote = Pick<
  ManagedQuote,
  | 'id'
  | 'channelId'
  | 'discount'
  | 'priceStatus'
  | 'sourceType'
  | 'createdAt'
  | 'supplierQuotedAt'
  | 'effectiveFrom'
  | 'effectiveUntil'
  | 'previousQuoteId'
  | 'priceSpec'
  | 'demandItemId'
  | 'demandId'
  | 'confirmedAt'
  | 'confirmedBy'
>;
export interface AnalysisRecord {
  readonly quote: AnalysisQuote;
  readonly recordedStatus: ManagedQuote['priceStatus'];
  readonly verified: boolean;
  readonly channel: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly supplier: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly model: { readonly id: string; readonly name: string };
  readonly vendor: {
    readonly id: string;
    readonly name: string;
    readonly domain: 'domestic' | 'overseas';
  };
}
export type AnalysisInquiry = Pick<
  InquiryRecord,
  'id' | 'channelId' | 'status' | 'requestedAt' | 'responseDueAt'
>;
export interface AnalysisTarget {
  readonly id: string;
  readonly demandId: string;
  readonly modelId: string;
  readonly label: string;
  readonly discount: number;
}
export interface AnalyticsQuery {
  readonly modelId?: string;
  readonly channelId?: string;
  readonly supplierId?: string;
  readonly vendorId?: string;
  readonly status?: ManagedQuote['priceStatus'];
  readonly currency?: string;
  readonly createdFrom?: string;
  readonly createdTo?: string;
}
/** Structural interval validation is independent of the clock, including for historical trends. */
function invalidValidityPeriod(q: AnalysisQuote) {
  const start = timestamp(q.effectiveFrom),
    end = timestamp(q.effectiveUntil);
  return (
    (q.effectiveFrom !== null && start === null) ||
    (q.effectiveUntil !== null && end === null) ||
    (start !== null && end !== null && end <= start)
  );
}
export function analysisValidity(q: AnalysisQuote, now: number) {
  if (!Number.isFinite(now)) throw Error('查询时刻必须为有效时间戳。');
  const start = timestamp(q.effectiveFrom),
    end = timestamp(q.effectiveUntil);
  if (invalidValidityPeriod(q)) return 'invalid' as const;
  if (q.priceStatus === 'expired' || (end !== null && end <= now))
    return 'expired' as const;
  if (start !== null && start > now) return 'scheduled' as const;
  return start === null ? ('unspecified' as const) : ('in_period' as const);
}
export function isConfirmedFormal(q: AnalysisQuote) {
  return (
    q.priceStatus === 'effective' &&
    !!q.confirmedBy &&
    timestamp(q.confirmedAt) !== null
  );
}
export function isCurrentFormal(q: AnalysisQuote, now: number) {
  return isConfirmedFormal(q) && analysisValidity(q, now) === 'in_period';
}
export function completeness(spec: PriceSpec): readonly string[] {
  try {
    validatePriceSpec(spec);
  } catch {
    return ['价格规格异常，无法比较'];
  }
  return basisDifferences(spec, spec);
}
export function compareAnalysis(
  a: AnalysisRecord,
  b: AnalysisRecord,
  now: number,
) {
  const first = analysisValidity(a.quote, now),
    second = analysisValidity(b.quote, now);
  const issues = [
    ...completeness(a.quote.priceSpec),
    ...completeness(b.quote.priceSpec),
  ];
  const specComparable =
    !issues.length &&
    a.model.id === b.model.id &&
    !basisDifferences(a.quote.priceSpec, b.quote.priceSpec).length;
  if (first === 'invalid' || second === 'invalid')
    issues.push('有效期异常，无法比较');
  const comparison = issues.length
    ? {
        comparable: false,
        reasons: [...new Set(issues)],
        discountDifferenceBps: null,
        rates: [],
      }
    : compareQuotes(a.quote, b.quote, a.model.id, b.model.id);
  return {
    ...comparison,
    specComparable,
    currentValidity: {
      first,
      second,
      bothInPeriod: first === 'in_period' && second === 'in_period',
    },
    procurementNotice:
      '历史口径可比不等于当前可执行采购价格；时间有效也不替代正式依据与渠道准入核实。',
  };
}
const dateDay = (s: string) =>
  timestamp(s) === null
    ? null
    : new Date(s).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
export function filterAnalysis(
  records: readonly AnalysisRecord[],
  query: AnalyticsQuery,
  now: number,
) {
  return records.filter((r) => {
    const day = dateDay(r.quote.createdAt);
    return (
      (!query.modelId || r.model.id === query.modelId) &&
      (!query.channelId || r.channel.id === query.channelId) &&
      (!query.supplierId || r.supplier.id === query.supplierId) &&
      (!query.vendorId || r.vendor.id === query.vendorId) &&
      (!query.currency || r.quote.priceSpec.currency === query.currency) &&
      (!query.status ||
        (query.status === 'expired'
          ? analysisValidity(r.quote, now) === 'expired'
          : r.quote.priceStatus === query.status)) &&
      (!query.createdFrom || (day !== null && day >= query.createdFrom)) &&
      (!query.createdTo || (day !== null && day <= query.createdTo))
    );
  });
}
export function summarizeAnalysis(
  records: readonly AnalysisRecord[],
  inquiries: readonly AnalysisInquiry[],
  now: number,
) {
  const validity = (r: AnalysisRecord) => analysisValidity(r.quote, now);
  const formal = records.filter((r) => isCurrentFormal(r.quote, now));
  const promotions = records.filter((r) => r.quote.priceStatus === 'temporary');
  const active = promotions.filter((r) => validity(r) === 'in_period');
  const expiring = active.filter((r) => {
    const end = timestamp(r.quote.effectiveUntil);
    return end !== null && end > now && end <= now + analyticsWeek;
  });
  const pending = inquiries.filter((i) => i.status === 'sent');
  const missingUnits = (r: AnalysisRecord) =>
    !r.quote.priceSpec.currency ||
    !r.quote.priceSpec.rates.length ||
    r.quote.priceSpec.rates.some((s) => !s.unit.trim());
  return {
    models: new Set(records.map((r) => r.model.id)).size,
    channels: new Set(records.map((r) => r.channel.id)).size,
    suppliers: new Set(records.map((r) => r.supplier.id)).size,
    formalChannels: new Set(
      records
        .filter((r) => isConfirmedFormal(r.quote))
        .map((r) => r.channel.id),
    ).size,
    promotionChannels: new Set(promotions.map((r) => r.channel.id)).size,
    incomplete: records.filter(missingUnits).length,
    incomparable: records.filter(
      (r) => completeness(r.quote.priceSpec).length > 0,
    ).length,
    reference: records.filter(
      (r) =>
        r.quote.priceStatus === 'reference' &&
        !['expired', 'invalid'].includes(validity(r)),
    ).length,
    pending: records.filter(
      (r) =>
        r.quote.priceStatus === 'pending_contract' &&
        !['expired', 'invalid'].includes(validity(r)),
    ).length,
    effective: formal.length,
    temporary: active.length,
    expired: records.filter((r) => validity(r) === 'expired').length,
    scheduled: records.filter((r) => validity(r) === 'scheduled').length,
    expiring: expiring.length,
    newChannels: new Set(
      records
        .filter((r) => {
          const at = timestamp(r.quote.createdAt);
          return at !== null && at >= now - analyticsWeek && at <= now;
        })
        .map((r) => r.channel.id),
    ).size,
    inquiry: {
      initiated: inquiries.filter(
        (i) => i.status === 'sent' || i.status === 'quoted',
      ).length,
      draft: inquiries.filter((i) => i.status === 'draft').length,
      pending: pending.length,
      received: inquiries.filter((i) => i.status === 'quoted').length,
      closed: inquiries.filter((i) => i.status === 'closed').length,
      overdue: pending.filter((i) => {
        const end = timestamp(i.responseDueAt);
        return end !== null && end < now;
      }).length,
      responseHours: null,
    },
  };
}
export function channelPriceViews(
  records: readonly AnalysisRecord[],
  now: number,
) {
  const ids = [...new Set(records.map((r) => r.channel.id))];
  return ids.map((id) => {
    const values = records
      .filter((r) => r.channel.id === id)
      .sort(
        (a, b) =>
          (timestamp(b.quote.createdAt) ?? -Infinity) -
            (timestamp(a.quote.createdAt) ?? -Infinity) ||
          a.quote.id.localeCompare(b.quote.id),
      );
    return {
      channelId: id,
      latest: values.find((r) => timestamp(r.quote.createdAt) !== null) ?? null,
      // Latest confirmed history can be expired or scheduled; never a current-price fallback.
      latestFormal: values.find((r) => isConfirmedFormal(r.quote)) ?? null,
      activeFormals: values.filter((r) => isCurrentFormal(r.quote, now)),
      activePromotions: values.filter(
        (r) =>
          r.quote.priceStatus === 'temporary' &&
          analysisValidity(r.quote, now) === 'in_period',
      ),
      records: values,
    };
  });
}
export function targetDifferences(
  records: readonly AnalysisRecord[],
  targets: readonly AnalysisTarget[],
) {
  return records.flatMap((r) => {
    const target = targets.find(
      (t) =>
        t.id === r.quote.demandItemId &&
        t.demandId === r.quote.demandId &&
        t.modelId === r.model.id,
    );
    return target
      ? [
          {
            quoteId: r.quote.id,
            channel: r.channel.name,
            target,
            quotedDiscount: r.quote.discount,
            numericDifferenceBps: r.quote.discount - target.discount,
            commerciallyComparable: false as const,
            verifiedAchieved: null,
            reason:
              '同基准可比性未确认：采购目标未记录价格基准、适用规格与折扣口径；数字差不代表达成或节约。',
          },
        ]
      : [];
  });
}
export function buildChannelTrend(
  records: readonly AnalysisRecord[],
  channelId: string,
  axis: 'created' | 'supplier' = 'created',
) {
  const selected = records.filter((r) => r.channel.id === channelId);
  const issues: string[] = [];
  const groups = new Map<
    string,
    {
      label: string;
      points: { record: AnalysisRecord; at: string; correction: boolean }[];
    }
  >();
  for (const r of selected) {
    const at =
      axis === 'created' ? r.quote.createdAt : r.quote.supplierQuotedAt;
    if (timestamp(at) === null) {
      issues.push(
        `${r.quote.id}：${axis === 'created' ? '创建时间异常' : '供应商报价时间缺失或异常'}，未绘点`,
      );
      continue;
    }
    if (invalidValidityPeriod(r.quote)) {
      issues.push(`${r.quote.id}：有效期异常，未绘制可比趋势点`);
      continue;
    }
    const missing = completeness(r.quote.priceSpec);
    if (missing.length) {
      issues.push(`${r.quote.id}：信息不足，无法比较（${missing.join('；')}）`);
      continue;
    }
    const p = r.quote.priceSpec;
    const key = JSON.stringify([
      p.currency,
      p.referencePriceSource,
      p.specification,
      p.rates.map((v) => [v.dimension, v.quantity, v.unit]).sort(),
      r.recordedStatus,
    ]);
    const group = groups.get(key) ?? {
      label: `${p.currency} · ${p.referencePriceSource} · ${p.specification} · ${p.rates.map((v) => `${dimensionLabels[v.dimension]} ${v.quantity} ${v.unit}`).join(' / ')} · ${r.recordedStatus}`,
      points: [],
    };
    group.points.push({
      record: r,
      at: at!,
      correction: r.quote.sourceType === 'correction',
    });
    groups.set(key, group);
  }
  const series = [...groups.values()].map((g) => ({
    ...g,
    points: g.points.sort(
      (a, b) =>
        Date.parse(a.at) - Date.parse(b.at) ||
        a.record.quote.id.localeCompare(b.record.quote.id),
    ),
  }));
  if (!selected.length) issues.push('当前筛选范围内该渠道没有报价历史。');
  if (!series.some((g) => g.points.filter((p) => !p.correction).length >= 2))
    issues.push('没有至少两条同口径的非纠错记录，不绘制连续调价线。');
  return {
    channelId,
    axis,
    series,
    issues,
    priceEvents: selected.filter((r) => r.quote.sourceType !== 'correction')
      .length,
    corrections: selected.filter((r) => r.quote.sourceType === 'correction')
      .length,
  };
}
