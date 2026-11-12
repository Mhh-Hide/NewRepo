import { describe, expect, it } from 'vitest';
import { fixture as data } from '../../src/mocks/data';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { bindOpChannelId } from '../../src/domain/rules';
import { validateStore } from '../../src/domain/validation';
import { projectIncident } from '../../src/auth/projections';
import type { AccessContext, Role } from '../../src/auth/types';
const original = data.channels[0]!;
const incident = data.incidents[0]!;
function context(role: Role): AccessContext {
  return {
    user: {
      source: 'mock',
      id: 'demo',
      name: 'demo',
      role,
      salesPriceLevel: null,
    },
    domains: ['domestic'],
    supplierIds: ['s-1'],
    customerIds: [],
  };
}
describe('OP one-to-one bindings', () => {
  it('rejects duplicate non-null OP IDs in different channels', () => {
    const channels = data.channels.map((c, index) =>
      index < 2 ? { ...c, opChannelId: 'mock-duplicate' } : c,
    );
    expect(validateStore({ ...data, channels })).toContain(
      'Duplicate OP channel ID',
    );
    expect(() => bindOpChannelId(original, 'MOCK-OP-3', data.channels)).toThrow(
      'OP channel ID conflict',
    );
  });
  it('allows multiple nulls and idempotent confirmation of the same channel', () => {
    expect(
      data.channels.filter((c) => c.opChannelId === null).length,
    ).toBeGreaterThan(1);
    expect(validateStore(data)).toEqual([]);
    const bound = bindOpChannelId(original, 'mock-new-op', data.channels);
    const channels = data.channels.map((c) => (c.id === bound.id ? bound : c));
    expect(bindOpChannelId(bound, 'mock-new-op', channels)).toEqual(bound);
    expect(validateStore({ ...data, channels })).toEqual([]);
    expect(original.opChannelId).toBeNull();
  });
  it('cannot overwrite a canonical binding with a stale channel object', () => {
    const channels = data.channels.map((c) =>
      c.id === original.id ? { ...c, opChannelId: 'mock-existing' } : c,
    );
    expect(() => bindOpChannelId(original, 'mock-other', channels)).toThrow(
      'OP binding cannot be overwritten',
    );
    expect(() => bindOpChannelId(original, 'mock-new', [])).toThrow(
      'Channel not found',
    );
  });
});
describe('incident response classification', () => {
  it('procurement sees authorized summary and purchase field, no customer or raw text', async () => {
    const rows = await createMockAdapter('u-proc').listIncidents();
    const row = rows.find((i) => i.id === incident.id)!;
    expect(row.summary).toBe('模拟资源不可用事件');
    expect(row.purchaseDiscount).toBe(8000);
    for (const key of ['description', 'customer', 'salesPriceMinorUnits'])
      expect(row).not.toHaveProperty(key);
    expect(JSON.stringify(rows)).not.toContain('虚构客户1');
    expect(JSON.stringify(rows)).not.toContain('customer-1');
    expect(JSON.stringify(rows)).not.toContain('12346');
  });
  it('support sees required customer/supplier identity but no commercial fields or mixed text', async () => {
    const rows = await createMockAdapter('u-support').listIncidents();
    const row = rows.find((i) => i.id === incident.id)!;
    expect(row.customer).toEqual({
      id: 'customer-1',
      name: '虚构客户1（模拟）',
    });
    expect(row.supplierId).toBe('s-1');
    for (const key of [
      'description',
      'purchaseDiscount',
      'salesPriceMinorUnits',
    ])
      expect(row).not.toHaveProperty(key);
    expect(JSON.stringify(rows)).not.toContain('8000');
    expect(JSON.stringify(rows)).not.toContain('12346');
  });
  it('operations receives full authorized detail, including mixed text and separated fields', async () => {
    const row = (await createMockAdapter('u-ops').listIncidents()).find(
      (i) => i.id === incident.id,
    )!;
    expect(row.description).toBe(incident.description);
    expect(row.customer).toEqual(incident.customer);
    expect(row.salesPriceMinorUnits).toBe(12346);
    expect(row.purchaseDiscount).toBe(8000);
    Object.assign(row.customer!, { name: 'tampered' });
    expect(
      (await createMockAdapter('u-ops').listIncidents())[0]?.customer?.name,
    ).toBe('虚构客户1（模拟）');
  });
  it.each([
    'Procurement',
    'OperationsSupport',
    'Testing',
    'SupplierUser',
    'Sales',
    'AccountManager',
    'SolutionArchitect',
  ] as const)('%s cannot bypass the allowlist via the raw event', (role) => {
    const raw = Object.assign(
      { ...incident },
      {
        unclassifiedAttachment: 'SECRET-MIXED-CONTENT',
        rawPayload: { customerName: 'SECRET-CUSTOMER', discount: 1234 },
      },
    );
    const view = projectIncident(context(role), raw);
    if (role === 'Procurement' || role === 'OperationsSupport') {
      expect(view).not.toBeNull();
      expect(view).not.toHaveProperty('description');
      expect(view).not.toHaveProperty('rawPayload');
    } else {
      expect(view).toBeNull();
    }
    expect(JSON.stringify(view)).not.toContain('SECRET');
  });
  it('uses a controlled summary, not keyword replacement or caller-supplied text', () => {
    const raw = Object.assign(
      { ...incident },
      { summaryCode: '客户甲售价 SECRET', summary: 'SECRET' },
    );
    const row = projectIncident(context('Procurement'), raw);
    expect(row?.summary).toBe('模拟其他事件');
    expect(JSON.stringify(row)).not.toContain('SECRET');
  });
  it('keeps record scope and role gates for the event endpoint', async () => {
    expect(await createMockAdapter('u-no-domain').listIncidents()).toEqual([]);
    for (const user of [
      'u-test',
      'u-supplier',
      'u-sales',
      'u-account',
      'u-solution',
    ])
      expect(await createMockAdapter(user).listIncidents()).toEqual([]);
  });
});
describe('stable anonymous channel codes', () => {
  it('distinguishes anonymous channels without supplier short codes or identities', async () => {
    const a = createMockAdapter('u-sales');
    const channels = await a.listChannels();
    expect(channels.length).toBeGreaterThan(1);
    expect(new Set(channels.map((c) => c.anonymousCode)).size).toBe(
      channels.length,
    );
    expect(new Set(channels.map((c) => c.displayName)).size).toBe(
      channels.length,
    );
    expect((await a.listChannels()).map((c) => c.anonymousCode)).toEqual(
      channels.map((c) => c.anonymousCode),
    );
    for (const c of channels) {
      expect(c).not.toHaveProperty('supplierId');
      for (const s of data.suppliers) {
        expect(c.displayName).not.toContain(s.shortCode);
        expect(c.displayName).not.toContain(s.name);
      }
    }
  });
});
