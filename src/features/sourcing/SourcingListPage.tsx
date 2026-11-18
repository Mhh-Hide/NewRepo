import { useColumns } from '../procurement/use-columns';
import { listDemoProfiles } from '../../services/demo-session';
import { useCallback, useState } from 'react';
import { Alert, Button, Card, Input, Modal, Select, Space, Table } from 'antd';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type { SourcingQuery, SourcingRow } from '../../services/sourcing-types';
import { sourcingStatusLabels } from '../../domain/statuses';
import type { SourcingStatus } from '../../domain/statuses';
import { priorityLabels } from '../../domain/sourcing';
import type { Priority } from '../../domain/sourcing';
import { PageHeader } from '../../components/PageHeader';
import { ColumnSettings } from '../procurement/ColumnSettings';
import { DemandTree } from './DemandTree';
import { displayDate } from '../quotes/quote-format';
import type { ColumnsType } from 'antd/es/table';
import { StatusBadge } from '../../components/StatusBadge';
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/FeedbackStates';
import { resourceErrorMessage } from '../../services/resource-types';
import { useResourceQuery } from '../models/use-resource-query';
import { SourcingEditor } from './SourcingEditor';
export default function SourcingListPage() {
  const session = useOutletContext<DemoSession>();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Record<string, string>>(
    ['Procurement', 'ProductOperations'].includes(session.profile.user.role) &&
      !['u-proc', 'u-ops'].includes(session.profile.user.id)
      ? { ownerId: session.profile.user.id }
      : {},
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const defaults = [
    'customer',
    'title',
    'models',
    'candidates',
    'status',
    'met',
    'actions',
  ];
  const prefs = useColumns(
    `maas:columns:demands:${session.profile.user.id}`,
    defaults,
  );
  const [reset, setReset] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const query: SourcingQuery = {
      page,
      pageSize,
      search: filters.search ?? '',
      ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
      ...(filters.model ? { modelId: filters.model } : {}),
      ...(filters.domain
        ? { manufacturerDomain: filters.domain as 'domestic' | 'overseas' }
        : {}),
      ...(filters.status ? { status: filters.status as SourcingStatus } : {}),
      ...(filters.priority ? { priority: filters.priority as Priority } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      sort: (filters.sort ?? 'updatedAt') as SourcingQuery['sort'] & string,
      order: filters.order === 'asc' ? 'asc' : 'desc',
    };
    const [data, models] = await Promise.all([
      session.api.querySourcing(query),
      session.api.listModels(),
    ]);
    const [details, goals, progress] = await Promise.all([
      Promise.all(
        data.rows.map((r) => session.api.getSourcingDemand(r.demand.id)),
      ),
      session.permits('lifecycle:read')
        ? Promise.all(
            data.rows.map((r) => session.api.resourceGoal(r.demand.id)),
          )
        : [],
      session.permits('lifecycle:read') ? session.api.queryLifecycle({}) : null,
    ]);
    const users = listDemoProfiles().map((p) => p.user);
    return { data, models, details, users, goals, progress };
  }, [session, filters, page, pageSize]);
  const { result, reload } = useResourceQuery(load);
  const filter = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const header = (
    <PageHeader
      title="采购需求"
      description=""
      group="业务协同"
      actions={
        <Space wrap>
          <Button onClick={reload}>刷新寻源</Button>
          {session.permits('sourcing:create') &&
            session.profile.domains.length > 0 && (
              <Button type="primary" onClick={() => setEditing(true)}>
                新增采购需求
              </Button>
            )}
          {session.permits('demo:reset') &&
            session.domain === 'all' &&
            session.profile.domains.length === 2 && (
              <Button onClick={() => setReset(true)}>重置寻源演示数据</Button>
            )}
        </Space>
      }
    />
  );
  const resetDialog = (
    <Modal
      title="确认重置寻源演示数据"
      open={reset}
      okText="确认重置寻源"
      onCancel={() => {
        setReset(false);
        setError('');
      }}
      onOk={async () => {
        try {
          await session.api.resetSourcingDemo(true);
          setReset(false);
          reload();
        } catch (e) {
          setError(resourceErrorMessage(e));
        }
      }}
    >
      <p>
        恢复初始需求、模型明细、候选关系，清除本地寻源跟进记录。供应商、渠道、测试及报价数据保持原样。仅作用于本浏览器
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
  const { data, models, details, users, goals, progress } = result.data;
  const selector = (
    key: string,
    label: string,
    options: readonly { value: string; label: string }[],
  ) => (
    <Select
      key={key}
      aria-label={label}
      value={filters[key] ?? ''}
      options={[{ value: '', label: `全部${label}` }, ...options]}
      onChange={(v) => filter(key, v)}
    />
  );
  const columns: ColumnsType<SourcingRow> = [
    {
      key: 'customer',
      title: '客户',
      width: 160,
      render: (_, r) => r.demand.customer?.name || '客户需求',
    },
    {
      key: 'title',
      title: '采购需求',
      width: 260,
      render: (_, r) => (
        <Link to={`/sourcing/${r.demand.id}`}>{r.demand.title}</Link>
      ),
    },
    {
      key: 'models',
      title: '模型数量',
      width: 100,
      render: (_, r) => r.modelCount,
    },
    {
      key: 'candidates',
      title: '候选渠道',
      width: 100,
      render: (_, r) =>
        details
          .find((d) => d?.demand.id === r.demand.id)
          ?.items.reduce((n, i) => n + i.candidates.length, 0) ?? 0,
    },
    {
      key: 'status',
      title: '寻源状态',
      width: 120,
      render: (_, r) => (
        <StatusBadge label={sourcingStatusLabels[r.demand.status]} />
      ),
    },
    {
      key: 'met',
      title: '已满足／待满足',
      width: 150,
      render: (_, r) => {
        const items =
          details.find((d) => d?.demand.id === r.demand.id)?.items ?? [];
        const met = items.filter(
          (i) =>
            i.candidates.filter(
              (c) =>
                progress?.rows.find((p) => p.id === c.channel.id)?.schedulable,
            ).length >= (goals[data.rows.indexOf(r)]?.customerSigned ? 3 : 1),
        ).length;
        return `${met} / ${items.length - met}`;
      },
    },
    {
      key: 'owner',
      title: '产品运营',
      width: 110,
      render: (_, r) =>
        users.find(
          (u) => u.id === (r.demand.operationsOwnerId || r.demand.createdBy),
        )?.name || '待分配',
    },
    {
      key: 'sales',
      title: '销售负责人',
      width: 110,
      render: (_, r) =>
        users.find((u) => u.id === r.demand.salesOwnerId)?.name || '待补充',
    },
    {
      key: 'start',
      title: '发起日期',
      width: 120,
      render: (_, r) => displayDate(r.demand.createdAt),
    },
    {
      key: 'end',
      title: '截止日期',
      width: 120,
      render: (_, r) =>
        r.demand.dueAt ? displayDate(r.demand.dueAt) : '未指定',
    },
    {
      key: 'updated',
      title: '最近更新',
      width: 120,
      render: (_, r) => displayDate(r.demand.updatedAt),
    },
    {
      key: 'currency',
      title: '用量币种',
      width: 100,
      render: (_, r) => r.demand.usageCurrency || '—',
    },
    {
      key: 'usage',
      title: '预计月用量',
      width: 150,
      render: (_, r) => r.demand.monthlyUsage || '待补充',
    },
    {
      key: 'actions',
      title: '操作',
      width: 100,
      fixed: 'right',
      render: (_, r) => <Link to={`/sourcing/${r.demand.id}`}>查看详情</Link>,
    },
  ];
  const columnOptions = columns.map((c) => ({
    value: String(c.key),
    label: String(c.title),
  }));
  return (
    <>
      {header}
      <Card title="需求清单">
        <div className="resource-filters">
          {selector(
            'ownerId',
            '工作范围',
            listDemoProfiles()
              .filter((p) => p.user.role === session.profile.user.role)
              .map((p) => ({
                value: p.user.id,
                label:
                  p.user.id === session.profile.user.id
                    ? '我的工作'
                    : p.user.name,
              })),
          )}
          <Input
            aria-label="需求编号或标题"
            placeholder="搜索需求编号或当前可见标题"
            allowClear
            value={filters.search ?? ''}
            onChange={(e) => filter('search', e.target.value)}
          />
          {selector('domain', '厂商归属', [
            { value: 'domestic', label: '国内厂商' },
            { value: 'overseas', label: '海外厂商' },
          ])}
          {selector(
            'model',
            '需求模型',
            models.map((m) => ({ value: m.id, label: m.name })),
          )}
          {selector(
            'status',
            '需求状态',
            Object.entries(sourcingStatusLabels).map(([value, label]) => ({
              value,
              label,
            })),
          )}
          <Button onClick={() => setAdvanced(!advanced)}>更多筛选</Button>
          <ColumnSettings
            options={columnOptions}
            defaults={defaults}
            selected={prefs.selected}
            onChange={prefs.update}
          />
        </div>
        {advanced && (
          <div className="resource-filters">
            {' '}
            {selector(
              'priority',
              '优先级',
              Object.entries(priorityLabels).map(([value, label]) => ({
                value,
                label,
              })),
            )}
            <label className="sourcing-date">
              创建起始日期
              <Input
                aria-label="创建起始日期"
                type="date"
                value={filters.from ?? ''}
                onChange={(e) => filter('from', e.target.value)}
              />
            </label>
            <label className="sourcing-date">
              创建截止日期
              <Input
                aria-label="创建截止日期"
                type="date"
                value={filters.to ?? ''}
                onChange={(e) => filter('to', e.target.value)}
              />
            </label>
            <Select
              aria-label="需求排序字段"
              value={filters.sort ?? 'updatedAt'}
              options={[
                { value: 'updatedAt', label: '按最近更新' },
                { value: 'createdAt', label: '按创建时间' },
                { value: 'demandCode', label: '按需求编号' },
              ]}
              onChange={(v) => filter('sort', v)}
            />
            <Select
              aria-label="需求排序方向"
              value={filters.order ?? 'desc'}
              options={[
                { value: 'desc', label: '降序' },
                { value: 'asc', label: '升序' },
              ]}
              onChange={(v) => filter('order', v)}
            />
            <Button
              onClick={() => {
                setFilters({});
                setPage(1);
              }}
            >
              重置筛选
            </Button>
          </div>
        )}
        <Table<SourcingRow>
          rowKey={(r) => r.demand.id}
          dataSource={[...data.rows]}
          size="small"
          scroll={{ x: 1050 }}
          pagination={{
            current: page,
            pageSize,
            total: data.total,
            showSizeChanger: true,
            pageSizeOptions: [5, 10, 20, 50],
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
            showTotal: (n) => `共 ${n} 条授权需求`,
          }}
          expandable={{
            expandedRowRender: (r) => {
              const d = details.find((d) => d?.demand.id === r.demand.id);
              return d ? (
                <DemandTree
                  detail={d}
                  session={session}
                  progress={progress?.rows ?? []}
                  required={goals[data.rows.indexOf(r)]?.customerSigned ? 3 : 1}
                />
              ) : null;
            },
          }}
          columns={columns.filter((c) =>
            prefs.selected.includes(String(c.key)),
          )}
          locale={{
            emptyText: (
              <EmptyState description="当前业务范围或筛选条件下暂无采购需求" />
            ),
          }}
        />
      </Card>
      {editing && (
        <SourcingEditor
          session={session}
          onClose={() => setEditing(false)}
          onSaved={(id) => navigate(`/sourcing/${id}`)}
        />
      )}
      {resetDialog}
    </>
  );
}
