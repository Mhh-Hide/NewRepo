export interface Metric {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly note: string;
}
export interface Dimension {
  readonly name: string;
  readonly basis: string;
  readonly counts: readonly {
    readonly label: string;
    readonly value: number;
  }[];
}
export interface Activity {
  readonly id: string;
  readonly title: string;
  readonly occurredAt: string;
  readonly kind: string;
}
export interface DashboardData {
  readonly source: 'mock';
  readonly metrics: readonly Metric[];
  readonly dimensions: readonly Dimension[];
  readonly todos: readonly {
    readonly label: string;
    readonly count: number;
    readonly path: string;
  }[];
  readonly activities: readonly Activity[];
  readonly suppliers: readonly {
    readonly id: string;
    readonly name: string;
    readonly shortCode: string;
    readonly status: string;
  }[];
  readonly channels: readonly {
    readonly id: string;
    readonly name: string;
    readonly model: string;
    readonly tpm: number | null;
    readonly rpm: number | null;
    readonly supplierName?: string;
    readonly quality: string;
    readonly connectivity: string;
    readonly integration: string;
    readonly availability: string;
  }[];
  readonly quotes: readonly {
    readonly id: string;
    readonly channel: string;
    readonly discount: number;
    readonly status: string;
  }[];
  readonly isEmpty: boolean;
}
