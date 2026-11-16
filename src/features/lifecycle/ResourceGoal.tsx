import { useCallback, useState } from 'react';
import { Alert, Button, Card, Input, Modal } from 'antd';
import type { DemoSession } from '../../services/demo-session';
import { useResourceQuery } from '../models/use-resource-query';
export function ResourceGoal({
  session,
  demandId,
}: {
  session: DemoSession;
  demandId: string;
}) {
  if (!session.permits('lifecycle:read')) return null;
  return (
    <Goal
      key={`${session.profile.user.id}:${session.domain}:${demandId}`}
      session={session}
      demandId={demandId}
    />
  );
}
function Goal({
  session,
  demandId,
}: {
  session: DemoSession;
  demandId: string;
}) {
  const load = useCallback(
      () => session.api.resourceGoal(demandId),
      [session.api, demandId],
    ),
    { result, reload } = useResourceQuery(load),
    [open, setOpen] = useState(false),
    [at, setAt] = useState(''),
    [error, setError] = useState('');
  if (result.status !== 'ready') return null;
  const g = result.data;
  return (
    <Card
      title="资源保障目标（与供应商采购合同分开）"
      className="resource-card"
    >
      <p>
        客户合同：{g.customerSigned ? '已人工记录签约' : '尚无人工签约记录'}
        。当前目标：至少 {g.targetChannels} 个可用渠道；当前可用{' '}
        {g.usableChannels} 个渠道，来自 {g.distinctSuppliers}{' '}
        家供应商。渠道数与供应商数分别统计，原寻源三家供应商口径不变。
      </p>
      {session.permits('lifecycle:customer-contract') && !g.customerSigned && (
        <Button onClick={() => setOpen(true)}>
          人工记录客户签约并扩充备用渠道
        </Button>
      )}
      <Modal
        title="确认客户签约事实（模拟）"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={async () => {
          try {
            await session.api.recordCustomerContract(
              demandId,
              g.version,
              at,
              crypto.randomUUID(),
            );
            setOpen(false);
            reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : '保存失败');
          }
        }}
      >
        <Input
          aria-label="客户签约时间"
          placeholder="已发生的 ISO 时间及明确时区"
          value={at}
          onChange={(e) => setAt(e.target.value)}
        />
        <p>不由采购合同、报价或客户字段自动推断签约；仅保存人工 Mock 事实。</p>
        {error && <Alert type="error" title={error} />}
      </Modal>
    </Card>
  );
}
