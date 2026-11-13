import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
} from 'antd';
import type { DemoSession } from '../../services/demo-session';
import type {
  SourcingDetail,
  SourcingInput,
  SourcingItemInput,
} from '../../services/sourcing-types';
import { priorityLabels } from '../../domain/sourcing';
import { discountBps } from '../../domain/rules';
import { resourceErrorMessage } from '../../services/resource-types';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { useResourceQuery } from '../models/use-resource-query';
const priorities = Object.entries(priorityLabels).map(([value, label]) => ({
  value,
  label,
}));
export function SourcingEditor({
  session,
  initial,
  onClose,
  onSaved,
}: {
  session: DemoSession;
  initial?: SourcingDetail;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form] = Form.useForm<SourcingInput>();
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const [models, customers] = await Promise.all([
      session.api.listModels(),
      session.api.listSourcingCustomers(),
    ]);
    return { models, customers };
  }, [session.api]);
  const { result, reload } = useResourceQuery(load);
  const save = async (v: SourcingInput) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const items: SourcingItemInput[] = v.items.map((i) => ({
        ...(i.id ? { id: i.id } : {}),
        modelId: i.modelId,
        requiredTpm: i.requiredTpm ?? null,
        requiredRpm: i.requiredRpm ?? null,
        requiredConcurrency: i.requiredConcurrency ?? null,
        requiredTtftMs: i.requiredTtftMs ?? null,
        targetPurchaseDiscount: discountBps(i.targetPurchaseDiscount),
        requiredRegion: i.requiredRegion ?? '',
        priority: i.priority,
      }));
      const input: SourcingInput = {
        title: v.title,
        description: v.description ?? '',
        sharedTitle: v.sharedTitle,
        sharedSummary: v.sharedSummary,
        priority: v.priority,
        customerId: v.customerId ?? null,
        dueAt: v.dueAt || null,
        items,
      };
      const d = initial
        ? await session.api.updateSourcingDemand(
            initial.demand.id,
            initial.demand.version,
            input,
          )
        : await session.api.createSourcingDemand(input, requestId);
      onSaved(d.id);
    } catch (e) {
      setError(resourceErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={initial ? '维护采购需求' : '新增采购需求'}
      open
      size={860}
      onClose={onClose}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        title="仅模拟需求。运营受限信息与采购共享内容分别填写。"
        description="采购共享标题、摘要、地区限制及后续跟进中请勿填写客户身份、售价或受限背景；系统不以关键词替换冒充脱敏。"
      />
      {result.status === 'loading' ? (
        <LoadingState />
      ) : result.status === 'error' ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : (
        <Form
          form={form}
          layout="vertical"
          onFinish={save}
          initialValues={
            initial
              ? { ...initial.demand, items: initial.items.map((i) => i.item) }
              : {
                  priority: 'normal',
                  customerId: null,
                  dueAt: null,
                  items: [{ priority: 'normal' }],
                }
          }
          style={{ marginTop: 20 }}
        >
          <Card size="small" title="运营受限信息">
            <Form.Item
              label="运营需求标题（受限）"
              name="title"
              rules={[{ required: true, whitespace: true }]}
            >
              <Input maxLength={2000} />
            </Form.Item>
            <Form.Item label="运营原始说明（受限）" name="description">
              <Input.TextArea maxLength={4000} rows={2} />
            </Form.Item>
            <Form.Item label="客户关联（可为空，仅运营）" name="customerId">
              <Select
                allowClear
                aria-label="需求客户关联"
                options={result.data.customers.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            </Form.Item>
          </Card>
          <Card size="small" title="采购共享需求" style={{ marginTop: 16 }}>
            <Form.Item
              label="采购共享标题"
              name="sharedTitle"
              rules={[{ required: true, whitespace: true }]}
            >
              <Input maxLength={2000} />
            </Form.Item>
            <Form.Item
              label="采购共享需求摘要"
              name="sharedSummary"
              rules={[{ required: true, whitespace: true }]}
            >
              <Input.TextArea rows={3} maxLength={2000} />
            </Form.Item>
            <div className="sourcing-form-grid">
              <Form.Item
                label="需求优先级"
                name="priority"
                rules={[{ required: true }]}
              >
                <Select options={priorities} />
              </Form.Item>
              <Form.Item label="预计完成日期（可选）" name="dueAt">
                <Input type="date" />
              </Form.Item>
            </div>
          </Card>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                <div className="sourcing-item-heading">
                  <h3>模型需求明细</h3>
                  <Button onClick={() => add({ priority: 'normal' })}>
                    添加模型明细
                  </Button>
                </div>
                {fields.map((field, index) => (
                  <Card
                    size="small"
                    className="sourcing-item"
                    key={field.key}
                    title={`模型明细 ${index + 1}`}
                    extra={
                      index >= (initial?.items.length ?? 0) &&
                      fields.length > 1 ? (
                        <Button onClick={() => remove(field.name)}>
                          移除此新明细
                        </Button>
                      ) : null
                    }
                  >
                    <Form.Item name={[field.name, 'id']} hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'modelId']}
                      label={`明细 ${index + 1} 模型`}
                      rules={[{ required: true, message: '请选择授权模型' }]}
                    >
                      <Select
                        disabled={index < (initial?.items.length ?? 0)}
                        aria-label={`明细 ${index + 1} 模型选择`}
                        showSearch
                        optionFilterProp="label"
                        options={result.data.models.map((m) => ({
                          value: m.id,
                          label: m.name,
                        }))}
                      />
                    </Form.Item>
                    <div className="sourcing-form-grid">
                      {(
                        [
                          'requiredTpm',
                          'requiredRpm',
                          'requiredConcurrency',
                          'requiredTtftMs',
                        ] as const
                      ).map((key, i) => (
                        <Form.Item
                          key={key}
                          name={[field.name, key]}
                          label={`明细 ${index + 1} ${['TPM', 'RPM', '并发', 'TTFT (ms)'][i]}`}
                          rules={[
                            {
                              validator: (_, v: unknown) =>
                                v === undefined ||
                                v === null ||
                                (typeof v === 'number' &&
                                  Number.isFinite(v) &&
                                  v >= 0 &&
                                  (key === 'requiredTtftMs' ||
                                    Number.isSafeInteger(v)))
                                  ? Promise.resolve()
                                  : Promise.reject(
                                      new Error(
                                        '请输入非负数；TPM/RPM/并发为整数。',
                                      ),
                                    ),
                            },
                          ]}
                        >
                          <InputNumber
                            min={0}
                            placeholder="未知（留空）"
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      ))}
                    </div>
                    <Form.Item
                      name={[field.name, 'targetPurchaseDiscount']}
                      label={`明细 ${index + 1} 目标采购折扣（基点，8000 = 八折）`}
                      rules={[
                        { required: true, message: '请填写采购目标' },
                        {
                          validator: (_, v: unknown) =>
                            typeof v === 'number' &&
                            Number.isSafeInteger(v) &&
                            v >= 0 &&
                            v <= 10000
                              ? Promise.resolve()
                              : Promise.reject(
                                  new Error('折扣须为 0–10000 的整数基点。'),
                                ),
                        },
                      ]}
                    >
                      <InputNumber
                        min={0}
                        max={10000}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                    <div className="sourcing-form-grid">
                      <Form.Item
                        name={[field.name, 'requiredRegion']}
                        label={`明细 ${index + 1} 地区或部署限制`}
                      >
                        <Input
                          maxLength={300}
                          placeholder="可选；不决定业务域"
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'priority']}
                        label={`明细 ${index + 1} 优先级`}
                        rules={[{ required: true }]}
                      >
                        <Select options={priorities} />
                      </Form.Item>
                    </div>
                  </Card>
                ))}
              </>
            )}
          </Form.List>
          {error && <Alert type="error" title={error} showIcon />}
          <Space style={{ marginTop: 16 }}>
            <Button type="primary" htmlType="submit" loading={busy}>
              保存采购需求
            </Button>
            <Button onClick={onClose}>取消</Button>
          </Space>
        </Form>
      )}
    </Drawer>
  );
}
