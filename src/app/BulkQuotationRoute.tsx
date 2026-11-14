import { lazy, Suspense } from 'react';
import { Result } from 'antd';
import { useOutletContext } from 'react-router-dom';
import type { DemoSession } from '../services/demo-session';
import { LoadingState } from '../components/FeedbackStates';
import '../features/quotes/quotes.css';
const Page = lazy(() => import('../features/bulk-quotations/BulkQuotesPage'));
export function BulkQuotationRoute() {
  const session = useOutletContext<DemoSession>();
  if (!session.permits('bulk:read'))
    return <Result status="403" title="当前身份无批量采购报价访问权限" />;
  return (
    <Suspense fallback={<LoadingState />}>
      <Page />
    </Suspense>
  );
}
