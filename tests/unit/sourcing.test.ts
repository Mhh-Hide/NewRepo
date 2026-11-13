import { beforeEach, describe, expect, it } from 'vitest';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { SupplierRepository } from '../../src/mocks/supplier-repository';
import { ChannelRepository } from '../../src/mocks/channel-repository';
import {
  SourcingRepository,
  sourcingStorageKey,
} from '../../src/mocks/sourcing-repository';
import type { StoragePort } from '../../src/mocks/supplier-repository';
import type {
  SourcingInput,
  SourcingItemInput,
} from '../../src/services/sourcing-types';
import type { ChannelInput } from '../../src/services/channel-types';
import { discountBps } from '../../src/domain/rules';
import { assessCapacity, sourcingCoverage } from '../../src/domain/sourcing';
import { fixture } from '../../src/mocks/data';
import { loadDashboard } from '../../src/services/dashboard';
class Memory implements StoragePort {
  values = new Map<string, string>();
  fail = false;
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw Error('quota');
    this.values.set(k, v);
  }
}
let storage: Memory;
let suppliers: SupplierRepository;
let channels: ChannelRepository;
let sourcing: SourcingRepository;
const api = (
  id = 'u-ops',
  domain?: 'domestic' | 'overseas',
  active = () => true,
) => createMockAdapter(id, domain, suppliers, active, channels, sourcing);
const item = (
  overrides: Partial<SourcingItemInput> = {},
): SourcingItemInput => ({
  modelId: 'm-seed-cn',
  requiredTpm: 1000,
  requiredRpm: 10,
  requiredConcurrency: 1,
  requiredTtftMs: 5000,
  targetPurchaseDiscount: discountBps(8000),
  requiredRegion: '',
  priority: 'normal',
  ...overrides,
});
const input = (overrides: Partial<SourcingInput> = {}): SourcingInput => ({
  title: 'PRIVATE 客户身份受限标题',
  description: 'PRIVATE 原始说明与销售价格 999',
  sharedTitle: '模拟技术资源优化',
  sharedSummary: '仅共享技术采购要求',
  priority: 'normal',
  customerId: 'customer-1',
  dueAt: null,
  items: [item()],
  ...overrides,
});
const create = (v = input(), key = crypto.randomUUID()) =>
  api().createSourcingDemand(v, key);
const channel = (overrides: Partial<ChannelInput> = {}) =>
  api().createChannel({
    displayName: '虚构寻源新增渠道',
    channelType: 'other',
    modelInvocationName: 'mock-model',
    endpointReference: 'mock-ref',
    tpm: 200000,
    rpm: 1000,
    concurrencyLimit: 100,
    ttftMs: 10,
    supplierId: 's-1',
    modelId: 'm-seed-cn',
    ...overrides,
  });
const keys = (v: unknown): string[] =>
  v && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, v]) => [k, ...keys(v)])
    : [];
beforeEach(() => {
  storage = new Memory();
  suppliers = new SupplierRepository(storage);
  channels = new ChannelRepository(storage);
  sourcing = new SourcingRepository(storage);
});
describe('sourcing creation, edits and storage graph', () => {
  it('preserves all seeded demand, item and match IDs without storage rewrite', async () => {
    expect(sourcing.read().demands.map((d) => d.id)).toEqual(
      fixture.demands.map((d) => d.id),
    );
    expect(sourcing.read().items.map((i) => i.id)).toEqual(
      fixture.demandItems.map((i) => i.id),
    );
    expect(sourcing.read().matches.map((m) => m.id)).toEqual(
      fixture.matches.map((m) => m.id),
    );
    expect(storage.values.size).toBe(0);
  });
  it('atomically creates a multi-model request and compatible linked items', async () => {
    const d = await create(
      input({ items: [item(), item({ modelId: 'm-gpt' })] }),
    );
    const detail = (await api().getSourcingDemand(d.id))!;
    expect(detail.items.map((i) => i.item.modelId)).toEqual([
      'm-seed-cn',
      'm-gpt',
    ]);
    expect(detail.items.every((i) => i.item.demandId === d.id)).toBe(true);
    expect(detail.demand).toMatchObject({
      version: 1,
      status: 'draft',
      createdBy: 'u-ops',
      customerId: 'customer-1',
    });
    sourcing.validate(sourcing.read(), channels, suppliers);
  });
  it('supports an internal customer-less demand', async () => {
    const d = await create(input({ customerId: null }));
    expect((await api().getSourcingDemand(d.id))?.demand.customer).toBeNull();
    expect(
      (await api('u-proc').getSourcingDemand(d.id))?.demand,
    ).not.toHaveProperty('customerId');
    expect((await api('u-proc').listDemands()).some((v) => v.id === d.id)).toBe(
      true,
    );
  });
  it('replays the same creation request without duplicate main/items/history', async () => {
    const key = crypto.randomUUID();
    const first = await create(input(), key);
    const raw = storage.getItem(sourcingStorageKey);
    const second = await create(input(), key);
    expect(second.id).toBe(first.id);
    expect(storage.getItem(sourcingStorageKey)).toBe(raw);
  });
  it('requires at least one valid model item', async () => {
    await expect(create(input({ items: [] }))).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(sourcing.read().demands).toHaveLength(2);
  });
  it('rejects invalid models and models outside actor or selected domain', async () => {
    await expect(
      create(input({ items: [item({ modelId: 'missing' })] })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    for (const a of [api('u-domestic'), api('u-ops', 'domestic')])
      await expect(
        a.createSourcingDemand(
          input({ items: [item(), item({ modelId: 'm-gpt' })] }),
          crypto.randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('does not confuse deployment/region with vendor business domain', async () => {
    const d = await api('u-domestic').createSourcingDemand(
      input({
        items: [
          item({ modelId: 'm-seed-os', requiredRegion: '海外部署（模拟）' }),
        ],
      }),
      crypto.randomUUID(),
    );
    expect(
      (await api('u-domestic').getSourcingDemand(d.id))?.items[0]?.vendor
        .businessDomain,
    ).toBe('domestic');
  });
  it.each([
    ['requiredTpm', -1],
    ['requiredRpm', 1.5],
    ['requiredConcurrency', Infinity],
    ['requiredTtftMs', NaN],
    ['requiredRpm', '100'],
    ['targetPurchaseDiscount', 8000.5],
    ['targetPurchaseDiscount', 10001],
  ])('rejects invalid requirement %s=%s', async (key, value) => {
    await expect(
      create(
        input({
          items: [item({ [key]: value } as Partial<SourcingItemInput>)],
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  it('retains unknown null requirements and accepts zero/fractional milliseconds', async () => {
    const d = await create(
      input({
        items: [
          item({
            requiredTpm: null,
            requiredRpm: null,
            requiredConcurrency: 0,
            requiredTtftMs: 0.5,
          }),
        ],
      }),
    );
    expect((await api().getSourcingDemand(d.id))?.items[0]?.item).toMatchObject(
      {
        requiredTpm: null,
        requiredRpm: null,
        requiredConcurrency: 0,
        requiredTtftMs: 0.5,
      },
    );
  });
  it('updates permitted requirements and can add another model while preserving IDs', async () => {
    const d = await create();
    const first = (await api().getSourcingDemand(d.id))!.items[0]!.item;
    await api().updateSourcingDemand(
      d.id,
      1,
      input({
        items: [
          item({ id: first.id, requiredTpm: 1200 }),
          item({ modelId: 'm-gpt' }),
        ],
      }),
    );
    const next = (await api().getSourcingDemand(d.id))!;
    expect(next.items.map((i) => i.item.id)).toContain(first.id);
    expect(next.items[0]?.item.requiredTpm).toBe(1200);
    expect(next.items).toHaveLength(2);
    expect(next.demand.version).toBe(2);
  });
  it('does not allow ordinary model relinking or removal of existing items', async () => {
    const d = await create();
    const i = (await api().getSourcingDemand(d.id))!.items[0]!.item;
    await expect(
      api().updateSourcingDemand(
        d.id,
        1,
        input({ items: [item({ id: i.id, modelId: 'm-gpt' })] }),
      ),
    ).rejects.toThrow('模型关联不可修改');
    await expect(
      api().updateSourcingDemand(d.id, 1, input({ items: [item()] })),
    ).rejects.toThrow('不得删除');
  });
  it('rejects stale version writes without overwriting current edits', async () => {
    const d = await create();
    const i = (await api().getSourcingDemand(d.id))!.items[0]!.item;
    await api().updateSourcingDemand(
      d.id,
      1,
      input({ sharedTitle: '新的共享标题', items: [item({ id: i.id })] }),
    );
    await expect(
      api().updateSourcingDemand(
        d.id,
        1,
        input({ items: [item({ id: i.id })] }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('a no-op does not write or append history', async () => {
    const d = await create();
    const i = (await api().getSourcingDemand(d.id))!.items[0]!.item;
    const raw = storage.getItem(sourcingStorageKey);
    await api().updateSourcingDemand(
      d.id,
      1,
      input({ items: [item({ id: i.id })] }),
    );
    expect(storage.getItem(sourcingStorageKey)).toBe(raw);
  });
  it('failed storage never partially commits a main, item or audit record', async () => {
    storage.fail = true;
    await expect(
      create(input({ items: [item(), item({ modelId: 'm-gpt' })] })),
    ).rejects.toMatchObject({ code: 'STORAGE' });
    expect(sourcing.read().demands).toHaveLength(2);
    expect(sourcing.read().items).toHaveLength(3);
    expect(sourcing.read().history).toHaveLength(0);
  });
  it('restores demand and candidate relation through new repository instances', async () => {
    const d = await create();
    const i = (await api().getSourcingDemand(d.id))!.items[0]!.item;
    await api('u-proc').addSourcingCandidate(
      d.id,
      1,
      i.id,
      'ch-1',
      '模拟共享技术依据',
    );
    sourcing = new SourcingRepository(storage);
    expect(
      (await api('u-proc').getSourcingDemand(d.id))?.items[0]?.candidates[0]
        ?.channel.id,
    ).toBe('ch-1');
  });
  it('repository detects revision conflict and rejects dangling graph references', () => {
    const old = sourcing.read();
    sourcing.write(old, old, channels, suppliers);
    expect(() => sourcing.write(old, old, channels, suppliers)).toThrow(
      '数据已变化',
    );
    expect(() =>
      sourcing.write(
        sourcing.read(),
        { ...sourcing.read(), items: [] },
        channels,
        suppliers,
      ),
    ).toThrow();
  });
});
describe('explicit projections and authorization', () => {
  it('procurement API, list search and history never receive customer, price or raw restricted text', async () => {
    const d = await create();
    const a = api('u-proc');
    const detail = await a.getSourcingDemand(d.id);
    const payload = [
      detail,
      await a.querySourcing(),
      await a.getDemand(d.id),
      await a.listDemands(),
    ];
    for (const k of [
      'customer',
      'customerId',
      'salesPriceMinorUnits',
      'requesterUserId',
      'beforeSnapshot',
      'afterSnapshot',
    ])
      expect(keys(payload)).not.toContain(k);
    expect(JSON.stringify(payload)).not.toContain('PRIVATE');
    expect(detail?.items[0]?.item.targetPurchaseDiscount).toBe(8000);
    expect((await a.querySourcing({ search: 'PRIVATE' })).total).toBe(0);
    expect(await a.listSourcingCustomers()).toEqual([]);
  });
  it('operations retains restricted demand title, description, customer and authorized history changes', async () => {
    const d = await create();
    const detail = (await api().getSourcingDemand(d.id))!;
    expect(detail.demand.title).toContain('PRIVATE');
    expect(detail.demand.description).toContain('999');
    expect(detail.demand.customer?.name).toBe('虚构客户1（模拟）');
    expect(
      detail.history.some((e) =>
        e.changes.some((c) => c.field === 'customerId'),
      ),
    ).toBe(true);
  });
  it('restricted-only edits are absent from procurement history', async () => {
    const d = await create();
    const before = (await api('u-proc').getSourcingDemand(d.id))!.history;
    const i = (await api().getSourcingDemand(d.id))!.items[0]!.item;
    await api().updateSourcingDemand(
      d.id,
      1,
      input({
        title: 'PRIVATE_CHANGED',
        description: 'PRIVATE_CHANGED',
        customerId: 'customer-2',
        items: [item({ id: i.id })],
      }),
    );
    const next = (await api('u-proc').getSourcingDemand(d.id))!;
    expect(next.history).toEqual(before);
    expect(JSON.stringify(next)).not.toContain('PRIVATE_CHANGED');
  });
  it('explicit projections drop extra persisted properties and unknown history changes', async () => {
    const d = await create();
    const detail = (await api().getSourcingDemand(d.id))!;
    await api().addSourcingCandidate(
      d.id,
      1,
      detail.items[0]!.item.id,
      'ch-1',
      '共享说明',
    );
    const s = sourcing.read();
    const raw = {
      ...s,
      items: s.items.map((i) => ({ ...i, customerId: 'PRIVATE_INJECTED' })),
      matches: s.matches.map((m) => ({ ...m, customerId: 'PRIVATE_INJECTED' })),
      history: s.history.map((e) => ({
        ...e,
        customerId: 'PRIVATE_INJECTED',
        changes: [
          ...e.changes,
          {
            field: 'customerDescription',
            before: null,
            after: 'PRIVATE_INJECTED',
          },
        ],
      })),
    };
    storage.values.set(sourcingStorageKey, JSON.stringify(raw));
    const payload = await api('u-proc').getSourcingDemand(d.id);
    expect(JSON.stringify(payload)).not.toContain('PRIVATE');
    expect(keys(payload)).not.toContain('customerId');
  });
  it.each([
    'u-test',
    'u-support',
    'u-supplier',
    'u-sales',
    'u-account',
    'u-solution',
  ])(
    '%s cannot read internal sourcing details, customers, candidates, history or write',
    async (id) => {
      const d = await create();
      const a = api(id);
      expect(await a.getSourcingDemand(d.id)).toBeNull();
      expect(await a.sourcingCandidates(d.id, 'missing')).toEqual([]);
      expect(await a.listSourcingCustomers()).toEqual([]);
      await expect(a.querySourcing()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(
        a.createSourcingDemand(input(), crypto.randomUUID()),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        a.addSourcingCandidate(d.id, 1, 'missing', 'ch-1', '共享'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        a.progressSourcing(d.id, 1, 'sourcing', '共享'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );
  it('procurement does not inherit demand authoring from supplier maintenance permission', async () => {
    const d = await create();
    await expect(
      api('u-proc').createSourcingDemand(input(), crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      api('u-proc').updateSourcingDemand(d.id, 1, input()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('legacy front summaries never expose new restricted text, discount or assessment', async () => {
    const a = api('u-sales');
    const payload = await a.getDemand('d-1');
    for (const k of [
      'targetPurchaseDiscount',
      'assessment',
      'title',
      'description',
      'sharedSummary',
    ])
      expect(keys(payload)).not.toContain(k);
    expect((await a.listDemands()).map((v) => v.id)).toEqual(['d-1']);
  });
  it('single domain reads only authorized items/history and cannot edit mixed-domain master', async () => {
    const d = await create(
      input({ items: [item(), item({ modelId: 'm-gpt' })] }),
    );
    const a = api('u-domestic');
    const v = (await a.getSourcingDemand(d.id))!;
    expect(v.items).toHaveLength(1);
    expect(v.canEdit).toBe(false);
    expect(v.canProgress).toBe(false);
    expect(
      v.history
        .filter((e) => e.demandItemId)
        .every((e) => e.demandItemId === v.items[0]?.item.id),
    ).toBe(true);
    await expect(
      a.updateSourcingDemand(d.id, 1, input()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      a.progressSourcing(d.id, 1, 'sourcing', '共享说明'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('does not grant candidate access beyond procurement maintenance scopes', async () => {
    const d = await create();
    const i = (await api().getSourcingDemand(d.id))!.items[0]!.item;
    expect(await api('u-proc-alt').sourcingCandidates(d.id, i.id)).toEqual([]);
    await expect(
      api('u-proc-alt').addSourcingCandidate(d.id, 1, i.id, 'ch-1', '共享'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('revoked session loses create, edit, match, progress and reset immediately', async () => {
    let active = true;
    const a = api('u-ops', undefined, () => active);
    const d = await create();
    active = false;
    for (const op of [
      () => a.createSourcingDemand(input(), crypto.randomUUID()),
      () => a.updateSourcingDemand(d.id, 1, input()),
      () => a.addSourcingCandidate(d.id, 1, 'x', 'ch-1', '共享'),
      () => a.progressSourcing(d.id, 1, 'sourcing', '共享'),
      () => a.resetSourcingDemo(true),
    ])
      await expect(op()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
describe('candidate matching and coverage', () => {
  async function demand() {
    const d = await create();
    return { d, i: (await api().getSourcingDemand(d.id))!.items[0]!.item };
  }
  it('retrieves a new channel from the current channel repository', async () => {
    const { d, i } = await demand();
    const c = await channel();
    expect(
      (await api('u-proc').sourcingCandidates(d.id, i.id)).some(
        (v) => v.channel.id === c.id,
      ),
    ).toBe(true);
  });
  it('rejects wrong-model and invalid channels', async () => {
    const { d, i } = await demand();
    for (const id of ['ch-5', 'unknown'])
      await expect(
        api('u-proc').addSourcingCandidate(d.id, 1, i.id, id, '共享技术依据'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('two channels from one supplier remain two candidates but one supplier', async () => {
    const { d, i } = await demand();
    const a = api('u-proc');
    await a.addSourcingCandidate(d.id, 1, i.id, 'ch-1', '共享依据');
    await a.addSourcingCandidate(d.id, 2, i.id, 'ch-2', '共享依据');
    const v = (await a.getSourcingDemand(d.id))!.items[0]!;
    expect(v.coverage).toMatchObject({
      candidates: 2,
      suppliers: 1,
      suitableSuppliers: 0,
      missing: 3,
    });
  });
  it('counts suitable suppliers once and permits fewer than three to save', async () => {
    const { d, i } = await demand();
    const a = api('u-proc');
    await a.addSourcingCandidate(d.id, 1, i.id, 'ch-1', '共享依据');
    let v = (await a.getSourcingDemand(d.id))!;
    await a.updateSourcingCandidate(
      d.id,
      2,
      v.items[0]!.candidates[0]!.match.id,
      'suitable',
      '人工初步核实依据',
    );
    v = (await a.getSourcingDemand(d.id))!;
    expect(v.items[0]?.coverage).toMatchObject({
      suitableSuppliers: 1,
      missing: 2,
      phase: 'shortfall',
    });
    expect(v.demand.status).toBe('draft');
  });
  it('unknown capabilities never automatically mean suitable, all unknown requirements remain unknown', () => {
    const c = fixture.channels[0]!;
    expect(
      assessCapacity(item({ requiredTpm: 2000 }), { ...c, tpm: null }).result,
    ).toBe('unknown');
    expect(
      assessCapacity(
        item({
          requiredTpm: null,
          requiredRpm: null,
          requiredConcurrency: null,
          requiredTtftMs: null,
        }),
        c,
      ).result,
    ).toBe('unknown');
  });
  it('TTFT is a maximum and lower latency is better', () => {
    const req = item({ requiredTtftMs: 100 });
    const c = fixture.channels[0]!;
    expect(assessCapacity(req, { ...c, ttftMs: 101 }).result).toBe('no');
    expect(assessCapacity(req, { ...c, ttftMs: 50 }).result).toBe('yes');
  });
  it('known insufficiency overrides unknown information and region is never auto-proven', () => {
    const c = fixture.channels[0]!;
    expect(
      assessCapacity(item({ requiredTpm: 999999 }), { ...c, ttftMs: null })
        .result,
    ).toBe('no');
    expect(
      assessCapacity(item({ requiredRegion: '海外' }), { ...c, ttftMs: 1 })
        .result,
    ).toBe('unknown');
  });
  it('disabled channels keep historical relations but no longer count suitable', async () => {
    const { d, i } = await demand();
    const c = await channel();
    await api().addSourcingCandidate(d.id, 1, i.id, c.id, '共享依据');
    const match = (await api().getSourcingDemand(d.id))!.items[0]!
      .candidates[0]!.match;
    await api().updateSourcingCandidate(
      d.id,
      2,
      match.id,
      'suitable',
      '人工核实',
    );
    await api().toggleChannel(c.id, 1, 'disabled');
    const v = (await api().getSourcingDemand(d.id))!.items[0]!;
    expect(v.candidates).toHaveLength(1);
    expect(v.candidates[0]?.match.matchStatus).toBe('suitable');
    expect(v.candidates[0]?.fit.result).toBe('no');
    expect(v.coverage.suitableSuppliers).toBe(0);
    await expect(
      api().updateSourcingCandidate(d.id, 3, match.id, 'suitable', '共享依据'),
    ).rejects.toThrow('已停用');
  });
  it('rejects duplicate active or excluded relation; reactivation uses original ID', async () => {
    const { d, i } = await demand();
    const a = api();
    await a.addSourcingCandidate(d.id, 1, i.id, 'ch-1', '共享依据');
    const m = (await a.getSourcingDemand(d.id))!.items[0]!.candidates[0]!.match;
    await expect(
      a.addSourcingCandidate(d.id, 2, i.id, 'ch-1', '重复'),
    ).rejects.toMatchObject({ code: 'DUPLICATE' });
    await a.updateSourcingCandidate(d.id, 2, m.id, 'excluded', '人工排除');
    await expect(
      a.addSourcingCandidate(d.id, 3, i.id, 'ch-1', '重复'),
    ).rejects.toMatchObject({ code: 'DUPLICATE' });
    await a.updateSourcingCandidate(
      d.id,
      3,
      m.id,
      'candidate',
      '补充资料后重新评估',
    );
    expect(
      (await a.getSourcingDemand(d.id))!.items[0]!.candidates[0]!.match.id,
    ).toBe(m.id);
  });
  it('candidate updates append before/after state without erasing previous history', async () => {
    const { d, i } = await demand();
    await api().addSourcingCandidate(d.id, 1, i.id, 'ch-1', '共享依据');
    const v = (await api().getSourcingDemand(d.id))!;
    const m = v.items[0]!.candidates[0]!.match;
    await api().updateSourcingCandidate(
      d.id,
      2,
      m.id,
      'excluded',
      '共享排除依据',
    );
    const next = (await api('u-proc').getSourcingDemand(d.id))!;
    expect(next.history).toHaveLength(v.history.length + 1);
    expect(next.history.at(-1)?.changes).toContainEqual({
      field: 'matchStatus',
      before: 'candidate',
      after: 'excluded',
    });
    expect(sourcing.read().history).toHaveLength(4);
  });
  it('zero candidates, unverified candidates and confirmed gaps are distinct', async () => {
    const { d, i } = await demand();
    expect(
      (await api().getSourcingDemand(d.id))?.items[0]?.coverage.phase,
    ).toBe('not_started');
    await api().addSourcingCandidate(d.id, 1, i.id, 'ch-1', '共享依据');
    expect(
      (await api().getSourcingDemand(d.id))?.items[0]?.coverage.phase,
    ).toBe('pending');
    await api().progressSourcing(d.id, 2, 'sourcing', '开始调查');
    await api('u-proc').progressSourcing(
      d.id,
      3,
      'gap',
      '已调查确认目前资源不足，继续补充',
    );
    expect(
      (await api().getSourcingDemand(d.id))?.items[0]?.coverage.phase,
    ).toBe('confirmed_gap');
  });
  it('requires explicit valid transitions, evidence, coverage for matched and closed is terminal', async () => {
    const { d } = await demand();
    await expect(
      api().progressSourcing(d.id, 1, 'matched', '说明'),
    ).rejects.toThrow('状态流转');
    await api().progressSourcing(d.id, 1, 'sourcing', '开始');
    await expect(
      api().progressSourcing(d.id, 2, 'matched', '说明'),
    ).rejects.toThrow('至少三家');
    await expect(api().progressSourcing(d.id, 2, 'gap', '')).rejects.toThrow(
      '共享',
    );
    await api().progressSourcing(d.id, 2, 'closed', '模拟关闭');
    await expect(
      api().addSourcingCandidate(d.id, 3, 'x', 'ch-1', '共享'),
    ).rejects.toThrow('已关闭');
  });
  it('manual matching never updates channel test, integration or availability state', async () => {
    const { d, i } = await demand();
    const before = await api().getChannelResource('ch-1');
    await api().addSourcingCandidate(d.id, 1, i.id, 'ch-1', '共享依据');
    const m = (await api().getSourcingDemand(d.id))!.items[0]!.candidates[0]!
      .match;
    await api().updateSourcingCandidate(
      d.id,
      2,
      m.id,
      'suitable',
      '人工初步核实',
    );
    expect(await api().getChannelResource('ch-1')).toEqual(before);
  });
  it('coverage pure rule deduplicates supplier IDs', () => {
    const i = { ...item(), id: 'di-1' };
    expect(
      sourcingCoverage(i, fixture.matches, fixture.channels, 'sourcing'),
    ).toMatchObject({
      candidates: 4,
      suppliers: 3,
      suitableSuppliers: 3,
      missing: 0,
    });
  });
});
describe('dashboard, safe reset and compatibility', () => {
  it('dashboard gap falls after three distinct suppliers are manually assessed and matched remains explicit', async () => {
    const a = api();
    const d = await create();
    const i = (await a.getSourcingDemand(d.id))!.items[0]!.item;
    const initial = (await a.querySourcing()).stats.gaps;
    for (const channelId of ['ch-1', 'ch-3', 'ch-4']) {
      let v = (await a.getSourcingDemand(d.id))!;
      await a.addSourcingCandidate(
        d.id,
        v.demand.version,
        i.id,
        channelId,
        '共享候选依据',
      );
      v = (await a.getSourcingDemand(d.id))!;
      const match = v.items[0]!.candidates.find(
        (c) => c.channel.id === channelId,
      )!.match;
      await a.updateSourcingCandidate(
        d.id,
        v.demand.version,
        match.id,
        'suitable',
        '人工初步符合，信息不足仍需继续核实',
      );
    }
    let v = (await a.getSourcingDemand(d.id))!;
    expect(v.items[0]!.coverage.suitableSuppliers).toBe(3);
    expect(v.demand.status).toBe('draft');
    expect(
      (await loadDashboard(a, () => true)).metrics.find((m) => m.id === 'gaps')!
        .value,
    ).toBe(initial);
    await a.progressSourcing(
      d.id,
      v.demand.version,
      'sourcing',
      '开始并汇总寻源',
    );
    v = (await a.getSourcingDemand(d.id))!;
    await a.progressSourcing(
      d.id,
      v.demand.version,
      'matched',
      '人工确认初步覆盖，未完成正式采购',
    );
    expect((await a.getSourcingDemand(d.id))!.demand.status).toBe('matched');
  });

  it('dashboard reads current demands and coverage after creation, candidate and status changes', async () => {
    const a = api();
    const before = await loadDashboard(a, () => true);
    const d = await create();
    const id = (await a.getSourcingDemand(d.id))!.items[0]!.item.id;
    let dashboard = await loadDashboard(a, () => true);
    expect(dashboard.metrics.find((m) => m.id === 'demands')?.value).toBe(
      before.metrics.find((m) => m.id === 'demands')!.value + 1,
    );
    expect(dashboard.metrics.find((m) => m.id === 'gaps')?.value).toBe(
      before.metrics.find((m) => m.id === 'gaps')?.value,
    );
    await a.addSourcingCandidate(d.id, 1, id, 'ch-1', '共享依据');
    dashboard = await loadDashboard(a, () => true);
    expect(dashboard.metrics.find((m) => m.id === 'gaps')?.value).toBe(
      before.metrics.find((m) => m.id === 'gaps')!.value + 1,
    );
    expect((await api('u-proc').querySourcing()).stats.total).toBe(3);
  });
  it('unsafe channel reset is blocked even for excluded candidate history; explicit sourcing reset preserves other stores', async () => {
    const c = await channel();
    const d = await create();
    const i = (await api().getSourcingDemand(d.id))!.items[0]!.item;
    await api().addSourcingCandidate(d.id, 1, i.id, c.id, '共享依据');
    const m = (await api().getSourcingDemand(d.id))!.items[0]!.candidates[0]!
      .match;
    await api().updateSourcingCandidate(d.id, 2, m.id, 'excluded', '人工排除');
    await expect(api().resetChannelDemo(true)).rejects.toThrow(
      '先独立确认重置寻源',
    );
    expect(await api().getChannelResource(c.id)).not.toBeNull();
    const supplierSnapshot = JSON.stringify(suppliers.read());
    const channelSnapshot = JSON.stringify(channels.read());
    await api().resetSourcingDemo(true);
    expect(JSON.stringify(suppliers.read())).toBe(supplierSnapshot);
    expect(JSON.stringify(channels.read())).toBe(channelSnapshot);
    await api().resetChannelDemo(true);
    sourcing.validate(sourcing.read(), channels, suppliers);
  });
  it.each([
    ['u-proc', undefined],
    ['u-ops', 'domestic'],
    ['u-domestic', undefined],
  ])('reset denies non-dual-domain full-context %s/%s', async (id, domain) => {
    await expect(
      api(id, domain as 'domestic' | undefined).resetSourcingDemo(true),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('reset requires explicit confirmation', async () => {
    await expect(api().resetSourcingDemo(false)).rejects.toThrow();
  });
  it.each([
    '{bad',
    '{"schemaVersion":99}',
    '{"schemaVersion":1,"revision":0,"demands":[{}],"items":[],"matches":[],"history":[]}',
  ])('never silently overwrites incompatible data %s', async (raw) => {
    storage.values.set(sourcingStorageKey, raw);
    await expect(api().querySourcing()).rejects.toMatchObject({
      code: 'STORAGE',
    });
    expect(storage.getItem(sourcingStorageKey)).toBe(raw);
    await api().resetSourcingDemo(true);
    expect((await api().querySourcing()).stats.total).toBe(2);
  });
  it('supplier/channel formats and histories remain untouched by sourcing saves', async () => {
    const beforeSuppliers = JSON.stringify(suppliers.read());
    const beforeChannels = JSON.stringify(channels.read());
    await create();
    expect(JSON.stringify(suppliers.read())).toBe(beforeSuppliers);
    expect(JSON.stringify(channels.read())).toBe(beforeChannels);
  });
  it('queries filter only role-projected search content, model, status, priority and creation dates', async () => {
    const d = await create(
      input({ sharedTitle: '特定共享需求', priority: 'urgent' }),
    );
    expect(
      (
        await api('u-proc').querySourcing({
          search: '特定共享',
          modelId: 'm-seed-cn',
          priority: 'urgent',
          status: 'draft',
        })
      ).rows[0]?.demand.id,
    ).toBe(d.id);
    expect((await api().querySourcing({ from: '2099-01-01' })).total).toBe(0);
    expect(
      (await api().querySourcing({ page: 2, pageSize: 1 })).rows,
    ).toHaveLength(1);
  });
});
