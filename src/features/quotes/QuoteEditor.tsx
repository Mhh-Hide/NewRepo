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
import type { QuoteInput, QuoteRow } from '../../services/quotation-types';
import { dimensionLabels, quoteSourceLabels } from '../../domain/quotations';
import { quoteStatusLabels } from '../../domain/statuses';
import { discountBps } from '../../domain/rules';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { resourceErrorMessage } from '../../services/resource-types';
import { useResourceQuery } from '../models/use-resource-query';
import { dateInput, dateISO } from './quote-format';
export interface QuotePreset {
  readonly channelId?: string;
  readonly demandItemId?: string;
  readonly inquiryId?: string;
}
export function QuoteEditor({
  session,
  preset = {},
  prior,
  correction = false,
  onClose,
  onSaved,
}: {
  session: DemoSession;
  preset?: QuotePreset;
  prior?: QuoteRow;
  correction?: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form] = Form.useForm<QuoteInput>();
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const channelId = Form.useWatch('channelId', form);
  const sourceType = Form.useWatch('sourceType', form);
  const priceStatus = Form.useWatch('priceStatus', form);
  const load = useCallback(() => session.api.quoteOptions(), [session.api]);
  const { result, reload } = useResourceQuery(load);
  const submit = async (v: QuoteInput) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const options = result.status === 'ready' ? result.data : null;
      const item = options?.demands.find((i) => i.id === v.demandItemId);
      const inquiry = options?.inquiries.find((i) => i.id === v.inquiryId);
      const input: QuoteInput = {
        channelId: v.channelId,
        demandId: item?.demandId ?? null,
        demandItemId: v.demandItemId || null,
        inquiryId: v.inquiryId || null,
        inquiryVersion: inquiry?.version ?? null,
        previousQuoteId: prior?.quote.id ?? v.previousQuoteId ?? null,
        discount: discountBps(v.discount),
        priceStatus: v.priceStatus,
        sourceType: correction ? 'correction' : v.sourceType,
        effectiveFrom: dateISO(v.effectiveFrom),
        effectiveUntil: dateISO(v.effectiveUntil),
        supplierQuotedAt: dateISO(v.supplierQuotedAt),
        supplierSubmitterReference: v.supplierSubmitterReference || null,
        evidenceReference: v.evidenceReference,
        reason: v.reason,
        priceSpec: {
          currency: v.priceSpec?.currency || null,
          referencePriceSource: v.priceSpec?.referencePriceSource || null,
          specification: v.priceSpec?.specification || null,
          rates: (v.priceSpec?.rates ?? []).map((r) => ({
            dimension: r.dimension,
            quantity: r.quantity,
            unit: r.unit,
            amount: r.amount?.trim() || null,
          })),
        },
      };
      const saved = await session.api.createQuote(input, requestId);
      onSaved(saved.quote.id);
    } catch (e) {
      setError(resourceErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const q = prior?.quote;
  const initial = {
    channelId: q?.channelId ?? preset.channelId,
    demandItemId: q?.demandItemId ?? preset.demandItemId,
    inquiryId: preset.inquiryId,
    previousQuoteId: q?.id,
    sourceType: correction
      ? 'correction'
      : q?.priceStatus === 'temporary'
        ? 'promotion'
        : 'supplier_submission',
    priceStatus: q?.priceStatus === 'temporary' ? 'temporary' : 'reference',
    discount: q?.discount,
    priceSpec: q?.priceSpec ?? { rates: [] },
    effectiveFrom: dateInput(q?.effectiveFrom ?? null),
    effectiveUntil: dateInput(q?.effectiveUntil ?? null),
    supplierQuotedAt: '',
    supplierSubmitterReference: '',
    evidenceReference: '',
    reason: '',
  };
  const title = correction
    ? '更正历史报价'
    : prior
      ? '录入后续报价'
      : '录入采购报价';
  return (
    <Drawer title={title} size={820} open onClose={onClose} destroyOnHidden>
      <Alert
        type="info"
        showIcon
        title="仅模拟采购记录；保存只追加历史，不自动正式生效。"
        description="证据和原始提交人仅填写 mock: 模拟引用。不得录入客户身份、客户售价、真实合同或密钥。"
      />
      {result.status === 'loading' ? (
        <LoadingState />
      ) : result.status === 'error' ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : (
        <Form
          form={form}
          layout="vertical"
          initialValues={initial}
          onFinish={submit}
          onValuesChange={(changed) => {
            if (changed.channelId)
              form.setFieldsValue({
                demandItemId: null,
                inquiryId: null,
                previousQuoteId: null,
              });
            if (changed.inquiryId) {
              const i = result.data.inquiries.find(
                (i) => i.id === changed.inquiryId,
              );
              form.setFieldsValue({ demandItemId: i?.demandItemId ?? null });
            }
            if (changed.sourceType === 'promotion')
              form.setFieldsValue({ priceStatus: 'temporary' });
            if (changed.priceStatus === 'temporary' && !correction)
              form.setFieldsValue({ sourceType: 'promotion' });
          }}
          style={{ marginTop: 20 }}
        >
          <Form.Item
            name="channelId"
            label="报价渠道"
            rules={[{ required: true }]}
          >
            <Select
              aria-label="报价渠道选择"
              disabled={!!prior}
              showSearch
              optionFilterProp="label"
              options={result.data.channels.map((c) => ({
                value: c.channel.id,
                label: `${c.channel.displayName} · ${c.model.name} · ${c.supplier.name}`,
              }))}
            />
          </Form.Item>
          <p className="section-note">
            供应商和模型由渠道推导：
            {result.data.channels.find((c) => c.channel.id === channelId)
              ?.supplier.name ?? '尚未选择'}{' '}
            ·{' '}
            {result.data.channels.find((c) => c.channel.id === channelId)?.model
              .name ?? '尚未选择'}
          </p>
          <div className="quote-form-grid">
            <Form.Item name="demandItemId" label="关联采购需求明细（可空）">
              <Select
                aria-label="报价需求明细"
                allowClear
                disabled={!!prior}
                options={result.data.demands
                  .filter(
                    (i) =>
                      i.modelId ===
                      result.data.channels.find(
                        (c) => c.channel.id === channelId,
                      )?.model.id,
                  )
                  .map((i) => ({ value: i.id, label: i.label }))}
              />
            </Form.Item>
            <Form.Item name="inquiryId" label="关联询价（可空）">
              <Select
                aria-label="报价关联询价"
                allowClear
                options={result.data.inquiries
                  .filter(
                    (i) => i.channelId === channelId && i.status !== 'closed',
                  )
                  .map((i) => ({ value: i.id, label: i.id }))}
              />
            </Form.Item>
          </div>
          {!prior && (
            <Form.Item
              name="previousQuoteId"
              label="前序报价（真实调价可关联，非必填）"
            >
              <Select
                allowClear
                options={result.data.quotes
                  .filter((q) => q.channelId === channelId)
                  .map((q) => ({ value: q.id, label: q.id }))}
              />
            </Form.Item>
          )}
          <div className="quote-form-grid">
            <Form.Item
              name="discount"
              label="上游实际报价折扣（整数基点，8000 = 八折）"
              rules={[
                { required: true },
                {
                  validator: (_, n: unknown) =>
                    typeof n === 'number' &&
                    Number.isSafeInteger(n) &&
                    n >= 0 &&
                    n <= 10000
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error('折扣须为0–10000的整数基点。'),
                        ),
                },
              ]}
            >
              <InputNumber min={0} max={10000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="priceStatus"
              label="录入报价状态"
              rules={[{ required: true }]}
            >
              <Select
                aria-label="录入报价状态"
                options={(
                  ['reference', 'pending_contract', 'temporary'] as const
                ).map((value) => ({ value, label: quoteStatusLabels[value] }))}
              />
            </Form.Item>
          </div>
          <Form.Item
            name="sourceType"
            label="原始报价来源"
            rules={[{ required: true }]}
          >
            <Select
              aria-label="原始报价来源"
              disabled={correction}
              options={Object.entries(quoteSourceLabels)
                .filter(([v]) => correction || v !== 'correction')
                .map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <div className="quote-form-grid">
            <Form.Item
              name="supplierSubmitterReference"
              label="供应商原始提交人引用"
              rules={[
                {
                  required: sourceType === 'supplier_submission',
                  message: '供应商报价需保留模拟原始提交人引用',
                },
              ]}
            >
              <Input placeholder="mock:supplier-contact" maxLength={160} />
            </Form.Item>
            <Form.Item
              name="supplierQuotedAt"
              label="供应商报价日期（北京时间）"
            >
              <Input type="date" />
            </Form.Item>
          </div>
          <Card size="small" title="价格口径与可选绝对单价">
            <Alert
              type="info"
              title="缺少币种、基准、适用规格或计量单位时不可直接比较。金额最多6位小数，不自动套用 Token 单位。"
            />
            <div className="quote-form-grid">
              <Form.Item
                name={['priceSpec', 'currency']}
                label="币种（可未知）"
              >
                <Input
                  placeholder="例如 CNY / USD；未知留空"
                  maxLength={3}
                  onChange={(e) =>
                    form.setFieldValue(
                      ['priceSpec', 'currency'],
                      e.target.value.toUpperCase(),
                    )
                  }
                />
              </Form.Item>
              <Form.Item
                name={['priceSpec', 'referencePriceSource']}
                label="折扣价格基准（可未知）"
              >
                <Input placeholder="仅录入明确的模拟基准引用" maxLength={300} />
              </Form.Item>
            </div>
            <Form.Item
              name={['priceSpec', 'specification']}
              label="适用规格（可未知）"
            >
              <Input
                maxLength={300}
                placeholder="同规格才能比较；不要编造官方规格"
              />
            </Form.Item>
            <Form.List name={['priceSpec', 'rates']}>
              {(fields, { add, remove }) => (
                <>
                  {fields.map((f, index) => (
                    <Card
                      size="small"
                      className="quote-rate"
                      key={f.key}
                      title={`计价维度 ${index + 1}`}
                      extra={
                        <Button onClick={() => remove(f.name)}>
                          移除此维度
                        </Button>
                      }
                    >
                      <div className="quote-form-grid">
                        <Form.Item
                          name={[f.name, 'dimension']}
                          label={`维度 ${index + 1} 类型`}
                          rules={[{ required: true }]}
                        >
                          <Select
                            options={Object.entries(dimensionLabels).map(
                              ([value, label]) => ({ value, label }),
                            )}
                          />
                        </Form.Item>
                        <Form.Item
                          name={[f.name, 'amount']}
                          label={`维度 ${index + 1} 绝对单价（可未知）`}
                          rules={[
                            {
                              pattern: /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/,
                              message: '非负十进制，最多12位整数、6位小数',
                            },
                          ]}
                        >
                          <Input placeholder="例如 0.125000；未知留空" />
                        </Form.Item>
                        <Form.Item
                          name={[f.name, 'quantity']}
                          label={`维度 ${index + 1} 每份计量数量`}
                          rules={[{ required: true }]}
                        >
                          <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                          name={[f.name, 'unit']}
                          label={`维度 ${index + 1} 计量单位`}
                          rules={[{ required: true, whitespace: true }]}
                        >
                          <Input
                            maxLength={80}
                            placeholder="明确填写 Token / 张 / 秒等"
                          />
                        </Form.Item>
                      </div>
                    </Card>
                  ))}
                  <Button
                    style={{ marginTop: 12 }}
                    onClick={() => add({ amount: null })}
                  >
                    添加计价维度
                  </Button>
                </>
              )}
            </Form.List>
          </Card>
          <div className="quote-form-grid">
            <Form.Item
              name="effectiveFrom"
              label="生效日期（北京时间00:00）"
              rules={[{ required: priceStatus === 'temporary' }]}
            >
              <Input type="date" />
            </Form.Item>
            <Form.Item
              name="effectiveUntil"
              label="截止日期（北京时间00:00，不含）"
              rules={[{ required: priceStatus === 'temporary' }]}
            >
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item
            name="evidenceReference"
            label="报价证据模拟引用"
            rules={[
              { required: true },
              {
                pattern: /^mock:[A-Za-z0-9_:/.-]+$/,
                message: '仅使用 mock: 模拟引用',
              },
            ]}
          >
            <Input placeholder="mock:evidence:quote" maxLength={155} />
          </Form.Item>
          <Form.Item
            name="reason"
            label={correction ? '更正原因（不覆盖原值）' : '报价来源说明与备注'}
            rules={[{ required: true, whitespace: true }]}
          >
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
          {error && <Alert type="error" title={error} showIcon />}
          <Space>
            <Button type="primary" htmlType="submit" loading={busy}>
              保存报价记录
            </Button>
            <Button onClick={onClose}>取消</Button>
          </Space>
        </Form>
      )}
    </Drawer>
  );
}
