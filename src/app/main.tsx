import { initializeRuntimeData } from '../services/initialize-runtime';
async function start() {
  await initializeRuntimeData();
  await import('./bootstrap');
}
void start().catch(() => {
  document.getElementById('root')!.textContent =
    '演示初始化失败，请检查数据配置后刷新。';
});
