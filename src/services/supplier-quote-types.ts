import type { ChannelInput } from './channel-types';
import type { DiscountBps } from '../domain/entities';
export interface SupplierQuoteInput {
  readonly supplierId: string;
  readonly quotedAt: string | null;
  readonly ownerId: string;
  readonly remark: string;
  readonly rows: readonly (ChannelInput & {
    readonly modelId: string;
    readonly discount: DiscountBps;
    readonly channelId?: string;
    readonly cacheRequirement?: string;
    readonly note?: string;
  })[];
}
export interface SupplierQuoteApi {
  saveSupplierQuote(
    input: SupplierQuoteInput,
    requestId: string,
  ): Promise<{
    readonly batchId: string;
    readonly quoteIds: readonly string[];
  }>;
}
