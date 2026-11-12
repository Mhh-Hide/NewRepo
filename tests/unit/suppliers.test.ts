import { beforeEach, describe, expect, it } from 'vitest';
import { SupplierRepository } from '../../src/mocks/supplier-repository';
import type { StoragePort } from '../../src/mocks/supplier-repository';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { createDemoSession } from '../../src/services/demo-session';
import { fixture } from '../../src/mocks/data';
import type { SupplierInput } from '../../src/domain/suppliers';
import { supplierEditableFields } from '../../src/domain/suppliers';
class MemoryStorage implements StoragePort {
  raw: string | null = null;
  failRead = false;
  failWrite = false;
  getItem() {
    if (this.failRead) throw new Error('read');
    return this.raw;
  }
  setItem(_key: string, value: string) {
    if (this.failWrite) throw new Error('quota');
    this.raw = value;
  }
}
const input = (overrides: Partial<SupplierInput> = {}): SupplierInput => ({
  name: '虚构新增供应商（模拟）',
  shortCode: 'MOCK-NEW',
  supplierCategory: 'third_party',
  cooperationStatus: 'potential',
  ownerUserId: 'u-proc',
  ...overrides,
});
function edit(
  s: Awaited<ReturnType<ReturnType<typeof createMockAdapter>['getSupplier']>>,
): SupplierInput {
  const r = s!.supplier;
  return {
    name: r.name,
    shortCode: r.shortCode,
    supplierCategory: r.supplierCategory,
    cooperationStatus: r.cooperationStatus,
    ownerUserId: r.ownerUserId!,
    countryOrRegion: r.countryOrRegion,
    description: r.description ?? '',
    contactName: r.contactName ?? '',
    contactEmail: r.contactEmail ?? '',
    contactPhone: r.contactPhone ?? '',
    contactPosition: r.contactPosition ?? '',
    alternativeContact: r.alternativeContact ?? '',
    remark: r.remark ?? '',
  };
}
let storage: MemoryStorage;
let repo: SupplierRepository;
const api = (id = 'u-ops', domain?: 'domestic' | 'overseas') =>
  createMockAdapter(id, domain, repo);
beforeEach(() => {
  storage = new MemoryStorage();
  repo = new SupplierRepository(storage);
});
describe('supplier creation and identity', () => {
  it('creates an enabled supplier with stable generated ID, actor, time and creation audit', async () => {
    const a = api();
    const s = await a.createSupplier(input());
    expect(s.id).toMatch(/^mock-supplier-/);
    expect(s.status).toBe('enabled');
    expect(s.version).toBe(1);
    expect(s.createdBy).toBe('u-ops');
    expect(Number.isFinite(Date.parse(s.createdAt))).toBe(true);
    expect((await a.listSupplierHistory(s.id))[0]?.action).toBe('created');
    expect((await a.listSuppliers()).some((r) => r.id === s.id)).toBe(true);
  });
  it('creates multiple records with unique IDs, no channel dependency, readable by assigned procurement', async () => {
    const a = api();
    const s1 = await a.createSupplier(input());
    const s2 = await a.createSupplier(
      input({ name: '虚构二号新主档', shortCode: 'NEW-TWO' }),
    );
    expect(s1.id).not.toBe(s2.id);
    expect((await a.getSupplier(s1.id))?.resources.channelCount).toBe(0);
    expect((await api('u-proc').getSupplier(s1.id))?.supplier.id).toBe(s1.id);
    expect(await api('u-proc-alt').getSupplier(s1.id)).toBeNull();
    expect(await api('u-test').getSupplier(s1.id)).toBeNull();
  });
  it('rejects duplicate names after trimming and English case folding', async () => {
    await api().createSupplier(input({ name: 'Mock Example' }));
    await expect(
      api().createSupplier(
        input({ name: '  mock EXAMPLE ', shortCode: 'OTHER' }),
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE' });
  });
  it('rejects duplicate short codes after trimming and case folding', async () => {
    await api().createSupplier(input());
    await expect(
      api().createSupplier(
        input({ name: '另一虚构名称', shortCode: '  mock-new ' }),
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE' });
  });
  it('rejects duplicate submissions without adding a second record', async () => {
    const results = await Promise.allSettled([
      api().createSupplier(input()),
      api().createSupplier(input()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      repo.read().suppliers.filter((s) => s.shortCode === 'MOCK-NEW'),
    ).toHaveLength(1);
  });
  it('validates required fields, owner directory and email without persisting errors', async () => {
    for (const bad of [
      input({ name: ' ' }),
      input({ ownerUserId: 'u-test' }),
      input({ contactEmail: 'invalid' }),
      input({ shortCode: '' }),
    ])
      await expect(api().createSupplier(bad)).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    expect(repo.read().suppliers).toHaveLength(3);
  });
  it('rejects protected/unknown fields rather than allowing identity or state changes', async () => {
    await expect(
      api().createSupplier(Object.assign(input(), { id: 's-1' })),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      api().createSupplier(Object.assign(input(), { apiKey: 'fake' })),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
describe('supplier authorization and domain separation', () => {
  it.each([
    'u-proc',
    'u-test',
    'u-support',
    'u-supplier',
    'u-sales',
    'u-account',
    'u-solution',
    'u-no-domain',
  ])('%s cannot create suppliers', async (id) => {
    await expect(api(id).createSupplier(input())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
  it('limits operations no-channel master scopes but does not assign supplier business domains', async () => {
    const s = await api('u-domestic', 'domestic').createSupplier(input());
    expect(await api('u-overseas', 'overseas').getSupplier(s.id)).toBeNull();
    expect((await api('u-domestic').getSupplier(s.id))?.supplier.id).toBe(s.id);
    expect(s).not.toHaveProperty('businessDomain');
  });
  it('allows explicit procurement master assignment independent of channel domain', async () => {
    const s = await api('u-overseas', 'overseas').createSupplier(
      input({ ownerUserId: 'u-proc-alt' }),
    );
    const assigned = await api('u-proc-alt', 'domestic').getSupplier(s.id);
    expect(assigned?.supplier.id).toBe(s.id);
    expect(assigned?.resources.channelCount).toBe(0);
    expect(
      await api('u-proc-alt', 'domestic').listChannels({ modelId: 'm-gpt' }),
    ).toEqual([]);
  });
  it('procurement can only maintain assigned records and cannot reassign or toggle', async () => {
    const current = await api('u-proc').getSupplier('s-1');
    const values = edit(current);
    await api('u-proc').updateSupplier('s-1', 1, {
      ...values,
      contactName: '模拟变更联系人',
    });
    await expect(
      api('u-proc-alt').updateSupplier('s-1', 2, values),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      api('u-proc').updateSupplier('s-1', 2, {
        ...values,
        ownerUserId: 'u-proc-alt',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      api('u-proc').setSupplierStatus('s-1', 2, 'disabled'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it.each([
    'u-test',
    'u-support',
    'u-supplier',
    'u-sales',
    'u-account',
    'u-solution',
  ])('%s cannot update by calling API directly', async (id) => {
    const values = edit(await api().getSupplier('s-1'));
    await expect(
      api(id).updateSupplier('s-1', 1, values),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      api(id).setSupplierStatus('s-1', 1, 'disabled'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('supplier sees only itself, no internal notes or change history; testing/support get identity summary only', async () => {
    const own = await api('u-supplier').getSupplier('s-1');
    expect(own?.supplier.contactName).toBeDefined();
    expect(own?.supplier).not.toHaveProperty('remark');
    expect(await api('u-supplier').getSupplier('s-2')).toBeNull();
    expect(await api('u-supplier').listSupplierHistory('s-1')).toEqual([]);
    for (const id of ['u-test', 'u-support']) {
      const r = await api(id).getSupplier('s-1');
      expect(r).not.toBeNull();
      for (const k of [
        'contactName',
        'contactEmail',
        'remark',
        'description',
        'ownerUserId',
      ])
        expect(r?.supplier).not.toHaveProperty(k);
    }
  });
  it.each(['u-sales', 'u-account', 'u-solution'])(
    '%s cannot obtain supplier identity via any supplier endpoint',
    async (id) => {
      expect(await api(id).listSuppliers()).toEqual([]);
      expect(await api(id).getSupplier('s-1')).toBeNull();
      expect(await api(id).listSupplierOwners()).toEqual([]);
      expect(await api(id).listSupplierHistory('s-1')).toEqual([]);
      await expect(api(id).querySuppliers()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    },
  );
  it('does not leak overseas channels through cross-domain supplier details', async () => {
    expect(
      (await api('u-ops', 'domestic').getSupplier('s-1'))?.resources,
    ).toMatchObject({ channelCount: 2, modelCount: 1 });
    expect(
      (await api('u-ops', 'overseas').getSupplier('s-1'))?.resources,
    ).toMatchObject({ channelCount: 1, modelCount: 1 });
  });
  it('reassignment changes maintenance scope without restricting the supplier model domain', async () => {
    const before = await api().getSupplier('s-1');
    await api().updateSupplier('s-1', 1, {
      ...edit(before),
      ownerUserId: 'u-proc-alt',
    });
    expect(await api('u-proc').getSupplier('s-1')).toBeNull();
    expect(
      (await api('u-proc-alt', 'domestic').getSupplier('s-1'))?.resources
        .channelCount,
    ).toBe(2);
    expect(
      (await api('u-ops', 'overseas').getSupplier('s-1'))?.resources
        .channelCount,
    ).toBe(1);
  });
  it('revokes a retired demo session write lease after identity switch', async () => {
    const session = createDemoSession('u-ops');
    session.revokeWrites();
    await expect(session.api.createSupplier(input())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await createDemoSession('u-test').api.listSuppliers()).toHaveLength(
      3,
    );
  });
});
describe('audit, concurrency and persistence', () => {
  it('preserves ID and creation fields, records before/after contact and cooperation changes', async () => {
    const a = api();
    const before = await a.getSupplier('s-1');
    const after = await a.updateSupplier('s-1', 1, {
      ...edit(before),
      name: '模拟更名供应商',
      contactEmail: 'changed@example.invalid',
      cooperationStatus: 'negotiating',
    });
    expect(after.id).toBe('s-1');
    expect(after.createdAt).toBe(before?.supplier.createdAt);
    expect(after.version).toBe(2);
    const event = (await a.listSupplierHistory('s-1')).at(-1)!;
    expect(event.beforeSnapshot?.name).toBe(before?.supplier.name);
    expect(event.afterSnapshot.name).toBe('模拟更名供应商');
    expect(event.changedFields).toEqual(
      expect.arrayContaining(['name', 'contactEmail', 'cooperationStatus']),
    );
    expect(event.actorUserId).toBe('u-ops');
    expect(event.afterSnapshot).not.toHaveProperty('customerId');
    expect(event.afterSnapshot).not.toHaveProperty('discount');
  });
  it('does not append meaningless logs, versions or writes on unchanged normalized values', async () => {
    const a = api();
    const before = await a.getSupplier('s-1');
    const result = await a.updateSupplier('s-1', 1, {
      ...edit(before),
      name: ` ${before!.supplier.name} `,
    });
    expect(result.version).toBe(1);
    expect(await a.listSupplierHistory('s-1')).toHaveLength(1);
    expect(storage.raw).toBeNull();
  });
  it('blocks stale-version concurrent edits including a second repository instance', async () => {
    const a = api();
    const before = await a.getSupplier('s-1');
    await a.updateSupplier('s-1', 1, {
      ...edit(before),
      remark: '模拟第一人变更',
    });
    const other = createMockAdapter(
      'u-ops',
      undefined,
      new SupplierRepository(storage),
    );
    await expect(
      other.updateSupplier('s-1', 1, {
        ...edit(before),
        remark: '模拟陈旧变更',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await a.getSupplier('s-1'))?.supplier.remark).toBe(
      '模拟第一人变更',
    );
  });
  it('toggles master status only and retains all original linked resources/history', async () => {
    const a = api();
    const channels = await a.listChannels();
    const quotes = await a.getQuoteHistory('ch-1');
    const tests = await a.listTestTasks();
    await a.setSupplierStatus('s-1', 1, 'disabled');
    expect(await a.listChannels()).toEqual(channels);
    expect(await a.getQuoteHistory('ch-1')).toEqual(quotes);
    expect(await a.listTestTasks()).toEqual(tests);
    expect((await a.getSupplier('s-1'))?.supplier.status).toBe('disabled');
    await a.setSupplierStatus('s-1', 2, 'enabled');
    expect((await a.getSupplier('s-1'))?.supplier.id).toBe('s-1');
    expect((await a.listSupplierHistory('s-1')).at(-1)?.action).toBe(
      'status_changed',
    );
  });
  it('restores the same data after a repository/browser recreation and reset restores fixtures', async () => {
    const s = await api().createSupplier(input());
    const restored = createMockAdapter(
      'u-ops',
      undefined,
      new SupplierRepository(storage),
    );
    expect((await restored.getSupplier(s.id))?.supplier.name).toBe(s.name);
    expect(JSON.parse(storage.raw!).schemaVersion).toBe(1);
    await expect(restored.resetSupplierDemo(false)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await restored.resetSupplierDemo(true);
    expect(await restored.listSuppliers()).toHaveLength(
      fixture.suppliers.length,
    );
    expect(await restored.getSupplier(s.id)).toBeNull();
  });
  it('limits global reset to dual-domain operations in all-domain view', async () => {
    for (const [id, domain] of [
      ['u-proc', undefined],
      ['u-domestic', undefined],
      ['u-ops', 'domestic'],
    ] as const)
      await expect(
        api(id, domain).resetSupplierDemo(true),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('never reports success when persistence fails and exposes no partial mutation', async () => {
    storage.failWrite = true;
    await expect(api().createSupplier(input())).rejects.toMatchObject({
      code: 'STORAGE',
    });
    expect(await api().listSuppliers()).toHaveLength(3);
    expect(storage.raw).toBeNull();
    storage.failWrite = false;
    await api().createSupplier(input());
    const previous = storage.raw;
    storage.failWrite = true;
    const s = await api().getSupplier('s-1');
    await expect(
      api().updateSupplier('s-1', 1, { ...edit(s), name: '模拟失败' }),
    ).rejects.toMatchObject({ code: 'STORAGE' });
    expect(storage.raw).toBe(previous);
  });
  it('reports malformed, unknown-version and wrong-shaped stored data without overwriting it', async () => {
    for (const raw of [
      'bad-json',
      JSON.stringify({ schemaVersion: 99 }),
      JSON.stringify({ schemaVersion: 1, suppliers: [] }),
    ]) {
      storage.raw = raw;
      await expect(api().querySuppliers()).rejects.toMatchObject({
        code: 'STORAGE',
      });
      expect(storage.raw).toBe(raw);
    }
    await api().resetSupplierDemo(true);
    expect(await api().listSuppliers()).toHaveLength(3);
    storage.failRead = true;
    await expect(api().querySuppliers()).rejects.toMatchObject({
      code: 'STORAGE',
    });
  });
  it('rejects unclassified persisted fields instead of returning or re-saving them', async () => {
    await api().createSupplier(input());
    const state: unknown = JSON.parse(storage.raw!);
    if (
      !state ||
      typeof state !== 'object' ||
      !('suppliers' in state) ||
      !Array.isArray(state.suppliers)
    )
      throw new Error('invalid test setup');
    Object.assign(state.suppliers[0], {
      unclassifiedPayload: 'MOCK-NOT-PUBLIC',
    });
    storage.raw = JSON.stringify(state);
    await expect(api().querySuppliers()).rejects.toMatchObject({
      code: 'STORAGE',
    });
  });
  it('keeps query search/filter/page/sort coherent and totals based on authorized records', async () => {
    for (let i = 0; i < 7; i++)
      await api().createSupplier(
        input({
          name: `模拟分页供应商${i}`,
          shortCode: `PAGE-${i}`,
          cooperationStatus: 'negotiating',
        }),
      );
    const p = await api().querySuppliers({
      search: 'PAGE-',
      cooperationStatus: 'negotiating',
      page: 2,
      pageSize: 5,
      sort: 'name',
      order: 'asc',
    });
    expect(p.total).toBe(7);
    expect(p.rows).toHaveLength(2);
    expect(p.stats.total).toBe(10);
    expect(p.stats.negotiating).toBe(7);
    expect(
      (await api().querySuppliers({ search: 'no-such', page: 9 })).page,
    ).toBe(1);
  });
  it('never mutates the initial fixture or returns live audit snapshots', async () => {
    const original = structuredClone(fixture.suppliers);
    const a = api();
    const current = await a.getSupplier('s-1');
    await a.updateSupplier('s-1', 1, {
      ...edit(current),
      contactName: '模拟更新',
    });
    const history = await a.listSupplierHistory('s-1');
    Object.assign(history[0]!.afterSnapshot, { name: 'client mutation' });
    expect((await a.listSupplierHistory('s-1'))[0]?.afterSnapshot.name).toBe(
      original[0]?.name,
    );
    expect(fixture.suppliers).toEqual(original);
    expect(supplierEditableFields).not.toContain('id');
  });
});
