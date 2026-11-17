import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
} from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { Link, useNavigate } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type {
  SupplierQuery,
  SupplierRecordView,
} from '../../services/supplier-types';
import { supplierErrorMessage } from '../../services/supplier-types';
import type {
  CooperationStatus,
  SupplierCategory,
} from '../../domain/suppliers';
import {
  cooperationStatusLabels,
  supplierCategoryLabels,
} from '../../domain/suppliers';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/FeedbackStates';
import { useSupplierResource } from './use-supplier-resource';
import { SupplierEditor } from './SupplierEditor';
import type { SupplierView } from '../../auth/view-models';
const emptyFilters = {
  search: '',
  cooperation: 'all' as CooperationStatus | 'all',
  status: 'all' as 'enabled' | 'disabled' | 'all',
  category: 'all' as SupplierCategory | 'all',
  owner: 'all',
};
export function SupplierListPage({ session }: { session: DemoSession }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(emptyFilters);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10 });
  const [sort, setSort] = useState<Pick<SupplierQuery, 'sort' | 'order'>>({
    sort: 'updatedAt',
    order: 'desc',
  });
  const [editor, setEditor] = useState<{
    initial: SupplierView | null;
    canAssign: boolean;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const query = useMemo<SupplierQuery>(
    () => ({
      ...pagination,
      ...sort,
      search: filters.search,
      ...(filters.cooperation !== 'all'
        ? { cooperationStatus: filters.cooperation }
        : {}),
      ...(filters.status !== 'all' ? { status: filters.status } : {}),
      ...(filters.category !== 'all'
        ? { supplierCategory: filters.category }
        : {}),
      ...(filters.owner !== 'all' ? { ownerUserId: filters.owner } : {}),
    }),
    [pagination, sort, filters],
  );
  const load = useCallback(
    async () => ({
      page: await session.api.querySuppliers(query),
      owners: await session.api.listSupplierOwners(),
    }),
    [session.api, query],
  );
  const { result, reload } = useSupplierResource(load);
  const filter = (value: typeof filters) => {
    setFilters(value);
    setPagination((p) => ({ ...p, page: 1 }));
  };
  const action = async (run: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await run();
      setNotice(success);
      reload();
    } catch (e) {
      setActionError(supplierErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const resetAllowed =
    session.permits('demo:reset') &&
    session.domain === 'all' &&
    session.profile.domains.includes('domestic') &&
    session.profile.domains.includes('overseas');
  const header = (
    <PageHeader
      title="供应商管理"
      description="统一管理上游供应商基础资料及合作状态"
      group="资源管理"
      actions={
        <Space wrap>
          {resetAllowed && (
            <Popconfirm
              title="重置供应商演示数据？"
              description="将恢复初始主档、授权与变更历史，清除本地新增和编辑；不会修改渠道等其他数据。"
              okText="确认重置"
              cancelText="取消"
              onConfirm={() =>
                action(
                  () => session.api.resetSupplierDemo(true),
                  '供应商演示数据已重置。',
                )
              }
            >
              <Button danger disabled={busy}>
                重置演示数据
              </Button>
            </Popconfirm>
          )}
          {result.status === 'ready' && result.data.page.canCreate && (
            <Button
              type="primary"
              onClick={() => setEditor({ initial: null, canAssign: true })}
            >
              新增供应商
            </Button>
          )}
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
        {actionError && <Alert type="error" title={actionError} />}
        <ErrorState message={result.message} onRetry={reload} />
      </>
    );
  const { page, owners } = result.data;
  const columns: ColumnsType<SupplierRecordView> = [
    {
      title: '供应商名称',
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
        <Link className="supplier-name" to={`/suppliers/${r.supplier.id}`}>
          {r.supplier.name}
        </Link>
      ),
    },
    { title: '内部缩写', width: 110, render: (_, r) => r.supplier.shortCode },
    {
      title: '类别',
      width: 125,
      render: (_, r) => supplierCategoryLabels[r.supplier.supplierCategory],
    },
    {
      title: '合作状态',
      width: 115,
      render: (_, r) => (
        <StatusBadge
          label={cooperationStatusLabels[r.supplier.cooperationStatus]}
        />
      ),
    },
    {
      title: '启用状态',
      width: 100,
      render: (_, r) => (
        <StatusBadge
          label={r.supplier.status === 'enabled' ? '启用' : '停用'}
        />
      ),
    },
    ...(session.permits('supplier:maintain')
      ? [
          {
            title: '采购负责人',
            width: 160,
            render: (_: unknown, r: SupplierRecordView) =>
              owners.find((o) => o.id === r.supplier.ownerUserId)?.name ?? '—',
          },
        ]
      : []),
    ...(page.rows.some((r) => r.supplier.contactName !== undefined)
      ? [
          {
            title: '联系人',
            width: 120,
            render: (_: unknown, r: SupplierRecordView) =>
              r.supplier.contactName || '—',
          },
          {
            title: '联系方式',
            width: 210,
            render: (_: unknown, r: SupplierRecordView) => (
              <div className="supplier-wrap">
                {r.supplier.contactEmail || '—'}
                <small>{r.supplier.contactPhone || '—'}</small>
              </div>
            ),
          },
        ]
      : []),
    {
      title: '最近更新时间',
      key: 'updatedAt',
      sorter: true,
      sortOrder:
        sort.sort === 'updatedAt'
          ? sort.order === 'asc'
            ? 'ascend'
            : 'descend'
          : null,
      width: 170,
      render: (_, r) =>
        new Date(r.supplier.updatedAt).toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          hour12: false,
        }),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 200,
      render: (_, r) => (
        <Space wrap size={8}>
          <Link to={`/suppliers/${r.supplier.id}`}>查看详情</Link>
          {r.capabilities.edit && (
            <Button
              type="link"
              size="small"
              disabled={busy}
              onClick={() =>
                setEditor({
                  initial: r.supplier,
                  canAssign: r.capabilities.assign,
                })
              }
            >
              编辑资料
            </Button>
          )}
          {r.capabilities.toggle && (
            <Popconfirm
              title={
                r.supplier.status === 'enabled'
                  ? '确认停用供应商？'
                  : '确认恢复启用？'
              }
              description="停用后，该供应商将不再作为新增采购合作的默认可选对象，但历史报价、渠道、测试及事件记录不会删除。本阶段只改变主档状态。"
              okText="确认"
              cancelText="取消"
              onConfirm={() =>
                action(
                  () =>
                    session.api.setSupplierStatus(
                      r.supplier.id,
                      r.supplier.version,
                      r.supplier.status === 'enabled' ? 'disabled' : 'enabled',
                    ),
                  '供应商主档状态已更新，关联资源保持不变。',
                )
              }
            >
              <Button
                type="link"
                size="small"
                danger={r.supplier.status === 'enabled'}
                disabled={busy}
              >
                {r.supplier.status === 'enabled' ? '停用' : '启用'}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];
  const tableChange: TableProps<SupplierRecordView>['onChange'] = (
    p,
    _f,
    sorter,
  ) => {
    setPagination({ page: p.current ?? 1, pageSize: p.pageSize ?? 10 });
    const selected = Array.isArray(sorter) ? sorter[0] : sorter;
    if (selected?.columnKey === 'name' || selected?.columnKey === 'updatedAt')
      setSort({
        sort: selected.columnKey,
        order: selected.order === 'ascend' ? 'asc' : 'desc',
      });
  };
  return (
    <>
      {header}
      {notice && <Alert type="success" showIcon title={notice} closable />}
      {actionError && (
        <Alert
          type="error"
          showIcon
          title={actionError}
          action={<Button onClick={reload}>重新加载</Button>}
        />
      )}
      <section className="stats-grid supplier-stats">
        {[
          {
            id: 'supplier-total',
            label: '授权供应商总数',
            value: page.stats.total,
          },
          {
            id: 'supplier-cooperating',
            label: '合作中',
            value: page.stats.cooperating,
          },
          {
            id: 'supplier-negotiating',
            label: '洽谈中',
            value: page.stats.negotiating,
          },
          {
            id: 'supplier-inactive',
            label: '暂停或终止合作',
            value: page.stats.inactive,
          },
        ].map((m) => (
          <StatCard
            key={m.id}
            metric={{ ...m, note: '按当前主档授权范围统计，不随搜索条件变化' }}
          />
        ))}
      </section>
      <Card
        title="供应商主档"
        extra={<Button onClick={reload}>刷新列表</Button>}
      >
        <div className="supplier-filters">
          <Input
            aria-label="供应商名称或缩写"
            placeholder="搜索供应商名称或缩写"
            allowClear
            value={filters.search}
            onChange={(e) => filter({ ...filters, search: e.target.value })}
          />
          <Select
            aria-label="合作状态筛选"
            value={filters.cooperation}
            options={[
              { value: 'all', label: '全部合作状态' },
              ...Object.entries(cooperationStatusLabels).map(
                ([value, label]) => ({ value, label }),
              ),
            ]}
            onChange={(cooperation) => filter({ ...filters, cooperation })}
          />
          <Select
            aria-label="启用状态筛选"
            value={filters.status}
            options={[
              { value: 'all', label: '全部启用状态' },
              { value: 'enabled', label: '启用' },
              { value: 'disabled', label: '停用' },
            ]}
            onChange={(status) => filter({ ...filters, status })}
          />
          <Select
            aria-label="供应商类别筛选"
            value={filters.category}
            options={[
              { value: 'all', label: '全部类别' },
              ...Object.entries(supplierCategoryLabels).map(
                ([value, label]) => ({ value, label }),
              ),
            ]}
            onChange={(category) => filter({ ...filters, category })}
          />
          {owners.length > 0 && (
            <Select
              aria-label="采购负责人筛选"
              value={filters.owner}
              options={[
                { value: 'all', label: '全部采购负责人' },
                ...owners.map((o) => ({ value: o.id, label: o.name })),
              ]}
              onChange={(owner) => filter({ ...filters, owner })}
            />
          )}
          <Button
            onClick={() => {
              filter(emptyFilters);
              setSort({ sort: 'updatedAt', order: 'desc' });
            }}
          >
            重置筛选
          </Button>
        </div>
        <Table
          rowKey={(r) => r.supplier.id}
          size="small"
          columns={columns}
          dataSource={[...page.rows]}
          onChange={tableChange}
          scroll={{ x: 1450 }}
          pagination={{
            current: page.page,
            pageSize: page.pageSize,
            total: page.total,
            showSizeChanger: true,
            pageSizeOptions: [5, 10, 20, 50],
            showTotal: (total) => `共 ${total} 条授权结果`,
          }}
          locale={{
            emptyText: (
              <EmptyState description="当前授权范围或筛选条件下暂无供应商" />
            ),
          }}
        />
      </Card>
      {editor && (
        <SupplierEditor
          api={session.api}
          initial={editor.initial}
          canAssign={editor.canAssign}
          owners={owners}
          onClose={() => setEditor(null)}
          onConflict={() => {
            setEditor(null);
            reload();
          }}
          onSaved={(supplier) => {
            const isNew = editor.initial === null;
            setEditor(null);
            if (isNew)
              navigate(`/suppliers/${supplier.id}`, {
                state: { notice: '供应商已创建（模拟数据）。' },
              });
            else {
              setNotice('供应商资料已保存。');
              reload();
            }
          }}
        />
      )}
    </>
  );
}
