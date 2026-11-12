import { Result } from 'antd';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import { SupplierListPage } from './SupplierListPage';
import { SupplierDetailPage } from './SupplierDetailPage';
import './suppliers.css';
export function SupplierRoute() {
  const session = useOutletContext<DemoSession>();
  const { supplierId } = useParams<{ supplierId: string }>();
  if (!session.permits('supplier:read'))
    return (
      <Result
        status="403"
        title="当前演示身份无此模块访问权限"
        extra={<Link to="/dashboard">返回工作台</Link>}
      />
    );
  return supplierId ? (
    <SupplierDetailPage key={supplierId} id={supplierId} session={session} />
  ) : (
    <SupplierListPage session={session} />
  );
}
