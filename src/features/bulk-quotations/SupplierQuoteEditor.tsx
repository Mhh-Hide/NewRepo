import { channelTypeOptions } from '../../domain/channel-types';
import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  message,
} from 'antd';
import type { DemoSession } from '../../services/demo-session';
import { listDemoProfiles } from '../../services/demo-session';
import type { ChannelType } from '../../domain/statuses';
import { channelTypeLabels } from '../../domain/statuses';
import { discountBps } from '../../domain/rules';
import { DiscountInput } from '../procurement/DiscountInput';
import { dateISO } from '../quotes/quote-format';
import { useResourceQuery } from '../models/use-resource-query';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { resourceErrorMessage } from '../../services/resource-types';
type Row = {
  id: string;
  modelId: string;
  channelType: ChannelType;
  displayName: string;
  manual: boolean;
  discount: number | null;
  tpm: number | null;
  rpm: number | null;
  concurrencyLimit: number | null;
  cache: string;
  note: string;
};
const blank = (): Row => ({
  id: crypto.randomUUID(),
  modelId: '',
  channelType: 'official_proxy',
  displayName: '',
  manual: false,
  discount: null,
  tpm: null,
  rpm: null,
  concurrencyLimit: null,
  cache: '',
  note: '',
});
export function SupplierQuoteEditor({
  session,
  onClose,
  onSaved,
}: {
  session: DemoSession;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [supplier, setSupplier] = useState(''),
    [date, setDate] = useState(
      new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
    ),
    [owner, setOwner] = useState(
      session.profile.user.role === 'Procurement'
        ? session.profile.user.id
        : 'u-proc',
    ),
    [remark, setRemark] = useState('');
  const [rows, setRows] = useState<Row[]>([blank()]),
    [common, setCommon] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const load = useCallback(async () => {
    const [options, models, vendors] = await Promise.all([
      session.api.bulkQuoteOptions(),
      session.api.listModels(),
      session.api.listVendors(),
    ]);
    return { options, models, vendors };
  }, [session.api]);
  const { result, reload } = useResourceQuery(load);
  const change = (id: string, patch: Partial<Row>) => {
    setRows((v) => v.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setRequestId(crypto.randomUUID());
  };
  const body = () => {
    if (result.status === 'loading') return <LoadingState />;
    if (result.status === 'error')
      return <ErrorState message={result.message} onRetry={reload} />;
    const { options, models, vendors } = result.data;
    const supplierName =
      options.quoteOptions.channels.find((c) => c.supplier.id === supplier)
        ?.supplier.shortCode ||
      options.suppliers.find((s) => s.id === supplier)?.name ||
      '';
    const name = (r: Row) =>
      r.manual
        ? r.displayName
        : [
            supplierName,
            models.find((m) => m.id === r.modelId)?.name,
            channelTypeLabels[r.channelType],
          ]
            .filter(Boolean)
            .join('-');
    const employees = listDemoProfiles().filter(
      (p) =>
        p.user.role === 'Procurement' &&
        rows
          .filter((r) => r.modelId)
          .every((r) =>
            p.domains.includes(
              vendors.find(
                (v) =>
                  v.id === models.find((m) => m.id === r.modelId)?.vendorId,
              )!.businessDomain,
            ),
          ),
    );
    return (
      <>
        <div className="quote-form-grid" style={{ marginBottom: 20 }}>
          <label>
            供应商
            <Select
              aria-label="报价供应商"
              showSearch
              optionFilterProp="label"
              value={supplier || undefined}
              style={{ width: '100%' }}
              onChange={(v) => {
                setSupplier(v ?? '');
                setRequestId(crypto.randomUUID());
              }}
              options={options.suppliers
                .filter((s) => s.status === 'enabled')
                .map((s) => ({
                  value: s.id,
                  label:
                    options.quoteOptions.channels.find(
                      (c) => c.supplier.id === s.id,
                    )?.supplier.shortCode || s.name,
                }))}
            />
          </label>
          <label>
            询价／报价日期
            <Input
              type="date"
              aria-label="报价日期"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            跟进采购人员
            <Select
              aria-label="跟进采购人员"
              style={{ width: '100%' }}
              value={owner}
              onChange={setOwner}
              options={employees.map((p) => ({
                value: p.user.id,
                label: p.user.name,
              }))}
            />
          </label>
          <label>
            备注（可选）
            <Input
              aria-label="报价备注"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </label>
        </div>
        <Space style={{ marginBottom: 16 }}>
          <Button onClick={() => setRows((v) => [...v, blank()])}>
            添加报价行
          </Button>
          <DiscountInput
            aria-label="批量折扣"
            value={common}
            onChange={setCommon}
          />
          <Button
            disabled={common === null}
            onClick={() =>
              setRows((v) => v.map((r) => ({ ...r, discount: common })))
            }
          >
            应用到全部行
          </Button>
        </Space>
        <Table<Row>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={rows}
          scroll={{ x: 1070 }}
          expandable={{
            expandedRowRender: (r) => (
              <div className="quote-form-grid">
                {(['tpm', 'rpm', 'concurrencyLimit'] as const).map((k, i) => (
                  <label key={k}>
                    {['TPM', 'RPM', '并发'][i]}
                    <InputNumber
                      aria-label={`${r.id}-${k}`}
                      min={0}
                      precision={0}
                      value={r[k]}
                      onChange={(v) => change(r.id, { [k]: v })}
                    />
                  </label>
                ))}
                <label>
                  缓存要求
                  <Input
                    value={r.cache}
                    onChange={(e) => change(r.id, { cache: e.target.value })}
                  />
                </label>
                <label>
                  行备注
                  <Input
                    value={r.note}
                    onChange={(e) => change(r.id, { note: e.target.value })}
                  />
                </label>
              </div>
            ),
          }}
          columns={[
            {
              title: '模型名称',
              width: 235,
              render: (_, r, i) => (
                <Select
                  aria-label={`第${i + 1}行模型`}
                  showSearch
                  optionFilterProp="label"
                  style={{ width: '100%' }}
                  value={r.modelId || undefined}
                  onChange={(v) =>
                    change(r.id, {
                      modelId: v ?? '',
                      channelType:
                        channelTypeOptions(
                          vendors.find(
                            (vendor) =>
                              vendor.id ===
                              models.find((m) => m.id === v)?.vendorId,
                          )!,
                        )[0]?.value ?? 'other',
                    })
                  }
                  options={models.map((m) => ({ value: m.id, label: m.name }))}
                />
              ),
            },
            {
              title: '渠道类型',
              width: 170,
              render: (_, r, i) => {
                const vendor = vendors.find(
                  (v) =>
                    v.id === models.find((m) => m.id === r.modelId)?.vendorId,
                );
                return (
                  <Select
                    aria-label={`第${i + 1}行渠道类型`}
                    style={{ width: '100%' }}
                    value={r.channelType}
                    onChange={(v) => change(r.id, { channelType: v })}
                    options={vendor ? channelTypeOptions(vendor) : []}
                  />
                );
              },
            },
            {
              title: '渠道名称',
              width: 300,
              render: (_, r, i) => (
                <Input
                  aria-label={`第${i + 1}行渠道名称`}
                  value={name(r)}
                  onChange={(e) =>
                    change(r.id, { displayName: e.target.value, manual: true })
                  }
                />
              ),
            },
            {
              title: '报价折扣',
              width: 160,
              render: (_, r, i) => (
                <DiscountInput
                  aria-label={`第${i + 1}行折扣`}
                  value={r.discount}
                  onChange={(v) => change(r.id, { discount: v })}
                />
              ),
            },
            {
              title: '操作',
              width: 150,
              render: (_, r) => (
                <Space>
                  <Button
                    type="link"
                    onClick={() =>
                      setRows((v) => [...v, { ...r, id: crypto.randomUUID() }])
                    }
                  >
                    复制
                  </Button>
                  <Button
                    type="text"
                    disabled={rows.length === 1}
                    onClick={() =>
                      setRows((v) => v.filter((x) => x.id !== r.id))
                    }
                  >
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
        {error && (
          <Alert type="error" title={error} style={{ marginTop: 16 }} />
        )}
        <Space style={{ marginTop: 24 }}>
          <Button
            type="primary"
            loading={busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              setError('');
              try {
                if (
                  !supplier ||
                  !date ||
                  rows.some(
                    (r) => !r.modelId || r.discount === null || !name(r).trim(),
                  )
                )
                  throw new Error(
                    '请选择供应商、报价日期，并补全每行模型、渠道名称和折扣。',
                  );
                const saved = await session.api.saveSupplierQuote(
                  {
                    supplierId: supplier,
                    quotedAt: dateISO(date),
                    ownerId: owner,
                    remark,
                    rows: rows.map((r) => {
                      const existing = options.quoteOptions.channels.find(
                        (c) =>
                          c.supplier.id === supplier &&
                          c.model.id === r.modelId &&
                          c.channel.channelType === r.channelType &&
                          c.channel.displayName === name(r),
                      );
                      return {
                        modelId: r.modelId,
                        channelType: r.channelType,
                        displayName: name(r),
                        discount: discountBps(r.discount!),
                        modelInvocationName: models.find(
                          (m) => m.id === r.modelId,
                        )!.modelCode,
                        endpointReference: '',
                        tpm: r.tpm,
                        rpm: r.rpm,
                        concurrencyLimit: r.concurrencyLimit,
                        ttftMs: null,
                        cacheRequirement: r.cache,
                        note: r.note,
                        ...(existing ? { channelId: existing.channel.id } : {}),
                      };
                    }),
                  },
                  requestId,
                );
                message.success(`已保存 ${saved.quoteIds.length} 条报价`);
                onSaved(saved.batchId);
              } catch (e) {
                setError(
                  e instanceof Error && e.name === 'Error'
                    ? e.message
                    : resourceErrorMessage(e),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            保存供应商报价
          </Button>
          <Button onClick={onClose}>取消</Button>
        </Space>
      </>
    );
  };
  return (
    <Drawer
      title="新增供应商报价"
      open
      size={1280}
      onClose={onClose}
      destroyOnHidden
    >
      {body()}
    </Drawer>
  );
}
