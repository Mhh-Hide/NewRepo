import { useCallback } from 'react';
import { Button, Card, Space, Table, Tag, message } from 'antd';
import { useOutletContext } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import { PageHeader } from '../../components/PageHeader';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { useResourceQuery } from '../models/use-resource-query';
export default function SalesProgressPage() {
  const session = useOutletContext<DemoSession>();
  const load = useCallback(
    () => session.api.querySalesProgress(),
    [session.api],
  );
  const { result, reload } = useResourceQuery(load);
  return (
    <>
      <PageHeader
        title="客户需求进度"
        description=""
        group="业务协同"
        actions={<Button onClick={reload}>刷新</Button>}
      />
      {result.status === 'loading' ? (
        <LoadingState />
      ) : result.status === 'error' ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : result.data.length ? (
        result.data.map((d) => (
          <Card
            key={d.id}
            title={d.customerName || d.title}
            style={{ marginBottom: 16 }}
            extra={
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      d.models
                        .map(
                          (m) =>
                            `${m.name}：${m.usable ? '已有可用资源' : m.problem ? '资源存在问题' : '仍在寻源'}；${m.nextAction}`,
                        )
                        .join('\n'),
                    );
                    message.success('已复制进度摘要');
                  } catch {
                    message.error('复制失败，请直接选择进度文字');
                  }
                }}
              >
                复制进度摘要
              </Button>
            }
          >
            <Space style={{ marginBottom: 12 }}>{d.title}</Space>
            <Table
              rowKey="name"
              pagination={false}
              dataSource={[...d.models]}
              columns={[
                { title: '模型', dataIndex: 'name' },
                {
                  title: '进度',
                  render: (_, m) => (
                    <Tag>
                      {m.usable
                        ? '已有可用渠道'
                        : m.problem
                          ? '存在问题'
                          : '仍在寻源'}
                    </Tag>
                  ),
                },
                { title: '下一步', dataIndex: 'nextAction' },
              ]}
            />
          </Card>
        ))
      ) : (
        <Card>暂无需要跟进的客户需求</Card>
      )}
    </>
  );
}
