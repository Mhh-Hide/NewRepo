import { useCallback, useState } from 'react';
import {
  Button,
  Card,
  Collapse,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { Link } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type {
  CooperationIncident,
  CooperationIncidentInput,
} from '../../services/cooperation-types';
import { channelTypeDisplay } from '../../domain/channel-types';
import { channelTypeLabels } from '../../domain/statuses';
import { useResourceQuery } from '../models/use-resource-query';
import { ErrorState, LoadingState } from '../../components/FeedbackStates';
export function CooperationPanel({
  session,
  supplierId,
}: {
  session: DemoSession;
  supplierId: string;
}) {
  const load = useCallback(async () => {
    const [supplier, channels, models, vendors, progress, incidents, legacy] =
      await Promise.all([
        session.api.getSupplier(supplierId),
        session.api.listChannels({ supplierId }),
        session.api.listModels(),
        session.api.listVendors(),
        session.permits('lifecycle:read')
          ? session.api.queryLifecycle({ supplierId })
          : null,
        session.api.supplierAccidents(supplierId),
        session.api.listIncidents(),
      ]);
    return {
      supplier,
      channels,
      models,
      vendors,
      progress,
      incidents,
      legacy: legacy.filter((r) => r.supplierId === supplierId),
    };
  }, [session, supplierId]);
  const { result, reload } = useResourceQuery(load);
  const [editor, setEditor] = useState<CooperationIncident | null | false>(
      false,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [form] = Form.useForm<CooperationIncidentInput>();
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error')
    return <ErrorState message={result.message} onRetry={reload} />;
  const d = result.data;
  const open = (row: CooperationIncident | null) => {
    setEditor(row);
    setError('');
    form.resetFields();
    form.setFieldsValue(
      row ?? {
        date: new Date().toLocaleDateString('sv-SE', {
          timeZone: 'Asia/Shanghai',
        }),
        description: '',
        scope: '',
        result: '',
        note: '',
        channelIds: [],
      },
    );
  };
  return (
    <>
      <Card title="渠道合作进展" className="resource-card">
        <Collapse
          ghost
          defaultActiveKey={['domestic', 'overseas']}
          items={(['domestic', 'overseas'] as const).map((domain) => ({
            key: domain,
            label: domain === 'domestic' ? '国内厂商' : '海外厂商',
            children: (
              <Table
                rowKey="id"
                size="middle"
                pagination={false}
                scroll={{ x: 1100 }}
                dataSource={d.channels.filter(
                  (c) =>
                    d.vendors.find(
                      (v) =>
                        v.id ===
                        d.models.find((m) => m.id === c.modelId)?.vendorId,
                    )?.businessDomain === domain,
                )}
                columns={[
                  {
                    title: '模型',
                    width: 170,
                    render: (_, c) =>
                      d.models.find((m) => m.id === c.modelId)?.name,
                  },
                  {
                    title: '渠道',
                    width: 220,
                    render: (_, c) => (
                      <Link to={`/channels/${c.id}`}>{c.displayName}</Link>
                    ),
                  },
                  {
                    title: '渠道类型',
                    width: 160,
                    render: (_, c) => {
                      const v = d.vendors.find(
                        (v) =>
                          v.id ===
                          d.models.find((m) => m.id === c.modelId)?.vendorId,
                      );
                      return v
                        ? channelTypeDisplay(
                            c.channelType,
                            v,
                            channelTypeLabels[c.channelType],
                          )
                        : channelTypeLabels[c.channelType];
                    },
                  },
                  {
                    title: '接入阶段',
                    width: 220,
                    render: (_, c) => {
                      const p = d.progress?.rows.find((p) => p.id === c.id);
                      return (
                        <Tag>
                          {p?.record?.terminated
                            ? '已终止'
                            : p?.record?.held
                              ? '已暂停'
                              : p?.schedulable
                                ? '已上线'
                                : c.connectivityStatus === 'failed'
                                  ? '连通性未通过，待优化'
                                  : c.connectivityStatus === 'running'
                                    ? '第二阶段连通性测试中'
                                    : p?.record?.contractStage === 'effective'
                                      ? '合同已生效，待配置'
                                      : c.qualityStatus === 'failed'
                                        ? '质量未通过，待供应商优化'
                                        : c.qualityStatus === 'running'
                                          ? '第一阶段质量测试中'
                                          : ['passed', 'exempted'].includes(
                                                c.qualityStatus,
                                              )
                                            ? '质量通过，合同推进中'
                                            : '待质量测试'}
                        </Tag>
                      );
                    },
                  },
                  {
                    title: '合同类型',
                    width: 120,
                    render: (_, c) => {
                      const r = d.progress?.rows.find(
                        (p) => p.id === c.id,
                      )?.record;
                      return r?.contractNumber ? '合同类型待确认' : '暂无合同';
                    },
                  },
                  {
                    title: '负责人',
                    width: 100,
                    render: (_, c) =>
                      d.progress?.rows.find((p) => p.id === c.id)
                        ?.currentOwner || '待分配',
                  },
                  {
                    title: '下一步',
                    width: 190,
                    render: (_, c) =>
                      d.progress?.rows.find((p) => p.id === c.id)?.nextAction ||
                      '确认资源与测试安排',
                  },
                ]}
                locale={{ emptyText: '暂无此类授权渠道' }}
              />
            ),
          }))}
        />
      </Card>
      {d.supplier?.capabilities.edit && (
        <Card
          title="事故记录"
          className="resource-card"
          extra={<Button onClick={() => open(null)}>新增事故</Button>}
        >
          {d.legacy.length > 0 && (
            <details>
              <summary>既有事故记录 · {d.legacy.length} 条</summary>
              {d.legacy.map((r) => (
                <p key={r.id}>
                  {r.createdAt.slice(0, 10)} · {r.summary} · {r.status}
                </p>
              ))}
            </details>
          )}
          <Table<CooperationIncident>
            rowKey="id"
            dataSource={[...d.incidents]}
            pagination={{ pageSize: 5 }}
            scroll={{ x: 800 }}
            columns={[
              { title: '发生日期', dataIndex: 'date', width: 120 },
              { title: '问题描述', dataIndex: 'description' },
              { title: '受影响范围', dataIndex: 'scope' },
              { title: '处理结果', dataIndex: 'result' },
              {
                title: '操作',
                width: 90,
                render: (_, r) => (
                  <Button type="link" onClick={() => open(r)}>
                    编辑
                  </Button>
                ),
              },
            ]}
            expandable={{
              expandedRowRender: (r) => (
                <div>
                  <p>备注：{r.note || '—'}</p>
                  <details>
                    <summary>修改历史 · {r.history.length} 次</summary>
                    {r.history.map((h, i) => (
                      <p key={i}>
                        {h.at.slice(0, 10)} · {h.actor} · {h.after.description}{' '}
                        · {h.after.result || '待处理'}
                      </p>
                    ))}
                  </details>
                </div>
              ),
            }}
            locale={{ emptyText: '暂无事故记录' }}
          />
        </Card>
      )}
      {editor !== false && (
        <Drawer
          title={editor ? '编辑事故' : '新增事故'}
          open
          size={580}
          onClose={() => setEditor(false)}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={async (v) => {
              setBusy(true);
              setError('');
              try {
                await session.api.saveSupplierAccident(
                  supplierId,
                  editor?.id ?? null,
                  editor?.version ?? 0,
                  {
                    ...v,
                    scope: v.scope || '',
                    result: v.result || '',
                    note: v.note || '',
                    channelIds: v.channelIds || [],
                  },
                );
                setEditor(false);
                reload();
                message.success('事故记录已保存');
              } catch (e) {
                setError(e instanceof Error ? e.message : '保存失败');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Form.Item
              name="date"
              label="发生日期"
              rules={[{ required: true }]}
            >
              <Input type="date" />
            </Form.Item>
            <Form.Item
              name="description"
              label="问题描述"
              rules={[{ required: true, whitespace: true }]}
            >
              <Input.TextArea rows={3} maxLength={4000} />
            </Form.Item>
            <Form.Item name="scope" label="受影响范围">
              <Input maxLength={4000} />
            </Form.Item>
            <Form.Item name="channelIds" label="关联渠道（可选）">
              <Select
                mode="multiple"
                options={d.channels.map((c) => ({
                  value: c.id,
                  label: c.displayName,
                }))}
              />
            </Form.Item>
            <Form.Item name="result" label="最终处理结果">
              <Input.TextArea maxLength={4000} />
            </Form.Item>
            <Form.Item name="note" label="备注">
              <Input.TextArea maxLength={4000} />
            </Form.Item>
            {error && <p role="alert">{error}</p>}
            <Space>
              <Button type="primary" htmlType="submit" loading={busy}>
                保存事故
              </Button>
              <Button onClick={() => setEditor(false)}>取消</Button>
            </Space>
          </Form>
        </Drawer>
      )}
    </>
  );
}
