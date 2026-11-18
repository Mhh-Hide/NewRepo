export interface ModelResponsibility {
  readonly modelId: string;
  readonly procurementOwnerId: string;
  readonly operationsOwnerId: string;
  readonly version: number;
}
export interface ResponsibilityApi {
  modelResponsibilities(): Promise<readonly ModelResponsibility[]>;
  assignModelOwners(
    modelId: string,
    version: number,
    procurementOwnerId: string,
    operationsOwnerId: string,
  ): Promise<void>;
}
