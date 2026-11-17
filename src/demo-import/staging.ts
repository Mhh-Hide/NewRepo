/**
 * Offline-only parser for anonymized demo staging exports.
 * Deliberately does not touch repositories, storage or API adapters.
 * Raw supplier/customer identities, costs, credentials and contact data
 * must never be transported by this schema.
 */
export interface DemoStagingSupplier {
  readonly id: string;
  readonly name: string;
  readonly source: 'spreadsheet_redacted';
  readonly verification: 'unverified';
}
export interface DemoStagingSummary {
  readonly suppliers: number;
  readonly resourceIntake: number;
  readonly purchaseDemands: number;
  readonly supplierTests: number;
  readonly customers: number;
  readonly customerModelEconomics: number;
}
export interface DemoStagingPreview {
  readonly schemaVersion: 'demo-staging-v1';
  readonly summary: DemoStagingSummary;
  readonly supplierCandidates: readonly DemoStagingSupplier[];
  readonly warnings: readonly string[];
}
type Dict = Record<string, unknown>;
const object = (x: unknown): x is Dict =>
  x !== null && typeof x === 'object' && !Array.isArray(x);
const requiredArray = (x: Dict, key: string): readonly unknown[] => {
  if (!Array.isArray(x[key])) throw new Error(`缺少合法数据集合：${key}`);
  return x[key];
};
const SAFE_NAME = /^演示供应商\d{3,}$/u;
const SAFE_ID = /^SUP-\d{3,}$/u;
const keys = [
  'suppliers', 'resourceIntake', 'purchaseDemands',
  'supplierTests', 'customers', 'customerModelEconomics',
] as const;
const forbiddenKeys = new Set([
  'contactEmail', 'contactPhone', 'contactName', 'password', 'apiKey',
  'token', 'secret', 'actualPurchasePrice', 'realSupplierName',
  'realCustomerName', 'originalName', 'supplierOriginalName',
]);
function rejectSensitiveFields(value: unknown, depth = 0): void {
  if (depth > 20) throw new Error('数据嵌套过深');
  if (Array.isArray(value)) {
    for (const item of value) rejectSensitiveFields(item, depth + 1);
  } else if (object(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) throw new Error(`禁止包含敏感字段：${key}`);
      rejectSensitiveFields(entry, depth + 1);
    }
  }
}
/** No mutations; import candidates are NOT verified operational records. */
export function previewDemoStaging(raw: unknown): DemoStagingPreview {
  if (!object(raw) || raw.schemaVersion !== 'demo-staging-v1')
    throw new Error('导入包版本不受支持');
  if (!object(raw.provenance) ||
      raw.provenance.realCustomerNamesIncluded !== false ||
      raw.provenance.realSupplierNamesIncluded !== false ||
      raw.provenance.actualPurchasePricesIncluded !== false)
    throw new Error('导入包未通过脱敏来源声明');
  rejectSensitiveFields(raw);
  const arrays = Object.fromEntries(
    keys.map((key) => [key, requiredArray(raw, key)]),
  ) as Record<(typeof keys)[number], readonly unknown[]>;
  const suppliers = arrays.suppliers.map((item) => {
    if (!object(item) ||
        typeof item.id !== 'string' || !SAFE_ID.test(item.id) ||
        typeof item.name !== 'string' || !SAFE_NAME.test(item.name) ||
        item.source !== 'spreadsheet_redacted' ||
        item.verification !== 'unverified')
      throw new Error('供应商候选主档不符合匿名化规则');
    return {
      id: item.id, name: item.name,
      source: 'spreadsheet_redacted' as const,
      verification: 'unverified' as const,
    };
  });
  if (new Set(suppliers.map((s) => s.id)).size !== suppliers.length ||
      new Set(suppliers.map((s) => s.name)).size !== suppliers.length)
    throw new Error('供应商候选存在重复标识');
  const knownSuppliers = new Set(suppliers.map((s) => s.id));
  const missingSupplierRefs = [...arrays.resourceIntake, ...arrays.supplierTests]
    .filter((row) => object(row) &&
      typeof row.supplierId === 'string' &&
      !knownSuppliers.has(row.supplierId));
  if (missingSupplierRefs.length)
    throw new Error('资源或测试数据存在无效供应商关联');
  const summary = Object.fromEntries(
    keys.map((key) => [key, arrays[key].length]),
  ) as unknown as DemoStagingSummary;
  const warnings = [
    '仅供预览：候选供应商未经业务核验，不自动写入主档。',
    '资源台账与测试历史不等于通过质量或连通性验收，不自动生成可调度渠道。',
    '采购需求需先人工映射模型及客户；经营统计为模拟数据，不生成真实报价。',
    '不覆盖现有 LocalStorage、测试执行、审计记录及生命周期状态。',
  ];
  return {
    schemaVersion: 'demo-staging-v1',
    summary,
    supplierCandidates: suppliers,
    warnings,
  };
}
