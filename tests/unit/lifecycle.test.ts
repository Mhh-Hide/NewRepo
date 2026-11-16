import { beforeEach, describe, it, expect } from 'vitest';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { ChannelRepository } from '../../src/mocks/channel-repository';
import {
  SupplierRepository,
  type StoragePort,
} from '../../src/mocks/supplier-repository';
import { SourcingRepository } from '../../src/mocks/sourcing-repository';
import { QuoteRepository } from '../../src/mocks/quote-repository';
import { lifecycleStorageKey } from '../../src/mocks/lifecycle-repository';
import {
  deliveryProgress,
  workLabels,
  type LifecycleTask,
} from '../../src/domain/lifecycle';
import type { DeliveryCommand } from '../../src/services/lifecycle-types';
class Memory implements StoragePort {
  values = new Map<string, string>();
  failKey = '';
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (k === this.failKey) throw Error('quota');
    this.values.set(k, v);
  }
}
let memory: Memory,
  c: ChannelRepository,
  s: SupplierRepository,
  d: SourcingRepository,
  q: QuoteRepository;
const key = () => crypto.randomUUID();
const api = (
  user = 'u-ops',
  domain?: 'domestic' | 'overseas',
  active = () => true,
) => createMockAdapter(user, domain, s, active, c, d, q);
const record = async (id = 'ch-1') => (await api().getLifecycle(id))!.row;
async function change(input: DeliveryCommand, user = 'u-ops', id = 'ch-1') {
  await api(user).changeLifecycle(
    id,
    (await record(id)).version,
    input,
    '模拟交付操作',
    key(),
  );
}
async function acquire(id = 'ch-1') {
  await change(
    {
      action: 'acquire',
      procurementOwnerId: 'u-proc',
      testerId: 'u-test',
      operatorId: 'u-ops',
      demandId: null,
      dueAt: null,
      credentialStatus: 'received',
      credentialReference: 'mock:test-credential',
      credentialRecipientId: 'u-test',
      usageTerms: '仅模拟测试金条件',
    },
    'u-proc',
    id,
  );
}
async function run(
  phase: 'quality' | 'connectivity' = 'quality',
  result: 'passed' | 'failed' | 'inconclusive' = 'passed',
  channel = 'ch-1',
) {
  const a = api('u-test'),
    task = await a.createTestTask(
      {
        channelId: channel,
        testType: phase,
        targetReference: `mock:${phase}-delivery`,
        assignedTo: 'u-test',
      },
      key(),
    );
  let detail = (await a.getTestTask(task))!;
  const execution = await a.startTestTask(
    task,
    detail.definition.version,
    key(),
  );
  detail = (await a.getTestTask(task))!;
  await a.finishTestExecution(
    task,
    detail.definition.version,
    execution,
    {
      result,
      technicalSummary: '模拟技术摘要',
      internalNotes: '模拟内部记录',
      evidenceReference: 'mock:report',
      failureCategory: result === 'failed' ? 'timeout' : null,
    },
    key(),
  );
  return { execution, task };
}
const verify = (
  executionId: string,
  phase: 'quality' | 'connectivity' = 'quality',
  conclusion: 'passed' | 'failed' = 'passed',
  billing: 'passed' | 'failed' | 'pending' = 'passed',
): DeliveryCommand => ({
  action: 'verify',
  phase,
  executionId,
  ttftMs: 120,
  rpm: 40,
  tpm: 5000,
  concurrency: 5,
  metering: phase === 'connectivity' ? 'passed' : 'pending',
  billing,
  conclusion,
  evidenceReference: 'mock:phase-report',
});
async function quality() {
  const e = await run();
  await change(verify(e.execution), 'u-test');
  return e;
}
async function contract() {
  await change(
    {
      action: 'contract',
      stage: 'effective',
      number: 'MOCK-C-1',
      handler: '采购模拟流转',
      nextAction: '配置交接',
      nextOwnerId: 'u-proc',
      dueAt: null,
      effectiveAt: new Date().toISOString(),
      paperStatus: 'pending',
    },
    'u-proc',
  );
}
async function config() {
  await change({
    action: 'configuration',
    sent: true,
    recipientId: 'u-ops',
    received: true,
    configured: true,
    reference: 'mock:production-reference',
  });
}
async function integration() {
  const e = await run('connectivity');
  await change(verify(e.execution, 'connectivity'), 'u-test');
  return e;
}
async function full() {
  await acquire();
  await quality();
  await contract();
  await config();
  await integration();
  await change({ action: 'dispatch', state: 'open' });
}
beforeEach(() => {
  localStorage.clear();
  memory = new Memory();
  c = new ChannelRepository(memory);
  s = new SupplierRepository(memory);
  d = new SourcingRepository(memory);
  q = new QuoteRepository(memory);
});
describe('进度算法', () => {
  it('六步骨架、失败不计完成、当前异常分母展开及结束后收敛', () => {
    expect(
      deliveryProgress(
        [true, false, false, false, false, false],
        [],
        false,
        false,
        'not_open',
      ).percent,
    ).toBe(16);
    const failed = deliveryProgress(
      [true, false, false, false, false, false],
      [
        { label: '失败历史', done: false },
        { label: '整改', done: false },
        { label: '复测', done: false },
      ],
      false,
      false,
      'not_open',
    );
    expect(failed.percent).toBe(11);
    expect(failed.percent).toBeLessThan(
      deliveryProgress(
        [true, true, false, false, false, false],
        [],
        false,
        false,
        'not_open',
      ).percent,
    );
    expect(
      deliveryProgress(
        [true, true, true, true, true, true],
        [],
        false,
        false,
        'open',
      ),
    ).toMatchObject({ percent: 100, delivered: true, schedulable: true });
  });
  it.each(['paused', 'private', 'disabled'] as const)(
    '已完成后 %s 与历史交付完成分开',
    (state) => {
      expect(
        deliveryProgress(
          [true, true, true, true, true, true],
          [],
          false,
          false,
          state,
        ),
      ).toMatchObject({ percent: 100, delivered: true, schedulable: false });
    },
  );
  it('挂起/终止不能正常调度', () => {
    expect(
      deliveryProgress(
        [true, true, true, true, true, true],
        [],
        true,
        false,
        'open',
      ).schedulable,
    ).toBe(false);
    expect(
      deliveryProgress(
        [true, true, true, true, true, true],
        [],
        false,
        true,
        'open',
      ).schedulable,
    ).toBe(false);
  });
});
describe('六步真实交付与兼容', () => {
  it('旧资料保持待核验，质量豁免/旧开放不伪造两阶段、合同或配置', async () => {
    const before = c.read();
    const rows = await api().queryLifecycle();
    expect(
      rows.rows.every((r) => r.legacy && r.percent === 0 && !r.schedulable),
    ).toBe(true);
    expect(c.read()).toEqual(before);
    expect(memory.values.size).toBe(0);
  });
  it('完整交付、电子合同有效不必等纸质、各岗位工作任务正确', async () => {
    await acquire();
    expect((await record()).stage).toBe('第一阶段质量测试');
    expect(
      (await api('u-test').queryLifecycleTasks()).some(
        (t) => t.type === 'quality',
      ),
    ).toBe(true);
    await quality();
    expect(
      (await api('u-proc').queryLifecycleTasks()).some(
        (t) => t.type === 'contract',
      ),
    ).toBe(true);
    await contract();
    const tasks = c.lifecycle
      .read()
      .tasks.filter((t) => t.type === 'configuration');
    expect(tasks.map((t) => t.assigneeId)).toEqual(['u-ops']);
    expect((await record()).record?.paperStatus).toBe('pending');
    await config();
    expect(
      (await api('u-test').queryLifecycleTasks()).some(
        (t) => t.type === 'integration',
      ),
    ).toBe(true);
    await integration();
    expect(
      (await api().queryLifecycleTasks()).some((t) => t.type === 'opening'),
    ).toBe(true);
    await change({ action: 'dispatch', state: 'open' });
    expect(await record()).toMatchObject({
      percent: 100,
      delivered: true,
      schedulable: true,
    });
    expect(
      c.read().channels.find((ch) => ch.id === 'ch-1')?.availabilityStatus,
    ).toBe('open');
  });
  it('合同不能从报价/旧测试自动生效，未完成不能开放', async () => {
    await acquire();
    await expect(contract()).rejects.toThrow();
    await expect(config()).rejects.toThrow();
    await expect(
      change({ action: 'dispatch', state: 'open' }),
    ).rejects.toThrow();
  });
  it('第二阶段 API 成功不能替代计量/计费核验', async () => {
    await acquire();
    await quality();
    await contract();
    await config();
    const e = await run('connectivity');
    await expect(
      change(
        verify(e.execution, 'connectivity', 'passed', 'pending'),
        'u-test',
      ),
    ).rejects.toThrow();
    await change(
      verify(e.execution, 'connectivity', 'failed', 'failed'),
      'u-test',
    );
    expect((await record()).abnormal).toBe(true);
    await expect(
      change({ action: 'dispatch', state: 'open' }),
    ).rejects.toThrow();
  });
  it('不能把质量执行当第二阶段，配置前执行不作为配置后核验', async () => {
    await acquire();
    const e = await quality();
    await contract();
    const early = await run('connectivity');
    await config();
    await expect(
      change(verify(e.execution, 'connectivity'), 'u-test'),
    ).rejects.toThrow();
    await expect(
      change(verify(early.execution, 'connectivity'), 'u-test'),
    ).rejects.toThrow();
  });
  it('实测指标不覆盖采购承诺，最终通过不补造 Stage07A 采纳', async () => {
    const before = c.read().channels.find((ch) => ch.id === 'ch-1')!;
    await acquire();
    await quality();
    expect(c.read().channels.find((ch) => ch.id === 'ch-1')?.ttftMs).toBe(
      before.ttftMs,
    );
    expect((await record()).measured?.ttftMs).toBe(120);
    expect(c.read().conclusions).toHaveLength(0);
  });
  it('第一阶段失败同时形成测试沟通、运营监督与采购补充并行任务', async () => {
    await acquire();
    await run('quality', 'failed');
    const tasks = c.lifecycle.read().tasks;
    expect(
      tasks.some(
        (t) => t.type === 'supplier_feedback' && t.assigneeId === 'u-test',
      ),
    ).toBe(true);
    expect(
      tasks.some((t) => t.type === 'supervise' && t.assigneeId === 'u-ops'),
    ).toBe(true);
    expect(
      tasks.some((t) => t.type === 'replacement' && t.assigneeId === 'u-proc'),
    ).toBe(true);
    expect((await record()).extra.some((v) => v.label.includes('复测'))).toBe(
      true,
    );
  });
  it('连续失败、刷新查询、重复同步不丢记录、不无限膨胀分母', async () => {
    await acquire();
    await run('quality', 'failed');
    await api().retryLifecycleSignals('ch-1');
    const count = c.lifecycle.read().tasks.length;
    await api().queryLifecycle();
    await api().queryLifecycle();
    expect(c.lifecycle.read().tasks).toHaveLength(count);
    await run('quality', 'failed');
    expect(
      c
        .read()
        .executions.filter(
          (e) => e.result === 'failed' && e.origin === 'recorded',
        ),
    ).toHaveLength(2);
    await quality();
    expect((await record()).extra).toHaveLength(0);
  });
  it('第二阶段失败通知采购/运营且不公开调度，之后新执行复测恢复', async () => {
    await acquire();
    await quality();
    await contract();
    await config();
    const fail = await run('connectivity', 'failed');
    await change(verify(fail.execution, 'connectivity', 'failed'), 'u-test');
    expect(
      (await api('u-proc').queryLifecycleTasks()).some(
        (t) => t.type === 'replacement',
      ),
    ).toBe(false);
    expect(
      (await api('u-proc').queryLifecycleTasks('notifications')).some(
        (t) => t.type === 'integration_failed_notice',
      ),
    ).toBe(true);
    expect((await record()).schedulable).toBe(false);
    await integration();
    await change({ action: 'dispatch', state: 'open' });
    expect((await record()).schedulable).toBe(true);
  });
  it('挂起恢复、终止、开放后暂停保留合同/核验/配置历史', async () => {
    await full();
    const before = c.lifecycle.read();
    await change({ action: 'dispatch', state: 'paused' });
    expect(await record()).toMatchObject({
      delivered: true,
      schedulable: false,
    });
    expect(c.lifecycle.read().verifications).toEqual(before.verifications);
    expect((await record()).record?.configuredAt).toBeTruthy();
    await change({ action: 'hold' });
    await expect(
      change({ action: 'dispatch', state: 'open' }),
    ).rejects.toThrow();
    await change({ action: 'resume' });
    await change({ action: 'dispatch', state: 'open' });
    await change({ action: 'terminate' });
    await expect(change({ action: 'resume' })).rejects.toThrow();
  });
  it('任何未关闭整改阻止开放；反馈引用原07B事项，不新造整改历史', async () => {
    await acquire();
    const e = await run('quality', 'failed');
    const id = await api('u-test').createRemediation(
      {
        channelId: 'ch-1',
        sourceType: 'failed_execution',
        sourceExecutionId: e.execution,
        category: 'quality',
        verificationScope: 'quality',
        targetReference: 'mock:quality-delivery',
        sharedSummary: '共享技术问题',
        internalNotes: '内部模拟',
        assigneeUserId: null,
        dueAt: null,
        splitReason: '',
      },
      key(),
    );
    const before = c.remediations.read();
    await change(
      {
        action: 'feedback',
        executionId: e.execution,
        remediationId: id,
        recipientId: 'u-ops',
        feedbackAt: new Date().toISOString(),
        summary: '已模拟反馈供应商，等待整改',
      },
      'u-test',
    );
    expect(c.remediations.read()).toEqual(before);
    await quality();
    await contract();
    await config();
    await integration();
    await expect(
      change({ action: 'dispatch', state: 'open' }),
    ).rejects.toThrow();
  });
});
describe('权限、引用、幂等与安全', () => {
  it.each(['u-sales', 'u-account', 'u-solution', 'u-supplier'])(
    '%s 无新看板及任何真实供应商/成本投影',
    async (user) => {
      await expect(api(user).queryLifecycle()).rejects.toThrow();
      expect((await api(user).listChannels()).length).toBeGreaterThan(0);
    },
  );
  it('采购不能核验测试；测试不能修改合同/配置；运维只读', async () => {
    await acquire();
    await expect(change(verify('x'), 'u-proc')).rejects.toThrow();
    await expect(
      api('u-test').changeLifecycle(
        'ch-1',
        1,
        {
          action: 'contract',
          stage: 'effective',
          number: 'mock',
          handler: '采购',
          nextAction: '配置',
          nextOwnerId: 'u-proc',
          dueAt: null,
          effectiveAt: new Date().toISOString(),
          paperStatus: 'pending',
        },
        '尝试',
        key(),
      ),
    ).rejects.toThrow();
    await expect(
      api('u-support').changeLifecycle(
        'ch-1',
        1,
        {
          action: 'configuration',
          sent: true,
          recipientId: 'u-ops',
          received: true,
          configured: true,
          reference: 'mock:key',
        },
        '尝试',
        key(),
      ),
    ).rejects.toThrow();
  });
  it('单域不能跨域，采购无维护范围不能越权', async () => {
    expect(
      (await api('u-domestic', 'domestic').queryLifecycle()).rows.every(
        (r) => r.id !== 'ch-5',
      ),
    ).toBe(true);
    await expect(
      api('u-domestic', 'domestic').changeLifecycle(
        'ch-5',
        0,
        { action: 'hold' },
        '尝试',
        key(),
      ),
    ).rejects.toThrow();
  });
  it('身份撤销后旧 API 写入拒绝，幂等重放先检查权限', async () => {
    let active = true;
    const a = api('u-proc', undefined, () => active),
      input: DeliveryCommand = {
        action: 'acquire',
        procurementOwnerId: 'u-proc',
        testerId: 'u-test',
        operatorId: 'u-ops',
        demandId: null,
        dueAt: null,
        credentialStatus: 'received',
        credentialReference: 'mock:credential',
        credentialRecipientId: 'u-test',
        usageTerms: '模拟用量',
      },
      k = key();
    await a.changeLifecycle('ch-1', 0, input, '说明', k);
    await a.changeLifecycle('ch-1', 0, input, '说明', k);
    active = false;
    await expect(
      a.changeLifecycle('ch-1', 0, input, '说明', k),
    ).rejects.toThrow();
  });
  it('版本冲突、持久化失败、读取未知版本拒绝且不静默重置', async () => {
    await acquire();
    const before = c.lifecycle.read();
    memory.failKey = lifecycleStorageKey;
    await expect(change({ action: 'hold' })).rejects.toThrow();
    expect(c.lifecycle.read()).toEqual(before);
    memory.failKey = '';
    await change({ action: 'hold' });
    await expect(
      api().changeLifecycle('ch-1', 1, { action: 'resume' }, '旧版本', key()),
    ).rejects.toThrow();
    memory.values.set(lifecycleStorageKey, '{"schemaVersion":99}');
    expect(() => c.lifecycle.read()).toThrow();
  });
  it('核验和通知引用阻止测试重置；不可变历史不能截短', async () => {
    await acquire();
    await quality();
    expect(() => c.reset(s)).toThrow(/交付/);
    const before = c.lifecycle.read();
    expect(() =>
      c.lifecycle.write(before, { ...before, verifications: [] }),
    ).toThrow();
  });
  it('拒绝真实凭据或未授权 @；通知不复制敏感评论正文', async () => {
    await acquire();
    await expect(
      change({
        action: 'configuration',
        sent: true,
        recipientId: 'u-ops',
        received: true,
        configured: true,
        reference: 'sk-real-secret',
      }),
    ).rejects.toThrow();
    await expect(
      change({
        action: 'comment',
        body: '模拟内部',
        recipientIds: ['u-sales'],
      }),
    ).rejects.toThrow();
    await change({
      action: 'comment',
      body: '内部模拟技术说明',
      recipientIds: ['u-test'],
    });
    const tasks = await api('u-test').queryLifecycleTasks('mentions');
    expect(tasks).toHaveLength(1);
    expect(JSON.stringify(tasks)).not.toContain('内部模拟技术说明');
  });
  it('任务负责人、已读、完成/取消/重开及版本审计', async () => {
    await acquire();
    const task = (await api('u-test').queryLifecycleTasks())[0]!;
    await expect(
      api('u-proc').changeLifecycleTask(
        task.id,
        'read',
        '说明',
        key(),
        c.lifecycle.read().tasks.find((t) => t.id === task.id)!.version,
      ),
    ).rejects.toThrow();
    await expect(
      api('u-test').changeLifecycleTask(
        task.id,
        'complete',
        '不能绕过测试',
        key(),
        c.lifecycle.read().tasks.find((t) => t.id === task.id)!.version,
      ),
    ).rejects.toThrow();
    await api('u-test').changeLifecycleTask(
      task.id,
      'read',
      '已阅',
      key(),
      c.lifecycle.read().tasks.find((t) => t.id === task.id)!.version,
    );
    await api('u-test').changeLifecycleTask(
      task.id,
      'cancel',
      '人工取消提醒',
      key(),
      c.lifecycle.read().tasks.find((t) => t.id === task.id)!.version,
    );
    await api('u-test').changeLifecycleTask(
      task.id,
      'reopen',
      '继续处理',
      key(),
      c.lifecycle.read().tasks.find((t) => t.id === task.id)!.version,
    );
    await quality();
    expect(
      (await api('u-test').queryLifecycleTasks('completed')).some(
        (t) => t.id === task.id,
      ),
    ).toBe(true);
  });
  it('采购合同与客户签约不混淆，目标渠道数与供应商数分别统计', async () => {
    const goal = await api().resourceGoal('d-1');
    expect(goal.targetChannels).toBe(1);
    await api().recordCustomerContract(
      'd-1',
      0,
      new Date().toISOString(),
      key(),
    );
    expect(await api().resourceGoal('d-1')).toMatchObject({
      targetChannels: 3,
      customerSigned: true,
    });
    expect(
      (await api('u-proc').queryLifecycleTasks()).some(
        (t) => t.type === 'backup',
      ),
    ).toBe(true);
  });
});

describe('补强边界', () => {
  it('已开放后新失败自动暂停 Mock Availability，保留交付历史', async () => {
    await full();
    const before = c.lifecycle.read();
    await run('quality', 'failed');
    expect(
      c.read().channels.find((x) => x.id === 'ch-1')?.availabilityStatus,
    ).toBe('suspended');
    expect(await record()).toMatchObject({
      delivered: true,
      schedulable: false,
    });
    expect(c.lifecycle.read().records[0]?.openedAt).toBe(
      before.records[0]?.openedAt,
    );
  });
  it('失败不计完成，重复失败不无限扩展当前进度条', async () => {
    await acquire();
    await run('quality', 'failed');
    const first = await record();
    expect(first.percent).toBeLessThan(16);
    await run('quality', 'failed');
    expect((await record()).extra.length).toBe(first.extra.length);
  });
  it('同一失败登记阶段核验不重复生成三方通知', async () => {
    await acquire();
    const e = await run('quality', 'failed'),
      n = c.lifecycle.read().tasks.length;
    await change(verify(e.execution, 'quality', 'failed'), 'u-test');
    expect(c.lifecycle.read().tasks.length).toBe(n);
  });
  it('计费核验失败不能重用同一 passed 执行改成通过', async () => {
    await acquire();
    await quality();
    await contract();
    await config();
    const e = await run('connectivity');
    await change(
      verify(e.execution, 'connectivity', 'failed', 'failed'),
      'u-test',
    );
    await expect(
      change(verify(e.execution, 'connectivity'), 'u-test'),
    ).rejects.toThrow(/新执行|复测/);
    await integration();
    expect((await record()).integrationVerificationId).toBeTruthy();
  });
  it('原整改本轮提交激活复测任务，重复提交幂等；交付引用阻止重置整改', async () => {
    await acquire();
    const e = await run('quality', 'failed');
    const a = api(),
      id = await a.createRemediation(
        {
          channelId: 'ch-1',
          sourceType: 'failed_execution',
          sourceExecutionId: e.execution,
          category: 'quality',
          verificationScope: 'quality',
          targetReference: 'mock:quality-delivery',
          sharedSummary: '模拟问题',
          internalNotes: '模拟内部',
          assigneeUserId: 'u-test',
          dueAt: null,
          splitReason: '',
        },
        key(),
      );
    await a.changeRemediation(id, 1, { action: 'start' }, '开始', key());
    const k = key(),
      input = {
        action: 'submit' as const,
        sharedSummary: '供应商模拟反馈完成',
        internalNotes: '待复测',
        evidenceReference: 'mock:fixed',
      };
    await api('u-test').changeRemediation(id, 2, input, '本轮结果', k);
    await api('u-test').changeRemediation(id, 2, input, '本轮结果', k);
    expect(
      (await api('u-test').queryLifecycleTasks()).filter((t) =>
        t.title.includes('等待新执行复测'),
      ),
    ).toHaveLength(1);
    await expect(a.resetRemediations(true)).rejects.toThrow(/生命周期/);
  });
  it('无关未知字段不能把真实凭据通过请求指纹写进存储', async () => {
    await acquire();
    const a = api();
    await expect(
      a.changeLifecycle(
        'ch-1',
        1,
        {
          action: 'hold',
          productionKey: 'sk-plaintext-secret',
        } as DeliveryCommand,
        '说明',
        key(),
      ),
    ).rejects.toThrow();
    expect(JSON.stringify([...memory.values.values()])).not.toContain(
      'sk-plaintext-secret',
    );
  });
  it('任务版本冲突拒绝，已完成业务不能只重开提醒伪造状态', async () => {
    await acquire();
    const a = api('u-test'),
      t = (await a.queryLifecycleTasks())[0]!;
    await a.changeLifecycleTask(t.id, 'read', '读', key(), t.version);
    await expect(
      a.changeLifecycleTask(t.id, 'cancel', '旧版本', key(), t.version),
    ).rejects.toThrow();
    await quality();
    const after = c.lifecycle.read().tasks.find((v) => v.id === t.id)!;
    await expect(
      a.changeLifecycleTask(t.id, 'reopen', '已完成', key(), after.version),
    ).rejects.toThrow();
  });
  it('重复合同确认与配置不重复通知，不回写新配置时间', async () => {
    await acquire();
    await quality();
    await contract();
    const count = c.lifecycle
      .read()
      .tasks.filter((t) => t.type === 'configuration').length;
    await contract();
    expect(
      c.lifecycle.read().tasks.filter((t) => t.type === 'configuration').length,
    ).toBe(count);
    await config();
    const configured = (await record()).record!.configuredAt;
    await config();
    expect((await record()).record!.configuredAt).toBe(configured);
    expect(
      c.lifecycle.read().tasks.filter((t) => t.type === 'integration'),
    ).toHaveLength(1);
  });
  it('原测试已保存但通知配额失败时保留事实，恢复后显式重试只发一次', async () => {
    await acquire();
    memory.failKey = lifecycleStorageKey;
    await expect(run('quality', 'failed')).rejects.toThrow(/原业务事实保留/);
    expect(
      c
        .read()
        .executions.some(
          (e) =>
            e.origin === 'recorded' &&
            e.result === 'failed' &&
            e.termination === 'finished',
        ),
    ).toBe(true);
    memory.failKey = '';
    await api('u-test').retryLifecycleSignals('ch-1');
    await api('u-test').retryLifecycleSignals('ch-1');
    expect(
      c.lifecycle.read().tasks.filter((t) => t.type === 'replacement'),
    ).toHaveLength(1);
    await expect(
      api('u-support').retryLifecycleSignals('ch-1'),
    ).rejects.toThrow();
  });
  it('同需求多个失败渠道聚合补资源任务并保留各渠道测试反馈', async () => {
    for (const id of ['ch-1', 'ch-2']) {
      await change(
        {
          action: 'acquire',
          procurementOwnerId: 'u-proc',
          testerId: 'u-test',
          operatorId: 'u-ops',
          demandId: 'd-1',
          dueAt: null,
          credentialStatus: 'received',
          credentialReference: 'mock:test',
          credentialRecipientId: 'u-test',
          usageTerms: '模拟条件',
        },
        'u-proc',
        id,
      );
      await run('quality', 'failed', id);
    }
    const tasks = c.lifecycle.read().tasks;
    expect(tasks.filter((t) => t.type === 'replacement')).toHaveLength(1);
    expect(
      tasks.find((t) => t.type === 'replacement')!.relatedChannelIds,
    ).toEqual(['ch-1', 'ch-2']);
    expect(tasks.filter((t) => t.type === 'supplier_feedback')).toHaveLength(2);
  });
  it('撤回配置完成会失效第二阶段并暂停调度，旧配置历史不删除', async () => {
    await full();
    const count = c.lifecycle.read().verifications.length;
    await change({
      action: 'configuration',
      sent: true,
      recipientId: 'u-ops',
      received: true,
      configured: false,
      reference: 'mock:pending-reference',
    });
    const row = await record();
    expect(row.record!.configuredAt).toBeNull();
    expect(row.integrationVerificationId).toBeNull();
    expect(row.schedulable).toBe(false);
    expect(
      c.read().channels.find((ch) => ch.id === 'ch-1')!.availabilityStatus,
    ).toBe('suspended');
    expect(c.lifecycle.read().verifications).toHaveLength(count);
    await expect(
      change({ action: 'dispatch', state: 'open' }),
    ).rejects.toThrow();
  });
});

describe('Stage 07D 验收补丁：阶段通知与有序进度', () => {
  async function configured() {
    await acquire();
    await quality();
    await contract();
    await config();
  }
  function legacyTask(
    type: 'supervise' | 'replacement',
    sourceId: string,
    assigneeId: string,
    overrides: Partial<LifecycleTask> = {},
  ) {
    const state = c.lifecycle.read();
    const task: LifecycleTask = {
      ...state.tasks[0]!,
      id: `lifecycle:${sourceId}:${type}:${assigneeId}`,
      type,
      title: workLabels[type],
      sourceId,
      assigneeId,
      relatedChannelIds: ['ch-1'],
      channelId: 'ch-1',
      objectId: 'ch-1',
      objectType: 'channel',
      demandId: null,
      version: 1,
      status: 'open',
      readAt: null,
      completedAt: null,
      completionActorId: null,
      completionReason: null,
      archived: false,
      createdAt: new Date().toISOString(),
      ...overrides,
    };
    // Reproduce a previously persisted v1 snapshot, including its original deterministic source.
    state.tasks = state.tasks.filter(
      (t) =>
        t.type !== 'quality_passed_notice' &&
        t.type !== 'integration_failed_notice',
    );
    state.tasks.push(task);
    memory.setItem(lifecycleStorageKey, JSON.stringify(state));
    return task;
  }
  it('第一阶段人工通过：采购合同待办、运营只读通知，无无依据整改监督', async () => {
    await acquire();
    const e = await run();
    expect(
      await api('u-ops').queryLifecycleTasks('notifications'),
    ).toHaveLength(0);
    await change(verify(e.execution), 'u-test');
    expect(
      (await api('u-proc').queryLifecycleTasks()).map((t) => t.type),
    ).toEqual(['contract']);
    expect(await api().queryLifecycleTasks()).toHaveLength(0);
    const notices = await api().queryLifecycleTasks('notifications');
    expect(notices.map((t) => t.type)).toEqual(['quality_passed_notice']);
    expect(notices[0]!.channelId).toBe('ch-1');
    expect(await api('u-test').queryLifecycleTasks()).toHaveLength(0);
    expect(c.lifecycle.read().tasks.some((t) => t.type === 'supervise')).toBe(
      false,
    );
  });
  it('正常通过通知仅可已读，不能完成、取消或重开，也不进入等待/逾期', async () => {
    await acquire();
    await quality();
    const a = api(),
      n = (await a.queryLifecycleTasks('notifications'))[0]!;
    await a.changeLifecycleTask(n.id, 'read', '知悉', key(), n.version);
    const read = (await a.queryLifecycleTasks('notifications'))[0]!;
    expect(read.readAt).toBeTruthy();
    for (const action of ['complete', 'cancel', 'reopen'] as const)
      await expect(
        a.changeLifecycleTask(n.id, action, '尝试', key(), read.version),
      ).rejects.toThrow(/仅需知悉/);
    expect(await a.queryLifecycleTasks('overdue')).toHaveLength(0);
    expect(
      (await api('u-test').queryLifecycleTasks('waiting')).some(
        (t) => t.id === n.id,
      ),
    ).toBe(false);
  });
  it('第一阶段通过幂等重放和原执行重复同步只生成一条通知', async () => {
    await acquire();
    const e = await run(),
      version = (await record()).version,
      a = api('u-test'),
      request = key(),
      input = verify(e.execution);
    await a.changeLifecycle('ch-1', version, input, '通过', request);
    await a.changeLifecycle('ch-1', version, input, '通过', request);
    await a.retryLifecycleSignals('ch-1');
    expect(await api().queryLifecycleTasks('notifications')).toHaveLength(1);
  });
  it.each(['quality', 'connectivity'] as const)(
    '%s 原失败执行再登记人工失败、重复同步：统一矩阵且不重复',
    async (phase) => {
      if (phase === 'quality') await acquire();
      else await configured();
      const e = await run(phase, 'failed');
      const before = c.lifecycle.read().tasks.length;
      await change(verify(e.execution, phase, 'failed'), 'u-test');
      await api().retryLifecycleSignals('ch-1');
      expect(c.lifecycle.read().tasks.length).toBe(before);
      expect(
        (await api('u-test').queryLifecycleTasks()).some(
          (t) => t.type === 'supplier_feedback',
        ),
      ).toBe(true);
      expect(
        (await api().queryLifecycleTasks()).some((t) => t.type === 'supervise'),
      ).toBe(true);
      expect(
        (await api('u-proc').queryLifecycleTasks()).some(
          (t) => t.type === 'replacement',
        ),
      ).toBe(phase === 'quality');
      expect(
        (await api('u-proc').queryLifecycleTasks('notifications')).some(
          (t) => t.type === 'integration_failed_notice',
        ),
      ).toBe(phase === 'connectivity');
    },
  );
  it('第二阶段实际连通通过但计费人工核验失败：通知采购而不补资源', async () => {
    await configured();
    const e = await run('connectivity');
    await change(
      verify(e.execution, 'connectivity', 'failed', 'failed'),
      'u-test',
    );
    expect(await api('u-proc').queryLifecycleTasks()).toHaveLength(0);
    expect(
      (await api('u-proc').queryLifecycleTasks('notifications')).map(
        (t) => t.type,
      ),
    ).toEqual(['integration_failed_notice']);
    expect(
      (await api().queryLifecycleTasks()).some((t) => t.type === 'supervise'),
    ).toBe(true);
    expect((await record()).schedulable).toBe(false);
  });
  it('旧正常通过误发 supervise：读取只投影，授权同步后追溯取消且历史不删除', async () => {
    await acquire();
    await quality();
    const v = c.lifecycle.read().verifications[0]!;
    const task = legacyTask('supervise', v.id, 'u-ops');
    const raw = memory.getItem(lifecycleStorageKey),
      history = c.lifecycle.read().events;
    expect(await api().queryLifecycleTasks()).toHaveLength(0);
    expect(
      (await api().queryLifecycleTasks('notifications')).map((t) => t.type),
    ).toEqual(['quality_passed_notice']);
    expect(memory.getItem(lifecycleStorageKey)).toBe(raw);
    await api().retryLifecycleSignals('ch-1');
    const saved = c.lifecycle.read();
    expect(saved.tasks.find((t) => t.id === task.id)).toMatchObject({
      type: 'supervise',
      sourceId: v.id,
      status: 'cancelled',
      version: 2,
    });
    expect(saved.events.slice(0, history.length)).toEqual(history);
    expect(
      saved.events.filter((e) => e.sourceId === `compat-07d:${task.id}`),
    ).toHaveLength(1);
    await api().retryLifecycleSignals('ch-1');
    expect(
      c.lifecycle
        .read()
        .events.filter((e) => e.sourceId === `compat-07d:${task.id}`),
    ).toHaveLength(1);
    await expect(
      api().changeLifecycleTask(task.id, 'reopen', '重开', key(), 2),
    ).rejects.toThrow();
  });
  it('旧误发通过任务可直接从投影通知标记已读，兼容取消与已读一并保存', async () => {
    await acquire();
    await quality();
    const v = c.lifecycle.read().verifications[0]!;
    const old = legacyTask('supervise', v.id, 'u-ops');
    const notice = (await api().queryLifecycleTasks('notifications'))[0]!;
    await api().changeLifecycleTask(
      notice.id,
      'read',
      '知悉旧通过',
      key(),
      notice.version,
    );
    expect(c.lifecycle.read().tasks.find((t) => t.id === old.id)!.status).toBe(
      'cancelled',
    );
    expect(
      (await api().queryLifecycleTasks('notifications'))[0]!.readAt,
    ).toBeTruthy();
  });
  it.each(['execution', 'verification', 'group'] as const)(
    '旧第二阶段 %s 来源误发采购任务可以安全取消并补抄送',
    async (source) => {
      await configured();
      const e = await run(
        'connectivity',
        source === 'execution' ? 'failed' : 'passed',
      );
      if (source !== 'execution')
        await change(
          verify(e.execution, 'connectivity', 'failed', 'failed'),
          'u-test',
        );
      const v = c.lifecycle.read().verifications.at(-1)!;
      const sourceId =
        source === 'execution'
          ? `execution:${e.execution}`
          : source === 'verification'
            ? v.id
            : 'replacement:d-1';
      if (source === 'group') {
        const before = c.lifecycle.read(),
          next = structuredClone(before);
        next.records[0]!.demandId = 'd-1';
        next.records[0]!.version++;
        c.lifecycle.write(before, next);
      }
      const task = legacyTask('replacement', sourceId, 'u-proc', {
        demandId: source === 'group' ? 'd-1' : null,
      });
      await api().retryLifecycleSignals('ch-1');
      expect(
        c.lifecycle.read().tasks.find((t) => t.id === task.id)!.status,
      ).toBe('cancelled');
      expect(
        await api('u-proc').queryLifecycleTasks('notifications'),
      ).toHaveLength(1);
    },
  );
  it('合法失败监督、质量替代和人工任务均保留', async () => {
    await acquire();
    const e = await run('quality', 'failed');
    await quality();
    const state = c.lifecycle.read();
    const manual = legacyTask(
      'replacement',
      'manual:explicit-procurement',
      'u-proc',
    );
    await api().retryLifecycleSignals('ch-1');
    for (const t of state.tasks.filter((t) =>
      ['supervise', 'replacement'].includes(t.type),
    ))
      expect(c.lifecycle.read().tasks.find((n) => n.id === t.id)).toEqual(t);
    expect(
      c.lifecycle.read().tasks.find((t) => t.id === manual.id)!.status,
    ).toBe('open');
    expect(c.read().executions.some((x) => x.id === e.execution)).toBe(true);
  });
  it.each(['read', 'completed'] as const)(
    '旧错误但已%s任务不取消、不删除或重写处理记录',
    async (status) => {
      await acquire();
      await quality();
      const v = c.lifecycle.read().verifications[0]!;
      const task = legacyTask(
        'supervise',
        v.id,
        'u-ops',
        status === 'read'
          ? { readAt: new Date().toISOString() }
          : {
              status: 'completed',
              completedAt: new Date().toISOString(),
              completionActorId: 'u-ops',
              completionReason: '历史已处理',
            },
      );
      await api().retryLifecycleSignals('ch-1');
      expect(c.lifecycle.read().tasks.find((t) => t.id === task.id)).toEqual(
        task,
      );
    },
  );
  it.each(['quality', 'connectivity'] as const)(
    '%s 失败节点紧跟对应主阶段；百分比与唯一有序节点集合一致',
    async (phase) => {
      if (phase === 'quality') await acquire();
      else await configured();
      await run(phase, 'failed');
      const row = await record(),
        ordered = row.orderedSteps,
        at = ordered.findIndex(
          (s) => s.kind === 'milestone' && s.phase === phase,
        );
      expect(ordered.slice(at + 1, at + 4).map((s) => s.kind)).toEqual([
        'failure',
        'feedback',
        'retest',
      ]);
      expect(ordered[at + 1]!.state).toBe('failed');
      expect(ordered[at + 2]!.state).toBe('waiting_feedback');
      expect(ordered[at + 4]!.phase).toBe(
        phase === 'quality' ? 'contract' : 'opening',
      );
      expect(ordered.filter((s) => s.kind === 'milestone')).toHaveLength(6);
      expect(new Set(ordered.map((s) => s.id)).size).toBe(ordered.length);
      expect(row.percent).toBe(
        Math.floor(
          (ordered.filter((s) => s.done).length / ordered.length) * 100,
        ),
      );
      expect(row.percent).toBeLessThan(100);
      expect(
        (await api().queryLifecycle()).rows.find((r) => r.id === 'ch-1')!
          .orderedSteps,
      ).toEqual(ordered);
      expect(
        (await api('u-proc').getLifecycle('ch-1'))!.row.orderedSteps.every(
          (s) => s.executionId === null,
        ),
      ).toBe(true);
    },
  );
  it('第二阶段计费核验失败也插在接入节点之后，异常不是尾部无归属项', async () => {
    await configured();
    const e = await run('connectivity');
    await change(
      verify(e.execution, 'connectivity', 'failed', 'failed'),
      'u-test',
    );
    const row = await record(),
      at = row.orderedSteps.findIndex(
        (s) => s.phase === 'connectivity' && s.kind === 'milestone',
      );
    expect(row.orderedSteps[at + 1]!.phase).toBe('connectivity');
    expect(row.orderedSteps.at(-1)!.phase).toBe('opening');
  });
  it('复测再次失败只显示当前轮次；历史执行和步骤身份保持完整稳定', async () => {
    await acquire();
    const first = await run('quality', 'failed');
    const before = await record();
    const second = await run('quality', 'failed');
    const after = await record();
    expect(after.orderedSteps.length).toBe(before.orderedSteps.length);
    expect(after.extra.every((s) => s.executionId === second.execution)).toBe(
      true,
    );
    expect(c.read().executions.some((e) => e.id === first.execution)).toBe(
      true,
    );
    expect((await record()).orderedSteps).toEqual(after.orderedSteps);
  });
  it('兼容修复不能借其他授权渠道触发跨域任务写入', async () => {
    await acquire();
    await acquire('ch-5');
    const e = await run('quality', 'passed', 'ch-5');
    await change(verify(e.execution), 'u-test', 'ch-5');
    const v = c.lifecycle.read().verifications.at(-1)!;
    const task = legacyTask('supervise', v.id, 'u-ops', {
      channelId: 'ch-5',
      objectId: 'ch-5',
      relatedChannelIds: ['ch-5'],
    });
    await api('u-domestic', 'domestic').retryLifecycleSignals('ch-1');
    expect(c.lifecycle.read().tasks.find((t) => t.id === task.id)).toEqual(
      task,
    );
    await api().retryLifecycleSignals('ch-5');
    expect(c.lifecycle.read().tasks.find((t) => t.id === task.id)!.status).toBe(
      'cancelled',
    );
  });
  it('历史按需求聚合任务只要包含合法质量失败就不误取消', async () => {
    await configured();
    const e = await run('connectivity');
    await change(
      verify(e.execution, 'connectivity', 'failed', 'failed'),
      'u-test',
    );
    await run('quality', 'failed');
    const before = c.lifecycle.read(),
      next = structuredClone(before);
    next.records[0]!.demandId = 'd-1';
    next.records[0]!.version++;
    c.lifecycle.write(before, next);
    const task = legacyTask('replacement', 'replacement:d-1', 'u-proc', {
      demandId: 'd-1',
    });
    await api().retryLifecycleSignals('ch-1');
    expect(c.lifecycle.read().tasks.find((t) => t.id === task.id)).toEqual(
      task,
    );
  });
  it('原整改第二轮只显示现行轮次，第一轮提交与退回历史完整', async () => {
    await acquire();
    const e = await run('quality', 'failed');
    const a = api();
    const id = await a.createRemediation(
      {
        channelId: 'ch-1',
        sourceType: 'failed_execution',
        sourceExecutionId: e.execution,
        category: 'quality',
        verificationScope: 'quality',
        targetReference: 'mock:quality-delivery',
        sharedSummary: '模拟问题',
        internalNotes: '模拟内部',
        assigneeUserId: 'u-test',
        dueAt: null,
        splitReason: '',
      },
      key(),
    );
    await a.changeRemediation(id, 1, { action: 'start' }, '开始', key());
    await api('u-test').changeRemediation(
      id,
      2,
      {
        action: 'submit',
        sharedSummary: '第一轮反馈',
        internalNotes: '待复测',
        evidenceReference: 'mock:round-one',
      },
      '本轮提交',
      key(),
    );
    const one = await record();
    expect(
      one.extra.find((s) => s.remediationId === id && s.kind === 'remediation'),
    ).toMatchObject({ round: 1, state: 'waiting_retest', done: true });
    await a.changeRemediation(id, 3, { action: 'return' }, '复核退回', key());
    const two = await record();
    expect(
      two.extra.find((s) => s.remediationId === id && s.kind === 'remediation'),
    ).toMatchObject({ round: 2, state: 'remediating', done: false });
    expect(two.extra.length).toBe(one.extra.length);
    expect(two.percent).toBeLessThan(one.percent);
    expect(
      c.remediations.read().submissions.filter((v) => v.remediationId === id),
    ).toHaveLength(1);
    expect(
      c.remediations
        .read()
        .events.some((v) => v.remediationId === id && v.action === 'return'),
    ).toBe(true);
    expect(
      two.orderedSteps.findIndex((s) => s.kind === 'remediation'),
    ).toBeLessThan(two.orderedSteps.findIndex((s) => s.phase === 'contract'));
  });
  it('挂起仅改变当前工作呈现，不把历史失败或已完成反馈改成灰色未开始', () => {
    const p = deliveryProgress(
      [true, false, false, false, false, false],
      [
        {
          label: '失败',
          phase: 'quality',
          kind: 'failure',
          state: 'failed',
          done: false,
        },
        {
          label: '反馈完成',
          phase: 'quality',
          kind: 'feedback',
          state: 'completed',
          done: true,
        },
        {
          label: '等待复测',
          phase: 'quality',
          kind: 'retest',
          state: 'waiting_retest',
          done: false,
        },
      ],
      true,
      false,
      'paused',
    );
    expect(p.extra.map((s) => s.state)).toEqual([
      'failed',
      'completed',
      'held',
    ]);
    expect(p.percent).toBe(Math.floor((2 / 9) * 100));
    expect(p.schedulable).toBe(false);
  });
});
