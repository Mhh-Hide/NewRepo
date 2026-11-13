import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type { SourcingQuery, SourcingRow } from '../../services/sourcing-types';
import { sourcingStatusLabels } from '../../domain/statuses';
import type { SourcingStatus } from '../../domain/statuses';
import { priorityLabels } from '../../domain/sourcing';
import type { Priority } from '../../domain/sourcing';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
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
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState(false);
  const [reset, setReset] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const query: SourcingQuery = {
      page,
      pageSize,
      search: filters.search ?? '',
      ...(filters.model ? { modelId: filters.model } : {}),
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
    return { data, models };
  }, [session.api, filters, page, pageSize]);
  const { result, reload } = useResourceQuery(load);
  const filter = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const header = (
    <PageHeader
      title="采购寻源"
      description="统一管理模型资源采购需求、候选渠道与资源缺口。"
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
  const { data, models } = result.data;
  const metrics = [
    ['total', '需求总数', data.stats.total],
    ['active', '寻源中需求', data.stats.sourcing],
    ['gaps', '存在资源缺口', data.stats.gaps],
    ['matched', '已匹配需求', data.stats.matched],
    ['urgent', '紧急需求', data.stats.urgent],
  ] as const;
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
  return (
    <>
      {header}
      <div className="stats-grid resource-stats">
        {metrics.map(([id, label, value]) => (
          <StatCard
            key={id}
            metric={{
              id: `sourcing-${id}`,
              label,
              value,
              note: '当前授权范围主单统计；未开展寻源不直接计作已确认缺口',
            }}
          />
        ))}
      </div>
      <Card title="资源寻源需求" extra={<Tag>Mock · 授权需求</Tag>}>
        <div className="resource-filters">
          <Input
            aria-label="需求编号或标题"
            placeholder="搜索需求编号或当前可见标题"
            allowClear
            value={filters.search ?? ''}
            onChange={(e) => filter('search', e.target.value)}
          />
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
        <p className="section-note">
          缺口为已有候选或人工确认不足的明细；零候选仍区分“尚未开展”。初步符合按不同供应商去重，不代表测试通过或采购完成。
        </p>
        <Table<SourcingRow>
          rowKey={(r) => r.demand.id}
          dataSource={[...data.rows]}
          size="small"
          scroll={{ x: 1350 }}
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
          columns={[
            {
              title: '需求编号 / 标题',
              width: 310,
              render: (_, r) => (
                <div>
                  <Link to={`/sourcing/${r.demand.id}`}>{r.demand.title}</Link>
                  <small className="resource-subtitle">
                    {r.demand.demandCode}
                  </small>
                </div>
              ),
            },
            { title: '模型明细', dataIndex: 'modelCount', width: 90 },
            {
              title: '寻源状态',
              width: 140,
              render: (_, r) => (
                <StatusBadge label={sourcingStatusLabels[r.demand.status]} />
              ),
            },
            {
              title: '缺口 / 待开展 / 待核实',
              width: 200,
              render: (_, r) =>
                `${r.gapItems} / ${r.notStartedItems} / ${r.pendingItems}`,
            },
            {
              title: '优先级',
              width: 120,
              render: (_, r) => priorityLabels[r.demand.priority],
            },
            {
              title: '最近更新',
              width: 180,
              render: (_, r) =>
                new Date(r.demand.updatedAt).toLocaleString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                }),
            },
            {
              title: '创建时间',
              width: 180,
              render: (_, r) =>
                new Date(r.demand.createdAt).toLocaleString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                }),
            },
            {
              title: '操作',
              fixed: 'right',
              width: 90,
              render: (_, r) => (
                <Link to={`/sourcing/${r.demand.id}`}>查看详情</Link>
              ),
            },
          ]}
          locale={{
            emptyText: (
              <EmptyState description="当前授权范围或筛选条件下暂无采购需求" />
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
