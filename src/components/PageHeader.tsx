import { Breadcrumb, Typography } from 'antd';
import type { ReactNode } from 'react';
export function PageHeader({
  title,
  description,
  group,
  actions,
}: {
  title: string;
  description: string;
  group: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <Breadcrumb
        items={[{ title: 'MaaS 管理平台' }, { title: group }, { title }]}
      />
      <div className="page-heading-row">
        <div>
          <Typography.Title level={1}>{title}</Typography.Title>
          <Typography.Paragraph type="secondary">
            {description}
          </Typography.Paragraph>
        </div>
        {actions}
      </div>
    </header>
  );
}
