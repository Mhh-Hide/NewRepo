import { describe, expect, it } from 'vitest';
import { previewDemoStaging } from '../../src/demo-import/staging';

function valid() {
  return {
    schemaVersion: 'demo-staging-v1',
    provenance: {
      realCustomerNamesIncluded: false,
      realSupplierNamesIncluded: false,
      actualPurchasePricesIncluded: false,
    },
    suppliers: [
      { id: 'SUP-001', name: '演示供应商001', source: 'spreadsheet_redacted', verification: 'unverified' },
    ],
    resourceIntake: [{ id: 'RS-1', supplierId: 'SUP-001' }],
    purchaseDemands: [{ id: 'DMD-1' }],
    supplierTests: [{ id: 'TEST-1', supplierId: 'SUP-001' }],
    customers: [],
    customerModelEconomics: [],
  };
}

describe('demo staging preview (read only)', () => {
  it('summarizes anonymized data without requiring storage', () => {
    const result = previewDemoStaging(valid());
    expect(result.summary).toEqual({
      suppliers: 1,
      resourceIntake: 1,
      purchaseDemands: 1,
      supplierTests: 1,
      customers: 0,
      customerModelEconomics: 0,
    });
    expect(result.supplierCandidates[0]?.verification).toBe('unverified');
  });
  it('rejects files without a redaction declaration', () => {
    const input = valid();
    input.provenance.realCustomerNamesIncluded = true;
    expect(() => previewDemoStaging(input)).toThrow('脱敏来源声明');
  });
  it('rejects sensitive fields at arbitrary depth', () => {
    const input = valid();
    expect(() => previewDemoStaging({ ...input, suppliers: [{ ...input.suppliers[0], contactPhone: '123' }] }))
      .toThrow('敏感字段');
  });
  it('rejects dangling supplier references', () => {
    const input = valid();
    expect(() => previewDemoStaging({ ...input, supplierTests: [{ supplierId: 'SUP-999' }] }))
      .toThrow('供应商关联');
  });
  it('rejects repeated identities', () => {
    const input = valid();
    expect(() => previewDemoStaging({ ...input, suppliers: [input.suppliers[0], input.suppliers[0]] }))
      .toThrow('重复标识');
  });
  it('rejects unredacted supplier names', () => {
    const input = valid();
    expect(() => previewDemoStaging({ ...input, suppliers: [{ ...input.suppliers[0], name: '某实际供应商' }] }))
      .toThrow('匿名化规则');
  });
});
