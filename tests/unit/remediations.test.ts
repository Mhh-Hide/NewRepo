import { beforeEach, describe, expect, it } from 'vitest';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { ChannelRepository } from '../../src/mocks/channel-repository';
import {
  SupplierRepository,
  type StoragePort,
} from '../../src/mocks/supplier-repository';
import { SourcingRepository } from '../../src/mocks/sourcing-repository';
import { QuoteRepository } from '../../src/mocks/quote-repository';
import {
  RemediationRepository,
  remediationStorageKey,
  assertRemediationReferences,
} from '../../src/mocks/remediation-repository';
import type {
  RemediationInput,
  RemediationOperation,
} from '../../src/services/remediation-types';
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
let memory: Memory,
  channels: ChannelRepository,
  suppliers: SupplierRepository,
  sourcing: SourcingRepository,
  quotes: QuoteRepository,
  repo: RemediationRepository;
const key = () => crypto.randomUUID();
const api = (
  id = 'u-ops',
  domain?: 'domestic' | 'overseas',
  active = () => true,
) =>
  createMockAdapter(
    id,
    domain,
    suppliers,
    active,
    channels,
    sourcing,
    quotes,
    repo,
  );
const input = (changes: Partial<RemediationInput> = {}): RemediationInput => ({
  channelId: 'ch-2',
  sourceType: 'manual',
  sourceExecutionId: null,
  category: 'quality',
  verificationScope: 'quality',
  targetReference: 'mock:target-a',
  sharedSummary: '模拟共享摘要',
  internalNotes: 'sentinel-internal',
  assigneeUserId: null,
  dueAt: null,
  splitReason: '',
  ...changes,
});
async function record(id: string) {
  return (await api().getRemediation(id))!.record;
}
async function change(id: string, op: RemediationOperation, a = api()) {
  await a.changeRemediation(
    id,
    (await record(id)).version,
    op,
    '模拟操作说明',
    key(),
  );
}
async function submit(id: string) {
  await change(id, { action: 'start' });
  await change(id, {
    action: 'submit',
    sharedSummary: '模拟处理结果',
    internalNotes: '内部处理',
    evidenceReference: 'mock:result',
  });
}
async function run(
  result: 'passed' | 'failed' | 'inconclusive' = 'passed',
  channelId = 'ch-2',
  type: 'quality' | 'connectivity' = 'quality',
  targetReference = 'mock:target-a',
) {
  const a = api(),
    id = await a.createTestTask(
      { channelId, testType: type, targetReference, assignedTo: null },
      key(),
    );
  let d = (await a.getTestTask(id))!;
  const e = await a.startTestTask(id, d.definition.version, key());
  d = (await a.getTestTask(id))!;
  await a.finishTestExecution(
    id,
    d.definition.version,
    e,
    {
      result,
      technicalSummary: '模拟测试摘要',
      internalNotes: '技术内部',
      evidenceReference: 'mock:test',
      failureCategory: null,
    },
    key(),
  );
  return { e, id };
}
async function adopt(e: string, id: string) {
  const d = (await api().getTestTask(id))!;
  await api().adoptTestExecution(
    e,
    { ...d.token, executionVersion: 1 },
    '人工采纳',
    key(),
  );
  return channels.read().conclusions.at(-1)!.id;
}
async function ready() {
  const id = await api().createRemediation(input(), key());
  await submit(id);
  const { e, id: task } = await run();
  await change(id, {
    action: 'link',
    executionId: e,
    applicabilityReason: '同目标复测覆盖本轮',
  });
  const con = await adopt(e, task);
  return { id, e, con, task };
}
const preview = async (id: string, e: string, con: string) =>
  api().previewRemediationClosure(
    id,
    (await record(id)).version,
    e,
    con,
    '同目标复测覆盖本轮',
  );
beforeEach(() => {
  localStorage.clear();
  memory = new Memory();
  channels = new ChannelRepository(memory);
  suppliers = new SupplierRepository(memory);
  sourcing = new SourcingRepository(memory);
  quotes = new QuoteRepository(memory);
  repo = new RemediationRepository(memory);
});
describe('独立整改聚合与授权', () => {
  it('无损保留 legacy passed 来源及所有旧字段、不生成轮次或负责人', () => {
    const s = repo.read();
    expect(s.records.find((r) => r.id === 'rem-other-supplier')).toMatchObject({
      sourceType: 'legacy',
      assigneeUserId: null,
      activeRound: null,
    });
    expect(s.submissions).toEqual([]);
    expect(s.closures).toEqual([]);
    expect(memory.values.size).toBe(0);
  });
  it('人工登记、分配、跟进、退回和多轮提交不改测试事实', async () => {
    const before = channels.read();
    const id = await api().createRemediation(input(), key());
    await change(id, { action: 'assign', assigneeUserId: 'u-test' });
    await submit(id);
    await change(id, { action: 'return' });
    await change(id, {
      action: 'submit',
      sharedSummary: '第二轮',
      internalNotes: '说明',
      evidenceReference: 'mock:round2',
    });
    expect(
      repo
        .read()
        .submissions.filter((s) => s.remediationId === id)
        .map((s) => s.round),
    ).toEqual([1, 2]);
    expect(channels.read()).toEqual(before);
  });
  it('未采纳失败可创建，同来源拆分须理由，passed 不能作为新失败来源', async () => {
    const { e } = await run('failed');
    const i = input({ sourceType: 'failed_execution', sourceExecutionId: e });
    await api().createRemediation(i, key());
    await expect(api().createRemediation(i, key())).rejects.toThrow();
    await api().createRemediation({ ...i, splitReason: '独立问题拆分' }, key());
    const passed = await run();
    await expect(
      api().createRemediation({ ...i, sourceExecutionId: passed.e }, key()),
    ).rejects.toThrow();
    expect(channels.read().conclusions).toHaveLength(0);
  });
  it.each([
    'u-sales',
    'u-account',
    'u-solution',
    'u-supplier',
    'u-proc',
    'u-support',
  ])('%s 无新增内部详情或写权限', async (user) => {
    await expect(api(user).createRemediation(input(), key())).rejects.toThrow();
    await expect(api(user).getRemediation('rem-1')).rejects.toThrow();
  });
  it('测试创建不自动成为负责人，不能设置期限或分配、退回关闭', async () => {
    const id = await api('u-test').createRemediation(input(), key());
    await expect(
      change(id, { action: 'start' }, api('u-test')),
    ).rejects.toThrow();
    for (const op of [
      { action: 'assign', assigneeUserId: 'u-test' },
      { action: 'return' },
      { action: 'exception', category: 'other' },
    ] as const)
      await expect(change(id, op, api('u-test'))).rejects.toThrow();
    await change(id, { action: 'assign', assigneeUserId: 'u-test' });
    await change(id, { action: 'start' }, api('u-test'));
    await change(
      id,
      {
        action: 'submit',
        sharedSummary: '结果',
        internalNotes: '内部',
        evidenceReference: 'mock:test',
      },
      api('u-test'),
    );
  });
  it('摘要白名单隔离自由文本、采购维护范围与业务域', async () => {
    const id = await api().createRemediation(input(), key());
    const rows = await api('u-proc').queryRemediationSummaries();
    expect(rows.some((r) => r.id === id)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('sentinel-internal');
    expect(JSON.stringify(rows)).not.toContain('模拟共享摘要');
    expect(await api('u-ops', 'overseas').getRemediation(id)).toBeNull();
  });
  it('请求幂等重试和内容冲突；旧会话重放也拒绝', async () => {
    let active = true;
    const a = api('u-ops', undefined, () => active),
      k = key(),
      i = input(),
      id = await a.createRemediation(i, k);
    expect(await a.createRemediation(i, k)).toBe(id);
    await expect(
      a.createRemediation({ ...i, internalNotes: '不同' }, k),
    ).rejects.toThrow();
    active = false;
    await expect(a.createRemediation(i, k)).rejects.toThrow();
  });
  it('存储失败无部分结果、版本冲突不覆盖', async () => {
    const id = await api().createRemediation(input(), key()),
      before = repo.read();
    memory.fail = true;
    await expect(change(id, { action: 'start' })).rejects.toThrow();
    expect(repo.read()).toEqual(before);
    memory.fail = false;
    await change(id, { action: 'start' });
    await expect(
      api().changeRemediation(id, 1, { action: 'followup' }, '旧版本', key()),
    ).rejects.toThrow();
  });
  it.each(['{"schemaVersion":99}', '{}', 'not json'])(
    '损坏或未知版本拒绝：%s',
    (raw) => {
      memory.values.set(remediationStorageKey, raw);
      expect(() => repo.read()).toThrow();
    },
  );
  it('旧提交不构造新轮次，补充字段保留旧状态', async () => {
    const legacy = repo.read().records[0]!;
    const before = legacy.status;
    await change(legacy.id, {
      action: 'update',
      category: 'quality',
      verificationScope: 'quality',
      targetReference: 'mock:target-a',
      sharedSummary: '独立共享',
      internalNotes: '内部',
    });
    expect((await record(legacy.id)).status).toBe(before);
    expect(repo.read().submissions).toHaveLength(0);
  });
  it('超期仅未关闭、等于边界不超期，null 单列', async () => {
    const date = '2026-12-01T10:00:00+08:00',
      id = await api().createRemediation(input({ dueAt: date }), key());
    expect(
      (await api().queryRemediationSummaries({}, date)).find((r) => r.id === id)
        ?.overdue,
    ).toBe(false);
    expect(
      (
        await api().queryRemediationSummaries({}, '2026-12-01T02:00:00.001Z')
      ).find((r) => r.id === id)?.overdue,
    ).toBe(true);
    await change(id, { action: 'exception', category: 'other' });
    expect(
      (await api().queryRemediationSummaries({}, '2027-01-01T00:00:00Z')).find(
        (r) => r.id === id,
      )?.overdue,
    ).toBe(false);
  });
});
describe('正常关闭强约束', () => {
  it('合法复测、显式现行采纳、关联及预览后仅关闭整改', async () => {
    const { id, e, con } = await ready(),
      before = channels.read(),
      token = await preview(id, e, con);
    await change(id, {
      action: 'normal',
      executionId: e,
      conclusionId: con,
      applicabilityReason: '同目标复测覆盖本轮',
      token,
    });
    expect((await record(id)).status).toBe('closed');
    expect(repo.read().closures.at(-1)?.closureType).toBe('normal');
    expect(channels.read()).toEqual(before);
    await expect(change(id, { action: 'followup' })).rejects.toThrow();
  });
  it('没有本轮提交、旧提交已退回均拒绝', async () => {
    const id = await api().createRemediation(input(), key());
    await expect(preview(id, 'x', 'x')).rejects.toThrow();
    await submit(id);
    await change(id, { action: 'return' });
    await expect(preview(id, 'x', 'x')).rejects.toThrow();
  });
  it('passed 未采纳拒绝', async () => {
    const id = await api().createRemediation(input(), key());
    await submit(id);
    const { e } = await run();
    await change(id, {
      action: 'link',
      executionId: e,
      applicabilityReason: '范围一致',
    });
    await expect(preview(id, e, 'unknown')).rejects.toThrow();
  });
  it('提交前开始的历史通过不能当复测', async () => {
    const { e, id: task } = await run();
    const con = await adopt(e, task),
      id = await api().createRemediation(input(), key());
    await submit(id);
    await change(id, {
      action: 'link',
      executionId: e,
      applicabilityReason: '范围一致',
    });
    await expect(preview(id, e, con)).rejects.toThrow();
  });
  it.each([
    ['ch-3', 'quality'],
    ['ch-2', 'connectivity'],
  ] as const)('跨渠道/类型关联拒绝 %s %s', async (ch, type) => {
    const id = await api().createRemediation(input(), key());
    await submit(id);
    const { e } = await run('passed', ch, type);
    await expect(
      change(id, {
        action: 'link',
        executionId: e,
        applicabilityReason: '尝试',
      }),
    ).rejects.toThrow();
  });
  it('不匹配目标拒绝；同渠道 passed 不充分', async () => {
    const id = await api().createRemediation(input(), key());
    await submit(id);
    const { e, id: task } = await run('passed', 'ch-2', 'quality', '其他目标');
    await change(id, {
      action: 'link',
      executionId: e,
      applicabilityReason: '说明',
    });
    const con = await adopt(e, task);
    await expect(preview(id, e, con)).rejects.toThrow();
  });
  it.each(['failed', 'inconclusive'] as const)(
    '更晚相关待复核 %s 拒绝，无关目标不阻断',
    async (result) => {
      const { id, e, con } = await ready();
      await run(result, 'ch-2', 'quality', '无关目标');
      await preview(id, e, con);
      await run(result);
      await expect(preview(id, e, con)).rejects.toThrow();
    },
  );
  it('现行采纳已替代拒绝', async () => {
    const { id, e, con } = await ready(),
      later = await run();
    await adopt(later.e, later.id);
    await expect(preview(id, e, con)).rejects.toThrow();
  });
  it('预览后测试变化拒绝过期确认', async () => {
    const { id, e, con } = await ready(),
      token = await preview(id, e, con);
    await run('inconclusive', 'ch-3');
    await expect(
      change(id, {
        action: 'normal',
        executionId: e,
        conclusionId: con,
        applicabilityReason: '同目标复测覆盖本轮',
        token,
      }),
    ).rejects.toThrow();
  });
  it('整改版本变化拒绝，配置变化拒绝旧依据', async () => {
    const { id, e, con } = await ready(),
      v = (await record(id)).version;
    await change(id, { action: 'followup' });
    await expect(
      api().previewRemediationClosure(id, v, e, con, '说明'),
    ).rejects.toThrow();
    const before = channels.read(),
      ch = before.channels.find((c) => c.id === 'ch-2')!;
    channels.write(
      before,
      {
        ...before,
        channels: before.channels.map((c) =>
          c.id === ch.id ? { ...c, endpointReference: 'mock:new' } : c,
        ),
      },
      suppliers,
    );
    await expect(preview(id, e, con)).rejects.toThrow();
  });
  it.each(['open', 'in_progress', 'submitted'] as const)(
    '%s 可例外结束、不需要 passed、关闭终态',
    async (status) => {
      const id = await api().createRemediation(input(), key());
      if (status === 'in_progress') await change(id, { action: 'start' });
      if (status === 'submitted') await submit(id);
      await change(id, { action: 'exception', category: 'unable_to_verify' });
      expect(repo.read().closures.at(-1)).toMatchObject({
        closureType: 'exception',
        verificationExecutionId: null,
      });
      await expect(change(id, { action: 'start' })).rejects.toThrow();
    },
  );
  it('例外缺原因或分类拒绝', async () => {
    const id = await api().createRemediation(input(), key());
    await expect(
      api().changeRemediation(
        id,
        1,
        { action: 'exception', category: 'other' },
        '',
        key(),
      ),
    ).rejects.toThrow();
  });
  it('关闭事项的历史来源、复测和结论均阻止渠道重置；整改重置保留测试', async () => {
    const { id, e, con } = await ready(),
      token = await preview(id, e, con);
    await change(id, {
      action: 'normal',
      executionId: e,
      conclusionId: con,
      applicabilityReason: '同目标复测覆盖本轮',
      token,
    });
    expect(() =>
      assertRemediationReferences(
        repo.read(),
        new ChannelRepository(new Memory()).read(),
      ),
    ).toThrow();
    const c = channels.read();
    await api().resetRemediations(true);
    expect(channels.read()).toEqual(c);
    expect(repo.read().records.some((r) => r.id === id)).toBe(false);
  });
  it('不可变集合前缀、closed 主档不能覆盖', async () => {
    const { id } = await ready();
    const s = repo.read();
    expect(() => repo.write(s, { ...s, links: [] }, channels.read())).toThrow();
    await change(id, { action: 'exception', category: 'other' });
    const closed = repo.read();
    expect(() =>
      repo.write(
        closed,
        { ...closed, records: closed.records.filter((r) => r.id !== id) },
        channels.read(),
      ),
    ).toThrow();
  });
});

describe('动态引用与原有模块兼容', () => {
  it('新增来源整改后，合法测试、报价和寻源全图写入仍成功', async () => {
    const { e } = await run('failed');
    await api().createRemediation(
      input({ sourceType: 'failed_execution', sourceExecutionId: e }),
      key(),
    );
    const s = sourcing.read();
    sourcing.write(s, s, channels, suppliers);
    const q = quotes.read();
    quotes.write(q, q, channels, suppliers, sourcing);
    await run('passed');
    expect(() => channels.validate(channels.read(), suppliers)).not.toThrow();
    expect(() => channels.reset(suppliers)).toThrow(/整改/);
  });
  it('运营新事项不进入供应商 legacy 读取', async () => {
    const id = await api().createRemediation(input(), key());
    expect(
      (await api('u-supplier').listRemediations()).some((r) => r.id === id),
    ).toBe(false);
  });
  it('单域、未确认及非运营不能重置整改', async () => {
    await expect(
      api('u-ops', 'overseas').resetRemediations(true),
    ).rejects.toThrow();
    await expect(api().resetRemediations(false)).rejects.toThrow();
    await expect(api('u-test').resetRemediations(true)).rejects.toThrow();
  });
  it('无实质分配不增版、不产生空事件', async () => {
    const id = await api().createRemediation(input(), key()),
      before = repo.read();
    await change(id, { action: 'assign', assigneeUserId: null });
    expect(repo.read()).toEqual(before);
  });
});
