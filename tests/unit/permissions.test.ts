import { describe, expect, it } from 'vitest';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { fixture as data } from '../../src/mocks/data';
import type { AccessContext, Role } from '../../src/auth/types';
import { can, canSeeField } from '../../src/auth/policy';
import {
  projectChannel,
  projectCustomer,
  projectSupplier,
} from '../../src/auth/projections';
const ops = createMockAdapter('u-ops');
function context(role: Role): AccessContext {
  return {
    user: {
      source: 'mock',
      id: 'mock',
      name: 'mock',
      role,
      salesPriceLevel: null,
    },
    domains: ['domestic'],
    supplierIds: ['s-1'],
    customerIds: ['customer-1'],
  };
}
function keysDeep(value: unknown): string[] {
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, v]) => [key, ...keysDeep(v)]);
}
const customerKeys = [
  'customer',
  'customerId',
  'requesterUserId',
  'salesPriceMinorUnits',
];
const costKeys = ['discount', 'targetPurchaseDiscount'];
describe('default deny and field policies', () => {
  it.each([
    'ProductOperations',
    'Procurement',
    'Testing',
    'OperationsSupport',
    'SupplierUser',
    'Sales',
    'AccountManager',
    'SolutionArchitect',
  ] as const)('%s has explicit field rules', (role) => {
    const ctx = context(role);
    expect(canSeeField(ctx, 'purchaseDiscount')).toBe(
      ['ProductOperations', 'Procurement'].includes(role),
    );
    expect(canSeeField(ctx, 'customerPrice')).toBe(
      role === 'ProductOperations',
    );
    expect(canSeeField(ctx, 'supplierIdentity')).toBe(
      !['Sales', 'AccountManager', 'SolutionArchitect'].includes(role),
    );
  });
  it('unknown runtime roles including prototype keys are denied', () => {
    for (const role of ['UnknownRole', '__proto__', 'toString']) {
      const ctx = context('Sales');
      Object.assign(ctx.user, { role });
      expect(can(ctx, 'quote:read')).toBe(false);
      expect(canSeeField(ctx, 'purchaseDiscount')).toBe(false);
    }
  });
  it('has distinct actions and no implicit supplier incident permission', () => {
    expect(can(context('Procurement'), 'incident:record')).toBe(true);
    expect(can(context('OperationsSupport'), 'incident:record')).toBe(true);
    expect(can(context('SupplierUser'), 'incident:record')).toBe(false);
    expect(can(context('Sales'), 'quote:maintain')).toBe(false);
  });
  it('pure projections omit fields rather than masking in React', () => {
    const ctx = context('Sales');
    expect(projectSupplier(ctx, data.suppliers[0]!)).toBeNull();
    expect(
      projectChannel(ctx, {
        ...data.channels[0]!,
        displayName: 'PRIVATE-SUPPLIER-NAME',
      }),
    ).not.toHaveProperty('supplierId');
    expect(
      JSON.stringify(
        projectChannel(ctx, {
          ...data.channels[0]!,
          displayName: 'PRIVATE-SUPPLIER-NAME',
        }),
      ),
    ).not.toContain('PRIVATE-SUPPLIER-NAME');
    expect(
      projectCustomer(context('Procurement'), data.customers[0]!),
    ).toBeNull();
  });
  it('sales price authorization level does not alter field visibility', () => {
    for (const salesPriceLevel of ['sales', 'director', 'vp'] as const) {
      const ctx = context('Sales');
      expect(
        canSeeField(
          { ...ctx, user: { ...ctx.user, salesPriceLevel } },
          'supplierIdentity',
        ),
      ).toBe(false);
      expect(
        canSeeField(
          { ...ctx, user: { ...ctx.user, salesPriceLevel } },
          'purchaseDiscount',
        ),
      ).toBe(false);
    }
  });
  it('anonymous and unknown demo personas cannot obtain business records', async () => {
    const a = createMockAdapter();
    expect(() => createMockAdapter('forged-admin')).toThrow();
    for (const result of await Promise.all([
      a.listVendors(),
      a.listModels(),
      a.listSuppliers(),
      a.listChannels(),
      a.listDemands(),
      a.getQuoteHistory('ch-1'),
      a.listTestTasks(),
      a.listTestExecutions('tt-1'),
      a.listQualityExemptions('ch-1'),
      a.listRemediations(),
      a.listIncidents(),
      a.listAuditEvents(),
    ]))
      expect(result).toEqual([]);
    expect(await a.getDemand('d-1')).toBeNull();
  });
});
describe('authorized mock API projections and record scopes', () => {
  it('procurement receives targets but never customer identifiers or sales prices', async () => {
    const a = createMockAdapter('u-proc');
    const detail = await a.getDemand('d-1');
    expect(detail?.items[0]?.targetPurchaseDiscount).toBe(8000);
    const all = [
      await a.listDemands(),
      detail,
      await a.listSuppliers(),
      await a.listChannels(),
      await a.getQuoteHistory('ch-1'),
      await a.listIncidents(),
      await a.listAuditEvents(),
    ];
    expect(keysDeep(all)).not.toEqual(expect.arrayContaining(customerKeys));
    for (const key of customerKeys) expect(keysDeep(all)).not.toContain(key);
    expect(JSON.stringify(all)).not.toContain('customer-1');
    expect(JSON.stringify(all)).not.toContain('虚构客户');
  });
  it('testing cannot fetch purchase discounts through any query surface', async () => {
    const a = createMockAdapter('u-test');
    expect(await a.getQuoteHistory('ch-1')).toEqual([]);
    expect(await a.getDemand('d-1')).toBeNull();
    const records = [
      await a.listSuppliers(),
      await a.listChannels(),
      await a.listTestTasks(),
      await a.listTestExecutions('tt-1'),
      await a.listRemediations(),
      await a.listIncidents(),
      await a.listAuditEvents(),
    ];
    for (const key of [...costKeys, ...customerKeys])
      expect(keysDeep(records)).not.toContain(key);
    expect(await a.listTestExecutions('tt-1')).toHaveLength(2);
  });
  it('support sees customer/supplier identity but no sales price or cost', async () => {
    const a = createMockAdapter('u-support');
    const detail = await a.getDemand('d-1');
    expect(detail?.demand.customer?.name).toBe('虚构客户1（模拟）');
    expect((await a.listSuppliers())[0]?.name).toContain('虚构供应商');
    const records = [
      detail,
      await a.listDemands(),
      await a.listChannels(),
      await a.getQuoteHistory('ch-1'),
      await a.listIncidents(),
      await a.listAuditEvents(),
    ];
    for (const key of [...costKeys, 'salesPriceMinorUnits'])
      expect(keysDeep(records)).not.toContain(key);
    expect(await a.getQuoteHistory('ch-1')).toEqual([]);
  });
  it('supplier only receives its own authorized models, channels, tests and remediations', async () => {
    const a = createMockAdapter('u-supplier');
    expect((await a.listSuppliers()).map((s) => s.id)).toEqual(['s-1']);
    expect((await a.listChannels()).every((c) => c.supplierId === 's-1')).toBe(
      true,
    );
    expect(await a.listChannels({ supplierId: 's-2' })).toEqual([]);
    expect(await a.listTestTasks('ch-3')).toEqual([]);
    expect(await a.listTestExecutions('tt-3')).toEqual([]);
    expect(await ops.listRemediations('ch-3')).toHaveLength(1);
    expect(await a.listRemediations('ch-3')).toEqual([]);
    expect(await a.getQuoteHistory('ch-1')).toEqual([]);
    expect(await a.listIncidents()).toEqual([]);
    expect(await a.getDemand('d-1')).toBeNull();
    expect((await a.listModels()).map((m) => m.id)).not.toContain('m-gemini');
    expect((await a.listTestExecutions('tt-1'))[0]).not.toHaveProperty(
      'reportReference',
    );
  });
  it.each(['u-sales', 'u-account', 'u-solution'])(
    '%s receives authorized customers and sanitized resources',
    async (id) => {
      const a = createMockAdapter(id);
      const detail = await a.getDemand('d-1');
      expect(detail?.demand.customerId).toBe('customer-1');
      expect(await a.getDemand('d-2')).toBeNull();
      expect((await a.listDemands()).map((d) => d.id)).toEqual(['d-1']);
      expect(await a.listSuppliers()).toEqual([]);
      expect(await a.listChannels({ supplierId: 's-1' })).toEqual([]);
      const records = [
        detail,
        await a.listChannels(),
        await a.getQuoteHistory('ch-1'),
        await a.listAuditEvents(),
      ];
      for (const key of [
        'supplierId',
        'shortCode',
        'contactEmail',
        'opChannelId',
        'endpointReference',
        'modelInvocationName',
        ...costKeys,
        'salesPriceMinorUnits',
      ])
        expect(keysDeep(records)).not.toContain(key);
      expect(JSON.stringify(records)).not.toContain('虚构供应商');
    },
  );
  it('operations sees complete fields within granted business domains', async () => {
    const detail = await ops.getDemand('d-1');
    expect(detail?.demand.customer?.salesPriceMinorUnits).toBe(12346);
    expect(detail?.items[0]?.targetPurchaseDiscount).toBe(8000);
    expect((await ops.listSuppliers())[0]?.contactEmail).toBe(
      'supplier1@example.invalid',
    );
    expect(await ops.getQuoteHistory('ch-1')).toHaveLength(4);
    expect(await ops.listAuditEvents()).toHaveLength(2);
    expect(await ops.listQualityExemptions('ch-1')).toHaveLength(1);
  });
  it('domain restriction applies to every nested record and direct ID query', async () => {
    const a = createMockAdapter('u-domestic');
    expect((await a.listModels()).map((m) => m.id)).toEqual([
      'm-seed-cn',
      'm-seed-os',
    ]);
    expect(await a.listChannels({ modelId: 'm-gpt' })).toEqual([]);
    expect(await ops.getQuoteHistory('ch-5')).toHaveLength(1);
    expect(await a.getQuoteHistory('ch-5')).toEqual([]);
    expect(await a.listAuditEvents()).toHaveLength(1);
    expect(await a.listTestTasks('ch-5')).toEqual([]);
    expect(await a.getDemand('d-2')).toBeNull();
    expect((await a.getDemand('d-1'))?.items.map((i) => i.modelId)).toEqual([
      'm-seed-cn',
    ]);
    expect(
      (await a.listChannels()).some((c) => c.modelId === 'm-seed-os'),
    ).toBe(true);
    const none = createMockAdapter('u-no-domain');
    expect(await none.listVendors()).toEqual([]);
    expect(await none.listSuppliers()).toEqual([]);
    expect(await none.listChannels()).toEqual([]);
    expect(await none.listDemands()).toEqual([]);
    expect(await none.listIncidents()).toEqual([]);
    expect(await none.listAuditEvents()).toEqual([]);
  });
  it('channel queries by model/supplier share the same authorization', async () => {
    expect(await ops.listChannels({ modelId: 'm-seed-cn' })).toHaveLength(4);
    expect(await ops.listChannels({ supplierId: 's-1' })).toHaveLength(3);
    expect(await ops.listChannels({ modelId: 'missing' })).toEqual([]);
    expect(await ops.getDemand('missing')).toBeNull();
    expect(await ops.listTestExecutions('missing')).toEqual([]);
  });
  it('returns complete multi-supplier demand matches and unknown capacities', async () => {
    const detail = await ops.getDemand('d-1');
    expect(
      detail?.matches.filter((m) => m.demandItemId === 'di-1'),
    ).toHaveLength(4);
    const unknown = (await ops.listChannels()).find((c) => c.id === 'ch-2');
    expect(unknown?.tpm).toBeNull();
    expect(unknown?.rpm).toBeNull();
  });
  it('response mutation cannot alter raw data or other users responses', async () => {
    const first = await ops.getQuoteHistory('ch-1');
    Object.assign(first[0]!, { discount: 1 });
    expect((await ops.getQuoteHistory('ch-1'))[0]?.discount).toBe(9000);
    const d = await ops.getDemand('d-1');
    Object.assign(d!.demand.customer!, { name: 'tampered' });
    expect((await ops.getDemand('d-1'))?.demand.customer?.name).toBe(
      '虚构客户1（模拟）',
    );
  });
});
