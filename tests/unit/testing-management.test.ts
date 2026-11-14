import { beforeEach, describe, expect, it } from 'vitest';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import {
  ChannelRepository,
  channelStorageKey,
} from '../../src/mocks/channel-repository';
import {
  SupplierRepository,
  type StoragePort,
} from '../../src/mocks/supplier-repository';
import { SourcingRepository } from '../../src/mocks/sourcing-repository';
import { QuoteRepository } from '../../src/mocks/quote-repository';
import { fixture } from '../../src/mocks/data';
import {
  basisFor,
  assertTestResetReferences,
} from '../../src/mocks/testing-state';
import { loadDashboard } from '../../src/services/dashboard';
import { createDemoSession } from '../../src/services/demo-session';
import type { ExecutionInput } from '../../src/services/testing-types';
import type {
  ChannelInput,
  ChannelState,
} from '../../src/services/channel-types';
import { discountBps } from '../../src/domain/rules';
class Memory implements StoragePort {
  values = new Map<string, string>();
  fail = false;
  writes = 0;
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw Error('quota');
    this.values.set(k, v);
    this.writes++;
  }
}
let storage: Memory,
  channels: ChannelRepository,
  suppliers: SupplierRepository,
  sourcing: SourcingRepository,
  quotes: QuoteRepository;
const api = (
  id = 'u-ops',
  domain?: 'domestic' | 'overseas',
  active = () => true,
) =>
  createMockAdapter(id, domain, suppliers, active, channels, sourcing, quotes);
const key = () => crypto.randomUUID();
const input = (
  result: ExecutionInput['result'] = 'passed',
): ExecutionInput => ({
  result,
  technicalSummary: '模拟技术验证摘要',
  internalNotes: '受限内部说明 sentinel-internal',
  evidenceReference: 'mock:restricted-evidence',
  failureCategory: result === 'failed' ? 'timeout' : null,
});
const create = (
  type: 'quality' | 'connectivity' = 'quality',
  channelId = 'ch-2',
  a = api(),
) =>
  a.createTestTask(
    {
      channelId,
      testType: type,
      targetReference: '模拟场景 A',
      assignedTo: null,
    },
    key(),
  );
const detail = async (id: string, a = api()) => {
  const d = await a.getTestTask(id);
  expect(d).not.toBeNull();
  return d!;
};
async function run(
  id: string,
  result: ExecutionInput['result'] = 'passed',
  a = api(),
) {
  const d = await detail(id, a);
  const eid = await a.startTestTask(id, d.definition.version, key());
  const running = await detail(id, a);
  await a.finishTestExecution(
    id,
    running.definition.version,
    eid,
    input(result),
    key(),
  );
  return eid;
}
async function adopt(eid: string, id: string, a = api()) {
  const d = await detail(id, a);
  await a.adoptTestExecution(
    eid,
    { ...d.token, executionVersion: 1 },
    '模拟运营采纳依据',
    key(),
  );
}
const channelInput = (
  c: ChannelState['channels'][number],
  overrides: Partial<ChannelInput> = {},
): ChannelInput => ({
  displayName: c.displayName,
  channelType: c.channelType,
  modelInvocationName: c.modelInvocationName,
  endpointReference: c.endpointReference,
  tpm: c.tpm,
  rpm: c.rpm,
  concurrencyLimit: c.concurrencyLimit,
  ttftMs: c.ttftMs,
  ...overrides,
});
beforeEach(() => {
  storage = new Memory();
  suppliers = new SupplierRepository(storage);
  channels = new ChannelRepository(storage);
  sourcing = new SourcingRepository(storage);
  quotes = new QuoteRepository(storage);
});
describe('manual test task, execution and adoption boundaries', () => {
  it('keeps legacy IDs/order/status without invented adoption or historical metadata', async () => {
    const s = channels.read();
    expect(s.tasks).toEqual(fixture.testTasks);
    expect(s.channels.map((c) => c.id)).toEqual(
      fixture.channels.map((c) => c.id),
    );
    expect(s.conclusions).toEqual([]);
    expect(s.runs).toEqual([]);
    expect(
      s.executions.map(({ origin, performedBy, basis }) => ({
        origin,
        performedBy,
        basis,
      })),
    ).toEqual(
      fixture.testExecutions.map(() => ({
        origin: 'legacy',
        performedBy: null,
        basis: null,
      })),
    );
    expect(storage.writes).toBe(0);
  });
  it('creates independent quality and connectivity tasks on same channel', async () => {
    const q = await create(),
      c = await create('connectivity');
    await api().startTestTask(q, 1, key());
    await api().startTestTask(c, 1, key());
    expect(
      await api().queryTestTasks({ channelId: 'ch-2', status: 'running' }),
    ).toHaveLength(2);
  });
  it('prevents parallel execution of same task with no partial writes', async () => {
    const id = await create();
    await api().startTestTask(id, 1, key());
    const raw = storage.getItem(channelStorageKey);
    await expect(api().startTestTask(id, 2, key())).rejects.toThrow('不能并行');
    expect(storage.getItem(channelStorageKey)).toBe(raw);
  });
  it('completed failed execution stays pending review and leaves all other states unchanged', async () => {
    const before = channels.read().channels.find((c) => c.id === 'ch-2');
    const id = await create();
    await run(id, 'failed');
    expect((await detail(id)).task.status).toBe('completed');
    expect(channels.read().channels.find((c) => c.id === 'ch-2')).toEqual(
      before,
    );
    const r = (await api().queryTestSummaries({ channelId: 'ch-2' })).rows[0]!;
    expect(r.quality.newFailureRisk).toBe(true);
    expect(r.quality.pendingReview).toBe(1);
  });
  it('retest appends new immutable rounds under same target', async () => {
    const id = await create();
    await run(id);
    const one = channels.read().executions.at(-1);
    await run(id, 'failed');
    expect(channels.read().executions.at(-2)).toEqual(one);
    expect((await detail(id)).executions.map((e) => e.round)).toEqual([1, 2]);
  });
  it('new failure preserves adopted passed until explicitly adopted', async () => {
    const id = await create();
    const passed = await run(id);
    await adopt(passed, id);
    const failed = await run(id, 'failed');
    let d = await detail(id);
    expect(d.summary.quality).toMatchObject({
      origin: 'adopted',
      result: 'passed',
      newFailureRisk: true,
      pendingReview: 1,
    });
    await adopt(failed, id);
    d = await detail(id);
    expect(d.summary.quality).toMatchObject({
      result: 'failed',
      pendingReview: 0,
    });
    expect(d.conclusions.map((c) => c.executionId)).toEqual([passed, failed]);
  });
  it('adopting one pending result does not clear other pending executions', async () => {
    const id = await create();
    const p = await run(id);
    await run(id, 'failed');
    await adopt(p, id);
    expect((await detail(id)).summary.quality).toMatchObject({
      result: 'passed',
      pendingReview: 1,
      newFailureRisk: true,
    });
  });
  it('inconclusive can only be reviewed without conclusion and preserves execution', async () => {
    const id = await create();
    const eid = await run(id, 'inconclusive'),
      d = await detail(id),
      token = { ...d.token, executionVersion: 1 };
    await expect(
      api().adoptTestExecution(eid, token, '不能采纳', key()),
    ).rejects.toThrow('不确定');
    await api().reviewTestExecution(eid, token, '已审阅需要更多证据', key());
    const after = await detail(id);
    expect(after.reviews).toHaveLength(1);
    expect(after.conclusions).toHaveLength(0);
    expect(after.summary.quality.pendingReview).toBe(0);
    expect(after.executions[0]?.result).toBe('inconclusive');
  });
  it('refuses review bypass for current passed/failed results', async () => {
    const id = await create(),
      eid = await run(id, 'failed'),
      d = await detail(id);
    await expect(
      api().reviewTestExecution(
        eid,
        { ...d.token, executionVersion: 1 },
        '绕过采纳',
        key(),
      ),
    ).rejects.toThrow('应明确采纳');
  });
  it('legacy executions cannot be adopted as new evidence', async () => {
    const task = channels
      .read()
      .tasks.find((t) => t.id === fixture.testExecutions[0]!.taskId)!;
    const x = await detail(task.id);
    await expect(
      api().adoptTestExecution(
        fixture.testExecutions[0]!.id,
        { ...x.token, executionVersion: 1 },
        '不补造',
        key(),
      ),
    ).rejects.toThrow('legacy');
  });
  it.each(['pending', 'running'] as const)(
    'cancel %s terminates explicitly without fake failure',
    async (status) => {
      const id = await create();
      if (status === 'running') await api().startTestTask(id, 1, key());
      const d = await detail(id);
      await api().cancelTestTask(
        id,
        d.definition.version,
        '模拟人工取消',
        key(),
      );
      const after = await detail(id);
      expect(after.task.status).toBe('cancelled');
      expect(after.definition.cancelledBy).toBe('u-ops');
      expect(after.activeRun).toBeNull();
      if (status === 'running')
        expect(after.executions[0]).toMatchObject({
          result: null,
          termination: 'cancelled',
        });
      expect(after.summary.quality.newFailureRisk).toBe(false);
      await expect(
        api().startTestTask(id, after.definition.version, key()),
      ).rejects.toThrow('不能重开');
    },
  );
  it('goal cannot change after execution; assignee maintenance does not rewrite history', async () => {
    const id = await create();
    await run(id);
    const d = await detail(id);
    await expect(
      api().updateTestTask(id, d.definition.version, '新目标', null, key()),
    ).rejects.toThrow('建立新任务');
    await api().updateTestTask(
      id,
      d.definition.version,
      d.definition.targetReference,
      'u-test',
      key(),
    );
    expect((await detail(id)).executions).toEqual(d.executions);
  });
  it('ordinary display edits keep conclusion while actual configuration change invalidates target even if reverted', async () => {
    const id = await create(),
      eid = await run(id);
    await adopt(eid, id);
    let c = channels.read().channels.find((c) => c.id === 'ch-2')!;
    const original = channelInput(c);
    await api().updateChannel(
      c.id,
      c.version,
      channelInput(c, { displayName: '模拟修改名称' }),
    );
    expect((await detail(id)).summary.quality.origin).toBe('adopted');
    c = channels.read().channels.find((c) => c.id === 'ch-2')!;
    await api().updateChannel(
      c.id,
      c.version,
      channelInput(c, { modelInvocationName: 'mock-new-target' }),
    );
    expect((await detail(id)).summary.quality.origin).toBe('none');
    await expect(
      api().startTestTask(id, (await detail(id)).definition.version, key()),
    ).rejects.toThrow('新任务');
    c = channels.read().channels.find((c) => c.id === 'ch-2')!;
    await api().updateChannel(c.id, c.version, original);
    expect((await detail(id)).summary.quality.origin).toBe('none');
    expect(
      basisFor(channels.read().channels.find((c) => c.id === 'ch-2')!),
    ).not.toBe((await detail(id)).definition.basis);
  });
  it('stale target execution can be explicitly reviewed without changing conclusions', async () => {
    const id = await create(),
      eid = await run(id, 'failed');
    const c = channels.read().channels.find((c) => c.id === 'ch-2')!;
    await api().updateChannel(
      c.id,
      c.version,
      channelInput(c, { modelInvocationName: 'mock:changed' }),
    );
    const d = await detail(id);
    await api().reviewTestExecution(
      eid,
      { ...d.token, executionVersion: 1 },
      '旧目标已失效，不形成当前结论',
      key(),
    );
    expect((await detail(id)).summary.quality.pendingReview).toBe(0);
    expect(channels.read().conclusions).toHaveLength(0);
  });
});
describe('source verification and quality exemption', () => {
  async function official() {
    const c = await api().createChannel({
      ...channelInput(channels.read().channels[0]!),
      displayName: '模拟原厂新渠道',
      supplierId: 's-1',
      modelId: 'm-seed-cn',
      channelType: 'official_direct',
    });
    return c.id;
  }
  async function verify(id: string) {
    await api().verifyTestSource(
      id,
      (await api().channelVersion(id))!,
      'verified',
      'mock:source-proof',
      '模拟官方来源核验',
      key(),
    );
  }
  it('new official channel remains unverified and cannot exempt without source evidence', async () => {
    const id = await official();
    expect(
      channels.read().channels.find((c) => c.id === id)
        ?.sourceVerificationStatus,
    ).toBe('unverified');
    await expect(
      api().recordQualityExemption(id, 1, 'mock:exemption', '模拟豁免', key()),
    ).rejects.toThrow('来源核验');
  });
  it('verified official exemption is a separate fact; connectivity and its tasks remain unchanged', async () => {
    const id = await official();
    const before = channels
      .read()
      .tasks.filter((t) => t.channelId === id && t.testType === 'connectivity');
    await verify(id);
    await api().recordQualityExemption(
      id,
      (await api().channelVersion(id))!,
      'mock:quality-proof',
      '模拟独立质量证据',
      key(),
    );
    const s = channels.read(),
      c = s.channels.find((c) => c.id === id)!;
    expect(c.qualityStatus).toBe('exempted');
    expect(c.connectivityStatus).toBe('pending');
    expect(
      s.tasks.filter(
        (t) => t.channelId === id && t.testType === 'connectivity',
      ),
    ).toEqual(before);
    expect(
      s.executions.filter((e) =>
        s.tasks.some((t) => t.channelId === id && t.id === e.taskId),
      ),
    ).toEqual([]);
  });
  it('revocation preserves original exemption and does not create failure', async () => {
    const id = await official();
    await verify(id);
    const eid = await api().recordQualityExemption(
      id,
      (await api().channelVersion(id))!,
      'mock:quality',
      '模拟豁免',
      key(),
    );
    const e = channels.read().exemptions.at(-1);
    await api().revokeQualityExemption(
      eid,
      (await api().channelVersion(id))!,
      '模拟撤销原因',
      key(),
    );
    expect(channels.read().exemptions.at(-1)).toEqual(e);
    expect(channels.read().channels.find((c) => c.id === id)).toMatchObject({
      qualityStatus: 'pending',
      connectivityStatus: 'pending',
    });
    expect(channels.read().exemptionRevocations.at(-1)?.exemptionId).toBe(eid);
  });
  it('source revocation invalidates existing legacy exemption independently from connectivity', async () => {
    const c = channels.read().channels.find((c) => c.id === 'ch-1')!,
      conn = c.connectivityStatus;
    await api().verifyTestSource(
      c.id,
      c.version,
      'revoked',
      'mock:revoked',
      '模拟核验依据撤销',
      key(),
    );
    const after = channels.read();
    expect(after.channels.find((c) => c.id === 'ch-1')).toMatchObject({
      qualityStatus: 'pending',
      connectivityStatus: conn,
    });
    expect(after.exemptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.exemptions[0]!.id }),
      ]),
    );
    expect(after.exemptionRevocations).toHaveLength(1);
  });
  it('non-official source cannot qualify for quality exemption', async () => {
    const c = channels
      .read()
      .channels.find((c) => c.channelType !== 'official_direct')!;
    await verify(c.id);
    await expect(
      api().recordQualityExemption(
        c.id,
        (await api().channelVersion(c.id))!,
        'mock:quality',
        '模拟证据',
        key(),
      ),
    ).rejects.toThrow('仅适用');
  });
  it('rejects real evidence urls and empty reasons without persistence', async () => {
    const before = storage.getItem(channelStorageKey);
    await expect(
      api().verifyTestSource(
        'ch-1',
        1,
        'verified',
        'https://example.com',
        '模拟',
        key(),
      ),
    ).rejects.toThrow('mock:');
    expect(storage.getItem(channelStorageKey)).toBe(before);
    await expect(
      api().verifyTestSource('ch-1', 1, 'verified', 'mock:source', ' ', key()),
    ).rejects.toThrow('说明');
  });
});
describe('test authorization and explicit projections', () => {
  it('Testing can execute but cannot adopt, review, verify, exempt or read commercial audit', async () => {
    const a = api('u-test'),
      id = await create('quality', 'ch-2', a),
      eid = await run(id, 'failed', a),
      d = await detail(id, a);
    const token = { ...d.token, executionVersion: 1 };
    await expect(
      a.adoptTestExecution(eid, token, '模拟', key()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      a.reviewTestExecution(eid, token, '模拟', key()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      a.verifyTestSource('ch-2', 1, 'verified', 'mock:test', '模拟', key()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      a.recordQualityExemption('ch-2', 1, 'mock:test', '模拟', key()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await a.listAuditEvents()).toEqual([]);
  });
  it.each(['u-proc', 'u-support'])(
    '%s receives summary allowlist with no raw notes, evidence, actors or execution IDs',
    async (user) => {
      const id = await create(),
        eid = await run(id, 'failed');
      const a = api(user);
      const response = await a.queryTestSummaries(),
        raw = JSON.stringify(response);
      expect(raw).toContain('模拟技术验证摘要');
      for (const secret of [
        'sentinel-internal',
        'mock:restricted-evidence',
        eid,
        'internalNotes',
        'failureReason',
        'performedBy',
        'testHistory',
        'customer',
        'discount',
      ])
        expect(raw).not.toContain(secret);
      await expect(a.getTestTask(id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(a.queryTestTasks()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(create('quality', 'ch-2', a)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    },
  );
  it.each(['u-sales', 'u-account', 'u-solution', 'u-supplier'])(
    '%s cannot read new full testing or summaries API',
    async (user) => {
      await expect(api(user).queryTestSummaries()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(api(user).queryTestTasks()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    },
  );
  it('old supplier basic reads remain scoped and no new full data can be guessed', async () => {
    const a = api('u-supplier');
    const tasks = await a.listTestTasks();
    expect(tasks.length).toBeGreaterThan(0);
    expect(
      tasks.every(
        (t) =>
          channels.read().channels.find((c) => c.id === t.channelId)
            ?.supplierId === 's-1',
      ),
    ).toBe(true);
    await expect(a.getTestTask('tt-q-ch-2')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
  it('procurement summaries respect supplier grants and vendor domains', async () => {
    const sp = suppliers.read().suppliers.find((s) => s.id === 's-3')!;
    await api().updateSupplier(sp.id, sp.version, {
      name: sp.name,
      shortCode: sp.shortCode,
      supplierCategory: sp.supplierCategory,
      cooperationStatus: sp.cooperationStatus,
      ownerUserId: 'u-proc-alt',
    });
    const rows = (await api('u-proc', 'domestic').queryTestSummaries()).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => ['s-1', 's-2'].includes(r.supplier.id))).toBe(
      true,
    );
    expect(rows.every((r) => !['ch-5', 'ch-7'].includes(r.channel.id))).toBe(
      true,
    );
  });
  it('unknown task and forbidden cross-domain task return no detail', async () => {
    const id = await create('quality', 'ch-5');
    expect(await api('u-ops', 'domestic').getTestTask(id)).toBeNull();
    expect(await api().getTestTask('guess-missing')).toBeNull();
    await expect(
      api('u-ops', 'domestic').startTestTask(id, 1, key()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('retired sessions cannot retry even an already successful idempotent request', async () => {
    let active = true;
    const a = api('u-ops', undefined, () => active),
      k = key(),
      i = {
        channelId: 'ch-2',
        testType: 'quality' as const,
        targetReference: '模拟目标',
        assignedTo: null,
      };
    await a.createTestTask(i, k);
    active = false;
    await expect(a.createTestTask(i, k)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(a.queryTestSummaries()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
  it('legacy free text never becomes shared technical summary', async () => {
    for (const r of (await api('u-proc').queryTestSummaries()).rows)
      expect([
        r.quality.technicalSummary,
        r.connectivity.technicalSummary,
      ]).toEqual([null, null]);
  });
});
describe('aggregate durability, versions and migration', () => {
  it('normalizes exact v1 graph lazily and persists v2 only after successful write', async () => {
    const s = channels.read();
    const v1 = {
      schemaVersion: 1,
      revision: 13,
      channels: s.channels,
      tasks: s.tasks,
      history: s.history,
    };
    storage.setItem(channelStorageKey, JSON.stringify(v1));
    const before = storage.getItem(channelStorageKey);
    const migrated = channels.read();
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.channels).toEqual(v1.channels);
    expect(migrated.tasks).toEqual(v1.tasks);
    expect(storage.getItem(channelStorageKey)).toBe(before);
    await create();
    expect(JSON.parse(storage.getItem(channelStorageKey)!).schemaVersion).toBe(
      2,
    );
    expect(channels.read().executions).toHaveLength(
      fixture.testExecutions.length,
    );
  });
  it('migration preserves dynamic channel, tasks, OP binding and existing audit', async () => {
    const c = await api().createChannel({
      ...channelInput(channels.read().channels[0]!),
      supplierId: 's-1',
      modelId: 'm-seed-cn',
      displayName: '模拟迁移渠道',
    });
    await api().bindChannelOp(
      c.id,
      (await api().channelVersion(c.id))!,
      'MOCK-MIGRATE-01',
      true,
    );
    const s = channels.read();
    storage.setItem(
      channelStorageKey,
      JSON.stringify({
        schemaVersion: 1,
        revision: s.revision,
        channels: s.channels,
        tasks: s.tasks,
        history: s.history,
      }),
    );
    const m = channels.read();
    expect(m.channels).toEqual(s.channels);
    expect(m.tasks).toEqual(s.tasks);
    expect(m.history).toEqual(s.history);
    await create('quality', c.id);
    expect(
      channels.read().channels.find((x) => x.id === c.id)?.opChannelId,
    ).toBe('MOCK-MIGRATE-01');
  });
  it.each(['{broken', JSON.stringify({ schemaVersion: 99 })])(
    'rejects invalid stored graph without fallback or rewrite: %s',
    async (raw) => {
      storage.setItem(channelStorageKey, raw);
      expect(() => channels.read()).toThrow('读取失败');
      await expect(create()).rejects.toThrow();
      expect(storage.getItem(channelStorageKey)).toBe(raw);
    },
  );
  it('single aggregate write atomically commits task execution audit and request', async () => {
    const id = await create(),
      writes = storage.writes;
    const eid = await api().startTestTask(id, 1, key());
    expect(storage.writes).toBe(writes + 1);
    const s = channels.read();
    expect(s.runs.at(-1)?.id).toBe(eid);
    expect(s.testHistory.at(-1)?.executionId).toBe(eid);
    expect(s.testRequests.at(-1)?.resultId).toBe(eid);
    expect(s.tasks.find((t) => t.id === id)?.status).toBe('running');
  });
  it('quota failure during finish leaves task, execution, audit and requests unchanged', async () => {
    const id = await create(),
      eid = await api().startTestTask(id, 1, key()),
      before = storage.getItem(channelStorageKey),
      k = key();
    storage.fail = true;
    await expect(
      api().finishTestExecution(id, 2, eid, input(), k),
    ).rejects.toMatchObject({ code: 'STORAGE' });
    expect(storage.getItem(channelStorageKey)).toBe(before);
    storage.fail = false;
    await api().finishTestExecution(id, 2, eid, input(), k);
    expect((await detail(id)).task.status).toBe('completed');
  });
  it('quota failure during adoption preserves original current state and entire aggregate', async () => {
    const id = await create(),
      eid = await run(id);
    const before = storage.getItem(channelStorageKey);
    storage.fail = true;
    await expect(adopt(eid, id)).rejects.toMatchObject({ code: 'STORAGE' });
    expect(storage.getItem(channelStorageKey)).toBe(before);
  });
  it('request replay is idempotent but changed payload or operation is rejected', async () => {
    const k = key(),
      i = {
        channelId: 'ch-2',
        testType: 'quality' as const,
        targetReference: '模拟目标',
        assignedTo: null,
      };
    const id = await api().createTestTask(i, k),
      writes = storage.writes;
    expect(await api().createTestTask(i, k)).toBe(id);
    expect(storage.writes).toBe(writes);
    await expect(
      api().createTestTask({ ...i, targetReference: '其他目标' }, k),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(api().startTestTask(id, 1, k)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
  it('start and finish replays do not add duplicate rounds or events', async () => {
    const id = await create(),
      k = key(),
      eid = await api().startTestTask(id, 1, k);
    expect(await api().startTestTask(id, 1, k)).toBe(eid);
    const f = key();
    await api().finishTestExecution(id, 2, eid, input(), f);
    const s = storage.getItem(channelStorageKey);
    await api().finishTestExecution(id, 2, eid, input(), f);
    expect(storage.getItem(channelStorageKey)).toBe(s);
  });
  it('stale task and conclusion tokens fail with storage unchanged', async () => {
    const id = await create(),
      one = await run(id),
      d = await detail(id);
    await expect(api().startTestTask(id, 1, key())).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const two = await run(id, 'failed');
    await adopt(two, id);
    const raw = storage.getItem(channelStorageKey);
    await expect(
      api().adoptTestExecution(
        one,
        { ...d.token, executionVersion: 1 },
        '过期窗口',
        key(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(storage.getItem(channelStorageKey)).toBe(raw);
  });
  it.each([
    'runs',
    'executions',
    'conclusions',
    'reviews',
    'sourceVerifications',
    'exemptions',
    'exemptionRevocations',
    'testHistory',
    'testRequests',
    'legacyTestStates',
  ] as const)(
    'protects %s from truncation and preserves bytes on failure',
    async (collection) => {
      const id = await create(),
        eid = await run(id);
      await adopt(eid, id);
      const inc = await run(id, 'inconclusive'),
        d = await detail(id);
      await api().reviewTestExecution(
        inc,
        { ...d.token, executionVersion: 1 },
        '模拟审阅',
        key(),
      );
      await api().verifyTestSource(
        'ch-1',
        1,
        'revoked',
        'mock:source',
        '模拟撤销',
        key(),
      );
      const before = channels.read(),
        next = { ...before, [collection]: before[collection].slice(0, -1) };
      expect(before[collection].length).toBeGreaterThan(0);
      const raw = storage.getItem(channelStorageKey);
      expect(() => channels.write(before, next, suppliers)).toThrow();
      expect(storage.getItem(channelStorageKey)).toBe(raw);
    },
  );
  it('immutable execution field modification is refused even with a valid shape', async () => {
    const id = await create();
    await run(id);
    const before = channels.read(),
      raw = storage.getItem(channelStorageKey);
    expect(() =>
      channels.write(
        before,
        {
          ...before,
          executions: before.executions.map((e) =>
            e.origin === 'recorded' ? { ...e, internalNotes: '改写历史' } : e,
          ),
        },
        suppliers,
      ),
    ).toThrow('仅允许追加');
    expect(storage.getItem(channelStorageKey)).toBe(raw);
  });
  it('aggregate version rejects stale concurrent snapshot', async () => {
    const stale = channels.read();
    await create();
    const raw = storage.getItem(channelStorageKey);
    expect(() => channels.write(stale, stale, suppliers)).toThrow('已变化');
    expect(storage.getItem(channelStorageKey)).toBe(raw);
  });
  it('reset preserves seeded remediation execution references and explicitly clears new original-channel history', async () => {
    const id = await create();
    await run(id);
    await api().resetChannelDemo(true);
    const s = channels.read();
    expect(s.tasks).toEqual(fixture.testTasks);
    expect(s.executions.map((e) => e.id)).toEqual(
      fixture.testExecutions.map((e) => e.id),
    );
    expect(() =>
      assertTestResetReferences(s, fixture.remediations),
    ).not.toThrow();
  });
  it('reset rejects future external references to new execution even on a seeded channel', async () => {
    const id = await create(),
      eid = await run(id),
      fresh = new ChannelRepository(new Memory()).read();
    expect(() =>
      assertTestResetReferences(fresh, [
        {
          ...fixture.remediations[0]!,
          channelId: 'ch-2',
          relatedTestExecutionId: eid,
        },
      ]),
    ).toThrow('拒绝重置');
  });
});
describe('cross-module authoritative testing snapshot', () => {
  it('Dashboard summary metrics equal test workbench metrics after adoption and new failure', async () => {
    const id = await create(),
      eid = await run(id);
    await adopt(eid, id);
    await run(id, 'failed');
    const a = api(),
      dashboard = await loadDashboard(a, createDemoSession('u-ops').permits);
    expect(dashboard.testing).toEqual((await a.queryTestSummaries()).stats);
    expect(dashboard.testing).toMatchObject({
      reviewChannels: 1,
      newFailureChannels: 1,
      currentFailedChannels: 0,
    });
  });
  it('channel detail, resource pool and authorized summary use same adopted status', async () => {
    const id = await create('connectivity'),
      eid = await run(id, 'failed');
    await adopt(eid, id);
    expect((await api().getChannelResource('ch-2'))?.connectivityStatus).toBe(
      'failed',
    );
    const model = await api().getModelResource(
      channels.read().channels.find((c) => c.id === 'ch-2')!.modelId,
    );
    expect(
      model?.channels.find((c) => c.id === 'ch-2')?.connectivityStatus,
    ).toBe('failed');
    expect(
      (await api().queryTestSummaries({ channelId: 'ch-2' })).rows[0]
        ?.connectivity,
    ).toMatchObject({ origin: 'adopted', result: 'failed' });
  });
  it('new testing facts leave quote and sourcing histories untouched; both full graph validators accept the snapshot', async () => {
    const quoteBefore = quotes.read(),
      sourceBefore = sourcing.read();
    const id = await create(),
      eid = await run(id, 'failed');
    await adopt(eid, id);
    expect(quotes.read()).toEqual(quoteBefore);
    expect(sourcing.read()).toEqual(sourceBefore);
    expect(() =>
      quotes.validate(quotes.read(), channels, suppliers, sourcing),
    ).not.toThrow();
    expect(() =>
      sourcing.validate(sourcing.read(), channels, suppliers),
    ).not.toThrow();
  });
  it('ordinary channel save and quote creation still succeed after new exemption facts', async () => {
    await api().revokeQualityExemption(
      fixture.exemptions[0]!.id,
      1,
      '模拟重新登记准备',
      key(),
    );
    await api().verifyTestSource(
      'ch-1',
      (await api().channelVersion('ch-1'))!,
      'verified',
      'mock:source',
      '模拟来源',
      key(),
    );
    await api().recordQualityExemption(
      'ch-1',
      (await api().channelVersion('ch-1'))!,
      'mock:quality',
      '模拟质量',
      key(),
    );
    const c = channels.read().channels.find((c) => c.id === 'ch-1')!;
    await api().updateChannel(
      c.id,
      c.version,
      channelInput(c, { displayName: '模拟新资料' }),
    );
    await api().createQuote(
      {
        channelId: 'ch-1',
        demandId: null,
        demandItemId: null,
        inquiryId: null,
        inquiryVersion: null,
        previousQuoteId: null,
        discount: discountBps(6500),
        priceStatus: 'reference',
        sourceType: 'supplier_submission',
        effectiveFrom: null,
        effectiveUntil: null,
        supplierQuotedAt: null,
        supplierSubmitterReference: 'mock:contact',
        evidenceReference: 'mock:quote',
        reason: '模拟报价回归',
        priceSpec: {
          currency: null,
          referencePriceSource: null,
          specification: null,
          rates: [],
        },
      },
      key(),
    );
    expect(quotes.read().quotes.at(-1)?.discount).toBe(6500);
  });
});

describe('additional migration and mutation regressions', () => {
  it('failed first v1 migration write preserves original stored bytes', async () => {
    const s = channels.read();
    const raw = JSON.stringify({
      schemaVersion: 1,
      revision: 7,
      channels: s.channels,
      tasks: s.tasks,
      history: s.history,
    });
    storage.setItem(channelStorageKey, raw);
    storage.fail = true;
    await expect(create()).rejects.toMatchObject({ code: 'STORAGE' });
    expect(storage.getItem(channelStorageKey)).toBe(raw);
    storage.fail = false;
    await create();
    expect(channels.read().schemaVersion).toBe(2);
  });
  it('channel update response and audit snapshot reflect configuration invalidation immediately', async () => {
    const c = channels.read().channels.find((c) => c.id === 'ch-1')!;
    const response = await api().updateChannel(
      c.id,
      c.version,
      channelInput(c, { modelInvocationName: 'mock:changed-identity' }),
    );
    expect(response).toMatchObject({
      qualityStatus: 'pending',
      sourceVerificationStatus: 'unverified',
    });
    expect(channels.read().history.at(-1)?.afterSnapshot).toEqual(
      channels.read().channels.find((v) => v.id === c.id),
    );
    expect(channels.read().testHistory.at(-1)?.action).toBe(
      'configuration_changed',
    );
    expect(channels.read().exemptionRevocations.at(-1)?.action).toBe(
      'invalidated',
    );
  });
  it('sourcing manual save remains successful after adopted failure without automatically changing fit', async () => {
    const a = api(),
      original = await a.getSourcingDemand('d-1');
    const candidate = original!.items.flatMap((i) => i.candidates)[0]!;
    const id = await create('quality', candidate.channel.id),
      eid = await run(id, 'failed');
    await adopt(eid, id);
    const d = (await a.getSourcingDemand('d-1'))!;
    const unchanged = d.items
      .flatMap((i) => i.candidates)
      .find((c) => c.match.id === candidate.match.id)!;
    expect(unchanged.match.matchStatus).toBe(candidate.match.matchStatus);
    await a.updateSourcingCandidate(
      d.demand.id,
      d.demand.version,
      candidate.match.id,
      candidate.match.matchStatus,
      '人工补充模拟跟进，不由测试自动修改',
    );
    expect(
      (await a.getSourcingDemand('d-1'))!.items
        .flatMap((i) => i.candidates)
        .find((c) => c.match.id === candidate.match.id)?.match.assessment,
    ).toBe('人工补充模拟跟进，不由测试自动修改');
  });
});

it('adopted failed result and active quality exemption remain independent facts', async () => {
  const id = await create('quality', 'ch-1'),
    eid = await run(id, 'failed');
  await adopt(eid, id);
  const summary = (await api().queryTestSummaries({ channelId: 'ch-1' }))
    .rows[0]!;
  expect(summary.exempted).toBe(true);
  expect(summary.quality).toMatchObject({
    origin: 'adopted',
    result: 'failed',
    status: 'exempted',
  });
  expect(
    channels.read().channels.find((c) => c.id === 'ch-1')?.connectivityStatus,
  ).toBe('pending');
});
it('rejects cross-channel execution audit references without changing persisted data', async () => {
  const id = await create(),
    eid = await run(id),
    s = channels.read(),
    raw = storage.getItem(channelStorageKey);
  expect(() =>
    channels.write(
      s,
      {
        ...s,
        testHistory: [
          ...s.testHistory,
          {
            id: key(),
            channelId: 'ch-3',
            taskId: null,
            executionId: eid,
            action: 'invalid_reference',
            actorUserId: 'u-ops',
            occurredAt: new Date().toISOString(),
            reason: '模拟非法跨渠道关联',
            requestId: key(),
            changes: [],
          },
        ],
      },
      suppliers,
    ),
  ).toThrow('审计关联');
  expect(storage.getItem(channelStorageKey)).toBe(raw);
});

it('task list recent execution result and time remain per-task while adopted conclusion is channel-wide', async () => {
  const one = await create(),
    p = await run(one);
  await adopt(p, one);
  const two = await create();
  await run(two, 'failed');
  const rows = await api().queryTestTasks({ channelId: 'ch-2' }),
    a = rows.find((r) => r.task.id === one)!,
    b = rows.find((r) => r.task.id === two)!;
  expect(a.latestExecution).toMatchObject({
    result: 'passed',
    finishedAt: (await detail(one)).executions[0]!.finishedAt,
  });
  expect(b.latestExecution).toMatchObject({
    result: 'failed',
    finishedAt: (await detail(two)).executions[0]!.finishedAt,
  });
  expect(a.summary.quality.result).toBe('passed');
  expect(b.summary.quality.result).toBe('passed');
});

it('exposes current target separately from legacy configuration provenance for new tasks', async () => {
  const old = await create(),
    c = channels.read().channels.find((c) => c.id === 'ch-2')!;
  await api().updateChannel(
    c.id,
    c.version,
    channelInput(c, { modelInvocationName: 'mock:new-target' }),
  );
  const fresh = await create();
  expect((await detail(old)).targetCurrent).toBe(false);
  expect((await detail(fresh)).targetCurrent).toBe(true);
  const eid = await run(fresh);
  await adopt(eid, fresh);
  expect((await detail(fresh)).summary.quality.result).toBe('passed');
});
