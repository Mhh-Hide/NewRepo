import { it, expect } from 'vitest';
import { fixture, applyPrivateFixture } from '../../src/mocks/data';
import { enablePrivateData } from '../../src/services/runtime-data';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { SupplierRepository } from '../../src/mocks/supplier-repository';
import { validateStore } from '../../src/domain/validation';

it('keeps imported unclassified supplier leads editable by assigned procurement without expanding operations scope', async () => {
  const supplier = {
    ...fixture.suppliers[0]!,
    id: 's-unclassified-import',
    name: '未分类供应商样本',
    shortCode: '未分类样本',
    ownerUserId: 'unassigned-proc',
  };
  applyPrivateFixture({
    suppliers: [...fixture.suppliers, supplier],
    supplierGrants: [
      ...fixture.supplierGrants,
      { userId: 'u-proc', supplierId: supplier.id },
      { userId: 'unassigned-proc', supplierId: supplier.id },
    ],
  });
  expect(validateStore(fixture)).toEqual([]);
  enablePrivateData();
  const data = new Map<string, string>();
  const repo = new SupplierRepository({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  });
  const procurement = createMockAdapter('u-proc', undefined, repo);
  const before = (await procurement.getSupplier(supplier.id))!.supplier;
  await procurement.updateSupplier(supplier.id, before.version, {
    name: before.name,
    shortCode: before.shortCode,
    supplierCategory: before.supplierCategory,
    cooperationStatus: before.cooperationStatus,
    ownerUserId: before.ownerUserId!,
    wechatGroupName: '采购协作群样本',
  });
  expect(
    (await procurement.getSupplier(supplier.id))?.supplier.wechatGroupName,
  ).toBe('采购协作群样本');
  expect(
    await createMockAdapter('u-domestic', 'domestic', repo).getSupplier(
      supplier.id,
    ),
  ).toBeNull();
  expect(
    await createMockAdapter('u-overseas', 'overseas', repo).getSupplier(
      supplier.id,
    ),
  ).toBeNull();
});
