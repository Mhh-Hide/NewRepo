import type { ApiAdapter } from './api-adapter';
import type { DemoSession } from './demo-session';
import type {
  DashboardData,
  Dimension,
  Metric,
  Activity,
} from '../features/dashboard/types';
import {
  availabilityStatusLabels,
  connectivityStatusLabels,
  integrationStatusLabels,
  qualityStatusLabels,
  quoteStatusLabels,
  sourcingStatusLabels,
} from '../domain/statuses';
/** Aggregate authorized responses only. Never imports the fixture or raw audit snapshots. */
export async function loadDashboard(
  api: ApiAdapter,
  permits: DemoSession['permits'],
): Promise<DashboardData> {
  const [models, suppliers, channels, demands, tasks, remediations, incidents] =
    await Promise.all([
      api.listModels(),
      api.listSuppliers(),
      api.listChannels(),
      api.listDemands(),
      api.listTestTasks(),
      api.listRemediations(),
      api.listIncidents(),
    ]);
  const [details, quoteGroups, executionGroups] = await Promise.all([
    Promise.all(demands.map((d) => api.getDemand(d.id))),
    permits('quote:read')
      ? Promise.all(channels.map((c) => api.getQuoteHistory(c.id)))
      : Promise.resolve([]),
    permits('test:read')
      ? Promise.all(tasks.map((t) => api.listTestExecutions(t.id)))
      : Promise.resolve([]),
  ]);
  const quotes = quoteGroups.flat();
  const executions = executionGroups.flat();
  const qualityPending = tasks.filter(
    (t) =>
      t.testType === 'quality' &&
      (t.status === 'pending' || t.status === 'running'),
  ).length;
  const connectivityPending = tasks.filter(
    (t) =>
      t.testType === 'connectivity' &&
      (t.status === 'pending' || t.status === 'running'),
  ).length;
  const remediationPending = remediations.filter(
    (r) => r.status !== 'closed',
  ).length;
  const sourcing =
    permits('sourcing:read') && models.length
      ? await api.querySourcing({ pageSize: 1 })
      : null;
  const gapCount = sourcing?.stats.gaps ?? 0;
  const pricing =
    permits('quote:read') && models.length
      ? await api.queryQuotes({ pageSize: 1 })
      : null;
  const metrics: Metric[] = [];
  const add = (id: string, label: string, value: number, note: string) =>
    metrics.push({ id, label, value, note });
  if (permits('supplier:read'))
    add('suppliers', '授权供应商', suppliers.length, '按稳定供应商 ID 去重');
  add('models', '模型资源', models.length, '按模型版本与地区记录计数');
  add('channels', '资源渠道', channels.length, '同模型的多条渠道分别计数');
  if (permits('demand:read'))
    add(
      'demands',
      '授权需求',
      demands.length,
      '当前授权需求主单；未开展寻源不直接视为已确认缺口',
    );
  if (permits('demand:read') && permits('quote:read'))
    add(
      'gaps',
      '资源缺口需求',
      gapCount,
      '已有寻源记录或明确标记缺口的明细，人工初步符合供应商不足三家；未开展不计入',
    );
  if (permits('test:read')) {
    add(
      'quality',
      '质量测试待处理',
      qualityPending,
      '任务状态为待处理或进行中',
    );
    add(
      'connectivity',
      '连通性待处理',
      connectivityPending,
      '与质量测试独立统计',
    );
  }
  if (permits('remediation:read'))
    add(
      'remediations',
      '整改待跟进',
      remediationPending,
      '未关闭的授权整改记录',
    );
  if (permits('incident:read') && !permits('quote:read'))
    add(
      'incidents',
      '事件待处理',
      incidents.filter(
        (i) => i.status === 'reported' || i.status === 'investigating',
      ).length,
      '已登记或调查中的人工事件',
    );
  if (permits('quote:read'))
    add(
      'quotes',
      '待合同确认报价',
      pricing?.stats.pending ?? 0,
      '不推断审批或最终结算价',
    );
  if (permits('quote:read')) {
    add(
      'quote-expiring',
      '七天内到期优惠',
      pricing?.stats.expiring ?? 0,
      '当前有效且未来7天内到期的临时优惠，不代表自动结算价',
    );
    add(
      'quote-new-channels',
      '近七天有报价渠道',
      pricing?.stats.newChannels ?? 0,
      '报价创建时间在最近7天，按渠道ID去重',
    );
  }
  const dimensions: Dimension[] = [];
  function dimension(
    name: string,
    basis: string,
    labels: Readonly<Record<string, string>>,
    values: readonly string[],
  ) {
    dimensions.push({
      name,
      basis,
      counts: Object.entries(labels).map(([code, label]) => ({
        label,
        value: values.filter((v) => v === code).length,
      })),
    });
  }
  if (permits('demand:read'))
    dimension(
      '采购寻源',
      '需求明细',
      sourcingStatusLabels,
      details.flatMap((d) => d?.items.map((i) => i.status) ?? []),
    );
  dimension(
    '质量测试',
    '渠道',
    qualityStatusLabels,
    channels.map((c) => c.qualityStatus),
  );
  dimension(
    '连通性测试',
    '渠道',
    connectivityStatusLabels,
    channels.map((c) => c.connectivityStatus),
  );
  dimension(
    '渠道接入',
    '渠道',
    integrationStatusLabels,
    channels.map((c) => c.integrationStatus),
  );
  dimension(
    '渠道开放',
    '渠道',
    availabilityStatusLabels,
    channels.map((c) => c.availabilityStatus),
  );
  const todos: DashboardData['todos'][number][] = [];
  const todo = (label: string, count: number, path: string) => {
    if (count > 0) todos.push({ label, count, path });
  };
  if (permits('quote:read'))
    todo('待合同确认报价', pricing?.stats.pending ?? 0, '/quotes');
  if (permits('demand:process'))
    todo(
      '待寻源需求（草稿 / 寻源 / 缺口）',
      demands.filter((d) => ['draft', 'sourcing', 'gap'].includes(d.status))
        .length,
      '/sourcing',
    );
  if (permits('operations:manage')) todo('资源缺口需求', gapCount, '/sourcing');
  if (permits('test:read')) {
    todo('质量测试待处理', qualityPending, '/tests');
    todo('连通性测试待处理', connectivityPending, '/tests');
    todo(
      '测试异常渠道',
      channels.filter(
        (c) =>
          c.qualityStatus === 'failed' || c.connectivityStatus === 'failed',
      ).length,
      '/tests',
    );
  }
  if (permits('remediation:read'))
    todo('整改待跟进', remediationPending, '/remediations');
  if (permits('incident:read'))
    todo(
      '供应商事件待处理',
      incidents.filter(
        (i) => i.status === 'reported' || i.status === 'investigating',
      ).length,
      '/governance',
    );
  const activities: Activity[] = [
    ...quotes.map((q) => ({
      id: 'quote:' + q.id,
      title: `报价记录 · ${quoteStatusLabels[q.priceStatus]}`,
      occurredAt: q.confirmedAt ?? q.createdAt,
      kind: '报价',
    })),
    ...channels.flatMap((c) =>
      c.updatedAt
        ? [
            {
              id: 'channel:' + c.id,
              title: `渠道记录 · ${c.displayName}`,
              occurredAt: c.updatedAt,
              kind: '渠道',
            },
          ]
        : [],
    ),
    ...executions.map((e) => ({
      id: 'test:' + e.id,
      title: `测试执行 · ${e.result === 'passed' ? '通过' : e.result === 'failed' ? '失败' : '结果待定'}`,
      occurredAt: e.finishedAt ?? e.startedAt,
      kind: '测试',
    })),
    ...remediations.map((r) => ({
      id: 'rem:' + r.id,
      title: '整改进度记录',
      occurredAt: r.updatedAt,
      kind: '整改',
    })),
    ...incidents.map((i) => ({
      id: 'incident:' + i.id,
      title: i.summary,
      occurredAt: i.updatedAt,
      kind: '事件',
    })),
  ]
    .sort(
      (a, b) =>
        b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id),
    )
    .filter(
      (entry, index, all) =>
        all.findIndex((other) => other.kind === entry.kind) === index,
    )
    .slice(0, 5);
  return {
    source: 'mock',
    metrics,
    dimensions,
    todos,
    activities,
    suppliers: suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      shortCode: s.shortCode,
      status: s.status,
    })),
    channels: channels.map((c) => ({
      id: c.id,
      name: c.displayName,
      tpm: c.tpm,
      rpm: c.rpm,
      model: models.find((m) => m.id === c.modelId)?.name ?? '未知模型',
      ...(c.supplierId
        ? {
            supplierName:
              suppliers.find((s) => s.id === c.supplierId)?.name ??
              '授权供应商',
          }
        : {}),
      quality: qualityStatusLabels[c.qualityStatus],
      connectivity: connectivityStatusLabels[c.connectivityStatus],
      integration: integrationStatusLabels[c.integrationStatus],
      availability: availabilityStatusLabels[c.availabilityStatus],
    })),
    quotes: quotes.map((q) => ({
      id: q.id,
      channel:
        channels.find((c) => c.id === q.channelId)?.displayName ?? '授权渠道',
      discount: q.discount,
      status: quoteStatusLabels[q.priceStatus],
    })),
    isEmpty:
      models.length === 0 &&
      channels.length === 0 &&
      demands.length === 0 &&
      incidents.length === 0,
  };
}
