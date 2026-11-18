import { describe, it, expect } from 'vitest';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import {
  SupplierRepository,
  type StoragePort,
} from '../../src/mocks/supplier-repository';
import { ChannelRepository } from '../../src/mocks/channel-repository';
import { SourcingRepository } from '../../src/mocks/sourcing-repository';
import { QuoteRepository } from '../../src/mocks/quote-repository';
import {
  selectCurrentPrice,
  currentChannelRows,
} from '../../src/domain/current-price';
import { discountBps } from '../../src/domain/rules';
import { discountText } from '../../src/features/procurement/discount';
import type { SupplierQuoteInput } from '../../src/services/supplier-quote-types';
class Memory implements StoragePort {
  values = new Map<string, string>();
  writes = 0;
  fail = false;
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw new Error('quota');
    this.writes++;
    this.values.set(k, v);
  }
}
function setup() {
  const port = new Memory(),
    s = new SupplierRepository(port),
    c = new ChannelRepository(port),
    d = new SourcingRepository(port),
    q = new QuoteRepository(port);
  return {
    port,
    s,
    c,
    d,
    q,
    api: createMockAdapter('u-ops', undefined, s, () => true, c, d, q),
  };
}
const input = (): SupplierQuoteInput => ({
  supplierId: 's-1',
  quotedAt: '2026-11-18T00:00:00.000Z',
  ownerId: 'u-proc',
  remark: '独立报价演示',
  rows: ['m-seed-cn', 'm-seed-os', 'm-gpt', 'm-claude', 'm-gemini'].map(
    (modelId, i) => ({
      modelId,
      displayName: `渠道-${i}`,
      channelType: (
        [
          'official_direct',
          'official_proxy',
          'cloud_self_hosted',
          'cloud_self_hosted_proxy',
          'supplier_self_hosted',
        ] as const
      )[i]!,
      discount: discountBps(9000 - i * 200),
      modelInvocationName: '',
      endpointReference: '',
      tpm: null,
      rpm: null,
      ttftMs: null,
      concurrencyLimit: null,
    }),
  ),
});
describe('07F supplier quotation transaction', () => {
  it('saves five models, channels and distinct quote discounts in one commit; retries are idempotent', async () => {
    const { api, port, c, q } = setup();
    const before = c.read().channels.length,
      quotes = q.read().quotes.length,
      writes = port.writes;
    const id = crypto.randomUUID(),
      v = input();
    const saved = await api.saveSupplierQuote(v, id);
    expect(port.writes - writes).toBe(1);
    expect(c.read().channels).toHaveLength(before + 5);
    expect(q.read().quotes).toHaveLength(quotes + 5);
    expect(saved.quoteIds).toHaveLength(5);
    expect(
      q
        .read()
        .quotes.slice(-5)
        .map((x) => x.discount),
    ).toEqual([9000, 8800, 8600, 8400, 8200]);
    expect(
      q
        .read()
        .quotes.slice(-5)
        .every((x) => x.priceStatus === 'reference' && !x.confirmedAt),
    ).toBe(true);
    expect(await api.saveSupplierQuote(v, id)).toEqual(saved);
    expect(c.read().channels).toHaveLength(before + 5);
  });
  it('invalid last row leaves no channels, batches, quotes or history', async () => {
    const { api, port, c, q } = setup();
    const before = JSON.stringify([c.read(), q.read()]);
    const v = input();
    await expect(
      api.saveSupplierQuote(
        {
          ...v,
          rows: [
            ...v.rows.slice(0, 4),
            { ...v.rows[4]!, discount: 10001 as never },
          ],
        },
        crypto.randomUUID(),
      ),
    ).rejects.toThrow();
    expect(JSON.stringify([c.read(), q.read()])).toBe(before);
    expect(port.writes).toBe(0);
  });
  it('storage failure rolls back the entire command', async () => {
    const { api, port, c, q } = setup();
    const before = JSON.stringify([c.read(), q.read()]);
    port.fail = true;
    await expect(
      api.saveSupplierQuote(input(), crypto.randomUUID()),
    ).rejects.toThrow();
    port.fail = false;
    expect(JSON.stringify([c.read(), q.read()])).toBe(before);
  });
  it('rejects sales and a domestic buyer quoting overseas manufacturers', async () => {
    const { port } = setup();
    const api = (id: string) =>
      createMockAdapter(
        id,
        undefined,
        new SupplierRepository(port),
        () => true,
        new ChannelRepository(port),
        new SourcingRepository(port),
        new QuoteRepository(port),
      );
    await expect(
      api('u-sales').saveSupplierQuote(input(), crypto.randomUUID()),
    ).rejects.toThrow();
    await expect(
      api('u-proc-cn').saveSupplierQuote(input(), crypto.randomUUID()),
    ).rejects.toThrow();
  });
});
describe('current channel price', () => {
  it('uses a new 8.5 discount version over 9; promotion expires back to valid formal; quote history never becomes formal', () => {
    const { q } = setup();
    const base = q.read().quotes[0]!;
    const formal = {
      quote: {
        ...base,
        id: 'formal',
        priceStatus: 'effective' as const,
        discount: discountBps(9000),
        effectiveFrom: '2026-01-01',
        effectiveUntil: null,
        confirmedBy: 'u-ops',
        confirmedAt: '2026-01-01',
      },
    };
    const revised = {
      quote: {
        ...formal.quote,
        id: 'revised',
        discount: discountBps(8500),
        effectiveFrom: '2026-02-01',
      },
    };
    const promo = {
      quote: {
        ...base,
        id: 'promo',
        priceStatus: 'temporary' as const,
        discount: discountBps(7200),
        effectiveFrom: '2026-03-01',
        effectiveUntil: '2026-04-01',
      },
    };
    const rows = [formal, revised, promo];
    expect(
      selectCurrentPrice(rows, Date.parse('2026-03-15'))?.quote.discount,
    ).toBe(7200);
    expect(
      selectCurrentPrice(rows, Date.parse('2026-04-01'))?.quote.discount,
    ).toBe(8500);
    expect(currentChannelRows(rows, Date.parse('2026-04-01'))).toHaveLength(1);
    expect(rows).toHaveLength(3);
    expect(
      selectCurrentPrice(
        [promo, { quote: { ...base, priceStatus: 'reference' } }],
        Date.parse('2026-04-01'),
      ),
    ).toBeNull();
    expect(
      selectCurrentPrice(
        [{ quote: { ...formal.quote, confirmedBy: null } }],
        Date.parse('2026-05-01'),
      ),
    ).toBeNull();
  });
  it('formats business discounts consistently', () => {
    expect([10000, 9000, 8500, 7200, 8550].map(discountText)).toEqual([
      '10 折',
      '9 折',
      '8.5 折',
      '7.2 折',
      '8.55 折',
    ]);
  });
});

describe('07F privacy and independent customer requirements', () => {
  it('keeps five models and multiple candidates on their own demand items; sales receives a strict progress projection', async () => {
    const { api, port } = setup();
    const v = input();
    await api.saveSupplierQuote(v, crypto.randomUUID());
    await api.saveSupplierQuote(
      {
        ...v,
        supplierId: 's-2',
        rows: v.rows.map((r) => ({ ...r, displayName: `备选-${r.modelId}` })),
      },
      crypto.randomUUID(),
    );
    const create = (customerId: string, tpm: number) =>
      api.createSourcingDemand(
        {
          title: '客户专项采购',
          description: '受限商业背景',
          sharedTitle: '五模型采购需求',
          sharedSummary: '技术资源采购',
          priority: 'normal',
          customerId,
          dueAt: null,
          salesOwnerId: 'u-sales',
          monthlyUsage: '100 万次',
          usageCurrency: 'CNY',
          cooperationForm: '年度框架',
          items: v.rows.map((r) => ({
            modelId: r.modelId,
            requiredTpm: tpm,
            requiredRpm: null,
            requiredConcurrency: null,
            requiredTtftMs: null,
            targetPurchaseDiscount: discountBps(0),
            targetDiscountUnknown: true,
            requiredRegion: '',
            priority: 'normal',
            cacheRequirement: '支持缓存',
            expectedUsage: '按需扩容',
            qualityRequirements: '稳定响应',
          })),
        },
        crypto.randomUUID(),
      );
    const first = await create('customer-1', 1000),
      second = await create('customer-2', 2000);
    for (const item of (await api.getSourcingDemand(first.id))!.items) {
      for (const c of (await api.listChannels())
        .filter((c) => c.modelId === item.model.id)
        .slice(-2)) {
        const current = (await api.getSourcingDemand(first.id))!;
        await api.addSourcingCandidate(
          first.id,
          current.demand.version,
          item.item.id,
          c.id,
          '待测试',
        );
      }
    }
    const detail = (await api.getSourcingDemand(first.id))!;
    expect(detail.items).toHaveLength(5);
    expect(detail.items.every((i) => i.candidates.length === 2)).toBe(true);
    expect(
      detail.items.every(
        (i) => i.item.requiredTpm === 1000 && i.item.targetDiscountUnknown,
      ),
    ).toBe(true);
    expect(
      (await api.getSourcingDemand(second.id))!.items.every(
        (i) => i.item.requiredTpm === 2000 && i.candidates.length === 0,
      ),
    ).toBe(true);
    const sales = createMockAdapter(
      'u-sales',
      undefined,
      new SupplierRepository(port),
      () => true,
      new ChannelRepository(port),
      new SourcingRepository(port),
      new QuoteRepository(port),
    );
    const safe = await sales.querySalesProgress(first.id);
    expect(safe).toHaveLength(1);
    expect(safe[0]!.models).toHaveLength(5);
    expect(await sales.querySalesProgress(second.id)).toEqual([]);
    expect(await sales.getSourcingDemand(first.id)).toBeNull();
    await expect(sales.queryQuotes()).rejects.toThrow();
    const json = JSON.stringify(safe);
    for (const word of [
      'supplier',
      'discount',
      '成本',
      '华北资源',
      '华东模型',
      '受限商业背景',
      '1000',
    ])
      expect(json).not.toContain(word);
    expect(safe[0]!.models.every((m) => !m.usable)).toBe(true);
  });
  it('classifies domestic manufacturer overseas versions as domestic and changes owners without granting procurement writes', async () => {
    const { api, port } = setup();
    const p = (id: string) =>
      createMockAdapter(
        id,
        undefined,
        new SupplierRepository(port),
        () => true,
        new ChannelRepository(port),
        new SourcingRepository(port),
        new QuoteRepository(port),
      );
    const cn = p('u-proc-cn'),
      os = p('u-proc-os');
    expect((await cn.listModels()).some((m) => m.id === 'm-seed-os')).toBe(
      true,
    );
    expect((await os.listModels()).some((m) => m.id === 'm-seed-os')).toBe(
      false,
    );
    expect(
      (await cn.modelResponsibilities()).find((m) => m.modelId === 'm-seed-os')
        ?.procurementOwnerId,
    ).toBe('u-proc-cn');
    await expect(
      cn.assignModelOwners('m-seed-os', 0, 'u-proc', 'u-domestic'),
    ).rejects.toThrow();
    await expect(
      api.assignModelOwners('m-seed-os', 0, 'u-proc-os', 'u-domestic'),
    ).rejects.toThrow();
    await api.assignModelOwners('m-seed-os', 0, 'u-proc', 'u-domestic');
    expect(
      (await cn.modelResponsibilities()).find((m) => m.modelId === 'm-seed-os')
        ?.version,
    ).toBe(1);
    await expect(
      api.assignModelOwners('m-seed-os', 0, 'u-proc-cn', 'u-domestic'),
    ).rejects.toThrow();
    await expect(cn.toggleChannel('ch-5', 1, 'disabled')).rejects.toThrow();
  });
  it('does not resurrect superseded formal prices when their replacement ends', () => {
    const { q } = setup();
    const base = q.read().quotes[0]!;
    const rows = [
      {
        quote: {
          ...base,
          id: 'old',
          priceStatus: 'effective' as const,
          confirmedBy: 'u-ops',
          confirmedAt: '2026-01-01',
          effectiveFrom: '2026-01-01',
          effectiveUntil: null,
        },
      },
      {
        quote: {
          ...base,
          id: 'replacement',
          priceStatus: 'effective' as const,
          confirmedBy: 'u-ops',
          confirmedAt: '2026-02-01',
          effectiveFrom: '2026-02-01',
          effectiveUntil: '2026-03-01',
        },
      },
    ];
    expect(selectCurrentPrice(rows, Date.parse('2026-03-01'))).toBeNull();
  });
});
