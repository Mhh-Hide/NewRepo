import { Button, Card, Table, Tag, Typography } from 'antd';
import { ReloadOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { Link, useOutletContext } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import { roleLabels } from '../../auth/types';
import { PageHeader } from '../../components/PageHeader';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/FeedbackStates';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import { useDashboard } from './use-dashboard';
import type { DashboardData } from './types';
export function DashboardRoute() {
  const session = useOutletContext<DemoSession>();
  return <DashboardPage session={session} />;
}
export function DashboardPage({ session }: { session: DemoSession }) {
  const { result, reload } = useDashboard(session);
  const header = (
    <PageHeader
      title="工作台"
      description={`${roleLabels[session.profile.user.role]}视角 · 授权资源与业务协作概览`}
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
          <EmptyState description="当前演示身份及业务域暂无授权数据" />
        </Card>
      </>
    );
  return (
    <>
      {header}
      <div className="section-kicker">
        当前授权范围 <span>各指标来自模拟业务记录，非实时监控数据</span>
      </div>
      <section className="stats-grid" aria-label="授权范围统计">
        {d.metrics.map((metric) => (
          <StatCard key={metric.id} metric={metric} />
        ))}
      </section>
      <div className="dashboard-middle">
        <Card
          title="资源状态概览"
          extra={<Tag>独立状态维度</Tag>}
          className="dimension-card"
        >
          <p className="section-note">
            各维度分别统计，不代表连续漏斗或上线准入结论。
          </p>
          <div className="dimensions">
            {d.dimensions.map((dim) => (
              <section className="dimension" key={dim.name}>
                <div className="dimension-heading">
                  <strong>{dim.name}</strong>
                  <small>按{dim.basis}计数</small>
                </div>
                {dim.counts.map((c) => (
                  <div className="dimension-row" key={c.label}>
                    <span>{c.label}</span>
                    <b>{c.value}</b>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </Card>
        <Card title="我的待办" extra={<Tag>只读</Tag>}>
          <p className="section-note">
            按角色授权范围汇总，不代表任务认领或审批。
          </p>
          {d.todos.length ? (
            <ul className="business-list">
              {d.todos.map((todo) => (
                <li key={todo.label}>
                  <div>
                    <span className="todo-count">{todo.count}</span>
                    {todo.label}
                  </div>
                  <Link to={todo.path} aria-label={`${todo.label}开发计划`}>
                    <ArrowRightOutlined />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState description="当前范围暂无待处理事项" />
          )}
        </Card>
      </div>
      <div className="dashboard-bottom">
        <Card
          title="渠道资源速览"
          extra={
            <Link to="/channels">
              查看开发计划 <ArrowRightOutlined />
            </Link>
          }
        >
          <Table
            size="small"
            rowKey="id"
            pagination={{ pageSize: 5, hideOnSinglePage: true }}
            scroll={{ x: 720 }}
            dataSource={[...d.channels]}
            columns={[
              { title: '资源渠道', dataIndex: 'name', key: 'name', width: 180 },
              {
                title: '模型与能力',
                dataIndex: 'model',
                key: 'model',
                render: (
                  name: string,
                  c: DashboardData['channels'][number],
                ) => (
                  <div>
                    {name}
                    <small className="resource-capacity">
                      TPM{' '}
                      {c.tpm === null ? '未知' : c.tpm.toLocaleString('zh-CN')}{' '}
                      · RPM{' '}
                      {c.rpm === null ? '未知' : c.rpm.toLocaleString('zh-CN')}
                    </small>
                  </div>
                ),
              },
              ...(session.permits('supplier:read')
                ? [
                    {
                      title: '供应商',
                      dataIndex: 'supplierName',
                      key: 'supplierName',
                    },
                  ]
                : []),
              {
                title: '质量测试',
                dataIndex: 'quality',
                key: 'quality',
                render: (label: string) => <StatusBadge label={label} />,
              },
              {
                title: '连通性',
                dataIndex: 'connectivity',
                key: 'connectivity',
                render: (label: string) => <StatusBadge label={label} />,
              },
            ]}
            locale={{ emptyText: <EmptyState /> }}
          />
        </Card>
        <Card title="最近活动" extra={<Tag>授权记录摘要</Tag>}>
          <p className="section-note">
            每类展示最近一条记录，不包含受限审计快照。
          </p>
          {d.activities.length ? (
            <ul className="business-list activity-list">
              {d.activities.map((activity) => (
                <li key={activity.id}>
                  <div>
                    <Tag>{activity.kind}</Tag>
                    <span>{activity.title}</span>
                    <small>
                      {new Date(activity.occurredAt).toLocaleString('zh-CN', {
                        timeZone: 'Asia/Shanghai',
                        hour12: false,
                      })}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState description="当前范围暂无可展示活动" />
          )}
        </Card>
      </div>
      {session.permits('supplier:read') && (
        <Card
          title="供应商速览"
          className="lower-card"
          extra={<Link to="/suppliers">即将开放 · 查看计划</Link>}
        >
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={[...d.suppliers].slice(0, 5)}
            scroll={{ x: 450 }}
            columns={[
              { title: '供应商名称（模拟）', dataIndex: 'name' },
              { title: '缩写', dataIndex: 'shortCode' },
              {
                title: '状态',
                dataIndex: 'status',
                render: (s: string) => (
                  <StatusBadge label={s === 'enabled' ? '启用' : '停用'} />
                ),
              },
            ]}
            locale={{ emptyText: <EmptyState /> }}
          />
        </Card>
      )}
      {session.permits('quote:read') && (
        <Card
          title="采购报价摘要"
          className="lower-card"
          extra={<Link to="/analytics/procurement">查看采购价格分析</Link>}
        >
          <Typography.Paragraph type="secondary">
            历史记录仅供演示，不代表当前结算价或真实商业合作。
          </Typography.Paragraph>
          <Table
            size="small"
            rowKey="id"
            pagination={{ pageSize: 5, hideOnSinglePage: true }}
            dataSource={[...d.quotes]}
            scroll={{ x: 450 }}
            columns={[
              { title: '渠道', dataIndex: 'channel' },
              {
                title: '报价状态',
                dataIndex: 'status',
                render: (label: string) => <StatusBadge label={label} />,
              },
              {
                title: '采购折扣（模拟）',
                dataIndex: 'discount',
                render: (n: number) => `${(n / 1000).toFixed(2)} 折`,
              },
            ]}
            locale={{
              emptyText: <EmptyState description="当前范围暂无授权报价" />,
            }}
          />
        </Card>
      )}
    </>
  );
}
