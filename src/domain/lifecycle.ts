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
  | 'backup'
  | 'quality_passed_notice'
  | 'integration_failed_notice';
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
  quality_passed_notice: '第一阶段质量测试通过，可推进合同',
  integration_failed_notice: '第二阶段接入异常（采购抄送，仅需知悉）',
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
export const isLifecycleNotice = (type: WorkType) =>
  type === 'quality_passed_notice' || type === 'integration_failed_notice';

/** Both original execution saves and human phase conclusions use this matrix. */
export function phaseFailureWork(phase: Phase): readonly WorkType[] {
  return [
    'supplier_feedback',
    'supervise',
    phase === 'quality' ? 'replacement' : 'integration_failed_notice',
  ];
}
export type Milestone =
  'resource' | Phase | 'contract' | 'configuration' | 'opening';
export type StepState =
  | 'completed'
  | 'in_progress'
  | 'failed'
  | 'waiting_feedback'
  | 'remediating'
  | 'waiting_retest'
  | 'held'
  | 'not_started';
export interface LifecycleStep {
  id: string;
  label: string;
  phase: Milestone;
  kind: 'milestone' | 'failure' | 'feedback' | 'remediation' | 'retest';
  state: StepState;
  done: boolean;
  executionId: string | null;
  remediationId: string | null;
  round: number | null;
  completedAt: string | null;
  ownerId: string | null;
}
export type ActiveDeliveryStep = Pick<LifecycleStep, 'label' | 'done'> &
  Partial<Omit<LifecycleStep, 'label' | 'done'>>;
export const stepStateLabels: Record<StepState, string> = {
  completed: '已完成',
  in_progress: '进行中',
  failed: '测试失败',
  waiting_feedback: '等待供应商反馈',
  remediating: '整改中',
  waiting_retest: '等待复测',
  held: '已挂起',
  not_started: '未开始',
};
const milestonePhases: Milestone[] = [
  'resource',
  'quality',
  'contract',
  'configuration',
  'connectivity',
  'opening',
];
/** Opaque display key, not an authorization token or business identity. */
export function progressStepId(source: string) {
  let hash = 2166136261;
  for (const char of source)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `progress-${(hash >>> 0).toString(36)}`;
}
export function deliveryProgress(
  completed: boolean[],
  activeWork: ActiveDeliveryStep[],
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
  const current = completed.findIndex((v) => !v);
  const extra: LifecycleStep[] = activeWork.map((v, index) => ({
    id: v.id ?? `extra:${v.phase ?? 'quality'}:${index}`,
    label: v.label,
    phase: v.phase ?? 'quality',
    kind: v.kind ?? 'remediation',
    state:
      (held || terminated) && !v.done && v.kind !== 'failure'
        ? 'held'
        : (v.state ?? (v.done ? 'completed' : 'waiting_retest')),
    done: v.done,
    executionId: v.executionId ?? null,
    remediationId: v.remediationId ?? null,
    round: v.round ?? null,
    completedAt: v.completedAt ?? null,
    ownerId: v.ownerId ?? null,
  }));
  const steps: LifecycleStep[] = milestoneLabels.map((label, index) => ({
    id: `milestone:${milestonePhases[index]}`,
    label,
    phase: milestonePhases[index]!,
    kind: 'milestone',
    state: completed[index]
      ? 'completed'
      : (held || terminated) && current === index
        ? 'held'
        : extra.some(
              (v) => v.phase === milestonePhases[index] && v.state === 'failed',
            )
          ? 'failed'
          : current === index
            ? 'in_progress'
            : 'not_started',
    done: !!completed[index],
    executionId: null,
    remediationId: null,
    round: null,
    completedAt: null,
    ownerId: null,
  }));
  return {
    percent,
    delivered,
    schedulable: delivered && !held && !terminated && dispatch === 'open',
    steps,
    extra,
    orderedSteps: steps.flatMap((step) => [
      step,
      ...extra.filter((v) => v.phase === step.phase),
    ]),
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
