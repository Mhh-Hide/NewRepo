import { Table } from 'antd';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import type { ChannelResourceSummary } from '../../services/resource-types';
import {
  qualityStatusLabels,
  connectivityStatusLabels,
  integrationStatusLabels,
  availabilityStatusLabels,
  channelTypeLabels,
} from '../../domain/statuses';
import { EmptyState } from '../../components/FeedbackStates';
import { StatusBadge } from '../../components/StatusBadge';
import { formatCapacity } from './format-capacity';
export function ChannelResourceTable({
  rows,
  identityVisible,
}: {
  rows: readonly ChannelResourceSummary[];
  identityVisible: boolean;
}) {
  const columns: ColumnsType<ChannelResourceSummary> = [
    {
      title: '渠道展示名',
      dataIndex: 'displayName',
      width: 190,
      render: (name: string, c) => (
        <Link
          className="resource-name"
          to={`/channels/${encodeURIComponent(c.id)}`}
        >
          {name}
        </Link>
      ),
    },
    {
      title: '渠道类型',
      dataIndex: 'channelType',
      width: 150,
      render: (type: ChannelResourceSummary['channelType']) =>
        channelTypeLabels[type],
    },
    ...(identityVisible
      ? [
          {
            title: '供应商（当前主档）',
            width: 200,
            render: (_: unknown, c: ChannelResourceSummary) =>
              c.supplier ? (
                <div>
                  <Link to={`/suppliers/${encodeURIComponent(c.supplier.id)}`}>
                    {c.supplier.name}
                  </Link>
                  <small className="resource-subtitle">
                    {c.supplier.shortCode} ·{' '}
                    {c.supplier.status === 'enabled' ? '主档启用' : '主档停用'}
                  </small>
                </div>
              ) : (
                '未提供身份'
              ),
          },
        ]
      : []),
    { title: 'TPM', dataIndex: 'tpm', width: 100, render: formatCapacity },
    { title: 'RPM', dataIndex: 'rpm', width: 90, render: formatCapacity },
    {
      title: '并发上限',
      dataIndex: 'concurrencyLimit',
      width: 100,
      render: formatCapacity,
    },
    {
      title: 'TTFT (ms)',
      dataIndex: 'ttftMs',
      width: 100,
      render: formatCapacity,
    },
    {
      title: '资源状态',
      dataIndex: 'resourceStatus',
      width: 100,
      render: (s: string) => (
        <StatusBadge label={s === 'enabled' ? '启用' : '停用'} />
      ),
    },
    {
      title: '质量测试',
      dataIndex: 'qualityStatus',
      width: 130,
      render: (s: ChannelResourceSummary['qualityStatus']) => (
        <StatusBadge label={qualityStatusLabels[s]} />
      ),
    },
    {
      title: '连通性测试',
      dataIndex: 'connectivityStatus',
      width: 140,
      render: (s: ChannelResourceSummary['connectivityStatus']) => (
        <StatusBadge label={connectivityStatusLabels[s]} />
      ),
    },
    {
      title: '接入状态',
      dataIndex: 'integrationStatus',
      width: 110,
      render: (s: ChannelResourceSummary['integrationStatus']) => (
        <StatusBadge label={integrationStatusLabels[s]} />
      ),
    },
    {
      title: '开放状态',
      dataIndex: 'availabilityStatus',
      width: 110,
      render: (s: ChannelResourceSummary['availabilityStatus']) => (
        <StatusBadge label={availabilityStatusLabels[s]} />
      ),
    },
    {
      title: '操作',
      fixed: 'right',
      width: 100,
      render: (_, c) => (
        <Link to={`/channels/${encodeURIComponent(c.id)}`}>查看详情</Link>
      ),
    },
  ];
  return (
    <Table<ChannelResourceSummary>
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={[...rows]}
      scroll={{ x: identityVisible ? 1720 : 1500 }}
      pagination={{ pageSize: 5, hideOnSinglePage: true }}
      locale={{ emptyText: <EmptyState description="当前模型暂无可见渠道" /> }}
    />
  );
}
