import { beforeEach, describe, expect, it } from 'vitest';
import { SupplierRepository, type StoragePort } from '../../src/mocks/supplier-repository';
import { createMockAdapter } from '../../src/mocks/mock-adapter';

class MemoryStorage implements StoragePort {
  raw: string | null = null;
  getItem() { return this.raw; }
  setItem(_key: string, value: string) { this.raw = value; }
}
const candidates = [
  { id: 'SUP-001', name: '演示供应商001' },
  { id: 'SUP-002', name: '演示供应商002' },
];
let storage: MemoryStorage;
let repository: SupplierRepository;
const api = (userId = 'u-ops', domain?: 'domestic' | 'overseas') =>
  createMockAdapter(userId, domain, repository);
beforeEach(() => {
  storage = new MemoryStorage();
  repository = new SupplierRepository(storage);
});

describe('atomic anonymous supplier candidate import', () => {
  it('creates disabled records and audit events without channels', async () => {
    expect(await api().importDemoSupplierCandidates(candidates)).toEqual({ created: 2, skipped: 0 });
    const rows = repository.read().suppliers.filter((s) => s.shortCode.startsWith('SUP-'));
    expect(rows).toHaveLength(2);
    expect(rows.map((s) => s.status)).toEqual(['disabled', 'disabled']);
    expect(rows.every((s) => s.cooperationStatus === 'potential')).toBe(true);
    expect(rows.every((s) => s.contactEmail === '' && s.contactPhone === '')).toBe(true);
    expect(repository.read().history.filter((e) => e.supplierId.startsWith('demo-import-'))).toHaveLength(2);
    expect((await api().getSupplier('demo-import-SUP-001'))?.resources.channelCount).toBe(0);
  });
  it('is idempotent and does not append duplicate history', async () => {
    await api().importDemoSupplierCandidates(candidates);
    const before = repository.read();
    expect(await api().importDemoSupplierCandidates(candidates)).toEqual({ created: 0, skipped: 2 });
    expect(repository.read()).toEqual(before);
  });
  it('fails atomically when a candidate conflicts with an imported code', async () => {
    await api().importDemoSupplierCandidates(candidates);
    const before = repository.read();
    await expect(api().importDemoSupplierCandidates([
      { id: 'SUP-003', name: '演示供应商003' },
      { id: 'SUP-001', name: '演示供应商999' },
    ])).rejects.toMatchObject({ code: 'DUPLICATE' });
    expect(repository.read()).toEqual(before);
  });
  it('prevents unauthorized and single-domain imports', async () => {
    await expect(api('u-proc').importDemoSupplierCandidates(candidates)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(api('u-ops', 'domestic').importDemoSupplierCandidates(candidates)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(storage.raw).toBeNull();
  });
  it('rejects duplicate unredacted and invalid candidate identifiers', async () => {
    for (const bad of [
      [...candidates, candidates[0]!],
      [{ id: 'SUP-001', name: '真实公司' }],
      [{ id: 'bad', name: '演示供应商003' }],
    ]) {
      await expect(api().importDemoSupplierCandidates(bad)).rejects.toMatchObject({ code: 'VALIDATION' });
    }
    expect(storage.raw).toBeNull();
  });
});
