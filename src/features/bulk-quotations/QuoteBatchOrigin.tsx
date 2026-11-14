import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import { useResourceQuery } from '../models/use-resource-query';
export function QuoteBatchOrigin({
  session,
  quoteId,
}: {
  session: DemoSession;
  quoteId: string;
}) {
  const load = useCallback(
    () => session.api.getBulkQuoteOrigin(quoteId),
    [session.api, quoteId],
  );
  const { result } = useResourceQuery(load);
  return result.status === 'ready' && result.data ? (
    <p className="quote-wrap">
      来源报价批次：
      <Link to={`/procurement/bulk-quotes/${result.data.batchId}`}>
        {result.data.batchNo}
      </Link>{' '}
      · 报价行 {result.data.itemId}
    </p>
  ) : null;
}
