import { useCallback } from 'react';
import { Button, Card, Descriptions, Result, Space, Table, Tag } from 'antd';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type { SupplierCoverage } from '../../services/resource-types';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/FeedbackStates';
import { ChannelResourceTable } from '../channels/ChannelResourceTable';
import { ResourceStateSummary } from '../channels/ResourceStateSummary';
import { channelTypeLabels } from '../../domain/statuses';
import {
  modelCategoryLabels,
  regionVariantLabels,
  businessDomainLabels,
} from './resource-labels';
import { useResourceQuery } from './use-resource-query';
export default function ModelDetailPage() {
  const session = useOutletContext<DemoSession>();
  const { modelId = '' } = useParams<{ modelId: string }>();
  const load = useCallback(
    () => session.api.getModelResource(modelId),
    [session.api, modelId],
  );
  const { result, reload } = useResourceQuery(load);
  const header = (
    <PageHeader
      title="模型详情"
      description="模型目录、供应商覆盖及授权渠道的只读资源视图"
      group="资源管理"
      actions={
        <Space wrap>
          <Link to="/models">
            <Button>返回模型资源池</Button>
          </Link>
          <Button onClick={reload}>刷新资料</Button>
        </Space>
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
        <ErrorState message={result.message} onRetry={reload} />
      </>
    );
  const d = result.data;
  if (!d)
    return (
      <>
        {header}
        <Result
          status="404"
          title="模型不存在或无权访问"
          subTitle="详情仅限当前身份与业务域已授权的模型。"
        />
      </>
    );
  const s = d.summary;
  const m = s.model;
  const metrics = [
    ...(s.supplierCount !== undefined
      ? [{ id: 'model-suppliers', label: '关联供应商', value: s.supplierCount }]
      : []),
    { id: 'model-channels', label: '授权渠道', value: s.channelCount },
    {
      id: 'model-quality-passed',
      label: '质量通过渠道',
      value: s.states.quality.find((c) => c.code === 'passed')?.count ?? 0,
    },
    {
      id: 'model-connectivity-passed',
      label: '连通通过渠道',
      value: s.states.connectivity.find((c) => c.code === 'passed')?.count ?? 0,
    },
    {
      id: 'model-integrated',
      label: '已接入渠道',
      value:
        s.states.integration.find((c) => c.code === 'integrated')?.count ?? 0,
    },
    {
      id: 'model-open',
      label: '已开放渠道',
      value: s.states.availability.find((c) => c.code === 'open')?.count ?? 0,
    },
  ];
  return (
    <>
      {header}
      <Card
        title={
          <div className="model-profile-heading">
            <span className="resource-emblem">M</span>
            <div>
              <strong>{m.name}</strong>
              <small>
                {m.modelCode} · {m.version}
              </small>
            </div>
          </div>
        }
        extra={<Tag color="blue">模拟资源 · 只读</Tag>}
      >
        <Descriptions
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            { key: 'vendor', label: '模型厂商', children: s.vendor.name },
            { key: 'code', label: '模型代码', children: m.modelCode },
            { key: 'version', label: '模型版本', children: m.version },
            {
              key: 'region',
              label: '地区版本',
              children: (
                <span data-testid="model-region-variant">
                  {regionVariantLabels[m.regionVariant]}
                </span>
              ),
            },
            {
              key: 'category',
              label: '模型类别',
              children: modelCategoryLabels[m.category],
            },
            {
              key: 'status',
              label: '启用状态',
              children: (
                <StatusBadge label={m.status === 'enabled' ? '启用' : '停用'} />
              ),
            },
            {
              key: 'domain',
              label: '业务域',
              children: (
                <span data-testid="model-business-domain">
                  {businessDomainLabels[s.businessDomain]}
                </span>
              ),
              span: 'filled',
            },
          ]}
        />
      </Card>
      <section className="stats-grid resource-detail-stats">
        {metrics.map((metric) => (
          <StatCard
            key={metric.id}
            metric={{
              ...metric,
              note: '按当前授权渠道独立计算，不推导模型级通过状态',
            }}
          />
        ))}
      </section>
      <Card title="渠道类型分布" className="resource-card">
        <Space wrap>
          {s.channelTypes.map((t) => (
            <Tag key={t.code}>
              {channelTypeLabels[t.code]} · {t.count} 条
            </Tag>
          ))}
        </Space>
        {!s.channelTypes.length && (
          <EmptyState description="当前模型暂无可见资源渠道" />
        )}
      </Card>
      {d.supplierIdentityVisible && (
        <Card
          title="供应商覆盖"
          className="resource-card"
          extra={<Tag>以当前主档为准</Tag>}
        >
          <p className="section-note">
            按不同供应商 ID 去重；主档启停不改变既有渠道和独立测试状态。
          </p>
          <Table<SupplierCoverage>
            rowKey={(r) => r.supplier.id}
            size="small"
            dataSource={[...d.suppliers]}
            pagination={false}
            scroll={{ x: 1000 }}
            columns={[
              {
                title: '供应商名称',
                width: 220,
                render: (_, r) => (
                  <Link
                    className="resource-name"
                    to={`/suppliers/${encodeURIComponent(r.supplier.id)}`}
                  >
                    {r.supplier.name}
                  </Link>
                ),
              },
              {
                title: '内部缩写',
                width: 110,
                render: (_, r) => r.supplier.shortCode,
              },
              {
                title: '主档状态',
                width: 110,
                render: (_, r) => (
                  <StatusBadge
                    label={r.supplier.status === 'enabled' ? '启用' : '停用'}
                  />
                ),
              },
              { title: '关联渠道', width: 100, dataIndex: 'channelCount' },
              {
                title: '质量测试分布',
                width: 200,
                render: (_, r) => (
                  <ResourceStateSummary counts={r.states.quality} />
                ),
              },
              {
                title: '连通性分布',
                width: 200,
                render: (_, r) => (
                  <ResourceStateSummary counts={r.states.connectivity} />
                ),
              },
            ]}
            locale={{
              emptyText: <EmptyState description="当前模型暂无关联供应商" />,
            }}
          />
        </Card>
      )}
      <Card
        title="授权渠道清单"
        className="resource-card"
        extra={<Tag>{s.channelCount} 条渠道</Tag>}
      >
        <p className="section-note">
          未知能力保留为“未知”；测试、接入与开放分别展示，不提供修改操作。
        </p>
        <ChannelResourceTable
          rows={d.channels}
          identityVisible={d.supplierIdentityVisible}
        />
      </Card>
      <Card title="历史与后续能力" className="resource-card">
        <div className="resource-future">
          {['渠道报价历史', '测试执行历史', '接入历史'].map((name) => (
            <div key={name}>
              <span>{name}</span>
              <Tag>即将开放</Tag>
            </div>
          ))}
        </div>
        <p className="section-note resource-note">
          本阶段不提供价格调整、测试执行、渠道编辑或上线操作。
        </p>
      </Card>
    </>
  );
}
