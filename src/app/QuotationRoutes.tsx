import { lazy, Suspense } from 'react';
import { Result } from 'antd';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { DemoSession } from '../services/demo-session';
import { LoadingState } from '../components/FeedbackStates';
import '../features/quotes/quotes.css';
const List = lazy(() => import('../features/quotes/QuoteListPage'));
const Detail = lazy(() => import('../features/quotes/QuoteDetailPage'));
export function QuotationRoute() {
  const session = useOutletContext<DemoSession>();
  const { quoteId } = useParams();
  if (!session.permits('quote:read'))
    return (
      <Result
        status="403"
        title="当前身份无采购报价访问权限"
        extra={<Link to="/dashboard">返回工作台</Link>}
      />
    );
  return (
    <Suspense fallback={<LoadingState />}>
      {quoteId ? <Detail key={quoteId} /> : <List />}
    </Suspense>
  );
}
