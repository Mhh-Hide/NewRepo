import type { AccessContext } from '../auth/types';
import { can } from '../auth/policy';
import type { ProcurementAnalyticsApi } from './procurement-analytics-types';
import type { QuotationApi, QuoteOptions, QuoteRow } from './quotation-types';
import { SupplierError } from './supplier-types';
import {
  analysisValidity,
  analyticsWeek,
  channelPriceViews,
  completeness,
  filterAnalysis,
  summarizeAnalysis,
  targetDifferences,
  timestamp,
} from '../domain/procurement-analytics';
import type {
  AnalysisRecord,
  AnalyticsQuery,
} from '../domain/procurement-analytics';
/** A dedicated allowlist: no evidence, contact details, text notes or snapshots. */
export function projectAnalysisRecord(r: QuoteRow): AnalysisRecord {
  const q = r.quote;
  return {
    quote: {
      id: q.id,
      channelId: q.channelId,
      discount: q.discount,
      priceStatus: q.priceStatus,
      sourceType: q.sourceType,
      createdAt: q.createdAt,
      supplierQuotedAt: q.supplierQuotedAt,
      effectiveFrom: q.effectiveFrom,
      effectiveUntil: q.effectiveUntil,
      previousQuoteId: q.previousQuoteId,
      demandId: q.demandId,
      demandItemId: q.demandItemId,
      confirmedBy: q.confirmedBy,
      confirmedAt: q.confirmedAt,
      priceSpec: {
        currency: q.priceSpec.currency,
        referencePriceSource: q.priceSpec.referencePriceSource,
        specification: q.priceSpec.specification,
        rates: q.priceSpec.rates.map((v) => ({
          dimension: v.dimension,
          quantity: v.quantity,
          unit: v.unit,
          amount: v.amount,
        })),
      },
    },
    recordedStatus: r.storedPriceStatus,
    verified: r.verified,
    channel: {
      id: r.channel.id,
      name: r.channel.displayName,
      status: r.channel.resourceStatus,
    },
    supplier: {
      id: r.supplier.id,
      name: r.supplier.name,
      status: r.supplier.status,
    },
    model: { id: r.model.id, name: r.model.name },
    vendor: {
      id: r.vendor.id,
      name: r.vendor.name,
      domain: r.vendor.businessDomain,
    },
  };
}
export function createAnalysis(
  rows: readonly QuoteRow[],
  options: QuoteOptions,
  query: AnalyticsQuery,
  now: number,
) {
  const all = rows.map(projectAnalysisRecord);
  const records = filterAnalysis(all, query, now);
  const channels = options.channels.filter(
    (r) =>
      (!query.channelId || r.channel.id === query.channelId) &&
      (!query.modelId || r.model.id === query.modelId) &&
      (!query.supplierId || r.supplier.id === query.supplierId) &&
      (!query.vendorId || r.model.vendorId === query.vendorId),
  );
  const ids = new Set(channels.map((r) => r.channel.id));
  const inquiries = options.inquiries
    .filter((i) => ids.has(i.channelId))
    .map((i) => ({
      id: i.id,
      channelId: i.channelId,
      status: i.status,
      requestedAt: i.requestedAt,
      responseDueAt: i.responseDueAt,
    }));
  const stats = summarizeAnalysis(records, inquiries, now);
  const unique = <T extends { id: string }>(values: readonly T[]) => [
    ...new Map(values.map((v) => [v.id, v])).values(),
  ];
  const warnings = records.flatMap((r) => {
    const reasons = [...completeness(r.quote.priceSpec)];
    if (analysisValidity(r.quote, now) === 'invalid')
      reasons.push('有效期异常，不计当前生效');
    if (timestamp(r.quote.createdAt) === null)
      reasons.push('创建日期异常，不计近期新增或绘图');
    if (r.channel.status === 'disabled')
      reasons.push('渠道已停用，保留历史，不代表允许新采购');
    return reasons.length
      ? [{ quoteId: r.quote.id, channel: r.channel.name, reasons }]
      : [];
  });
  return {
    source: 'mock' as const,
    asOf: new Date(now).toISOString(),
    expiryWindow: {
      fromExclusive: new Date(now).toISOString(),
      toInclusive: new Date(now + analyticsWeek).toISOString(),
      timezone: 'Asia/Shanghai',
    },
    stats,
    records,
    inquiries,
    options: {
      models: unique(
        options.channels.map((r) => ({ id: r.model.id, name: r.model.name })),
      ),
      suppliers: unique(all.map((r) => r.supplier)),
      vendors: unique(all.map((r) => r.vendor)),
      channels: options.channels.map((r) => ({
        id: r.channel.id,
        name: r.channel.displayName,
        modelId: r.model.id,
      })),
      currencies: [
        ...new Set(
          all
            .map((r) => r.quote.priceSpec.currency)
            .filter((c): c is string => c !== null),
        ),
      ],
    },
    channelPrices: channelPriceViews(records).map((c) => ({
      ...c,
      activePromotions: c.records.filter(
        (r) =>
          r.quote.priceStatus === 'temporary' &&
          analysisValidity(r.quote, now) === 'in_period',
      ),
    })),
    promotions: records
      .filter((r) => r.quote.priceStatus === 'temporary')
      .map((r) => ({
        record: r,
        validity: analysisValidity(r.quote, now),
        expiring:
          analysisValidity(r.quote, now) === 'in_period' &&
          timestamp(r.quote.effectiveUntil) !== null &&
          timestamp(r.quote.effectiveUntil)! <= now + analyticsWeek,
        formalExists: all.some(
          (a) =>
            a.channel.id === r.channel.id &&
            a.quote.priceStatus === 'effective',
        ),
      })),
    targets: targetDifferences(
      records,
      options.demands.map((t) => ({
        id: t.id,
        demandId: t.demandId,
        modelId: t.modelId,
        label: t.label,
        discount: t.targetPurchaseDiscount,
      })),
    ),
    verifiedTargetRate: null,
    warnings,
  };
}
export type ProcurementAnalysis = ReturnType<typeof createAnalysis>;
/** Aggregate existing authorized readers; no fixture, storage writes or second price cache. */
export function createProcurementAnalyticsApi(
  ctx: AccessContext | null,
  active: () => boolean,
  api: QuotationApi,
): ProcurementAnalyticsApi {
  return {
    async queryProcurementAnalytics(query = {}) {
      if (!ctx || !active() || !ctx.domains.length || !can(ctx, 'quote:read'))
        throw new SupplierError('FORBIDDEN', '当前身份无采购价格分析权限。');
      const allowed = [
        'modelId',
        'channelId',
        'supplierId',
        'vendorId',
        'status',
        'currency',
        'createdFrom',
        'createdTo',
      ];
      if (
        Object.keys(query).some((k) => !allowed.includes(k)) ||
        [query.createdFrom, query.createdTo].some(
          (d) =>
            d !== undefined &&
            (!/^\d{4}-\d{2}-\d{2}$/.test(d) ||
              timestamp(d) === null ||
              new Date(d).toISOString().slice(0, 10) !== d),
        ) ||
        (query.createdFrom &&
          query.createdTo &&
          query.createdFrom > query.createdTo)
      )
        throw new SupplierError(
          'VALIDATION',
          '分析筛选字段或北京时间日期范围无效。',
        );
      const options = await api.quoteOptions();
      const rows: QuoteRow[] = [];
      for (let page = 1; ; page++) {
        const result = await api.queryQuotes({ page, pageSize: 50 });
        rows.push(...result.rows);
        if (page * 50 >= result.total) break;
      }
      return structuredClone(createAnalysis(rows, options, query, Date.now()));
    },
  };
}
