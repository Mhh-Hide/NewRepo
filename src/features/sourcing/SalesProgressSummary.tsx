import { useCallback } from 'react';
import { Button, Card, message } from 'antd';
import type { DemoSession } from '../../services/demo-session';
import { useResourceQuery } from '../models/use-resource-query';
export function SalesProgressSummary({
  session,
  id,
}: {
  session: DemoSession;
  id: string;
}) {
  const load = useCallback(
    () => session.api.querySalesProgress(id),
    [session.api, id],
  );
  const { result } = useResourceQuery(load);
  if (result.status !== 'ready' || !result.data[0]) return null;
  const text = result.data[0].models
    .map(
      (m) =>
        `${m.name}：${m.usable ? '已有可用渠道' : m.problem ? '存在问题' : '仍在寻源'}；下一步${m.nextAction}`,
    )
    .join('\n');
  return (
    <Card
      title="对销售同步进度"
      style={{ marginBottom: 16 }}
      extra={
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              message.success('已复制进度摘要');
            } catch {
              message.error('复制失败，请选择文字复制');
            }
          }}
        >
          复制摘要
        </Button>
      }
    >
      <div style={{ whiteSpace: 'pre-line' }}>{text}</div>
    </Card>
  );
}
