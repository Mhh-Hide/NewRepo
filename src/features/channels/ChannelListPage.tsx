import { useCallback, useState } from 'react';
import { Alert, Button, Card, Input, Modal, Select, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type { ChannelView } from '../../auth/view-models';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/FeedbackStates';
import { useResourceQuery } from '../models/use-resource-query';
import { resourceErrorMessage } from '../../services/resource-types';
import {
  channelTypeLabels,
  qualityStatusLabels,
  connectivityStatusLabels,
  integrationStatusLabels,
  availabilityStatusLabels,
} from '../../domain/statuses';
import { StatusBadge } from '../../components/StatusBadge';
import { formatCapacity } from './format-capacity';
import { ChannelEditor } from './ChannelEditor';
const statusLabels = {
  channelType: channelTypeLabels,
  resourceStatus: { enabled: '启用', disabled: '停用' },
  qualityStatus: qualityStatusLabels,
  connectivityStatus: connectivityStatusLabels,
  integrationStatus: integrationStatusLabels,
  availabilityStatus: availabilityStatusLabels,
};
export default function ChannelListPage() {
  const session = useOutletContext<DemoSession>();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [tableKey, setTableKey] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState(false);
  const [reset, setReset] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const [channels, models, vendors, suppliers, access] = await Promise.all([
      session.api.listChannels(),
      session.api.listModels(),
      session.api.listVendors(),
      session.api.listSuppliers(),
      session.api.channelAccess(),
    ]);
    return { channels, models, vendors, suppliers, access };
  }, [session.api]);
  const { result, reload } = useResourceQuery(load);
  const header = (
    <PageHeader
      title="渠道管理"
      description="统一维护模型资源渠道、供应商关联、资源能力及接入基础信息。"
      group="资源管理"
      actions={
        <Space wrap>
          <Button onClick={reload}>刷新渠道</Button>
          {session.permits('channel:create') &&
            session.profile.domains.length > 0 && (
              <Button type="primary" onClick={() => setEditing(true)}>
                新增渠道
              </Button>
            )}
          {session.permits('demo:reset') &&
            session.domain === 'all' &&
            session.profile.domains.length === 2 && (
              <Button onClick={() => setReset(true)}>重置渠道演示数据</Button>
            )}
        </Space>
      }
    />
  );
  const resetDialog = (
    <Modal
      title="确认重置渠道演示数据"
      open={reset}
      okText="确认重置渠道"
      onCancel={() => {
        setReset(false);
        setError('');
      }}
      onOk={async () => {
        try {
          await session.api.resetChannelDemo(true);
          setReset(false);
          reload();
        } catch (e) {
          setError(resourceErrorMessage(e));
        }
      }}
    >
      <p>
        恢复初始渠道和测试任务，清除新增渠道及渠道变更历史；保留供应商主档与历史。此操作仅限本浏览器
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
  const { channels, models, vendors, suppliers } = result.data;
  const identity = result.data.access.supplierIdentity;
  const tech = result.data.access.technical;
  const filter = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const rows = channels.filter((c) => {
    const model = models.find((m) => m.id === c.modelId);
    return (
      (!filters.search ||
        `${c.displayName} ${c.anonymousCode}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())) &&
      (!filters.modelId || c.modelId === filters.modelId) &&
      (!filters.vendorId || model?.vendorId === filters.vendorId) &&
      (!identity ||
        !filters.supplierId ||
        c.supplierId === filters.supplierId) &&
      Object.keys(statusLabels).every(
        (k) => !filters[k] || c[k as keyof ChannelView] === filters[k],
      ) &&
      (!tech ||
        !filters.op ||
        (c.opChannelId === null ? 'unbound' : 'bound') === filters.op)
    );
  });
  const metrics: [string, string, number][] = [
    ['total', '渠道总数', channels.length],
    [
      'enabled',
      '启用渠道',
      channels.filter((c) => c.resourceStatus === 'enabled').length,
    ],
    ...(tech
      ? [
          [
            'unbound',
            '未绑定 OP ID',
            channels.filter((c) => c.opChannelId === null).length,
          ] as [string, string, number],
        ]
      : []),
    [
      'quality',
      '待质量测试',
      channels.filter((c) => c.qualityStatus === 'pending').length,
    ],
    [
      'connectivity',
      '待连通性测试',
      channels.filter((c) => c.connectivityStatus === 'pending').length,
    ],
    [
      'integrated',
      '已接入',
      channels.filter((c) => c.integrationStatus === 'integrated').length,
    ],
    [
      'open',
      '已开放',
      channels.filter((c) => c.availabilityStatus === 'open').length,
    ],
  ];
  const columns: ColumnsType<ChannelView> = [
    {
      title: '渠道名称 / 代号',
      dataIndex: 'displayName',
      width: 240,
      sorter: (a, b) => a.displayName.localeCompare(b.displayName),
      render: (_, c) => (
        <div>
          <Link to={`/channels/${c.id}`}>{c.displayName}</Link>
          <small className="resource-subtitle">{c.anonymousCode}</small>
        </div>
      ),
    },
    { title: '内部渠道 ID', dataIndex: 'id', width: 230 },
    {
      title: '模型 / 厂商',
      width: 200,
      render: (_, c) => {
        const m = models.find((m) => m.id === c.modelId);
        return (
          <div>
            {m?.name}
            <small className="resource-subtitle">
              {vendors.find((v) => v.id === m?.vendorId)?.name}
            </small>
          </div>
        );
      },
    },
    ...(identity
      ? [
          {
            title: '供应商',
            width: 200,
            render: (_: unknown, c: ChannelView) =>
              suppliers.find((s) => s.id === c.supplierId)?.name ?? '—',
          },
        ]
      : []),
    {
      title: '渠道类型',
      width: 150,
      render: (_, c) => channelTypeLabels[c.channelType],
    },
    ...(['tpm', 'rpm', 'concurrencyLimit', 'ttftMs'] as const).map(
      (key, i) => ({
        title: ['TPM', 'RPM', '并发', 'TTFT (ms)'][i],
        dataIndex: key,
        width: 110,
        sorter: (a: ChannelView, b: ChannelView) =>
          (a[key] ?? -1) - (b[key] ?? -1),
        render: (v: number | null) => formatCapacity(v),
      }),
    ),
    ...(
      [
        'resourceStatus',
        'qualityStatus',
        'connectivityStatus',
        'integrationStatus',
        'availabilityStatus',
      ] as const
    ).map((key, i) => ({
      title: ['资源状态', '质量测试', '连通性测试', '接入状态', '开放状态'][i],
      width: 150,
      render: (_: unknown, c: ChannelView) => (
        <StatusBadge
          label={
            (statusLabels[key] as Record<string, string>)[c[key]] ?? c[key]
          }
        />
      ),
    })),
    ...(tech
      ? [
          {
            title: '最近更新时间',
            dataIndex: 'updatedAt',
            width: 180,
            sorter: (a: ChannelView, b: ChannelView) =>
              (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''),
            render: (v: string | undefined) =>
              v ? new Date(v).toLocaleString('zh-CN') : '—',
          },
        ]
      : []),
    {
      title: '操作',
      fixed: 'right',
      width: 120,
      render: (_, c) => (
        <Link to={`/channels/${c.id}`}>
          {session.permits('channel:update') ? '查看 / 维护' : '查看详情'}
        </Link>
      ),
    },
  ];
  const select = (
    key: string,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <Select
      key={key}
      aria-label={label}
      value={filters[key] || ''}
      options={[{ value: '', label: `全部${label}` }, ...options]}
      onChange={(value) => filter(key, value)}
    />
  );
  return (
    <>
      {header}
      <div className="stats-grid resource-stats">
        {metrics.map(([id, label, value]) => (
          <StatCard
            key={id}
            metric={{
              id: `channel-${id}`,
              label,
              value,
              note: '当前授权范围，各状态独立统计；仅模拟数据',
            }}
          />
        ))}
      </div>
      <Card title="渠道目录" extra="Mock · 资源主档">
        <div className="resource-filters">
          <Input
            aria-label="渠道名称或匿名代号"
            placeholder="搜索渠道名称或匿名代号"
            allowClear
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
            '模型',
            models.map((m) => ({ value: m.id, label: m.name })),
          )}
          {identity &&
            select(
              'supplierId',
              '供应商',
              suppliers.map((s) => ({ value: s.id, label: s.name })),
            )}
          {Object.entries(statusLabels).map(([key, labels], i) =>
            select(
              key,
              [
                '渠道类型',
                '资源状态',
                '质量测试',
                '连通性测试',
                '接入状态',
                '开放状态',
              ][i]!,
              Object.entries(labels).map(([value, label]) => ({
                value,
                label,
              })),
            ),
          )}
          {tech &&
            select('op', 'OP 绑定', [
              { value: 'bound', label: '已绑定' },
              { value: 'unbound', label: '未绑定' },
            ])}
          <Button
            onClick={() => {
              setFilters({});
              setPage(1);
              setTableKey((k) => k + 1);
            }}
          >
            重置筛选
          </Button>
        </div>
        <Table<ChannelView>
          key={tableKey}
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={rows}
          scroll={{ x: 2600 }}
          pagination={{
            current: page,
            pageSize,
            total: rows.length,
            showSizeChanger: true,
            pageSizeOptions: [5, 10, 20, 50],
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
            showTotal: (n) => `共 ${n} 条渠道`,
          }}
          locale={{
            emptyText: (
              <EmptyState description="当前授权范围或筛选条件下暂无渠道" />
            ),
          }}
        />
      </Card>
      {editing && (
        <ChannelEditor
          session={session}
          onClose={() => setEditing(false)}
          onSaved={(id) => navigate(`/channels/${id}`)}
        />
      )}
      {resetDialog}
    </>
  );
}
