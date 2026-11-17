import { enablePrivateData } from './runtime-data';
import { applyPrivateFixture } from '../mocks/data';
export async function initializeRuntimeData() {
  if (import.meta.env.DEV) {
    const response = await fetch('/__local_business_data', {
      cache: 'no-store',
    });
    if (
      response.status === 200 &&
      response.headers.get('content-type')?.includes('application/json')
    ) {
      const data = await response.json();
      applyPrivateFixture(data);
      enablePrivateData();
    } else if (response.status !== 204)
      throw new Error('内部数据加载失败，请检查本机演示配置');
  }
}
