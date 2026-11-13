import { describe, expect, it } from 'vitest';
import {
  createDemoSession,
  listDemoProfiles,
} from '../../src/services/demo-session';
import { loadDashboard } from '../../src/services/dashboard';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
async function dashboard(
  id = 'u-ops',
  domain: 'all' | 'domestic' | 'overseas' = 'all',
) {
  const session = createDemoSession(id, domain);
  return loadDashboard(session.api, session.permits);
}
function keys(value: unknown): string[] {
  return value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, v]) => [key, ...keys(v)])
    : [];
}
describe('scoped dashboard aggregates', () => {
  it('derives all seven operations metrics from actual authorized records', async () => {
    const d = await dashboard();
    expect(d.metrics.map((m) => [m.id, m.value])).toEqual([
      ['suppliers', 3],
      ['models', 6],
      ['channels', 7],
      ['demands', 2],
      ['gaps', 1],
      ['quality', 4],
      ['connectivity', 6],
      ['remediations', 2],
    ]);
    expect(d.quotes.length).toBe(7);
    expect(new Set(d.activities.map((a) => a.kind))).toEqual(
      new Set(['报价', '渠道', '测试', '整改', '事件']),
    );
    expect(d.channels.find((c) => c.id === 'ch-2')?.tpm).toBeNull();
  });
  it('changes counts using vendor domain, including both Seedance regional variants', async () => {
    const domestic = await dashboard('u-ops', 'domestic');
    const overseas = await dashboard('u-ops', 'overseas');
    expect(domestic.channels).toHaveLength(5);
    expect(overseas.channels).toHaveLength(2);
    expect(domestic.metrics.find((m) => m.id === 'models')?.value).toBe(2);
    expect(domestic.metrics.find((m) => m.id === 'gaps')?.value).toBe(0);
    expect(overseas.metrics.find((m) => m.id === 'gaps')?.value).toBe(1);
    expect(domestic.suppliers).toHaveLength(3);
    expect(overseas.suppliers).toHaveLength(2);
    expect(new Set(domestic.suppliers.map((s) => s.id)).size).toBe(3);
  });
  it('cannot bypass single-domain grants through the adapter or service', async () => {
    expect(() => createMockAdapter('u-overseas', 'domestic')).toThrow('未授权');
    expect(() => createMockAdapter('u-domestic', 'overseas')).toThrow('未授权');
    expect(() => createDemoSession('u-domestic', 'overseas')).toThrow('未授权');
    expect(() => createMockAdapter(undefined, 'domestic')).toThrow('未授权');
    const a = createDemoSession('u-domestic', 'domestic').api;
    expect((await a.listModels()).map((m) => m.id)).toEqual([
      'm-seed-cn',
      'm-seed-os',
    ]);
    expect(await a.listChannels({ modelId: 'm-gpt' })).toEqual([]);
    expect(await a.getQuoteHistory('ch-5')).toEqual([]);
    expect((await a.getDemand('d-1'))?.items.map((i) => i.modelId)).toEqual([
      'm-seed-cn',
    ]);
    expect(await a.listAuditEvents()).toHaveLength(1);
  });
  it('returns only identity metadata for the demo picker', () => {
    const profiles = listDemoProfiles();
    for (const k of [
      'supplierIds',
      'customerIds',
      'contactEmail',
      'salesPriceMinorUnits',
      'purchaseDiscount',
    ])
      expect(keys(profiles)).not.toContain(k);
    expect(profiles.map((p) => p.user.role)).toContain('SupplierUser');
  });
  it('keeps procurement API responses free of customer identity and price', async () => {
    const a = createDemoSession('u-proc', 'domestic').api;
    const payload = [
      await a.listDemands(),
      await a.getDemand('d-1'),
      await a.listIncidents(),
    ];
    for (const key of [
      'customer',
      'customerId',
      'requesterUserId',
      'salesPriceMinorUnits',
    ])
      expect(keys(payload)).not.toContain(key);
    expect(JSON.stringify(payload)).not.toContain('虚构客户');
    expect((await dashboard('u-proc')).quotes.length).toBeGreaterThan(0);
  });
  it.each([
    'u-test',
    'u-support',
    'u-supplier',
    'u-sales',
    'u-account',
    'u-solution',
  ])(
    '%s never receives commercial fields from dashboard or adapter',
    async (id) => {
      const s = createDemoSession(id);
      const d = await dashboard(id);
      const payload = [
        d,
        await s.api.getQuoteHistory('ch-1'),
        await s.api.listIncidents(),
        await s.api.listAuditEvents(),
      ];
      for (const key of [
        'discount',
        'targetPurchaseDiscount',
        'purchaseDiscount',
        'salesPriceMinorUnits',
      ])
        expect(keys(payload)).not.toContain(key);
      expect(d.quotes).toEqual([]);
    },
  );
  it('supplier sees only its own channel and remediation summaries', async () => {
    const d = await dashboard('u-supplier');
    expect(d.suppliers.map((s) => s.id)).toEqual(['s-1']);
    expect(d.channels.map((c) => c.id)).toEqual(['ch-1', 'ch-2', 'ch-5']);
    expect(d.metrics.find((m) => m.id === 'remediations')?.value).toBe(1);
  });
  it.each(['u-sales', 'u-account', 'u-solution'])(
    '%s only gets distinct anonymous resources and authorized demands',
    async (id) => {
      const d = await dashboard(id);
      expect(d.suppliers).toEqual([]);
      expect(d.channels.every((c) => c.name.startsWith('模拟匿名渠道'))).toBe(
        true,
      );
      expect(d.channels.every((c) => !('supplierName' in c))).toBe(true);
      expect(d.metrics.find((m) => m.id === 'demands')?.value).toBe(1);
      expect(JSON.stringify(d)).not.toContain('虚构供应商');
    },
  );
  it('keeps dimensions separate and does not infer sourcing from channel test state', async () => {
    const d = await dashboard();
    expect(d.dimensions.map((g) => [g.name, g.basis])).toEqual([
      ['采购寻源', '需求明细'],
      ['质量测试', '渠道'],
      ['连通性测试', '渠道'],
      ['渠道接入', '渠道'],
      ['渠道开放', '渠道'],
    ]);
    expect(
      d.dimensions
        .find((g) => g.name === '渠道接入')
        ?.counts.find((c) => c.label === '未接入')?.value,
    ).toBe(7);
    expect(
      d.dimensions
        .find((g) => g.name === '采购寻源')
        ?.counts.find((c) => c.label === '寻源中')?.value,
    ).toBe(3);
  });
  it('shows role-specific metrics and actual empty results', async () => {
    const support = await dashboard('u-support');
    expect(support.metrics.some((m) => m.id === 'incidents')).toBe(true);
    expect(support.metrics.some((m) => m.id === 'gaps')).toBe(false);
    expect((await dashboard('u-no-domain')).isEmpty).toBe(true);
  });
  it('rejects failed aggregates instead of displaying partial or fabricated counts', async () => {
    const s = createDemoSession('u-ops');
    await expect(
      loadDashboard(
        {
          ...s.api,
          listModels: async () => {
            throw new Error('failure');
          },
        },
        s.permits,
      ),
    ).rejects.toThrow('failure');
  });
});
