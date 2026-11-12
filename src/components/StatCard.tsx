import { Card, Statistic, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
interface Metric {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly note: string;
}
export function StatCard({ metric }: { metric: Metric }) {
  return (
    <Card className="stat-card" data-testid={`metric-${metric.id}`}>
      <div className="stat-label">
        {metric.label}
        <Tooltip title={metric.note}>
          <InfoCircleOutlined aria-label={metric.note} />
        </Tooltip>
      </div>
      <Statistic value={metric.value} groupSeparator="," />
      <div className="stat-foot">当前授权范围</div>
    </Card>
  );
}
