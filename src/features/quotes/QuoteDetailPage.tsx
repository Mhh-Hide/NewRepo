import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Input,
  Modal,
  Result,
  Space,
  Table,
  Tag,
} from 'antd';
import {
  Link,
  useOutletContext,
  useParams,
  useNavigate,
} from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import { quoteStatusLabels } from '../../domain/statuses';
import { quoteSourceLabels, validityLabels } from '../../domain/quotations';
import type { QuoteAudit } from '../../domain/quotations';
import { PageHeader } from '../../components/PageHeader';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { resourceErrorMessage } from '../../services/resource-types';
import { useResourceQuery } from '../models/use-resource-query';
import { QuoteEditor } from './QuoteEditor';
import { QuoteTable } from './QuoteTable';
import {
  displayDate,
  dateISO,
  priceSpecText,
  quoteDiscount,
} from './quote-format';
export default function QuoteDetailPage() {
  const session = useOutletContext<DemoSession>();
  const navigate = useNavigate();
  const { quoteId = '' } = useParams<{ quoteId: string }>();
  const load = useCallback(
    () => session.api.getQuote(quoteId),
    [session.api, quoteId],
  );
  const { result, reload } = useResourceQuery(load);
  const [editor, setEditor] = useState<'correct' | 'next' | null>(null);
  const [decision, setDecision] = useState<'verify' | 'confirm' | null>(null);
  const [ref, setRef] = useState('');
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState('');
  const [ack, setAck] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const header = (
    <PageHeader
      title="采购报价详情"
      description="查看来源、证据、有效期和价格版本；不会计算唯一当前结算价。"
      group="业务协同"
      actions={
        <Space wrap>
          <Link to="/quotes">
            <Button>返回报价台账</Button>
          </Link>
          <Button onClick={reload}>刷新报价详情</Button>
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
        <Result status="404" title="报价不存在或无权访问" />
      </>
    );
  const { row, decisions, history, channelHistory } = result.data;
  const q = row.quote;
  const open = (kind: typeof decision) => {
    setDecision(kind);
    setRef('');
    setReason('');
    setFrom('');
    setAck(false);
    setError('');
    setRequestId(crypto.randomUUID());
  };
  const save = async () => {
    if (busy) return;
    if (decision === 'confirm' && !ack) {
      setError('请明确确认本操作仅为 Demo，不代表真实合同签署。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (decision === 'verify')
        await session.api.verifyQuote(
          q.id,
          row.version,
          ref,
          reason,
          requestId,
        );
      else
        await session.api.confirmQuote(
          q.id,
          row.version,
          ref,
          dateISO(from) ?? '',
          reason,
          requestId,
        );
      setDecision(null);
      reload();
    } catch (e) {
      setError(resourceErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const fieldLabels: Readonly<Record<string, string>> = {
    discount: '报价折扣（基点）',
    previousQuoteId: '前序报价',
    verification: '来源核验',
    priceStatus: '报价状态',
    effectiveFrom: '生效时间',
  };
  return (
    <>
      {header}
      <Alert
        type="info"
        showIcon
        title="Demo 确认不代表真实合同已经签署；参考、正式和临时优惠分别保留。"
      />
      <Card
        title={`${row.model.name} · ${row.supplier.name}`}
        className="quote-section"
        extra={
          <Space wrap>
            {session.permits('quote:verify') && (
              <Button disabled={row.verified} onClick={() => open('verify')}>
                核验报价来源
              </Button>
            )}
            {session.permits('quote:confirm') && (
              <Button
                type="primary"
                disabled={
                  !row.verified ||
                  !['reference', 'pending_contract'].includes(q.priceStatus) ||
                  row.validity === 'expired'
                }
                onClick={() => open('confirm')}
              >
                模拟正式确认
              </Button>
            )}
            {session.permits('quote:create') && (
              <Button onClick={() => setEditor('next')}>录入后续报价</Button>
            )}
            {session.permits('quote:correct') && (
              <Button onClick={() => setEditor('correct')}>更正历史报价</Button>
            )}
          </Space>
        }
      >
        <Descriptions
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            { key: 'quote', label: '报价记录 ID', children: q.id },
            {
              key: 'channel',
              label: '关联渠道',
              children: (
                <Link to={`/channels/${q.channelId}`}>
                  {row.channel.displayName}
                </Link>
              ),
            },
            {
              key: 'discount',
              label: '上游实际报价折扣',
              children: quoteDiscount(q),
            },
            {
              key: 'status',
              label: '报价状态',
              children: <Tag>{quoteStatusLabels[q.priceStatus]}</Tag>,
            },
            {
              key: 'original-status',
              label: '原录入状态（历史保留）',
              children: quoteStatusLabels[row.storedPriceStatus],
            },
            {
              key: 'validity',
              label: '时间有效性',
              children: validityLabels[row.validity],
            },
            {
              key: 'verify',
              label: '来源核验',
              children: row.verified ? '已独立核验' : '未记录独立核验',
            },
            {
              key: 'source',
              label: '原始报价来源',
              children: quoteSourceLabels[q.sourceType],
            },
            {
              key: 'supplierActor',
              label: '供应商原始提交人引用',
              children: q.supplierSubmitterReference ?? '历史未提供',
            },
            { key: 'submitter', label: '系统提交人', children: q.submittedBy },
            {
              key: 'recorder',
              label: '录入人',
              children: q.recordedBy ?? '历史未提供',
            },
            {
              key: 'quoted',
              label: '供应商报价时间',
              children: displayDate(q.supplierQuotedAt),
            },
            {
              key: 'created',
              label: '记录创建时间',
              children: displayDate(q.createdAt),
            },
            {
              key: 'from',
              label: '生效时间',
              children: displayDate(q.effectiveFrom),
            },
            {
              key: 'until',
              label: '截止时间（不含）',
              children: displayDate(q.effectiveUntil),
            },
            {
              key: 'evidence',
              label: '当前依据引用',
              children: (
                <span className="quote-wrap">
                  {q.evidenceReference ?? '未提供'}
                </span>
              ),
            },
            {
              key: 'confirmedBy',
              label: '模拟正式确认人',
              children: q.confirmedBy ?? '未确认',
            },
            {
              key: 'confirmedAt',
              label: '正式确认时间',
              children: displayDate(q.confirmedAt),
            },
            {
              key: 'prior',
              label: '前序报价',
              children: q.previousQuoteId ? (
                <Link to={`/quotes/${q.previousQuoteId}`}>
                  {q.previousQuoteId}
                </Link>
              ) : (
                '无前序'
              ),
            },
            {
              key: 'inquiry',
              label: '询价关联',
              children: q.inquiryId ?? '日常报价，无询价关联',
            },
            {
              key: 'demand',
              label: '采购需求关联',
              children: q.demandId ? (
                <Link to={`/sourcing/${q.demandId}`}>查看关联采购需求</Link>
              ) : (
                '日常报价，无需求关联'
              ),
            },
            { key: 'version', label: '操作版本', children: row.version },
          ]}
        />
        <p className="quote-wrap">来源说明：{q.reason}</p>
        <div className="quote-comparison">
          <strong>价格口径与可选绝对单价</strong>
          <p>{priceSpecText(q.priceSpec)}</p>
          <p>
            价格基准：
            {q.priceSpec.referencePriceSource ?? '未提供，不能直接比较'}
          </p>
          <p>适用规格：{q.priceSpec.specification ?? '未提供，不能直接比较'}</p>
          <small>
            十进制金额最多六位小数；不同币种、计量维度/数量/单位及基准不能混合比较。
          </small>
        </div>
      </Card>
      <Card title="来源核验与正式确认记录" className="quote-section">
        <Table
          rowKey="id"
          size="small"
          dataSource={[...decisions]}
          scroll={{ x: 800 }}
          pagination={{ pageSize: 5 }}
          columns={[
            {
              title: '动作',
              render: (_, e) =>
                e.kind === 'verify' ? '独立来源核验' : '模拟正式确认',
            },
            { title: '操作人', dataIndex: 'actorUserId' },
            { title: '时间', dataIndex: 'occurredAt', render: displayDate },
            { title: '证据模拟引用', dataIndex: 'evidenceReference' },
            { title: '说明', dataIndex: 'reason' },
          ]}
          locale={{
            emptyText: '暂无独立核验或确认记录；历史原有确认字段已保留',
          }}
        />
      </Card>
      <Card title="同渠道报价版本历史" className="quote-section">
        <p className="section-note">
          每条都是独立历史记录，前序链接区分真实后续报价与录入纠错，不覆盖原值。正式与临时优惠没有自动优先级。
        </p>
        <QuoteTable rows={channelHistory} />
      </Card>
      <Card title="本记录操作审计" className="quote-section">
        <Table<QuoteAudit>
          rowKey="id"
          size="small"
          dataSource={[...history]}
          scroll={{ x: 800 }}
          pagination={{ pageSize: 5 }}
          columns={[
            {
              title: '操作',
              render: (_, e) =>
                ({
                  recorded: '录入报价',
                  corrected: '录入历史更正',
                  verified: '来源核验',
                  confirmed: '模拟正式确认',
                })[e.action] ?? '报价记录',
            },
            { title: '操作人', dataIndex: 'actorUserId' },
            { title: '时间', dataIndex: 'occurredAt', render: displayDate },
            { title: '原因', dataIndex: 'reason' },
          ]}
          expandable={{
            expandedRowRender: (e) => (
              <div className="quote-wrap">
                {e.changes.map((c, i) => (
                  <p key={i}>
                    {fieldLabels[c.field] ?? '报价资料'}：{c.before ?? '—'} →{' '}
                    {c.after ?? '—'}
                  </p>
                ))}
              </div>
            ),
          }}
          locale={{ emptyText: '历史未提供本期独立审计' }}
        />
      </Card>
      {editor && (
        <QuoteEditor
          session={session}
          prior={row}
          correction={editor === 'correct'}
          onClose={() => setEditor(null)}
          onSaved={(id) => {
            setEditor(null);
            navigate(`/quotes/${id}`);
          }}
        />
      )}
      <Modal
        title={decision === 'verify' ? '核验报价来源' : '模拟正式确认'}
        open={decision !== null}
        confirmLoading={busy}
        okText={decision === 'verify' ? '确认来源核验' : '确认模拟正式生效'}
        onCancel={() => setDecision(null)}
        onOk={() => void save()}
      >
        <Alert type="warning" title="Demo 确认不代表真实合同已经签署" />
        <label htmlFor="quote-evidence">核验或确认依据模拟引用</label>
        <Input
          id="quote-evidence"
          value={ref}
          placeholder="mock:evidence:confirmation"
          onChange={(e) => setRef(e.target.value)}
        />
        {decision === 'confirm' && (
          <>
            <label htmlFor="formal-from">正式生效日期（北京时间00:00）</label>
            <Input
              id="formal-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </>
        )}
        <label htmlFor="decision-reason">核验或确认说明</label>
        <Input.TextArea
          id="decision-reason"
          rows={3}
          value={reason}
          maxLength={2000}
          onChange={(e) => setReason(e.target.value)}
        />
        {decision === 'confirm' && (
          <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)}>
            我确认这是模拟动作，不代表真实合同签署
          </Checkbox>
        )}
        {error && <Alert type="error" title={error} />}
      </Modal>
    </>
  );
}
