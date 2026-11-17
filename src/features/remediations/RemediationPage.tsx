import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Form,
  Input,
  Modal,
  Result,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type {
  RemediationInput,
  RemediationOperation,
} from '../../services/remediation-types';
import {
  problemCategoryLabels,
  remediationStatusLabels,
} from '../../domain/remediations';
import { useResourceQuery } from '../models/use-resource-query';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { PageHeader } from '../../components/PageHeader';
const actionLabels: Record<string, string> = {
  create: '登记整改',
  update: '补充或维护问题',
  assign: '分配负责人',
  due: '调整期限',
  start: '开始跟进',
  followup: '添加跟进',
  submit: '提交本轮结果',
  link: '关联复测',
  return: '退回整改',
  normal: '正常关闭',
  exception: '例外关闭',
};
type Values = {
  channelId: string;
  sourceType: 'manual' | 'failed_execution';
  sourceExecutionId: string | null;
  category: RemediationInput['category'];
  verificationScope: RemediationInput['verificationScope'];
  targetReference: string;
  sharedSummary: string;
  internalNotes: string;
  assigneeUserId: string | null;
  dueAt: string | null;
  splitReason: string;
  reason: string;
  evidenceReference: string;
  executionId: string;
  conclusionId: string;
  applicabilityReason: string;
  exceptionCategory:
    'duplicate' | 'no_longer_applicable' | 'unable_to_verify' | 'other';
};
const initial = {
  sourceType: 'manual',
  sourceExecutionId: null,
  assigneeUserId: null,
  dueAt: null,
  splitReason: '',
  evidenceReference: 'mock:remediation',
  category: 'other',
  verificationScope: 'quality',
};
const date = (v: string | null) =>
  v
    ? new Date(v).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour12: false,
      })
    : '未知';
export default function RemediationPage() {
  const session = useOutletContext<DemoSession>();
  if (!session.permits('remediation:summary'))
    return <Result status="403" title="无整改访问权限" />;
  return (
    <Content
      key={`${session.profile.user.id}:${session.domain}`}
      session={session}
    />
  );
}
function Content({ session }: { session: DemoSession }) {
  const { remediationId } = useParams();
  const [search, setSearch] = useState(''),
    [operation, setOperation] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<string | null>(null),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [form] = Form.useForm<Values>();
  const sourceExecutionId = Form.useWatch('sourceExecutionId', form);
  const selectedChannelId = Form.useWatch('channelId', form);
  const load = useCallback(async () => {
    const rows = await session.api.queryRemediationSummaries();
    const canRead = session.permits('remediation:detail');
    const [detail, options, details, channels] = await Promise.all([
      remediationId && canRead
        ? session.api.getRemediation(remediationId)
        : null,
      canRead ? session.api.remediationOptions() : null,
      canRead
        ? Promise.all(rows.map((r) => session.api.getRemediation(r.id)))
        : [],
      session.permits('channel:read') ? session.api.listChannels() : [],
    ]);
    return { rows, detail, options, details, channels };
  }, [session, remediationId]);
  const { result, reload } = useResourceQuery(load);
  const open = (op: string) => {
    setOperation(op);
    setError('');
    setPreview(null);
    setRequestId(crypto.randomUUID());
    form.resetFields();
    if (result.status === 'ready' && result.data.detail) {
      const r = result.data.detail.record;
      form.setFieldsValue({
        category: r.category ?? 'other',
        verificationScope: r.verificationScope ?? 'quality',
        targetReference: r.targetReference ?? '',
        sharedSummary: r.sharedSummary ?? '',
        internalNotes: r.internalNotes ?? '',
        assigneeUserId: r.assigneeUserId,
        dueAt: r.dueAt,
      });
    }
  };
  const header = (
    <PageHeader
      title={remediationId ? '整改详情' : '整改管理'}
      description="渠道级人工 Mock 整改；测试、采纳结论与整改状态彼此独立。"
      group="业务协同"
      actions={
        <Space wrap>
          <Button onClick={reload}>刷新整改</Button>
          {session.permits('remediation:create') && (
            <Button onClick={() => open('create')}>新建整改</Button>
          )}
          <Link to="/remediations">整改列表</Link>
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
  const { rows, detail, options, details, channels } = result.data,
    r = detail?.record;
  if (remediationId && !r)
    return (
      <>
        {header}
        <Result status="403" title="整改不存在或无权查看完整详情" />
      </>
    );
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const v = await form.validateFields();
      if (operation === 'create') {
        const input: RemediationInput = {
          channelId: v.channelId,
          sourceType: v.sourceType,
          sourceExecutionId:
            v.sourceType === 'manual' ? null : v.sourceExecutionId,
          category: v.category,
          verificationScope: v.verificationScope,
          targetReference: v.targetReference,
          sharedSummary: v.sharedSummary,
          internalNotes: v.internalNotes,
          assigneeUserId: v.assigneeUserId ?? null,
          dueAt: v.dueAt || null,
          splitReason: v.splitReason || '',
        };
        await session.api.createRemediation(input, requestId);
      } else if (r) {
        let input: RemediationOperation;
        switch (operation) {
          case 'update':
            input = {
              action: 'update',
              category: v.category,
              verificationScope: v.verificationScope,
              targetReference: v.targetReference,
              sharedSummary: v.sharedSummary,
              internalNotes: v.internalNotes,
            };
            break;
          case 'assign':
            input = {
              action: 'assign',
              assigneeUserId: v.assigneeUserId ?? null,
            };
            break;
          case 'due':
            input = { action: 'due', dueAt: v.dueAt || null };
            break;
          case 'submit':
            input = {
              action: 'submit',
              sharedSummary: v.sharedSummary,
              internalNotes: v.internalNotes,
              evidenceReference: v.evidenceReference,
            };
            break;
          case 'link':
            input = {
              action: 'link',
              executionId: v.executionId,
              applicabilityReason: v.applicabilityReason,
            };
            break;
          case 'exception':
            input = { action: 'exception', category: v.exceptionCategory };
            break;
          case 'normal': {
            const token = await session.api.previewRemediationClosure(
              r.id,
              r.version,
              v.executionId,
              v.conclusionId,
              v.applicabilityReason,
            );
            if (!preview) {
              setPreview(token);
              return;
            }
            input = {
              action: 'normal',
              executionId: v.executionId,
              conclusionId: v.conclusionId,
              applicabilityReason: v.applicabilityReason,
              token: preview,
            };
            break;
          }
          default:
            if (
              operation !== 'start' &&
              operation !== 'followup' &&
              operation !== 'return'
            )
              throw Error('操作无效');
            input = { action: operation };
        }
        await session.api.changeRemediation(
          r.id,
          r.version,
          input,
          v.reason,
          requestId,
        );
      }
      setOperation(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请检查输入后重试。');
    } finally {
      setBusy(false);
    }
  };
  const scopeFields = (
    <>
      <Form.Item
        name="category"
        label="技术问题分类"
        rules={[{ required: true }]}
      >
        <Select
          options={Object.entries(problemCategoryLabels).map(
            ([value, label]) => ({ value, label }),
          )}
        />
      </Form.Item>
      <Form.Item
        name="verificationScope"
        label="验证范围"
        rules={[{ required: true }]}
      >
        <Select
          options={[
            { value: 'quality', label: '质量' },
            { value: 'connectivity', label: '连通性' },
          ]}
        />
      </Form.Item>
      <Form.Item
        name="targetReference"
        label="验证目标引用"
        rules={[{ required: true }]}
      >
        <Input placeholder="与复测任务结构化目标引用一致" />
      </Form.Item>
      <Form.Item
        name="sharedSummary"
        label="问题说明"
        rules={[{ required: true }]}
      >
        <Input.TextArea />
      </Form.Item>
      <Form.Item
        name="internalNotes"
        label="内部技术说明"
        rules={[{ required: true }]}
      >
        <Input.TextArea />
      </Form.Item>
    </>
  );
  const executions = (options?.executions ?? []).filter(
    (e) =>
      !r || (e.channelId === r.channelId && e.type === r.verificationScope),
  );
  return (
    <>
      {header}
      {r && detail ? (
        <>
          <Card title="问题与跟进" className="resource-card">
            <Descriptions
              column={{ xs: 1, sm: 2 }}
              items={[
                {
                  key: 'status',
                  label: '状态',
                  children: remediationStatusLabels[r.status],
                },
                {
                  key: 'channel',
                  label: '渠道',
                  children: (
                    <Link to={`/channels/${r.channelId}`}>
                      {channels.find((c) => c.id === r.channelId)
                        ?.displayName ?? '待补充'}
                    </Link>
                  ),
                },
                {
                  key: 'owner',
                  label: '跟进人',
                  children:
                    options?.assignees.find((u) => u.id === r.assigneeUserId)
                      ?.name ?? '待分配',
                },
                {
                  key: 'recent',
                  label: '最近跟进',
                  children: date(
                    detail.events.filter((e) => e.action === 'followup').at(-1)
                      ?.occurredAt ?? null,
                  ),
                },
                {
                  key: 'feedback',
                  label: '供应商反馈',
                  children:
                    detail.submissions.at(-1)?.sharedSummary ??
                    r.supplierResponse ??
                    '待反馈',
                },
                { key: 'next', label: '下次跟进', children: date(r.dueAt) },
                {
                  key: 'retest',
                  label: '复测安排',
                  children:
                    r.status === 'submitted'
                      ? '可以安排复测'
                      : r.status === 'closed'
                        ? '已结束'
                        : '等待供应商反馈',
                },
                {
                  key: 'problem',
                  label: '具体问题',
                  children: (
                    <Typography.Paragraph
                      ellipsis={{
                        rows: 3,
                        expandable: true,
                        symbol: '展开问题',
                      }}
                    >
                      {r.sharedSummary || r.description}
                    </Typography.Paragraph>
                  ),
                },
              ]}
            />
            <Collapse
              ghost
              items={[
                {
                  key: 'verification',
                  label: '核验信息',
                  children: (
                    <Descriptions
                      column={{ xs: 1, sm: 2 }}
                      items={[
                        { key: 'recordId', label: '记录编号', children: r.id },
                        {
                          key: 'status',
                          label: '状态',
                          children: remediationStatusLabels[r.status],
                        },
                        {
                          key: 'channel',
                          label: '渠道',
                          children: (
                            <Link to={`/channels/${r.channelId}`}>
                              {r.channelId}
                            </Link>
                          ),
                        },
                        {
                          key: 'source',
                          label: '来源',
                          children: `${{ manual: '人工技术问题', failed_execution: '测试失败', legacy: '旧事项来源' }[r.sourceType]} · ${{ manual: '人工登记', current: '当前适用', invalidated: '依据已失效', legacy_unknown: '历史适用性未确认' }[detail.sourceApplicability]}`,
                        },
                        {
                          key: 'sourceExecution',
                          label: '来源执行',
                          children: r.relatedTestExecutionId ?? '无',
                        },
                        {
                          key: 'assignee',
                          label: '整改负责人',
                          children:
                            options?.assignees.find(
                              (u) => u.id === r.assigneeUserId,
                            )?.name ?? '未分配',
                        },
                        {
                          key: 'round',
                          label: '当前轮次',
                          children: r.activeRound ?? '旧事项，尚无新轮次',
                        },
                        {
                          key: 'due',
                          label: '截止时间（北京时间）',
                          children: date(r.dueAt),
                        },
                        {
                          key: 'conclusion',
                          label: '当前运营采纳依据',
                          children: detail.currentConclusion
                            ? `${detail.currentConclusion.result === 'passed' ? '通过' : '失败'} · 执行 ${detail.currentConclusion.executionId} · 结论 ${detail.currentConclusion.id}`
                            : '暂无现行采纳依据（不代表测试已验证通过）',
                        },
                        {
                          key: 'summary',
                          label: '问题说明',
                          children: r.sharedSummary ?? '尚未补充',
                        },
                        {
                          key: 'internal',
                          label: '内部说明',
                          children: r.internalNotes ?? r.description,
                        },
                        {
                          key: 'target',
                          label: '验证目标',
                          children: r.targetReference ?? '尚未补充',
                        },
                      ]}
                    />
                  ),
                },
              ]}
            />
            <Space wrap>
              {r.status !== 'closed' &&
                [
                  ['update', '补充或维护问题'],
                  ['assign', '分配负责人'],
                  ['due', '设置期限'],
                  ['start', '开始跟进'],
                  ['followup', '添加跟进'],
                  ['submit', '提交本轮结果'],
                  ['link', '关联已有复测'],
                  ['return', '退回整改'],
                  ['normal', '正常关闭'],
                  ['exception', '例外关闭'],
                ]
                  .filter(([op]) => {
                    const owned =
                      session.profile.user.role === 'ProductOperations' ||
                      r.assigneeUserId === session.profile.user.id;
                    if (
                      ['start', 'followup', 'submit', 'link'].includes(op!) &&
                      !owned
                    )
                      return false;
                    if (op === 'start') return r.status === 'open';
                    if (op === 'submit') return r.status === 'in_progress';
                    if (op === 'link')
                      return ['in_progress', 'submitted'].includes(r.status);
                    if (op === 'return' || op === 'normal')
                      return r.status === 'submitted';
                    if (op === 'update')
                      return !detail.submissions.length && !detail.links.length;
                    return true;
                  })
                  .filter(([op]) =>
                    session.permits(
                      op === 'normal' || op === 'exception'
                        ? 'remediation:close'
                        : op === 'due'
                          ? 'remediation:assign'
                          : op === 'start'
                            ? 'remediation:followup'
                            : op === 'link'
                              ? 'remediation:link-test'
                              : (`remediation:${op}` as Parameters<
                                  DemoSession['permits']
                                >[0]),
                    ),
                  )
                  .map(([op, label]) => (
                    <Button key={op} onClick={() => open(op!)}>
                      {label}
                    </Button>
                  ))}
              <Link to={`/tests?channelId=${r.channelId}`}>
                去测试管理执行并采纳复测
              </Link>
            </Space>
          </Card>
          <Collapse
            className="resource-card"
            items={[
              {
                key: 'history',
                label: '跟进与复测历史',
                children: (
                  <>
                    {detail.submissions.map((v) => (
                      <p key={v.id}>
                        第 {v.round} 轮 · {date(v.submittedAt)} ·{' '}
                        {v.sharedSummary} · {v.internalNotes} ·{' '}
                        {v.evidenceReference}
                      </p>
                    ))}
                    {detail.links.map((v) => (
                      <p key={v.id}>
                        第 {v.round} 轮复测：
                        <Link to={`/tests/${v.taskId}`}>
                          {v.executionId}
                        </Link> · {v.applicabilityReason}
                      </p>
                    ))}
                    {detail.closures.map((v) => (
                      <Alert
                        key={v.id}
                        type={
                          v.closureType === 'normal' ? 'success' : 'warning'
                        }
                        title={
                          v.closureType === 'normal'
                            ? '运营正常关闭'
                            : '例外结束，不代表技术修复已验证成功。'
                        }
                        description={`${v.reason} · ${date(v.closedAt)}${v.verificationExecutionId ? ` · 复测：${v.verificationExecutionId} · 采纳结论：${v.verificationConclusionId}` : ''}`}
                      />
                    ))}
                    {detail.events.map((v) => (
                      <p key={v.id}>
                        {date(v.occurredAt)} ·{' '}
                        {actionLabels[v.action] ?? v.action} · {v.actorUserId} ·{' '}
                        {v.reason} · 版本 {v.beforeVersion ?? '无'} →{' '}
                        {v.afterVersion}
                      </p>
                    ))}
                  </>
                ),
              },
            ]}
          />
        </>
      ) : (
        <>
          <Card title="整改事项" className="resource-card">
            <Input
              aria-label="搜索整改编号"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索渠道、问题或编号"
            />
            <Table
              rowKey="id"
              scroll={{ x: 1050 }}
              dataSource={rows.filter((r) =>
                `${r.id} ${channels.find((c) => c.id === r.channelId)?.displayName ?? ''} ${details.find((d) => d?.record.id === r.id)?.record.description ?? ''}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )}
              columns={[
                {
                  title: '渠道 / 问题',
                  render: (_, row) => (
                    <div>
                      {session.permits('remediation:detail') ? (
                        <Link to={`/remediations/${row.id}`}>
                          {channels.find((c) => c.id === row.channelId)
                            ?.displayName ?? '待补充渠道'}
                        </Link>
                      ) : (
                        <span>
                          {channels.find((c) => c.id === row.channelId)
                            ?.displayName ?? '待补充渠道'}
                        </span>
                      )}
                      <small className="resource-subtitle">
                        {details.find((d) => d?.record.id === row.id)?.record
                          .sharedSummary ??
                          details.find((d) => d?.record.id === row.id)?.record
                            .description ??
                          (row.category
                            ? problemCategoryLabels[row.category]
                            : '待补充')}
                      </small>
                    </div>
                  ),
                },
                {
                  title: '跟进人',
                  render: (_, row) =>
                    options?.assignees.find(
                      (u) =>
                        u.id ===
                        details.find((d) => d?.record.id === row.id)?.record
                          .assigneeUserId,
                    )?.name ?? '待分配',
                },
                {
                  title: '最近跟进 / 供应商反馈',
                  render: (_, row) => {
                    const d = details.find((d) => d?.record.id === row.id);
                    const event = d?.events
                      .filter((e) => e.action === 'followup')
                      .at(-1);
                    return (
                      <div>
                        {event ? date(event.occurredAt) : '尚未跟进'}
                        <small className="resource-subtitle">
                          {event?.reason ??
                            d?.record.supplierResponse ??
                            '待反馈'}
                        </small>
                      </div>
                    );
                  },
                },
                {
                  title: '下次跟进',
                  render: (_, row) =>
                    date(
                      details.find((d) => d?.record.id === row.id)?.record
                        .dueAt ?? null,
                    ),
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (s) => (
                    <Tag>
                      {
                        remediationStatusLabels[
                          s as keyof typeof remediationStatusLabels
                        ]
                      }
                    </Tag>
                  ),
                },
                {
                  title: '最近更新（北京时间）',
                  dataIndex: 'updatedAt',
                  render: date,
                },
              ]}
            />
          </Card>
        </>
      )}
      {session.permits('remediation:reset') && (
        <Button
          danger
          onClick={() =>
            Modal.confirm({
              title: '确认仅重置整改演示数据？',
              content:
                '清除新增整改及历史；保留测试、渠道、报价、寻源和供应商。',
              onOk: async () => {
                try {
                  await session.api.resetRemediations(true);
                  reload();
                } catch (e) {
                  setError(e instanceof Error ? e.message : '重置失败');
                }
              },
            })
          }
        >
          重置整改演示数据
        </Button>
      )}
      {!operation && error && <Alert type="error" title={error} />}
      <Modal
        title={
          operation === 'create'
            ? '新建整改'
            : operation === 'normal'
              ? '正常关闭核验'
              : '整改操作'
        }
        open={!!operation}
        onCancel={() => setOperation(null)}
        onOk={() => void save()}
        confirmLoading={busy}
        okText={
          operation === 'normal'
            ? preview
              ? '确认正常关闭'
              : '验证关闭条件'
            : '保存'
        }
        forceRender
        okButtonProps={{ autoInsertSpace: false }}
      >
        {error && <Alert type="error" title={error} />}{' '}
        {preview && (
          <Alert
            type="success"
            title="关闭条件已通过预览；确认时将重新核验。"
          />
        )}
        <Form
          requiredMark={false}
          form={form}
          layout="vertical"
          initialValues={initial}
          onValuesChange={() => setPreview(null)}
        >
          {operation === 'create' && (
            <>
              <Form.Item
                name="channelId"
                label="渠道"
                rules={[{ required: true }]}
              >
                <Select
                  options={(options?.channels ?? []).map((c) => ({
                    value: c.id,
                    label: `${c.name} · ${c.supplierId}`,
                  }))}
                />
              </Form.Item>
              <Form.Item name="sourceType" label="主来源">
                <Select
                  options={[
                    { value: 'manual', label: '人工技术问题' },
                    {
                      value: 'failed_execution',
                      label: '测试失败（不自动采纳）',
                    },
                  ]}
                />
              </Form.Item>
              <Form.Item name="sourceExecutionId" label="来源失败执行">
                <Select
                  allowClear
                  options={(options?.executions ?? [])
                    .filter((e) => e.result === 'failed')
                    .map((e) => ({
                      value: e.id,
                      label: `${e.id} · ${e.channelId} · ${e.current ? '当前' : '旧配置/legacy'}`,
                    }))}
                />
              </Form.Item>
              {sourceExecutionId && (
                <DuplicateSources
                  session={session}
                  executionId={sourceExecutionId}
                />
              )}
              {scopeFields}
              <Form.Item name="splitReason" label="同来源独立拆分原因">
                <Input.TextArea placeholder="同一失败已有未关闭事项时必填" />
              </Form.Item>
            </>
          )}
          {operation === 'update' && scopeFields}
          {(operation === 'assign' ||
            (operation === 'create' &&
              session.permits('remediation:assign'))) && (
            <Form.Item name="assigneeUserId" label="整改负责人">
              <Select
                allowClear
                options={(options?.assignees ?? [])
                  .filter((u) =>
                    u.channelIds.includes(r?.channelId ?? selectedChannelId),
                  )
                  .map((u) => ({
                    value: u.id,
                    label: u.name,
                  }))}
              />
            </Form.Item>
          )}
          {(operation === 'due' ||
            (operation === 'create' &&
              session.permits('remediation:assign'))) && (
            <Form.Item
              name="dueAt"
              label="截止时间（完整 ISO 时间及 +08:00 或 Z）"
            >
              <Input placeholder="例如 2026-11-30T18:00:00+08:00，未知留空" />
            </Form.Item>
          )}
          {operation === 'submit' && (
            <>
              <Form.Item
                name="sharedSummary"
                label="本轮共享整改结果"
                rules={[{ required: true }]}
              >
                <Input.TextArea />
              </Form.Item>
              <Form.Item
                name="internalNotes"
                label="本轮内部处理说明"
                rules={[{ required: true }]}
              >
                <Input.TextArea />
              </Form.Item>
              <Form.Item
                name="evidenceReference"
                label="模拟证据引用"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </>
          )}
          {(operation === 'link' || operation === 'normal') && (
            <>
              <Form.Item
                name="executionId"
                label="复测执行"
                rules={[{ required: true }]}
              >
                <Select
                  options={executions.map((e) => ({
                    value: e.id,
                    label: `${e.id} · ${e.result} · ${e.targetReference ?? 'legacy目标未知'}`,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="applicabilityReason"
                label="本轮验证目标适用性说明"
                rules={[{ required: true }]}
              >
                <Input.TextArea />
              </Form.Item>
            </>
          )}
          {operation === 'normal' && (
            <Form.Item
              name="conclusionId"
              label="明确选择现行采纳结论"
              rules={[{ required: true }]}
            >
              <Select
                options={(options?.conclusions ?? []).map((c) => ({
                  value: c.id,
                  label: `${c.id} · ${c.executionId}`,
                }))}
              />
            </Form.Item>
          )}
          {operation === 'exception' && (
            <Form.Item
              name="exceptionCategory"
              label="例外原因分类"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  'duplicate',
                  'no_longer_applicable',
                  'unable_to_verify',
                  'other',
                ].map((value, i) => ({
                  value,
                  label: ['重复登记', '不再适用', '无法验证', '其他'][i],
                }))}
              />
            </Form.Item>
          )}
          {operation !== 'create' && (
            <Form.Item
              name="reason"
              label="操作说明"
              rules={[{ required: true }]}
            >
              <Input.TextArea />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}

function DuplicateSources({
  session,
  executionId,
}: {
  session: DemoSession;
  executionId: string;
}) {
  const load = useCallback(
    () => session.api.queryRemediationSummaries({ executionId }),
    [session.api, executionId],
  );
  const { result } = useResourceQuery(load);
  if (result.status !== 'ready') return null;
  const rows = result.data.filter((r) => r.status !== 'closed');
  return rows.length ? (
    <Alert
      type="warning"
      title="同来源已有未关闭整改，独立登记须填写拆分原因。"
      description={
        <Space wrap>
          {rows.map((r) => (
            <Link key={r.id} to={`/remediations/${r.id}`}>
              {r.id} · {remediationStatusLabels[r.status]}
            </Link>
          ))}
        </Space>
      }
    />
  ) : null;
}
