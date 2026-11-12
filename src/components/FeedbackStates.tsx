import { Button, Empty, Result, Spin } from 'antd';
export function LoadingState() {
  return (
    <div className="feedback" role="status" aria-label="正在加载授权数据">
      <Spin description="正在加载授权数据…">
        <div style={{ height: 80 }} />
      </Spin>
    </div>
  );
}
export function EmptyState({
  description = '当前授权范围暂无数据',
}: {
  description?: string;
}) {
  return (
    <div className="feedback">
      <Empty description={description} image={Empty.PRESENTED_IMAGE_SIMPLE} />
    </div>
  );
}
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Result
      status="error"
      title="授权数据查询失败"
      subTitle="未展示不完整的统计结果，请重试。"
      extra={<Button onClick={onRetry}>重新加载</Button>}
    />
  );
}
