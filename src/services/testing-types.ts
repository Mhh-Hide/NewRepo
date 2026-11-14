import type { Channel, TestTask } from '../domain/entities';
import type { TestType } from '../domain/statuses';
import type {
  TaskDefinition,
  TestRun,
  ExecutionRecord,
  TestConclusion,
  ReviewDisposition,
  SourceVerification,
  ManagedExemption,
  ExemptionRevocation,
  TestAudit,
} from '../domain/testing';
export interface TechnicalConclusion {
  readonly origin: 'adopted' | 'legacy' | 'none';
  readonly result: 'passed' | 'failed' | null;
  readonly status: Channel['qualityStatus'];
  readonly adoptedAt: string | null;
  readonly legacyStatus: Channel['qualityStatus'] | null;
  readonly basisChanged: boolean;
  readonly pendingReview: number;
  readonly newFailureRisk: boolean;
  readonly latestTestedAt: string | null;
  readonly technicalSummary: string | null;
}
export interface TestSummary {
  readonly channel: {
    readonly id: string;
    readonly name: string;
    readonly anonymousCode: string;
    readonly status: Channel['resourceStatus'];
  };
  readonly model: { readonly id: string; readonly name: string };
  readonly supplier: { readonly id: string; readonly name: string };
  readonly quality: TechnicalConclusion;
  readonly connectivity: TechnicalConclusion;
  readonly exempted: boolean;
  readonly pendingTasks: number;
  readonly runningTasks: number;
}
export interface TestingStats {
  readonly pendingTasks: number;
  readonly runningTasks: number;
  readonly currentFailedChannels: number;
  readonly legacyFailedChannels: number;
  readonly reviewChannels: number;
  readonly newFailureChannels: number;
  readonly exemptedChannels: number;
  readonly connectivityUnverifiedChannels: number;
}
export interface TestingPage {
  readonly rows: readonly TestSummary[];
  readonly stats: TestingStats;
}
export interface TestTaskRow {
  readonly task: TestTask;
  readonly latestExecution: Pick<
    ExecutionRecord,
    'result' | 'finishedAt' | 'origin' | 'performedBy' | 'round'
  > | null;
  readonly definition: TaskDefinition;
  readonly summary: TestSummary;
}
export interface TestTaskDetail extends TestTaskRow {
  readonly targetCurrent: boolean;
  readonly executions: readonly ExecutionRecord[];
  readonly activeRun: TestRun | null;
  readonly conclusions: readonly TestConclusion[];
  readonly reviews: readonly ReviewDisposition[];
  readonly history: readonly TestAudit[];
  readonly token: {
    readonly taskVersion: number;
    readonly conclusionVersion: number;
  };
  readonly sourceVerifications: readonly SourceVerification[];
  readonly exemptions: readonly ManagedExemption[];
  readonly exemptionRevocations: readonly ExemptionRevocation[];
}
export interface TaskInput {
  readonly channelId: string;
  readonly testType: TestType;
  readonly targetReference: string;
  readonly assignedTo: string | null;
}
export interface ExecutionInput {
  readonly result: 'passed' | 'failed' | 'inconclusive';
  readonly technicalSummary: string;
  readonly internalNotes: string;
  readonly evidenceReference: string;
  readonly failureCategory: string | null;
}
export interface AdoptionToken {
  readonly taskVersion: number;
  readonly executionVersion: number;
  readonly conclusionVersion: number;
}
export interface TestingApi {
  queryTestSummaries(query?: {
    readonly channelId?: string;
    readonly modelId?: string;
  }): Promise<TestingPage>;
  queryTestTasks(query?: {
    readonly channelId?: string;
    readonly modelId?: string;
    readonly testType?: TestType;
    readonly status?: TestTask['status'];
  }): Promise<readonly TestTaskRow[]>;
  getTestTask(id: string): Promise<TestTaskDetail | null>;
  testingOptions(): Promise<{
    readonly channels: readonly {
      readonly id: string;
      readonly label: string;
    }[];
    readonly assignees: readonly {
      readonly id: string;
      readonly name: string;
    }[];
  }>;
  createTestTask(input: TaskInput, requestId: string): Promise<string>;
  updateTestTask(
    id: string,
    version: number,
    targetReference: string,
    assignedTo: string | null,
    requestId: string,
  ): Promise<void>;
  startTestTask(
    id: string,
    version: number,
    requestId: string,
  ): Promise<string>;
  finishTestExecution(
    id: string,
    version: number,
    executionId: string,
    input: ExecutionInput,
    requestId: string,
  ): Promise<void>;
  cancelTestTask(
    id: string,
    version: number,
    reason: string,
    requestId: string,
  ): Promise<void>;
  adoptTestExecution(
    executionId: string,
    token: AdoptionToken,
    reason: string,
    requestId: string,
  ): Promise<void>;
  reviewTestExecution(
    executionId: string,
    token: AdoptionToken,
    reason: string,
    requestId: string,
  ): Promise<void>;
  verifyTestSource(
    channelId: string,
    channelVersion: number,
    status: 'verified' | 'revoked',
    evidenceReference: string,
    reason: string,
    requestId: string,
  ): Promise<void>;
  recordQualityExemption(
    channelId: string,
    channelVersion: number,
    evidenceReference: string,
    reason: string,
    requestId: string,
  ): Promise<string>;
  revokeQualityExemption(
    id: string,
    channelVersion: number,
    reason: string,
    requestId: string,
  ): Promise<void>;
}
