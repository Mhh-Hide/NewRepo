import { test, expect, type Page } from '@playwright/test';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const e: string[] = [];
  errors.set(page, e);
  page.on('pageerror', (v) => e.push(v.message));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));
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
  const b = page
    .getByRole('dialog')
    .getByRole('button', { name: '保存', exact: true });
  await expect(b).not.toHaveClass(/ant-btn-loading/);
  await b.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function create(page: Page) {
  await page.goto('/remediations');
  await page.getByRole('button', { name: '新建整改' }).click();
  await select(page, '渠道', '模拟渠道2');
  await page
    .getByRole('textbox', { name: '验证目标引用' })
    .fill('mock:target-a');
  await page
    .getByRole('textbox', { name: '问题说明', exact: true })
    .fill('浏览器模拟技术问题');
  await page
    .getByRole('textbox', { name: '内部技术说明', exact: true })
    .fill('内部模拟说明 browser-remediation-private');
  await save(page);
  await page
    .getByRole('row')
    .filter({ hasText: '浏览器模拟技术问题' })
    .getByRole('link')
    .click();
  await expect(page.getByRole('heading', { name: '整改详情' })).toBeVisible();
}
async function action(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await page
    .getByRole('textbox', { name: '操作说明', exact: true })
    .fill('人工操作模拟说明');
}
async function seed(page: Page, status: 'open' | 'submitted' = 'submitted') {
  await page.goto('/welcome');
  return page.evaluate(async (status) => {
    // Existing public Adapter commands seed state; all tested actions below use rendered controls.
    const modulePath = '/src/mocks/mock-adapter.ts';
    const { createMockAdapter } = await import(/* @vite-ignore */ modulePath);
    const api = createMockAdapter('u-ops');
    const k = () => crypto.randomUUID();
    const id = await api.createRemediation(
      {
        channelId: 'ch-2',
        sourceType: 'manual',
        sourceExecutionId: null,
        category: 'quality',
        verificationScope: 'quality',
        targetReference: 'mock:target-a',
        sharedSummary: '模拟共享问题',
        internalNotes: 'internal-sentinel',
        assigneeUserId: 'u-test',
        dueAt: null,
        splitReason: '',
      },
      k(),
    );
    if (status === 'submitted') {
      await api.changeRemediation(id, 1, { action: 'start' }, '开始跟进', k());
      await api.changeRemediation(
        id,
        2,
        {
          action: 'submit',
          sharedSummary: '本轮结果',
          internalNotes: '内部结果',
          evidenceReference: 'mock:result',
        },
        '提交',
        k(),
      );
    }
    return id;
  }, status) as Promise<string>;
}
test('创建、分配负责人、开始、提交、退回和第二轮结果在刷新后保留', async ({
  page,
}) => {
  await create(page);
  await action(page, '分配负责人');
  await select(page, '整改负责人', '模拟Testing');
  await save(page);
  await action(page, '开始跟进');
  await save(page);
  await action(page, '提交本轮结果');
  await page
    .getByRole('textbox', { name: '本轮共享整改结果' })
    .fill('第一轮模拟结果');
  await page
    .getByRole('textbox', { name: '本轮内部处理说明' })
    .fill('内部处理说明');
  await save(page);
  await action(page, '退回整改');
  await save(page);
  await action(page, '提交本轮结果');
  await page
    .getByRole('textbox', { name: '本轮共享整改结果' })
    .fill('第二轮模拟结果');
  await page
    .getByRole('textbox', { name: '本轮内部处理说明' })
    .fill('第二轮内部说明');
  await save(page);
  await page.reload();
  await page.getByRole('button', { name: '跟进与复测历史' }).click();
  await expect(page.getByText(/第 1 轮 ·/)).toBeVisible();
  await expect(page.getByText(/第 2 轮 ·/)).toBeVisible();
});
test('关联真实已保存复测、显式现行采纳后由运营预览并关闭', async ({ page }) => {
  const id = await seed(page);
  const { executionId, conclusionId } = await page.evaluate(async () => {
    const path = '/src/mocks/mock-adapter.ts';
    const { createMockAdapter } = await import(/* @vite-ignore */ path);
    const a = createMockAdapter('u-ops'),
      k = () => crypto.randomUUID();
    const t = await a.createTestTask(
      {
        channelId: 'ch-2',
        testType: 'quality',
        targetReference: 'mock:target-a',
        assignedTo: null,
      },
      k(),
    );
    let d = await a.getTestTask(t);
    const e = await a.startTestTask(t, d.definition.version, k());
    d = await a.getTestTask(t);
    await a.finishTestExecution(
      t,
      d.definition.version,
      e,
      {
        result: 'passed',
        technicalSummary: '模拟复测通过',
        internalNotes: '模拟内部',
        evidenceReference: 'mock:test',
        failureCategory: null,
      },
      k(),
    );
    d = await a.getTestTask(t);
    await a.adoptTestExecution(
      e,
      { ...d.token, executionVersion: 1 },
      '运营明确采纳',
      k(),
    );
    const o = await a.remediationOptions();
    return {
      executionId: e,
      conclusionId: o.conclusions.find(
        (c: { executionId: string }) => c.executionId === e,
      ).id,
    };
  });
  await page.goto(`/remediations/${id}`);
  await action(page, '关联已有复测');
  await select(page, '复测执行', executionId);
  await page
    .getByRole('textbox', { name: '本轮验证目标适用性说明' })
    .fill('同目标覆盖本轮整改');
  await save(page);
  await action(page, '正常关闭');
  await select(page, '复测执行', executionId);
  await select(page, '明确选择现行采纳结论', conclusionId);
  await page
    .getByRole('textbox', { name: '本轮验证目标适用性说明' })
    .fill('同目标覆盖本轮整改');
  await page.getByRole('button', { name: '验证关闭条件' }).click();
  await expect(
    page.getByText('关闭条件已通过预览；确认时将重新核验。'),
  ).toBeVisible();
  await page.getByRole('button', { name: '确认正常关闭' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '跟进与复测历史' }).click();
  await expect(page.getByText('运营正常关闭', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '提交本轮结果' })).toHaveCount(
    0,
  );
});
for (const width of [1440, 390])
  test(`${width}px 例外关闭、历史及整页布局`, async ({ page }) => {
    const id = await seed(page, 'open');
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/remediations/${id}`);
    await action(page, '例外关闭');
    await select(page, '例外原因分类', '无法验证');
    await save(page);
    await page.getByRole('button', { name: '跟进与复测历史' }).click();
    await expect(
      page.getByText('例外结束，不代表技术修复已验证成功。', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `harness/build/screenshots/stage-07b-${width}.png`,
      fullPage: true,
    });
  });
test('存储失败保留输入；重试提交成功', async ({ page }) => {
  const id = await seed(page, 'open');
  await page.goto(`/remediations/${id}`);
  await action(page, '开始跟进');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'maas-remediation-demo-v1')
        throw new DOMException('quota', 'QuotaExceededError');
      original.call(this, k, v);
    };
  });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByText(/整改保存失败/),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: '操作说明', exact: true }),
  ).toHaveValue('人工操作模拟说明');
  await page.reload();
  await action(page, '开始跟进');
  await save(page);
  await expect(page.getByText('处理中', { exact: true })).toBeVisible();
});
test('双窗口版本冲突拒绝覆盖', async ({ page, context }) => {
  const id = await seed(page, 'open');
  await page.goto(`/remediations/${id}`);
  await action(page, '开始跟进');
  const second = await context.newPage();
  await second.goto(`/remediations/${id}`);
  await action(second, '开始跟进');
  await save(second);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByText(/整改版本变化/),
  ).toBeVisible();
  await second.close();
});
test('角色切换摘要隔离和前台直接访问拒绝', async ({ page }) => {
  const id = await seed(page);
  await page.goto(`/remediations/${id}`);
  await page
    .getByRole('combobox', { name: '演示身份' })
    .fill('模拟Procurement');
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '模拟Procurement' })
    .click();
  await expect(page.getByText('整改不存在或无权查看完整详情')).toBeVisible();
  await page.goto('/remediations');
  await expect(page.getByText('internal-sentinel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新建整改' })).toHaveCount(0);
  await page.getByRole('combobox', { name: '演示身份' }).fill('模拟Sales');
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '模拟Sales' })
    .click();
  await expect(page.getByText('无整改访问权限')).toBeVisible();
});
