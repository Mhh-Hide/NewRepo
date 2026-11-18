/** Customer-facing commercial context stays restricted to authorized customer roles. */
export const demandBusinessFields = [
  'salesOwnerId',
  'operationsOwnerId',
  'monthlyUsage',
  'usageCurrency',
  'cooperationForm',
  'targetDiscountRange',
  'customerNote',
  'salesFeedback',
] as const;
export type DemandBusinessField = (typeof demandBusinessFields)[number];
export type DemandBusinessFields = Partial<
  Record<DemandBusinessField, string | null>
>;
export const itemBusinessFields = [
  'cacheRequirement',
  'expectedUsage',
  'qualityRequirements',
] as const;
export type ItemBusinessFields = Partial<
  Record<(typeof itemBusinessFields)[number], string | null>
>;
