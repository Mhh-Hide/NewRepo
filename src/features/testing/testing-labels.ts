import type {
  TechnicalConclusion,
  TestingStats,
} from '../../services/testing-types';
export const testingStatLabels: Record<keyof TestingStats, string> = {
  pendingTasks: '待测试',
  runningTasks: '测试中',
  currentFailedChannels: '测试失败',
  legacyFailedChannels: '历史测试失败',
  reviewChannels: '待复核渠道',
  newFailureChannels: '新失败待复核渠道',
  exemptedChannels: '质量豁免',
  connectivityUnverifiedChannels: '待接入验证',
};
export function conclusionText(v: TechnicalConclusion) {
  return `${{ pending: '待验证', running: '测试中', passed: '通过', failed: '失败', exempted: '质量豁免' }[v.result ?? v.status]} · ${v.origin === 'adopted' ? '人工采纳' : v.origin === 'legacy' ? '历史记录' : '待确认'}`;
}
