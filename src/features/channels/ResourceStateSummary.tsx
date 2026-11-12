import { Space, Typography } from 'antd';
import { StatusBadge } from '../../components/StatusBadge';
import type { StateCount } from '../../services/resource-types';
export function ResourceStateSummary({
  counts,
}: {
  counts: readonly StateCount[];
}) {
  const present = counts.filter((c) => c.count > 0);
  return present.length ? (
    <Space size={[4, 4]} wrap>
      {present.map((c) => (
        <StatusBadge key={c.code} label={`${c.label} ${c.count} 条`} />
      ))}
    </Space>
  ) : (
    <Typography.Text type="secondary">暂无渠道</Typography.Text>
  );
}
