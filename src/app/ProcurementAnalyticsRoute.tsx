import { lazy, Suspense } from 'react';
import { Result } from 'antd';
import { Link, useOutletContext } from 'react-router-dom';
import type { DemoSession } from '../services/demo-session';
import { LoadingState } from '../components/FeedbackStates';
const Page = lazy(
  () => import('../features/procurement-analytics/ProcurementAnalyticsPage'),
);
export function ProcurementAnalyticsRoute() {
  const session = useOutletContext<DemoSession>();
  if (!session.permits('quote:read'))
    return (
      <Result
        status="403"
        title="当前身份无采购价格分析权限"
        extra={<Link to="/dashboard">返回工作台</Link>}
      />
    );
  return (
    <Suspense fallback={<LoadingState />}>
      <Page />
    </Suspense>
  );
}
