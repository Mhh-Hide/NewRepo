import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
} from 'antd';
import type { DemoSession } from '../../services/demo-session';
import type { InquiryRecord } from '../../domain/quotations';
import { inquiryStatusLabels } from '../../domain/quotations';
import { useResourceQuery } from '../models/use-resource-query';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { resourceErrorMessage } from '../../services/resource-types';
import { dateISO, displayDate } from './quote-format';
import type { QuotePreset } from './QuoteEditor';
export function InquiryPanel({
  session,
  preset = {},
  onQuote,
}: {
  session: DemoSession;
  preset?: QuotePreset;
  onQuote: (p: QuotePreset) => void;
}) {
  const channelId = preset.channelId;
  const itemId = preset.demandItemId;
  const load = useCallback(async () => {
    const [options, inquiries] = await Promise.all([
      session.api.quoteOptions(),
      session.api.listInquiries(channelId, itemId),
    ]);
    return { options, inquiries };
  }, [session.api, channelId, itemId]);
  const { result, reload } = useResourceQuery(load);
  const [modal, setModal] = useState<'create' | InquiryRecord | null>(null);
  const [form] = Form.useForm<{
    channelId: string;
    demandItemId: string | null;
    responseDueAt: string;
    status: InquiryRecord['status'];
    note: string;
  }>();
  const selected = Form.useWatch('channelId', form);
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = (value: typeof modal) => {
    form.resetFields();
    form.setFieldsValue(
      value === 'create'
        ? {
            channelId: preset.channelId ?? '',
            demandItemId: preset.demandItemId ?? null,
            note: '',
          }
        : value
          ? { status: value.status, note: value.followUpNote }
          : {},
    );
    setRequestId(crypto.randomUUID());
    setError('');
    setModal(value);
  };
  const submit = async () => {
    if (busy) return;
    try {
      const v = await form.validateFields();
      setBusy(true);
      if (modal === 'create')
        await session.api.createInquiry(
          {
            channelId: v.channelId,
            demandItemId: v.demandItemId || null,
            responseDueAt: dateISO(v.responseDueAt),
            followUpNote: v.note,
          },
          requestId,
        );
      else if (modal)
        await session.api.updateInquiry(
          modal.id,
          modal.version,
          v.status,
          v.note,
          requestId,
        );
      setModal(null);
      reload();
    } catch (e) {
      if (e instanceof Error) setError(resourceErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title="模拟询价记录"
      className="quote-section"
      extra={
        session.permits('inquiry:create') && (
          <Button onClick={() => open('create')}>发起模拟询价</Button>
        )
      }
    >
      <p className="section-note">
        仅人工台账，不发送邮件或通知。收到报价不等于已核验或正式确认。
      </p>
      {result.status === 'loading' ? (
        <LoadingState />
      ) : result.status === 'error' ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : (
        <Table<InquiryRecord>
          rowKey="id"
          size="small"
          dataSource={[...result.data.inquiries]}
          scroll={{ x: 1000 }}
          pagination={{ pageSize: 5 }}
          columns={[
            {
              title: '渠道 / 需求关联',
              width: 250,
              render: (_, i) => (
                <div>
                  {
                    result.data.options.channels.find(
                      (c) => c.channel.id === i.channelId,
                    )?.channel.displayName
                  }
                  <small className="resource-subtitle">
                    {i.demandItemId
                      ? result.data.options.demands.find(
                          (d) => d.id === i.demandItemId,
                        )?.label
                      : '日常询价，无需求关联'}
                  </small>
                </div>
              ),
            },
            {
              title: '询价状态',
              width: 150,
              render: (_, i) => inquiryStatusLabels[i.status],
            },
            { title: '共享跟进说明', dataIndex: 'followUpNote', width: 260 },
            {
              title: '请求 / 截止时间',
              width: 200,
              render: (_, i) => (
                <div>
                  {displayDate(i.requestedAt)}
                  <small className="resource-subtitle">
                    截止：{displayDate(i.responseDueAt)}
                  </small>
                </div>
              ),
            },
            {
              title: '操作',
              fixed: 'right',
              width: 200,
              render: (_, i) => (
                <Space wrap>
                  {session.permits('inquiry:update') && (
                    <Button
                      size="small"
                      disabled={i.status === 'closed'}
                      onClick={() => open(i)}
                    >
                      更新询价
                    </Button>
                  )}
                  {session.permits('quote:create') && (
                    <Button
                      size="small"
                      disabled={i.status === 'closed'}
                      onClick={() =>
                        onQuote({
                          channelId: i.channelId,
                          ...(i.demandItemId
                            ? { demandItemId: i.demandItemId }
                            : {}),
                          inquiryId: i.id,
                        })
                      }
                    >
                      收到并录入报价
                    </Button>
                  )}
                </Space>
              ),
            },
          ]}
          locale={{ emptyText: '暂无询价；可记录日常询价或关联需求明细' }}
        />
      )}
      <Modal
        title={modal === 'create' ? '发起模拟询价' : '更新询价跟进'}
        open={modal !== null}
        okText="保存询价记录"
        confirmLoading={busy}
        onCancel={() => setModal(null)}
        onOk={() => void submit()}
      >
        <Alert type="info" title="模拟台账，不对外发送消息" />
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {modal === 'create' ? (
            <>
              <Form.Item
                name="channelId"
                label="询价渠道"
                rules={[{ required: true }]}
              >
                <Select
                  aria-label="询价渠道选择"
                  showSearch
                  optionFilterProp="label"
                  options={
                    result.status === 'ready'
                      ? result.data.options.channels.map((c) => ({
                          value: c.channel.id,
                          label: `${c.channel.displayName} · ${c.supplier.name} · ${c.model.name}`,
                        }))
                      : []
                  }
                  onChange={() => form.setFieldValue('demandItemId', null)}
                />
              </Form.Item>
              <Form.Item name="demandItemId" label="询价关联需求明细（可空）">
                <Select
                  aria-label="询价关联需求明细"
                  allowClear
                  options={
                    result.status === 'ready'
                      ? result.data.options.demands
                          .filter(
                            (i) =>
                              i.modelId ===
                              result.data.options.channels.find(
                                (c) => c.channel.id === selected,
                              )?.model.id,
                          )
                          .map((i) => ({ value: i.id, label: i.label }))
                      : []
                  }
                />
              </Form.Item>
              <Form.Item
                name="responseDueAt"
                label="回复截止日期（北京时间00:00，可空）"
              >
                <Input type="date" />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="status"
              label="询价状态"
              rules={[{ required: true }]}
            >
              <Select
                aria-label="询价跟进状态"
                options={Object.entries(inquiryStatusLabels).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
            </Form.Item>
          )}
          <Form.Item
            name="note"
            label="询价共享跟进说明"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
          {error && <Alert type="error" title={error} />}
        </Form>
      </Modal>
    </Card>
  );
}
