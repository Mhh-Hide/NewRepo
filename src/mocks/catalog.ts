import type { Model, ModelVendor } from '../domain/entities';
const stamp = {
  source: 'mock' as const,
  createdAt: '2026-11-18T00:00:00.000Z',
  updatedAt: '2026-11-18T00:00:00.000Z',
  status: 'enabled' as const,
};
/** Published names only. A catalog entry does not assert an integrated supplier channel. */
export const catalogVendors: readonly ModelVendor[] = [
  ['v-kuaishou', '快手', 'kuaishou'],
  ['v-moonshot', '月之暗面', 'moonshot'],
  ['v-deepseek', '深度求索', 'deepseek'],
  ['v-zhipu', '智谱', 'zhipu'],
  ['v-alibaba', '阿里云', 'alibaba'],
  ['v-minimax', 'MiniMax', 'minimax'],
].map(([id, name, code]) => ({
  ...stamp,
  id: id!,
  name: name!,
  code: code!,
  businessDomain: 'domestic',
}));
const entries: [string, string, string, Model['category']][] = [
  ['v-byte', 'Doubao-1.5-pro', 'doubao-1-5-pro-32k-250115', 'text'],
  ['v-kuaishou', 'Kling 2.1', 'kling-v2-1', 'video'],
  ['v-moonshot', 'Kimi K2', 'kimi-k2-0905-preview', 'text'],
  ['v-deepseek', 'DeepSeek-V3', 'deepseek-chat', 'text'],
  ['v-deepseek', 'DeepSeek-R1', 'deepseek-reasoner', 'text'],
  ['v-zhipu', 'GLM-4.5', 'glm-4.5', 'text'],
  ['v-alibaba', 'Qwen3-235B-A22B', 'qwen3-235b-a22b', 'text'],
  ['v-minimax', 'MiniMax-M1', 'MiniMax-M1', 'text'],
];
export const catalogModels: readonly Model[] = entries.map(
  ([vendorId, name, code, category]) => ({
    ...stamp,
    id: `catalog-${code}`,
    vendorId,
    name,
    modelCode: code,
    version: name,
    category,
    regionVariant: 'global',
  }),
);
