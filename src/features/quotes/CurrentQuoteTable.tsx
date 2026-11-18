import { businessQuoteLabels } from '../../domain/quote-business';
import { useColumns } from '../procurement/use-columns';
import { Table, Tag, Tooltip, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import type { QuoteRow } from '../../services/quotation-types';
import type { DeliveryRecord } from '../../domain/lifecycle';
import { channelTypeLabels } from '../../domain/statuses';
import { listDemoProfiles } from '../../services/demo-session';
import { ColumnSettings } from '../procurement/ColumnSettings';
import { displayDate, quoteDiscount } from './quote-format';
const defaults = [
  'model',
  'supplier',
  'channel',
  'type',
  'discount',
  'status',
  'actions',
];
export function CurrentQuoteTable({
  rows,
  userId,
  records,
  page,
  pageSize,
  total,
  onPage,
}: {
  rows: readonly QuoteRow[];
  userId: string;
  records: readonly DeliveryRecord[];
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number, s: number) => void;
}) {
  const prefs = useColumns(`maas:columns:quotes:${userId}`, defaults);
  const users = listDemoProfiles();
  const columns: ColumnsType<QuoteRow> = [
    {
      key: 'model',
      title: '模型名称',
      width: 160,
      render: (_, r) => r.model.name,
    },
    {
      key: 'supplier',
      title: '供应商简称',
      width: 140,
      render: (_, r) => (
        <Tooltip title={r.supplier.name}>
          {r.supplier.shortCode || r.supplier.name}
        </Tooltip>
      ),
    },
    {
      key: 'channel',
      title: '渠道名称',
      width: 240,
      ellipsis: true,
      render: (_, r) => (
        <Link to={`/channels/${r.channel.id}`}>{r.channel.displayName}</Link>
      ),
    },
    {
      key: 'type',
      title: '渠道类型',
      width: 150,
      render: (_, r) => channelTypeLabels[r.channel.channelType],
    },
    {
      key: 'discount',
      title: '当前采购折扣',
      width: 140,
      render: (_, r) =>
        r.currentDiscount === null ? (
          '暂无适用价格'
        ) : (
          <strong>{quoteDiscount(r.quote)}</strong>
        ),
    },
    {
      key: 'status',
      title: '商务推进状态',
      width: 150,
      render: (_, r) => {
        const record = records.find((v) => v.channelId === r.channel.id);
        const ended =
          r.validity === 'expired' || record?.contractStage === 'terminated';
        const label = r.businessStatus
          ? businessQuoteLabels[r.businessStatus]
          : ended
            ? '已结束'
            : r.quote.priceStatus === 'temporary' && r.validity === 'in_period'
              ? '临时优惠'
              : record?.contractStage === 'effective'
                ? '合同已生效'
                : record?.contractStage === 'signing'
                  ? '合同签署中'
                  : r.quote.priceStatus === 'pending_contract' ||
                      r.quote.priceStatus === 'effective'
                    ? '待合同确认'
                    : '仅报价';
        return (
          <Tag color={label === '合同已生效' ? 'success' : 'default'}>
            {label}
          </Tag>
        );
      },
    },
    {
      key: 'owner',
      title: '当前负责人',
      width: 100,
      render: (_, r) =>
        users.find(
          (p) =>
            p.user.id ===
            (r.ownerUserId ??
              records.find((v) => v.channelId === r.channel.id)
                ?.procurementOwnerId ??
              r.quote.recordedBy),
        )?.user.name ?? '待分配',
    },
    {
      key: 'inquiry',
      title: '询价日期',
      width: 120,
      render: (_, r) => displayDate(r.quote.supplierQuotedAt),
    },
    {
      key: 'start',
      title: '生效日期',
      width: 120,
      render: (_, r) => displayDate(r.quote.effectiveFrom),
    },
    {
      key: 'end',
      title: '截止日期',
      width: 120,
      render: (_, r) =>
        r.quote.effectiveUntil
          ? displayDate(r.quote.effectiveUntil)
          : '不设截止',
    },
    {
      key: 'updated',
      title: '最近更新',
      width: 120,
      render: (_, r) => displayDate(r.updatedAt),
    },
    {
      key: 'tpm',
      title: 'TPM',
      width: 100,
      render: (_, r) => r.channel.tpm ?? '—',
    },
    {
      key: 'rpm',
      title: 'RPM',
      width: 100,
      render: (_, r) => r.channel.rpm ?? '—',
    },
    {
      key: 'concurrency',
      title: '并发',
      width: 100,
      render: (_, r) => r.channel.concurrencyLimit ?? '—',
    },
    {
      key: 'currency',
      title: '币种',
      width: 80,
      render: (_, r) => r.quote.priceSpec.currency ?? '—',
    },
    {
      key: 'evidence',
      title: '报价依据',
      width: 180,
      ellipsis: true,
      render: (_, r) => r.quote.evidenceReference ?? '—',
    },
    {
      key: 'actions',
      title: '操作',
      width: 100,
      fixed: 'right',
      render: (_, r) => <Link to={`/quotes/${r.quote.id}`}>查看详情</Link>,
    },
  ];
  const visible = columns.filter((c) => prefs.selected.includes(String(c.key)));
  return (
    <>
      <Space
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 12,
        }}
      >
        <ColumnSettings
          options={columns.map((c) => ({
            value: String(c.key),
            label: String(c.title),
          }))}
          defaults={defaults}
          selected={prefs.selected}
          onChange={prefs.update}
        />
      </Space>
      <Table<QuoteRow>
        size="middle"
        rowKey={(r) => r.quote.channelId}
        dataSource={[...rows]}
        columns={visible}
        scroll={{ x: visible.reduce((n, c) => n + Number(c.width ?? 100), 0) }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: onPage,
        }}
        locale={{ emptyText: '暂无符合条件的渠道报价' }}
      />
    </>
  );
}
