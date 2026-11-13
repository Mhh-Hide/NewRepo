import { beforeEach, describe, expect, it } from 'vitest';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import {
  ChannelRepository,
  channelStorageKey,
} from '../../src/mocks/channel-repository';
import { SupplierRepository } from '../../src/mocks/supplier-repository';
import type { StoragePort } from '../../src/mocks/supplier-repository';
import type { ChannelInput } from '../../src/services/channel-types';
import type { SupplierInput } from '../../src/domain/suppliers';
import { loadDashboard } from '../../src/services/dashboard';
import { fixture } from '../../src/mocks/data';
import { validateStore } from '../../src/domain/validation';
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
const api = (
  id = 'u-ops',
  domain?: 'domestic' | 'overseas',
  active = () => true,
) => createMockAdapter(id, domain, suppliers, active, channels);
const input = (overrides: Partial<ChannelInput> = {}): ChannelInput => ({
  displayName: '虚构新增渠道（模拟）',
  channelType: 'official_direct',
  modelInvocationName: 'mock-model',
  endpointReference: 'mock-ref',
  tpm: null,
  rpm: null,
  concurrencyLimit: null,
  ttftMs: null,
  ...overrides,
});
const supplierInput: SupplierInput = {
  name: '虚构新供应商',
  shortCode: 'MOCK-NEW',
  supplierCategory: 'third_party',
  cooperationStatus: 'potential',
  ownerUserId: 'u-proc',
};
const create = (
  overrides: Partial<
    ChannelInput & { supplierId: string; modelId: string }
  > = {},
) =>
  api().createChannel({
    ...input(),
    supplierId: 's-1',
    modelId: 'm-seed-cn',
    ...overrides,
  });
beforeEach(() => {
  storage = new Memory();
  suppliers = new SupplierRepository(storage);
  channels = new ChannelRepository(storage);
});
describe('channel lifecycle and coherent graph', () => {
  it('preserves initial IDs without rewriting the fixture', async () => {
    expect((await api().listChannels()).map((c) => c.id)).toEqual(
      fixture.channels.map((c) => c.id),
    );
    expect(storage.values.size).toBe(0);
  });
  it('creates unique immutable IDs linked to existing supplier and model', async () => {
    const c = await create();
    expect(c.id).toMatch(/^mock-channel-/);
    expect(c.supplierId).toBe('s-1');
    expect(c.modelId).toBe('m-seed-cn');
    expect((await create()).id).not.toBe(c.id);
  });
  it('creates pending connectivity and quality tasks in the same graph', async () => {
    const c = await create();
    expect(await api().listTestTasks(c.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          testType: 'connectivity',
          status: 'pending',
        }),
        expect.objectContaining({ testType: 'quality', status: 'pending' }),
      ]),
    );
    expect(
      validateStore({
        ...fixture,
        suppliers: suppliers.read().suppliers,
        channels: channels.read().channels,
        testTasks: channels.read().tasks,
      }),
    ).toEqual([]);
  });
  it('official type never verifies source, exempts quality or opens a channel', async () => {
    const c = await create();
    expect(c).toMatchObject({
      opChannelId: null,
      sourceVerificationStatus: 'unverified',
      qualityStatus: 'pending',
      connectivityStatus: 'pending',
      integrationStatus: 'not_started',
      availabilityStatus: 'closed',
      resourceStatus: 'enabled',
    });
    expect(await api().listQualityExemptions(c.id)).toEqual([]);
  });
  it('does not fabricate executions or quotations', async () => {
    const c = await create();
    for (const t of await api().listTestTasks(c.id))
      expect(await api().listTestExecutions(t.id)).toEqual([]);
    expect(await api().getQuoteHistory(c.id)).toEqual([]);
  });
  it('keeps multiple channels per supplier/model but deduplicates coverage', async () => {
    const before = (await api().getModelResource('m-seed-cn'))!;
    await create();
    const after = (await api().getModelResource('m-seed-cn'))!;
    expect(after.summary.channelCount).toBe(before.summary.channelCount + 1);
    expect(after.summary.supplierCount).toBe(before.summary.supplierCount);
  });
  it('uses newly created supplier master and increases first-model coverage', async () => {
    const a = api();
    const s = await a.createSupplier(supplierInput);
    await create({ supplierId: s.id });
    expect((await a.getSupplier(s.id))?.resources).toMatchObject({
      channelCount: 1,
      modelCount: 1,
      channelTypes: ['官方原厂 Key'],
    });
    expect((await a.getModelResource('m-seed-cn'))?.summary.supplierCount).toBe(
      4,
    );
    expect(await a.listSupplierHistory(s.id)).toHaveLength(1);
  });
  it('dashboard derives new resource and pending task counts without refresh/reset', async () => {
    const before = await loadDashboard(api(), () => true);
    await create();
    const after = await loadDashboard(api(), () => true);
    for (const id of ['channels', 'quality', 'connectivity'])
      expect(after.metrics.find((m) => m.id === id)?.value).toBe(
        before.metrics.find((m) => m.id === id)!.value + 1,
      );
  });
  it('edits capability values consistently across list, detail, model and dashboard', async () => {
    const c = await create();
    await api().updateChannel(c.id, 1, input({ tpm: 123456, rpm: 321 }));
    expect((await api().listChannels()).find((r) => r.id === c.id)?.rpm).toBe(
      321,
    );
    expect((await api().getChannelResource(c.id))?.tpm).toBe(123456);
    expect(
      (await api().getModelResource(c.modelId))?.channels.find(
        (r) => r.id === c.id,
      )?.rpm,
    ).toBe(321);
    expect(
      (await loadDashboard(api(), () => true)).channels.find(
        (r) => r.id === c.id,
      )?.tpm,
    ).toBe(123456);
  });
  it('retains unknown null capacities and accepts zero and fractional milliseconds', async () => {
    const c = await create({ rpm: 0, ttftMs: 0.5 });
    expect(c).toMatchObject({
      tpm: null,
      rpm: 0,
      concurrencyLimit: null,
      ttftMs: 0.5,
    });
  });
  it.each([
    ['tpm', -1],
    ['rpm', 1.2],
    ['concurrencyLimit', 2.1],
    ['tpm', NaN],
    ['rpm', Infinity],
    ['ttftMs', -0.2],
    ['rpm', '123'],
    ['tpm', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects invalid capability %s=%s', async (key, value) => {
    await expect(
      create({ [key]: value } as Partial<ChannelInput>),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(channels.read().channels).toHaveLength(7);
  });
  it.each([{ supplierId: 'missing' }, { modelId: 'missing' }])(
    'rejects invalid relationship %j',
    async (ids) => {
      await expect(create(ids)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );
  it('blocks new cooperation with a disabled supplier but keeps historical channels', async () => {
    const s = (await api().getSupplier('s-1'))!.supplier;
    await api().setSupplierStatus(s.id, s.version, 'disabled');
    await expect(create()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await api().getChannelResource('ch-1')).not.toBeNull();
  });
  it.each([
    'id',
    'supplierId',
    'modelId',
    'opChannelId',
    'qualityStatus',
    'sourceVerificationStatus',
    'availabilityStatus',
    'integrationStatus',
    'connectivityStatus',
    'resourceStatus',
  ])('rejects forbidden editing field %s', async (field) => {
    await expect(
      api().updateChannel('ch-1', 1, { ...input(), [field]: 'tampered' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  it('detects optimistic conflicts and does not overwrite the first save', async () => {
    const c = await create();
    await api().updateChannel(c.id, 1, input({ tpm: 10 }));
    await expect(
      api().updateChannel(c.id, 1, input({ tpm: 20 })),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await api().getChannelResource(c.id))?.tpm).toBe(10);
  });
  it('does not increment version, persist or append history on no-op', async () => {
    const c = await create();
    const raw = storage.getItem(channelStorageKey);
    await api().updateChannel(c.id, 1, input());
    expect(await api().channelVersion(c.id)).toBe(1);
    expect(await api().channelHistory(c.id)).toHaveLength(1);
    expect(storage.getItem(channelStorageKey)).toBe(raw);
  });
  it('appends before/after audit values and preserves previous events', async () => {
    const c = await create();
    await api().updateChannel(c.id, 1, input({ tpm: 88 }));
    const history = await api().channelHistory(c.id);
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({
      actorUserId: 'u-ops',
      changedFields: ['tpm'],
      beforeSnapshot: { tpm: null, version: 1 },
      afterSnapshot: { tpm: 88, version: 2 },
    });
    expect(history[0]?.beforeSnapshot).toBeNull();
  });
  it('resource toggle changes only the resource status and metadata', async () => {
    const c = await create();
    const next = await api().toggleChannel(c.id, 1, 'disabled');
    expect(next).toMatchObject({
      resourceStatus: 'disabled',
      qualityStatus: c.qualityStatus,
      connectivityStatus: c.connectivityStatus,
      integrationStatus: c.integrationStatus,
      availabilityStatus: c.availabilityStatus,
    });
    expect((await api().channelHistory(c.id))[1]?.action).toBe(
      'channel:toggle',
    );
  });
  it('restores saved channels through fresh repository instances', async () => {
    const c = await create();
    await api().updateChannel(c.id, 1, input({ rpm: 123 }));
    channels = new ChannelRepository(storage);
    suppliers = new SupplierRepository(storage);
    expect((await api().getChannelResource(c.id))?.rpm).toBe(123);
    expect(await api().listTestTasks(c.id)).toHaveLength(2);
  });
  it('storage failure commits no partial channel, task or audit', async () => {
    storage.fail = true;
    await expect(create()).rejects.toMatchObject({ code: 'STORAGE' });
    expect(channels.read().channels).toHaveLength(7);
    expect(channels.read().history).toHaveLength(0);
    expect(channels.read().tasks).toHaveLength(fixture.testTasks.length);
  });
  it('repository rejects missing connectivity tasks without weakening domain rules', () => {
    const s = channels.read();
    expect(() => channels.write(s, { ...s, tasks: [] }, suppliers)).toThrow(
      'Missing connectivity task',
    );
  });
  it('repository detects storage revision conflict', () => {
    const old = channels.read();
    channels.write(old, old, suppliers);
    expect(() => channels.write(old, old, suppliers)).toThrow('重新加载');
  });
});
describe('OP mock binding and authorizations', () => {
  it('rejects duplicate nonempty OP ID across channels', async () => {
    const a = await create();
    const b = await create();
    await api().bindChannelOp(a.id, 1, 'MOCK-unique', true);
    await expect(
      api().bindChannelOp(b.id, 1, 'MOCK-unique', true),
    ).rejects.toThrow(/OP 渠道 ID 冲突/);
    expect((await api().getChannelResource(b.id))?.opChannelId).toBeNull();
  });
  it('allows many null IDs and idempotent confirmation of the same binding', async () => {
    const c = await create();
    await create();
    await api().bindChannelOp(c.id, 1, 'MOCK-one', true);
    const raw = storage.getItem(channelStorageKey);
    await api().bindChannelOp(c.id, 1, 'MOCK-one', true);
    await api().bindChannelOp(c.id, 2, 'MOCK-one', true);
    expect(storage.getItem(channelStorageKey)).toBe(raw);
  });
  it('binding never changes independent technical state', async () => {
    const c = await create();
    const next = await api().bindChannelOp(c.id, 1, 'MOCK-unchanged', true);
    expect(next).toMatchObject({
      integrationStatus: 'not_started',
      availabilityStatus: 'closed',
      connectivityStatus: 'pending',
    });
    expect((await api().channelHistory(c.id))[1]?.changedFields).toEqual([
      'opChannelId',
    ]);
  });
  it('refuses to overwrite existing binding', async () => {
    const c = await create();
    await api().bindChannelOp(c.id, 1, 'MOCK-first', true);
    await expect(
      api().bindChannelOp(c.id, 2, 'MOCK-second', true),
    ).rejects.toThrow();
  });
  it.each([
    ['production-id', true],
    ['', true],
    ['MOCK-valid', false],
    ['MOCK- space', true],
  ])(
    'requires explicit mock format and confirmation %s',
    async (op, confirm) => {
      await expect(
        api().bindChannelOp('ch-2', 1, String(op), Boolean(confirm)),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    },
  );
  it.each([
    'u-proc',
    'u-proc-alt',
    'u-test',
    'u-support',
    'u-supplier',
    'u-sales',
    'u-account',
    'u-solution',
    'u-no-domain',
  ])('denies every channel write and technical history to %s', async (id) => {
    const a = api(id);
    for (const operation of [
      () =>
        a.createChannel({
          ...input(),
          supplierId: 's-1',
          modelId: 'm-seed-cn',
        }),
      () => a.updateChannel('ch-1', 1, input()),
      () => a.toggleChannel('ch-1', 1, 'disabled'),
      () => a.bindChannelOp('ch-2', 1, 'MOCK-denied', true),
      () => a.resetChannelDemo(true),
    ])
      await expect(operation()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await a.channelHistory('ch-1')).toEqual([]);
  });
  it('supplier sees only its own channels including new records', async () => {
    await create();
    await create({ supplierId: 's-2' });
    const own = await api('u-supplier').listChannels();
    expect(own.every((c) => c.supplierId === 's-1')).toBe(true);
    expect(await api('u-supplier').getChannelResource('ch-3')).toBeNull();
  });
  it('domain restrictions apply to reads, edits, creation and history', async () => {
    const c = await create({ modelId: 'm-gpt' });
    const a = api('u-domestic');
    expect(await a.getChannelResource(c.id)).toBeNull();
    expect(await a.channelHistory(c.id)).toEqual([]);
    await expect(a.updateChannel(c.id, 1, input())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      a.createChannel({ ...input(), supplierId: 's-1', modelId: 'm-gpt' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('selected domain narrows operations grants on write', async () => {
    await expect(
      api('u-ops', 'domestic').updateChannel('ch-5', 1, input()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('revoked session cannot write even from a retained API reference', async () => {
    let active = true;
    const a = api('u-ops', undefined, () => active);
    active = false;
    await expect(
      a.createChannel({ ...input(), supplierId: 's-1', modelId: 'm-seed-cn' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(a.updateChannel('ch-1', 1, input())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
  it('front projection and history never expose identity or technical references', async () => {
    const c = await create();
    await api().bindChannelOp(c.id, 1, 'MOCK-private', true);
    for (const id of ['u-sales', 'u-account', 'u-solution']) {
      const a = api(id);
      const view = await a.getChannelResource(c.id);
      for (const key of [
        'supplier',
        'supplierId',
        'opChannelId',
        'endpointReference',
        'modelInvocationName',
      ])
        expect(view).not.toHaveProperty(key);
      expect(await a.channelHistory(c.id)).toEqual([]);
      expect(JSON.stringify(view)).not.toContain(c.displayName);
    }
  });
  it('API response mutation cannot alter stored channels or audit', async () => {
    const c = await create();
    const history = await api().channelHistory(c.id);
    Object.assign(history[0]!.afterSnapshot, { tpm: 999 });
    Object.assign(c, { rpm: 999 });
    expect((await api().getChannelResource(c.id))?.tpm).toBeNull();
    expect((await api().channelHistory(c.id))[0]?.afterSnapshot.rpm).toBeNull();
  });
});
describe('safe reset and data compatibility', () => {
  it('reuses existing master access policy: a visible channel grants master access without relabeling supplier domain', async () => {
    const s = await api('u-overseas').createSupplier(supplierInput);
    await create({ supplierId: s.id });
    const a = api('u-domestic');
    expect((await a.listSuppliers()).some((v) => v.id === s.id)).toBe(true);
    await expect(
      a.createChannel({ ...input(), supplierId: s.id, modelId: 'm-seed-cn' }),
    ).resolves.toMatchObject({ supplierId: s.id });
    expect(
      suppliers.read().scopes.find((g) => g.supplierId === s.id)
        ?.managementDomains,
    ).toEqual(['overseas']);
  });
  it('denies a no-channel supplier outside the current authorized master scope', async () => {
    const s = await api('u-overseas').createSupplier(supplierInput);
    await expect(
      api('u-domestic').createChannel({
        ...input(),
        supplierId: s.id,
        modelId: 'm-seed-cn',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('blocks supplier reset with new supplier channel dependencies, preserving both stores', async () => {
    const s = await api().createSupplier(supplierInput);
    const c = await create({ supplierId: s.id });
    await expect(api().resetSupplierDemo(true)).rejects.toThrow(
      '先确认重置渠道',
    );
    expect(await api().getSupplier(s.id)).not.toBeNull();
    expect(await api().getChannelResource(c.id)).not.toBeNull();
    await api().resetChannelDemo(true);
    expect(await api().getSupplier(s.id)).not.toBeNull();
    expect(await api().listSupplierHistory(s.id)).toHaveLength(1);
    await api().resetSupplierDemo(true);
    expect(await api().getSupplier(s.id)).toBeNull();
    channels.validate(channels.read(), suppliers);
  });
  it('requires confirmation and complete dual-domain context to reset channels', async () => {
    await expect(api().resetChannelDemo(false)).rejects.toThrow();
    await expect(
      api('u-ops', 'domestic').resetChannelDemo(true),
    ).rejects.toThrow();
    await expect(api('u-domestic').resetChannelDemo(true)).rejects.toThrow();
  });
  it('channel reset preserves suppliers and all original channel-linked history', async () => {
    const c = await create();
    await api().resetChannelDemo(true);
    expect(await api().getChannelResource(c.id)).toBeNull();
    expect(await api().getQuoteHistory('ch-1')).toHaveLength(
      fixture.quotes.filter((q) => q.channelId === 'ch-1').length,
    );
    expect(channels.read().tasks).toEqual(fixture.testTasks);
    expect(await api().listSuppliers()).toHaveLength(3);
  });
  it.each([
    '{bad',
    '{"schemaVersion":99}',
    '{"schemaVersion":1,"revision":0,"channels":[{}],"tasks":[],"history":[]}',
  ])(
    'does not silently overwrite incompatible channel data %s',
    async (raw) => {
      storage.values.set(channelStorageKey, raw);
      await expect(api().listChannels()).rejects.toMatchObject({
        code: 'STORAGE',
      });
      expect(storage.getItem(channelStorageKey)).toBe(raw);
      await api().resetChannelDemo(true);
      expect(await api().listChannels()).toHaveLength(7);
    },
  );
  it('does not overwrite Stage 03 supplier data while initializing channel storage', async () => {
    const s = await api().createSupplier(supplierInput);
    const snapshot = JSON.stringify(suppliers.read());
    await create({ supplierId: s.id });
    expect(JSON.stringify(suppliers.read())).toBe(snapshot);
  });
});
