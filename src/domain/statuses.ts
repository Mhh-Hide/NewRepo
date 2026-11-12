/** Stable codes and presentation labels; no unapproved workflow transitions. */
export const sourcingStatusLabels = {
  draft: '草稿',
  sourcing: '寻源中',
  gap: '存在资源缺口',
  matched: '已匹配',
  closed: '已关闭',
} as const;
export type SourcingStatus = keyof typeof sourcingStatusLabels;
export const qualityStatusLabels = {
  pending: '待质量测试',
  running: '质量测试中',
  passed: '质量通过',
  failed: '质量失败',
  exempted: '已核验豁免',
} as const;
export type QualityStatus = keyof typeof qualityStatusLabels;
export const connectivityStatusLabels = {
  pending: '待连通性测试',
  running: '连通性测试中',
  passed: '连通性通过',
  failed: '连通性失败',
} as const;
export type ConnectivityStatus = keyof typeof connectivityStatusLabels;
export const integrationStatusLabels = {
  not_started: '未接入',
  integrating: '接入中',
  integrated: '已接入',
} as const;
export type IntegrationStatus = keyof typeof integrationStatusLabels;
export const availabilityStatusLabels = {
  closed: '未开放',
  open: '已开放',
  suspended: '已暂停',
} as const;
export type AvailabilityStatus = keyof typeof availabilityStatusLabels;
export const quoteStatusLabels = {
  reference: '参考报价',
  pending_contract: '待合同确认',
  effective: '正式生效价',
  temporary: '临时优惠报价',
  expired: '已失效',
} as const;
export type QuoteStatus = keyof typeof quoteStatusLabels;
export const remediationStatusLabels = {
  open: '待整改',
  in_progress: '整改中',
  submitted: '已反馈',
  closed: '已关闭',
} as const;
export type RemediationStatus = keyof typeof remediationStatusLabels;
export const incidentStatusLabels = {
  reported: '已登记',
  investigating: '调查中',
  resolved: '已解决',
  closed: '已关闭',
} as const;
export type IncidentStatus = keyof typeof incidentStatusLabels;
export const channelTypeLabels = {
  official_direct: '官方原厂 Key',
  official_proxy: '官方中转 Key',
  cloud_self_hosted: '云厂商自部署',
  third_party_proxy: '第三方中转',
  other: '其他',
} as const;
export type ChannelType = keyof typeof channelTypeLabels;
export type EntityStatus = 'enabled' | 'disabled';
export type TestType = 'quality' | 'connectivity';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'cancelled';
