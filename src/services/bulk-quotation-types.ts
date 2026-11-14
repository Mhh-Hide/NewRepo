import type {
  BulkQuoteBatch,
  BulkDraftInput,
  BulkPreview,
  BulkQuoteEvent,
  BulkQuoteSubmission,
} from '../domain/bulk-quotations';
import type { QuoteOptions } from './quotation-types';
export interface BulkBatchSummary {
  readonly id: string;
  readonly batchNo: string;
  readonly supplier: { readonly id: string; readonly name: string };
  readonly status: BulkQuoteBatch['status'];
  readonly itemCount: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt: string | null;
}
export interface BulkBatchDetail {
  readonly batch: BulkQuoteBatch;
  readonly supplier: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly history: readonly BulkQuoteEvent[];
  readonly submission: BulkQuoteSubmission | null;
}
export interface BulkQuotationApi {
  queryBulkBatches(query?: {
    readonly search?: string;
    readonly supplierId?: string;
    readonly status?: BulkQuoteBatch['status'];
  }): Promise<readonly BulkBatchSummary[]>;
  getBulkBatch(id: string): Promise<BulkBatchDetail | null>;
  bulkQuoteOptions(): Promise<{
    readonly suppliers: readonly {
      readonly id: string;
      readonly name: string;
      readonly status: string;
    }[];
    readonly quoteOptions: QuoteOptions;
  }>;
  createBulkBatch(
    input: {
      readonly supplierId: string;
      readonly sourceReference: string;
      readonly sharedReason: string;
    },
    requestId: string,
  ): Promise<BulkBatchDetail>;
  updateBulkDraft(
    id: string,
    version: number,
    input: BulkDraftInput,
    requestId: string,
  ): Promise<BulkBatchDetail>;
  previewBulkBatch(id: string, version: number): Promise<BulkPreview>;
  submitBulkBatch(
    id: string,
    version: number,
    token: string,
    confirmed: boolean,
    requestId: string,
  ): Promise<BulkQuoteSubmission>;
  getBulkQuoteOrigin(quoteId: string): Promise<{
    readonly batchId: string;
    readonly batchNo: string;
    readonly itemId: string;
  } | null>;
}
