/** All demo records carry an explicit provenance marker. */
export interface DemoInfo {
  readonly source: 'mock';
  readonly projectName: string;
  readonly stage: '00';
}
