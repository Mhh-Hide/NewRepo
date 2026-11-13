import { RelatedQuotes } from '../quotes/RelatedQuotes';
import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  Modal,
  Result,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type {
  CandidateView,
  SourcingItemDetail,
} from '../../services/sourcing-types';
import type { ManagedMatch, SourcingEvent } from '../../domain/sourcing';
import {
  priorityLabels,
  matchStatusLabels,
  coverageLabels,
  fitLabels,
} from '../../domain/sourcing';
import { sourcingStatusLabels, channelTypeLabels } from '../../domain/statuses';
import type { SourcingStatus } from '../../domain/statuses';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { useResourceQuery } from '../models/use-resource-query';
import { resourceErrorMessage } from '../../services/resource-types';
import { formatCapacity } from '../channels/format-capacity';
import { SourcingEditor } from './SourcingEditor';
import { CandidatePicker } from './CandidatePicker';
import { sourcingActionLabels, sourcingFieldLabels } from './labels';
export default function SourcingDetailPage() {
  const session = useOutletContext<DemoSession>();
  const { demandId = '' } = useParams<{ demandId: string }>();
  const load = useCallback(
    () => session.api.getSourcingDemand(demandId),
    [session.api, demandId],
  );
  const { result, reload } = useResourceQuery(load);
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState<SourcingItemDetail | null>(null);
  const [match, setMatch] = useState<ManagedMatch | null>(null);
  const [status, setStatus] =
    useState<ManagedMatch['matchStatus']>('candidate');
  const [assessment, setAssessment] = useState('');
  const [progress, setProgress] = useState(false);
  const [nextStatus, setNextStatus] = useState<SourcingStatus>('sourcing');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const header = (
    <PageHeader
      title="采购需求详情"
      description="按模型明细跟踪候选渠道与供应商覆盖；所有展示均为模拟数据。"
      group="业务协同"
      actions={
        <Space wrap>
          <Link to="/sourcing">
            <Button>返回采购寻源</Button>
          </Link>
          <Button onClick={reload}>刷新需求</Button>
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
  if (!result.data)
    return (
      <>
        {header}
        <Result status="404" title="需求不存在或无权访问" />
      </>
    );
  const d = result.data;
  const master = d.demand;
  const apply = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operation();
      setMatch(null);
      setProgress(false);
      reload();
    } catch (e) {
      setError(resourceErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const historyValue = (
    field: string,
    value: string | number | boolean | null,
  ) =>
    value === null
      ? '—'
      : field === 'status'
        ? (sourcingStatusLabels[value as SourcingStatus] ?? String(value))
        : field === 'matchStatus'
          ? (matchStatusLabels[value as ManagedMatch['matchStatus']] ??
            String(value))
          : field === 'priority'
            ? (priorityLabels[value as keyof typeof priorityLabels] ??
              String(value))
            : String(value);
  return (
    <>
      {header}
      <Card
        title={master.title}
        extra={
          <Space wrap>
            {d.canEdit && (
              <Button onClick={() => setEditing(true)}>维护需求资料</Button>
            )}
            {d.canProgress && (
              <Button
                onClick={() => {
                  setError('');
                  setNote('');
                  setNextStatus(d.transitions[0] ?? 'sourcing');
                  setProgress(true);
                }}
              >
                更新寻源进度
              </Button>
            )}
          </Space>
        }
      >
        <Descriptions
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            { key: 'code', label: '需求编号', children: master.demandCode },
            {
              key: 'status',
              label: '寻源状态',
              children: (
                <StatusBadge label={sourcingStatusLabels[master.status]} />
              ),
            },
            {
              key: 'priority',
              label: '优先级',
              children: priorityLabels[master.priority],
            },
            { key: 'creator', label: '创建人', children: master.createdBy },
            {
              key: 'created',
              label: '创建时间',
              children: new Date(master.createdAt).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
              }),
            },
            {
              key: 'due',
              label: '预计完成',
              children: master.dueAt ?? '未指定',
            },
            {
              key: 'updated',
              label: '最近更新',
              children: new Date(master.updatedAt).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
              }),
            },
            { key: 'version', label: '资料版本', children: master.version },
            ...(Object.hasOwn(master, 'customerId')
              ? [
                  {
                    key: 'customer',
                    label: '客户关联（运营受限）',
                    children:
                      master.customer?.name ?? '内部资源优化，无客户关联',
                  },
                ]
              : []),
          ]}
        />
        {Object.hasOwn(master, 'customerId') && (
          <Alert
            type="info"
            title="运营受限说明"
            description={master.description || '未填写'}
            style={{ marginTop: 16 }}
          />
        )}
        <p className="sourcing-shared-title">
          采购共享标题：{master.sharedTitle}
        </p>
        <p className="sourcing-copy">{master.sharedSummary}</p>
      </Card>
      <div className="sourcing-item-heading">
        <h2>模型需求明细</h2>
        <Tag>{d.items.length} 条当前授权明细</Tag>
      </div>
      <p className="section-note">
        候选数不等于供应商家数。初步符合按人工判断、当前启用且无明确能力不符的供应商去重；信息不足仍需核实，不代表最终采购或测试结论。
      </p>
      {d.items.map((item, index) => (
        <Card
          key={item.item.id}
          className="sourcing-item"
          data-testid={`sourcing-item-${index + 1}`}
          title={`${index + 1}. ${item.model.name}`}
          extra={
            d.canMatch ? (
              <Button onClick={() => setPicker(item)}>选择候选渠道</Button>
            ) : null
          }
        >
          <Descriptions
            column={{ xs: 1, sm: 2, lg: 4 }}
            items={[
              {
                key: 'item-status',
                label: '明细寻源状态',
                children: (
                  <StatusBadge label={sourcingStatusLabels[item.item.status]} />
                ),
              },
              {
                key: 'vendor',
                label: '模型厂商',
                children: item.vendor.name,
              },
              {
                key: 'discount',
                label: '目标采购折扣',
                children: `${item.item.targetPurchaseDiscount} 基点（${item.item.targetPurchaseDiscount / 1000} 折）`,
              },
              {
                key: 'priority',
                label: '明细优先级',
                children: priorityLabels[item.item.priority],
              },
              {
                key: 'region',
                label: '地区或部署限制',
                children: item.item.requiredRegion || '未明确',
              },
              {
                key: 'tpm',
                label: 'TPM 需求',
                children: formatCapacity(item.item.requiredTpm),
              },
              {
                key: 'rpm',
                label: 'RPM 需求',
                children: formatCapacity(item.item.requiredRpm),
              },
              {
                key: 'concurrency',
                label: '并发需求',
                children: formatCapacity(item.item.requiredConcurrency),
              },
              {
                key: 'ttft',
                label: 'TTFT 需求上限 (ms)',
                children: formatCapacity(item.item.requiredTtftMs),
              },
            ]}
          />
          <div
            className="sourcing-coverage"
            aria-label={`明细 ${index + 1} 资源覆盖`}
          >
            <span>
              候选渠道{' '}
              <strong data-testid="coverage-candidates">
                {item.coverage.candidates}
              </strong>
            </span>
            <span>
              不同供应商{' '}
              <strong data-testid="coverage-suppliers">
                {item.coverage.suppliers}
              </strong>
            </span>
            <span>
              人工初步符合{' '}
              <strong data-testid="coverage-suitable">
                {item.coverage.suitableSuppliers}
              </strong>
            </span>
            <span>
              距三家差额{' '}
              <strong data-testid="coverage-missing">
                {item.coverage.missing}
              </strong>
            </span>
            <Tag
              color={
                item.coverage.phase === 'covered' ? 'success' : 'processing'
              }
            >
              {coverageLabels[item.coverage.phase]}
            </Tag>
          </div>
          <Table<CandidateView>
            rowKey={(r) => r.match.id}
            size="small"
            dataSource={[...item.candidates]}
            scroll={{ x: 1700 }}
            pagination={{ pageSize: 5 }}
            columns={[
              {
                title: '候选渠道 / 供应商',
                width: 240,
                render: (_, r) => (
                  <div>
                    <Link to={`/channels/${r.channel.id}`}>
                      {r.channel.displayName}
                    </Link>
                    <small className="resource-subtitle">
                      <Link
                        to={`/quotes?tab=inquiries&channelId=${encodeURIComponent(r.channel.id)}&demandId=${encodeURIComponent(master.id)}&demandItemId=${encodeURIComponent(item.item.id)}`}
                      >
                        发起或查看相关渠道询价
                      </Link>
                    </small>
                    <small className="resource-subtitle">
                      {r.supplier.name} ·{' '}
                      {channelTypeLabels[r.channel.channelType]}
                    </small>
                  </div>
                ),
              },
              {
                title: '现有能力',
                width: 260,
                render: (_, r) => (
                  <div>
                    TPM {formatCapacity(r.channel.tpm)} · RPM{' '}
                    {formatCapacity(r.channel.rpm)}
                    <small className="resource-subtitle">
                      并发 {formatCapacity(r.channel.concurrencyLimit)} · TTFT{' '}
                      {formatCapacity(r.channel.ttftMs)} ms
                    </small>
                  </div>
                ),
              },
              {
                title: '资源主档',
                width: 100,
                render: (_, r) => (
                  <StatusBadge
                    label={
                      r.channel.resourceStatus === 'enabled' ? '启用' : '停用'
                    }
                  />
                ),
              },
              {
                title: '人工匹配状态',
                width: 130,
                render: (_, r) => (
                  <StatusBadge label={matchStatusLabels[r.match.matchStatus]} />
                ),
              },
              {
                title: '当前能力辅助判断',
                width: 230,
                render: (_, r) => (
                  <div>
                    {fitLabels[r.fit.result]}
                    <small className="resource-subtitle">
                      {r.fit.reasons.join('；')}
                    </small>
                  </div>
                ),
              },
              {
                title: '共享判断依据',
                width: 300,
                render: (_, r) => (
                  <span className="sourcing-copy">{r.match.assessment}</span>
                ),
              },
              {
                title: '录入时间',
                width: 180,
                render: (_, r) =>
                  new Date(r.match.createdAt).toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                  }),
              },
              ...(d.canMatch
                ? [
                    {
                      title: '操作',
                      fixed: 'right' as const,
                      width: 110,
                      render: (_: unknown, r: CandidateView) => (
                        <Button
                          size="small"
                          onClick={() => {
                            setMatch(r.match);
                            setStatus(r.match.matchStatus);
                            setAssessment(r.match.assessment);
                            setError('');
                          }}
                        >
                          修改匹配状态
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
            locale={{ emptyText: '尚未添加候选；不表示已调查后确认资源不足。' }}
          />
          {session.permits('quote:read') && (
            <RelatedQuotes
              session={session}
              demandId={master.id}
              demandItemId={item.item.id}
              target={item.item.targetPurchaseDiscount}
            />
          )}
        </Card>
      ))}
      <Card title="寻源跟进记录" className="sourcing-item">
        <Table<SourcingEvent>
          size="small"
          rowKey="id"
          dataSource={[...d.history].reverse()}
          scroll={{ x: 850 }}
          pagination={{ pageSize: 8 }}
          columns={[
            {
              title: '时间',
              dataIndex: 'occurredAt',
              width: 180,
              render: (v: string) =>
                new Date(v).toLocaleString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                }),
            },
            { title: '操作人', dataIndex: 'actorUserId', width: 120 },
            {
              title: '操作',
              width: 160,
              render: (_, e) => sourcingActionLabels[e.action],
            },
            { title: '跟进说明', dataIndex: 'note' },
          ]}
          expandable={{
            expandedRowRender: (e) => (
              <div className="sourcing-copy">
                {e.changes.map((c, i) => (
                  <p key={i}>
                    <strong>
                      {sourcingFieldLabels[c.field] ?? '需求资料'}
                    </strong>
                    ：{historyValue(c.field, c.before)} →{' '}
                    {historyValue(c.field, c.after)}
                  </p>
                ))}
              </div>
            ),
          }}
          locale={{ emptyText: '暂无新增跟进记录' }}
        />
      </Card>
      {editing && (
        <SourcingEditor
          session={session}
          initial={d}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
      {picker && (
        <CandidatePicker
          session={session}
          detail={d}
          item={picker}
          onClose={() => setPicker(null)}
          onSaved={() => {
            setPicker(null);
            reload();
          }}
        />
      )}
      <Modal
        title="修改候选匹配状态"
        open={match !== null}
        confirmLoading={busy}
        okText="保存匹配判断"
        onCancel={() => setMatch(null)}
        onOk={() =>
          void apply(() =>
            session.api.updateSourcingCandidate(
              master.id,
              master.version,
              match!.id,
              status,
              assessment,
            ),
          )
        }
      >
        <Alert type="info" title="人工判断不替代测试和采购决策" />
        <label htmlFor="match-status">候选匹配状态</label>
        <Select
          id="match-status"
          aria-label="候选匹配状态"
          style={{ width: '100%', marginBottom: 16 }}
          value={status}
          options={Object.entries(matchStatusLabels).map(([value, label]) => ({
            value,
            label,
          }))}
          onChange={setStatus}
        />
        <label htmlFor="match-assessment">共享匹配依据</label>
        <Input.TextArea
          id="match-assessment"
          value={assessment}
          maxLength={2000}
          rows={3}
          onChange={(e) => setAssessment(e.target.value)}
        />
        {error && <Alert type="error" title={error} />}
      </Modal>
      <Modal
        title="更新寻源进度"
        open={progress}
        confirmLoading={busy}
        okText="确认进度变更"
        onCancel={() => setProgress(false)}
        onOk={() =>
          void apply(() =>
            session.api.progressSourcing(
              master.id,
              master.version,
              nextStatus,
              note,
            ),
          )
        }
      >
        <p>
          状态由人工明确更新；不代表正式采购完成，不改变合同或
          OP。资源缺口状态表示已人工调查确认不足。
        </p>
        <Select
          aria-label="新的寻源状态"
          style={{ width: '100%', marginBottom: 16 }}
          value={nextStatus}
          options={d.transitions.map((value) => ({
            value,
            label: sourcingStatusLabels[value],
          }))}
          onChange={setNextStatus}
        />
        <label htmlFor="progress-note">共享跟进说明（不含客户信息）</label>
        <Input.TextArea
          id="progress-note"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <Alert type="error" title={error} />}
      </Modal>
    </>
  );
}
