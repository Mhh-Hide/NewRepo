import { Table, Space, Tag } from 'antd';
import { Link } from 'react-router-dom';
import type { QuoteRow } from '../../services/quotation-types';
import { quoteStatusLabels } from '../../domain/statuses';
import { quoteSourceLabels, validityLabels } from '../../domain/quotations';
import { priceSpecText, quoteDiscount, displayDate } from './quote-format';
export function QuoteTable({
  rows,
  page = 1,
  pageSize = 10,
  total = rows.length,
  onPage,
}: {
  rows: readonly QuoteRow[];
  page?: number;
  pageSize?: number;
  total?: number;
  onPage?: (page: number, pageSize: number) => void;
}) {
  return (
    <Table<QuoteRow>
      size="small"
      rowKey={(r) => r.quote.id}
      dataSource={[...rows]}
      scroll={{ x: 1700 }}
      pagination={
        onPage
          ? {
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              onChange: onPage,
            }
          : { defaultPageSize: pageSize, showSizeChanger: true }
      }
      columns={[
        {
          title: '模型 / 供应商 / 渠道',
          width: 260,
          render: (_, r) => (
            <div>
              <strong>{r.model.name}</strong>
              <small className="resource-subtitle">{r.supplier.name}</small>
              <Link to={`/channels/${r.channel.id}`}>
                {r.channel.displayName}
              </Link>
            </div>
          ),
        },
        {
          title: '报价折扣',
          width: 170,
          render: (_, r) => quoteDiscount(r.quote),
        },
        {
          title: '价格口径及单价',
          width: 300,
          render: (_, r) => (
            <div className="quote-wrap">
              {priceSpecText(r.quote.priceSpec)}
              <small className="resource-subtitle">
                基准：{r.quote.priceSpec.referencePriceSource ?? '未提供'} ·
                规格：{r.quote.priceSpec.specification ?? '未提供'}
              </small>
            </div>
          ),
        },
        {
          title: '状态 / 有效期判断',
          width: 230,
          render: (_, r) => (
            <Space orientation="vertical">
              <Tag>{quoteStatusLabels[r.quote.priceStatus]}</Tag>
              <Tag color={r.validity === 'expired' ? 'default' : 'processing'}>
                {validityLabels[r.validity]}
              </Tag>
              <small>{r.verified ? '已独立核验' : '无独立核验记录'}</small>
            </Space>
          ),
        },
        {
          title: '原始来源',
          width: 140,
          render: (_, r) => quoteSourceLabels[r.quote.sourceType],
        },
        {
          title: '生效 / 截止',
          width: 210,
          render: (_, r) => (
            <div>
              {displayDate(r.quote.effectiveFrom)}
              <small className="resource-subtitle">
                至 {displayDate(r.quote.effectiveUntil)}
              </small>
            </div>
          ),
        },
        {
          title: '最近记录更新',
          width: 180,
          render: (_, r) => displayDate(r.updatedAt),
        },
        {
          title: '操作',
          fixed: 'right',
          width: 100,
          render: (_, r) => <Link to={`/quotes/${r.quote.id}`}>查看报价</Link>,
        },
      ]}
      locale={{ emptyText: '当前授权或筛选范围内暂无报价记录' }}
    />
  );
}
