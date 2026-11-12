import type {
  BusinessDomain,
  Channel,
  ChannelQuote,
  DiscountBps,
  Model,
  ModelVendor,
  QualityExemption,
} from './entities';
export function discountBps(value: number): DiscountBps {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10000)
    throw new Error('Discount must be integer basis points in [0, 10000]');
  return value as DiscountBps;
}
export function modelDomain(
  model: Model,
  vendors: readonly ModelVendor[],
): BusinessDomain {
  const vendor = vendors.find((v) => v.id === model.vendorId);
  if (!vendor) throw new Error('Unknown model vendor');
  return vendor.businessDomain;
}
export function canExemptQuality(
  channel: Channel,
  records: readonly QualityExemption[],
): boolean {
  return (
    channel.channelType === 'official_direct' &&
    channel.sourceVerificationStatus === 'verified' &&
    records.some(
      (r) =>
        r.channelId === channel.id &&
        r.evidenceReference.trim().length > 0 &&
        r.verifiedBy.trim().length > 0 &&
        r.reason.trim().length > 0,
    )
  );
}
export function bindOpChannelId(
  channel: Channel,
  opChannelId: string,
  channels: readonly Channel[],
): Channel {
  const registered = channels.find((c) => c.id === channel.id);
  if (!registered) throw new Error('Channel not found in OP binding registry');
  if (
    !opChannelId.trim() ||
    (channel.opChannelId !== null && channel.opChannelId !== opChannelId) ||
    (registered.opChannelId !== null && registered.opChannelId !== opChannelId)
  )
    throw new Error('OP binding cannot be overwritten');
  if (
    channels.some((c) => c.id !== channel.id && c.opChannelId === opChannelId)
  )
    throw new Error('OP channel ID conflict: already bound to another channel');
  return { ...channel, opChannelId };
}
/** Immutable append only: corrections and commercial changes keep separate sourceType/reason. */
export function appendQuote(
  history: readonly ChannelQuote[],
  quote: ChannelQuote,
): readonly ChannelQuote[] {
  if (history.some((q) => q.id === quote.id))
    throw new Error('Quote ID already exists');
  discountBps(quote.discount);
  if (
    quote.previousQuoteId !== null &&
    !history.some(
      (q) => q.id === quote.previousQuoteId && q.channelId === quote.channelId,
    )
  )
    throw new Error('Unknown prior quote');
  if (
    quote.priceStatus === 'temporary' &&
    (!quote.effectiveFrom ||
      !quote.effectiveUntil ||
      !Number.isFinite(Date.parse(quote.effectiveFrom)) ||
      !Number.isFinite(Date.parse(quote.effectiveUntil)) ||
      Date.parse(quote.effectiveFrom) >= Date.parse(quote.effectiveUntil))
  )
    throw new Error('Promotion requires a bounded validity interval');
  if ((quote.confirmedBy === null) !== (quote.confirmedAt === null))
    throw new Error('Incomplete confirmation');
  if (
    quote.priceStatus === 'effective' &&
    (!quote.confirmedBy || !quote.confirmedAt || !quote.effectiveFrom)
  )
    throw new Error('Formal price requires confirmation');
  if (
    quote.sourceType === 'correction' &&
    (!quote.previousQuoteId || !quote.reason.trim())
  )
    throw new Error('Correction requires prior record and reason');
  return [...history, quote];
}
export function supplierCoverage(channels: readonly Channel[]): {
  supplierCount: number;
  shortfall: number;
} {
  const supplierCount = new Set(channels.map((c) => c.supplierId)).size;
  return { supplierCount, shortfall: Math.max(0, 3 - supplierCount) };
}
