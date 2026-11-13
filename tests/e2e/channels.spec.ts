import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function select(page: Page, label: string, option: string) {
  const control = page.getByRole('combobox', { name: label, exact: true });
  await control.click();
  const item = page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: option });
  await item.hover();
  await expect(item).toHaveClass(/ant-select-item-option-active/);
  await control.press('Enter');
  await expect(control).toHaveAttribute('aria-expanded', 'false');
}
async function create(page: Page, name = '虚构渠道浏览器验收') {
  await page.getByRole('button', { name: '新增渠道', exact: true }).click();
  await select(page, '渠道供应商', '虚构供应商1');
  await select(page, '渠道模型', 'Seedance 示例国内版');
  await page.getByRole('textbox', { name: /渠道展示名称$/ }).fill(name);
  await page.getByRole('button', { name: '保存渠道', exact: true }).click();
  await expect(page).toHaveURL(/\/channels\/mock-channel-/);
  await expect(
    page.getByRole('heading', { name: '渠道详情', exact: true }),
  ).toBeVisible();
}
async function bind(page: Page, op: string) {
  await page
    .getByRole('button', { name: '模拟 OP ID 绑定', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: '模拟 OP ID 绑定',
    exact: true,
  });
  await dialog
    .getByRole('textbox', { name: '模拟 OP 渠道 ID', exact: true })
    .fill(op);
  await dialog.getByRole('button', { name: '预览绑定', exact: true }).click();
  await expect(dialog).toContainText('绑定前');
  await expect(dialog).toContainText('绑定后');
  await dialog
    .getByRole('button', { name: '确认模拟绑定', exact: true })
    .click();
}
test('operations creates, edits, persists, navigates and synchronizes all resource views', async ({
  page,
}) => {
  await page.goto('/channels');
  await expect(
    page.getByRole('heading', { name: '渠道管理', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('metric-channel-total')).toContainText('7');
  await create(page);
  const url = page.url();
  await page
    .getByRole('link', { name: 'Seedance 示例国内版', exact: true })
    .click();
  await expect(page.getByTestId('metric-model-channels')).toContainText('5');
  await expect(
    page.getByRole('link', { name: '虚构渠道浏览器验收', exact: true }),
  ).toBeVisible();
  await page.goto(url);
  await page.getByRole('link', { name: /虚构供应商1/ }).click();
  await expect(page.locator('.supplier-resource-stats strong')).toHaveText([
    '2',
    '4',
  ]);
  await page.goto('/dashboard');
  await expect(page.getByTestId('metric-channels')).toContainText('8');
  await expect(page.getByTestId('metric-quality')).toContainText('5');
  await expect(page.getByTestId('metric-connectivity')).toContainText('7');
  await page.goto(url);
  await page.getByRole('button', { name: '编辑基础信息', exact: true }).click();
  await page
    .getByRole('spinbutton', { name: 'TPM', exact: true })
    .fill('987654');
  await page.getByRole('spinbutton', { name: 'RPM', exact: true }).fill('1.5');
  await page.getByRole('button', { name: '保存渠道', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '编辑渠道' })).toContainText(
    'TPM/RPM/并发须为非负整数',
  );
  await expect(
    page.getByRole('spinbutton', { name: 'RPM', exact: true }),
  ).toHaveValue('1.5');
  await page.getByRole('spinbutton', { name: 'RPM', exact: true }).fill('456');
  await page.getByRole('button', { name: '保存渠道', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '编辑渠道' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('987,654', { exact: true })).toBeVisible();
  await expect(page.getByText('456', { exact: true })).toBeVisible();
  await page.goto('/models/m-seed-cn');
  await expect(
    page.getByRole('row').filter({ hasText: '虚构渠道浏览器验收' }),
  ).toContainText('987,654');
  await page.goto('/channels');
  await expect(page.getByTestId('metric-channel-total')).toContainText('8');
  await page
    .getByRole('textbox', { name: '渠道名称或匿名代号' })
    .fill('虚构渠道浏览器验收');
  await expect(page.locator('.ant-table-tbody tr.ant-table-row')).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: '重置筛选' }).click();
  await expect(page.locator('.ant-table-tbody tr.ant-table-row')).toHaveCount(
    8,
  );
});
test('OP binding previews, persists independently and reports global duplicate conflict', async ({
  page,
}) => {
  await page.goto('/channels');
  await create(page, '虚构绑定渠道一');
  const first = page.url();
  await bind(page, 'MOCK-browser-unique');
  await expect(
    page.getByRole('dialog', { name: '模拟 OP ID 绑定', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('MOCK-browser-unique', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '模拟 OP ID 绑定', exact: true }),
  ).toBeDisabled();
  await expect(page.getByText('未接入', { exact: true })).toBeVisible();
  await expect(
    page.locator('.resource-detail-grid').getByText('未开放', { exact: true }),
  ).toBeVisible();
  await page.goto('/channels');
  await create(page, '虚构绑定渠道二');
  await bind(page, 'MOCK-browser-unique');
  await expect(page.getByRole('dialog')).toContainText('OP 渠道 ID 冲突');
  await expect(page.getByRole('dialog')).toContainText('MOCK-browser-unique');
  await page.goto(first);
  await page.getByRole('button', { name: '停用资源主档', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /确.*定/ })
    .click();
  await expect(
    page.getByRole('button', { name: '启用资源主档', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('未接入', { exact: true })).toBeVisible();
});
test('switching roles removes writes, supplier identity and OP details', async ({
  page,
}) => {
  await page.goto('/channels/ch-2');
  await page.getByRole('button', { name: '编辑基础信息' }).click();
  await page
    .getByRole('dialog', { name: '编辑渠道' })
    .getByRole('button', { name: /取.*消/ })
    .click();
  await page.getByRole('combobox', { name: '演示身份' }).fill('模拟Sales');
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '模拟Sales' })
    .click();
  await expect(
    page.getByRole('heading', { name: '渠道只读详情' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '编辑基础信息' })).toHaveCount(
    0,
  );
  await expect(page.getByText('OP 渠道 ID', { exact: true })).toHaveCount(0);
  await page.goto('/channels');
  await expect(page.getByRole('button', { name: '新增渠道' })).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: '供应商', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: 'OP 绑定', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.ant-table-tbody')).not.toContainText(
    '虚构供应商',
  );
});
test('1440, 1280 and 390px channel forms and detail remain usable', async ({
  page,
}) => {
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/channels');
    await expect(
      page.getByRole('heading', { name: '渠道管理', exact: true }),
    ).toBeVisible();
    await create(page, `虚构窄屏渠道${width}`);
    await page.getByRole('button', { name: '编辑基础信息' }).click();
    await page
      .getByRole('spinbutton', { name: 'TPM', exact: true })
      .fill('123');
    await page.getByRole('button', { name: '保存渠道', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '编辑渠道' })).toHaveCount(0);
    await expect(page.getByText('123', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
test('confirmed channel reset preserves suppliers; incompatible storage has explicit recovery', async ({
  page,
}) => {
  await page.goto('/channels');
  await create(page);
  await page.goto('/channels');
  await page
    .getByRole('button', { name: '重置渠道演示数据', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('保留供应商主档');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '确认重置渠道', exact: true })
    .click();
  await expect(page.getByTestId('metric-channel-total')).toContainText('7');
  await page.evaluate(() =>
    localStorage.setItem('maas-channel-demo-v1', '{"schemaVersion":99}'),
  );
  await page.reload();
  await expect(
    page.getByText(/渠道演示数据读取失败或版本不兼容/),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '重置渠道演示数据', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '确认重置渠道', exact: true })
    .click();
  await expect(page.getByTestId('metric-channel-total')).toContainText('7');
});
