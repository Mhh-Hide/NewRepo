import { Button, Drawer, Form, Input, InputNumber, Select, Space } from 'antd';
import type { QuoteInput, QuoteOptions } from '../../services/quotation-types';
import { dimensionLabels, quoteSourceLabels } from '../../domain/quotations';
import { quoteStatusLabels } from '../../domain/statuses';
import { dateISO, dateInput } from '../quotes/quote-format';
export function BulkItemEditor({
  input,
  options,
  supplierId,
  onClose,
  onSave,
}: {
  input: Partial<QuoteInput>;
  options: QuoteOptions;
  supplierId: string;
  onClose: () => void;
  onSave: (input: Partial<QuoteInput>) => void;
}) {
  const [form] = Form.useForm<Partial<QuoteInput>>();
  const channel = Form.useWatch('channelId', form);
  const selected = options.channels.find((c) => c.channel.id === channel);
  return (
    <Drawer title="编辑报价行" open size={780} onClose={onClose}>
      <p>
        允许保存未完成草稿；提交前统一校验。日期为北京时间 00:00，截止时间不含。
      </p>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          ...input,
          effectiveFrom: dateInput(input.effectiveFrom ?? null),
          effectiveUntil: dateInput(input.effectiveUntil ?? null),
          supplierQuotedAt: dateInput(input.supplierQuotedAt ?? null),
        }}
        onFinish={(v) => {
          const demand = options.demands.find((d) => d.id === v.demandItemId);
          const inquiry = options.inquiries.find((i) => i.id === v.inquiryId);
          const { discount, ...fields } = v;
          const rest = Object.fromEntries(
            Object.entries(fields).filter(([, value]) => value !== undefined),
          );
          onSave({
            ...rest,
            ...(typeof discount === 'number' ? { discount } : {}),
            channelId: v.channelId ?? '',
            demandId: demand?.demandId ?? null,
            demandItemId: demand?.id ?? null,
            inquiryId: inquiry?.id ?? null,
            inquiryVersion: inquiry?.version ?? null,
            previousQuoteId: v.previousQuoteId || null,
            effectiveFrom: dateISO(v.effectiveFrom),
            effectiveUntil: dateISO(v.effectiveUntil),
            supplierQuotedAt: dateISO(v.supplierQuotedAt),
            priceSpec: {
              currency: v.priceSpec?.currency || null,
              referencePriceSource: v.priceSpec?.referencePriceSource || null,
              specification: v.priceSpec?.specification || null,
              rates: (v.priceSpec?.rates ?? []).map((r) => ({
                ...r,
                amount: r.amount || null,
              })),
            },
          });
        }}
        onValuesChange={(v) => {
          if ('channelId' in v)
            form.setFieldsValue({
              previousQuoteId: null,
              demandItemId: null,
              inquiryId: null,
            });
        }}
      >
        <Form.Item name="channelId" label="报价渠道">
          <Select
            aria-label="批次报价渠道"
            showSearch
            optionFilterProp="label"
            options={options.channels
              .filter((c) => c.supplier.id === supplierId)
              .map((c) => ({
                value: c.channel.id,
                label: `${c.model.name} · ${c.channel.displayName}`,
              }))}
          />
        </Form.Item>
        <Form.Item
          name="previousQuoteId"
          label="明确选择历史参照（可不选，不自动选最低或最近价）"
        >
          <Select
            allowClear
            options={options.quotes
              .filter((q) => q.channelId === channel)
              .map((q) => ({ value: q.id, label: q.id }))}
          />
        </Form.Item>
        <div className="quote-form-grid">
          <Form.Item name="discount" label="报价折扣（整数基点，8000 = 八折）">
            <InputNumber aria-label="行报价折扣" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="priceStatus" label="报价状态">
            <Select
              options={(
                ['reference', 'pending_contract', 'temporary'] as const
              ).map((value) => ({ value, label: quoteStatusLabels[value] }))}
            />
          </Form.Item>
          <Form.Item name="sourceType" label="报价来源">
            <Select
              options={Object.entries(quoteSourceLabels).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </Form.Item>
          <Form.Item
            name="supplierSubmitterReference"
            label="供应商提交人模拟引用"
          >
            <Input placeholder="mock:supplier-contact" />
          </Form.Item>
          <Form.Item name="effectiveFrom" label="拟生效日期">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="effectiveUntil" label="拟截止日期（不含）">
            <Input type="date" />
          </Form.Item>
          <Form.Item
            name="supplierQuotedAt"
            label="供应商实际报价日期（未知留空）"
          >
            <Input type="date" />
          </Form.Item>
          <Form.Item name="demandItemId" label="采购需求明细（可空）">
            <Select
              allowClear
              options={options.demands
                .filter((d) => d.modelId === selected?.model.id)
                .map((d) => ({ value: d.id, label: d.label }))}
            />
          </Form.Item>
          <Form.Item name="inquiryId" label="关联询价（可空）">
            <Select
              allowClear
              options={options.inquiries
                .filter((i) => i.channelId === channel && i.status !== 'closed')
                .map((i) => ({ value: i.id, label: i.id }))}
            />
          </Form.Item>
        </div>
        <p>币种、基准、规格、金额未知时保持为空，不自动补值。</p>
        <div className="quote-form-grid">
          <Form.Item name={['priceSpec', 'currency']} label="币种">
            <Input maxLength={3} />
          </Form.Item>
          <Form.Item
            name={['priceSpec', 'referencePriceSource']}
            label="价格基准"
          >
            <Input />
          </Form.Item>
        </div>
        <Form.Item name={['priceSpec', 'specification']} label="适用规格">
          <Input />
        </Form.Item>
        <Form.List name={['priceSpec', 'rates']}>
          {(fields, { add, remove }) => (
            <>
              {fields.map((f) => (
                <div className="bulk-rate" key={f.key}>
                  <Form.Item
                    name={[f.name, 'dimension']}
                    label="计费维度"
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={Object.entries(dimensionLabels).map(
                        ([value, label]) => ({ value, label }),
                      )}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[f.name, 'quantity']}
                    label="每份数量"
                    rules={[{ required: true }]}
                  >
                    <InputNumber />
                  </Form.Item>
                  <Form.Item
                    name={[f.name, 'unit']}
                    label="计量单位"
                    rules={[{ required: true }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name={[f.name, 'amount']}
                    label="绝对单价（可未知，十进制）"
                  >
                    <Input />
                  </Form.Item>
                  <Button onClick={() => remove(f.name)}>移除维度</Button>
                </div>
              ))}
              <Button onClick={() => add({})}>添加计价维度</Button>
            </>
          )}
        </Form.List>
        <Form.Item
          name="evidenceReference"
          label="行证据模拟引用（空则使用共同来源）"
        >
          <Input placeholder="mock:evidence:bulk" />
        </Form.Item>
        <Form.Item name="reason" label="行说明或更正原因（空则使用共同说明）">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">
            保留行编辑
          </Button>
          <Button aria-label="取消" onClick={onClose}>
            取消
          </Button>
        </Space>
      </Form>
    </Drawer>
  );
}
