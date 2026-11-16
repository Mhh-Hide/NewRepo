import { RemediationSummaryPanel } from '../remediations/RemediationSummaryPanel';
import { conclusionText } from './testing-labels';
import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Result,
  Select,
  Space,
  Table,
  Tag,
  Collapse,
} from 'antd';
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type {
  TestTaskDetail,
  TestTaskRow,
  ExecutionInput,
} from '../../services/testing-types';
import type { TestTask } from '../../domain/entities';
import type { TestType } from '../../domain/statuses';
import { taskStatusLabels, testResultLabels } from '../../domain/testing';
import { PageHeader } from '../../components/PageHeader';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { useResourceQuery } from '../models/use-resource-query';
import { TestSummaryView, TestingMetrics } from './TestSummaryPanel';
import { resourceErrorMessage } from '../../services/resource-types';
import './testing.css';
const types = [
  { value: 'quality', label: '质量测试' },
  { value: 'connectivity', label: '连通性测试' },
];
const statusOptions = Object.entries(taskStatusLabels).map(
  ([value, label]) => ({ value, label }),
);
const typeLabel = (v: TestType) =>
  v === 'quality' ? '质量测试' : '连通性测试';
export default function TestingPage() {
  const session = useOutletContext<DemoSession>();
  return session.permits('test:summary') ? (
    <AuthorizedTesting
      key={`${session.profile.user.id}:${session.domain}`}
      session={session}
    />
  ) : (
    <Result status="403" title="当前演示身份无此模块访问权限" />
  );
}
function AuthorizedTesting({ session }: { session: DemoSession }) {
  const { taskId } = useParams<{ taskId: string }>();
  return taskId ? (
    session.permits('test:detail') ? (
      <>
        {' '}
        <TaskDetail key={taskId} session={session} id={taskId} />{' '}
      </>
    ) : (
      <Result status="403" title="当前身份仅能读取技术摘要，无测试详情权限" />
    )
  ) : (
    <TaskList session={session} />
  );
}
function TaskList({ session }: { session: DemoSession }) {
  const [search] = useSearchParams();
  const [channelId, setChannel] = useState<string | undefined>(
      search.get('channelId') ?? undefined,
    ),
    [modelId, setModel] = useState<string>(),
    [status, setStatus] = useState<TestTask['status']>(),
    [testType, setType] = useState<TestType>();
  const full = session.permits('test:detail');
  const load = useCallback(async () => {
    const query = {
      ...(channelId ? { channelId } : {}),
      ...(modelId ? { modelId } : {}),
    };
    const [summaries, tasks, options] = await Promise.all([
      session.api.queryTestSummaries(query),
      full
        ? session.api.queryTestTasks({
            ...query,
            ...(status ? { status } : {}),
            ...(testType ? { testType } : {}),
          })
        : Promise.resolve([]),
      full
        ? session.api.testingOptions()
        : Promise.resolve({ channels: [], assignees: [] }),
    ]);
    const all = await session.api.queryTestSummaries();
    return { summaries, tasks, options, all };
  }, [session.api, full, channelId, modelId, status, testType]);
  const { result, reload } = useResourceQuery(load);
  const [create, setCreate] = useState(false);
  return (
    <>
      <PageHeader
        title="模型测试"
        group="业务协同"
        description="人工模拟测试管理 · 执行结果与当前采纳结论分离"
        actions={
          <Space wrap>
            <Button onClick={reload}>刷新测试数据</Button>
            {session.permits('test:create') && (
              <Button type="primary" onClick={() => setCreate(true)}>
                新建测试任务
              </Button>
            )}
          </Space>
        }
      />
      <Alert
        type="info"
        showIcon
        title="仅记录人工模拟结果，不调用真实模型，不存储 Key；测试不自动改变开放、接入、报价或寻源判断。"
      />
      {result.status === 'loading' ? (
        <LoadingState />
      ) : result.status === 'error' ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : (
        <>
          <TestingMetrics stats={result.data.summaries.stats} />
          <Card title="授权任务筛选" className="resource-card">
            <p className="section-note">
              指标按模型与渠道范围计算；任务状态和类型筛选仅作用于下方任务列表。
            </p>
            <Space wrap>
              <Select
                aria-label="测试模型筛选"
                placeholder="全部模型"
                allowClear
                style={{ width: 220 }}
                value={modelId}
                onChange={setModel}
                options={[
                  ...new Map(
                    result.data.all.rows.map((r) => [
                      r.model.id,
                      { value: r.model.id, label: r.model.name },
                    ]),
                  ).values(),
                ]}
              />
              <Select
                aria-label="测试渠道筛选"
                placeholder="全部渠道"
                allowClear
                style={{ width: 220 }}
                value={channelId}
                onChange={setChannel}
                options={result.data.all.rows.map((r) => ({
                  value: r.channel.id,
                  label: r.channel.name,
                }))}
              />
              {full && (
                <>
                  <Select
                    aria-label="任务状态筛选"
                    placeholder="全部任务状态"
                    allowClear
                    style={{ width: 160 }}
                    value={status}
                    onChange={setStatus}
                    options={statusOptions}
                  />
                  <Select
                    aria-label="测试类型筛选"
                    placeholder="全部测试类型"
                    allowClear
                    style={{ width: 160 }}
                    value={testType}
                    onChange={setType}
                    options={types}
                  />
                </>
              )}
            </Space>
          </Card>
          {full ? (
            <Card title="测试任务" className="resource-card">
              <Table<TestTaskRow>
                rowKey={(r) => r.task.id}
                dataSource={[...result.data.tasks]}
                scroll={{ x: 1330 }}
                pagination={{ pageSize: 10 }}
                columns={[
                  {
                    title: '模型 / 渠道',
                    width: 220,
                    render: (_, r) => (
                      <>
                        <strong>{r.summary.model.name}</strong>
                        <p>{r.summary.channel.name}</p>
                        <small>{r.summary.supplier.name}</small>
                      </>
                    ),
                  },
                  {
                    title: '类型 / 任务状态',
                    width: 150,
                    render: (_, r) => (
                      <>
                        <Tag>{typeLabel(r.task.testType)}</Tag>
                        <p>{taskStatusLabels[r.task.status]}</p>
                      </>
                    ),
                  },
                  {
                    title: '当前结论（按渠道）',
                    width: 240,
                    render: (_, r) =>
                      conclusionText(r.summary[r.task.testType]),
                  },
                  {
                    title: '本任务最近执行 / 渠道待复核',
                    width: 150,
                    render: (_, r) => (
                      <>
                        {r.latestExecution?.result
                          ? testResultLabels[r.latestExecution.result]
                          : '尚无结果'}{' '}
                        · {r.summary[r.task.testType].pendingReview} 条待复核
                        {r.summary[r.task.testType].newFailureRisk && (
                          <Tag color="orange">新失败待复核</Tag>
                        )}
                      </>
                    ),
                  },
                  {
                    title: '质量豁免',
                    width: 140,
                    render: (_, r) =>
                      r.summary.exempted
                        ? '有效豁免，非测试通过'
                        : '无有效豁免',
                  },
                  {
                    title: '最近测试 / 负责人',
                    width: 240,
                    render: (_, r) => (
                      <>
                        {r.latestExecution?.finishedAt ?? '尚无执行'}
                        <p>
                          {r.task.assignedTo ??
                            r.latestExecution?.performedBy ??
                            '未分配'}
                        </p>
                      </>
                    ),
                  },
                  {
                    title: '任务入口',
                    width: 120,
                    render: (_, r) => (
                      <Link to={`/tests/${encodeURIComponent(r.task.id)}`}>
                        查看任务
                      </Link>
                    ),
                  },
                ]}
                locale={{ emptyText: '当前筛选条件下无授权任务' }}
              />
            </Card>
          ) : (
            <Card title="技术摘要（只读）" className="resource-card">
              {result.data.summaries.rows.map((row) => (
                <section key={row.channel.id}>
                  <strong>
                    {row.model.name} · {row.channel.name}
                  </strong>
                  <TestSummaryView row={row} />
                </section>
              ))}
              {!result.data.summaries.rows.length && (
                <Empty description="暂无授权渠道" />
              )}
            </Card>
          )}
          {create && (
            <CreateTask
              session={session}
              options={result.data.options}
              onClose={() => setCreate(false)}
            />
          )}
        </>
      )}
    </>
  );
}
function CreateTask({
  session,
  options,
  onClose,
}: {
  session: DemoSession;
  options: Awaited<ReturnType<DemoSession['api']['testingOptions']>>;
  onClose: () => void;
}) {
  const navigate = useNavigate(),
    [form] = Form.useForm<{
      channelId: string;
      testType: TestType;
      targetReference: string;
      assignedTo?: string;
    }>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  const submit = async () => {
    try {
      const v = await form.validateFields();
      setBusy(true);
      setError('');
      const id = await session.api.createTestTask(
        { ...v, assignedTo: v.assignedTo ?? null },
        key,
      );
      onClose();
      navigate(`/tests/${encodeURIComponent(id)}`);
    } catch (e) {
      setError(resourceErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="新建人工模拟测试任务"
      open
      onCancel={onClose}
      onOk={() => void submit()}
      cancelText="关闭表单"
      confirmLoading={busy}
      okText="创建任务"
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ testType: 'quality' }}
      >
        <Form.Item
          name="channelId"
          label="测试渠道"
          rules={[{ required: true }]}
        >
          <Select
            aria-label="测试渠道"
            options={options.channels.map((c) => ({
              value: c.id,
              label: c.label,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="testType"
          label="测试类型"
          rules={[{ required: true }]}
        >
          <Select aria-label="测试类型" options={types} />
        </Form.Item>
        <Form.Item
          name="targetReference"
          label="测试目标 / 场景"
          rules={[{ required: true, whitespace: true }]}
        >
          <Input.TextArea aria-label="测试目标" maxLength={4000} />
        </Form.Item>
        <Form.Item name="assignedTo" label="负责人（可不分配）">
          <Select
            allowClear
            aria-label="任务负责人"
            options={options.assignees.map((u) => ({
              value: u.id,
              label: u.name,
            }))}
          />
        </Form.Item>
      </Form>
      {error && <Alert type="error" title={error} />}
    </Modal>
  );
}
type Action =
  | 'update'
  | 'start'
  | 'finish'
  | 'cancel'
  | 'adopt'
  | 'review'
  | 'verify'
  | 'unverify'
  | 'exempt'
  | 'revoke';
interface Dialog {
  kind: Action;
  id?: string;
  snapshot: TestTaskDetail;
  channelVersion: number;
  requestId: string;
}
function TaskDetail({ session, id }: { session: DemoSession; id: string }) {
  const load = useCallback(async () => {
    const detail = await session.api.getTestTask(id);
    const [version, options] = await Promise.all([
      detail
        ? session.api.channelVersion(detail.task.channelId)
        : Promise.resolve(null),
      session.api.testingOptions(),
    ]);
    return { detail, version, options };
  }, [session.api, id]);
  const { result, reload } = useResourceQuery(load),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [error, setError] = useState('');
  const header = (
    <PageHeader
      title="测试任务详情"
      group="模型测试"
      description="全部数据为模拟记录；completed 不代表测试通过"
      actions={
        <Space wrap>
          <Link to="/tests">
            <Button>返回测试列表</Button>
          </Link>
          <Button onClick={reload}>刷新任务</Button>
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
  const d = result.data.detail;
  if (!d)
    return (
      <>
        {header}
        <Result status="404" title="测试任务不存在或无权访问" />
      </>
    );
  const open = (kind: Action, executionId?: string) => {
    setError('');
    setDialog({
      kind,
      ...(executionId ? { id: executionId } : {}),
      snapshot: d,
      channelVersion: result.data.version ?? 0,
      requestId: crypto.randomUUID(),
    });
  };
  const resolved = (eid: string) =>
    d.conclusions.some((v) => v.executionId === eid) ||
    d.reviews.some((v) => v.executionId === eid);
  const button = (kind: Action, label: string, allowed: boolean) =>
    allowed ? <Button onClick={() => open(kind)}>{label}</Button> : null;
  return (
    <>
      {header}
      <RemediationSummaryPanel session={session} channelId={d.task.channelId} />
      <Alert
        type="info"
        title="执行完成后仅进入待复核。采纳、审阅、豁免均为独立人工操作，不自动决定上线或采购。"
      />
      {!d.targetCurrent && (
        <Alert
          type="warning"
          title="该任务配置依据已失效，请新建当前目标任务；旧执行保留，运营可审阅，运行中任务可取消。"
        />
      )}
      <Card
        title={`${d.summary.model.name} · ${typeLabel(d.task.testType)}`}
        className="resource-card"
        extra={
          <Link to={`/channels/${encodeURIComponent(d.task.channelId)}`}>
            关联渠道详情
          </Link>
        }
      >
        <Descriptions
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            { key: 'id', label: '任务 ID', children: d.task.id },
            { key: 'channel', label: '渠道', children: d.summary.channel.name },
            {
              key: 'status',
              label: '任务状态',
              children: taskStatusLabels[d.task.status],
            },
            {
              key: 'target',
              label: '测试目标',
              children: d.definition.targetReference,
            },
            {
              key: 'targetVersion',
              label: '目标版本',
              children: d.definition.targetVersion,
            },
            {
              key: 'version',
              label: '任务版本',
              children: d.definition.version,
            },
            {
              key: 'creator',
              label: '创建人',
              children: d.definition.createdBy ?? 'legacy 未提供',
            },
            {
              key: 'assignee',
              label: '负责人',
              children: d.task.assignedTo ?? '未分配',
            },
            {
              key: 'run',
              label: '当前执行',
              children: d.activeRun
                ? `第 ${d.activeRun.round} 轮 · ${d.activeRun.performedBy}`
                : '无正在进行的新执行',
            },
            ...(d.definition.cancelledAt
              ? [
                  {
                    key: 'cancel',
                    label: '取消事实',
                    children: `${d.definition.cancelledBy} · ${d.definition.cancelledAt} · ${d.definition.cancellationReason}`,
                  },
                ]
              : []),
          ]}
        />
        <Space wrap>
          {button(
            'update',
            '维护任务资料',
            session.permits('test:update') &&
              !['running', 'cancelled'].includes(d.task.status),
          )}
          {button(
            'start',
            d.task.status === 'completed' ? '新增复测执行' : '开始模拟执行',
            session.permits('test:execute') &&
              d.targetCurrent &&
              ['pending', 'completed'].includes(d.task.status),
          )}
          {button(
            'finish',
            '录入本轮结果',
            session.permits('test:execute') &&
              d.targetCurrent &&
              d.task.status === 'running' &&
              !!d.activeRun,
          )}
          {button(
            'cancel',
            '取消任务',
            session.permits('test:cancel') &&
              ['pending', 'running'].includes(d.task.status),
          )}
        </Space>
      </Card>
      <Card title="当前结论与待复核" className="resource-card">
        <TestSummaryView row={d.summary} />
      </Card>
      <Card title="执行历史（追加记录）" className="resource-card">
        <Table
          rowKey="id"
          size="small"
          scroll={{ x: 1150 }}
          dataSource={[...d.executions].reverse()}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: '执行 / 轮次',
              width: 220,
              render: (_, e) => (
                <>
                  {e.id}
                  <p>
                    {e.origin === 'legacy'
                      ? 'legacy：旧执行信息不补造'
                      : `第 ${e.round} 轮 · 执行人 ${e.performedBy}`}
                  </p>
                </>
              ),
            },
            {
              title: '开始 / 结束',
              width: 230,
              render: (_, e) => (
                <>
                  {e.startedAt}
                  <p>{e.finishedAt ?? '未结束'}</p>
                </>
              ),
            },
            {
              title: '执行结果',
              width: 130,
              render: (_, e) => (
                <Tag color={e.result === 'failed' ? 'orange' : 'default'}>
                  {e.termination === 'cancelled'
                    ? '已终止，无结果'
                    : e.result
                      ? testResultLabels[e.result]
                      : '未完成'}
                </Tag>
              ),
            },
            {
              title: '共享技术摘要',
              width: 220,
              render: (_, e) =>
                e.technicalSummary ?? '旧记录未提供独立共享摘要',
            },
            {
              title: '复核处理',
              width: 220,
              render: (_, e) =>
                e.origin === 'legacy' ? (
                  'legacy 不伪造采纳'
                ) : e.termination === 'cancelled' ? (
                  '取消不形成失败'
                ) : resolved(e.id) ? (
                  '已处理（见采纳或审阅链）'
                ) : (
                  <Space wrap>
                    <Tag color="gold">待复核</Tag>
                    {session.permits('test:adopt') &&
                      e.result !== 'inconclusive' && (
                        <Button
                          size="small"
                          onClick={() => open('adopt', e.id)}
                        >
                          采纳此结果
                        </Button>
                      )}
                    {session.permits('test:review') &&
                      (e.result === 'inconclusive' ||
                        e.basis !== d.definition.basis ||
                        !d.targetCurrent) && (
                        <Button
                          size="small"
                          onClick={() => open('review', e.id)}
                        >
                          审阅不形成新结论
                        </Button>
                      )}
                  </Space>
                ),
            },
          ]}
          expandable={{
            expandedRowRender: (e) => (
              <Descriptions
                column={1}
                items={[
                  {
                    key: 'internal',
                    label: '内部技术说明',
                    children: e.internalNotes ?? e.failureReason ?? '未提供',
                  },
                  {
                    key: 'evidence',
                    label: '受限模拟证据',
                    children:
                      e.evidenceReference ?? e.reportReference ?? '未提供',
                  },
                  {
                    key: 'target',
                    label: '执行目标版本',
                    children: e.targetVersion ?? 'legacy 未提供',
                  },
                ]}
              />
            ),
          }}
          locale={{ emptyText: '尚无完成执行；开始后会记录独立轮次。' }}
        />
      </Card>
      <Card title="官方来源与质量豁免" className="resource-card">
        <p>
          仅官方原厂、来源核验有效且有独立模拟证据时可豁免质量；连通性始终独立待验证。
        </p>
        <Space wrap>
          {button(
            'verify',
            '登记来源核验',
            session.permits('test:source-verify'),
          )}
          {button(
            'unverify',
            '撤销来源核验',
            session.permits('test:source-verify'),
          )}
          {button('exempt', '登记质量豁免', session.permits('test:exemption'))}
          {session.permits('test:exemption') &&
            d.exemptions
              .filter(
                (e) =>
                  !d.exemptionRevocations.some((r) => r.exemptionId === e.id),
              )
              .map((e) => (
                <Button key={e.id} onClick={() => open('revoke', e.id)}>
                  撤销质量豁免
                </Button>
              ))}
        </Space>
        <p>
          当前：
          {d.summary.exempted ? '有效质量豁免（非测试通过）' : '无有效质量豁免'}
        </p>
        <Collapse
          items={[
            {
              key: 'source',
              label: '核验、豁免与撤销历史（授权）',
              children: (
                <>
                  <pre>
                    {JSON.stringify(
                      {
                        sources: d.sourceVerifications,
                        exemptions: d.exemptions,
                        revocations: d.exemptionRevocations,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </>
              ),
            },
          ]}
        />
      </Card>
      <Card title="采纳与审阅链" className="resource-card">
        <p>执行人和采纳人独立记录；采纳一条执行不清除其他待复核。</p>
        {!d.conclusions.length && !d.reviews.length ? (
          <Empty description="尚无人工采纳或审阅记录；legacy 状态不代表本期确认" />
        ) : (
          <>
            <ul>
              {d.conclusions.map((c) => (
                <li key={c.id}>
                  采纳 {testResultLabels[c.result]} · 执行 {c.executionId} ·{' '}
                  {c.adoptedBy} · {c.adoptedAt} · {c.reason}
                </li>
              ))}
              {d.reviews.map((r) => (
                <li key={r.id}>
                  已审阅但未形成新结论 · {r.executionId} · {r.reviewedBy} ·{' '}
                  {r.reviewedAt} · {r.reason}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card title="测试专用操作审计" className="resource-card">
        <Table
          rowKey="id"
          size="small"
          scroll={{ x: 1000 }}
          dataSource={[...d.history].reverse()}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: '操作', dataIndex: 'action' },
            { title: '时间', dataIndex: 'occurredAt' },
            { title: '操作人', dataIndex: 'actorUserId' },
            { title: '原因', dataIndex: 'reason' },
            { title: '关联执行', dataIndex: 'executionId' },
          ]}
          expandable={{
            expandedRowRender: (e) => (
              <pre>{JSON.stringify(e.changes, null, 2)}</pre>
            ),
          }}
        />
      </Card>
      {dialog && (
        <ActionDialog
          session={session}
          dialog={dialog}
          options={result.data.options}
          error={error}
          setError={setError}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            reload();
          }}
        />
      )}
    </>
  );
}
const actionTitles: Record<Action, string> = {
  update: '维护测试目标与负责人',
  start: '开始人工模拟执行',
  finish: '录入人工测试结果',
  cancel: '取消测试任务',
  adopt: '人工采纳执行结论',
  review: '审阅但不形成新结论',
  verify: '登记模拟来源核验',
  unverify: '撤销模拟来源核验',
  exempt: '登记质量测试豁免',
  revoke: '撤销质量测试豁免',
};
function ActionDialog({
  session,
  dialog,
  options,
  error,
  setError,
  onClose,
  onSaved,
}: {
  session: DemoSession;
  dialog: Dialog;
  options: Awaited<ReturnType<DemoSession['api']['testingOptions']>>;
  error: string;
  setError: (v: string) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm<
      ExecutionInput & {
        reason: string;
        targetReference: string;
        assignedTo?: string;
      }
    >(),
    [busy, setBusy] = useState(false);
  const { kind, snapshot: d, requestId: key } = dialog;
  const submit = async () => {
    try {
      const v = await form.validateFields();
      setError('');
      setBusy(true);
      const api = session.api,
        version = d.definition.version,
        token = { ...d.token, executionVersion: 1 },
        cid = d.task.channelId;
      switch (kind) {
        case 'update':
          await api.updateTestTask(
            d.task.id,
            version,
            v.targetReference,
            v.assignedTo ?? null,
            key,
          );
          break;
        case 'start':
          await api.startTestTask(d.task.id, version, key);
          break;
        case 'finish':
          await api.finishTestExecution(
            d.task.id,
            version,
            d.activeRun!.id,
            {
              result: v.result,
              technicalSummary: v.technicalSummary,
              internalNotes: v.internalNotes ?? '',
              evidenceReference: v.evidenceReference,
              failureCategory: v.failureCategory ?? null,
            },
            key,
          );
          break;
        case 'cancel':
          await api.cancelTestTask(d.task.id, version, v.reason, key);
          break;
        case 'adopt':
          await api.adoptTestExecution(dialog.id!, token, v.reason, key);
          break;
        case 'review':
          await api.reviewTestExecution(dialog.id!, token, v.reason, key);
          break;
        case 'verify':
        case 'unverify':
          await api.verifyTestSource(
            cid,
            dialog.channelVersion,
            kind === 'verify' ? 'verified' : 'revoked',
            v.evidenceReference,
            v.reason,
            key,
          );
          break;
        case 'exempt':
          await api.recordQualityExemption(
            cid,
            dialog.channelVersion,
            v.evidenceReference,
            v.reason,
            key,
          );
          break;
        case 'revoke':
          await api.revokeQualityExemption(
            dialog.id!,
            dialog.channelVersion,
            v.reason,
            key,
          );
          break;
      }
      onSaved();
    } catch (e) {
      setError(resourceErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={actionTitles[kind]}
      open
      onCancel={onClose}
      onOk={() => void submit()}
      cancelText="关闭表单"
      confirmLoading={busy}
      okText="确认保存"
    >
      <Alert
        type="info"
        title="仅保存本地人工模拟事实，不调用外部服务。提交失败会保留输入；发生版本冲突请关闭并刷新后重试。"
      />
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          targetReference: d.definition.targetReference,
          assignedTo: d.task.assignedTo ?? undefined,
          result: 'passed',
          evidenceReference: 'mock:manual-evidence',
          internalNotes: '',
        }}
      >
        {kind === 'update' ? (
          <>
            <Form.Item
              name="targetReference"
              label="测试目标"
              rules={[{ required: true, whitespace: true }]}
            >
              <Input.TextArea aria-label="维护测试目标" maxLength={4000} />
            </Form.Item>
            <Form.Item name="assignedTo" label="负责人">
              <Select
                allowClear
                aria-label="维护负责人"
                options={options.assignees.map((u) => ({
                  value: u.id,
                  label: u.name,
                }))}
              />
            </Form.Item>
            <p>已有执行不能改目标；目标或渠道关键配置变化须新建任务。</p>
          </>
        ) : kind === 'finish' ? (
          <>
            <Form.Item
              name="result"
              label="人工执行结果"
              rules={[{ required: true }]}
            >
              <Select
                aria-label="人工执行结果"
                options={Object.entries(testResultLabels).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
            </Form.Item>
            <Form.Item
              name="technicalSummary"
              label="跨角色共享技术摘要"
              rules={[{ required: true, whitespace: true }]}
            >
              <Input.TextArea
                aria-label="共享技术摘要"
                maxLength={4000}
                placeholder="仅技术结论，不得写客户身份、价格、凭据或内部分析"
              />
            </Form.Item>
            <Form.Item
              name="internalNotes"
              label="内部技术说明（仅运营与测试）"
            >
              <Input.TextArea aria-label="内部技术说明" maxLength={4000} />
            </Form.Item>
            <Form.Item name="failureCategory" label="技术错误类别">
              <Select
                aria-label="技术错误类别"
                allowClear
                options={[
                  'timeout',
                  'authentication',
                  'invalid_response',
                  'quality',
                  'other',
                ].map((value) => ({ value, label: value }))}
              />
            </Form.Item>
          </>
        ) : kind === 'start' ? (
          <p>
            将记录独立执行
            ID、操作者、开始时间及目标版本。同一任务不能同时开始两轮。
          </p>
        ) : (
          <Form.Item
            name="reason"
            label="操作原因 / 说明"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input.TextArea aria-label="操作说明" maxLength={4000} />
          </Form.Item>
        )}
        {['finish', 'verify', 'unverify', 'exempt'].includes(kind) && (
          <Form.Item
            name="evidenceReference"
            label="非敏感 mock 证据引用"
            rules={[
              { required: true },
              {
                pattern: /^mock:[A-Za-z0-9_:/.-]{1,150}$/,
                message: '仅允许 mock: 模拟引用',
              },
            ]}
          >
            <Input aria-label="模拟证据引用" />
          </Form.Item>
        )}
      </Form>
      {error && <Alert type="error" title={error} />}
    </Modal>
  );
}
