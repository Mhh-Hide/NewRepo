import type { Remediation } from './entities';
import type { TestType } from './statuses';
export type ProblemCategory =
  'quality' | 'timeout' | 'authentication' | 'invalid_response' | 'other';
export interface ManagedRemediation extends Remediation {
  readonly supplierId: string;
  readonly version: number;
  readonly sourceType: 'legacy' | 'failed_execution' | 'manual';
  readonly sourceTaskId: string | null;
  readonly sourceBasis: string | null;
  readonly sourceTargetVersion: string | null;
  readonly category: ProblemCategory | null;
  readonly verificationScope: TestType | null;
  readonly targetReference: string | null;
  readonly sharedSummary: string | null;
  readonly internalNotes: string | null;
  readonly assigneeUserId: string | null;
  readonly dueAt: string | null;
  readonly createdBy: string | null;
  readonly activeRound: number | null;
  readonly splitReason: string | null;
}
export interface RemediationSubmission {
  readonly id: string;
  readonly remediationId: string;
  readonly round: number;
  readonly submittedBy: string;
  readonly submittedAt: string;
  readonly version: number;
  readonly sharedSummary: string;
  readonly internalNotes: string;
  readonly evidenceReference: string;
}
export interface RemediationRetestLink {
  readonly id: string;
  readonly remediationId: string;
  readonly round: number;
  readonly executionId: string;
  readonly taskId: string;
  readonly targetVersion: string | null;
  readonly basis: string | null;
  readonly linkedBy: string;
  readonly linkedAt: string;
  readonly applicabilityReason: string;
}
export interface RemediationClosure {
  readonly id: string;
  readonly remediationId: string;
  readonly round: number | null;
  readonly closureType: 'normal' | 'exception';
  readonly exceptionCategory:
    'duplicate' | 'no_longer_applicable' | 'unable_to_verify' | 'other' | null;
  readonly verificationExecutionId: string | null;
  readonly verificationConclusionId: string | null;
  readonly closedBy: string;
  readonly closedAt: string;
  readonly reason: string;
  readonly verificationToken: string | null;
}
export interface RemediationEvent {
  readonly id: string;
  readonly remediationId: string;
  readonly action: string;
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly requestId: string;
  readonly beforeVersion: number | null;
  readonly afterVersion: number;
  readonly beforeStatus: Remediation['status'] | null;
  readonly afterStatus: Remediation['status'];
  readonly round: number | null;
  readonly changes: readonly {
    readonly field: string;
    readonly before: string | number | null;
    readonly after: string | number | null;
  }[];
}
export interface RemediationRequest {
  readonly id: string;
  readonly operation: string;
  readonly fingerprint: string;
  readonly resultId: string;
}
export interface RemediationState {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly records: readonly ManagedRemediation[];
  readonly submissions: readonly RemediationSubmission[];
  readonly links: readonly RemediationRetestLink[];
  readonly closures: readonly RemediationClosure[];
  readonly events: readonly RemediationEvent[];
  readonly requests: readonly RemediationRequest[];
}
export const remediationStatusLabels = {
  open: '待跟进',
  in_progress: '处理中',
  submitted: '已提交待验证',
  closed: '已关闭',
};
export const problemCategoryLabels = {
  quality: '质量问题',
  timeout: '超时',
  authentication: '认证问题',
  invalid_response: '响应异常',
  other: '其他技术问题',
};
