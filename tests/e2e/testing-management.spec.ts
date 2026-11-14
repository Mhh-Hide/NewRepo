import { test, expect, type Page } from '@playwright/test';
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});
async function select(page: Page, name: string, label: string) {
  const combo = page.getByRole('combobox', { name, exact: true });
  await combo.click();
  const control = await combo.getAttribute('aria-controls');
  const option = page
    .locator('.ant-select-dropdown')
    .filter({ has: page.locator(`[id="${control}"]`) })
    .locator('.ant-select-item-option')
    .filter({ hasText: label });
  await option.hover();
  await combo.press('Enter');
}
async function persona(page: Page, label: string) {
  await page.getByRole('combobox', { name: '演示身份' }).fill(label);
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: label })
    .click();
}
async function create(page: Page, type = '质量测试', channel = '模拟渠道2') {
  await page.goto('/tests');
  await page.getByRole('button', { name: '新建测试任务' }).click();
  await select(page, '测试渠道', channel);
  await select(page, '测试类型', type);
  await page
    .getByRole('textbox', { name: '测试目标', exact: true })
    .fill('人工模拟技术场景，不调用真实模型');
  await page.getByRole('button', { name: '创建任务', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '测试任务详情', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function confirm(page: Page, reason?: string) {
  if (reason)
    await page
      .getByRole('textbox', { name: '操作说明', exact: true })
      .fill(reason);
  const save = page
    .getByRole('dialog')
    .getByRole('button', { name: /确认保存$/ });
  await expect(save).not.toHaveClass(/ant-btn-loading/);
  await save.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function execute(page: Page, result = '通过', retest = false) {
  await page
    .getByRole('button', {
      name: retest ? '新增复测执行' : '开始模拟执行',
      exact: true,
    })
    .click();
  await confirm(page);
  await page.getByRole('button', { name: '录入本轮结果', exact: true }).click();
  await select(page, '人工执行结果', result);
  await page
    .getByRole('textbox', { name: '共享技术摘要', exact: true })
    .fill(`人工模拟${result}；无真实调用`);
  await page
    .getByRole('textbox', { name: '内部技术说明', exact: true })
    .fill('受限内部技术备注 browser-sentinel');
  await confirm(page);
}
test('operations runs, adopts, retests failure without replacing adopted result and updates dashboard/channel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await create(page);
  await execute(page);
  await page.getByRole('button', { name: '采纳此结果', exact: true }).click();
  await confirm(page, '运营人工采纳通过');
  await expect(
    page.getByText('质量：通过 · 人工采纳', { exact: true }),
  ).toBeVisible();
  await execute(page, '失败', true);
  await expect(
    page.getByText(/新失败待复核；原采纳结论保持不变/),
  ).toBeVisible();
  await expect(
    page.getByText('质量：通过 · 人工采纳', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/第 2 轮 · 执行人/)).toBeVisible();
  await page.getByRole('link', { name: '关联渠道详情' }).click();
  await expect(
    page.getByText('授权测试技术摘要', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/新失败待复核；原采纳结论保持不变/),
  ).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByTestId('testing-stat-reviewChannels')).toHaveText('1');
  await expect(page.getByTestId('testing-stat-newFailureChannels')).toHaveText(
    '1',
  );
  await expect(
    page.getByTestId('testing-stat-currentFailedChannels'),
  ).toHaveText('0');
  await page.goto('/tests?channelId=ch-2');
  await expect(page.getByTestId('testing-stat-reviewChannels')).toHaveText('1');
  await expect(
    page.getByRole('link', { name: '查看任务', exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: 'harness/build/screenshots/stage-07a-1440.png',
    fullPage: true,
  });
});
test('inconclusive review closes only one execution and preserves completed history', async ({
  page,
}) => {
  await create(page, '连通性测试');
  await execute(page, '结果不确定');
  await expect(
    page.getByRole('button', { name: '采纳此结果', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: '审阅不形成新结论', exact: true })
    .click();
  await confirm(page, '信息不足，已审阅但不形成结论');
  await expect(page.getByText(/已审阅但未形成新结论 ·/)).toBeVisible();
  await expect(page.getByText('结果不确定', { exact: true })).toBeVisible();
  await expect(page.getByText(/待复核执行：0/)).toBeVisible();
  await execute(page, '通过', true);
  await expect(
    page.getByRole('button', { name: '采纳此结果', exact: true }),
  ).toBeVisible();
});
test('testing persona executes and reads own technical history but cannot adopt or see commercial data', async ({
  page,
}) => {
  await page.goto('/tests');
  await persona(page, '测试 · 模拟Testing');
  await create(page);
  await execute(page, '失败');
  await expect(
    page.getByRole('button', { name: '采纳此结果', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '登记来源核验', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '登记质量豁免', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('测试专用操作审计', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/采购折扣/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('失败', { exact: true })).toBeVisible();
});
test('official verification, exemption and revocation preserve connectivity pending', async ({
  page,
}) => {
  await create(page, '质量测试', '模拟渠道1');
  await page.getByRole('button', { name: '撤销质量豁免', exact: true }).click();
  await confirm(page, '模拟撤销历史豁免重新核验');
  await page.getByRole('button', { name: '登记来源核验', exact: true }).click();
  await page
    .getByRole('textbox', { name: '模拟证据引用', exact: true })
    .fill('mock:official-source');
  await confirm(page, '模拟官方来源证据核验');
  await page.getByRole('button', { name: '登记质量豁免', exact: true }).click();
  await page
    .getByRole('textbox', { name: '模拟证据引用', exact: true })
    .fill('mock:independent-quality');
  await confirm(page, '模拟独立质量豁免证据');
  await expect(
    page.getByText('质量豁免（不是测试通过）', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/连通性：待验证 · 暂无明确采纳依据/),
  ).toBeVisible();
  await expect(
    page.getByText('尚无完成执行；开始后会记录独立轮次。'),
  ).toBeVisible();
  await page.getByRole('button', { name: '撤销质量豁免', exact: true }).click();
  await confirm(page, '模拟豁免撤销后仍需连通性验证');
  await expect(
    page.getByText('当前：无有效质量豁免', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/连通性：待验证 · 暂无明确采纳依据/),
  ).toBeVisible();
});
test('procurement and support see summary only; supplier and front roles are denied full test routes', async ({
  page,
}) => {
  await create(page);
  await execute(page, '失败');
  const url = page.url();
  await page.goto('/tests');
  await persona(page, '采购 · 模拟Procurement');
  await expect(
    page.getByText('技术摘要（只读）', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/browser-sentinel/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新建测试任务' })).toHaveCount(
    0,
  );
  await page.goto(url);
  await expect(
    page.getByText('当前身份仅能读取技术摘要，无测试详情权限'),
  ).toBeVisible();
  await persona(page, '运维 · 模拟OperationsSupport');
  await page.goto('/tests');
  await expect(
    page.getByText('技术摘要（只读）', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/browser-sentinel/)).toHaveCount(0);
  await persona(page, '供应商 · 模拟SupplierUser');
  await expect(page.getByText('当前演示身份无此模块访问权限')).toBeVisible();
  await persona(page, '销售 · 模拟Sales');
  await expect(page.getByText('当前演示身份无此模块访问权限')).toBeVisible();
  await expect(page.getByText(/模拟渠道2|虚构供应商/)).toHaveCount(0);
});
test('running cancellation records null terminal result and cannot reopen', async ({
  page,
}) => {
  await create(page);
  await page.getByRole('button', { name: '开始模拟执行', exact: true }).click();
  await confirm(page);
  await page.getByRole('button', { name: '取消任务', exact: true }).click();
  await confirm(page, '人工停止，未形成测试结果');
  await expect(page.getByText('已终止，无结果', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '开始模拟执行', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '新增复测执行', exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('已终止，无结果', { exact: true })).toBeVisible();
});
test('storage quota failure preserves result inputs and retries atomically', async ({
  page,
}) => {
  await create(page);
  await page.getByRole('button', { name: '开始模拟执行', exact: true }).click();
  await confirm(page);
  await page.getByRole('button', { name: '录入本轮结果', exact: true }).click();
  await page
    .getByRole('textbox', { name: '共享技术摘要', exact: true })
    .fill('模拟失败重试保留输入');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Object.assign(window, {
      restoreTestingStorage: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = function (k, v) {
      if (k === 'maas-channel-demo-v1') throw Error('quota');
      return original.call(this, k, v);
    };
  });
  await page.getByRole('button', { name: '确认保存', exact: true }).click();
  await expect(
    page.getByText('渠道保存失败，未提交任何更改。', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: '共享技术摘要', exact: true }),
  ).toHaveValue('模拟失败重试保留输入');
  await page.evaluate(() => {
    (
      window as Window & { restoreTestingStorage?: () => void }
    ).restoreTestingStorage?.();
  });
  await confirm(page);
  await expect(
    page.getByText('模拟失败重试保留输入', { exact: true }).first(),
  ).toBeVisible();
});
test('stale modal reports version conflict when another tab starts same task', async ({
  page,
  context,
}) => {
  await create(page);
  await page.getByRole('button', { name: '开始模拟执行', exact: true }).click();
  const other = await context.newPage();
  await other.goto(page.url());
  await other
    .getByRole('button', { name: '开始模拟执行', exact: true })
    .click();
  await confirm(other);
  await page.getByRole('button', { name: '确认保存', exact: true }).click();
  await expect(
    page.getByText('任务版本已变化，请重新加载。', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '关闭表单', exact: true }).click();
  await page.getByRole('button', { name: '刷新任务', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '录入本轮结果', exact: true }),
  ).toBeVisible();
  await other.close();
});
test('390px list and detail keep local table scrolling with no page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page, '连通性测试');
  await execute(page, '失败');
  const task = page.url();
  await expect(page.getByText('失败', { exact: true })).toBeVisible();
  await page.screenshot({
    path: 'harness/build/screenshots/stage-07a-390.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  ).toBe(true);
  await page.goto('/tests');
  await expect(
    page.getByRole('heading', { name: '模型测试', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  ).toBe(true);
  await page.goto(task);
  await expect(
    page.getByRole('heading', { name: '测试任务详情', exact: true }),
  ).toBeVisible();
});
