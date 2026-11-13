import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Input,
  Modal,
  Space,
  Table,
} from 'antd';
import type { DemoSession } from '../../services/demo-session';
import type { ChannelChange } from '../../services/channel-types';
import type { ChannelResourceDetail } from '../../services/resource-types';
import { resourceErrorMessage } from '../../services/resource-types';
import { ChannelEditor } from './ChannelEditor';
export function ChannelManagement({
  session,
  channel,
  version,
  history,
  onSaved,
}: {
  session: DemoSession;
  channel: ChannelResourceDetail;
  version: number;
  history: readonly ChannelChange[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [op, setOp] = useState('');
  const [preview, setPreview] = useState(false);
  const [toggle, setToggle] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const apply = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
      setOpOpen(false);
      setToggle(false);
      setPreview(false);
      onSaved();
    } catch (e) {
      setError(resourceErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card title="渠道主档维护 · Mock" className="resource-card">
        <Alert
          type="info"
          showIcon
          title="模拟绑定，未连接生产 OP"
          description="主档启停、模拟绑定均不更改测试、接入或开放状态。"
        />
        <Space wrap style={{ marginTop: 16 }}>
          {session.permits('channel:update') && (
            <Button onClick={() => setEditing(true)}>编辑基础信息</Button>
          )}
          {session.permits('channel:toggle') && (
            <Button
              onClick={() => {
                setError('');
                setToggle(true);
              }}
            >
              {channel.resourceStatus === 'enabled'
                ? '停用资源主档'
                : '启用资源主档'}
            </Button>
          )}
          {session.permits('channel:bind-op') && (
            <Button
              disabled={channel.opChannelId !== null}
              onClick={() => {
                setError('');
                setOp('');
                setOpOpen(true);
              }}
            >
              模拟 OP ID 绑定
            </Button>
          )}
        </Space>
        <p className="section-note">
          版本 {version}；已有 OP ID 不提供解绑或覆盖。
        </p>
      </Card>
      {editing && (
        <ChannelEditor
          session={session}
          channel={channel}
          version={version}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      )}
      <Modal
        title="模拟 OP ID 绑定"
        open={opOpen}
        okText={preview ? '确认模拟绑定' : '预览绑定'}
        confirmLoading={busy}
        onCancel={() => {
          setOpOpen(false);
          setPreview(false);
        }}
        onOk={() => {
          if (!preview) {
            if (!/^MOCK-[A-Za-z0-9_-]{1,80}$/.test(op)) {
              setError(
                'OP ID 须以 MOCK- 开头，仅使用字母、数字、下划线或连字符。',
              );
              return;
            }
            setError('');
            setPreview(true);
          } else
            void apply(() =>
              session.api.bindChannelOp(channel.id, version, op, true),
            );
        }}
      >
        <Alert type="warning" showIcon title="模拟绑定，未连接生产 OP" />
        <p>渠道：{channel.displayName}</p>
        <label htmlFor="mock-op">模拟 OP 渠道 ID</label>
        <Input
          id="mock-op"
          value={op}
          disabled={preview}
          onChange={(e) => setOp(e.target.value)}
          placeholder="MOCK-demo-001"
        />
        {preview && (
          <>
            <Descriptions
              column={1}
              items={[
                {
                  key: 'before',
                  label: '绑定前',
                  children: channel.opChannelId ?? '未绑定',
                },
                { key: 'after', label: '绑定后', children: op },
              ]}
            />
            <Button onClick={() => setPreview(false)}>返回修改</Button>
          </>
        )}
        {error && <Alert type="error" title={error} />}
      </Modal>
      <Modal
        title="确认资源主档状态变更"
        open={toggle}
        confirmLoading={busy}
        onCancel={() => setToggle(false)}
        onOk={() =>
          void apply(() =>
            session.api.toggleChannel(
              channel.id,
              version,
              channel.resourceStatus === 'enabled' ? 'disabled' : 'enabled',
            ),
          )
        }
      >
        <p>
          仅修改本地 Mock 资源启用状态；不撤销真实 OP
          配置，不联动接入或开放状态。
        </p>
        {error && <Alert type="error" title={error} />}
      </Modal>
      {session.permits('channel:history') && (
        <Card title="渠道变更历史" className="resource-card channel-history">
          <Table<ChannelChange>
            rowKey="id"
            size="small"
            scroll={{ x: 650 }}
            dataSource={[...history].reverse()}
            pagination={{ pageSize: 5 }}
            columns={[
              {
                title: '时间',
                dataIndex: 'occurredAt',
                render: (v: string) => new Date(v).toLocaleString('zh-CN'),
              },
              { title: '操作', dataIndex: 'action' },
              { title: '操作人', dataIndex: 'actorUserId' },
              {
                title: '变更字段',
                dataIndex: 'changedFields',
                render: (v: readonly string[]) => v.join('、'),
              },
            ]}
            expandable={{
              expandedRowRender: (e) => (
                <>
                  <p>{e.reason}</p>
                  <Collapse
                    items={[
                      {
                        key: 'snapshots',
                        label: '查看变更前后值（授权技术信息）',
                        children: (
                          <>
                            <strong>变更前</strong>
                            <pre>
                              {JSON.stringify(e.beforeSnapshot, null, 2)}
                            </pre>
                            <strong>变更后</strong>
                            <pre>
                              {JSON.stringify(e.afterSnapshot, null, 2)}
                            </pre>
                          </>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            }}
            locale={{ emptyText: '暂无渠道变更记录' }}
          />
        </Card>
      )}
    </>
  );
}
