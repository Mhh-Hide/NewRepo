import { inquiryStatusLabels } from '../../domain/quotations';
import { useCallback, useState } from 'react';
import { Alert, Button, Card, Space, Tag } from 'antd';
import { Link } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { useResourceQuery } from '../models/use-resource-query';
import { QuoteTable } from './QuoteTable';
import './quotes.css';
export function RelatedQuotes({
  session,
  channelId,
  demandId,
  demandItemId,
  target,
}: {
  session: DemoSession;
  channelId?: string;
  demandId?: string;
  demandItemId?: string;
  target?: number;
}) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(5);
  const load = useCallback(async () => {
    const [pricing, inquiries] = await Promise.all([
      session.api.queryQuotes({
        ...(channelId ? { channelId } : {}),
        ...(demandId ? { demandId } : {}),
        ...(demandItemId ? { demandItemId } : {}),
        page,
        pageSize: size,
      }),
      session.api.listInquiries(channelId, demandItemId),
    ]);
    return { pricing, inquiries };
  }, [session.api, channelId, demandId, demandItemId, page, size]);
  const { result, reload } = useResourceQuery(load);
  const params = new URLSearchParams({
    ...(channelId ? { channelId } : {}),
    ...(demandId ? { demandId } : {}),
    ...(demandItemId ? { demandItemId } : {}),
  });
  return (
    <Card
      title={channelId ? '授权渠道报价历史' : '本需求明细关联报价'}
      className="quote-section"
      extra={
        <Space wrap>
          <Button onClick={reload}>刷新关联报价</Button>
          <Link to={`/quotes?${params.toString()}`}>打开报价台账</Link>
        </Space>
      }
    >
      {target !== undefined && (
        <Alert
          type="info"
          title={`采购目标 ${target} 基点（${target / 1000} 折）与供应商报价分别保留`}
          description="采购目标尚未记录价格基准和适用规格，不具备直接可比性，暂不计算差价或判定达标；报价不会自动改变候选匹配。"
        />
      )}
      {demandItemId && (
        <p className="section-note">
          仅列本需求明细关联报价；日常报价与全部版本请从候选渠道进入完整历史。询价回复不代表核验。
        </p>
      )}
      {result.status === 'ready' && result.data.inquiries.length > 0 && (
        <Space wrap style={{ margin: '12px 0' }} aria-label="关联询价回复状态">
          {result.data.inquiries.map((i) => (
            <Tag key={i.id}>
              渠道 {i.channelId}：{inquiryStatusLabels[i.status]}
            </Tag>
          ))}
        </Space>
      )}
      {result.status === 'loading' ? (
        <LoadingState />
      ) : result.status === 'error' ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : (
        <QuoteTable
          rows={result.data.pricing.rows}
          page={page}
          pageSize={size}
          total={result.data.pricing.total}
          onPage={(p, s) => {
            setPage(p);
            setSize(s);
          }}
        />
      )}
    </Card>
  );
}
