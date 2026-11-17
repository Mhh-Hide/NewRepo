/**
 * Browser-only staging validator. Input bytes remain in the user's browser.
 * Supplier identities stay out of the PUBLIC source repository.
 * Client-side demo roles are display controls, NOT a security boundary.
 */
export interface DemoStagingSupplier {
  readonly id: string;
  readonly name: string;
  readonly shortCode: string;
  readonly source: 'spreadsheet_internal';
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
  readonly schemaVersion: 'demo-staging-v2';
  readonly summary: DemoStagingSummary;
  readonly supplierCandidates: readonly DemoStagingSupplier[];
  readonly warnings: readonly string[];
}
type Dict = Record<string, unknown>;
const isRecord = (value: unknown): value is Dict =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const counts = [
  'suppliers', 'resourceIntake', 'purchaseDemands',
  'supplierTests', 'customers', 'customerModelEconomics',
] as const;
const forbidden = new Set([
  'contactEmail', 'contactPhone', 'contactName', 'password',
  'apiKey', 'secret', 'token', 'actualPurchasePrice',
]);
function ensureNoCredentials(value: unknown, level = 0): void {
  if (level > 20) throw new Error('文件嵌套过深');
  if (Array.isArray(value)) {
    for (const element of value) ensureNoCredentials(element, level + 1);
  } else if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (forbidden.has(key)) throw new Error(`文件包含不允许导入的字段：${key}`);
      ensureNoCredentials(entry, level + 1);
    }
  }
}
export function previewDemoStaging(input: unknown): DemoStagingPreview {
  if (!isRecord(input) || input.schemaVersion !== 'demo-staging-v2')
    throw new Error('请使用新版供应商内部数据包（demo-staging-v2），旧版匿名包已停用');
  if (!isRecord(input.provenance) ||
      input.provenance.realSupplierNamesIncluded !== true ||
      input.provenance.realCustomerNamesIncluded !== false ||
      input.provenance.actualPurchasePricesIncluded !== false)
    throw new Error('导入包来源声明不符合内部演示数据规则');
  ensureNoCredentials(input);
  const datasets = {} as Record<(typeof counts)[number], readonly unknown[]>;
  for (const key of counts) {
    if (!Array.isArray(input[key])) throw new Error(`缺少合法数据集合：${key}`);
    datasets[key] = input[key] as readonly unknown[];
  }
  const ids = new Set<string>();
  const codes = new Set<string>();
  const names = new Set<string>();
  const suppliers = datasets.suppliers.map((record) => {
    if (!isRecord(record) ||
        typeof record.id !== 'string' || !/^SUP-[0-9]{3,}$/.test(record.id) ||
        typeof record.name !== 'string' || !record.name.trim() ||
        record.name.length > 160 ||
        typeof record.shortCode !== 'string' || !record.shortCode.trim() ||
        record.shortCode.length > 40 ||
        record.source !== 'spreadsheet_internal' ||
        record.verification !== 'unverified')
      throw new Error('供应商候选标识、名称、缩写或来源格式不正确');
    const candidate = {
      id: record.id,
      name: record.name.trim(),
      shortCode: record.shortCode.trim(),
      source: 'spreadsheet_internal' as const,
      verification: 'unverified' as const,
    };
    const normalizedCode = candidate.shortCode.toLocaleLowerCase();
    const normalizedName = candidate.name.toLocaleLowerCase();
    if (ids.has(candidate.id) || codes.has(normalizedCode) || names.has(normalizedName))
      throw new Error(`重复供应商标识或名称：${candidate.id}`);
    ids.add(candidate.id);
    codes.add(normalizedCode);
    names.add(normalizedName);
    return candidate;
  });
  const known = new Set(suppliers.map((supplier) => supplier.id));
  for (const row of [...datasets.resourceIntake, ...datasets.supplierTests]) {
    if (isRecord(row) && row.supplierId !== null && row.supplierId !== undefined &&
        (typeof row.supplierId !== 'string' || !known.has(row.supplierId)))
      throw new Error('资源或测试数据存在无效供应商关联');
  }
  return {
    schemaVersion: 'demo-staging-v2',
    supplierCandidates: suppliers,
    summary: {
      suppliers: suppliers.length,
      resourceIntake: datasets.resourceIntake.length,
      purchaseDemands: datasets.purchaseDemands.length,
      supplierTests: datasets.supplierTests.length,
      customers: datasets.customers.length,
      customerModelEconomics: datasets.customerModelEconomics.length,
    },
    warnings: [
      '原始供应商名称仅写入本浏览器的演示存储，不上传服务器；公共 GitHub 不包含这份名单。',
      '销售、解决方案和大客户角色的页面不得获得供应商名称或地名简称；仅使用不含身份含义的渠道代号。',
      '这是浏览器 Mock：角色切换不是真实身份认证，不适合共享含真实供应商名单的公开演示。',
      '本次只导入供应商主档；测试、资源和采购历史不自动变成已通过/可调度状态。',
    ],
  };
}
