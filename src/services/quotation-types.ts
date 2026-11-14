import type { ChannelQuote, Model, ModelVendor } from '../domain/entities';
import type { ChannelView } from '../auth/view-models';
import type {
  ManagedQuote,
  InquiryRecord,
  QuoteAudit,
  QuoteDecision,
  compareQuotes,
  quoteValidity,
} from '../domain/quotations';
import type { ResourceSupplier } from './resource-types';
export type { QuoteInput } from '../domain/quotations';
import type { QuoteInput } from '../domain/quotations';
export interface QuoteRow {
  readonly quote: ManagedQuote;
  readonly storedPriceStatus: ChannelQuote['priceStatus'];
  readonly channel: ChannelView;
  readonly supplier: ResourceSupplier;
  readonly model: Model;
  readonly vendor: ModelVendor;
  readonly version: number;
  readonly verified: boolean;
  readonly validity: ReturnType<typeof quoteValidity>;
  readonly updatedAt: string;
}
export interface QuoteDetail {
  readonly row: QuoteRow;
  readonly decisions: readonly QuoteDecision[];
  readonly history: readonly QuoteAudit[];
  readonly channelHistory: readonly QuoteRow[];
}
export interface QuoteOptions {
  readonly channels: readonly {
    readonly channel: ChannelView;
    readonly supplier: ResourceSupplier;
    readonly model: Model;
  }[];
  readonly demands: readonly {
    readonly id: string;
    readonly demandId: string;
    readonly label: string;
    readonly modelId: string;
    readonly targetPurchaseDiscount: number;
  }[];
  readonly inquiries: readonly InquiryRecord[];
  readonly quotes: readonly {
    readonly id: string;
    readonly channelId: string;
  }[];
}
export interface QuoteQuery {
  readonly demandItemId?: string;
  readonly search?: string;
  readonly channelId?: string;
  readonly supplierId?: string;
  readonly modelId?: string;
  readonly vendorId?: string;
  readonly status?: ChannelQuote['priceStatus'];
  readonly sourceType?: ChannelQuote['sourceType'];
  readonly currency?: string;
  readonly demandId?: string;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly validFrom?: string;
  readonly validTo?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly order?: 'asc' | 'desc';
}
export interface QuotePage {
  readonly rows: readonly QuoteRow[];
  readonly total: number;
  readonly stats: {
    readonly channels: number;
    readonly reference: number;
    readonly pending: number;
    readonly effective: number;
    readonly temporary: number;
    readonly expiring: number;
    readonly newChannels: number;
  };
}
export interface InquiryInput {
  readonly channelId: string;
  readonly demandItemId: string | null;
  readonly responseDueAt: string | null;
  readonly followUpNote: string;
}
export interface QuotationApi {
  queryQuotes(query?: QuoteQuery): Promise<QuotePage>;
  getQuote(id: string): Promise<QuoteDetail | null>;
  quoteOptions(): Promise<QuoteOptions>;
  createQuote(input: QuoteInput, requestId: string): Promise<QuoteRow>;
  verifyQuote(
    id: string,
    version: number,
    evidence: string,
    reason: string,
    requestId: string,
  ): Promise<void>;
  confirmQuote(
    id: string,
    version: number,
    evidence: string,
    effectiveFrom: string,
    reason: string,
    requestId: string,
  ): Promise<void>;
  listInquiries(
    channelId?: string,
    demandItemId?: string,
  ): Promise<readonly InquiryRecord[]>;
  createInquiry(input: InquiryInput, requestId: string): Promise<InquiryRecord>;
  updateInquiry(
    id: string,
    version: number,
    status: InquiryRecord['status'],
    note: string,
    requestId: string,
  ): Promise<void>;
  compareQuoteRecords(
    firstId: string,
    secondId: string,
  ): Promise<ReturnType<typeof compareQuotes>>;
  resetQuoteDemo(confirmed: boolean): Promise<void>;
}
