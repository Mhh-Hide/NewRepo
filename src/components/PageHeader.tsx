import { Typography } from 'antd';
import type { ReactNode } from 'react';
export function PageHeader({
  title,
  actions,
}: {
  title: string;
  description: string;
  group: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div className="page-heading-row">
        <Typography.Title level={1}>{title}</Typography.Title>
        {actions}
      </div>
    </header>
  );
}
