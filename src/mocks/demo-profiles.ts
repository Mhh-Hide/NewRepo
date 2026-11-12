import { fixture } from './data';
import type { DemoProfile } from '../services/demo-session';
export function getMockProfiles(): readonly DemoProfile[] {
  return structuredClone(
    fixture.users.map((user) => ({
      user,
      domains: fixture.domainGrants
        .filter((g) => g.userId === user.id)
        .map((g) => g.businessDomain),
    })),
  );
}
