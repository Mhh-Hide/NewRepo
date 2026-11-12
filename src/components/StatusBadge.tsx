import { Tag } from 'antd';
export function StatusBadge({ label }: { label: string }) {
  const color = /失败|异常/.test(label)
    ? 'error'
    : /待|未|整改中|调查中/.test(label)
      ? 'warning'
      : /通过|已开放|已接入|启用/.test(label)
        ? 'success'
        : 'default';
  return <Tag color={color}>{label}</Tag>;
}
