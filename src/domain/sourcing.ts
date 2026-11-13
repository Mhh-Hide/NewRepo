import type {
  Channel,
  Demand,
  DemandItem,
  DemandChannelMatch,
  SnapshotValue,
} from './entities';
import type { SourcingStatus } from './statuses';
export const priorityLabels = {
  normal: '普通',
  high: '高优先级',
  urgent: '紧急',
} as const;
export type Priority = keyof typeof priorityLabels;
export const matchStatusLabels = {
  candidate: '候选',
  suitable: '初步符合',
  unsuitable: '不符合',
  excluded: '已排除',
} as const;
export type ManagedDemand = Demand & {
  readonly demandCode: string;
  readonly title: string;
  readonly description: string;
  readonly sharedTitle: string;
  readonly sharedSummary: string;
  readonly priority: Priority;
  readonly dueAt: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly updatedBy: string;
};
export type ManagedDemandItem = DemandItem & {
  readonly requiredRegion: string;
  readonly priority: Priority;
  readonly createdAt: string;
  readonly updatedAt: string;
};
export type ManagedMatch = DemandChannelMatch & {
  readonly assessment: string;
  readonly createdBy: string;
  readonly updatedAt: string;
};
export interface SourcingEvent {
  readonly id: string;
  readonly demandId: string;
  readonly demandItemId: string | null;
  readonly matchId: string | null;
  readonly action:
    | 'created'
    | 'updated'
    | 'candidate_added'
    | 'candidate_updated'
    | 'progress';
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly note: string;
  readonly changes: readonly {
    readonly field: string;
    readonly before: SnapshotValue;
    readonly after: SnapshotValue;
  }[];
}
export interface SourcingState {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly demands: readonly ManagedDemand[];
  readonly items: readonly ManagedDemandItem[];
  readonly matches: readonly ManagedMatch[];
  readonly history: readonly SourcingEvent[];
}
export type Requirement = Pick<
  DemandItem,
  'requiredTpm' | 'requiredRpm' | 'requiredConcurrency' | 'requiredTtftMs'
> & { readonly requiredRegion?: string };
export type Capacity = Pick<
  Channel,
  'id' | 'tpm' | 'rpm' | 'concurrencyLimit' | 'ttftMs' | 'resourceStatus'
> & { readonly supplierId?: string };
export interface Fit {
  readonly result: 'yes' | 'no' | 'unknown';
  readonly reasons: readonly string[];
}
export const fitLabels = {
  yes: '明确符合能力要求',
  no: '明确不符合',
  unknown: '信息不足，需人工判断',
} as const;
export function assessCapacity(item: Requirement, c: Capacity): Fit {
  if (c.resourceStatus !== 'enabled')
    return { result: 'no', reasons: ['资源主档已停用'] };
  const reasons: string[] = [];
  let insufficient = false;
  let checked = 0;
  for (const [label, required, actual, lower] of [
    ['TPM', item.requiredTpm, c.tpm, false],
    ['RPM', item.requiredRpm, c.rpm, false],
    ['并发', item.requiredConcurrency, c.concurrencyLimit, false],
    ['TTFT (ms)', item.requiredTtftMs, c.ttftMs, true],
  ] as const) {
    if (required === null) {
      reasons.push(`${label} 需求未知`);
      continue;
    }
    checked++;
    if (actual === null) {
      reasons.push(`${label} 渠道能力未知`);
      continue;
    }
    if (lower ? actual > required : actual < required) {
      insufficient = true;
      reasons.push(`${label} 不满足要求`);
    }
  }
  if (item.requiredRegion) reasons.push('地区或部署限制需人工核实');
  return {
    result: insufficient
      ? 'no'
      : reasons.length || !checked
        ? 'unknown'
        : 'yes',
    reasons,
  };
}
export interface Coverage {
  readonly candidates: number;
  readonly suppliers: number;
  readonly suitableSuppliers: number;
  readonly missing: number;
  readonly phase:
    'not_started' | 'pending' | 'shortfall' | 'confirmed_gap' | 'covered';
}
export const coverageLabels = {
  not_started: '尚未开展寻源',
  pending: '已有候选，待核实',
  shortfall: '初步符合不足三家',
  confirmed_gap: '已确认资源不足',
  covered: '初步覆盖达标',
} as const;
export function sourcingCoverage(
  item: Requirement & { readonly id: string },
  matches: readonly DemandChannelMatch[],
  channels: readonly Capacity[],
  status: SourcingStatus,
): Coverage {
  const relations = matches.filter(
    (m) =>
      m.demandItemId === item.id && channels.some((c) => c.id === m.channelId),
  );
  const active = relations.filter((m) => m.matchStatus !== 'excluded');
  const selected = active.flatMap((m) => {
    const c = channels.find((c) => c.id === m.channelId);
    return c?.supplierId ? [c.supplierId] : [];
  });
  const suitable = active.flatMap((m) => {
    const c = channels.find((c) => c.id === m.channelId);
    return m.matchStatus === 'suitable' &&
      c?.supplierId &&
      assessCapacity(item, c).result !== 'no'
      ? [c.supplierId]
      : [];
  });
  const count = new Set(suitable).size;
  const missing = Math.max(0, 3 - count);
  return {
    candidates: active.length,
    suppliers: new Set(selected).size,
    suitableSuppliers: count,
    missing,
    phase: !missing
      ? 'covered'
      : status === 'gap'
        ? 'confirmed_gap'
        : !relations.length
          ? 'not_started'
          : count
            ? 'shortfall'
            : 'pending',
  };
}
export const sourcingTransitions: Readonly<
  Record<SourcingStatus, readonly SourcingStatus[]>
> = {
  draft: ['sourcing', 'closed'],
  sourcing: ['gap', 'matched', 'closed'],
  gap: ['sourcing', 'matched', 'closed'],
  matched: ['sourcing', 'gap', 'closed'],
  closed: [],
};
