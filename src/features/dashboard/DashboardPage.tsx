import { WorkInbox } from '../lifecycle/WorkInbox';
import { Button, Card, Table } from 'antd';
import { ReloadOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { Link, useOutletContext } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import { PageHeader } from '../../components/PageHeader';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/FeedbackStates';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import { navigation } from '../../app/navigation';
import { useDashboard } from './use-dashboard';
export function DashboardRoute() {
  const session = useOutletContext<DemoSession>();
  return <DashboardPage session={session} />;
}
export function DashboardPage({ session }: { session: DemoSession }) {
  const { result, reload } = useDashboard(session);
  const header = (
    <PageHeader
      title="工作台"
      description="今天有哪些事情需要推进"
      group="运营总览"
      actions={
        <Button icon={<ReloadOutlined />} onClick={reload}>
          刷新数据
        </Button>
      }
    />
  );
  if (result.status === 'loading')
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  if (result.status === 'error')
    return (
      <>
        {header}
        <ErrorState onRetry={reload} />
      </>
    );
  const d = result.data;
  if (d.isEmpty)
    return (
      <>
        {header}
        <Card>
          <EmptyState description="暂无待处理业务" />
        </Card>
      </>
    );
  const priorities = [
    'channels',
    session.permits('quote:read') ? 'gaps' : 'quality',
    'remediations',
    'incidents',
    'demands',
    'models',
  ];
  const metrics = priorities
    .flatMap((id) => d.metrics.filter((m) => m.id === id))
    .slice(0, 4);
  const entries = navigation.filter(
    (n) =>
      [
        'channels',
        'sourcing',
        'tests',
        'remediations',
        'suppliers',
        'quotes',
      ].includes(n.id) &&
      (n.permission === null || session.permits(n.permission)),
  );
  const attention = d.channels.filter(
    (c) => c.quality.includes('失败') || c.connectivity.includes('失败'),
  );
  return (
    <>
      {header}
      <section className="stats-grid home-stats" aria-label="业务概况">
        {metrics.map((metric) => (
          <StatCard key={metric.id} metric={metric} />
        ))}
      </section>
      <WorkInbox
        session={session}
        compact
        fallback={
          <ul className="business-list">
            {d.todos
              .filter((t) => t.count > 0)
              .slice(0, 5)
              .map((t) => (
                <li key={t.label}>
                  <Link to={t.path}>{t.label}</Link>
                  <strong>{t.count}</strong>
                </li>
              ))}
          </ul>
        }
      />
      <Card
        title="需要关注的渠道"
        className="resource-card"
        extra={
          <Link to="/channels">
            全部渠道 <ArrowRightOutlined />
          </Link>
        }
      >
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={attention.slice(0, 3)}
          scroll={{ x: 600 }}
          columns={[
            { title: '模型', dataIndex: 'model' },
            {
              title: '渠道',
              dataIndex: 'name',
              render: (name: string, r: (typeof d.channels)[number]) => (
                <Link to={`/channels?delivery=${encodeURIComponent(r.id)}`}>
                  {name}
                </Link>
              ),
            },
            {
              title: '质量测试',
              dataIndex: 'quality',
              render: (s: string) => <StatusBadge label={s} />,
            },
            {
              title: '连通性',
              dataIndex: 'connectivity',
              render: (s: string) => <StatusBadge label={s} />,
            },
          ]}
          locale={{
            emptyText: <EmptyState description="暂无需要关注的异常渠道" />,
          }}
        />
      </Card>
      <section className="module-grid" aria-label="常用模块">
        {entries.map((n) => (
          <Link className="module-link" key={n.id} to={n.path}>
            <span>
              {n.icon} {n.name}
            </span>
            <ArrowRightOutlined />
          </Link>
        ))}
      </section>
    </>
  );
}
