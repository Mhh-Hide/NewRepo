import { useCallback } from 'react';
import { Button, Card, Descriptions, Empty, Table } from 'antd';
import { Link } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import { useResourceQuery } from '../models/use-resource-query';
import { ErrorState, LoadingState } from '../../components/FeedbackStates';
import { remediationStatusLabels } from '../../domain/remediations';
export function RemediationSummaryPanel({
  session,
  channelId,
  supplierId,
}: {
  session: DemoSession;
  channelId?: string;
  supplierId?: string;
}) {
  if (!session.permits('remediation:summary')) return null;
  return (
    <Summary
      key={`${session.profile.user.id}:${session.domain}:${channelId}:${supplierId}`}
      session={session}
      {...(channelId ? { channelId } : {})}
      {...(supplierId ? { supplierId } : {})}
    />
  );
}
function Summary({
  session,
  channelId,
  supplierId,
}: {
  session: DemoSession;
  channelId?: string;
  supplierId?: string;
}) {
  const load = useCallback(
    () =>
      session.api.queryRemediationSummaries({
        ...(channelId ? { channelId } : {}),
        ...(supplierId ? { supplierId } : {}),
      }),
    [session.api, channelId, supplierId],
  );
  const { result, reload } = useResourceQuery(load);
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error')
    return <ErrorState message={result.message} onRetry={reload} />;
  const rows = result.data,
    open = rows.filter((r) => r.status !== 'closed');
  return (
    <Card
      title="整改进度"
      className="resource-card"
      extra={<Button onClick={reload}>刷新整改摘要</Button>}
    >
      <Descriptions
        column={{ xs: 1, sm: 2, lg: 4 }}
        items={[
          ...(['open', 'in_progress', 'submitted'] as const).map((status) => ({
            key: status,
            label: remediationStatusLabels[status],
            children: rows.filter((r) => r.status === status).length,
          })),
          { key: 'all', label: '整改待跟进', children: open.length },
          {
            key: 'overdue',
            label: '超期未关闭',
            children: open.filter((r) => r.overdue).length,
          },
          {
            key: 'unknown',
            label: '期限未知',
            children: open.filter((r) => r.deadlineUnknown).length,
          },
          {
            key: 'channels',
            label: '存在未关闭整改渠道数',
            children: new Set(open.map((r) => r.channelId)).size,
          },
        ]}
      />
      {rows.length ? (
        <Table
          rowKey="id"
          dataSource={rows}
          scroll={{ x: 650 }}
          pagination={{ pageSize: 5 }}
          columns={[
            {
              title: '编号',
              dataIndex: 'id',
              render: (id: string) =>
                session.permits('remediation:detail') ? (
                  <Link to={`/remediations/${id}`}>{id}</Link>
                ) : (
                  id
                ),
            },
            { title: '渠道', dataIndex: 'channelId' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (s) =>
                remediationStatusLabels[
                  s as keyof typeof remediationStatusLabels
                ],
            },
            {
              title: '技术提示',
              render: (_, r) =>
                r.exceptionClosed
                  ? '例外结束，不代表技术修复已验证成功。'
                  : r.overdue
                    ? '超期未关闭'
                    : r.pendingVerification
                      ? '已提交不等于已修复'
                      : '仅人工跟进',
            },
          ]}
        />
      ) : (
        <Empty description="当前范围暂无整改" />
      )}
    </Card>
  );
}
