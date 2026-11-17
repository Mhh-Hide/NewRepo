import { describe, expect, it } from 'vitest';
import { previewDemoStaging } from '../../src/demo-import/staging';
function valid() {
  return {
    schemaVersion: 'demo-staging-v2',
    provenance: {
      realSupplierNamesIncluded: true,
      realCustomerNamesIncluded: false,
      actualPurchasePricesIncluded: false,
    },
    suppliers: [
      { id: 'SUP-001', name: '北京一森科技', shortCode: '北京一森', source: 'spreadsheet_internal', verification: 'unverified' },
    ],
    resourceIntake: [{ supplierId: 'SUP-001' }, { supplierId: null }],
    purchaseDemands: [],
    supplierTests: [{ supplierId: 'SUP-001' }],
    customers: [],
    customerModelEconomics: [],
  };
}
describe('internal supplier staging preview', () => {
  it('preserves actual names in a local-only preview', () => {
    const result = previewDemoStaging(valid());
    expect(result.summary.suppliers).toBe(1);
    expect(result.supplierCandidates[0]).toMatchObject({ name: '北京一森科技', shortCode: '北京一森' });
  });
  it('rejects stale anonymized v1 package', () => {
    expect(() => previewDemoStaging({ ...valid(), schemaVersion: 'demo-staging-v1' })).toThrow('新版');
  });
  it('rejects omitted provenance declaration', () => {
    expect(() => previewDemoStaging({ ...valid(), provenance: {} })).toThrow('来源声明');
  });
  it('does not permit contact credentials in input', () => {
    expect(() => previewDemoStaging({ ...valid(), suppliers: [{ ...valid().suppliers[0], contactPhone: '123' }] })).toThrow('不允许');
  });
  it('rejects duplicate identities and codes ignoring case', () => {
    const row = valid().suppliers[0]!;
    expect(() => previewDemoStaging({ ...valid(), suppliers: [row, { ...row, id: 'SUP-002' }] })).toThrow('重复');
  });
  it('rejects dangling relations but permits explicit unresolved composite links', () => {
    expect(() => previewDemoStaging({ ...valid(), supplierTests: [{ supplierId: 'SUP-999' }] })).toThrow('无效供应商关联');
    expect(previewDemoStaging(valid()).summary.resourceIntake).toBe(2);
  });
});
