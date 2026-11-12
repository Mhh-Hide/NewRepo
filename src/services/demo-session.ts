import type { DemoUser, PermissionAction } from '../auth/types';
import type { BusinessDomain } from '../domain/entities';
import type { ApiAdapter } from './api-adapter';
import { createMockAdapter } from '../mocks/mock-adapter';
import { getMockProfiles } from '../mocks/demo-profiles';
import { can } from '../auth/policy';
export interface DemoProfile {
  readonly user: DemoUser;
  readonly domains: readonly BusinessDomain[];
}
export type DomainSelection = BusinessDomain | 'all';
export interface DemoSession {
  readonly profile: DemoProfile;
  readonly domain: DomainSelection;
  readonly api: ApiAdapter;
  readonly permits: (action: PermissionAction) => boolean;
}
/** Only non-sensitive demo identity metadata; never exposes customer/supplier grants. */
export const listDemoProfiles = (): readonly DemoProfile[] => getMockProfiles();
export function createDemoSession(
  userId: string,
  domain: DomainSelection = 'all',
): DemoSession {
  const profile = listDemoProfiles().find((p) => p.user.id === userId);
  if (!profile) throw new Error('未知演示身份');
  if (domain !== 'all' && !profile.domains.includes(domain))
    throw new Error('未授权的业务域');
  const ctx = {
    user: profile.user,
    domains: profile.domains,
    supplierIds: [],
    customerIds: [],
  };
  return {
    profile,
    domain,
    api: createMockAdapter(userId, domain === 'all' ? undefined : domain),
    permits: (action) => can(ctx, action),
  };
}
