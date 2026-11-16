import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Grid,
  Progress,
  Select,
  Space,
  Table,
  Tooltip,
} from 'antd';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type { LifecycleQuery } from '../../services/lifecycle-types';
import { useResourceQuery } from '../models/use-resource-query';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { ChannelEditor } from '../channels/ChannelEditor';
import { LifecycleDetail } from './LifecycleDetail';
import { WorkInbox } from './WorkInbox';
import { channelTypeLabels } from '../../domain/statuses';
const statsLabels: Record<string, string> = {
  total: '渠道总数',
  open: '正常对客开放',
  qualityPending: '第一阶段待测试',
  qualityRisk: '第一阶段失败及整改',
  contracts: '合同推进中',
  configuration: '待生产配置',
  integration: '第二阶段待测试',
  abnormal: '异常渠道',
  mine: '当前用户待处理',
};
export function LifecycleBoard({ session }: { session: DemoSession }) {
  const screens = Grid.useBreakpoint();
  const [filters, setFilters] = useState<LifecycleQuery>({}),
    [editing, setEditing] = useState(false),
    [params, setParams] = useSearchParams(),
    navigate = useNavigate();
  const selected = params.get('delivery');
  const load = useCallback(
      () => session.api.queryLifecycle(filters),
      [session.api, filters],
    ),
    { result, reload } = useResourceQuery(load);
  const change = (
    key: keyof LifecycleQuery,
    value: string | boolean | undefined,
  ) =>
    setFilters((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[key];
      else Object.assign(next, { [key]: value });
      return next;
    });
  if (!session.profile.domains.length)
    return <Empty description="当前身份暂无业务域授权" />;
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error')
    return <ErrorState message={result.message} onRetry={reload} />;
  const { rows, stats, users } = result.data;
  return (
    <>
      <Alert
        type="info"
        title="六步资源交付 · 测试与整改引用原模块真实 Mock 记录，旧数据待补充核验。"
        description="交付完成度不是质量评分。历史交付已完成与当前能否调度分别判断；合同与生产凭据仅记录模拟进度和安全引用。"
      />
      <div className="stats-grid resource-stats">
        {Object.entries(statsLabels).map(([key, label]) => (
          <Card key={key} size="small">
            <span>{label}</span>
            <strong
              style={{ display: 'block', fontSize: 24 }}
              data-testid={`lifecycle-stat-${key}`}
            >
              {stats[key]}
            </strong>
          </Card>
        ))}
      </div>
      <Card
        title="渠道资源推进总览"
        extra={
          <Space wrap>
            <Button onClick={reload}>刷新资源进度</Button>
            {session.permits('channel:create') && (
              <Button onClick={() => setEditing(true)}>新增渠道</Button>
            )}
          </Space>
        }
      >
        <div className="resource-filters">
          <Select
            aria-label="进度模型筛选"
            allowClear
            placeholder="平台模型"
            value={filters.modelId ?? null}
            onChange={(v) => change('modelId', v)}
            options={[
              ...new Map(
                rows.map((r) => [
                  r.modelId,
                  { value: r.modelId, label: r.modelName },
                ]),
              ).values(),
            ]}
          />
          <Select
            aria-label="进度供应商筛选"
            allowClear
            placeholder="供应商"
            value={filters.supplierId ?? null}
            onChange={(v) => change('supplierId', v)}
            options={[
              ...new Map(
                rows.map((r) => [
                  r.supplierId,
                  { value: r.supplierId, label: r.supplierName },
                ]),
              ).values(),
            ]}
          />
          <Select
            aria-label="进度阶段筛选"
            allowClear
            placeholder="当前阶段"
            value={filters.stage ?? null}
            onChange={(v) => change('stage', v)}
            options={[...new Set(rows.map((r) => r.stage))].map((value) => ({
              value,
              label: value,
            }))}
          />
          <Select
            aria-label="进度负责人筛选"
            allowClear
            placeholder="当前负责人"
            value={filters.ownerId ?? null}
            onChange={(v) => change('ownerId', v)}
            options={users.map((u) => ({ value: u.id, label: u.name }))}
          />
          <Select
            aria-label="进度开放筛选"
            allowClear
            placeholder="已开放/未开放"
            value={filters.open ?? null}
            onChange={(v) => change('open', v)}
            options={[
              { value: true, label: '已正常开放' },
              { value: false, label: '未正常开放' },
            ]}
          />
          <Select
            aria-label="进度异常筛选"
            allowClear
            placeholder="正常/异常"
            value={filters.abnormal ?? null}
            onChange={(v) => change('abnormal', v)}
            options={[
              { value: true, label: '异常渠道' },
              { value: false, label: '正常推进' },
            ]}
          />
          <Button onClick={() => setFilters({ mine: true })}>
            只看待我处理
          </Button>
          <Button onClick={() => setFilters({ overdue: true })}>
            只看逾期
          </Button>
          <Button onClick={() => setFilters({})}>清空进度筛选</Button>
        </div>
        {screens.md === false ? (
          <Space orientation="vertical" style={{ width: '100%' }}>
            {!rows.length && <Empty description="暂无匹配渠道" />}
            {rows.map((r) => (
              <Card
                key={r.id}
                size="small"
                title={<Link to={`/channels/${r.id}`}>{r.channelName}</Link>}
              >
                <p>
                  {r.modelName} · {r.supplierShortCode}
                </p>
                <Progress
                  percent={r.percent}
                  format={(p) => `${p}%`}
                  status={
                    r.abnormal
                      ? 'exception'
                      : r.schedulable
                        ? 'success'
                        : 'active'
                  }
                />
                <p>
                  {r.delivered ? '交付历史已完成' : '交付进行中'} ·{' '}
                  {r.schedulable ? '当前可调度' : '当前不可调度'}
                </p>
                <p>
                  {r.stage} · {r.currentOwner}
                </p>
                <p>卡点：{r.blocker}</p>
                <p>下一步：{r.nextAction}</p>
                <Button onClick={() => setParams({ delivery: r.id })}>
                  推进与历史
                </Button>
              </Card>
            ))}
          </Space>
        ) : (
          <Table
            rowKey="id"
            size="small"
            dataSource={rows}
            scroll={{ x: 2400 }}
            pagination={{ pageSize: 10 }}
            columns={[
              {
                title: '平台模型',
                dataIndex: 'modelName',
                render: (_, r) => (
                  <div>
                    {r.modelName}
                    <br />
                    <small>{r.channelName}</small>
                  </div>
                ),
                fixed: 'left',
                width: 180,
              },
              {
                title: '动态交付进度',
                width: 260,
                render: (_, r) => (
                  <Tooltip
                    title={[...r.steps, ...r.extra].map((s, i) => (
                      <div key={i}>
                        {s.done ? '✓' : '○'} {s.label}
                      </div>
                    ))}
                  >
                    <div>
                      <Progress
                        percent={r.percent}
                        format={(p) => `${p}%`}
                        status={
                          r.abnormal
                            ? 'exception'
                            : r.schedulable
                              ? 'success'
                              : 'active'
                        }
                      />
                      <small>
                        {r.delivered ? '交付历史已完成' : '交付进行中'} ·{' '}
                        {r.schedulable ? '当前可调度' : '当前不可调度'}
                      </small>
                      <div>
                        <small>
                          {r.stage} · {r.currentOwner}
                        </small>
                      </div>
                    </div>
                  </Tooltip>
                ),
              },
              {
                title: '上游调用模型名',
                dataIndex: 'upstreamModelName',
                width: 180,
              },
              { title: '供应商全称', dataIndex: 'supplierName', width: 180 },
              {
                title: '供应商缩写',
                dataIndex: 'supplierShortCode',
                width: 120,
              },
              {
                title: '渠道',
                width: 200,
                render: (_, r) => (
                  <Link to={`/channels/${r.id}`}>{r.channelName}</Link>
                ),
              },
              {
                title: '渠道类型',
                dataIndex: 'channelType',
                width: 140,
                render: (v) =>
                  channelTypeLabels[v as keyof typeof channelTypeLabels],
              },
              { title: '当前节点', dataIndex: 'stage', width: 180 },
              {
                title: '当前状态',
                width: 230,
                dataIndex: 'dispatch',
              },
              { title: '当前负责人', dataIndex: 'currentOwner', width: 150 },
              { title: '当前卡点', dataIndex: 'blocker', width: 270 },
              { title: '下一步动作', dataIndex: 'nextAction', width: 240 },
              {
                title: '最近更新（北京时间）',
                dataIndex: 'updatedAt',
                width: 180,
                render: (v) =>
                  new Date(v).toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                  }),
              },
              {
                title: '操作',
                fixed: 'right',
                width: 120,
                render: (_, r) => (
                  <Button onClick={() => setParams({ delivery: r.id })}>
                    推进与历史
                  </Button>
                ),
              },
            ]}
            expandable={{
              expandedRowRender: (r) => (
                <Descriptions
                  column={{ xs: 1, sm: 3 }}
                  items={[
                    {
                      key: 'quote',
                      label: '商务状态',
                      children: r.quoteStatus ?? '无采购价格权限',
                    },
                    {
                      key: 'promise',
                      label: '承诺性能（采购维护）',
                      children: `RPM ${r.promised.rpm ?? '未知'} / TPM ${r.promised.tpm ?? '未知'} / 并发 ${r.promised.concurrency ?? '未知'} / TTFT ${r.promised.ttftMs ?? '未知'}`,
                    },
                    {
                      key: 'measure',
                      label: '实测性能（测试维护）',
                      children: r.measured
                        ? `RPM ${r.measured.rpm ?? '未知'} / TPM ${r.measured.tpm ?? '未知'} / TTFT ${r.measured.ttftMs ?? '未知'}`
                        : '尚无实测核验',
                    },
                    {
                      key: 'rem',
                      label: '相关整改',
                      children: r.remediationIds.length
                        ? r.remediationIds.map((id) =>
                            session.permits('remediation:detail') ? (
                              <Link key={id} to={`/remediations/${id}`}>
                                {id}{' '}
                              </Link>
                            ) : (
                              <span key={id}>存在授权整改摘要 </span>
                            ),
                          )
                        : '无未关闭整改',
                    },
                  ]}
                />
              ),
            }}
          />
        )}
      </Card>
      <WorkInbox session={session} />
      {selected && (
        <LifecycleDetail
          key={`${session.profile.user.id}:${session.domain}:${selected}`}
          session={session}
          id={selected}
          onClose={() => {
            setParams({});
            reload();
          }}
        />
      )}
      {editing && (
        <ChannelEditor
          session={session}
          onClose={() => setEditing(false)}
          onSaved={(id) => navigate(`/channels/${id}`)}
        />
      )}
    </>
  );
}
