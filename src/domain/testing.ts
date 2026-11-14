import type {
  Channel,
  QualityExemption,
  TestExecution,
  TestTask,
} from './entities';
import type { TestType } from './statuses';
export interface TaskDefinition {
  readonly taskId: string;
  readonly version: number;
  readonly targetReference: string;
  readonly targetVersion: string;
  readonly basis: string;
  readonly createdBy: string | null;
  readonly cancelledBy: string | null;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
}
export interface TestRun {
  readonly id: string;
  readonly taskId: string;
  readonly round: number;
  readonly performedBy: string;
  readonly startedAt: string;
  readonly targetVersion: string;
  readonly basis: string;
}
export interface ExecutionRecord extends TestExecution {
  readonly origin: 'legacy' | 'recorded';
  readonly performedBy: string | null;
  readonly round: number | null;
  readonly targetVersion: string | null;
  readonly basis: string | null;
  readonly version: 1;
  readonly technicalSummary: string | null;
  readonly internalNotes: string | null;
  readonly evidenceReference: string | null;
  readonly termination: 'finished' | 'cancelled';
}
export interface TestConclusion {
  readonly id: string;
  readonly channelId: string;
  readonly testType: TestType;
  readonly executionId: string;
  readonly result: 'passed' | 'failed';
  readonly adoptedBy: string;
  readonly adoptedAt: string;
  readonly reason: string;
  readonly targetVersion: string;
  readonly basis: string;
}
export interface ReviewDisposition {
  readonly id: string;
  readonly executionId: string;
  readonly reviewedBy: string;
  readonly reviewedAt: string;
  readonly disposition: 'reviewed_without_conclusion';
  readonly reason: string;
}
export interface SourceVerification {
  readonly id: string;
  readonly channelId: string;
  readonly sourceType: Channel['channelType'];
  readonly status: 'verified' | 'revoked';
  readonly evidenceReference: string;
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly basis: string;
}
export interface ManagedExemption extends QualityExemption {
  readonly origin: 'legacy' | 'recorded';
  readonly sourceVerificationId: string | null;
  readonly recordedBy: string | null;
  readonly recordedAt: string | null;
  readonly basis: string | null;
}
export interface ExemptionRevocation {
  readonly id: string;
  readonly exemptionId: string;
  readonly channelId: string;
  readonly action: 'revoked' | 'invalidated';
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly reason: string;
}
export interface TestAudit {
  readonly id: string;
  readonly channelId: string;
  readonly taskId: string | null;
  readonly executionId: string | null;
  readonly action: string;
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly requestId: string;
  readonly changes: readonly {
    readonly field: string;
    readonly before: string | null;
    readonly after: string | null;
  }[];
}
export interface TestingRequest {
  readonly id: string;
  readonly actorUserId: string;
  readonly operation: string;
  readonly fingerprint: string;
  readonly resultId: string;
}
export interface LegacyTestState {
  readonly channelId: string;
  readonly qualityStatus: Channel['qualityStatus'];
  readonly connectivityStatus: Channel['connectivityStatus'];
  readonly sourceVerificationStatus: Channel['sourceVerificationStatus'];
  readonly basis: string;
}
export interface TestingState {
  readonly taskDefinitions: readonly TaskDefinition[];
  readonly runs: readonly TestRun[];
  readonly executions: readonly ExecutionRecord[];
  readonly conclusions: readonly TestConclusion[];
  readonly reviews: readonly ReviewDisposition[];
  readonly sourceVerifications: readonly SourceVerification[];
  readonly exemptions: readonly ManagedExemption[];
  readonly exemptionRevocations: readonly ExemptionRevocation[];
  readonly testHistory: readonly TestAudit[];
  readonly testRequests: readonly TestingRequest[];
  readonly legacyTestStates: readonly LegacyTestState[];
}
export type TestingGraph = TestingState & {
  readonly tasks: readonly TestTask[];
  readonly channels: readonly Channel[];
};
export function testBasis(c: Channel, modelVersion: string): string {
  return JSON.stringify([
    c.modelId,
    modelVersion,
    c.modelInvocationName,
    c.endpointReference,
    c.channelType,
    'testConfigurationVersion' in c ? c.testConfigurationVersion : 'legacy',
  ]);
}
export function currentConclusion(
  s: TestingState,
  channelId: string,
  type: TestType,
  basis: string,
) {
  return (
    s.conclusions
      .filter(
        (v) =>
          v.channelId === channelId && v.testType === type && v.basis === basis,
      )
      .at(-1) ?? null
  );
}
export function activeExemptions(s: TestingState, c: Channel, basis: string) {
  return s.exemptions.filter(
    (e) =>
      e.channelId === c.id &&
      !s.exemptionRevocations.some((r) => r.exemptionId === e.id) &&
      (e.basis === null || e.basis === basis) &&
      c.channelType === 'official_direct' &&
      c.sourceVerificationStatus === 'verified' &&
      !!e.evidenceReference.trim() &&
      !!e.verifiedBy.trim() &&
      !!e.reason.trim(),
  );
}
export function pendingExecutions(
  s: TestingGraph,
  channelId: string,
  type?: TestType,
) {
  const ids = new Set(
    s.tasks
      .filter(
        (t) => t.channelId === channelId && (!type || t.testType === type),
      )
      .map((t) => t.id),
  );
  return s.executions.filter(
    (e) =>
      e.origin === 'recorded' &&
      e.termination === 'finished' &&
      ids.has(e.taskId) &&
      e.result !== null &&
      !s.conclusions.some((v) => v.executionId === e.id) &&
      !s.reviews.some((v) => v.executionId === e.id),
  );
}
export function conclusionVersion(
  s: TestingState,
  channelId: string,
  type: TestType,
) {
  return s.conclusions.filter(
    (v) => v.channelId === channelId && v.testType === type,
  ).length;
}
export const testResultLabels = {
  passed: '通过',
  failed: '失败',
  inconclusive: '结果不确定',
} as const;
export const taskStatusLabels = {
  pending: '待执行',
  running: '进行中',
  completed: '已完成',
  cancelled: '已取消',
} as const;
