import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function select(page: Page, label: string, text: string) {
  const control = page.getByRole('combobox', { name: label, exact: true });
  await control.click();
  const option = page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: text });
  await option.hover();
  await expect(option).toHaveClass(/ant-select-item-option-active/);
  await control.press('Enter');
  await expect(control).toHaveAttribute('aria-expanded', 'false');
}
async function persona(page: Page, label: string) {
  const control = page.getByRole('combobox', { name: '演示身份' });
  await control.fill(label);
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: label })
    .click();
}
async function create(page: Page, multi = true) {
  await page.getByRole('button', { name: '新增采购需求', exact: true }).click();
  await page
    .getByRole('textbox', { name: /运营需求标题（受限）$/ })
    .fill('PRIVATE 虚构客户专项资源');
  await page
    .getByRole('textbox', { name: '运营原始说明（受限）', exact: true })
    .fill('PRIVATE 原始客户背景及模拟售价 999 元');
  await select(page, '需求客户关联', '虚构客户1');
  await page
    .getByRole('textbox', { name: /采购共享标题$/ })
    .fill('虚构多模型性能优化需求');
  await page
    .getByRole('textbox', { name: /采购共享需求摘要$/ })
    .fill('寻找满足技术要求的上游模拟资源，采购共享内容。');
  await select(page, '明细 1 模型选择', 'Seedance 示例国内版');
  await page
    .getByRole('spinbutton', { name: /明细 1 目标采购折扣/ })
    .fill('8000');
  await page
    .getByRole('spinbutton', { name: '明细 1 TPM', exact: true })
    .fill('1000');
  await page
    .getByRole('spinbutton', { name: '明细 1 RPM', exact: true })
    .fill('10');
  await page
    .getByRole('spinbutton', { name: '明细 1 并发', exact: true })
    .fill('1');
  await page
    .getByRole('spinbutton', { name: '明细 1 TTFT (ms)', exact: true })
    .fill('5000');
  if (multi) {
    await page
      .getByRole('button', { name: '添加模型明细', exact: true })
      .click();
    await select(page, '明细 2 模型选择', 'GPT 示例');
    await page
      .getByRole('spinbutton', { name: /明细 2 目标采购折扣/ })
      .fill('8500');
  }
  await page.getByRole('button', { name: '保存采购需求', exact: true }).click();
  await expect(page).toHaveURL(/\/sourcing\/mock-demand-/);
  await expect(
    page.getByRole('heading', { name: '采购需求详情', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('sourcing-item-1')).toContainText(
    'Seedance 示例国内版',
  );
}
async function addCandidate(page: Page, name: string) {
  const item = page.getByTestId('sourcing-item-1');
  await item.getByRole('button', { name: '选择候选渠道', exact: true }).click();
  const drawer = page.getByRole('dialog', {
    name: '选择候选渠道 · Seedance 示例国内版',
    exact: true,
  });
  await drawer
    .getByRole('textbox', {
      name: '共享候选说明（不得含客户身份或售价）',
      exact: true,
    })
    .fill('模拟共享依据，能力待人工核实。');
  await drawer
    .getByRole('button', { name: `添加候选 ${name}`, exact: true })
    .click();
  await expect(drawer).toHaveCount(0);
}
async function assess(page: Page, name: string, status = '初步符合') {
  const row = page
    .getByTestId('sourcing-item-1')
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name, exact: true }) });
  await row.getByRole('button', { name: '修改匹配状态', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: '修改候选匹配状态',
    exact: true,
  });
  await select(page, '候选匹配状态', status);
  await dialog
    .getByRole('textbox', { name: '共享匹配依据', exact: true })
    .fill('人工初步评估，未知项仍须进一步核实。');
  await dialog
    .getByRole('button', { name: '保存匹配判断', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText(status);
}
test('operations creates multi-model request; procurement sees only shared content across detail, history and refresh', async ({
  page,
}) => {
  await page.goto('/sourcing');
  await expect(page.getByTestId('metric-sourcing-total')).toContainText('2');
  await create(page);
  const url = page.url();
  await expect(page.getByTestId('sourcing-item-2')).toContainText('GPT 示例');
  await expect(
    page.getByText('PRIVATE 虚构客户专项资源', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('虚构客户1（模拟）', { exact: true }),
  ).toBeVisible();
  await persona(page, '模拟Procurement');
  await expect(
    page.getByRole('heading', { name: '采购需求详情' }),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText('PRIVATE');
  await expect(page.locator('body')).not.toContainText('虚构客户1');
  await expect(page.locator('body')).not.toContainText('999 元');
  await expect(page.getByRole('button', { name: '维护需求资料' })).toHaveCount(
    0,
  );
  await expect(page.getByTestId('sourcing-item-1')).toContainText('8000 基点');
  const expand = page.locator('.ant-table-row-expand-icon');
  await expand.first().click();
  await expect(page.locator('body')).not.toContainText('PRIVATE');
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByTestId('sourcing-item-2')).toContainText('GPT 示例');
  await expect(page.locator('body')).not.toContainText('PRIVATE');
  await page.goto('/dashboard');
  await expect(page.getByTestId('metric-demands')).toContainText('3');
  await expect(page.getByTestId('metric-gaps')).toContainText('1');
  await page.goto('/sourcing');
  await page.getByRole('textbox', { name: '需求编号或标题' }).fill('PRIVATE');
  await expect(page.locator('.ant-table-tbody tr.ant-table-row')).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: '重置筛选' }).click();
  await expect(
    page.getByRole('link', { name: '虚构多模型性能优化需求', exact: true }),
  ).toBeVisible();
});
test('procurement adds multiple channels, deduplicates suppliers, changes matching and synchronizes dashboard', async ({
  page,
}) => {
  await page.goto('/sourcing');
  await create(page, false);
  const url = page.url();
  await persona(page, '模拟Procurement');
  for (const name of ['模拟渠道1', '模拟渠道2']) await addCandidate(page, name);
  const item = page.getByTestId('sourcing-item-1');
  await expect(item.getByTestId('coverage-candidates')).toHaveText('2');
  await expect(item.getByTestId('coverage-suppliers')).toHaveText('1');
  await expect(item.getByTestId('coverage-suitable')).toHaveText('0');
  await assess(page, '模拟渠道1');
  await assess(page, '模拟渠道2');
  await expect(item.getByTestId('coverage-suitable')).toHaveText('1');
  await page.goto('/dashboard');
  await expect(page.getByTestId('metric-gaps')).toContainText('2');
  await page.goto(url);
  for (const name of ['模拟渠道3', '模拟渠道4']) {
    await addCandidate(page, name);
    await assess(page, name);
  }
  await expect(item.getByTestId('coverage-suppliers')).toHaveText('3');
  await expect(item.getByTestId('coverage-suitable')).toHaveText('3');
  await expect(item.getByTestId('coverage-missing')).toHaveText('0');
  await page.reload();
  await expect(item.getByTestId('coverage-candidates')).toHaveText('4');
  await expect(item).toContainText('人工初步评估');
  await page.goto('/dashboard');
  await expect(page.getByTestId('metric-gaps')).toContainText('1');
  await page.goto(url);
  await assess(page, '模拟渠道4', '已排除');
  await expect(item.getByTestId('coverage-candidates')).toHaveText('3');
  await expect(item.getByTestId('coverage-suitable')).toHaveText('2');
  await expect(
    item.getByRole('link', { name: '模拟渠道4', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('寻源跟进记录', { exact: true })).toBeVisible();
});
test('operations maintains item requirements, versions and manual sourcing progress without production actions', async ({
  page,
}) => {
  await page.goto('/sourcing');
  await create(page, false);
  await page.getByRole('button', { name: '维护需求资料' }).click();
  await page
    .getByRole('spinbutton', { name: '明细 1 TPM', exact: true })
    .fill('1234');
  await page.getByRole('button', { name: '保存采购需求' }).click();
  await expect(page.getByRole('dialog', { name: '维护采购需求' })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByTestId('sourcing-item-1')).toContainText('1,234');
  await page.getByRole('button', { name: '更新寻源进度', exact: true }).click();
  await page
    .getByRole('textbox', { name: '共享跟进说明（不含客户信息）', exact: true })
    .fill('开始人工资源调查。');
  await page.getByRole('button', { name: '确认进度变更', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '更新寻源进度', exact: true }).click();
  await select(page, '新的寻源状态', '存在资源缺口');
  await page
    .getByRole('textbox', { name: '共享跟进说明（不含客户信息）', exact: true })
    .fill('人工调查后确认目前资源不足，继续寻找候选。');
  await page.getByRole('button', { name: '确认进度变更' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('sourcing-item-1')).toContainText(
    '已确认资源不足',
  );
  await expect(page.locator('body')).not.toContainText('正式采购完成');
});
test('commercial sourcing is denied to testing, support, suppliers and front office', async ({
  page,
}) => {
  await page.goto('/sourcing');
  await create(page, false);
  const url = page.url();
  for (const profile of [
    '模拟Testing',
    '模拟OperationsSupport',
    '模拟SupplierUser',
    '模拟Sales',
  ]) {
    await persona(page, profile);
    await page.goto(url);
    await expect(
      page.getByText('当前演示身份无内部采购寻源访问权限', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText('PRIVATE');
    await expect(page.locator('body')).not.toContainText('8000 基点');
    await page.goto('/sourcing');
    await expect(
      page.getByRole('button', { name: '新增采购需求' }),
    ).toHaveCount(0);
  }
});
test('390px multi-item form, candidate selection and detail are usable without page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/sourcing');
  await create(page);
  await addCandidate(page, '模拟渠道1');
  await assess(page, '模拟渠道1');
  await expect(
    page.getByTestId('sourcing-item-1').getByTestId('coverage-suitable'),
  ).toHaveText('1');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.getByTestId('sourcing-item-2')).toContainText('GPT 示例');
});
test('confirmed sourcing reset recovers incompatible data and preserves current channel resources', async ({
  page,
}) => {
  await page.goto('/sourcing');
  await create(page, false);
  await page.goto('/sourcing');
  await page
    .getByRole('button', { name: '重置寻源演示数据', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    '供应商、渠道、测试及报价数据保持原样',
  );
  await page.getByRole('button', { name: '确认重置寻源', exact: true }).click();
  await expect(page.getByTestId('metric-sourcing-total')).toContainText('2');
  await page.goto('/channels');
  await expect(page.getByTestId('metric-channel-total')).toContainText('7');
  await page.evaluate(() =>
    localStorage.setItem('maas-sourcing-demo-v1', '{"schemaVersion":99}'),
  );
  await page.goto('/sourcing');
  await expect(
    page.getByText(/寻源演示数据读取失败或版本不兼容/),
  ).toBeVisible();
  await page.getByRole('button', { name: '重置寻源演示数据' }).click();
  await page.getByRole('button', { name: '确认重置寻源' }).click();
  await expect(page.getByTestId('metric-sourcing-total')).toContainText('2');
});
