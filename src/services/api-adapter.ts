import type { DemoInfo } from '../domain/demo';
/** Add domain-oriented methods after their PRDs are confirmed. Never expose upstream DTOs. */
export interface ApiAdapter {
  getDemoInfo(): Promise<DemoInfo>;
}
