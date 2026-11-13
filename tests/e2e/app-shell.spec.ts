import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function persona(page: Page, label: string) {
  const picker = page.getByRole('combobox', { name: '演示身份' });
  await picker.fill(label);
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: label })
    .click();
}
async function domain(page: Page, label: string) {
  await page.getByRole('combobox', { name: '业务域' }).click();
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: label })
    .click();
}
test('default dashboard, navigation and placeholder survive browser refresh', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId('metric-channels')).toContainText('7');
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
  await page.getByRole('menuitem', { name: /模型测试/ }).click();
  await expect(page).toHaveURL(/\/tests$/);
  await expect(
    page.getByRole('heading', { name: '模型测试', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('即将开放', { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '模型测试', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/规划阶段：07/)).toBeVisible();
});
test('domain filters change real metrics and single-domain identity cannot expand access', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId('metric-channels')).toContainText('7');
  await domain(page, '国内模型');
  await expect(page.getByTestId('metric-channels')).toContainText('5');
  await expect(page.getByTestId('metric-gaps')).toContainText('0');
  await domain(page, '海外模型');
  await expect(page.getByTestId('metric-channels')).toContainText('2');
  await persona(page, '产品运营 · 模拟国内运营');
  await expect(page.getByTestId('metric-channels')).toContainText('5');
  await page.getByRole('combobox', { name: '业务域' }).click();
  await expect(
    page
      .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
      .filter({ hasText: '海外模型' }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await persona(page, '产品运营 · 模拟海外运营');
  await expect(page.getByTestId('metric-channels')).toContainText('2');
});
test('role switches remove sensitive content and show relevant work', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page.getByText('采购报价摘要', { exact: true })).toBeVisible();
  await persona(page, '测试 · 模拟Testing');
  await expect(page.getByTestId('metric-quality')).toBeVisible();
  await expect(page.getByText('采购报价摘要', { exact: true })).toHaveCount(0);
  await expect(page.getByText('采购折扣（模拟）', { exact: true })).toHaveCount(
    0,
  );
  await persona(page, '运维 · 模拟OperationsSupport');
  await expect(page.getByTestId('metric-incidents')).toBeVisible();
  await expect(page.getByTestId('metric-quality')).toHaveCount(0);
  await expect(page.getByText('采购报价摘要', { exact: true })).toHaveCount(0);
  await persona(page, '供应商 · 模拟SupplierUser');
  await expect(page.getByTestId('metric-channels')).toContainText('3');
  await expect(
    page.getByText('虚构供应商2（模拟）', { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('metric-channels')).toContainText('3');
  await persona(page, '销售 · 模拟Sales');
  await expect(page.getByTestId('metric-demands')).toContainText('1');
  await expect(page.getByTestId('metric-suppliers')).toHaveCount(0);
  await expect(page.getByText(/虚构供应商/)).toHaveCount(0);
  await expect(
    page.getByText('模拟匿名渠道 DEMO-ch-1', { exact: true }),
  ).toBeVisible();
});
test('empty scope, route guard, collapsed sidebar and small screen are usable', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await persona(page, '产品运营 · 模拟未授权运营');
  await expect(
    page.getByText('当前演示身份及业务域暂无授权数据'),
  ).toBeVisible();
  await persona(page, '销售 · 模拟Sales');
  await page.getByRole('button', { name: '收起导航' }).click();
  await expect(page.getByRole('button', { name: '展开导航' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '展开导航' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('menuitem', { name: /模型资源池/ })
    .click();
  await expect(
    page.getByRole('heading', { name: '模型资源池', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/suppliers');
  await persona(page, '销售 · 模拟Sales');
  await expect(page.getByText('当前演示身份无此模块访问权限')).toBeVisible();
});
