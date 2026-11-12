import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { createResourceApi } from '../../src/mocks/resource-api';
import { SupplierRepository } from '../../src/mocks/supplier-repository';
import type { StoragePort } from '../../src/mocks/supplier-repository';
import type { SupplierInput } from '../../src/domain/suppliers';
import { loadDashboard } from '../../src/services/dashboard';
import { createDemoSession } from '../../src/services/demo-session';
import { formatCapacity } from '../../src/features/channels/format-capacity';
class MemoryStorage implements StoragePort {
  value: string | null = null;
  getItem() {
    return this.value;
  }
  setItem(_key: string, value: string) {
    this.value = value;
  }
}
let storage: MemoryStorage;
let repo: SupplierRepository;
const api = (id = 'u-ops', domain?: 'domestic' | 'overseas') =>
  createMockAdapter(id, domain, repo);
beforeEach(() => {
  storage = new MemoryStorage();
  repo = new SupplierRepository(storage);
});
function supplierInput(
  s: NonNullable<
    Awaited<ReturnType<ReturnType<typeof api>['getSupplier']>>
  >['supplier'],
): SupplierInput {
  return {
    name: s.name,
    shortCode: s.shortCode,
    supplierCategory: s.supplierCategory,
    cooperationStatus: s.cooperationStatus,
    ownerUserId: s.ownerUserId!,
    contactName: s.contactName ?? '',
    contactEmail: s.contactEmail ?? '',
    contactPhone: s.contactPhone ?? '',
    contactPosition: s.contactPosition ?? '',
    alternativeContact: s.alternativeContact ?? '',
    countryOrRegion: s.countryOrRegion,
    description: s.description ?? '',
    remark: s.remark ?? '',
  };
}
function keys(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)]);
}
describe('authorized model resource summaries', () => {
  it('counts distinct suppliers, not multiple channels from the same supplier', async () => {
    const d = await api().getModelResource('m-seed-cn');
    expect(d?.summary.channelCount).toBe(4);
    expect(d?.summary.supplierCount).toBe(3);
    expect(
      d?.suppliers.find((s) => s.supplier.id === 's-1')?.channelCount,
    ).toBe(2);
    expect((await api().queryModelResources()).stats).toEqual({
      models: 6,
      withChannels: 4,
      withoutChannels: 2,
      channels: 7,
      threeSupplierModels: 1,
    });
  });
  it('does not treat three channels from one supplier as three-supplier coverage', async () => {
    const a = api();
    const c = (await a.listChannels())[0]!;
    const resource = createResourceApi(
      {
        listModels: async () =>
          (await a.listModels()).filter((m) => m.id === c.modelId),
        listVendors: () => a.listVendors(),
        listSuppliers: () => a.listSuppliers(),
        listChannels: async () => [
          c,
          { ...c, id: 'clone-channel-2' },
          { ...c, id: 'clone-channel-3' },
        ],
      },
      true,
    );
    const page = await resource.queryModelResources();
    expect(page.rows[0]?.supplierCount).toBe(1);
    expect(page.rows[0]?.channelCount).toBe(3);
    expect(page.stats.threeSupplierModels).toBe(0);
  });
  it('derives business domain from vendor for both Seedance region variants', async () => {
    for (const id of ['m-seed-cn', 'm-seed-os'])
      expect((await api().getModelResource(id))?.summary.businessDomain).toBe(
        'domestic',
      );
    expect(
      (await api().getModelResource('m-seed-os'))?.summary.model.regionVariant,
    ).toBe('overseas');
    for (const id of ['m-gpt', 'm-claude', 'm-gemini', 'm-grok'])
      expect((await api().getModelResource(id))?.summary.businessDomain).toBe(
        'overseas',
      );
  });
  it('supports all filters, sorting, page clamping and reset-equivalent queries', async () => {
    const a = api();
    expect(
      (await a.queryModelResources({ search: 'GPT-DEMO' })).rows.map(
        (r) => r.model.id,
      ),
    ).toEqual(['m-gpt']);
    expect(
      (
        await a.queryModelResources({
          vendorId: 'v-byte',
          category: 'video',
          regionVariant: 'overseas',
          status: 'enabled',
          hasChannels: 'yes',
        })
      ).rows.map((r) => r.model.id),
    ).toEqual(['m-seed-os']);
    expect(
      (
        await a.queryModelResources({ supplierCoverage: 'three_plus' })
      ).rows.map((r) => r.model.id),
    ).toEqual(['m-seed-cn']);
    expect((await a.queryModelResources({ hasChannels: 'no' })).total).toBe(2);
    expect(
      (await a.queryModelResources({ page: 2, pageSize: 5 })).rows,
    ).toHaveLength(1);
    expect(
      (await a.queryModelResources({ search: 'missing', page: 99 })).page,
    ).toBe(1);
    expect(
      (await a.queryModelResources({ sort: 'channelCount', order: 'desc' }))
        .rows[0]?.model.id,
    ).toBe('m-seed-cn');
    expect((await a.queryModelResources()).total).toBe(6);
  });
  it('uses exactly one batch of each reader per query, independent of row count', async () => {
    const a = api();
    const readers = {
      listModels: vi.fn(() => a.listModels()),
      listVendors: vi.fn(() => a.listVendors()),
      listChannels: vi.fn(() => a.listChannels()),
      listSuppliers: vi.fn(() => a.listSuppliers()),
    };
    await createResourceApi(readers, true).queryModelResources();
    for (const fn of Object.values(readers))
      expect(fn).toHaveBeenCalledTimes(1);
  });
  it('does not request hidden supplier identities or quote history for front office', async () => {
    const a = api('u-sales');
    const readers = {
      listModels: () => a.listModels(),
      listVendors: () => a.listVendors(),
      listChannels: () => a.listChannels(),
      listSuppliers: vi.fn(() => a.listSuppliers()),
    };
    await createResourceApi(readers, false).queryModelResources();
    expect(readers.listSuppliers).not.toHaveBeenCalled();
  });
  it('shows authorized catalog models with no resources as an actual empty channel set', async () => {
    const d = await api().getModelResource('m-claude');
    expect(d).not.toBeNull();
    expect(d?.summary.channelCount).toBe(0);
    expect(d?.summary.supplierCount).toBe(0);
    expect(d?.channels).toEqual([]);
    expect(d?.suppliers).toEqual([]);
    expect(d?.summary.states.quality.every((c) => c.count === 0)).toBe(true);
  });
  it('retains null capacities, displays unknown, and does not conflate a known zero', async () => {
    const c = await api().getChannelResource('ch-2');
    expect(c?.tpm).toBeNull();
    expect(c?.rpm).toBeNull();
    expect(formatCapacity(c!.tpm)).toBe('未知');
    expect(formatCapacity(c!.rpm)).toBe('未知');
    expect(formatCapacity(0)).toBe('0');
  });
  it('keeps quality, connectivity, integration and availability independent', async () => {
    const c = await api().getChannelResource('ch-1');
    expect(c).toMatchObject({
      qualityStatus: 'exempted',
      connectivityStatus: 'pending',
      integrationStatus: 'not_started',
      availabilityStatus: 'closed',
    });
    const d = await api().getModelResource('m-seed-cn');
    expect(
      d?.summary.states.quality.find((s) => s.code === 'passed')?.count,
    ).toBe(1);
    expect(
      d?.summary.states.connectivity.find((s) => s.code === 'pending')?.count,
    ).toBe(3);
    expect(d?.summary).not.toHaveProperty('testPassed');
  });
});
describe('single supplier master and Stage 03 compatibility', () => {
  it('reflects current name, shortCode and status after supplier edits in the same adapter and after recreation', async () => {
    const a = api();
    const original = (await a.getSupplier('s-1'))!;
    await a.updateSupplier('s-1', original.supplier.version, {
      ...supplierInput(original.supplier),
      name: '虚构已更名供应商',
      shortCode: 'RENAMED-MOCK',
    });
    expect(
      (await a.getModelResource('m-seed-cn'))?.suppliers.find(
        (s) => s.supplier.id === 's-1',
      )?.supplier,
    ).toMatchObject({ name: '虚构已更名供应商', shortCode: 'RENAMED-MOCK' });
    const restored = createMockAdapter(
      'u-ops',
      undefined,
      new SupplierRepository(storage),
    );
    expect((await restored.getChannelResource('ch-1'))?.supplier?.name).toBe(
      '虚构已更名供应商',
    );
  });
  it('supplier disablement updates master display but retains channels and every resource state', async () => {
    const a = api();
    const before = (await a.getModelResource('m-seed-cn'))!;
    await a.setSupplierStatus('s-1', 1, 'disabled');
    const after = (await a.getModelResource('m-seed-cn'))!;
    expect(after.summary).toEqual(before.summary);
    expect(after.channels.map((c) => c.id)).toEqual(
      before.channels.map((c) => c.id),
    );
    expect(
      after.suppliers.find((s) => s.supplier.id === 's-1')?.supplier.status,
    ).toBe('disabled');
    expect((await a.getChannelResource('ch-1'))?.resourceStatus).toBe(
      'enabled',
    );
  });
  it('does not count a new no-channel supplier as model coverage', async () => {
    const a = api();
    const before = await a.queryModelResources();
    const created = await a.createSupplier({
      name: '虚构无渠道供应商',
      shortCode: 'NO-RESOURCE',
      ownerUserId: 'u-proc',
      supplierCategory: 'other',
      cooperationStatus: 'potential',
    });
    expect(await a.getSupplier(created.id)).not.toBeNull();
    expect(await a.listSuppliers()).toHaveLength(4);
    expect((await a.queryModelResources()).stats).toEqual(before.stats);
    expect(
      (await a.queryModelResources({ supplierId: created.id })).rows,
    ).toEqual([]);
  });
  it('supports authorized supplier-to-model navigation from actual channel associations only', async () => {
    const page = await api().queryModelResources({ supplierId: 's-1' });
    expect(page.appliedSupplier?.id).toBe('s-1');
    expect(new Set(page.rows.map((r) => r.model.id))).toEqual(
      new Set(['m-seed-cn', 'm-gpt']),
    );
    expect(page.stats.channels).toBe(5);
    expect(
      (await api('u-supplier').queryModelResources({ supplierId: 's-2' })).rows,
    ).toEqual([]);
  });
  it('matches existing Dashboard model/channel totals for each identity/domain', async () => {
    for (const [id, domain] of [
      ['u-ops', undefined],
      ['u-ops', 'domestic'],
      ['u-ops', 'overseas'],
      ['u-supplier', undefined],
      ['u-sales', undefined],
    ] as const) {
      const a = api(id, domain);
      const page = await a.queryModelResources();
      const session = createDemoSession(id, domain ?? 'all');
      const d = await loadDashboard(a, session.permits);
      expect(page.stats.models).toBe(
        d.metrics.find((m) => m.id === 'models')?.value,
      );
      expect(page.stats.channels).toBe(
        d.metrics.find((m) => m.id === 'channels')?.value,
      );
    }
  });
});
describe('resource API field and record boundaries', () => {
  it('filters vendors and nested resources by authorized business domain', async () => {
    const a = api('u-domestic', 'domestic');
    const p = await a.queryModelResources();
    expect(p.rows.map((r) => r.model.id).sort()).toEqual([
      'm-seed-cn',
      'm-seed-os',
    ]);
    expect(p.vendors.map((v) => v.id)).toEqual(['v-byte']);
    expect(await a.getModelResource('m-gpt')).toBeNull();
    expect(await a.getChannelResource('ch-5')).toBeNull();
    expect((await a.queryModelResources({ vendorId: 'v-open' })).total).toBe(0);
    expect(
      (await api('u-overseas', 'overseas').queryModelResources()).stats
        .channels,
    ).toBe(2);
  });
  it('supplier can only obtain its own channels and associated models', async () => {
    const a = api('u-supplier');
    expect(
      (await a.getModelResource('m-seed-cn'))?.channels.map((c) => c.id),
    ).toEqual(['ch-1', 'ch-2']);
    expect(
      (await a.getModelResource('m-seed-cn'))?.suppliers.map(
        (s) => s.supplier.id,
      ),
    ).toEqual(['s-1']);
    expect(await a.getChannelResource('ch-3')).toBeNull();
    expect(await a.getModelResource('m-gemini')).toBeNull();
    expect(await a.getChannelResource('ch-1')).not.toHaveProperty(
      'endpointReference',
    );
  });
  it.each(['u-sales', 'u-account', 'u-solution'])(
    '%s receives anonymous channels with no identity, technical references or coverage oracle',
    async (id) => {
      const a = api(id);
      const values = [
        await a.queryModelResources(),
        await a.getModelResource('m-seed-cn'),
        await a.getChannelResource('ch-1'),
      ];
      for (const key of [
        'supplierId',
        'supplier',
        'shortCode',
        'contactName',
        'contactEmail',
        'supplierCount',
        'threeSupplierModels',
        'endpointReference',
        'opChannelId',
        'modelInvocationName',
        'sourceVerificationStatus',
        'discount',
        'purchaseDiscount',
        'salesPriceMinorUnits',
      ])
        expect(keys(values)).not.toContain(key);
      expect(JSON.stringify(values)).not.toContain('虚构供应商');
      expect((await a.getChannelResource('ch-1'))?.displayName).toBe(
        '模拟匿名渠道 DEMO-ch-1',
      );
      await expect(
        a.queryModelResources({ supplierCoverage: 'zero' }),
      ).rejects.toThrow('筛选权限');
      await expect(
        a.queryModelResources({ supplierId: 's-1' }),
      ).rejects.toThrow('筛选权限');
    },
  );
  it.each(['u-test', 'u-support', 'u-proc', 'u-ops'])(
    '%s never receives pricing/client data through resource endpoints',
    async (id) => {
      const a = api(id);
      const payload = [
        await a.queryModelResources(),
        await a.getModelResource('m-seed-cn'),
        await a.getChannelResource('ch-1'),
      ];
      for (const key of [
        'discount',
        'purchaseDiscount',
        'targetPurchaseDiscount',
        'customerId',
        'salesPriceMinorUnits',
        'remark',
        'contactEmail',
        'beforeSnapshot',
      ])
        expect(keys(payload)).not.toContain(key);
      expect((await a.getChannelResource('ch-1'))?.modelInvocationName).toBe(
        'mock-model-1',
      );
    },
  );
  it('preserves procurement quote permission through the original endpoint only', async () => {
    expect(
      (await api('u-proc').getQuoteHistory('ch-1')).length,
    ).toBeGreaterThan(0);
    expect(await api('u-test').getQuoteHistory('ch-1')).toEqual([]);
  });
  it('returns null for unknown or unauthorized IDs and empty anonymous scope', async () => {
    for (const a of [
      createMockAdapter(undefined, undefined, repo),
      api('u-no-domain'),
    ]) {
      expect((await a.queryModelResources()).rows).toEqual([]);
      expect(await a.getModelResource('m-seed-cn')).toBeNull();
      expect(await a.getChannelResource('ch-1')).toBeNull();
    }
    expect(await api().getModelResource('missing')).toBeNull();
    expect(await api().getChannelResource('missing')).toBeNull();
  });
  it('cannot mutate supplier records via a returned read-only projection', async () => {
    const a = api();
    const d = (await a.getModelResource('m-seed-cn'))!;
    Object.assign(d.suppliers[0]!.supplier, { name: 'tampered' });
    expect((await a.getChannelResource('ch-1'))?.supplier?.name).toBe(
      '虚构供应商1（模拟）',
    );
    expect(storage.value).toBeNull();
  });
});
