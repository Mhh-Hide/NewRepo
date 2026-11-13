import type { Channel, TestTask } from '../domain/entities';
import type { ChannelView } from '../auth/view-models';
export type ManagedChannel = Channel & {
  readonly version: number;
  readonly createdBy: string;
  readonly updatedBy: string;
};
export type ChannelInput = Pick<
  Channel,
  | 'displayName'
  | 'channelType'
  | 'modelInvocationName'
  | 'endpointReference'
  | 'tpm'
  | 'rpm'
  | 'concurrencyLimit'
  | 'ttftMs'
>;
export interface ChannelChange {
  readonly id: string;
  readonly channelId: string;
  readonly action: string;
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly changedFields: readonly string[];
  readonly beforeSnapshot: ManagedChannel | null;
  readonly afterSnapshot: ManagedChannel;
}
export interface ChannelState {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly channels: readonly ManagedChannel[];
  readonly tasks: readonly TestTask[];
  readonly history: readonly ChannelChange[];
}
export interface ChannelApi {
  channelAccess(): Promise<{
    readonly supplierIdentity: boolean;
    readonly technical: boolean;
    readonly reset: boolean;
  }>;
  createChannel(
    input: ChannelInput & Pick<Channel, 'supplierId' | 'modelId'>,
  ): Promise<ChannelView>;
  updateChannel(
    id: string,
    version: number,
    input: ChannelInput,
  ): Promise<ChannelView>;
  toggleChannel(
    id: string,
    version: number,
    status: Channel['resourceStatus'],
  ): Promise<ChannelView>;
  bindChannelOp(
    id: string,
    version: number,
    opId: string,
    confirmed: boolean,
  ): Promise<ChannelView>;
  channelVersion(id: string): Promise<number | null>;
  channelHistory(id: string): Promise<readonly ChannelChange[]>;
  resetChannelDemo(confirmed: boolean): Promise<void>;
}
