import type { ApiAdapter } from '../services/api-adapter';
export const mockAdapter: ApiAdapter = {
  async getDemoInfo() {
    return {
      source: 'mock',
      projectName: 'MaaS Resource Lifecycle Management',
      stage: '00',
    };
  },
};
