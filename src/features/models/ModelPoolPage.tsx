import { useCallback, useMemo, useState } from 'react';
import { Button, Card, Input, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type {
  ModelResourceQuery,
  ModelResourceSummary,
} from '../../services/resource-types';
import type { Model } from '../../domain/entities';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/FeedbackStates';
import { ResourceStateSummary } from '../channels/ResourceStateSummary';
import {
  modelCategoryLabels,
  regionVariantLabels,
  businessDomainLabels,
} from './resource-labels';
import { useResourceQuery } from './use-resource-query';
const initialFilters = {
  search: '',
  vendor: 'all',
  category: 'all' as Model['category'] | 'all',
  region: 'all' as Model['regionVariant'] | 'all',
  status: 'all' as Model['status'] | 'all',
  hasChannels: 'all' as 'all' | 'yes' | 'no',
  coverage: 'all' as 'all' | 'zero' | 'one_two' | 'three_plus',
};
export default function ModelPoolPage() {
  const session = useOutletContext<DemoSession>();
  const [params, setParams] = useSearchParams();
  const supplierId = params.get('supplierId');
  const [filters, setFilters] = useState(initialFilters);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10 });
  const [sort, setSort] = useState<Pick<ModelResourceQuery, 'sort' | 'order'>>({
    sort: 'name',
    order: 'asc',
  });
  const query = useMemo<ModelResourceQuery>(
    () => ({
      ...pagination,
      ...sort,
      search: filters.search,
      ...(supplierId !== null ? { supplierId } : {}),
      ...(filters.vendor !== 'all' ? { vendorId: filters.vendor } : {}),
      ...(filters.category !== 'all' ? { category: filters.category } : {}),
      ...(filters.region !== 'all' ? { regionVariant: filters.region } : {}),
      ...(filters.status !== 'all' ? { status: filters.status } : {}),
      ...(filters.hasChannels !== 'all'
        ? { hasChannels: filters.hasChannels }
        : {}),
      ...(filters.coverage !== 'all'
        ? { supplierCoverage: filters.coverage }
        : {}),
    }),
    [pagination, sort, filters, supplierId],
  );
  const load = useCallback(
    () => session.api.queryModelResources(query),
    [session.api, query],
  );
  const { result, reload } = useResourceQuery(load);
  const filter = (next: typeof filters) => {
    setFilters(next);
    setPagination((p) => ({ ...p, page: 1 }));
  };
  const clear = () => {
    filter(initialFilters);
    setSort({ sort: 'name', order: 'asc' });
    setParams({});
  };
  const header = (
    <PageHeader
      title="模型资源池"
      description="统一查看模型目录、供应商覆盖、渠道能力与资源接入进度。"
      group="资源管理"
      actions={
        <Space wrap>
          {supplierId !== null && (
            <Button onClick={clear}>清除供应商关联筛选</Button>
          )}
          <Button onClick={reload}>刷新资源</Button>
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
      </>
    );
  const data = result.data;
  const metrics = [
    { id: 'resource-models', label: '授权模型总数', value: data.stats.models },
    {
      id: 'resource-with-channels',
      label: '已找到渠道的模型',
      value: data.stats.withChannels,
    },
    {
      id: 'resource-without-channels',
      label: '无可见渠道模型',
      value: data.stats.withoutChannels,
    },
    ...(data.stats.threeSupplierModels !== undefined
      ? [
          {
            id: 'resource-three-suppliers',
            label: '覆盖至少三家供应商',
            value: data.stats.threeSupplierModels,
          },
        ]
      : []),
  ];
  const columns: ColumnsType<ModelResourceSummary> = [
    {
      title: '模型名称 / 代码',
      key: 'name',
      sorter: true,
      sortOrder:
        sort.sort === 'name'
          ? sort.order === 'asc'
            ? 'ascend'
            : 'descend'
          : null,
      width: 220,
      render: (_, r) => (
        <div>
          <Link
            className="resource-name"
            to={`/models/${encodeURIComponent(r.model.id)}`}
          >
            {r.model.name}
          </Link>
          <small className="resource-subtitle">{r.model.modelCode}</small>
        </div>
      ),
    },
    {
      title: '厂商 / 业务域',
      width: 180,
      render: (_, r) => (
        <div className="resource-wrap">
          {r.vendor.name}
          <small className="resource-subtitle">
            {businessDomainLabels[r.businessDomain]}
          </small>
        </div>
      ),
    },
    {
      title: '版本 / 地区',
      width: 130,
      render: (_, r) => (
        <div>
          {r.model.version}
          <small className="resource-subtitle">
            {regionVariantLabels[r.model.regionVariant]}
          </small>
        </div>
      ),
    },
    {
      title: '类别 / 启用',
      width: 115,
      render: (_, r) => (
        <div>
          {modelCategoryLabels[r.model.category]}
          <small className="resource-subtitle">
            <StatusBadge
              label={r.model.status === 'enabled' ? '启用' : '停用'}
            />
          </small>
        </div>
      ),
    },
    {
      title: data.supplierIdentityVisible ? '供应商 / 渠道' : '授权渠道',
      key: 'channelCount',
      sorter: true,
      sortOrder:
        sort.sort === 'channelCount'
          ? sort.order === 'asc'
            ? 'ascend'
            : 'descend'
          : null,
      width: 120,
      render: (_, r) => (
        <div>
          {r.supplierCount !== undefined && (
            <small className="resource-subtitle">
              {r.supplierCount} 家供应商
            </small>
          )}
          <strong>{r.channelCount} 条渠道</strong>
        </div>
      ),
    },
    {
      title: '质量测试分布',
      width: 190,
      render: (_, r) => <ResourceStateSummary counts={r.states.quality} />,
    },
    {
      title: '连通性测试分布',
      width: 180,
      render: (_, r) => <ResourceStateSummary counts={r.states.connectivity} />,
    },
    {
      title: '接入 / 开放（独立统计）',
      width: 210,
      render: (_, r) => (
        <div className="resource-states-stacked">
          <ResourceStateSummary counts={r.states.integration} />
          <ResourceStateSummary counts={r.states.availability} />
        </div>
      ),
    },
    {
      title: '操作',
      fixed: 'right',
      width: 100,
      render: (_, r) => (
        <Link to={`/models/${encodeURIComponent(r.model.id)}`}>查看详情</Link>
      ),
    },
  ];
  const changeTable: TableProps<ModelResourceSummary>['onChange'] = (
    p,
    _filters,
    sorter,
  ) => {
    setPagination({ page: p.current ?? 1, pageSize: p.pageSize ?? 10 });
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (s?.columnKey === 'name' || s?.columnKey === 'channelCount')
      setSort({
        sort: s.columnKey,
        order: s.order === 'descend' ? 'desc' : 'asc',
      });
  };
  return (
    <>
      {header}
      <div className="stats-grid resource-stats">
        {metrics.map((m) => (
          <StatCard
            key={m.id}
            metric={{
              ...m,
              note:
                m.id === 'resource-three-suppliers'
                  ? '不同供应商按 ID 去重；不代表需求匹配达标'
                  : '当前授权目录统计，搜索筛选不改变该口径',
            }}
          />
        ))}
      </div>
      <Card
        title="模型目录"
        extra={
          <Space wrap>
            <Tag>只读资源</Tag>
            <span data-testid="resource-channel-total">
              授权渠道 {data.stats.channels} 条
            </span>
          </Space>
        }
      >
        {data.appliedSupplier && (
          <p className="resource-scope">
            关联供应商：{data.appliedSupplier.name} ·{' '}
            {data.appliedSupplier.shortCode}
            （当前主档；筛选关联模型，覆盖仍统计模型全部授权渠道）
          </p>
        )}
        <div className="resource-filters">
          <Input
            aria-label="模型名称或代码"
            placeholder="搜索模型名称或模型代码"
            allowClear
            value={filters.search}
            onChange={(e) => filter({ ...filters, search: e.target.value })}
          />
          <Select
            aria-label="厂商筛选"
            value={filters.vendor}
            options={[
              { value: 'all', label: '全部授权厂商' },
              ...data.vendors.map((v) => ({ value: v.id, label: v.name })),
            ]}
            onChange={(vendor) => filter({ ...filters, vendor })}
          />
          <Select
            aria-label="模型类别筛选"
            value={filters.category}
            options={[
              { value: 'all', label: '全部模型类别' },
              ...Object.entries(modelCategoryLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            onChange={(category) => filter({ ...filters, category })}
          />
          <Select
            aria-label="地区版本筛选"
            value={filters.region}
            options={[
              { value: 'all', label: '全部地区版本' },
              ...Object.entries(regionVariantLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            onChange={(region) => filter({ ...filters, region })}
          />
          <Select
            aria-label="模型启用状态筛选"
            value={filters.status}
            options={[
              { value: 'all', label: '全部启用状态' },
              { value: 'enabled', label: '启用' },
              { value: 'disabled', label: '停用' },
            ]}
            onChange={(status) => filter({ ...filters, status })}
          />
          <Select
            aria-label="可见渠道筛选"
            value={filters.hasChannels}
            options={[
              { value: 'all', label: '全部渠道情况' },
              { value: 'yes', label: '存在可见渠道' },
              { value: 'no', label: '无可见渠道' },
            ]}
            onChange={(hasChannels) => filter({ ...filters, hasChannels })}
          />
          {data.supplierIdentityVisible && (
            <Select
              aria-label="供应商覆盖筛选"
              value={filters.coverage}
              options={[
                { value: 'all', label: '全部供应商覆盖' },
                { value: 'zero', label: '0 家供应商' },
                { value: 'one_two', label: '1—2 家供应商' },
                { value: 'three_plus', label: '至少 3 家供应商' },
              ]}
              onChange={(coverage) => filter({ ...filters, coverage })}
            />
          )}
          <Button onClick={clear}>重置筛选</Button>
        </div>
        <p className="section-note">
          状态按授权渠道分别计数，不代表模型整体测试通过、上线准入或单条需求资源达标。
        </p>
        <Table<ModelResourceSummary>
          rowKey={(r) => r.model.id}
          size="small"
          columns={columns}
          dataSource={[...data.rows]}
          onChange={changeTable}
          scroll={{ x: 1550 }}
          pagination={{
            current: data.page,
            pageSize: data.pageSize,
            total: data.total,
            showSizeChanger: true,
            pageSizeOptions: [5, 10, 20, 50],
            showTotal: (total) => `共 ${total} 个授权模型`,
          }}
          locale={{
            emptyText: (
              <EmptyState description="当前授权范围或筛选条件下暂无模型" />
            ),
          }}
        />
      </Card>
    </>
  );
}
