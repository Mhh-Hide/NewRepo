import { createDemoSession, listDemoProfiles } from './demo-session';
import type { DemoSession, DomainSelection } from './demo-session';
export interface DemoSelection {
  readonly id: string;
  readonly domain: DomainSelection;
}
export function selectDemoIdentity(id: string): DemoSelection {
  const profile = listDemoProfiles().find((p) => p.user.id === id);
  if (!profile) throw Error('未知演示身份');
  return {
    id,
    domain: profile.domains.length === 1 ? profile.domains[0]! : 'all',
  };
}
/** Validate first, then revoke the same session used by all business routes. */
export function replaceDemoSession(
  previous: DemoSession,
  next: DemoSelection,
): DemoSession {
  const session = createDemoSession(next.id, next.domain);
  previous.revokeWrites();
  return session;
}
