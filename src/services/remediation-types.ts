import type {
  ManagedRemediation,
  ProblemCategory,
  RemediationState,
  RemediationClosure,
} from '../domain/remediations';
import type { TestType } from '../domain/statuses';
export interface RemediationInput {
  readonly channelId: string;
  readonly sourceType: 'manual' | 'failed_execution';
  readonly sourceExecutionId: string | null;
  readonly category: ProblemCategory;
  readonly verificationScope: TestType;
  readonly targetReference: string;
  readonly sharedSummary: string;
  readonly internalNotes: string;
  readonly assigneeUserId: string | null;
  readonly dueAt: string | null;
  readonly splitReason: string;
}
export interface RemediationSummary {
  readonly id: string;
  readonly channelId: string;
  readonly supplierId: string;
  readonly category: ProblemCategory | null;
  readonly verificationScope: TestType | null;
  readonly status: ManagedRemediation['status'];
  readonly updatedAt: string;
  readonly pendingVerification: boolean;
  readonly overdue: boolean;
  readonly deadlineUnknown: boolean;
  readonly exceptionClosed: boolean;
}
export interface RemediationDetail {
  readonly currentConclusion: {
    readonly id: string;
    readonly executionId: string;
    readonly result: 'passed' | 'failed';
    readonly adoptedAt: string;
    readonly targetVersion: string;
  } | null;
  readonly record: ManagedRemediation;
  readonly submissions: RemediationState['submissions'];
  readonly links: RemediationState['links'];
  readonly closures: RemediationState['closures'];
  readonly events: RemediationState['events'];
  readonly sourceApplicability:
    'legacy_unknown' | 'current' | 'invalidated' | 'manual';
}
export type RemediationOperation =
  | {
      readonly action: 'update';
      readonly category: ProblemCategory;
      readonly verificationScope: TestType;
      readonly targetReference: string;
      readonly sharedSummary: string;
      readonly internalNotes: string;
    }
  | { readonly action: 'assign'; readonly assigneeUserId: string | null }
  | { readonly action: 'due'; readonly dueAt: string | null }
  | { readonly action: 'start' | 'followup' | 'return' }
  | {
      readonly action: 'submit';
      readonly sharedSummary: string;
      readonly internalNotes: string;
      readonly evidenceReference: string;
    }
  | {
      readonly action: 'link';
      readonly executionId: string;
      readonly applicabilityReason: string;
    }
  | {
      readonly action: 'normal';
      readonly executionId: string;
      readonly conclusionId: string;
      readonly applicabilityReason: string;
      readonly token: string;
    }
  | {
      readonly action: 'exception';
      readonly category: NonNullable<RemediationClosure['exceptionCategory']>;
    };
export interface RemediationApi {
  queryRemediationSummaries(
    filter?: { channelId?: string; supplierId?: string; executionId?: string },
    asOf?: string,
  ): Promise<readonly RemediationSummary[]>;
  getRemediation(id: string): Promise<RemediationDetail | null>;
  remediationOptions(): Promise<{
    channels: readonly { id: string; name: string; supplierId: string }[];
    assignees: readonly {
      id: string;
      name: string;
      channelIds: readonly string[];
    }[];
    executions: readonly {
      id: string;
      taskId: string;
      channelId: string;
      type: TestType;
      result: string | null;
      targetReference: string | null;
      current: boolean;
    }[];
    conclusions: readonly { id: string; executionId: string }[];
  }>;
  createRemediation(
    input: RemediationInput,
    requestId: string,
  ): Promise<string>;
  changeRemediation(
    id: string,
    version: number,
    input: RemediationOperation,
    reason: string,
    requestId: string,
  ): Promise<void>;
  previewRemediationClosure(
    id: string,
    version: number,
    executionId: string,
    conclusionId: string,
    applicabilityReason: string,
  ): Promise<string>;
  resetRemediations(confirmed: boolean): Promise<void>;
}
