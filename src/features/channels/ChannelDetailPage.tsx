import { RelatedQuotes } from '../quotes/RelatedQuotes';
import { ChannelManagement } from './ChannelManagement';
import { useCallback } from 'react';
import { Button, Card, Descriptions, Result, Space, Tag } from 'antd';
import type { DescriptionsProps } from 'antd';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import { PageHeader } from '../../components/PageHeader';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { StatusBadge } from '../../components/StatusBadge';
import {
  qualityStatusLabels,
  connectivityStatusLabels,
  integrationStatusLabels,
  availabilityStatusLabels,
  channelTypeLabels,
} from '../../domain/statuses';
import { businessDomainLabels } from '../models/resource-labels';
import { useResourceQuery } from '../models/use-resource-query';
import { formatCapacity } from './format-capacity';
export default function ChannelDetailPage() {
  const session = useOutletContext<DemoSession>();
  const { channelId = '' } = useParams<{ channelId: string }>();
  const load = useCallback(async () => {
    const [channel, version, history] = await Promise.all([
      session.api.getChannelResource(channelId),
      session.api.channelVersion(channelId),
      session.api.channelHistory(channelId),
    ]);
    return { channel, version, history };
  }, [session.api, channelId]);
  const { result, reload } = useResourceQuery(load);
  const header = (
    <PageHeader
      title={session.permits('channel:update') ? '渠道详情' : '渠道只读详情'}
      description="查看授权渠道资料；获准的产品运营可维护 Mock 主档"
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
  const c = result.data.channel;
  if (!c)
    return (
      <>
        {header}
        <Result
          status="404"
          title="渠道不存在或无权访问"
          subTitle="不会返回其他供应商或未授权业务域的渠道信息。"
        />
      </>
    );
  const technical: NonNullable<DescriptionsProps['items']> = [
    ...(c.modelInvocationName !== undefined
      ? [
          {
            key: 'invocation',
            label: '实际调用名称',
            children: c.modelInvocationName,
          },
        ]
      : []),
    ...(c.endpointReference !== undefined
      ? [
          {
            key: 'endpoint',
            label: 'Endpoint 引用',
            children: c.endpointReference,
          },
        ]
      : []),
    ...(c.opChannelId !== undefined
      ? [
          {
            key: 'op',
            label: 'OP 渠道 ID',
            children: c.opChannelId ?? '未绑定',
          },
        ]
      : []),
    ...(c.sourceVerificationStatus !== undefined
      ? [
          {
            key: 'source',
            label: '来源核验状态',
            children: {
              verified: '已核验',
              unverified: '未核验',
              rejected: '核验未通过',
            }[c.sourceVerificationStatus],
          },
        ]
      : []),
  ];
  return (
    <>
      {header}
      <Card
        title={
          <div className="model-profile-heading">
            <span className="resource-emblem">C</span>
            <div>
              <strong>{c.displayName}</strong>
              <small>{c.anonymousCode} · 模拟渠道</small>
            </div>
          </div>
        }
        extra={
          <Link to={`/models/${encodeURIComponent(c.model.id)}`}>
            查看关联模型
          </Link>
        }
      >
        <Descriptions
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            { key: 'id', label: '内部渠道 ID', children: c.id },
            {
              key: 'model',
              label: '关联模型',
              children: (
                <Link to={`/models/${encodeURIComponent(c.model.id)}`}>
                  {c.model.name}
                </Link>
              ),
            },
            { key: 'vendor', label: '模型厂商', children: c.vendor.name },
            {
              key: 'domain',
              label: '业务域',
              children: businessDomainLabels[c.businessDomain],
            },
            {
              key: 'type',
              label: '渠道类型',
              children: channelTypeLabels[c.channelType],
            },
            {
              key: 'status',
              label: '资源启用状态',
              children: (
                <StatusBadge
                  label={c.resourceStatus === 'enabled' ? '启用' : '停用'}
                />
              ),
            },
            ...(c.supplier
              ? [
                  {
                    key: 'supplier',
                    label: '关联供应商',
                    children: (
                      <Link
                        to={`/suppliers/${encodeURIComponent(c.supplier.id)}`}
                      >
                        {c.supplier.name}
                      </Link>
                    ),
                  },
                  {
                    key: 'supplier-code',
                    label: '供应商缩写',
                    children: c.supplier.shortCode,
                  },
                  {
                    key: 'supplier-status',
                    label: '供应商主档状态',
                    children: (
                      <StatusBadge
                        label={
                          c.supplier.status === 'enabled' ? '启用' : '停用'
                        }
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      <div className="resource-detail-grid">
        <Card title="资源能力">
          <Descriptions
            column={{ xs: 1, sm: 2 }}
            items={[
              { key: 'tpm', label: 'TPM', children: formatCapacity(c.tpm) },
              { key: 'rpm', label: 'RPM', children: formatCapacity(c.rpm) },
              {
                key: 'concurrency',
                label: '并发上限',
                children: formatCapacity(c.concurrencyLimit),
              },
              {
                key: 'ttft',
                label: 'TTFT (ms)',
                children: formatCapacity(c.ttftMs),
              },
            ]}
          />
        </Card>
        <Card title="独立状态">
          <Descriptions
            column={{ xs: 1, sm: 2 }}
            items={[
              {
                key: 'quality',
                label: '质量测试',
                children: (
                  <StatusBadge label={qualityStatusLabels[c.qualityStatus]} />
                ),
              },
              {
                key: 'connectivity',
                label: '连通性测试',
                children: (
                  <StatusBadge
                    label={connectivityStatusLabels[c.connectivityStatus]}
                  />
                ),
              },
              {
                key: 'integration',
                label: '接入状态',
                children: (
                  <StatusBadge
                    label={integrationStatusLabels[c.integrationStatus]}
                  />
                ),
              },
              {
                key: 'availability',
                label: '开放状态',
                children: (
                  <StatusBadge
                    label={availabilityStatusLabels[c.availabilityStatus]}
                  />
                ),
              },
            ]}
          />
        </Card>
      </div>
      {technical.length > 0 && (
        <Card title="授权技术引用" className="resource-card">
          <Descriptions column={{ xs: 1, sm: 2 }} items={technical} />
          <p className="section-note resource-note">
            仅为 Mock 非敏感引用；不包含真实 Endpoint 或凭据。
          </p>
        </Card>
      )}
      {session.permits('channel:update') && result.data.version !== null && (
        <ChannelManagement
          session={session}
          channel={c}
          version={result.data.version}
          history={result.data.history}
          onSaved={reload}
        />
      )}
      {session.permits('quote:read') && (
        <RelatedQuotes session={session} channelId={c.id} />
      )}
      <Card title="后续能力" className="resource-card">
        <Space wrap>
          <Tag>测试执行历史 · 即将开放</Tag>
          <Tag>接入历史 · 即将开放</Tag>
        </Space>
        <p className="section-note resource-note">
          不存储 API Key，不执行测试、报价调整或生产接入操作。
        </p>
      </Card>
    </>
  );
}
