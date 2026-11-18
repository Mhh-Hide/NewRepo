export interface CooperationIncidentInput {
  date: string;
  description: string;
  scope: string;
  result: string;
  note: string;
  channelIds: readonly string[];
}
export interface CooperationIncident extends CooperationIncidentInput {
  id: string;
  supplierId: string;
  createdBy: string;
  updatedAt: string;
  version: number;
  history: readonly {
    actor: string;
    at: string;
    before: CooperationIncidentInput | null;
    after: CooperationIncidentInput;
  }[];
}
export interface CooperationApi {
  supplierAccidents(
    supplierId: string,
  ): Promise<readonly CooperationIncident[]>;
  saveSupplierAccident(
    supplierId: string,
    id: string | null,
    version: number,
    input: CooperationIncidentInput,
  ): Promise<void>;
  quoteFollowup(quoteId: string): Promise<boolean>;
  setQuoteFollowup(quoteId: string, value: boolean): Promise<void>;
}
