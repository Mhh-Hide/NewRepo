export type Phase = 'quality' | 'connectivity';
export type ContractStage =
  'drafting' | 'signing' | 'effective' | 'paused' | 'terminated';
export type DispatchState =
  'not_open' | 'open' | 'private' | 'paused' | 'disabled';
export interface DeliveryRecord {
  channelId: string;
  version: number;
  acquiredAt: string;
  procurementOwnerId: string;
  testerId: string;
  operatorId: string;
  demandId: string | null;
  dueAt: string | null;
  credentialStatus: 'pending' | 'received';
  credentialReference: string | null;
  credentialRecipientId: string;
  usageTerms: string;
  contractStage: ContractStage;
  contractNumber: string | null;
  contractHandler: string;
  nextAction: string;
  nextOwnerId: string;
  contractDueAt: string | null;
  electronicEffectiveAt: string | null;
  paperStatus: 'unknown' | 'pending' | 'returned';
  credentialSent: boolean;
  productionRecipientId: string;
  productionReceived: boolean;
  productionReference: string | null;
  configuredAt: string | null;
  configuredBy: string | null;
  configuredBasis: string | null;
  dispatch: DispatchState;
  openedAt: string | null;
  openedBy: string | null;
  openingQualityId: string | null;
  openingIntegrationId: string | null;
  held: boolean;
  terminated: boolean;
  updatedAt: string;
}
export interface PhaseVerification {
  id: string;
  channelId: string;
  phase: Phase;
  executionId: string;
  basis: string;
  targetVersion: string;
  ttftMs: number | null;
  rpm: number | null;
  tpm: number | null;
  concurrency: number | null;
  metering: 'pending' | 'passed' | 'failed';
  billing: 'pending' | 'passed' | 'failed';
  conclusion: 'passed' | 'failed';
  evidenceReference: string;
  actorId: string;
  occurredAt: string;
}
export type WorkType =
  | 'procure'
  | 'quality'
  | 'supplier_feedback'
  | 'supervise'
  | 'replacement'
  | 'contract'
  | 'configuration'
  | 'integration'
  | 'opening'
  | 'mention'
  | 'backup';
export interface LifecycleTask {
  archived: boolean;
  scopeDomains: ('domestic' | 'overseas')[];
  version: number;
  relatedChannelIds: string[];
  id: string;
  objectType: 'channel' | 'demand';
  objectId: string;
  channelId: string | null;
  demandId: string | null;
  type: WorkType;
  title: string;
  assigneeId: string;
  initiatorId: string;
  createdAt: string;
  dueAt: string | null;
  status: 'open' | 'completed' | 'cancelled';
  priority: 'normal' | 'high';
  sourceId: string;
  readAt: string | null;
  completedAt: string | null;
  completionActorId: string | null;
  completionReason: string | null;
}
export interface LifecycleEvent {
  id: string;
  channelId: string | null;
  demandId: string | null;
  sourceId: string;
  action: string;
  actorId: string;
  occurredAt: string;
  reason: string;
  beforeVersion: number | null;
  afterVersion: number | null;
  executionId: string | null;
  remediationId: string | null;
  changes: string;
}
export interface LifecycleComment {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  recipientIds: string[];
  occurredAt: string;
}
export interface DemandGoal {
  demandId: string;
  customerSignedAt: string;
  recordedBy: string;
  version: number;
}
export interface SupplierCommunication {
  supplierId: string;
  groupName: string;
  notes: string;
  version: number;
  updatedAt: string;
}
export interface LifecycleState {
  schemaVersion: 1;
  revision: number;
  records: DeliveryRecord[];
  verifications: PhaseVerification[];
  tasks: LifecycleTask[];
  events: LifecycleEvent[];
  comments: LifecycleComment[];
  goals: DemandGoal[];
  communications: SupplierCommunication[];
  requests: { id: string; fingerprint: string; resultId: string }[];
}
export const milestoneLabels = [
  '资源获取',
  '第一阶段质量测试',
  '供应商合同生效',
  '生产环境配置',
  '第二阶段平台接入测试',
  '对客开放',
] as const;
export const workLabels: Record<WorkType, string> = {
  procure: '采购资源跟进',
  quality: '第一阶段质量测试',
  supplier_feedback: '向供应商反馈并跟进整改',
  supervise: '监督整改进度',
  replacement: '补充替代资源',
  contract: '推进采购合同',
  configuration: '完成生产配置',
  integration: '第二阶段平台接入测试',
  opening: '确认对客开放',
  mention: '渠道内部提及',
  backup: '补充至少三个可用渠道',
};
export const contractLabels: Record<ContractStage, string> = {
  drafting: '合同拟定中',
  signing: '合同签署流转中',
  effective: '合同已生效',
  paused: '合同暂停',
  terminated: '合同终止',
};
export const dispatchLabels: Record<DispatchState, string> = {
  not_open: '尚未开放',
  open: '已开放',
  private: '不公开调度',
  paused: '暂停调度',
  disabled: '已停用',
};
export function deliveryProgress(
  completed: boolean[],
  activeWork: { label: string; done: boolean }[],
  held: boolean,
  terminated: boolean,
  dispatch: DispatchState,
) {
  const done =
      completed.filter(Boolean).length +
      activeWork.filter((v) => v.done).length,
    total = 6 + activeWork.length;
  let percent = Math.floor((done / total) * 100);
  const delivered = completed.every(Boolean);
  if (!delivered) percent = Math.min(99, percent);
  return {
    percent,
    delivered,
    schedulable: delivered && !held && !terminated && dispatch === 'open',
    steps: milestoneLabels.map((label, i) => ({ label, done: !!completed[i] })),
    extra: activeWork,
    color:
      terminated || held || dispatch === 'disabled'
        ? 'gray'
        : activeWork.some((v) => !v.done)
          ? 'red'
          : delivered && dispatch === 'open'
            ? 'green'
            : 'blue',
  };
}
