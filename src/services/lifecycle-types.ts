import type {
  DeliveryRecord,
  Phase,
  ContractStage,
  DispatchState,
  LifecycleTask,
  PhaseVerification,
  LifecycleEvent,
  LifecycleComment,
} from '../domain/lifecycle';
export type DeliveryCommand =
  | {
      action: 'assign';
      procurementOwnerId: string;
      testerId: string;
      operatorId: string;
    }
  | {
      action: 'resource';
      upstreamModelName: string;
      platformModelId: string;
      endpointReference: string;
      ttftMs: number | null;
      rpm: number | null;
      tpm: number | null;
      concurrency: number | null;
      credentialStatus: 'pending' | 'received';
      credentialReference: string | null;
      usageTerms: string;
    }
  | {
      action: 'acquire';
      procurementOwnerId: string;
      testerId: string;
      operatorId: string;
      demandId: string | null;
      dueAt: string | null;
      credentialStatus: 'pending' | 'received';
      credentialReference: string | null;
      credentialRecipientId: string;
      usageTerms: string;
    }
  | {
      action: 'verify';
      phase: Phase;
      executionId: string;
      ttftMs: number | null;
      rpm: number | null;
      tpm: number | null;
      concurrency: number | null;
      metering: 'pending' | 'passed' | 'failed';
      billing: 'pending' | 'passed' | 'failed';
      conclusion: 'passed' | 'failed';
      evidenceReference: string;
    }
  | {
      action: 'contract';
      stage: ContractStage;
      number: string;
      handler: string;
      nextAction: string;
      nextOwnerId: string;
      dueAt: string | null;
      effectiveAt: string | null;
      paperStatus: 'unknown' | 'pending' | 'returned';
    }
  | {
      action: 'configuration';
      sent: boolean;
      recipientId: string;
      received: boolean;
      configured: boolean;
      reference: string;
    }
  | { action: 'dispatch'; state: DispatchState }
  | { action: 'hold' | 'resume' | 'terminate' }
  | {
      action: 'feedback';
      executionId: string;
      remediationId: string;
      recipientId: string;
      feedbackAt: string;
      summary: string;
    }
  | { action: 'comment'; body: string; recipientIds: string[] }
  | { action: 'supplier-communication'; groupName: string; notes: string };
export interface LifecycleRow {
  id: string;
  modelId: string;
  modelName: string;
  upstreamModelName: string;
  platformModelId: string;
  supplierId: string;
  supplierName: string;
  supplierShortCode: string;
  channelType: string;
  channelName: string;
  version: number;
  record: DeliveryRecord | null;
  qualityVerificationId: string | null;
  integrationVerificationId: string | null;
  percent: number;
  delivered: boolean;
  schedulable: boolean;
  legacy: boolean;
  stage: string;
  stageIndex: number;
  currentOwnerId: string | null;
  currentOwner: string;
  blocker: string;
  nextAction: string;
  updatedAt: string;
  dueAt: string | null;
  overdue: boolean;
  abnormal: boolean;
  steps: { label: string; done: boolean }[];
  extra: { label: string; done: boolean }[];
  promised: {
    ttftMs: number | null;
    rpm: number | null;
    tpm: number | null;
    concurrency: number | null;
  };
  measured: {
    ttftMs: number | null;
    rpm: number | null;
    tpm: number | null;
    concurrency: number | null;
  } | null;
  contractStage: string;
  dispatch: string;
  quality: string;
  integration: string;
  remediationIds: string[];
  quoteStatus?: string;
}
export interface LifecycleDetail {
  row: LifecycleRow;
  verifications: PhaseVerification[];
  events: LifecycleEvent[];
  comments: LifecycleComment[];
  executions: {
    id: string;
    taskId: string;
    phase: Phase;
    result: string | null;
    startedAt: string;
    current: boolean;
  }[];
  remediations: {
    id: string;
    status: string;
    sourceExecutionId: string | null;
    round: number | null;
  }[];
  communication: { groupName: string; notes: string } | null;
}
export interface LifecycleQuery {
  modelId?: string;
  supplierId?: string;
  stage?: string;
  ownerId?: string;
  open?: boolean;
  abnormal?: boolean;
  mine?: boolean;
  overdue?: boolean;
}
export interface LifecycleApi {
  queryLifecycle(filter?: LifecycleQuery): Promise<{
    rows: LifecycleRow[];
    stats: Record<string, number>;
    users: { id: string; name: string; role: string }[];
  }>;
  getLifecycle(id: string): Promise<LifecycleDetail | null>;
  changeLifecycle(
    id: string,
    version: number,
    input: DeliveryCommand,
    reason: string,
    requestId: string,
  ): Promise<void>;
  lifecycleOptions(id: string): Promise<{
    users: { id: string; name: string; role: string }[];
    demands: { id: string; label: string }[];
  }>;
  queryLifecycleTasks(
    view?: 'mine' | 'mentions' | 'sent' | 'waiting' | 'completed' | 'overdue',
  ): Promise<LifecycleTask[]>;
  changeLifecycleTask(
    id: string,
    action: 'read' | 'complete' | 'cancel' | 'reopen',
    reason: string,
    requestId: string,
    version: number,
  ): Promise<void>;
  recordCustomerContract(
    demandId: string,
    version: number,
    signedAt: string,
    requestId: string,
  ): Promise<void>;
  resourceGoal(demandId: string): Promise<{
    customerSigned: boolean;
    targetChannels: 1 | 3;
    usableChannels: number;
    distinctSuppliers: number;
    version: number;
    basis: 'first_quality' | 'schedulable';
  }>;
  retryLifecycleSignals(id: string): Promise<void>;
}
