import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
} from 'antd';
import type { DemoSession } from '../../services/demo-session';
import type { ChannelInput } from '../../services/channel-types';
import type { ChannelResourceDetail } from '../../services/resource-types';
import { resourceErrorMessage } from '../../services/resource-types';
import { useResourceQuery } from '../models/use-resource-query';
import { ErrorState, LoadingState } from '../../components/FeedbackStates';
import { channelTypeLabels } from '../../domain/statuses';
interface Values extends ChannelInput {
  supplierId: string;
  modelId: string;
}
export function ChannelEditor({
  session,
  channel,
  version,
  onClose,
  onSaved,
}: {
  session: DemoSession;
  channel?: ChannelResourceDetail;
  version?: number;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form] = Form.useForm<Values>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const [suppliers, models] = await Promise.all([
      session.api.listSuppliers(),
      session.api.listModels(),
    ]);
    return { suppliers, models };
  }, [session.api]);
  const { result, reload } = useResourceQuery(load);
  const submit = async (values: Values) => {
    setSaving(true);
    setError('');
    try {
      const input: ChannelInput = {
        displayName: values.displayName,
        channelType: values.channelType,
        modelInvocationName: values.modelInvocationName ?? '',
        endpointReference: values.endpointReference ?? '',
        tpm: values.tpm ?? null,
        rpm: values.rpm ?? null,
        concurrencyLimit: values.concurrencyLimit ?? null,
        ttftMs: values.ttftMs ?? null,
      };
      const saved = channel
        ? await session.api.updateChannel(channel.id, version!, input)
        : await session.api.createChannel({
            ...input,
            supplierId: values.supplierId,
            modelId: values.modelId,
          });
      onSaved(saved.id);
    } catch (e) {
      setError(resourceErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      title={channel ? '编辑渠道' : '新增渠道'}
      open
      onClose={onClose}
      size={600}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        title="仅维护 Mock 主档；不执行测试、上线或生产配置。请勿填写密钥或真实 Endpoint。"
      />
      {result.status === 'loading' ? (
        <LoadingState />
      ) : result.status === 'error' ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : (
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={
            channel
              ? { ...channel }
              : {
                  channelType: 'other',
                  tpm: null,
                  rpm: null,
                  concurrencyLimit: null,
                  ttftMs: null,
                }
          }
          style={{ marginTop: 20 }}
        >
          {!channel && (
            <>
              <Form.Item
                name="supplierId"
                label="供应商"
                rules={[{ required: true, message: '请选择供应商' }]}
              >
                <Select
                  aria-label="渠道供应商"
                  showSearch
                  optionFilterProp="label"
                  options={result.data.suppliers
                    .filter((s) => s.status === 'enabled')
                    .map((s) => ({ value: s.id, label: s.name }))}
                />
              </Form.Item>
              <Form.Item
                name="modelId"
                label="模型"
                rules={[{ required: true, message: '请选择模型' }]}
              >
                <Select
                  aria-label="渠道模型"
                  showSearch
                  optionFilterProp="label"
                  options={result.data.models.map((m) => ({
                    value: m.id,
                    label: m.name,
                  }))}
                />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="displayName"
            label="渠道展示名称"
            rules={[
              { required: true, whitespace: true, message: '请填写渠道名称' },
            ]}
          >
            <Input maxLength={160} />
          </Form.Item>
          <Form.Item
            name="channelType"
            label="渠道类型"
            rules={[{ required: true }]}
          >
            <Select
              aria-label="渠道类型"
              options={Object.entries(channelTypeLabels).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </Form.Item>
          <Form.Item name="modelInvocationName" label="实际模型调用名称">
            <Input maxLength={160} />
          </Form.Item>
          <Form.Item name="endpointReference" label="Endpoint 非敏感引用">
            <Input maxLength={160} placeholder="仅 Mock 引用，不含密钥" />
          </Form.Item>
          <div className="channel-numbers">
            {(['tpm', 'rpm', 'concurrencyLimit', 'ttftMs'] as const).map(
              (key, i) => (
                <Form.Item
                  key={key}
                  name={key}
                  label={['TPM', 'RPM', '并发上限', 'TTFT (ms)'][i]}
                  rules={[
                    {
                      validator: (_, value: unknown) =>
                        value === null ||
                        value === undefined ||
                        (typeof value === 'number' &&
                          Number.isFinite(value) &&
                          value >= 0 &&
                          (key === 'ttftMs' || Number.isSafeInteger(value)))
                          ? Promise.resolve()
                          : Promise.reject(
                              new Error(
                                'TPM/RPM/并发须为非负整数，TTFT 为非负毫秒数。',
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
              ),
            )}
          </div>
          {error && (
            <Alert
              type="error"
              showIcon
              title={error}
              style={{ marginBottom: 16 }}
            />
          )}
          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存渠道
            </Button>
            <Button onClick={onClose}>取消</Button>
          </Space>
        </Form>
      )}
    </Drawer>
  );
}
