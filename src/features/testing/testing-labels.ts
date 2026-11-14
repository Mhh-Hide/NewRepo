import type {
  TechnicalConclusion,
  TestingStats,
} from '../../services/testing-types';
export const testingStatLabels: Record<keyof TestingStats, string> = {
  pendingTasks: '待执行任务',
  runningTasks: '进行中任务',
  currentFailedChannels: '当前采纳失败渠道',
  legacyFailedChannels: '历史 legacy 失败渠道',
  reviewChannels: '待复核渠道',
  newFailureChannels: '新失败待复核渠道',
  exemptedChannels: '当前质量豁免渠道',
  connectivityUnverifiedChannels: '连通性待验证渠道',
};
export function conclusionText(v: TechnicalConclusion) {
  return `${{ pending: '待验证', running: '测试中', passed: '通过', failed: '失败', exempted: '质量豁免' }[v.result ?? v.status]} · ${v.origin === 'adopted' ? '人工采纳' : v.origin === 'legacy' ? 'legacy 历史状态' : '暂无明确采纳依据'}`;
}
