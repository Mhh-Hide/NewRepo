import { useCallback, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import { Link, useOutletContext } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import { PageHeader } from '../../components/PageHeader';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { useResourceQuery } from '../models/use-resource-query';
import {
  channelTypeDisplay,
  channelTypeOptions,
} from '../../domain/channel-types';
import { channelTypeLabels, type ChannelType } from '../../domain/statuses';
import { DiscountInput } from '../procurement/DiscountInput';
import { discountText } from '../procurement/discount';
import { discountBps } from '../../domain/rules';
import { dateISO, displayDate } from '../quotes/quote-format';
interface Entry {
  supplierId: string;
  modelId: string;
  channelType: ChannelType;
  discount: number;
  date: string;
  displayName?: string;
  promotionFrom?: string;
  promotionUntil?: string;
  remark?: string;
}
export default function PriceSourcingPage() {
  const session = useOutletContext<DemoSession>();
  const [filters, setFilters] = useState<Record<string, string>>({}),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [form] = Form.useForm<Entry>();
  const modelId = Form.useWatch('modelId', form);
  const load = useCallback(async () => {
    const [data, options, models, vendors] = await Promise.all([
      session.api.queryQuotes({
        page,
        pageSize: 10,
        search: filters.search || '',
        ...(filters.model ? { modelId: filters.model } : {}),
        ...(filters.supplier ? { supplierId: filters.supplier } : {}),
        ...(filters.type ? { channelType: filters.type } : {}),
        ...(filters.limited ? { limited: filters.limited === 'yes' } : {}),
        ...(filters.focus ? { priorityOnly: true } : {}),
      }),
      session.api.bulkQuoteOptions(),
      session.api.listModels(),
      session.api.listVendors(),
    ]);
    const stars = await Promise.all(
      data.rows.map(async (r) => ({
        id: r.quote.id,
        value: await session.api.quoteFollowup(r.quote.id),
      })),
    );
    return { data, options, models, vendors, stars };
  }, [session.api, filters, page]);
  const { result, reload } = useResourceQuery(load);
  const filter = (key: string, v: string) => {
    setFilters((p) => ({ ...p, [key]: v }));
    setPage(1);
  };
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error')
    return <ErrorState message={result.message} onRetry={reload} />;
  const d = result.data;
  const vendor = d.vendors.find(
    (v) => v.id === d.models.find((m) => m.id === modelId)?.vendorId,
  );
  const types = vendor ? channelTypeOptions(vendor) : [];
  const select = (
    key: string,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <Select
      aria-label={label}
      value={filters[key] || ''}
      style={{ minWidth: 150 }}
      onChange={(v) => filter(key, v)}
      options={[{ value: '', label: `全部${label}` }, ...options]}
    />
  );
  return (
    <>
      <PageHeader
        title="价格寻源表"
        description=""
        group="业务协同"
        actions={
          <Button
            type="primary"
            onClick={() => {
              setError('');
              form.resetFields();
              form.setFieldValue(
                'date',
                new Date().toLocaleDateString('sv-SE', {
                  timeZone: 'Asia/Shanghai',
                }),
              );
              setOpen(true);
            }}
          >
            新增报价
          </Button>
        }
      />
      <Card>
        <div className="resource-filters">
          <Input
            aria-label="寻源搜索"
            placeholder="搜索模型、供应商或渠道"
            value={filters.search || ''}
            onChange={(e) => filter('search', e.target.value)}
          />
          {select(
            'model',
            '模型',
            d.models.map((m) => ({ value: m.id, label: m.name })),
          )}
          {select(
            'supplier',
            '供应商',
            d.options.suppliers.map((s) => ({ value: s.id, label: s.name })),
          )}
          {select(
            'type',
            '渠道类型',
            Object.entries(channelTypeLabels).map(([value, label]) => ({
              value,
              label,
            })),
          )}
          {select('limited', '限时状态', [
            { value: 'yes', label: '限时' },
            { value: 'no', label: '不限时' },
          ])}
          {select('focus', '跟进状态', [{ value: 'yes', label: '重点跟进' }])}
        </div>
        <Table
          rowKey={(r) => r.quote.id}
          dataSource={[...d.data.rows]}
          scroll={{ x: 1000 }}
          pagination={{
            current: page,
            pageSize: 10,
            total: d.data.total,
            onChange: setPage,
          }}
          columns={[
            { title: '模型名称', width: 190, render: (_, r) => r.model.name },
            {
              title: '供应商',
              width: 150,
              render: (_, r) => (
                <span title={r.supplier.name}>
                  {r.supplier.shortCode || r.supplier.name}
                </span>
              ),
            },
            {
              title: '渠道类型',
              width: 180,
              render: (_, r) =>
                channelTypeDisplay(
                  r.channel.channelType,
                  r.vendor,
                  channelTypeLabels[r.channel.channelType],
                ),
            },
            {
              title: '报价折扣',
              width: 130,
              render: (_, r) => (
                <span>
                  {discountText(r.quote.discount)}
                  {r.validity === 'expired' && <Tag>已结束</Tag>}
                </span>
              ),
            },
            {
              title: '是否限时',
              width: 100,
              render: (_, r) =>
                r.quote.priceStatus === 'temporary' ? <Tag>限时</Tag> : '否',
            },
            {
              title: '重点跟进',
              width: 110,
              render: (_, r) => (
                <Switch
                  aria-label={`重点跟进 ${r.quote.id}`}
                  checked={
                    d.stars.find((s) => s.id === r.quote.id)?.value || false
                  }
                  onChange={async (v) => {
                    try {
                      await session.api.setQuoteFollowup(r.quote.id, v);
                      reload();
                    } catch (e) {
                      message.error(
                        e instanceof Error ? e.message : '保存失败',
                      );
                    }
                  }}
                />
              ),
            },
            {
              title: '操作',
              width: 140,
              render: (_, r) => (
                <Space>
                  <Link to={`/quotes/${r.quote.id}`}>报价详情</Link>
                  <Link to={`/channels/${r.channel.id}`}>渠道</Link>
                </Space>
              ),
            },
          ]}
          expandable={{
            expandedRowRender: (r) => (
              <p>
                询价日期：{displayDate(r.quote.supplierQuotedAt)} · 生效：
                {displayDate(r.quote.effectiveFrom)} · 截止：
                {r.quote.effectiveUntil
                  ? displayDate(r.quote.effectiveUntil)
                  : '未指定'}
                <br />
                备注：{r.quote.reason}
              </p>
            ),
          }}
        />
      </Card>
      <Drawer
        title="新增寻源报价"
        open={open}
        onClose={() => setOpen(false)}
        size={580}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            setBusy(true);
            setError('');
            try {
              const supplier = d.options.quoteOptions.channels.find(
                (c) => c.supplier.id === v.supplierId,
              )?.supplier;
              const model = d.models.find((m) => m.id === v.modelId)!;
              const name =
                v.displayName ||
                `${supplier?.shortCode || d.options.suppliers.find((s) => s.id === v.supplierId)?.name}-${model.name}-${channelTypeLabels[v.channelType]}`;
              const existing = d.options.quoteOptions.channels.find(
                (c) =>
                  c.supplier.id === v.supplierId &&
                  c.model.id === v.modelId &&
                  c.channel.channelType === v.channelType &&
                  c.channel.displayName === name,
              );
              await session.api.saveSupplierQuote(
                {
                  supplierId: v.supplierId,
                  ownerId:
                    session.profile.user.role === 'Procurement'
                      ? session.profile.user.id
                      : 'u-proc',
                  quotedAt: dateISO(v.date),
                  remark: v.remark || '',
                  rows: [
                    {
                      modelId: v.modelId,
                      channelType: v.channelType,
                      displayName: name,
                      discount: discountBps(v.discount),
                      modelInvocationName: model.modelCode,
                      endpointReference: '',
                      tpm: null,
                      rpm: null,
                      concurrencyLimit: null,
                      ttftMs: null,
                      ...(existing ? { channelId: existing.channel.id } : {}),
                      ...(v.promotionFrom
                        ? {
                            promotionFrom: dateISO(v.promotionFrom)!,
                            promotionUntil: dateISO(v.promotionUntil)!,
                          }
                        : {}),
                    },
                  ],
                },
                crypto.randomUUID(),
              );
              setOpen(false);
              reload();
              message.success('报价已保存');
            } catch (e) {
              setError(e instanceof Error ? e.message : '保存失败');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item name="modelId" label="模型" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              onChange={() => form.setFieldValue('channelType', undefined)}
              options={d.models.map((m) => ({ value: m.id, label: m.name }))}
            />
          </Form.Item>
          <Form.Item
            name="supplierId"
            label="供应商"
            rules={[{ required: true }]}
          >
            <Select
              options={d.options.suppliers.map((s) => ({
                value: s.id,
                label: s.name,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="channelType"
            label="渠道类型"
            rules={[{ required: true }]}
          >
            <Select options={types} />
          </Form.Item>
          {vendor && !types.length && (
            <p>该厂商渠道类型尚未确认，请维护现有渠道后录入报价。</p>
          )}
          <Form.Item
            name="discount"
            label="报价折扣"
            rules={[{ required: true }]}
          >
            <DiscountInput />
          </Form.Item>
          <Form.Item name="date" label="询价日期" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <details>
            <summary>可选信息</summary>
            <Form.Item name="displayName" label="渠道名称">
              <Input placeholder="默认自动生成" />
            </Form.Item>
            <Form.Item name="promotionFrom" label="限时开始日期">
              <Input type="date" />
            </Form.Item>
            <Form.Item name="promotionUntil" label="限时结束日期">
              <Input type="date" />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <Input.TextArea />
            </Form.Item>
          </details>
          {error && <p role="alert">{error}</p>}
          <Space style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={busy}>
              保存报价
            </Button>
            <Button onClick={() => setOpen(false)}>取消</Button>
          </Space>
        </Form>
      </Drawer>
    </>
  );
}
