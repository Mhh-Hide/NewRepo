import { progressStepItem } from './ProgressStep';
import { useCallback, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Collapse,
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
export function LifecycleBoard({ session }: { session: DemoSession }) {
  const screens = Grid.useBreakpoint();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<LifecycleQuery>({}),
    [editing, setEditing] = useState(false),
    [params, setParams] = useSearchParams(),
    navigate = useNavigate();
  const selected = params.get('delivery');
  const load = useCallback(async () => {
      const [data, channels] = await Promise.all([
        session.api.queryLifecycle(filters),
        session.api.listChannels(),
      ]);
      return {
        ...data,
        rows: data.rows.map((r) => {
          if (!r.legacy) return r;
          const c = channels.find((c) => c.id === r.id);
          return {
            ...r,
            dispatch:
              c?.qualityStatus === 'failed'
                ? '待整改'
                : c?.qualityStatus === 'passed'
                  ? '质量通过'
                  : '待测试',
            blocker:
              c?.qualityStatus === 'failed'
                ? '第一阶段测试未通过'
                : '交付资料待确认',
            nextAction:
              c?.qualityStatus === 'failed'
                ? '跟进供应商并安排复测'
                : '确认资源与岗位交接',
          };
        }),
      };
    }, [session.api, filters]),
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
  const { users } = result.data;
  const rows = result.data.rows.filter((r) =>
    `${r.modelName} ${r.channelName} ${r.supplierName} ${r.supplierShortCode}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <Card
        title="资源进度"
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
          <Input
            aria-label="搜索模型、渠道或供应商"
            placeholder="搜索模型、渠道或供应商"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
                <Button
                  type="link"
                  size="small"
                  onClick={() => setParams({ delivery: r.id })}
                >
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
            scroll={{ x: 1055 }}
            pagination={{ pageSize: 10 }}
            columns={[
              {
                title: '平台模型',
                dataIndex: 'modelName',
                render: (_, r) => (
                  <div>
                    {r.modelName}
                    <br />
                    <small>
                      <Link to={`/channels/${r.id}`}>{r.channelName}</Link>
                    </small>
                  </div>
                ),
                fixed: 'left',
                width: 155,
              },
              {
                title: '动态交付进度',
                width: 215,
                render: (_, r) => (
                  <Tooltip
                    title={r.orderedSteps.map((step) => {
                      const item = progressStepItem(step);
                      return (
                        <div key={step.id}>
                          {item.icon} {item.title} · {item.content}
                        </div>
                      );
                    })}
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
                        <small>{r.legacy ? '交付进度待确认' : r.stage}</small>
                      </div>
                    </div>
                  </Tooltip>
                ),
              },
              {
                title: '供应商',
                width: 95,
                render: (_, r) => (
                  <Tooltip title={r.supplierName}>
                    {r.supplierShortCode || r.supplierName}
                  </Tooltip>
                ),
              },
              { title: '资源状态', dataIndex: 'dispatch', width: 80 },
              { title: '当前负责人', dataIndex: 'currentOwner', width: 70 },
              { title: '当前卡点', dataIndex: 'blocker', width: 120 },
              { title: '下一步动作', dataIndex: 'nextAction', width: 130 },
              {
                title: '操作',
                fixed: 'right',
                width: 90,
                render: (_, r) => (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setParams({ delivery: r.id })}
                  >
                    推进与历史
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Collapse
        ghost
        items={[
          {
            key: 'tasks',
            label: '任务与通知',
            children: <Link to="/tasks">查看我的任务</Link>,
          },
        ]}
      />
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
