import { useCallback, useState } from 'react';
import { Alert, Button, Drawer, Input, InputNumber, Select, Table } from 'antd';
import type { DemoSession } from '../../services/demo-session';
import type {
  SourcingDetail,
  SourcingItemDetail,
  CandidateView,
} from '../../services/sourcing-types';
import {
  channelTypeLabels,
  qualityStatusLabels,
  connectivityStatusLabels,
  integrationStatusLabels,
  availabilityStatusLabels,
} from '../../domain/statuses';
import { fitLabels } from '../../domain/sourcing';
import { useResourceQuery } from '../models/use-resource-query';
import { resourceErrorMessage } from '../../services/resource-types';
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/FeedbackStates';
import { formatCapacity } from '../channels/format-capacity';
type Row = Omit<CandidateView, 'match'>;
const dictionaries = {
  channelType: channelTypeLabels,
  resourceStatus: { enabled: '启用', disabled: '停用' },
  qualityStatus: qualityStatusLabels,
  connectivityStatus: connectivityStatusLabels,
  integrationStatus: integrationStatusLabels,
  availabilityStatus: availabilityStatusLabels,
};
export function CandidatePicker({
  session,
  detail,
  item,
  onClose,
  onSaved,
}: {
  session: DemoSession;
  detail: SourcingDetail;
  item: SourcingItemDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () => session.api.sourcingCandidates(detail.demand.id, item.item.id),
    [session.api, detail.demand.id, item.item.id],
  );
  const { result, reload } = useResourceQuery(load);
  const add = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await session.api.addSourcingCandidate(
        detail.demand.id,
        detail.demand.version,
        item.item.id,
        id,
        note,
      );
      onSaved();
    } catch (e) {
      setError(resourceErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const filter = (k: string, v: string) =>
    setFilters((f) => ({ ...f, [k]: v }));
  const rows =
    result.status === 'ready'
      ? result.data.filter(
          (r) =>
            (!filters.supplier || r.supplier.id === filters.supplier) &&
            Object.keys(dictionaries).every(
              (k) =>
                !filters[k] ||
                r.channel[k as keyof typeof r.channel] === filters[k],
            ) &&
            (['tpm', 'rpm', 'concurrencyLimit', 'ttftMs'] as const).every(
              (k) =>
                !filters[k] ||
                (r.channel[k] !== null &&
                  (k === 'ttftMs'
                    ? r.channel[k] <= Number(filters[k])
                    : r.channel[k] >= Number(filters[k]))),
            ),
        )
      : [];
  const suppliers =
    result.status === 'ready'
      ? [
          ...new Map(
            result.data.map((r) => [r.supplier.id, r.supplier]),
          ).values(),
        ]
      : [];
  return (
    <Drawer
      title={`选择候选渠道 · ${item.model.name}`}
      size={1100}
      open
      onClose={onClose}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        title="辅助判断不代表测试通过或采购完成"
        description="未知能力不会自动判断满足；人工初步符合仍需依据。一次添加一条关系，可继续添加同供应商多条渠道。"
      />
      <p>
        目标：TPM {formatCapacity(item.item.requiredTpm)} · RPM{' '}
        {formatCapacity(item.item.requiredRpm)} · 并发{' '}
        {formatCapacity(item.item.requiredConcurrency)} · TTFT ≤{' '}
        {formatCapacity(item.item.requiredTtftMs)} ms
      </p>
      <div className="resource-filters">
        <Select
          aria-label="候选供应商筛选"
          value={filters.supplier ?? ''}
          options={[
            { value: '', label: '全部供应商' },
            ...suppliers.map((s) => ({ value: s.id, label: s.name })),
          ]}
          onChange={(v) => filter('supplier', v)}
        />
        {Object.entries(dictionaries).map(([key, labels], i) => (
          <Select
            key={key}
            aria-label={`候选${['渠道类型', '资源状态', '质量测试', '连通性', '接入', '开放'][i]}`}
            value={filters[key] ?? ''}
            options={[
              {
                value: '',
                label: `全部${['渠道类型', '资源状态', '质量测试', '连通性', '接入', '开放'][i]}`,
              },
              ...Object.entries(labels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            onChange={(v) => filter(key, v)}
          />
        ))}
        {(['tpm', 'rpm', 'concurrencyLimit', 'ttftMs'] as const).map(
          (key, i) => (
            <InputNumber
              key={key}
              aria-label={`候选${['最低TPM', '最低RPM', '最低并发', '最高TTFT'][i]}`}
              min={0}
              placeholder={
                ['最低 TPM', '最低 RPM', '最低并发', '最高 TTFT (ms)'][i]
              }
              value={filters[key] ? Number(filters[key]) : null}
              onChange={(v) => filter(key, v === null ? '' : String(v))}
            />
          ),
        )}
        <Button onClick={() => setFilters({})}>重置候选筛选</Button>
      </div>
      <label htmlFor="candidate-note">
        共享候选说明（不得含客户身份或售价）
      </label>
      <Input.TextArea
        id="candidate-note"
        rows={2}
        value={note}
        maxLength={2000}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <Alert type="error" title={error} style={{ marginTop: 12 }} />}
      {result.status === 'loading' ? (
        <LoadingState />
      ) : result.status === 'error' ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : (
        <Table<Row>
          rowKey={(r) => r.channel.id}
          size="small"
          dataSource={rows}
          pagination={{ pageSize: 5 }}
          scroll={{ x: 1800 }}
          columns={[
            {
              title: '渠道 / 供应商',
              width: 230,
              render: (_, r) => (
                <div>
                  {r.channel.displayName}
                  <small className="resource-subtitle">{r.supplier.name}</small>
                </div>
              ),
            },
            {
              title: '类型',
              width: 140,
              render: (_, r) => channelTypeLabels[r.channel.channelType],
            },
            ...(['tpm', 'rpm', 'concurrencyLimit', 'ttftMs'] as const).map(
              (key, i) => ({
                title: ['TPM', 'RPM', '并发', 'TTFT (ms)'][i],
                width: 100,
                render: (_: unknown, r: Row) => formatCapacity(r.channel[key]),
              }),
            ),
            ...(
              [
                'resourceStatus',
                'qualityStatus',
                'connectivityStatus',
                'integrationStatus',
                'availabilityStatus',
              ] as const
            ).map((key, i) => ({
              title: ['资源', '质量', '连通', '接入', '开放'][i],
              width: 130,
              render: (_: unknown, r: Row) =>
                (dictionaries[key] as Record<string, string>)[r.channel[key]],
            })),
            {
              title: '能力辅助判断',
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
              title: '操作',
              fixed: 'right',
              width: 100,
              render: (_, r) => (
                <Button
                  size="small"
                  disabled={
                    busy ||
                    item.candidates.some((c) => c.channel.id === r.channel.id)
                  }
                  aria-label={`添加候选 ${r.channel.displayName}`}
                  onClick={() => void add(r.channel.id)}
                >
                  {item.candidates.some((c) => c.channel.id === r.channel.id)
                    ? '已有关系'
                    : '添加候选'}
                </Button>
              ),
            },
          ]}
          locale={{
            emptyText: (
              <EmptyState description="当前模型、授权或筛选范围内暂无候选渠道" />
            ),
          }}
        />
      )}
    </Drawer>
  );
}
