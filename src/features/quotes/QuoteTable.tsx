import { Table, Tag, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import type { QuoteRow } from '../../services/quotation-types';
import { quoteStatusLabels, channelTypeLabels } from '../../domain/statuses';
import { priceHistoryEnd } from '../../domain/current-price';
import { quoteDiscount, displayDate } from './quote-format';
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
      dataSource={[...rows].sort((a, b) =>
        a.quote.createdAt.localeCompare(b.quote.createdAt),
      )}
      scroll={{ x: 1100 }}
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
        { title: '模型', width: 170, render: (_, r) => r.model.name },
        {
          title: '供应商',
          width: 120,
          render: (_, r) => (
            <Tooltip title={r.supplier.name}>
              {r.supplier.shortCode || r.supplier.name}
            </Tooltip>
          ),
        },
        {
          title: '渠道',
          width: 220,
          render: (_, r) => (
            <Link to={`/channels/${r.channel.id}`}>
              {r.channel.displayName}
            </Link>
          ),
        },
        {
          title: '类型',
          width: 150,
          render: (_, r) => channelTypeLabels[r.channel.channelType],
        },
        {
          title: '报价折扣',
          width: 110,
          render: (_, r) => quoteDiscount(r.quote),
        },
        {
          title: '报价状态',
          width: 130,
          render: (_, r) => <Tag>{quoteStatusLabels[r.quote.priceStatus]}</Tag>,
        },
        {
          title: '生效日期',
          width: 120,
          render: (_, r) => displayDate(r.quote.effectiveFrom),
        },
        {
          title: '结束日期',
          width: 120,
          render: (_, r) => {
            const end = priceHistoryEnd(
              r.quote,
              rows.map((x) => x.quote),
            );
            return end ? displayDate(end) : '不设截止';
          },
        },
        {
          title: '操作',
          width: 90,
          render: (_, r) => <Link to={`/quotes/${r.quote.id}`}>查看报价</Link>,
        },
      ]}
      locale={{ emptyText: '暂无报价记录' }}
    />
  );
}
