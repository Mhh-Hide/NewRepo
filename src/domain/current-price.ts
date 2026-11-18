import type { ManagedQuote } from './quotations';
const newest = <T extends { quote: ManagedQuote }>(items: readonly T[]) =>
  [...items].sort(
    (a, b) =>
      (b.quote.effectiveFrom ?? '').localeCompare(
        a.quote.effectiveFrom ?? '',
      ) ||
      b.quote.createdAt.localeCompare(a.quote.createdAt) ||
      b.quote.id.localeCompare(a.quote.id),
  )[0] ?? null;
const started = (q: ManagedQuote, now: number) =>
  q.effectiveFrom !== null && Date.parse(q.effectiveFrom) <= now;
const notEnded = (q: ManagedQuote, now: number) =>
  q.effectiveUntil === null || now < Date.parse(q.effectiveUntil);
const formal = (q: ManagedQuote) =>
  ['effective', 'expired'].includes(q.priceStatus) &&
  q.confirmedBy !== null &&
  q.confirmedAt !== null;
/** A later formal version replaces its predecessor permanently. Only promotions fall back. */
export function selectCurrentPrice<T extends { quote: ManagedQuote }>(
  rows: readonly T[],
  now = Date.now(),
): T | null {
  const promotion = newest(
    rows.filter(
      ({ quote: q }) =>
        q.priceStatus === 'temporary' && started(q, now) && notEnded(q, now),
    ),
  );
  if (promotion) return promotion;
  const latestFormal = newest(
    rows.filter(({ quote: q }) => formal(q) && started(q, now)),
  );
  return latestFormal &&
    latestFormal.quote.priceStatus === 'effective' &&
    notEnded(latestFormal.quote, now)
    ? latestFormal
    : null;
}
export function currentChannelRows<T extends { quote: ManagedQuote }>(
  rows: readonly T[],
  now = Date.now(),
): T[] {
  const groups = new Map<string, T[]>();
  for (const r of rows)
    groups.set(r.quote.channelId, [
      ...(groups.get(r.quote.channelId) ?? []),
      r,
    ]);
  return [...groups.values()].map(
    (items) =>
      selectCurrentPrice(items, now) ??
      [...items].sort(
        (a, b) =>
          b.quote.createdAt.localeCompare(a.quote.createdAt) ||
          b.quote.id.localeCompare(a.quote.id),
      )[0]!,
  );
}
export function applicableDiscount(
  q: ManagedQuote,
  now = Date.now(),
): number | null {
  return selectCurrentPrice([{ quote: q }], now)?.quote.discount ?? null;
}
/** Derived historical intervals; immutable source records and evidence stay untouched. */
export function priceHistoryEnd(
  q: ManagedQuote,
  quotes: readonly ManagedQuote[],
): string | null {
  if (!formal(q)) return q.effectiveUntil;
  const next = quotes
    .filter(
      (v) =>
        v.channelId === q.channelId &&
        formal(v) &&
        v.effectiveFrom !== null &&
        q.effectiveFrom !== null &&
        Date.parse(v.effectiveFrom) > Date.parse(q.effectiveFrom),
    )
    .sort((a, b) =>
      a.effectiveFrom!.localeCompare(b.effectiveFrom!),
    )[0]?.effectiveFrom;
  return next &&
    (!q.effectiveUntil || Date.parse(next) < Date.parse(q.effectiveUntil))
    ? next
    : q.effectiveUntil;
}
