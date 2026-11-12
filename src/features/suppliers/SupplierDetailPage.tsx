import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Popconfirm,
  Result,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { Link, useLocation } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type { SupplierHistoryView } from '../../services/supplier-types';
import { supplierErrorMessage } from '../../services/supplier-types';
import {
  cooperationStatusLabels,
  supplierCategoryLabels,
} from '../../domain/suppliers';
import type { SupplierView } from '../../auth/view-models';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/FeedbackStates';
import { useSupplierResource } from './use-supplier-resource';
import { SupplierEditor } from './SupplierEditor';
const fieldLabels: Readonly<Record<string, string>> = {
  name: '供应商名称',
  shortCode: '内部缩写',
  supplierCategory: '类别',
  cooperationStatus: '合作状态',
  countryOrRegion: '注册国家或地区',
  description: '简介',
  contactName: '联系人',
  contactEmail: '邮箱',
  contactPhone: '电话',
  contactPosition: '联系人职务',
  alternativeContact: '备用联系人',
  ownerUserId: '采购负责人',
  remark: '内部备注',
  status: '启用状态',
};
function snapshotValue(s: SupplierView | null, field: string): string {
  if (!s || !(field in s)) return '—';
  const value = s[field as keyof SupplierView];
  if (field === 'status') return value === 'enabled' ? '启用' : '停用';
  if (
    field === 'cooperationStatus' &&
    typeof value === 'string' &&
    Object.hasOwn(cooperationStatusLabels, value)
  )
    return cooperationStatusLabels[
      value as keyof typeof cooperationStatusLabels
    ];
  if (
    field === 'supplierCategory' &&
    typeof value === 'string' &&
    Object.hasOwn(supplierCategoryLabels, value)
  )
    return supplierCategoryLabels[value as keyof typeof supplierCategoryLabels];
  return value === undefined || value === '' ? '—' : String(value);
}
export function SupplierDetailPage({
  session,
  id,
}: {
  session: DemoSession;
  id: string;
}) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const load = useCallback(async () => {
    const detail = await session.api.getSupplier(id);
    if (!detail) return { detail, owners: [], history: [] };
    const [owners, history] = await Promise.all([
      session.api.listSupplierOwners(),
      detail.capabilities.history
        ? session.api.listSupplierHistory(id)
        : Promise.resolve([]),
    ]);
    return { detail, owners, history };
  }, [session.api, id]);
  const { result, reload } = useSupplierResource(load);
  const header = (
    <PageHeader
      title="供应商详情"
      description="供应商主档、授权资源摘要与资料变更记录"
      group="资源管理"
      actions={
        <Link to="/suppliers">
          <Button>返回供应商列表</Button>
        </Link>
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
  const { detail, owners, history } = result.data;
  if (!detail)
    return (
      <>
        {header}
        <Result
          status="404"
          title="供应商不存在或无权访问"
          subTitle="请返回列表查看当前身份及业务域可访问的主档。"
        />
      </>
    );
  const s = detail.supplier;
  const caps = detail.capabilities;
  const setStatus = async () => {
    setBusy(true);
    setError('');
    try {
      await session.api.setSupplierStatus(
        id,
        s.version,
        s.status === 'enabled' ? 'disabled' : 'enabled',
      );
      setNotice('供应商主档状态已更新，关联渠道及其状态保持不变。');
      reload();
    } catch (e) {
      setError(supplierErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const stateNotice =
    location.state &&
    typeof location.state === 'object' &&
    'notice' in location.state &&
    typeof location.state.notice === 'string'
      ? location.state.notice
      : '';
  return (
    <>
      {header}
      {(notice || stateNotice) && (
        <Alert type="success" showIcon title={notice || stateNotice} />
      )}
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={<Button onClick={reload}>重新加载最新资料</Button>}
        />
      )}
      <Card
        className="supplier-profile"
        title={
          <div className="supplier-profile-title">
            <span className="supplier-avatar">{s.shortCode.slice(0, 2)}</span>
            <div>
              <strong>{s.name}</strong>
              <small>{s.shortCode} · 虚构供应商主档</small>
            </div>
          </div>
        }
        extra={
          <Space wrap>
            <StatusBadge label={s.status === 'enabled' ? '启用' : '停用'} />
            {caps.edit && (
              <Button type="primary" onClick={() => setEditing(true)}>
                编辑资料
              </Button>
            )}
            {caps.toggle && (
              <Popconfirm
                title={
                  s.status === 'enabled' ? '确认停用供应商？' : '确认恢复启用？'
                }
                description="停用后，该供应商将不再作为新增采购合作的默认可选对象，但历史报价、渠道、测试及事件记录不会删除。本阶段只改变主档状态。"
                okText="确认"
                cancelText="取消"
                onConfirm={setStatus}
              >
                <Button danger={s.status === 'enabled'} loading={busy}>
                  {s.status === 'enabled' ? '停用供应商' : '启用供应商'}
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      >
        <Descriptions
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            {
              key: 'id',
              label: '内部 ID',
              children: (
                <Typography.Text code className="supplier-wrap">
                  {s.id}
                </Typography.Text>
              ),
            },
            {
              key: 'category',
              label: '供应商类别',
              children: supplierCategoryLabels[s.supplierCategory],
            },
            {
              key: 'cooperation',
              label: '合作状态',
              children: (
                <StatusBadge
                  label={cooperationStatusLabels[s.cooperationStatus]}
                />
              ),
            },
            {
              key: 'region',
              label: '注册国家或地区',
              children: s.countryOrRegion || '未填写',
            },
            { key: 'version', label: '资料版本', children: s.version },
            {
              key: 'updated',
              label: '最近更新时间',
              children: new Date(s.updatedAt).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                hour12: false,
              }),
            },
            ...(s.description !== undefined
              ? [
                  {
                    key: 'description',
                    label: '供应商简介',
                    span: 'filled' as const,
                    children: (
                      <span className="supplier-wrap">
                        {s.description || '未填写'}
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      <div className="supplier-detail-grid">
        <Card title="合作与联系人">
          <Descriptions
            column={1}
            items={[
              ...(s.ownerUserId !== undefined
                ? [
                    {
                      key: 'owner',
                      label: '采购负责人',
                      children:
                        owners.find((o) => o.id === s.ownerUserId)?.name ??
                        '已分配采购负责人',
                    },
                  ]
                : []),
              ...(s.contactName !== undefined
                ? [
                    {
                      key: 'contact',
                      label: '主要联系人',
                      children: s.contactName || '未填写',
                    },
                    {
                      key: 'position',
                      label: '联系人职务',
                      children: s.contactPosition || '未填写',
                    },
                    {
                      key: 'email',
                      label: '联系人邮箱',
                      children: s.contactEmail || '未填写',
                    },
                    {
                      key: 'phone',
                      label: '联系电话',
                      children: s.contactPhone || '未填写',
                    },
                    {
                      key: 'alternative',
                      label: '备用联系人',
                      children: s.alternativeContact || '未填写',
                    },
                  ]
                : []),
              ...(s.remark !== undefined
                ? [
                    {
                      key: 'remark',
                      label: '内部备注',
                      children: (
                        <span className="supplier-wrap">
                          {s.remark || '未填写'}
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
          />
          {s.contactName === undefined && (
            <EmptyState description="当前身份仅可查看供应商身份及技术摘要" />
          )}
        </Card>
        <Card title="关联资源概览" extra={<Tag>当前授权范围</Tag>}>
          <div className="supplier-resource-stats">
            <div>
              <strong>{detail.resources.modelCount}</strong>
              <span>已关联模型</span>
            </div>
            <div>
              <strong>{detail.resources.channelCount}</strong>
              <span>已关联渠道</span>
            </div>
          </div>
          <Typography.Paragraph type="secondary">渠道类型</Typography.Paragraph>
          {detail.resources.channelTypes.length ? (
            <Space wrap>
              {detail.resources.channelTypes.map((type) => (
                <Tag key={type}>{type}</Tag>
              ))}
            </Space>
          ) : (
            <EmptyState description="尚无当前业务域可访问的关联渠道，主档可独立维护" />
          )}
          <p className="section-note supplier-note">
            采购负责人不决定模型业务域；跨域资源仅按当前身份授权计算。
          </p>
        </Card>
      </div>
      {caps.history && (
        <Card
          title="主档变更历史"
          className="lower-card"
          extra={<Tag>仅追加 · 模拟审计</Tag>}
        >
          <Table<SupplierHistoryView>
            rowKey="id"
            size="small"
            dataSource={[...history].reverse()}
            scroll={{ x: 900 }}
            pagination={{ pageSize: 5, hideOnSinglePage: true }}
            columns={[
              {
                title: '时间',
                width: 170,
                render: (_, e) =>
                  new Date(e.occurredAt).toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                    hour12: false,
                  }),
              },
              {
                title: '操作',
                width: 120,
                render: (_, e) =>
                  ({
                    created: '创建主档',
                    edited: '编辑资料',
                    owner_assigned: '负责人调整',
                    status_changed: '启停变更',
                  })[e.action],
              },
              { title: '操作人', dataIndex: 'actorUserId', width: 120 },
              {
                title: '具体变化',
                render: (_, e) => (
                  <div className="supplier-history-changes">
                    {e.changedFields.map((field) => (
                      <div key={field}>
                        <strong>{fieldLabels[field] ?? field}：</strong>
                        <span>
                          {snapshotValue(e.beforeSnapshot, field)} →{' '}
                          {snapshotValue(e.afterSnapshot, field)}
                        </span>
                      </div>
                    ))}
                  </div>
                ),
              },
              { title: '原因', dataIndex: 'reason', width: 150 },
            ]}
            locale={{
              emptyText: <EmptyState description="暂无可访问的变更记录" />,
            }}
          />
        </Card>
      )}
      <Card title="后续扩展" className="lower-card">
        <div className="supplier-future">
          {['报价记录', '渠道清单', '测试整改', '供应商事件'].map((title) => (
            <div key={title}>
              <strong>{title}</strong>
              <Tag>即将开放</Tag>
            </div>
          ))}
        </div>
        <p className="section-note supplier-note">
          当前不支持报价、渠道编辑、测试结果提交或外部供应商门户。
        </p>
      </Card>
      {editing && (
        <SupplierEditor
          api={session.api}
          initial={s}
          owners={owners}
          canAssign={caps.assign}
          onClose={() => setEditing(false)}
          onConflict={() => {
            setEditing(false);
            reload();
          }}
          onSaved={() => {
            setEditing(false);
            setNotice('供应商资料已保存。');
            reload();
          }}
        />
      )}
    </>
  );
}
