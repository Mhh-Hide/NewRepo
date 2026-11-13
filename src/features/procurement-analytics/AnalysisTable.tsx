import { Table, Tag } from 'antd';
import { Link } from 'react-router-dom';
import type { AnalysisRecord } from '../../domain/procurement-analytics';
import {
  analysisValidity,
  isCurrentFormal,
} from '../../domain/procurement-analytics';
import { quoteStatusLabels } from '../../domain/statuses';
import { quoteSourceLabels } from '../../domain/quotations';
import { displayDate, priceSpecText } from '../quotes/quote-format';
import { analyticsValidityLabels } from './labels';
export function AnalysisTable({
  records,
  asOf,
}: {
  records: readonly AnalysisRecord[];
  asOf: string;
}) {
  return (
    <Table<AnalysisRecord>
      size="small"
      rowKey={(r) => r.quote.id}
      dataSource={[...records]}
      scroll={{ x: 1500 }}
      pagination={{ defaultPageSize: 5, showSizeChanger: true }}
      expandable={{
        expandedRowRender: (r) => (
          <div className="analysis-wrap">
            <p>
              记录ID：{r.quote.id}；前序：{r.quote.previousQuoteId ?? '无'}
              ；来源：{quoteSourceLabels[r.quote.sourceType]}
            </p>
            <p>
              创建时间：{displayDate(r.quote.createdAt)}；供应商报价时间：
              {displayDate(r.quote.supplierQuotedAt)}（均非实际回复时间）
            </p>
            <p>
              有效期：{displayDate(r.quote.effectiveFrom)} 至{' '}
              {displayDate(r.quote.effectiveUntil)}（截止不含）；确认时间：
              {displayDate(r.quote.confirmedAt)}
            </p>
          </div>
        ),
      }}
      columns={[
        {
          title: '模型 / 供应商 / 渠道',
          width: 240,
          render: (_, r) => (
            <>
              <strong>{r.model.name}</strong>
              <div>{r.supplier.name}</div>
              <Link to={`/channels/${r.channel.id}`}>{r.channel.name}</Link>
              <div>
                <Tag>
                  {r.channel.status === 'disabled' ? '渠道已停用' : '渠道启用'}
                </Tag>
              </div>
            </>
          ),
        },
        {
          title: '报价状态 / 时间有效性',
          width: 210,
          render: (_, r) => (
            <>
              <Tag>{quoteStatusLabels[r.quote.priceStatus]}</Tag>
              <div>
                {
                  analyticsValidityLabels[
                    analysisValidity(r.quote, Date.parse(asOf))
                  ]
                }
              </div>
              {r.quote.priceStatus === 'effective' && (
                <div>
                  {isCurrentFormal(r.quote, Date.parse(asOf))
                    ? '当前有效正式报价（非唯一结算价）'
                    : '正式历史记录，当前不可作为有效价'}
                </div>
              )}
              <small>{r.verified ? '已独立核验' : '未记录独立核验'}</small>
            </>
          ),
        },
        {
          title: '折扣（整数基点）',
          width: 150,
          render: (_, r) =>
            `${r.quote.discount} 基点（${r.quote.discount / 1000}折）`,
        },
        {
          title: '币种 / 单价与规格',
          width: 390,
          render: (_, r) => (
            <>
              {priceSpecText(r.quote.priceSpec)}
              <div className="section-note">
                基准：{r.quote.priceSpec.referencePriceSource ?? '未提供'}
                ；规格：{r.quote.priceSpec.specification ?? '未提供'}
              </div>
            </>
          ),
        },
        {
          title: '创建时间 / 来源',
          width: 200,
          render: (_, r) => (
            <>
              {displayDate(r.quote.createdAt)}
              <div>
                {quoteSourceLabels[r.quote.sourceType]}
                {r.quote.sourceType === 'correction' && '（非供应商真实调价）'}
              </div>
            </>
          ),
        },
        {
          title: '操作',
          width: 100,
          render: (_, r) => <Link to={`/quotes/${r.quote.id}`}>查看报价</Link>,
        },
      ]}
    />
  );
}
