import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Input,
  InputNumber,
  Modal,
  Result,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type { BulkBatchDetail } from '../../services/bulk-quotation-types';
import type { BulkDraftInput, BulkPreview } from '../../domain/bulk-quotations';
import type { QuoteInput } from '../../domain/quotations';
import { discountBps } from '../../domain/rules';
import { validityLabels as originalValidityLabels } from '../../domain/quotations';
import { quoteStatusLabels } from '../../domain/statuses';
import { PageHeader } from '../../components/PageHeader';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import {
  ResourceError,
  resourceErrorMessage,
} from '../../services/resource-types';
import { useResourceQuery } from '../models/use-resource-query';
import { displayDate, priceSpecText } from '../quotes/quote-format';
import { BulkItemEditor } from './BulkItemEditor';
import './bulk.css';
const validityLabels = { ...originalValidityLabels, invalid: '有效期异常' };
const draftInput = (d: BulkBatchDetail): BulkDraftInput => ({
  sourceReference: d.batch.sourceReference,
  sharedReason: d.batch.sharedReason,
  items: d.batch.items.map((i) => ({
    itemId: i.itemId,
    proposedQuoteInput: i.proposedQuoteInput,
  })),
});
export default function BulkQuotesPage() {
  const session = useOutletContext<DemoSession>();
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [supplierId, setSupplier] = useState<string>();
  const [status, setStatus] = useState<'draft' | 'submitted'>();
  const load = useCallback(
    async () => ({
      options: await session.api.bulkQuoteOptions(),
      list: batchId
        ? []
        : await session.api.queryBulkBatches({
            search,
            ...(supplierId ? { supplierId } : {}),
            ...(status ? { status } : {}),
          }),
      detail: batchId ? await session.api.getBulkBatch(batchId) : null,
    }),
    [session.api, batchId, search, supplierId, status],
  );
  const { result, reload } = useResourceQuery(load);
  const [create, setCreate] = useState(false);
  const [newSupplier, setNewSupplier] = useState<string>();
  const [source, setSource] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createRequest, setCreateRequest] = useState('');
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error')
    return <ErrorState message={result.message} onRetry={reload} />;
  if (batchId)
    return result.data.detail ? (
      <BulkDetail
        key={`${batchId}:${result.data.detail.batch.version}`}
        detail={result.data.detail}
        options={result.data.options}
        session={session}
        reload={reload}
      />
    ) : (
      <Result status="404" title="批次不存在或无完整授权" />
    );
  return (
    <>
      <PageHeader
        title="批量采购报价"
        group="业务协同"
        description="同供应商、多模型、多渠道报价集中录入；模拟数据，仅追加记录，不自动核验或正式确认。"
        actions={
          <Button
            type="primary"
            onClick={() => {
              setCreate(true);
              setError('');
              setCreateRequest(crypto.randomUUID());
            }}
          >
            创建报价批次
          </Button>
        }
      />
      <Card>
        <Space wrap>
          <Input
            aria-label="搜索报价批次"
            placeholder="搜索批次编号"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            aria-label="批次供应商筛选"
            placeholder="全部授权供应商"
            allowClear
            value={supplierId}
            onChange={setSupplier}
            options={result.data.options.suppliers.map((s) => ({
              value: s.id,
              label: s.name,
            }))}
          />
          <Select
            aria-label="批次状态筛选"
            placeholder="全部状态"
            allowClear
            value={status}
            onChange={setStatus}
            options={[
              { value: 'draft', label: '草稿' },
              { value: 'submitted', label: '已提交' },
            ]}
          />
          <Button onClick={reload}>刷新批次列表</Button>
        </Space>
        <Table
          rowKey="id"
          dataSource={[...result.data.list]}
          scroll={{ x: 1100 }}
          columns={[
            {
              title: '批次编号',
              render: (_, r) => (
                <Link to={`/procurement/bulk-quotes/${r.id}`}>{r.batchNo}</Link>
              ),
            },
            { title: '供应商', render: (_, r) => r.supplier.name },
            {
              title: '状态',
              render: (_, r) => (
                <Tag>{r.status === 'draft' ? '草稿' : '已提交'}</Tag>
              ),
            },
            { title: '行数', dataIndex: 'itemCount' },
            { title: '创建人', dataIndex: 'createdBy' },
            { title: '创建时间', dataIndex: 'createdAt', render: displayDate },
            { title: '最近修改', dataIndex: 'updatedAt', render: displayDate },
            {
              title: '提交时间',
              dataIndex: 'submittedAt',
              render: displayDate,
            },
          ]}
        />
      </Card>
      <Modal
        title="创建报价批次"
        open={create}
        confirmLoading={busy}
        okText="创建草稿"
        onCancel={() => setCreate(false)}
        onOk={async () => {
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            const d = await session.api.createBulkBatch(
              {
                supplierId: newSupplier ?? '',
                sourceReference: source,
                sharedReason: reason,
              },
              createRequest,
            );
            setCreate(false);
            navigate(`/procurement/bulk-quotes/${d.batch.id}`);
          } catch (e) {
            setError(resourceErrorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>授权供应商</label>
        <Select
          aria-label="创建批次供应商"
          style={{ width: '100%' }}
          value={newSupplier}
          onChange={setNewSupplier}
          options={result.data.options.suppliers.map((s) => ({
            value: s.id,
            label: s.name,
          }))}
        />
        <label htmlFor="bulk-source">共同来源模拟引用</label>
        <Input
          id="bulk-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="mock:evidence:bulk"
        />
        <label htmlFor="bulk-reason">共同说明</label>
        <Input.TextArea
          id="bulk-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error && <Alert type="error" title={error} />}
      </Modal>
    </>
  );
}
function BulkDetail({
  detail,
  options,
  session,
  reload,
}: {
  detail: BulkBatchDetail;
  options: Awaited<ReturnType<DemoSession['api']['bulkQuoteOptions']>>;
  session: DemoSession;
  reload: () => void;
}) {
  const b = detail.batch;
  const [input, setInput] = useState<BulkDraftInput>(() => draftInput(detail));
  const [edit, setEdit] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [ack, setAck] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [commonDiscount, setCommonDiscount] = useState<number | null>(null);
  const [commonSource, setCommonSource] = useState<QuoteInput['sourceType']>(
    'supplier_submission',
  );
  const [commonSubmitter, setCommonSubmitter] = useState('');
  const [addChannels, setAddChannels] = useState<string[]>([]);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const dirty = JSON.stringify(input) !== JSON.stringify(draftInput(detail));
  const change = (next: BulkDraftInput) => {
    setInput(next);
    setPreview(null);
    setRequestId(crypto.randomUUID());
  };
  useEffect(() => {
    const invalidate = () => {
      setPreview(null);
      setError('其他页面数据已变化，请刷新批次并重新校验。未保存输入仍保留。');
    };
    window.addEventListener('storage', invalidate);
    return () => window.removeEventListener('storage', invalidate);
  }, []);
  const act = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(resourceErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title={b.status === 'draft' ? '编辑报价批次' : '已提交报价批次'}
        group="业务协同"
        description={`${b.batchNo} · ${detail.supplier.name} · 版本 ${b.version}`}
        actions={
          <Space wrap>
            <Link to="/procurement/bulk-quotes">
              <Button>返回批次列表</Button>
            </Link>
            <Button onClick={reload}>刷新批次</Button>
          </Space>
        }
      />
      <Alert
        type="info"
        title="模拟采购记录；整批全有或全无。提交不等于核验、正式生效或实际结算。"
      />
      {error && <Alert type="error" showIcon title={error} />}
      <Card className="quote-section" title="批次信息">
        <Descriptions
          column={{ xs: 1, sm: 2 }}
          items={[
            { key: 'creator', label: '创建人', children: b.createdBy },
            {
              key: 'created',
              label: '创建时间',
              children: displayDate(b.createdAt),
            },
            {
              key: 'actor',
              label: '提交人',
              children: b.submittedBy ?? '尚未提交',
            },
            {
              key: 'submitted',
              label: '提交时间',
              children: displayDate(b.submittedAt),
            },
          ]}
        />
        {b.status === 'draft' ? (
          <>
            <label htmlFor="draft-source">共同来源模拟引用（行可覆盖）</label>
            <Input
              id="draft-source"
              value={input.sourceReference}
              onChange={(e) =>
                change({ ...input, sourceReference: e.target.value })
              }
            />
            <label htmlFor="draft-reason">共同说明（行可覆盖）</label>
            <Input.TextArea
              id="draft-reason"
              value={input.sharedReason}
              onChange={(e) =>
                change({ ...input, sharedReason: e.target.value })
              }
            />
          </>
        ) : (
          <>
            <p className="quote-wrap">来源：{b.sourceReference || '未提供'}</p>
            <p className="quote-wrap">说明：{b.sharedReason || '未提供'}</p>
          </>
        )}
      </Card>
      <Card
        title={b.status === 'draft' ? '报价行草稿' : '提交结果与报价映射'}
        className="quote-section"
      >
        {b.status === 'draft' && (
          <>
            <Space wrap className="bulk-toolbar">
              <Select
                mode="multiple"
                aria-label="批量添加渠道"
                placeholder="选择本供应商渠道，可重复添加"
                value={addChannels}
                onChange={setAddChannels}
                style={{ width: 280, maxWidth: '100%' }}
                options={options.quoteOptions.channels
                  .filter((c) => c.supplier.id === b.supplierId)
                  .map((c) => ({
                    value: c.channel.id,
                    label: `${c.model.name} · ${c.channel.displayName}`,
                  }))}
              />
              <Button
                onClick={() => {
                  change({
                    ...input,
                    items: [
                      ...input.items,
                      ...(addChannels.length ? addChannels : ['']).map(
                        (channelId) => ({
                          itemId: `item-${crypto.randomUUID()}`,
                          proposedQuoteInput: {
                            channelId,
                            priceStatus: 'reference' as const,
                            sourceType: 'supplier_submission' as const,
                          },
                        }),
                      ),
                    ],
                  });
                  setAddChannels([]);
                }}
              >
                添加报价行
              </Button>
            </Space>
            <Space wrap className="bulk-toolbar">
              <InputNumber
                aria-label="共同折扣基点"
                placeholder="共同折扣基点"
                value={commonDiscount}
                onChange={setCommonDiscount}
              />
              <Select
                aria-label="共同报价来源"
                value={commonSource}
                onChange={setCommonSource}
                options={[
                  { value: 'supplier_submission', label: '供应商报价' },
                  { value: 'contract', label: '合同依据' },
                  { value: 'promotion', label: '临时优惠' },
                  { value: 'correction', label: '历史更正' },
                ]}
              />
              <Input
                aria-label="共同提交人引用"
                placeholder="mock:供应商提交人引用"
                value={commonSubmitter}
                onChange={(e) => setCommonSubmitter(e.target.value)}
              />
              <Button
                onClick={() =>
                  change({
                    ...input,
                    items: input.items.map((i) =>
                      selected.includes(i.itemId)
                        ? {
                            ...i,
                            proposedQuoteInput: {
                              ...i.proposedQuoteInput,
                              ...(commonDiscount !== null
                                ? { discount: discountBps(commonDiscount) }
                                : {}),
                              sourceType: commonSource,
                              ...(commonSource === 'promotion'
                                ? { priceStatus: 'temporary' as const }
                                : {}),
                              ...(commonSubmitter
                                ? {
                                    supplierSubmitterReference: commonSubmitter,
                                  }
                                : {}),
                            },
                          }
                        : i,
                    ),
                  })
                }
                disabled={
                  !selected.length ||
                  (commonDiscount !== null &&
                    (!Number.isSafeInteger(commonDiscount) ||
                      commonDiscount < 0 ||
                      commonDiscount > 10000))
                }
              >
                填写选中行共同字段
              </Button>
            </Space>
          </>
        )}
        <Table
          rowKey="itemId"
          dataSource={[...input.items]}
          scroll={{ x: 1050 }}
          {...(b.status === 'draft'
            ? {
                rowSelection: {
                  selectedRowKeys: selected,
                  onChange: setSelected,
                },
              }
            : {})}
          pagination={false}
          columns={[
            {
              title: '行 / 稳定 ID',
              render: (_, r, i) => (
                <span className="quote-wrap">
                  {i + 1} · {r.itemId}
                </span>
              ),
              width: 155,
            },
            {
              title: '模型 / 渠道',
              render: (_, r) => {
                const c = options.quoteOptions.channels.find(
                  (c) => c.channel.id === r.proposedQuoteInput.channelId,
                );
                return c
                  ? `${c.model.name} · ${c.channel.displayName}`
                  : '未选择渠道';
              },
            },
            {
              title: '折扣 / 状态',
              render: (_, r) =>
                `${r.proposedQuoteInput.discount ?? '未知'} bps / ${r.proposedQuoteInput.priceStatus ? quoteStatusLabels[r.proposedQuoteInput.priceStatus] : '参考报价（默认）'}`,
            },
            {
              title: '参照报价',
              render: (_, r) =>
                r.proposedQuoteInput.previousQuoteId ?? '无参照，新记录',
            },
            {
              title: '操作 / 结果',
              render: (_, r) =>
                b.status === 'draft' ? (
                  <Space>
                    <Button onClick={() => setEdit(r.itemId)}>编辑行</Button>
                    <Button
                      danger
                      onClick={() =>
                        change({
                          ...input,
                          items: input.items.filter(
                            (i) => i.itemId !== r.itemId,
                          ),
                        })
                      }
                    >
                      删除草稿行
                    </Button>
                  </Space>
                ) : (
                  detail.submission?.mappings
                    .filter((m) => m.itemId === r.itemId)
                    .map((m) => (
                      <Link key={m.quoteId} to={`/quotes/${m.quoteId}`}>
                        查看报价 {m.quoteId}
                      </Link>
                    ))
                ),
            },
          ]}
        />
        {b.status === 'draft' && (
          <Space wrap className="bulk-toolbar">
            <Button
              type="primary"
              loading={busy}
              aria-label="保存草稿"
              onClick={() =>
                void act(async () => {
                  await session.api.updateBulkDraft(
                    b.id,
                    b.version,
                    input,
                    requestId,
                  );
                  reload();
                })
              }
            >
              保存草稿
            </Button>
            <Button
              disabled={dirty || busy}
              onClick={() =>
                void act(async () => {
                  setPreview(
                    await session.api.previewBulkBatch(b.id, b.version),
                  );
                  setRequestId(crypto.randomUUID());
                })
              }
            >
              预览校验
            </Button>
            {dirty && <span>有未保存修改，请先保存草稿</span>}
          </Space>
        )}
      </Card>
      {preview && (
        <Card title="逐行预览校验" className="quote-section">
          <p>
            查询时刻：{displayDate(preview.asOf)}
            。数字基点差仅供人工参考，不代表商业采购结论。
          </p>
          {preview.errors.map((e, i) => (
            <Alert key={i} type="error" title={`${e.field}：${e.message}`} />
          ))}
          {preview.rows.map((r) => (
            <section className="bulk-preview-row" key={r.itemId}>
              <h3>
                第 {r.rowNumber} 行 · {r.modelName} · {r.channelName}
              </h3>
              <p className="quote-wrap">
                参照：{r.prior?.id ?? '未选择历史参照'}；原折扣：
                {r.prior?.discount ?? '未知'}；新折扣：
                {r.input.discount ?? '未知'}；数字差：
                {r.numericDifferenceBps ?? '无参照'} bps（仅供人工参考）
              </p>
              <p>
                参照原状态：
                {r.priorRecordedStatus
                  ? quoteStatusLabels[r.priorRecordedStatus]
                  : '无参照'}
                ；参照当前状态：
                {r.prior ? quoteStatusLabels[r.prior.priceStatus] : '无参照'}
                ；确认依据：
                {r.prior?.confirmedAt ? '已有历史确认依据' : '无确认依据'}
                ；当前有效正式报价 {r.activeFormalCount} 条，不自动替换。
              </p>
              <p>
                新报价时间有效性：
                {r.proposedValidity
                  ? validityLabels[r.proposedValidity]
                  : '校验未通过，无法判断'}
              </p>
              <p>
                拟生效：{displayDate(r.input.effectiveFrom ?? null)}
                ；拟截止（不含）：{displayDate(r.input.effectiveUntil ?? null)}
              </p>
              {r.prior && (
                <p className="quote-wrap">
                  参照规格：{priceSpecText(r.prior.priceSpec)}；参照基准：
                  {r.prior.priceSpec.referencePriceSource ?? '未知'}；适用规格：
                  {r.prior.priceSpec.specification ?? '未知'}
                </p>
              )}
              <p className="quote-wrap">
                新基准：{r.input.priceSpec?.referencePriceSource ?? '未知'}
                ；适用规格：{r.input.priceSpec?.specification ?? '未知'}
              </p>
              <p className="quote-wrap">
                新价格规格：
                {r.input.priceSpec
                  ? priceSpecText(r.input.priceSpec)
                  : '未知，信息不足'}
              </p>
              {r.comparison ? (
                <div>
                  <p>
                    价格规格：
                    {r.comparison.specComparable ? '一致' : '不一致或信息不足'}
                    ；完整商业条件：
                    {r.comparison.comparable ? '可比较' : '不可直接比较'}
                  </p>
                  <p>
                    参照当前有效性：
                    {validityLabels[r.comparison.currentValidity.first]}
                    ；新报价时间有效性：
                    {validityLabels[r.comparison.currentValidity.second]}
                  </p>
                  {r.comparison.reasons.map((reason, i) => (
                    <p key={i}>{reason}</p>
                  ))}
                  <p>{r.comparison.procurementNotice}</p>
                </div>
              ) : (
                <p>无参照报价，未进行价格对比。</p>
              )}
              <p className="quote-wrap">
                证据：
                {r.input.evidenceReference || input.sourceReference || '未提供'}
                ；说明：{r.input.reason || input.sharedReason || '未提供'}
              </p>
              {r.errors.map((e, i) => (
                <Alert
                  key={`e${i}`}
                  type="error"
                  title={`阻断 · 第 ${r.rowNumber} 行 · ${e.field}：${e.message}`}
                />
              ))}
              {r.warnings.map((e, i) => (
                <Alert
                  key={`w${i}`}
                  type="warning"
                  title={`提示 · ${e.field}：${e.message}`}
                />
              ))}
            </section>
          ))}
          <Button
            type="primary"
            disabled={!preview.canSubmit || busy}
            onClick={() => {
              setConfirm(true);
              setAck(false);
            }}
          >
            提交整批报价
          </Button>
        </Card>
      )}
      <Card title="批次版本历史" className="quote-section">
        <Table
          rowKey="id"
          dataSource={[...detail.history]}
          scroll={{ x: 750 }}
          columns={[
            {
              title: '操作',
              render: (_, e) =>
                ({
                  created: '创建',
                  edited: '草稿编辑',
                  submitted: '整批提交',
                })[e.action],
            },
            { title: '操作人', dataIndex: 'actorUserId' },
            { title: '时间', dataIndex: 'occurredAt', render: displayDate },
            {
              title: '版本变化',
              render: (_, e) =>
                `${e.beforeVersion ?? '无'} → ${e.afterVersion}`,
            },
            { title: '原因', dataIndex: 'reason' },
          ]}
          expandable={{
            expandedRowRender: (e) => (
              <div className="quote-wrap">
                <p>
                  新增行：{e.addedItemIds.join('、') || '无'}；删除行：
                  {e.removedItemIds.join('、') || '无'}
                </p>
                {e.changes.map((c, i) => (
                  <p key={i}>
                    {c.itemId ?? '批次'} · {c.field}：{c.before ?? '空'} →{' '}
                    {c.after ?? '空'}
                  </p>
                ))}
              </div>
            ),
          }}
        />
      </Card>
      <Space wrap>
        <Link to="/quotes">采购报价台账</Link>
        <Link to="/analytics/procurement">采购价格分析</Link>
      </Space>
      {edit && (
        <BulkItemEditor
          key={edit}
          input={input.items.find((i) => i.itemId === edit)!.proposedQuoteInput}
          options={options.quoteOptions}
          supplierId={b.supplierId}
          onClose={() => setEdit(null)}
          onSave={(v) => {
            change({
              ...input,
              items: input.items.map((i) =>
                i.itemId === edit ? { ...i, proposedQuoteInput: v } : i,
              ),
            });
            setEdit(null);
          }}
        />
      )}
      <Modal
        title="确认整批提交模拟报价"
        cancelButtonProps={{ 'aria-label': '取消' }}
        open={confirm}
        confirmLoading={busy}
        okText="确认追加整批报价"
        onCancel={() => setConfirm(false)}
        onOk={() =>
          void act(async () => {
            if (!ack) throw new Error('请勾选确认说明');
            if (!preview)
              throw new ResourceError('预览已失效，请刷新批次并重新校验。');
            await session.api.submitBulkBatch(
              b.id,
              b.version,
              preview.token,
              ack,
              requestId,
            );
            setConfirm(false);
            reload();
          })
        }
      >
        <p>
          全部 {input.items.length}{' '}
          行一次追加，不修改任何旧正式报价。不会自动核验或正式确认，也不会决定结算价。
        </p>
        <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)}>
          我确认这是模拟记录，并已核对所有报价行
        </Checkbox>
        {error && <Alert type="error" title={error} />}
      </Modal>
    </>
  );
}
