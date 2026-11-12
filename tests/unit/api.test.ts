import { describe, expect, it } from 'vitest';
import { api } from '../../src/services/api';
describe('demo API composition', () => {
  it('returns typed mock metadata without network access', async () => {
    await expect(api.getDemoInfo()).resolves.toEqual({
      source: 'mock',
      projectName: 'MaaS Resource Lifecycle Management',
      stage: '00',
    });
  });
});
