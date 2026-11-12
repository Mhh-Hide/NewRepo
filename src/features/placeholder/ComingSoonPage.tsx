import { Button, Card, Result, Tag } from 'antd';
import { Link, useLocation, useOutletContext } from 'react-router-dom';
import { navigation } from '../../app/navigation';
import type { DemoSession } from '../../services/demo-session';
import { PageHeader } from '../../components/PageHeader';
export function ComingSoonPage() {
  const { pathname } = useLocation();
  const session = useOutletContext<DemoSession>();
  const item = navigation.find((n) => n.path === pathname);
  if (!item)
    return (
      <Result
        status="404"
        title="页面不存在"
        extra={<Link to="/dashboard">返回工作台</Link>}
      />
    );
  if (item.permission && !session.permits(item.permission))
    return (
      <Result
        status="403"
        title="当前演示身份无此模块访问权限"
        extra={<Link to="/dashboard">返回工作台</Link>}
      />
    );
  return (
    <>
      <PageHeader
        title={item.name}
        description={item.description}
        group={item.group}
      />
      <Card className="placeholder-card">
        <Result
          status="info"
          title="即将开放"
          subTitle={`规划阶段：${item.stage}。本页仅说明模块职责，不提供业务编辑或写入操作。`}
          extra={
            <>
              <Tag>未开放</Tag>
              <Link to="/dashboard">
                <Button type="primary">返回工作台</Button>
              </Link>
            </>
          }
        />
        <p className="placeholder-note">
          后续阶段仍须独立确认需求与验收，不会自动启动。
        </p>
      </Card>
    </>
  );
}
