import { OwnerPicker } from '../procurement/OwnerPicker';
import { useCallback } from 'react';
import {
  Button,
  Descriptions,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import { Link } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type {
  SourcingDetail,
  SourcingItemDetail,
  CandidateView,
} from '../../services/sourcing-types';
import type { LifecycleRow } from '../../services/lifecycle-types';
import { channelTypeLabels } from '../../domain/statuses';
import { discountText } from '../procurement/discount';
import { applicableDiscount } from '../../domain/current-price';
import { listDemoProfiles } from '../../services/demo-session';
import { useResourceQuery } from '../models/use-resource-query';
import { ErrorState, LoadingState } from '../../components/FeedbackStates';
function Candidates({
  item,
  session,
  progress,
}: {
  item: SourcingItemDetail;
  session: DemoSession;
  progress: readonly LifecycleRow[];
}) {
  const load = useCallback(
    async () =>
      session.permits('quote:read')
        ? Promise.all(
            item.candidates.map(async (c) => ({
              id: c.channel.id,
              row: (
                await session.api.queryQuotes({
                  channelId: c.channel.id,
                  view: 'current',
                  pageSize: 1,
                })
              ).rows[0],
            })),
          )
        : [],
    [item, session],
  );
  const { result, reload } = useResourceQuery(load);
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error')
    return <ErrorState message={result.message} onRetry={reload} />;
  return (
    <Table<CandidateView>
      rowKey={(r) => r.match.id}
      size="small"
      pagination={false}
      dataSource={[...item.candidates]}
      scroll={{ x: 1000 }}
      columns={[
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
          title: '渠道名称',
          width: 220,
          render: (_, r) => (
            <Link to={`/channels/${r.channel.id}`}>
              {r.channel.displayName}
            </Link>
          ),
        },
        {
          title: '渠道类型',
          width: 140,
          render: (_, r) => channelTypeLabels[r.channel.channelType],
        },
        ...(session.permits('quote:read')
          ? [
              {
                title: '报价折扣',
                width: 110,
                render: (_: unknown, r: CandidateView) => {
                  const q = result.data.find((x) => x.id === r.channel.id)?.row;
                  return q &&
                    (applicableDiscount(q.quote) !== null ||
                      (['reference', 'pending_contract'].includes(
                        q.quote.priceStatus,
                      ) &&
                        q.validity !== 'expired'))
                    ? discountText(q.quote.discount)
                    : '待报价';
                },
              },
            ]
          : []),
        {
          title: '当前状态',
          width: 110,
          render: (_, r) => {
            const p = progress.find((p) => p.id === r.channel.id);
            return (
              <Tag>
                {p?.schedulable
                  ? '可用'
                  : r.channel.qualityStatus === 'failed' ||
                      r.channel.connectivityStatus === 'failed'
                    ? '整改中'
                    : r.channel.qualityStatus === 'passed'
                      ? '测试通过'
                      : r.channel.qualityStatus === 'running'
                        ? '测试中'
                        : result.data.find((x) => x.id === r.channel.id)?.row
                          ? '已报价'
                          : '接洽中'}
              </Tag>
            );
          },
        },
        {
          title: '跟进负责人',
          width: 100,
          render: (_, r) =>
            progress.find((p) => p.id === r.channel.id)?.currentOwner ||
            listDemoProfiles().find((p) => p.user.id === r.match.createdBy)
              ?.user.name ||
            '待分配',
        },
        {
          title: '下一步',
          width: 180,
          render: (_, r) =>
            progress.find((p) => p.id === r.channel.id)?.nextAction ||
            '补充报价与测试安排',
        },
        {
          title: '操作',
          width: 150,
          render: (_, r) => (
            <Space>
              {session.permits('quote:read') && (
                <Link to={`/quotes?channelId=${r.channel.id}`}>报价</Link>
              )}
              {session.permits('test:read') && (
                <Link to={`/tests?channelId=${r.channel.id}`}>测试</Link>
              )}
            </Space>
          ),
        },
      ]}
      locale={{ emptyText: '尚未找到候选渠道，可进入需求详情添加' }}
    />
  );
}
export function DemandTree({
  detail,
  session,
  progress,
  required = 1,
}: {
  required?: number;
  detail: SourcingDetail;
  session: DemoSession;
  progress: readonly LifecycleRow[];
}) {
  const users = listDemoProfiles();
  const person = (id: string | null | undefined) =>
    users.find((p) => p.user.id === id)?.user.name || '待补充';
  return (
    <div style={{ padding: '8px 8px 16px' }}>
      <Descriptions
        size="small"
        column={3}
        items={[
          {
            key: 'sales',
            label: '销售负责人',
            children: person(detail.demand.salesOwnerId),
          },
          {
            key: 'ops',
            label: '产品运营',
            children: person(
              detail.demand.operationsOwnerId || detail.demand.createdBy,
            ),
          },
          {
            key: 'usage',
            label: '预计月用量',
            children: detail.demand.monthlyUsage
              ? `${detail.demand.monthlyUsage} ${detail.demand.usageCurrency ?? ''}`
              : '待补充',
          },
          {
            key: 'form',
            label: '合作形式',
            children: detail.demand.cooperationForm || '待补充',
          },
          {
            key: 'range',
            label: '整体目标折扣',
            children: detail.demand.targetDiscountRange || '待补充',
          },
          {
            key: 'notes',
            label: '客户备注／销售反馈',
            children:
              [detail.demand.customerNote, detail.demand.salesFeedback]
                .filter(Boolean)
                .join('；') || '—',
          },
        ]}
      />
      <Table<SourcingItemDetail>
        rowKey={(i) => i.item.id}
        size="small"
        pagination={false}
        dataSource={[...detail.items]}
        scroll={{ x: 950 }}
        expandable={{
          expandedRowRender: (i) => (
            <Candidates item={i} session={session} progress={progress} />
          ),
        }}
        columns={[
          {
            title: '模型名称与版本',
            width: 210,
            render: (_, i) => i.model.name,
          },
          {
            title: '区域版本',
            width: 120,
            render: (_, i) =>
              i.item.requiredRegion ||
              {
                domestic: '国内版',
                overseas: '海外版',
                global: '全球版',
                other: '其他',
              }[i.model.regionVariant],
          },
          {
            title: '目标折扣',
            width: 110,
            render: (_, i) =>
              i.item.targetDiscountUnknown
                ? '待补充'
                : discountText(i.item.targetPurchaseDiscount),
          },
          {
            title: '寻源进度',
            width: 130,
            render: (_, i) =>
              i.coverage.phase === 'not_started'
                ? '尚未寻源'
                : i.candidates.filter(
                      (c) =>
                        progress.find((p) => p.id === c.channel.id)
                          ?.schedulable,
                    ).length >= required
                  ? '已满足'
                  : '继续补充资源',
          },
          {
            title: '候选／可用',
            width: 100,
            render: (_, i) =>
              `${i.candidates.length} / ${i.candidates.filter((c) => progress.find((p) => p.id === c.channel.id)?.schedulable).length}`,
          },
          {
            title: '资源要求',
            width: 150,
            render: (_, i) => (
              <Tooltip
                title={
                  <div>
                    TPM：{i.item.requiredTpm ?? '不限'} · RPM：
                    {i.item.requiredRpm ?? '不限'} · 并发：
                    {i.item.requiredConcurrency ?? '不限'} · TTFT：
                    {i.item.requiredTtftMs ?? '不限'} ms
                    <br />
                    缓存：{i.item.cacheRequirement || '不限'}
                    <br />
                    用量：{i.item.expectedUsage || '待补充'}
                    <br />
                    质量：{i.item.qualityRequirements || '待补充'}
                  </div>
                }
              >
                查看要求
              </Tooltip>
            ),
          },
          {
            title: '默认采购 / 运营',
            width: 180,
            render: (_, i) => (
              <OwnerPicker
                session={session}
                modelId={i.model.id}
                domain={i.vendor.businessDomain}
              />
            ),
          },
          {
            title: '操作',
            width: 100,
            render: () => (
              <Link to={`/sourcing/${detail.demand.id}`}>维护候选</Link>
            ),
          },
        ]}
      />
      {session.profile.user.role === 'ProductOperations' && (
        <Button
          type="link"
          style={{ marginTop: 8 }}
          onClick={async () => {
            try {
              const p = (
                await session.api.querySalesProgress(detail.demand.id)
              )[0];
              if (!p) return;
              const text = p.models
                .map(
                  (m) =>
                    `${m.name}：${m.usable ? '已有可用资源' : m.problem ? '资源存在问题' : '仍在寻源'}；下一步${m.nextAction}`,
                )
                .join('\n');
              await navigator.clipboard.writeText(text);
              message.success('已复制销售进度摘要');
            } catch {
              message.error('复制失败，请在需求详情查看进度');
            }
          }}
        >
          复制销售进度摘要
        </Button>
      )}
    </div>
  );
}
