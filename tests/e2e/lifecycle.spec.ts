import { test, expect, type Page } from '@playwright/test';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const e: string[] = [];
  errors.set(page, e);
  page.on('pageerror', (v) => e.push(v.message));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));
async function persona(page: Page, name: string) {
  const c = page.getByRole('combobox', { name: '演示身份', exact: true });
  await c.fill(name);
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: name })
    .click();
}
async function select(page: Page, name: string, label: string) {
  const c = page.getByRole('combobox', { name, exact: true });
  await c.click();
  const id = await c.getAttribute('aria-controls');
  await page
    .locator('.ant-select-dropdown')
    .filter({ has: page.locator(`[id="${id}"]`) })
    .locator('.ant-select-item-option')
    .filter({ hasText: label })
    .hover();
  await c.press('Enter');
}
async function save(page: Page) {
  const modal = page.getByRole('dialog').last();
  await modal
    .getByRole('textbox', { name: '本次交付操作说明', exact: true })
    .fill('模拟业务事实人工确认');
  await modal.getByRole('button', { name: /保存交付事实$/ }).click();
  await expect(
    page.getByRole('dialog').filter({
      has: page.getByRole('button', { name: /保存交付事实$/ }),
    }),
  ).toHaveCount(0);
}
async function seed(
  page: Page,
  mode:
    | 'quality-executed'
    | 'integration-executed'
    | 'quality'
    | 'contract'
    | 'configured'
    | 'integration'
    | 'failed'
    | 'remediation'
    | 'showcase',
) {
  await page.goto('/welcome');
  return page.evaluate(async (mode) => {
    const path = '/src/mocks/mock-adapter.ts';
    const { createMockAdapter } = await import(/* @vite-ignore */ path);
    const a = createMockAdapter('u-ops'),
      p = createMockAdapter('u-proc'),
      t = createMockAdapter('u-test'),
      k = () => crypto.randomUUID();
    const change = async (id: string, cmd: object, actor = a) => {
      const d = await a.getLifecycle(id);
      await actor.changeLifecycle(
        id,
        d.row.version,
        cmd,
        '模拟交付前置事实',
        k(),
      );
    };
    const acquire = async (id: string) =>
      change(
        id,
        {
          action: 'acquire',
          procurementOwnerId: 'u-proc',
          testerId: 'u-test',
          operatorId: 'u-ops',
          demandId: null,
          dueAt: null,
          credentialStatus: 'received',
          credentialReference: 'mock:test-reference',
          credentialRecipientId: 'u-test',
          usageTerms: '仅模拟用量条件',
        },
        p,
      );
    const run = async (id: string, phase = 'quality', result = 'passed') => {
      const task = await t.createTestTask(
        {
          channelId: id,
          testType: phase,
          targetReference: `mock:${phase}-delivery`,
          assignedTo: 'u-test',
        },
        k(),
      );
      let d = await t.getTestTask(task);
      const e = await t.startTestTask(task, d.definition.version, k());
      d = await t.getTestTask(task);
      await t.finishTestExecution(
        task,
        d.definition.version,
        e,
        {
          result,
          technicalSummary: '模拟执行摘要',
          internalNotes: '技术模拟记录',
          evidenceReference: 'mock:report',
          failureCategory: result === 'failed' ? 'timeout' : null,
        },
        k(),
      );
      return e;
    };
    const verify = async (id: string, phase = 'quality') => {
      const e = await run(id, phase);
      await change(
        id,
        {
          action: 'verify',
          phase,
          executionId: e,
          ttftMs: 120,
          rpm: 100,
          tpm: 5000,
          concurrency: 5,
          metering: 'passed',
          billing: 'passed',
          conclusion: 'passed',
          evidenceReference: 'mock:phase-report',
        },
        t,
      );
      return e;
    };
    const contract = async (id: string) =>
      change(
        id,
        {
          action: 'contract',
          stage: 'effective',
          number: `MOCK-CONTRACT-${id}`,
          handler: '模拟双方签署',
          nextAction: '交接运营配置',
          nextOwnerId: 'u-proc',
          dueAt: null,
          effectiveAt: new Date().toISOString(),
          paperStatus: 'pending',
        },
        p,
      );
    const config = async (id: string) =>
      change(id, {
        action: 'configuration',
        sent: true,
        recipientId: 'u-ops',
        received: true,
        configured: true,
        reference: 'mock:production-reference',
      });
    const create = async (name: string) => {
      const c = await a.createChannel({
        supplierId: 's-1',
        modelId: 'm-seed-cn',
        displayName: name,
        channelType: 'third_party_proxy',
        modelInvocationName: 'mock-upstream-seedance',
        endpointReference: 'mock:endpoint',
        tpm: 5000,
        rpm: 100,
        concurrencyLimit: 5,
        ttftMs: 200,
      });
      return c.id;
    };
    const prepare = async (id: string, state: string) => {
      await acquire(id);
      if (state === 'failed' || state === 'remediation') {
        const e = await run(id, 'quality', 'failed');
        if (state === 'remediation') {
          const rid = await a.createRemediation(
            {
              channelId: id,
              sourceType: 'failed_execution',
              sourceExecutionId: e,
              category: 'quality',
              verificationScope: 'quality',
              targetReference: 'mock:quality-delivery',
              sharedSummary: '模拟供应商技术问题',
              internalNotes: '仅模拟内部说明',
              assigneeUserId: 'u-test',
              dueAt: null,
              splitReason: '',
            },
            k(),
          );
          await a.changeRemediation(
            rid,
            1,
            { action: 'start' },
            '开始整改',
            k(),
          );
          return { id, e, remediationId: rid };
        }
        return { id, e, remediationId: '' };
      }
      if (state === 'quality-executed')
        return { id, e: await run(id), remediationId: '' };
      await verify(id);
      if (state === 'quality' || state === 'contract')
        return { id, e: '', remediationId: '' };
      await contract(id);
      await config(id);
      if (state === 'integration-executed')
        return { id, e: await run(id, 'connectivity'), remediationId: '' };
      if (state === 'configured') return { id, e: '', remediationId: '' };
      const e = await verify(id, 'connectivity');
      if (state === 'open')
        await change(id, { action: 'dispatch', state: 'open' });
      return { id, e, remediationId: '' };
    };
    if (mode === 'showcase') {
      for (const [name, state] of [
        ['模拟07D正常开放', 'open'],
        ['模拟07D供应商整改中', 'remediation'],
        ['模拟07D合同推进中', 'contract'],
        ['模拟07D第二阶段待测试', 'configured'],
      ])
        await prepare(await create(name!), state!);
      const pending = await create('模拟07D第一阶段待测试');
      await acquire(pending);
      return { id: pending, e: '', remediationId: '' };
    }
    return prepare('ch-1', mode);
  }, mode) as Promise<{ id: string; e: string; remediationId: string }>;
}
async function originalRun(
  page: Page,
  result: string,
  phase: 'quality' | 'connectivity' = 'quality',
) {
  await page.goto('/tests');
  await page.getByRole('button', { name: '新建测试任务' }).click();
  await select(page, '测试渠道', '模拟渠道1');
  await select(
    page,
    '测试类型',
    phase === 'quality' ? '质量测试' : '连通性测试',
  );
  await page
    .getByRole('textbox', { name: '测试目标', exact: true })
    .fill(`mock:${phase}-delivery`);
  await page.getByRole('button', { name: '创建任务', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '测试任务详情' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '开始模拟执行', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /确认保存$/ })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '录入本轮结果', exact: true }).click();
  await select(page, '人工执行结果', result);
  await page
    .getByRole('textbox', { name: '问题说明', exact: true })
    .fill('模拟质量测试失败，需供应商整改');
  await page
    .getByRole('textbox', { name: '内部技术说明', exact: true })
    .fill('仅模拟技术问题');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /确认保存$/ })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
test('采购真实确认资源获取，质量失败自动形成测试/运营/采购三方并行任务', async ({
  page,
}) => {
  await page.goto('/channels');
  await persona(page, '陈嘉宁');
  await page.goto('/channels?delivery=ch-1');
  await page
    .getByRole('button', { name: '确认资源获取与交接', exact: true })
    .click();
  await select(page, '测试凭据接收状态', '已授权接收');
  await page
    .getByRole('textbox', { name: '测试用量或测试金条件（模拟）', exact: true })
    .fill('仅模拟测试用量');
  await save(page);
  await page.goto('/tests');
  await persona(page, '周予安');
  await originalRun(page, '失败');
  await page.goto('/dashboard');
  await expect(
    page.getByText('向供应商反馈并跟进整改', { exact: true }),
  ).toBeVisible();
  await persona(page, '林知远');
  await expect(page.getByText('监督整改进度', { exact: true })).toBeVisible();
  await persona(page, '陈嘉宁');
  await expect(page.getByText('补充替代资源', { exact: true })).toBeVisible();
});
test('原07B整改提交后等待新执行复测，异常筛选与真实整改截图', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const state = await seed(page, 'remediation');
  await page.goto(`/remediations/${state.remediationId}`);
  await persona(page, '周予安');
  await page.getByRole('button', { name: '提交本轮结果', exact: true }).click();
  await page
    .getByRole('textbox', { name: '本轮共享整改结果' })
    .fill('供应商模拟反馈已完成，等待复测');
  await page
    .getByRole('textbox', { name: '本轮内部处理说明' })
    .fill('模拟整改技术说明');
  await page
    .getByRole('textbox', { name: '操作说明', exact: true })
    .fill('本轮反馈');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(
    page.getByText('供应商反馈已提交，等待新执行复测', { exact: true }),
  ).toBeVisible();
  await page.goto('/channels');
  await select(page, '进度异常筛选', '异常渠道');
  await expect(
    page.getByRole('link', { name: '模拟渠道1', exact: true }),
  ).toBeVisible();
  await page.goto('/channels?delivery=ch-1');
  await expect(
    page.getByRole('dialog', { name: '模拟渠道1 · 资源交付', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/整改第 .*轮 · 等待复测/)).toBeVisible();
  const qualitySteps = await page
    .getByRole('dialog')
    .locator('[data-progress-step]')
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        phase: n.getAttribute('data-progress-phase'),
        kind: n.getAttribute('data-progress-step'),
      })),
    );
  expect(qualitySteps.slice(0, 7).map((n) => n.kind)).toEqual([
    'milestone',
    'milestone',
    'failure',
    'feedback',
    'remediation',
    'retest',
    'milestone',
  ]);
  expect(qualitySteps[2]!.phase).toBe('quality');

  await expect(
    page
      .getByRole('dialog', { name: '模拟渠道1 · 资源交付', exact: true })
      .getByRole('link', { name: state.remediationId!, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: 'harness/build/screenshots/stage-07d-failed-remediation.png',
  });
});
test('复测通过后采购登记有效电子合同，运营生产配置不等待纸质寄回', async ({
  page,
}) => {
  await seed(page, 'quality');
  await page.goto('/channels');
  await persona(page, '陈嘉宁');
  await page.goto('/channels?delivery=ch-1');
  await page.getByRole('button', { name: '推进采购合同', exact: true }).click();
  await select(page, '采购合同阶段', '合同已生效');
  await page
    .getByRole('textbox', { name: '模拟合同编号', exact: true })
    .fill('MOCK-BROWSER-CONTRACT');
  await page
    .getByRole('textbox', { name: '当前处理方', exact: true })
    .fill('模拟双方已确认');
  await page
    .getByRole('textbox', { name: '下一步合同动作', exact: true })
    .fill('交接生产配置');
  await select(page, '下一步责任人', '林知远');
  await page
    .getByRole('textbox', { name: '电子合同生效时间（ISO 时区）', exact: true })
    .fill(new Date().toISOString());
  await select(page, '纸质合同寄回', '待寄回');
  await save(page);
  await page.goto('/dashboard');
  await persona(page, '林知远');
  await expect(page.getByText('完成生产配置', { exact: true })).toBeVisible();
  await page.goto('/channels?delivery=ch-1');
  await page.getByRole('button', { name: '登记生产配置', exact: true }).click();
  await select(page, '是否已发送生产凭据', '已发送（模拟）');
  await select(page, '是否确认接收', '已确认接收');
  await select(page, '是否配置完成', '已配置完成（模拟）');
  await save(page);
  await expect(page.getByText(/第二阶段平台接入测试/).first()).toBeVisible();
});
test('第二阶段必须计量/计费通过，由测试确认后运营人工开放；刷新保留', async ({
  page,
}) => {
  const state = await seed(page, 'configured');
  const eid = await page.evaluate(async () => {
    const path = '/src/mocks/mock-adapter.ts';
    const { createMockAdapter } = await import(/* @vite-ignore */ path);
    const t = createMockAdapter('u-test'),
      k = () => crypto.randomUUID();
    const id = await t.createTestTask(
      {
        channelId: 'ch-1',
        testType: 'connectivity',
        targetReference: 'mock:integration',
        assignedTo: 'u-test',
      },
      k(),
    );
    let d = await t.getTestTask(id);
    const e = await t.startTestTask(id, d.definition.version, k());
    d = await t.getTestTask(id);
    await t.finishTestExecution(
      id,
      d.definition.version,
      e,
      {
        result: 'passed',
        technicalSummary: '模拟连通成功',
        internalNotes: '计费需另核验',
        evidenceReference: 'mock:report',
        failureCategory: null,
      },
      k(),
    );
    return e;
  });
  await page.goto('/channels');
  await persona(page, '周予安');
  await page.goto(`/channels?delivery=${state.id}`);
  await page.getByRole('button', { name: '登记阶段核验', exact: true }).click();
  await select(page, '核验阶段', '第二阶段平台接入测试');
  await select(page, '实际测试执行', eid);
  await select(page, '阶段最终人工结论', '通过');
  await page
    .getByRole('dialog')
    .last()
    .getByRole('textbox', { name: '本次交付操作说明' })
    .fill('逐项人工核验');
  await page.getByRole('button', { name: /保存交付事实$/ }).click();
  await expect(
    page.getByText(/不能仅凭 API 成功确认第二阶段通过/),
  ).toBeVisible();
  await select(page, '计量记录核验', '通过');
  await select(page, '计费核验', '通过');
  await save(page);
  await page.goto('/dashboard');
  await persona(page, '林知远');
  await expect(page.getByText('确认对客开放', { exact: true })).toBeVisible();
  await page.goto('/channels?delivery=ch-1');
  await page
    .getByRole('button', { name: '确认开放或调度', exact: true })
    .click();
  await select(page, '对客开放与调度状态', '已开放');
  await save(page);
  await page.reload();
  await expect(page.getByText(/100% · 交付已完成 · 当前可调度/)).toBeVisible();
});
for (const width of [1440, 390])
  test(`${width}px 多种真实渠道状态、进度与布局截图`, async ({ page }) => {
    await seed(page, 'showcase');
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/channels');
    await expect(
      page.getByRole('heading', { name: '渠道总览', exact: true }),
    ).toBeVisible();
    await select(page, '进度模型筛选', 'Seedance 1.0 国内版');
    await expect(
      page.getByRole('link', { name: '模拟07D正常开放', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: '模拟07D供应商整改中', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: '模拟07D合同推进中', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: '模拟07D第二阶段待测试', exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      animations: 'disabled',
      path: `harness/build/screenshots/stage-07d-lifecycle-${width}.png`,
      fullPage: true,
    });
  });
test('前台仍为匿名旧视图，运维只读、单域隔离和无写入能力', async ({ page }) => {
  await seed(page, 'configured');
  await page.goto('/channels');
  await persona(page, '沈悦');
  await expect(
    page.getByRole('columnheader', { name: '动态交付进度' }),
  ).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(
    /华北资源合作方|华东模型合作方|海外资源合作方/,
  );
  await expect(page.locator('main')).not.toContainText('采购折扣');
  await persona(page, '许明哲');
  await page.goto('/channels?delivery=ch-1');
  await expect(
    page.getByRole('button', { name: '推进采购合同', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '登记生产配置', exact: true }),
  ).toHaveCount(0);
  await page.goto('/channels');
  await persona(page, '苏雨晴');
  await expect(
    page.getByRole('link', { name: '模拟渠道5', exact: true }),
  ).toHaveCount(0);
});

test('验收补丁：测试人工确认质量通过，采购合同待办、运营仅需知悉并已读刷新', async ({
  page,
}) => {
  const state = await seed(page, 'quality-executed');
  await page.goto('/dashboard');
  await persona(page, '周予安');
  await page.goto('/channels?delivery=ch-1');
  await page.getByRole('button', { name: '登记阶段核验', exact: true }).click();
  await select(page, '实际测试执行', state.e);
  await select(page, '阶段最终人工结论', '通过');
  await save(page);
  await page.goto('/dashboard');
  await persona(page, '陈嘉宁');
  await expect(page.getByTestId('lifecycle-inbox')).toBeVisible();
  await expect(page.getByText('推进采购合同', { exact: true })).toBeVisible();
  await expect(page.getByText('补充替代资源', { exact: true })).toHaveCount(0);
  await persona(page, '林知远');
  await expect(page.getByTestId('lifecycle-inbox')).toBeVisible();
  await expect(page.getByText('监督整改进度', { exact: true })).toHaveCount(0);
  await select(page, '协作任务视角', '站内通知（仅需知悉）');
  const row = page
    .getByRole('row')
    .filter({ hasText: '第一阶段质量测试通过，可推进合同' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('仅需知悉');
  await expect(
    row.getByRole('button', { name: '完成任务', exact: true }),
  ).toHaveCount(0);
  await row.getByRole('button', { name: '标记已读', exact: true }).click();
  await page
    .getByRole('textbox', { name: '任务操作说明' })
    .fill('已知悉，可推进采购合同');
  await page.getByRole('button', { name: '确认任务操作', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await select(page, '协作任务视角', '站内通知（仅需知悉）');
  await expect(row).toContainText('已读');
  await page.getByTestId('lifecycle-inbox').screenshot({
    animations: 'disabled',
    path: 'harness/build/screenshots/stage-07d-patch-quality-notice.png',
  });
});
for (const width of [1440, 390])
  test(`验收补丁 ${width}px：接入失败采购抄送、运营监督、异常顺序及刷新`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    const state = await seed(
      page,
      width === 1440 ? 'configured' : 'integration-executed',
    );
    await page.goto('/dashboard');
    await persona(page, '周予安');
    if (width === 1440) await originalRun(page, '失败', 'connectivity');
    else {
      await page.goto('/channels?delivery=ch-1');
      await page
        .getByRole('button', { name: '登记阶段核验', exact: true })
        .click();
      await select(page, '核验阶段', '第二阶段平台接入测试');
      await select(page, '实际测试执行', state.e);
      await select(page, '计量记录核验', '通过');
      await select(page, '计费核验', '失败');
      await select(page, '阶段最终人工结论', '失败');
      await save(page);
    }
    await page.goto('/dashboard');
    await expect(
      page.getByText('向供应商反馈并跟进整改', { exact: true }),
    ).toBeVisible();
    await persona(page, '陈嘉宁');
    await expect(page.getByTestId('lifecycle-inbox')).toBeVisible();
    await expect(page.getByText('补充替代资源', { exact: true })).toHaveCount(
      0,
    );
    await select(page, '协作任务视角', '站内通知（仅需知悉）');
    const notice = page
      .getByRole('row')
      .filter({ hasText: '第二阶段接入异常（采购抄送，仅需知悉）' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('仅需知悉');
    await expect(
      notice.getByRole('button', { name: '完成任务', exact: true }),
    ).toHaveCount(0);
    await persona(page, '林知远');
    await expect(page.getByTestId('lifecycle-inbox')).toBeVisible();
    await expect(page.getByText('监督整改进度', { exact: true })).toBeVisible();
    await page.goto('/channels');
    await select(page, '进度异常筛选', '异常渠道');
    await expect(
      page.getByRole('link', { name: '模拟渠道1', exact: true }),
    ).toBeVisible();
    let overview: string[] = [];
    if (width === 1440) {
      const row = page.getByRole('row').filter({
        has: page.getByRole('link', { name: '模拟渠道1', exact: true }),
      });
      await row.getByRole('progressbar').hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      overview = await page
        .getByRole('tooltip')
        .locator('[data-progress-step]')
        .allTextContents();
    }
    await page.goto('/channels?delivery=ch-1');
    const drawer = page.getByRole('dialog', {
      name: '模拟渠道1 · 资源交付',
      exact: true,
    });
    await expect(
      drawer.getByText('测试失败', { exact: true }).first(),
    ).toBeVisible();
    const nodes = drawer.locator('[data-progress-step]');
    const before = await nodes.allTextContents();
    expect(
      await nodes.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute('data-progress-phase')),
      ),
    ).toEqual([
      'resource',
      'quality',
      'contract',
      'configuration',
      'connectivity',
      'connectivity',
      'connectivity',
      'connectivity',
      'opening',
    ]);
    if (width === 1440) expect(before).toEqual(overview);
    await page.reload();
    await expect(drawer).toBeVisible();
    await expect(nodes).toHaveText(before);
    await expect
      .poll(async () => {
        const box = await drawer.boundingBox();
        return !!box && box.x >= -1 && box.x + box.width <= width + 1;
      })
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      animations: 'disabled',
      path: `harness/build/screenshots/stage-07d-patch-integration-failure-${width}.png`,
    });
  });
