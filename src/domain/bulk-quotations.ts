import type { QuoteInput, ManagedQuote } from './quotations';
/** Drafts reuse quote input semantics but may omit unfinished fields. They are not prices. */
export interface BulkQuoteItem {
  readonly itemId: string;
  readonly batchId: string;
  readonly channelId: string;
  readonly previousQuoteId: string | null;
  readonly proposedQuoteInput: Partial<QuoteInput>;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface BulkQuoteBatch {
  readonly id: string;
  readonly batchNo: string;
  readonly supplierId: string;
  readonly status: 'draft' | 'submitted';
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly sourceReference: string;
  readonly sharedReason: string;
  readonly submittedBy: string | null;
  readonly submittedAt: string | null;
  readonly items: readonly BulkQuoteItem[];
}
export interface BulkQuoteEvent {
  readonly id: string;
  readonly batchId: string;
  readonly action: 'created' | 'edited' | 'submitted';
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly requestId: string;
  readonly beforeVersion: number | null;
  readonly afterVersion: number;
  readonly addedItemIds: readonly string[];
  readonly removedItemIds: readonly string[];
  readonly changes: readonly {
    readonly itemId: string | null;
    readonly field: string;
    readonly before: string | null;
    readonly after: string | null;
  }[];
  readonly quoteIds: readonly string[];
  readonly channelIds: readonly string[];
  readonly demandIds: readonly string[];
  readonly demandItemIds: readonly string[];
}
export interface BulkQuoteSubmission {
  readonly id: string;
  readonly batchId: string;
  readonly actorUserId: string;
  readonly submittedAt: string;
  readonly requestId: string;
  readonly result: 'succeeded';
  readonly mappings: readonly {
    readonly itemId: string;
    readonly quoteId: string;
  }[];
}
export interface BulkDraftInput {
  readonly sourceReference: string;
  readonly sharedReason: string;
  readonly items: readonly {
    readonly itemId: string;
    readonly proposedQuoteInput: Partial<QuoteInput>;
  }[];
}
export interface BulkIssue {
  readonly field: string;
  readonly message: string;
}
export interface BulkPreviewRow {
  readonly itemId: string;
  readonly rowNumber: number;
  readonly channelName: string;
  readonly modelName: string;
  readonly errors: readonly BulkIssue[];
  readonly warnings: readonly BulkIssue[];
  readonly prior: ManagedQuote | null;
  readonly priorRecordedStatus: ManagedQuote['priceStatus'] | null;
  readonly priorVersion: number | null;
  readonly activeFormalCount: number;
  readonly proposedValidity: ReturnType<
    typeof import('./procurement-analytics').analysisValidity
  > | null;
  readonly input: Partial<QuoteInput>;
  readonly numericDifferenceBps: number | null;
  readonly comparison: ReturnType<
    typeof import('./procurement-analytics').compareAnalysis
  > | null;
}

export interface BulkPreview {
  readonly batchId: string;
  readonly version: number;
  readonly asOf: string;
  readonly token: string;
  readonly canSubmit: boolean;
  readonly errors: readonly BulkIssue[];
  readonly rows: readonly BulkPreviewRow[];
}
