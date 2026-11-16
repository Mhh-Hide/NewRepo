import { remediationStatusLabels } from '../../domain/remediations';
import { testResultLabels } from '../../domain/testing';
import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Steps,
} from 'antd';
import { Link } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type { DeliveryCommand } from '../../services/lifecycle-types';
import { contractLabels, dispatchLabels } from '../../domain/lifecycle';
import { useResourceQuery } from '../models/use-resource-query';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { ResourceGoal } from './ResourceGoal';
type Values = Record<string, string | number | boolean | string[] | null>;
const labels: Record<string, string> = {
  'test-result': '测试执行保存',
  'remediation-submitted': '原整改本轮反馈完成',
  'safety-paused': '安全暂停调度',
  'task:read': '通知已读',
  'task:complete': '协作任务完成',
  'task:cancel': '协作任务取消',
  'task:reopen': '协作任务重新打开',
  assign: '责任交接',
  acquire: '确认资源获取与交接',
  resource: '维护采购资源参数',
  verify: '登记阶段核验',
  contract: '推进采购合同',
  configuration: '登记生产配置',
  dispatch: '确认开放或调度',
  hold: '人工挂起',
  resume: '恢复推进',
  terminate: '终止交付',
  feedback: '登记供应商问题反馈',
  comment: '内部评论与 @',
  'supplier-communication': '维护供应商沟通资料',
};
const date = (v: string | null) =>
  v
    ? new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    : '未知';
export function LifecycleDetail({
  session,
  id,
  onClose,
}: {
  session: DemoSession;
  id: string;
  onClose: () => void;
}) {
  const load = useCallback(
      async () => ({
        detail: await session.api.getLifecycle(id),
        options: await session.api.lifecycleOptions(id),
      }),
      [session.api, id],
    ),
    { result, reload } = useResourceQuery(load);
  const [action, setAction] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [request, setRequest] = useState(() => crypto.randomUUID()),
    [form] = Form.useForm<Values>();
  const phase = Form.useWatch('phase', form);
  const open = (a: string) => {
    setAction(a);
    setError('');
    setRequest(crypto.randomUUID());
    form.resetFields();
    if (result.status === 'ready' && result.data.detail) {
      const { row } = result.data.detail,
        users = result.data.options.users;
      form.setFieldsValue({
        procurementOwnerId:
          row.record?.procurementOwnerId ??
          users.find((u) => u.role === 'Procurement')?.id ??
          null,
        testerId:
          row.record?.testerId ??
          users.find((u) => u.role === 'Testing')?.id ??
          null,
        operatorId:
          row.record?.operatorId ??
          users.find((u) => u.role === 'ProductOperations')?.id ??
          null,
        credentialRecipientId:
          row.record?.credentialRecipientId ??
          users.find((u) => u.role === 'Testing')?.id ??
          null,
        recipientId:
          row.record?.productionRecipientId ??
          users.find((u) => u.role === 'ProductOperations')?.id ??
          null,
        usageTerms: row.record?.usageTerms ?? '',
        platformModelId: row.platformModelId,
        upstreamModelName: row.upstreamModelName,
        ttftMs: row.promised.ttftMs,
        rpm: row.promised.rpm,
        tpm: row.promised.tpm,
        concurrency: row.promised.concurrency,
      });
    }
  };
  const initial = {
    phase: 'quality',
    metering: 'pending',
    billing: 'pending',
    conclusion: 'failed',
    credentialStatus: 'pending',
    credentialReference: 'mock:test-credential-reference',
    evidenceReference: 'mock:verification-report',
    reference: 'mock:production-credential-reference',
    endpointReference: 'mock:endpoint-reference',
    sent: false,
    received: false,
    configured: false,
    state: 'not_open',
    stage: 'drafting',
    paperStatus: 'unknown',
    recipientIds: [],
  };
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const v = await form.validateFields();
      const str = (k: string) =>
          typeof v[k] === 'string' ? (v[k] as string) : '',
        nullable = (k: string) => str(k) || null,
        num = (k: string) =>
          typeof v[k] === 'number' ? (v[k] as number) : null;
      let input: DeliveryCommand;
      switch (action) {
        case 'assign':
          input = {
            action: 'assign',
            procurementOwnerId: str('procurementOwnerId'),
            testerId: str('testerId'),
            operatorId: str('operatorId'),
          };
          break;
        case 'acquire':
          input = {
            action: 'acquire',
            procurementOwnerId: str('procurementOwnerId'),
            testerId: str('testerId'),
            operatorId: str('operatorId'),
            demandId: nullable('demandId'),
            dueAt: nullable('dueAt'),
            credentialStatus: str('credentialStatus') as 'pending' | 'received',
            credentialReference: nullable('credentialReference'),
            credentialRecipientId: str('credentialRecipientId'),
            usageTerms: str('usageTerms'),
          };
          break;
        case 'resource':
          input = {
            action: 'resource',
            platformModelId: str('platformModelId'),
            upstreamModelName: str('upstreamModelName'),
            endpointReference: str('endpointReference'),
            ttftMs: num('ttftMs'),
            rpm: num('rpm'),
            tpm: num('tpm'),
            concurrency: num('concurrency'),
            credentialStatus: str('credentialStatus') as 'pending' | 'received',
            credentialReference: nullable('credentialReference'),
            usageTerms: str('usageTerms'),
          };
          break;
        case 'verify':
          input = {
            action: 'verify',
            phase: str('phase') as 'quality' | 'connectivity',
            executionId: str('executionId'),
            ttftMs: num('ttftMs'),
            rpm: num('rpm'),
            tpm: num('tpm'),
            concurrency: num('concurrency'),
            metering: str('metering') as 'pending' | 'passed' | 'failed',
            billing: str('billing') as 'pending' | 'passed' | 'failed',
            conclusion: str('conclusion') as 'passed' | 'failed',
            evidenceReference: str('evidenceReference'),
          };
          break;
        case 'contract':
          input = {
            action: 'contract',
            stage: str('stage') as
              'drafting' | 'signing' | 'effective' | 'paused' | 'terminated',
            number: str('number'),
            handler: str('handler'),
            nextAction: str('nextAction'),
            nextOwnerId: str('nextOwnerId'),
            dueAt: nullable('dueAt'),
            effectiveAt: nullable('effectiveAt'),
            paperStatus: str('paperStatus') as
              'unknown' | 'pending' | 'returned',
          };
          break;
        case 'configuration':
          input = {
            action: 'configuration',
            sent: v.sent === true,
            recipientId: str('recipientId'),
            received: v.received === true,
            configured: v.configured === true,
            reference: str('reference'),
          };
          break;
        case 'dispatch':
          input = {
            action: 'dispatch',
            state: str('state') as
              'not_open' | 'open' | 'private' | 'paused' | 'disabled',
          };
          break;
        case 'feedback':
          input = {
            action: 'feedback',
            executionId: str('executionId'),
            remediationId: str('remediationId'),
            recipientId: str('recipientId'),
            feedbackAt: str('feedbackAt'),
            summary: str('summary'),
          };
          break;
        case 'comment':
          input = {
            action: 'comment',
            body: str('body'),
            recipientIds: Array.isArray(v.recipientIds)
              ? (v.recipientIds as string[])
              : [],
          };
          break;
        case 'supplier-communication':
          input = {
            action: 'supplier-communication',
            groupName: str('groupName'),
            notes: str('notes'),
          };
          break;
        case 'hold':
        case 'resume':
        case 'terminate':
          input = { action };
          break;
        default:
          throw Error('不支持的操作');
      }
      const d = result.status === 'ready' ? result.data.detail : null;
      if (!d) throw Error('记录未加载');
      await session.api.changeLifecycle(
        id,
        d.row.version,
        input,
        str('reason'),
        request,
      );
      setAction(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };
  if (result.status !== 'ready')
    return (
      <Drawer title="渠道交付进度" open onClose={onClose} size={1000}>
        {result.status === 'loading' ? (
          <LoadingState />
        ) : (
          <ErrorState message={result.message} onRetry={reload} />
        )}
      </Drawer>
    );
  const { detail, options } = result.data;
  if (!detail)
    return (
      <Drawer title="渠道交付进度" open onClose={onClose}>
        <Alert type="error" title="渠道不存在或无权访问" />
      </Drawer>
    );
  const { row } = detail,
    r = row.record;
  const field = (
    name: string,
    label: string,
    kind: 'text' | 'area' | 'number' | 'select' = 'text',
    opts: { value: string | boolean; label: string }[] = [],
    required = true,
  ) => (
    <Form.Item
      key={name}
      name={name}
      label={label}
      rules={required ? [{ required: true }] : []}
    >
      {kind === 'select' ? (
        <Select options={opts} />
      ) : kind === 'number' ? (
        <InputNumber min={0} style={{ width: '100%' }} />
      ) : kind === 'area' ? (
        <Input.TextArea />
      ) : (
        <Input />
      )}
    </Form.Item>
  );
  const users = (role?: string) =>
    options.users
      .filter((u) => !role || u.role === role)
      .map((u) => ({ value: u.id, label: u.name }));
  const status = [
    { value: 'pending', label: '待核验' },
    { value: 'passed', label: '通过' },
    { value: 'failed', label: '失败' },
  ];
  const metrics = (
    <>
      {field('ttftMs', '实测 TTFT (ms)', 'number', [], false)}
      {field('rpm', '实测 RPM', 'number', [], false)}
      {field('tpm', '实测 TPM', 'number', [], false)}
      {field('concurrency', '实测并发', 'number', [], false)}
    </>
  );
  const credentials = (
    <>
      {field('credentialStatus', '测试凭据接收状态', 'select', [
        { value: 'pending', label: '待接收' },
        { value: 'received', label: '已授权接收' },
      ])}
      {field(
        'credentialReference',
        '测试凭据安全引用（仅 mock:）',
        'text',
        [],
        false,
      )}
      {field('usageTerms', '测试用量或测试金条件（模拟）', 'area')}
    </>
  );
  return (
    <Drawer
      title={`${row.channelName} · 资源交付`}
      open
      onClose={onClose}
      size={1100}
      extra={<Button onClick={reload}>刷新交付详情</Button>}
    >
      <Alert
        type={row.schedulable ? 'success' : row.abnormal ? 'error' : 'info'}
        title={`${row.percent}% · ${row.stage} · ${row.schedulable ? '当前可调度' : '当前不可调度'}`}
        description={row.blocker}
      />
      <Steps
        orientation="vertical"
        size="small"
        items={[...row.steps, ...row.extra].map((v) => ({
          title: v.label,
          status: v.done ? 'finish' : 'wait',
        }))}
      />
      <Descriptions
        column={{ xs: 1, sm: 2 }}
        items={[
          {
            key: 'model',
            label: '平台标准模型 ID',
            children: row.platformModelId,
          },
          {
            key: 'upstream',
            label: '上游调用模型名',
            children: row.upstreamModelName,
          },
          { key: 'supplier', label: '供应商全称', children: row.supplierName },
          {
            key: 'short',
            label: '供应商缩写',
            children: row.supplierShortCode,
          },
          {
            key: 'mapping',
            label: '模型映射',
            children:
              row.upstreamModelName === row.platformModelId
                ? '名称一致'
                : `${row.upstreamModelName} → ${row.platformModelId}`,
          },
          { key: 'contract', label: '采购合同', children: row.contractStage },
          {
            key: 'config',
            label: '生产配置',
            children: r?.configuredAt
              ? `${date(r.configuredAt)} · 只保存安全引用`
              : '待补充核验',
          },
          {
            key: 'deadline',
            label: '预计完成（北京时间）',
            children: date(row.dueAt),
          },
          {
            key: 'history',
            label: '历史开放时间',
            children: r?.openedAt ? date(r.openedAt) : '无本流程开放确认',
          },
          {
            key: 'communication',
            label: '供应商沟通群',
            children: detail.communication?.groupName ?? '未登记',
          },
          {
            key: 'notes',
            label: '沟通备注',
            children: detail.communication?.notes ?? '无',
          },
        ]}
      />
      <Space wrap>
        {!r && session.permits('resource:acquire') && (
          <Button onClick={() => open('acquire')}>确认资源获取与交接</Button>
        )}
        {r &&
          [
            ['assign', 'lifecycle:manage'],
            ['resource', 'resource:acquire'],
            ['verify', 'lifecycle:verify'],
            ['contract', 'contract:update'],
            ['configuration', 'production-config:update'],
            ['dispatch', 'lifecycle:open'],
            ['hold', 'lifecycle:manage'],
            ['resume', 'lifecycle:manage'],
            ['terminate', 'lifecycle:manage'],
            ['feedback', 'lifecycle:feedback'],
            ['comment', 'notification:mention'],
            ['supplier-communication', 'resource:acquire'],
          ]
            .filter(([, p]) =>
              session.permits(p as Parameters<DemoSession['permits']>[0]),
            )
            .map(([a]) => (
              <Button key={a} onClick={() => open(a!)}>
                {labels[a!]}
              </Button>
            ))}
        {session.permits('notification:mention') && (
          <Button
            onClick={async () => {
              try {
                await session.api.retryLifecycleSignals(id);
                reload();
              } catch (e) {
                setError(e instanceof Error ? e.message : '同步失败');
              }
            }}
          >
            重试测试通知同步
          </Button>
        )}
        <Link to={`/tests?channelId=${id}`}>前往真实测试任务与执行</Link>
        {session.permits('remediation:detail') && (
          <Link to="/remediations">前往原整改管理</Link>
        )}
        <Link to={`/channels/${id}`}>原渠道资料与承诺性能</Link>
      </Space>
      {error && !action && <Alert type="error" title={error} />}
      <Card title="真实测试执行与阶段核验" className="resource-card">
        {detail.executions.map((e) => (
          <p key={e.id}>
            <Link to={`/tests/${e.taskId}`}>{e.id}</Link> ·{' '}
            {e.phase === 'quality' ? '第一阶段质量' : '第二阶段连通性'} ·{' '}
            {e.result
              ? testResultLabels[e.result as keyof typeof testResultLabels]
              : '尚无结果'}{' '}
            · {e.current ? '当前配置' : '旧配置'} · 开始 {date(e.startedAt)}
          </p>
        ))}
        {detail.verifications.map((v) => (
          <p key={v.id}>
            {v.phase === 'quality' ? '第一阶段' : '第二阶段'}人工结论：
            {v.conclusion === 'passed' ? '通过' : '失败'}；计量：{v.metering}
            ；计费：{v.billing}；实测 TTFT：{v.ttftMs ?? '未知'}；证据：
            {v.evidenceReference}；执行引用：{v.executionId}
          </p>
        ))}
      </Card>
      <Card title="原整改多轮记录（不复制整改真值）" className="resource-card">
        {detail.remediations.map((v) => (
          <p key={v.id}>
            {session.permits('remediation:detail') ? (
              <Link to={`/remediations/${v.id}`}>{v.id}</Link>
            ) : (
              v.id
            )}{' '}
            ·{' '}
            {remediationStatusLabels[
              v.status as keyof typeof remediationStatusLabels
            ] ?? v.status}{' '}
            · 第 {v.round ?? '旧'} 轮
          </p>
        ))}
      </Card>
      <Card title="交付历史与内部评论" className="resource-card">
        {detail.events.map((v) => (
          <p key={v.id}>
            {date(v.occurredAt)} · {labels[v.action] ?? v.action} · {v.reason} ·
            版本 {v.beforeVersion ?? '—'} → {v.afterVersion ?? '—'}
          </p>
        ))}
        {detail.comments.map((v) => (
          <p key={v.id}>
            {date(v.occurredAt)} · {v.body}
          </p>
        ))}
      </Card>
      {r?.demandId && <ResourceGoal session={session} demandId={r.demandId} />}
      <Modal
        title={labels[action ?? ''] ?? '交付操作'}
        open={!!action}
        onCancel={() => setAction(null)}
        onOk={() => void submit()}
        confirmLoading={busy}
        okText="保存交付事实"
        forceRender
      >
        <Alert
          type="info"
          title="仅记录 Mock 事实，不发送邮件、Key 或生产调度指令。"
        />
        {error && <Alert type="error" title={error} />}
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={initial}
        >
          {action === 'assign' && (
            <>
              {field(
                'procurementOwnerId',
                '交接采购负责人',
                'select',
                users('Procurement'),
              )}
              {field('testerId', '交接测试负责人', 'select', users('Testing'))}
              {field(
                'operatorId',
                '交接运营负责人',
                'select',
                users('ProductOperations'),
              )}
            </>
          )}
          {action === 'acquire' && (
            <>
              {field(
                'procurementOwnerId',
                '原采购负责人',
                'select',
                users('Procurement'),
              )}
              {field('testerId', '测试负责人', 'select', users('Testing'))}
              {field(
                'operatorId',
                '配置与开放运营负责人',
                'select',
                users('ProductOperations'),
              )}
              {field(
                'demandId',
                '关联原采购需求',
                'select',
                options.demands.map((d) => ({ value: d.id, label: d.label })),
                false,
              )}
              {field('dueAt', '预计完成时间（ISO 时区）', 'text', [], false)}
              {field(
                'credentialRecipientId',
                '测试凭据授权接收人',
                'select',
                users('Testing'),
              )}
              {credentials}
            </>
          )}
          {action === 'resource' && (
            <>
              {field('platformModelId', '平台模型 ID（须沿用原关联）')}
              {field('upstreamModelName', '上游调用模型名')}
              {field('endpointReference', '非敏感 Endpoint 引用（仅 mock:）')}
              {field('ttftMs', '承诺 TTFT (ms)', 'number', [], false)}
              {field('rpm', '承诺 RPM', 'number', [], false)}
              {field('tpm', '承诺 TPM', 'number', [], false)}
              {field('concurrency', '承诺并发', 'number', [], false)}
              {credentials}
            </>
          )}
          {action === 'verify' && (
            <>
              {field('phase', '核验阶段', 'select', [
                { value: 'quality', label: '第一阶段质量测试' },
                { value: 'connectivity', label: '第二阶段平台接入测试' },
              ])}
              {field(
                'executionId',
                '实际测试执行',
                'select',
                detail.executions
                  .filter((e) => e.phase === (phase ?? 'quality'))
                  .map((e) => ({
                    value: e.id,
                    label: `${e.id} · ${e.result} · ${e.current ? '当前配置' : '旧配置'}`,
                  })),
              )}
              {metrics}
              {field('metering', '计量记录核验', 'select', status)}
              {field('billing', '计费核验', 'select', status)}
              {field(
                'conclusion',
                '阶段最终人工结论',
                'select',
                status.filter((v) => v.value !== 'pending'),
              )}
              {field('evidenceReference', '阶段报告安全引用（mock:）')}
            </>
          )}
          {action === 'contract' && (
            <>
              {field(
                'stage',
                '采购合同阶段',
                'select',
                Object.entries(contractLabels).map(([value, label]) => ({
                  value,
                  label,
                })),
              )}
              {field('number', '模拟合同编号')}
              {field('handler', '当前处理方')}
              {field('nextAction', '下一步合同动作')}
              {field(
                'nextOwnerId',
                '下一步责任人',
                'select',
                options.users
                  .filter((u) =>
                    ['Procurement', 'ProductOperations'].includes(u.role),
                  )
                  .map((u) => ({ value: u.id, label: u.name })),
              )}
              {field('dueAt', '合同预计完成（ISO 时区）', 'text', [], false)}
              {field(
                'effectiveAt',
                '电子合同生效时间（ISO 时区）',
                'text',
                [],
                false,
              )}
              {field('paperStatus', '纸质合同寄回', 'select', [
                { value: 'unknown', label: '未知' },
                { value: 'pending', label: '待寄回' },
                { value: 'returned', label: '已寄回' },
              ])}
            </>
          )}
          {action === 'configuration' && (
            <>
              {field('sent', '是否已发送生产凭据', 'select', [
                { value: true, label: '已发送（模拟）' },
                { value: false, label: '未发送' },
              ])}
              {field(
                'recipientId',
                '生产凭据指定接收人',
                'select',
                users('ProductOperations'),
              )}
              {field('received', '是否确认接收', 'select', [
                { value: true, label: '已确认接收' },
                { value: false, label: '未确认' },
              ])}
              {field('configured', '是否配置完成', 'select', [
                { value: true, label: '已配置完成（模拟）' },
                { value: false, label: '尚未完成' },
              ])}
              {field('reference', '生产凭据安全引用（仅 mock:）')}
            </>
          )}
          {action === 'dispatch' &&
            field(
              'state',
              '对客开放与调度状态',
              'select',
              Object.entries(dispatchLabels).map(([value, label]) => ({
                value,
                label,
              })),
            )}
          {action === 'feedback' && (
            <>
              {field(
                'executionId',
                '失败或核验异常执行',
                'select',
                detail.executions.map((e) => ({
                  value: e.id,
                  label: `${e.id} · ${e.result}`,
                })),
              )}
              {field(
                'remediationId',
                '对应原整改事项',
                'select',
                detail.remediations.map((r) => ({ value: r.id, label: r.id })),
              )}
              {field(
                'recipientId',
                '内部反馈接收人',
                'select',
                users().filter((u) =>
                  options.users.some(
                    (p) =>
                      p.id === u.value &&
                      ['ProductOperations', 'Testing'].includes(p.role),
                  ),
                ),
              )}
              {field('feedbackAt', '向供应商反馈时间（ISO 时区）')}
              {field('summary', '供应商沟通摘要（无敏感数据）', 'area')}
            </>
          )}
          {action === 'comment' && (
            <>
              {field('body', '内部技术评论（不填写凭据或采购价格）', 'area')}
              <Form.Item name="recipientIds" label="@ 授权同事">
                <Select mode="multiple" options={users()} />
              </Form.Item>
            </>
          )}
          {action === 'supplier-communication' && (
            <>
              {field('groupName', '供应商沟通微信群名称（模拟）')}
              {field('notes', '沟通备注（仅模拟非敏感信息）', 'area')}
            </>
          )}
          {field('reason', '本次交付操作说明', 'area')}
        </Form>
      </Modal>
    </Drawer>
  );
}
