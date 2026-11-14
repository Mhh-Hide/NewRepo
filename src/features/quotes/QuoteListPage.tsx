import { useCallback, useState } from 'react';
import { Alert, Button, Card, Input, Modal, Select, Space, Tabs } from 'antd';
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type { QuoteQuery } from '../../services/quotation-types';
import type { QuotationApi } from '../../services/quotation-types';
import { quoteStatusLabels } from '../../domain/statuses';
import { quoteSourceLabels, dimensionLabels } from '../../domain/quotations';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { resourceErrorMessage } from '../../services/resource-types';
import { useResourceQuery } from '../models/use-resource-query';
import { QuoteEditor } from './QuoteEditor';
import type { QuotePreset } from './QuoteEditor';
import { QuoteTable } from './QuoteTable';
import { InquiryPanel } from './InquiryPanel';
import { dateISO } from './quote-format';
export default function QuoteListPage() {
  const session = useOutletContext<DemoSession>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initial: Record<string, string> = {
    ...(params.get('channelId') ? { channelId: params.get('channelId')! } : {}),
    ...(params.get('demandId') ? { demandId: params.get('demandId')! } : {}),
  };
  const [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [editor, setEditor] = useState<QuotePreset | null>(null);
  const [reset, setReset] = useState(false);
  const [error, setError] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [comparison, setComparison] = useState<Awaited<
    ReturnType<QuotationApi['compareQuoteRecords']>
  > | null>(null);
  const load = useCallback(async () => {
    const query: QuoteQuery = {
      page,
      pageSize: size,
      search: filters.search ?? '',
      ...(filters.channelId ? { channelId: filters.channelId } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.modelId ? { modelId: filters.modelId } : {}),
      ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
      ...(filters.status
        ? { status: filters.status as QuoteQuery['status'] & string }
        : {}),
      ...(filters.sourceType
        ? {
            sourceType: filters.sourceType as QuoteQuery['sourceType'] & string,
          }
        : {}),
      ...(filters.currency ? { currency: filters.currency } : {}),
      ...(filters.demandId ? { demandId: filters.demandId } : {}),
      ...(filters.createdFrom ? { createdFrom: filters.createdFrom } : {}),
      ...(filters.createdTo ? { createdTo: filters.createdTo } : {}),
      ...(filters.validFrom ? { validFrom: dateISO(filters.validFrom)! } : {}),
      ...(filters.validTo ? { validTo: dateISO(filters.validTo)! } : {}),
      order: filters.order === 'asc' ? 'asc' : 'desc',
    };
    const [data, options, vendors] = await Promise.all([
      session.api.queryQuotes(query),
      session.api.quoteOptions(),
      session.api.listVendors(),
    ]);
    return { data, options, vendors };
  }, [session.api, filters, page, size]);
  const { result, reload } = useResourceQuery(load);
  const filter = (k: string, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
    setComparison(null);
  };
  const header = (
    <PageHeader
      title="采购报价管理"
      description="集中管理上游渠道报价、合同确认状态和历史价格。"
      group="业务协同"
      actions={
        <Space wrap>
          <Button onClick={reload}>刷新报价</Button>
          {session.permits('quote:create') &&
            session.profile.domains.length > 0 && (
              <Button
                type="primary"
                onClick={() =>
                  setEditor({
                    ...(params.get('channelId')
                      ? { channelId: params.get('channelId')! }
                      : {}),
                    ...(params.get('demandItemId')
                      ? { demandItemId: params.get('demandItemId')! }
                      : {}),
                  })
                }
              >
                录入采购报价
              </Button>
            )}
          {session.permits('quote:confirm') &&
            session.domain === 'all' &&
            session.profile.domains.length === 2 && (
              <Button onClick={() => setReset(true)}>重置报价演示数据</Button>
            )}
        </Space>
      }
    />
  );
  const resetDialog = (
    <Modal
      title="确认重置报价演示数据"
      open={reset}
      okText="确认重置报价"
      onCancel={() => {
        setReset(false);
        setError('');
      }}
      onOk={async () => {
        try {
          await session.api.resetQuoteDemo(true);
          setReset(false);
          reload();
        } catch (e) {
          setError(resourceErrorMessage(e));
        }
      }}
    >
      <p>
        恢复原始报价，清除新增报价、询价、核验、确认及审计记录；批次草稿、已提交批次、映射与批次审计一并清除；供应商、渠道、寻源、测试保持原样。此操作仅限本浏览器
        Mock 数据。
      </p>
      {error && <Alert type="error" title={error} />}
    </Modal>
  );
  if (result.status === 'loading')
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  if (result.status === 'error')
    return (
      <>
        {header}
        <ErrorState message={result.message} onRetry={reload} />
        {resetDialog}
      </>
    );
  const { data, options, vendors } = result.data;
  const distinct = <T extends { id: string }>(rows: readonly T[]) => [
    ...new Map(rows.map((r) => [r.id, r])).values(),
  ];
  const metrics = [
    ['channels', '有报价渠道', data.stats.channels],
    ['reference', '参考报价记录', data.stats.reference],
    ['pending', '待合同确认', data.stats.pending],
    ['effective', '有效期内正式记录', data.stats.effective],
    ['temporary', '有效期内临时优惠', data.stats.temporary],
    ['expiring', '七天内到期优惠', data.stats.expiring],
  ] as const;
  const select = (
    k: string,
    label: string,
    opts: { value: string; label: string }[],
  ) => (
    <Select
      key={k}
      aria-label={label}
      value={filters[k] ?? ''}
      options={[{ value: '', label: `全部${label}` }, ...opts]}
      onChange={(v) => filter(k, v)}
    />
  );
  const preset: QuotePreset = {
    ...(params.get('channelId') ? { channelId: params.get('channelId')! } : {}),
    ...(params.get('demandItemId')
      ? { demandItemId: params.get('demandItemId')! }
      : {}),
  };
  return (
    <>
      {header}
      <div className="stats-grid resource-stats">
        {metrics.map(([id, label, value]) => (
          <StatCard
            key={id}
            metric={{
              id: `quote-${id}`,
              label,
              value,
              note:
                id === 'expiring'
                  ? '当前有效且未来7天内到期；不是自动结算价'
                  : '当前授权记录，生效/优惠数量排除已结束和未来未生效；历史保留',
            }}
          />
        ))}
      </div>
      <Alert
        type="info"
        showIcon
        title="仅 Mock 价格台账，不决定唯一当前结算价；Demo 确认不代表真实合同签署。"
      />
      <Tabs
        defaultActiveKey={
          params.get('tab') === 'inquiries' ? 'inquiries' : 'quotes'
        }
        items={[
          {
            key: 'quotes',
            label: '采购报价台账',
            children: (
              <Card title="报价记录">
                <div className="resource-filters">
                  <Input
                    aria-label="报价搜索"
                    placeholder="搜索报价、模型、供应商或渠道"
                    value={filters.search ?? ''}
                    onChange={(e) => filter('search', e.target.value)}
                  />
                  {select(
                    'vendorId',
                    '模型厂商',
                    vendors.map((v) => ({ value: v.id, label: v.name })),
                  )}
                  {select(
                    'modelId',
                    '报价模型',
                    distinct(options.channels.map((c) => c.model)).map((m) => ({
                      value: m.id,
                      label: m.name,
                    })),
                  )}
                  {select(
                    'supplierId',
                    '报价供应商',
                    distinct(options.channels.map((c) => c.supplier)).map(
                      (s) => ({ value: s.id, label: s.name }),
                    ),
                  )}
                  {select(
                    'channelId',
                    '报价渠道',
                    options.channels.map((c) => ({
                      value: c.channel.id,
                      label: c.channel.displayName,
                    })),
                  )}
                  {select(
                    'status',
                    '报价状态',
                    Object.entries(quoteStatusLabels).map(([value, label]) => ({
                      value,
                      label,
                    })),
                  )}
                  {select(
                    'sourceType',
                    '报价来源',
                    Object.entries(quoteSourceLabels).map(([value, label]) => ({
                      value,
                      label,
                    })),
                  )}
                  <Input
                    aria-label="报价币种"
                    placeholder="币种筛选，例如 CNY"
                    value={filters.currency ?? ''}
                    onChange={(e) =>
                      filter('currency', e.target.value.toUpperCase())
                    }
                  />
                  {select(
                    'demandId',
                    '报价关联需求',
                    distinct(
                      options.demands.map((d) => ({
                        id: d.demandId,
                        label: d.label.split(' · ').slice(0, 2).join(' · '),
                      })),
                    ).map((d) => ({ value: d.id, label: d.label })),
                  )}
                  {(
                    [
                      'createdFrom',
                      'createdTo',
                      'validFrom',
                      'validTo',
                    ] as const
                  ).map((k, i) => (
                    <label key={k} className="sourcing-date">
                      {['创建起日', '创建止日', '生效不早于', '到期不晚于'][i]}
                      <Input
                        aria-label={
                          [
                            '报价创建起日',
                            '报价创建止日',
                            '报价生效起日',
                            '报价到期止日',
                          ][i]
                        }
                        type="date"
                        value={filters[k] ?? ''}
                        onChange={(e) => filter(k, e.target.value)}
                      />
                    </label>
                  ))}
                  <Select
                    aria-label="报价时间排序"
                    value={filters.order ?? 'desc'}
                    options={[
                      { value: 'desc', label: '创建时间降序' },
                      { value: 'asc', label: '创建时间升序' },
                    ]}
                    onChange={(v) => filter('order', v)}
                  />
                  <Button
                    onClick={() => {
                      setFilters({});
                      setPage(1);
                    }}
                  >
                    重置报价筛选
                  </Button>
                </div>
                <p className="section-note">
                  日期按北京时间；创建起止日含当日，有效期边界按00:00。记录状态与时间有效性分别展示，不把历史优惠当作当前成本。
                </p>
                <QuoteTable
                  rows={data.rows}
                  page={page}
                  pageSize={size}
                  total={data.total}
                  onPage={(p, s) => {
                    setPage(p);
                    setSize(s);
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'inquiries',
            label: '询价记录与跟进',
            children: (
              <InquiryPanel
                session={session}
                preset={preset}
                onQuote={setEditor}
              />
            ),
          },
          {
            key: 'compare',
            label: '有条件的价格对照',
            children: (
              <Card title="报价口径对照">
                <p>
                  仅在模型、币种、基准、适用规格、计量维度/数量/单位、状态及有效期一致时比较。不是渠道推荐、节约比例或当前结算价。
                </p>
                <Space wrap>
                  <Select
                    aria-label="第一条对比报价"
                    placeholder="第一条报价"
                    style={{ width: 250 }}
                    options={options.quotes.map((q) => ({
                      value: q.id,
                      label: `${q.id} · ${options.channels.find((c) => c.channel.id === q.channelId)?.channel.displayName}`,
                    }))}
                    onChange={(v) => {
                      setA(v);
                      setComparison(null);
                    }}
                  />
                  <Select
                    aria-label="第二条对比报价"
                    placeholder="第二条报价"
                    style={{ width: 250 }}
                    options={options.quotes.map((q) => ({
                      value: q.id,
                      label: `${q.id} · ${options.channels.find((c) => c.channel.id === q.channelId)?.channel.displayName}`,
                    }))}
                    onChange={(v) => {
                      setB(v);
                      setComparison(null);
                    }}
                  />
                  <Button
                    disabled={!a || !b}
                    onClick={async () => {
                      try {
                        setComparison(
                          await session.api.compareQuoteRecords(a, b),
                        );
                        setError('');
                      } catch (e) {
                        setError(resourceErrorMessage(e));
                      }
                    }}
                  >
                    检查可比性
                  </Button>
                </Space>
                {comparison && (
                  <div className="quote-comparison">
                    <strong>
                      {comparison.comparable
                        ? '口径一致，可对照报价记录'
                        : '不具备可比性'}
                    </strong>
                    {comparison.comparable ? (
                      <>
                        <p>
                          第一条减第二条折扣差：
                          {comparison.discountDifferenceBps}{' '}
                          基点（不是节约比例）
                        </p>
                        {comparison.rates.map((r) => (
                          <p key={r.dimension}>
                            {dimensionLabels[r.dimension]}：
                            {r.order === null
                              ? '金额未提供'
                              : r.order === 'equal'
                                ? '金额相同'
                                : r.order === 'lower'
                                  ? '第一条单价较低'
                                  : '第一条单价较高'}
                          </p>
                        ))}
                      </>
                    ) : (
                      comparison.reasons.map((r) => <p key={r}>{r}</p>)
                    )}
                  </div>
                )}
                {error && <Alert type="error" title={error} />}
              </Card>
            ),
          },
        ]}
      />
      {editor && (
        <QuoteEditor
          session={session}
          preset={editor}
          onClose={() => setEditor(null)}
          onSaved={(id) => navigate(`/quotes/${id}`)}
        />
      )}
      {resetDialog}
    </>
  );
}
