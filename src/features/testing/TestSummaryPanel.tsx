import { RemediationSummaryPanel } from '../remediations/RemediationSummaryPanel';
import { useCallback } from 'react';
import { Alert, Card, Descriptions, Empty, Space, Tag, Button } from 'antd';
import { Link } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import type { TestingStats, TestSummary } from '../../services/testing-types';
import { useResourceQuery } from '../models/use-resource-query';
import { LoadingState, ErrorState } from '../../components/FeedbackStates';
import { testingStatLabels, conclusionText } from './testing-labels';
export function TestingMetrics({ stats }: { stats: TestingStats }) {
  return (
    <Card title="测试协作概览（模拟）" className="resource-card">
      <Descriptions
        column={{ xs: 1, sm: 2, lg: 4 }}
        items={Object.entries(testingStatLabels).map(([key, label]) => ({
          key,
          label,
          children: (
            <b data-testid={`testing-stat-${key}`}>
              {stats[key as keyof TestingStats]}
            </b>
          ),
        }))}
      />
      <p className="section-note">
        待执行只计
        pending；失败、待复核、豁免按渠道去重，不相加。连通性待验证指缺少当前明确采纳依据，legacy
        单独保留来源。
      </p>
    </Card>
  );
}
export function TestSummaryView({ row }: { row: TestSummary }) {
  return (
    <div className="test-summary">
      <Space wrap>
        <Tag>质量：{conclusionText(row.quality)}</Tag>
        <Tag>连通性：{conclusionText(row.connectivity)}</Tag>
        {row.exempted && <Tag color="cyan">质量豁免（不是测试通过）</Tag>}
      </Space>
      {[row.quality, row.connectivity].some((v) => v.newFailureRisk) && (
        <Alert
          type="warning"
          title="新失败待复核；原采纳结论保持不变，不自动停用渠道。"
        />
      )}
      <p>
        待复核执行：{row.quality.pendingReview + row.connectivity.pendingReview}{' '}
        · 待执行任务：{row.pendingTasks} · 进行中：{row.runningTasks}
      </p>
      {[row.quality, row.connectivity].map((v, i) => (
        <p key={i}>
          {i ? '连通性' : '质量'}最近测试：{v.latestTestedAt ?? '尚无执行'} ·{' '}
          {v.technicalSummary ?? '无独立共享技术摘要（不引用旧自由文本）'}
          {v.basisChanged
            ? ' · 原 legacy 配置依据已变，旧结论不适用于新目标'
            : ''}
        </p>
      ))}
    </div>
  );
}
export function TestSummaryPanel({
  session,
  channelId,
  modelId,
}: {
  session: DemoSession;
  channelId?: string;
  modelId?: string;
}) {
  return session.permits('test:summary') ? (
    <AuthorizedSummary
      key={`${session.profile.user.id}:${session.domain}:${channelId}:${modelId}`}
      session={session}
      {...(channelId ? { channelId } : {})}
      {...(modelId ? { modelId } : {})}
    />
  ) : null;
}
function AuthorizedSummary({
  session,
  channelId,
  modelId,
}: {
  session: DemoSession;
  channelId?: string;
  modelId?: string;
}) {
  const load = useCallback(
    () =>
      session.api.queryTestSummaries({
        ...(channelId ? { channelId } : {}),
        ...(modelId ? { modelId } : {}),
      }),
    [session.api, channelId, modelId],
  );
  const { result, reload } = useResourceQuery(load);
  return (
    <Card
      title="授权测试技术摘要"
      className="resource-card"
      extra={<Button onClick={reload}>刷新测试摘要</Button>}
    >
      {result.status === 'loading' ? (
        <LoadingState />
      ) : result.status === 'error' ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : result.data.rows.length ? (
        result.data.rows.map((row) => (
          <section key={row.channel.id}>
            <strong>
              {row.model.name} · {row.channel.name}
            </strong>
            <TestSummaryView row={row} />
            <RemediationSummaryPanel
              session={session}
              channelId={row.channel.id}
            />
            {session.permits('test:detail') && (
              <Link
                to={`/tests?channelId=${encodeURIComponent(row.channel.id)}`}
              >
                查看授权测试任务与历史
              </Link>
            )}
          </section>
        ))
      ) : (
        <Empty description="当前授权范围暂无渠道测试摘要" />
      )}
    </Card>
  );
}
