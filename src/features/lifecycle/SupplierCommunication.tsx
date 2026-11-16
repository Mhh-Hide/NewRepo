import { useCallback } from 'react';
import { Card } from 'antd';
import { Link } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import { useResourceQuery } from '../models/use-resource-query';
export function SupplierCommunication({
  session,
  supplierId,
}: {
  session: DemoSession;
  supplierId: string;
}) {
  if (!session.permits('lifecycle:read') || !session.profile.domains.length)
    return null;
  return <Communication session={session} supplierId={supplierId} />;
}
function Communication({
  session,
  supplierId,
}: {
  session: DemoSession;
  supplierId: string;
}) {
  const load = useCallback(async () => {
    const rows = await session.api.queryLifecycle({ supplierId });
    const first = rows.rows[0];
    return first ? session.api.getLifecycle(first.id) : null;
  }, [session.api, supplierId]);
  const { result } = useResourceQuery(load);
  if (result.status !== 'ready' || !result.data) return null;
  const d = result.data;
  return (
    <Card title="供应商交付沟通资料（模拟）" className="resource-card">
      <p>
        沟通微信群：{d.communication?.groupName ?? '未登记'}；沟通备注：
        {d.communication?.notes ?? '无'}
        。采购负责人沿用主档，技术测试与配置负责人独立维护。
      </p>
      {session.permits('resource:acquire') && (
        <Link to={`/channels?delivery=${d.row.id}`}>
          在授权渠道记录沟通群与备注
        </Link>
      )}
    </Card>
  );
}
