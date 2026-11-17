import { isLifecycleNotice } from '../../domain/lifecycle';
import { useCallback, useState, type ReactNode } from 'react';
import { Button, Card, Select, Space, Table, Alert, Modal, Input } from 'antd';
import { Link } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import { useResourceQuery } from '../models/use-resource-query';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
export function WorkInbox({
  session,
  compact = false,
  fallback,
}: {
  session: DemoSession;
  compact?: boolean;
  fallback?: ReactNode;
}) {
  if (!session.permits('task:read') || !session.profile.domains.length)
    return null;
  return (
    <Inbox
      key={`${session.profile.user.id}:${session.domain}`}
      session={session}
      compact={compact}
      fallback={fallback}
    />
  );
}
function Inbox({
  session,
  compact,
  fallback,
}: {
  session: DemoSession;
  compact: boolean;
  fallback?: ReactNode;
}) {
  const [view, setView] = useState<
      | 'mine'
      | 'mentions'
      | 'notifications'
      | 'sent'
      | 'waiting'
      | 'completed'
      | 'overdue'
    >('mine'),
    [error, setError] = useState(''),
    [action, setAction] = useState<{
      id: string;
      version: number;
      type: 'read' | 'complete' | 'cancel' | 'reopen';
    } | null>(null),
    [reason, setReason] = useState('');
  const load = useCallback(
      () => session.api.queryLifecycleTasks(view),
      [session.api, view],
    ),
    { result, reload } = useResourceQuery(load);
  return (
    <Card
      title="我的任务"
      data-testid="lifecycle-inbox"
      className="resource-card"
      extra={
        <Space>
          <Link to="/tasks">全部任务</Link>
          <Button onClick={reload}>刷新协作任务</Button>
        </Space>
      }
    >
      <Space wrap>
        <Select
          aria-label="协作任务视角"
          value={view}
          onChange={setView}
          options={[
            { value: 'mine', label: '待我处理' },
            { value: 'mentions', label: '@ 我的' },
            { value: 'notifications', label: '站内通知（仅需知悉）' },
            { value: 'sent', label: '我发出的任务' },
            { value: 'waiting', label: '等待其他人处理' },
            { value: 'completed', label: '已完成' },
            { value: 'overdue', label: '逾期事项' },
          ]}
        />
      </Space>
      {error && <Alert type="error" title={error} />}{' '}
      {result.status === 'loading' ? (
        <LoadingState />
      ) : result.status === 'error' ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : compact && view === 'mine' && result.data.length === 0 && fallback ? (
        fallback
      ) : (
        <Table
          rowKey="id"
          dataSource={compact ? result.data.slice(0, 5) : result.data}
          size="small"
          scroll={{ x: 900 }}
          pagination={compact ? false : { pageSize: 5 }}
          columns={[
            { title: '事项', dataIndex: 'title', width: 230 },
            {
              title: '类别',
              render: (_, t) =>
                isLifecycleNotice(t.type) ? '仅需知悉' : '工作待办',
            },
            { title: '处理说明', dataIndex: 'completionReason' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (s, t) =>
                isLifecycleNotice(t.type)
                  ? '仅需知悉'
                  : {
                      open: '待处理',
                      completed: '已完成',
                      cancelled: '已取消',
                    }[s as 'open'],
            },
            {
              title: '已读',
              dataIndex: 'readAt',
              render: (v) => (v ? '已读' : '未读'),
            },
            {
              title: '截止时间（北京时间）',
              dataIndex: 'dueAt',
              render: (v) =>
                v
                  ? new Date(v).toLocaleString('zh-CN', {
                      timeZone: 'Asia/Shanghai',
                    })
                  : '未知',
            },
            {
              title: '业务入口',
              render: (_, t) =>
                t.archived ? (
                  '原需求已显式重置（通知归档）'
                ) : (
                  <Link
                    to={
                      t.channelId
                        ? `/channels?delivery=${encodeURIComponent(t.channelId)}`
                        : `/sourcing/${t.demandId}`
                    }
                  >
                    查看原业务对象
                  </Link>
                ),
            },
            {
              title: '操作',
              render: (_, t) =>
                t.assigneeId === session.profile.user.id ? (
                  <Space wrap>
                    {[
                      ['read', '标记已读'],
                      ['complete', '完成任务'],
                      ['cancel', '取消任务'],
                      ['reopen', '重新打开任务'],
                    ]
                      .filter(
                        ([type]) =>
                          type === 'read' ||
                          (!isLifecycleNotice(t.type) &&
                            session.permits('task:complete')),
                      )
                      .filter(([type]) =>
                        type === 'read' || type === 'reopen'
                          ? type === 'read' || t.status !== 'open'
                          : t.status === 'open',
                      )
                      .map(([type, label]) => (
                        <Button
                          key={type}
                          size="small"
                          onClick={() => {
                            setAction({
                              id: t.id,
                              version: t.version,
                              type: type as
                                'read' | 'complete' | 'cancel' | 'reopen',
                            });
                            setReason('');
                            setError('');
                          }}
                        >
                          {label}
                        </Button>
                      ))}
                  </Space>
                ) : (
                  '非本人任务只读'
                ),
            },
          ]}
        />
      )}
      <Modal
        title="确认协作任务操作"
        open={!!action}
        onCancel={() => setAction(null)}
        onOk={async () => {
          try {
            await session.api.changeLifecycleTask(
              action!.id,
              action!.type,
              reason,
              crypto.randomUUID(),
              action!.version,
            );
            setAction(null);
            reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : '操作失败');
          }
        }}
        okText="确认任务操作"
      >
        <Input.TextArea
          aria-label="任务操作说明"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p>
          合同、配置、测试和开放任务须保存对应业务事实才能完成；取消提醒不会改变交付状态。
        </p>
        {error && <Alert type="error" title={error} />}
      </Modal>
    </Card>
  );
}
