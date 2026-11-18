import { useCallback, useState } from 'react';
import { Popover, Select, Space, Button, message } from 'antd';
import type { DemoSession } from '../../services/demo-session';
import { listDemoProfiles } from '../../services/demo-session';
import { useResourceQuery } from '../models/use-resource-query';
export function OwnerPicker({
  session,
  modelId,
  domain,
  onSaved,
}: {
  session: DemoSession;
  modelId: string;
  domain: 'domestic' | 'overseas';
  onSaved?: () => void;
}) {
  const load = useCallback(
    () => session.api.modelResponsibilities(),
    [session.api],
  );
  const { result, reload } = useResourceQuery(load);
  const [open, setOpen] = useState(false),
    [proc, setProc] = useState<string>(),
    [ops, setOps] = useState<string>(),
    [busy, setBusy] = useState(false);
  if (result.status !== 'ready') return <span>—</span>;
  const r = result.data.find((r) => r.modelId === modelId);
  if (!r) return null;
  const users = listDemoProfiles();
  const name = (id: string) =>
    users.find((p) => p.user.id === id)?.user.name || '待分配';
  const options = (role: string) =>
    users
      .filter((p) => p.user.role === role && p.domains.includes(domain))
      .map((p) => ({ value: p.user.id, label: p.user.name }));
  return session.profile.user.role === 'ProductOperations' ? (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        setProc(r.procurementOwnerId);
        setOps(r.operationsOwnerId);
      }}
      title="模型默认负责人"
      content={
        <Space orientation="vertical">
          <label>
            采购
            <Select
              aria-label="模型采购负责人"
              style={{ width: 180 }}
              value={proc ?? r.procurementOwnerId}
              onChange={setProc}
              options={options('Procurement')}
            />
          </label>
          <label>
            运营
            <Select
              aria-label="模型运营负责人"
              style={{ width: 180 }}
              value={ops ?? r.operationsOwnerId}
              onChange={setOps}
              options={options('ProductOperations')}
            />
          </label>
          <Space>
            <Button
              type="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await session.api.assignModelOwners(
                    modelId,
                    r.version,
                    proc ?? r.procurementOwnerId,
                    ops ?? r.operationsOwnerId,
                  );
                  setOpen(false);
                  reload();
                  onSaved?.();
                  message.success('已更新默认负责人');
                } catch (e) {
                  message.error(e instanceof Error ? e.message : '保存失败');
                } finally {
                  setBusy(false);
                }
              }}
            >
              保存
            </Button>
            <Button onClick={() => setOpen(false)}>取消</Button>
          </Space>
        </Space>
      }
    >
      <Button type="link" style={{ padding: 0 }}>
        {name(r.procurementOwnerId)} / {name(r.operationsOwnerId)}
      </Button>
    </Popover>
  ) : (
    <span>
      {name(r.procurementOwnerId)} / {name(r.operationsOwnerId)}
    </span>
  );
}
