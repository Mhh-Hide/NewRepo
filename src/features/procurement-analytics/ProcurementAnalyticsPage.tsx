import { useCallback, useState } from 'react';
import { Alert, Button, Card, Input, Select, Space, Table, Tag } from 'antd';
import { Link, useOutletContext } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type {
  AnalyticsQuery,
  AnalysisRecord,
} from '../../domain/procurement-analytics';
import {
  analysisValidity,
  compareAnalysis,
  completeness,
} from '../../domain/procurement-analytics';
import { quoteStatusLabels } from '../../domain/statuses';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/FeedbackStates';
import { useResourceQuery } from '../models/use-resource-query';
import { displayDate, priceSpecText } from '../quotes/quote-format';
import { AnalysisTable } from './AnalysisTable';
import { analyticsValidityLabels } from './labels';
import { PriceTrend } from './PriceTrend';
import './analytics.css';
export default function ProcurementAnalyticsPage() {
  const session = useOutletContext<DemoSession>();
  const [query, setQuery] = useState<AnalyticsQuery>({});
  const [trendChannel, setTrendChannel] = useState('');
  const [axis, setAxis] = useState<'created' | 'supplier'>('created');
  const [baseline, setBaseline] = useState('');
  const load = useCallback(
    () => session.api.queryProcurementAnalytics(query),
    [session.api, query],
  );
  const { result, reload } = useResourceQuery(load);
  const header = (
    <PageHeader
      title="采购价格分析"
      description="授权上游报价、价格口径与询价跟进 · Mock 只读分析"
      group="运营分析"
      actions={
        <Space wrap>
          <Button onClick={reload}>刷新分析</Button>
          <Link to="/quotes">进入报价台账</Link>
        </Space>
      }
    />
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
        <Button onClick={() => setQuery({})}>清除分析筛选</Button>
      </>
    );
  const d = result.data,
    s = d.stats;
  const set = (k: keyof AnalyticsQuery, value: string | null | undefined) =>
    setQuery((old) => {
      const v = { ...old };
      if (value) Object.assign(v, { [k]: value });
      else delete v[k];
      return v;
    });
  const anchor = d.records.find((r) => r.quote.id === baseline);
  const channel = d.options.channels.some((c) => c.id === trendChannel)
    ? trendChannel
    : (d.channelPrices[0]?.channelId ?? '');
  const metrics = [
    ['models', '有报价模型', s.models, '按模型ID去重，含历史'],
    ['channels', '有报价渠道', s.channels, '按渠道ID去重，含历史'],
    ['suppliers', '报价供应商', s.suppliers, '按供应商ID去重，多渠道只算一家'],
    [
      'formal',
      '有正式记录渠道',
      s.formalChannels,
      '含未来或已到期正式记录，不代表当前成本',
    ],
    [
      'promotions',
      '有优惠记录渠道',
      s.promotionChannels,
      '含已到期优惠，不覆盖正式价',
    ],
    [
      'incomplete',
      '币种或单位缺失',
      s.incomplete,
      '缺币种或明确计量数量/单位的报价记录',
    ],
  ] as const;
  const statusMetrics = [
    ['reference', '参考报价', s.reference],
    ['pending', '待合同确认', s.pending],
    ['effective', '当前有效正式报价', s.effective],
    ['temporary', '当前有效临时优惠', s.temporary],
    ['expired', '已到期报价', s.expired],
    ['expiring', '七天内到期优惠', s.expiring],
  ] as const;
  const compareCell = (r: AnalysisRecord) => {
    const value = anchor
      ? compareAnalysis(anchor, r, Date.parse(d.asOf))
      : null;
    if (!value)
      return `请选择比较基准；${completeness(r.quote.priceSpec).join('；') || '口径已提供，仍须检查状态和有效期'}`;
    return (
      <div>
        <div>
          {value.comparable
            ? `同口径；基准报价减此报价 ${value.discountDifferenceBps} 基点（非节约率）`
            : `无法比较：${value.reasons.join('；')}`}
        </div>
        <div>规格口径：{value.specComparable ? '一致' : '不同或信息不足'}</div>
        <div>
          查询时刻有效性：基准
          {analyticsValidityLabels[value.currentValidity.first]}；此报价
          {analyticsValidityLabels[value.currentValidity.second]}
        </div>
        <div>
          {value.currentValidity.bothInPeriod
            ? '两条均在记录有效期内，仍需核实正式依据及渠道状态。'
            : '至少一条不在明确有效期内；历史或约定口径比较不能作为当前采购依据。'}
        </div>
        <small>{value.procurementNotice}</small>
      </div>
    );
  };
  return (
    <div className="procurement-analysis">
      {header}
      <Card title="分析范围" className="analysis-card">
        <div className="analysis-filters">
          <Select
            aria-label="分析模型"
            placeholder="全部授权模型"
            allowClear
            value={query.modelId ?? null}
            onChange={(v) => {
              set('modelId', v);
              setBaseline('');
            }}
            options={d.options.models.map((m) => ({
              value: m.id,
              label: m.name,
            }))}
          />
          <Select
            aria-label="分析供应商"
            placeholder="全部授权供应商"
            allowClear
            value={query.supplierId ?? null}
            onChange={(v) => set('supplierId', v)}
            options={d.options.suppliers.map((m) => ({
              value: m.id,
              label: m.name,
            }))}
          />
          <Select
            aria-label="分析渠道"
            placeholder="全部授权渠道"
            allowClear
            value={query.channelId ?? null}
            onChange={(v) => set('channelId', v)}
            options={d.options.channels.map((m) => ({
              value: m.id,
              label: m.name,
            }))}
          />
          <Select
            aria-label="分析厂商"
            placeholder="全部授权厂商"
            allowClear
            value={query.vendorId ?? null}
            onChange={(v) => set('vendorId', v)}
            options={d.options.vendors.map((m) => ({
              value: m.id,
              label: m.name,
            }))}
          />
          <Select
            aria-label="分析报价状态"
            placeholder="全部报价状态"
            allowClear
            value={query.status ?? null}
            onChange={(v) => set('status', v)}
            options={Object.entries(quoteStatusLabels).map(
              ([value, label]) => ({ value, label }),
            )}
          />
          <Select
            aria-label="分析币种"
            placeholder="全部已知币种"
            allowClear
            value={query.currency ?? null}
            onChange={(v) => set('currency', v)}
            options={d.options.currencies.map((v) => ({ value: v, label: v }))}
          />
          <label>
            创建起日
            <Input
              type="date"
              aria-label="分析创建起日"
              value={query.createdFrom ?? ''}
              onChange={(e) => set('createdFrom', e.target.value)}
            />
          </label>
          <label>
            创建止日
            <Input
              type="date"
              aria-label="分析创建止日"
              value={query.createdTo ?? ''}
              onChange={(e) => set('createdTo', e.target.value)}
            />
          </label>
        </div>
        <Button
          onClick={() => {
            setQuery({});
            setBaseline('');
          }}
        >
          重置分析筛选
        </Button>
        <p className="section-note">
          报价指标随以上筛选变化；创建日期按北京时间且包含止日。询价仅受模型、供应商、渠道及厂商范围限制，报价状态/币种/创建日不用于推断询价状态。查询时刻：
          {displayDate(d.asOf)}。
        </p>
      </Card>
      <section className="stats-grid" aria-label="价格覆盖指标">
        {metrics.map(([id, label, value, note]) => (
          <StatCard
            key={id}
            metric={{ id: `analysis-${id}`, label, value, note }}
          />
        ))}
      </section>
      <Card title="报价状态与时间有效性" className="analysis-card">
        <div className="analysis-status-grid">
          {statusMetrics.map(([id, label, value]) => (
            <div
              className="analysis-status"
              key={id}
              data-testid={`analysis-${id}`}
            >
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <p className="section-note">
          正式需有确认人与确认时间，且已到生效时刻、未到截止时刻。参考/待确认排除已到期或异常有效期；当前优惠同样排除未来生效。尚未生效{' '}
          {s.scheduled} 条。各指标是不同观察口径，不能相加作为供应商数量。
        </p>
      </Card>
      <Alert
        showIcon
        type="info"
        title="价格分析边界"
        description="最新报价不等于当前正式价；不计算唯一结算价、供应商排名、真实节约额或采购中标。不同比较口径保持独立。"
      />
      <Card title="同模型供应商与渠道价格比较" className="analysis-card">
        <p>
          先在上方选择模型，再选择一条报价作为明确比较基准。最近报价、最近已确认正式历史、全部当前有效正式报价与当前优惠分别展示；均限当前筛选范围，不回退历史价或选择唯一结算价。
        </p>
        <Select
          className="analysis-wide"
          aria-label="分析比较基准报价"
          placeholder="选择比较基准报价"
          allowClear
          value={anchor?.quote.id ?? null}
          onChange={(v) => setBaseline(v ?? '')}
          options={d.records.map((r) => ({
            value: r.quote.id,
            label: `${r.quote.id} · ${r.channel.name} · ${r.quote.discount}基点`,
          }))}
        />
        {!query.modelId ? (
          <EmptyState description="请选择一个模型，查看该模型下的授权供应商渠道价格。" />
        ) : (
          <Table
            size="small"
            rowKey="channelId"
            scroll={{ x: 1850 }}
            dataSource={d.channelPrices}
            pagination={{ defaultPageSize: 5 }}
            columns={[
              {
                title: '供应商 / 渠道 / 当前资源',
                width: 200,
                render: (_, c) => (
                  <>
                    {c.records[0]?.supplier.name}
                    <div>
                      <Link to={`/channels/${c.channelId}`}>
                        {c.records[0]?.channel.name}
                      </Link>
                    </div>
                    <Tag>
                      {c.records[0]?.channel.status === 'disabled'
                        ? '已停用，历史保留'
                        : '启用'}
                    </Tag>
                  </>
                ),
              },
              {
                title: '最近一次报价（非唯一成本）',
                width: 350,
                render: (_, c) =>
                  c.latest ? (
                    <>
                      <Link to={`/quotes/${c.latest.quote.id}`}>
                        {c.latest.quote.discount} 基点 ·{' '}
                        {quoteStatusLabels[c.latest.quote.priceStatus]}
                      </Link>
                      <div>{priceSpecText(c.latest.quote.priceSpec)}</div>
                      <div>
                        基准：
                        {c.latest.quote.priceSpec.referencePriceSource ??
                          '未提供'}
                        ；规格：
                        {c.latest.quote.priceSpec.specification ?? '未提供'}
                      </div>
                      <small>
                        {displayDate(c.latest.quote.createdAt)}；
                        {c.latest.verified ? '已独立核验' : '未记录独立核验'}
                      </small>
                      <div>
                        有效期 {displayDate(c.latest.quote.effectiveFrom)} 至{' '}
                        {displayDate(c.latest.quote.effectiveUntil)}
                      </div>
                    </>
                  ) : (
                    '创建日期异常，无法确定最近记录'
                  ),
              },
              {
                title: '最近已确认正式历史报价',
                width: 240,
                render: (_, c) => (
                  <div data-testid={`channel-formal-history-${c.channelId}`}>
                    {c.latestFormal ? (
                      <>
                        <Link to={`/quotes/${c.latestFormal.quote.id}`}>
                          {c.latestFormal.quote.discount} 基点 · 已确认历史
                        </Link>
                        <div>
                          查询时刻：
                          {
                            analyticsValidityLabels[
                              analysisValidity(
                                c.latestFormal.quote,
                                Date.parse(d.asOf),
                              )
                            ]
                          }
                        </div>
                        <small>历史记录不自动作为当前采购价格</small>
                      </>
                    ) : (
                      '无已确认正式历史报价'
                    )}
                  </div>
                ),
              },
              {
                title: '当前有效正式报价（全部）',
                width: 250,
                render: (_, c) => (
                  <div data-testid={`channel-current-formals-${c.channelId}`}>
                    {c.activeFormals.length ? (
                      <>
                        <div>{c.activeFormals.length} 条当前有效正式报价</div>
                        {c.activeFormals.map((r) => (
                          <div key={r.quote.id}>
                            <Link to={`/quotes/${r.quote.id}`}>
                              {r.quote.discount} 基点 · 查看正式报价
                            </Link>
                            <small>
                              {' '}
                              截止：{displayDate(r.quote.effectiveUntil)}
                              （不含）
                            </small>
                          </div>
                        ))}
                        <small>
                          全部保留，不选择唯一结算价；仍需核实渠道准入。
                        </small>
                      </>
                    ) : (
                      '暂无当前有效正式报价'
                    )}
                  </div>
                ),
              },
              {
                title: '当前有效临时优惠',
                width: 220,
                render: (_, c) => (
                  <div>
                    <div>
                      当前有效优惠 {c.activePromotions.length}{' '}
                      条（不覆盖正式价）
                    </div>
                    {c.activePromotions.map((r) => (
                      <div key={r.quote.id}>
                        <Link to={`/quotes/${r.quote.id}`}>
                          {r.quote.discount} 基点 · 查看优惠
                        </Link>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                title: '与指定基准的可比性',
                width: 370,
                render: (_, c) =>
                  c.latest ? compareCell(c.latest) : '日期不足，无法比较',
              },
              {
                title: '历史',
                width: 130,
                render: (_, c) => (
                  <Button
                    onClick={() => {
                      setTrendChannel(c.channelId);
                      document
                        .getElementById('channel-price-trend')
                        ?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    查看渠道趋势
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Card
        id="channel-price-trend"
        title="单渠道报价历史趋势"
        className="analysis-card"
      >
        <Space wrap>
          <Select
            aria-label="趋势渠道"
            className="analysis-select"
            value={channel || null}
            onChange={setTrendChannel}
            options={d.options.channels.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
          />
          <Select
            aria-label="趋势时间轴"
            value={axis}
            onChange={setAxis}
            options={[
              { value: 'created', label: '报价创建时间' },
              { value: 'supplier', label: '供应商报价时间' },
            ]}
          />
        </Space>
        <PriceTrend records={d.records} channelId={channel} axis={axis} />
      </Card>
      <Card title="临时优惠与到期提醒" className="analysis-card">
        <p>
          未来7天窗口：({displayDate(d.expiryWindow.fromExclusive)},{' '}
          {displayDate(d.expiryWindow.toInclusive)}
          ]，北京时间，查询时刻起7×24小时。当前有效且截止落入此窗口才提醒；到期记录保留，不发送外部通知。
        </p>
        <Table
          size="small"
          rowKey={(r) => r.record.quote.id}
          scroll={{ x: 950 }}
          dataSource={d.promotions}
          pagination={{ defaultPageSize: 5 }}
          columns={[
            {
              title: '模型 / 供应商 / 渠道',
              render: (_, v) => (
                <>
                  {v.record.model.name}
                  <div>
                    {v.record.supplier.name} · {v.record.channel.name}
                  </div>
                </>
              ),
            },
            {
              title: '折扣与优惠状态',
              render: (_, v) => (
                <>
                  {v.record.quote.discount} 基点
                  <div>{analyticsValidityLabels[v.validity]}</div>
                  {v.expiring && (
                    <Tag color="orange">七天内到期，待人工跟进</Tag>
                  )}
                </>
              ),
            },
            {
              title: '起止（截止不含）',
              render: (_, v) => (
                <>
                  {displayDate(v.record.quote.effectiveFrom)}
                  <div>{displayDate(v.record.quote.effectiveUntil)}</div>
                </>
              ),
            },
            {
              title: '正式记录并存',
              render: (_, v) =>
                v.formalExists
                  ? '存在正式记录（不保证当前有效）'
                  : '无正式记录',
            },
            {
              title: '查看',
              render: (_, v) => (
                <Link to={`/quotes/${v.record.quote.id}`}>查看优惠</Link>
              ),
            },
          ]}
        />
      </Card>
      <Card title="采购目标与实际报价数字差异" className="analysis-card">
        <Alert
          type="warning"
          showIcon
          title="同基准可比性未确认"
          description="当前目标只有整数折扣，没有价格基准与计费规格。以下仅为数字差，经过验证的商业达成率：不可计算；真实节约金额：不计算。"
        />
        <Table
          size="small"
          rowKey="quoteId"
          scroll={{ x: 950 }}
          dataSource={d.targets}
          pagination={{ defaultPageSize: 5 }}
          columns={[
            {
              title: '共享需求明细',
              render: (_, t) => (
                <Link to={`/sourcing/${t.target.demandId}`}>
                  {t.target.label}
                </Link>
              ),
            },
            { title: '渠道', dataIndex: 'channel' },
            { title: '目标基点', render: (_, t) => t.target.discount },
            { title: '实际报价基点', dataIndex: 'quotedDiscount' },
            {
              title: '报价减目标（纯数字）',
              dataIndex: 'numericDifferenceBps',
            },
            { title: '商业结论', render: () => '未确认，不判定达成' },
          ]}
        />
      </Card>
      <Card title="询价跟进效率" className="analysis-card">
        <div className="analysis-status-grid">
          {[
            ['已发起（未关闭）', s.inquiry.initiated],
            ['待回复', s.inquiry.pending],
            ['已收到报价', s.inquiry.received],
            ['已关闭', s.inquiry.closed],
            ['逾期待回复', s.inquiry.overdue],
            ['待询价草稿', s.inquiry.draft],
          ].map(([label, value]) => (
            <div className="analysis-status" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <p>
          已发起按当前“已询价/已收到报价”台账状态计，不推测已关闭记录此前是否发送。逾期仅当前待回复且截止时间早于查询时刻；截止未知不当作逾期。当前没有可追溯的真实发送及回复时间，响应时长不可计算；创建/录入/供应商报价日期均不冒充回复时间。
        </p>
        <Table
          size="small"
          rowKey="id"
          dataSource={d.inquiries}
          pagination={{ defaultPageSize: 5 }}
          scroll={{ x: 750 }}
          columns={[
            { title: '询价记录', dataIndex: 'id' },
            {
              title: '状态',
              render: (_, i) =>
                ({
                  draft: '待询价',
                  sent: '已询价待回复',
                  quoted: '已收到报价',
                  closed: '已关闭',
                })[i.status],
            },
            {
              title: '台账登记时间',
              render: (_, i) => displayDate(i.requestedAt),
            },
            {
              title: '回复截止时间',
              render: (_, i) => displayDate(i.responseDueAt),
            },
          ]}
        />
      </Card>
      <Card title="数据完整性与待核实事项" className="analysis-card">
        <p>
          {s.incomparable}{' '}
          条报价缺少完整可比口径；缺少信息不补零、不推测币种或官方刊例。
        </p>
        <Table
          size="small"
          rowKey="quoteId"
          dataSource={d.warnings}
          pagination={{ defaultPageSize: 5 }}
          scroll={{ x: 750 }}
          columns={[
            { title: '渠道', dataIndex: 'channel' },
            { title: '原因', render: (_, w) => w.reasons.join('；') },
            {
              title: '核实资料',
              render: (_, w) => (
                <Link to={`/quotes/${w.quoteId}`}>查看报价资料</Link>
              ),
            },
          ]}
        />
      </Card>
      <Card title="当前筛选报价明细" className="analysis-card">
        <AnalysisTable records={d.records} asOf={d.asOf} />
      </Card>
    </div>
  );
}
