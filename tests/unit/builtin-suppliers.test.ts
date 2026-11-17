import { describe, expect, it } from 'vitest';
import { SupplierRepository, type StoragePort } from '../../src/mocks/supplier-repository';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { builtinSupplierDirectory } from '../../src/mocks/builtin-supplier-directory';
class MemoryStorage implements StoragePort {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
describe('built-in supplier directory', () => {
  it('loads 95 supplied suppliers on first visit without altering isolated repository defaults', () => {
    const state = new SupplierRepository(new MemoryStorage(), true).read();
    expect(builtinSupplierDirectory).toHaveLength(95);
    expect(state.suppliers).toHaveLength(98);
    expect(state.suppliers.find((s) => s.id === 'builtin-SUP-001')?.name).toBe(builtinSupplierDirectory[0]?.name);
    expect(state.scopes.filter((s) => s.supplierId.startsWith('builtin-'))).toHaveLength(95);
    expect(new SupplierRepository(new MemoryStorage()).read().suppliers).toHaveLength(3);
  });
  it('merges once into existing browser data and preserves user edits', async () => {
    const storage = new MemoryStorage();
    const repo = new SupplierRepository(storage, true);
    const api = createMockAdapter('u-ops', undefined, repo);
    const original = repo.read().suppliers.find((s) => s.id === 'builtin-SUP-001')!;
    await api.updateSupplier(original.id, original.version, {
      name: '演示人工改名',
      shortCode: original.shortCode,
      ownerUserId: 'u-proc',
      supplierCategory: 'third_party',
      cooperationStatus: 'negotiating',
    });
    expect(repo.read().suppliers).toHaveLength(98);
    expect(repo.read().suppliers.find((s) => s.id === original.id)?.name).toBe('演示人工改名');
    repo.reset();
    expect(repo.read().suppliers.find((s) => s.id === original.id)?.name).toBe(original.name);
  });
  it('hides supplier identities in front-office adapter output', async () => {
    const repo = new SupplierRepository(new MemoryStorage(), true);
    for (const user of ['u-sales', 'u-solution', 'u-account']) {
      const api = createMockAdapter(user, undefined, repo);
      expect(await api.listSuppliers()).toEqual([]);
      await expect(api.querySuppliers()).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await api.getSupplier('builtin-SUP-001')).toBeNull();
      expect((await api.listChannels()).every((c) => c.supplierId === undefined)).toBe(true);
    }
  });
});
