import type { AnalyticsQuery } from '../domain/procurement-analytics';
import type { createAnalysis } from './procurement-analytics';
export interface ProcurementAnalyticsApi {
  queryProcurementAnalytics(
    query?: AnalyticsQuery,
  ): Promise<ReturnType<typeof createAnalysis>>;
}
