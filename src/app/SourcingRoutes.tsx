import { lazy, Suspense } from 'react';
import { Result } from 'antd';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { DemoSession } from '../services/demo-session';
import { LoadingState } from '../components/FeedbackStates';
import '../features/sourcing/sourcing.css';
const SourcingList = lazy(
  () => import('../features/sourcing/SourcingListPage'),
);
const SourcingDetail = lazy(
  () => import('../features/sourcing/SourcingDetailPage'),
);
export function SourcingRoute() {
  const session = useOutletContext<DemoSession>();
  const { demandId } = useParams();
  if (!session.permits('sourcing:read'))
    return (
      <Result
        status="403"
        title="当前演示身份无内部采购寻源访问权限"
        extra={<Link to="/dashboard">返回工作台</Link>}
      />
    );
  return (
    <Suspense fallback={<LoadingState />}>
      {demandId ? <SourcingDetail key={demandId} /> : <SourcingList />}
    </Suspense>
  );
}
