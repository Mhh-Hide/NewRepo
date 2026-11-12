import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function persona(page: Page, label: string) {
  await page.getByRole('combobox', { name: '演示身份' }).fill(label);
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: label })
    .click();
}
async function owner(page: Page, name: string) {
  const select = page.getByRole('combobox', { name: /主要采购负责人$/ });
  await select.click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: name })
    .click();
  await expect(select).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.locator('.ant-form-item').filter({ has: select }),
  ).toContainText(name);
}
async function create(page: Page) {
  await page.getByRole('button', { name: '新增供应商', exact: true }).click();
  await page
    .getByRole('textbox', { name: /供应商名称$/ })
    .fill('虚构星河算力（模拟）');
  await page.getByRole('textbox', { name: /内部缩写$/ }).fill('MOCK-STAR');
  await owner(page, '模拟Procurement');
  await page
    .getByRole('textbox', { name: '主要联系人', exact: true })
    .fill('模拟联系人小林');
  await page
    .getByRole('textbox', { name: '联系人邮箱', exact: true })
    .fill('contact@example.invalid');
  await page.getByRole('button', { name: '保存供应商', exact: true }).click();
  await expect(page).toHaveURL(/\/suppliers\/mock-supplier-/);
}
test('operations creates, immediately reads, edits and restores a no-channel supplier after refresh', async ({
  page,
}) => {
  await page.goto('/suppliers');
  await create(page);
  const url = page.url();
  await expect(page.locator('.sidebar .ant-menu-item-selected')).toContainText(
    '供应商管理',
  );
  await expect(page.locator('.supplier-profile-title')).toContainText(
    '虚构星河算力（模拟）',
  );
  expect(
    await page.locator('.supplier-resource-stats strong').allTextContents(),
  ).toEqual(['0', '0']);
  await page.getByRole('button', { name: '返回供应商列表' }).click();
  await expect(
    page.getByRole('link', { name: '虚构星河算力（模拟）', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('metric-supplier-total')).toContainText('4');
  await page
    .getByRole('link', { name: '虚构星河算力（模拟）', exact: true })
    .click();
  await page
    .locator('.supplier-profile')
    .getByRole('button', { name: '编辑资料', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: /供应商名称$/ })
    .fill('虚构星河算力更新（模拟）');
  await page
    .getByRole('textbox', { name: '联系人邮箱', exact: true })
    .fill('updated@example.invalid');
  await page.getByRole('button', { name: '保存供应商', exact: true }).click();
  await expect(page.locator('.supplier-profile-title')).toContainText(
    '虚构星河算力更新（模拟）',
  );
  await expect(page).toHaveURL(url);
  await page.reload();
  await expect(page.locator('.supplier-profile-title')).toContainText(
    '虚构星河算力更新（模拟）',
  );
  await expect(
    page.getByText('编辑资料', { exact: true }).first(),
  ).toBeVisible();
  await persona(page, '采购 · 模拟Procurement');
  await expect(
    page.getByRole('button', { name: '编辑资料', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '停用供应商' })).toHaveCount(0);
  await expect(page.getByText('客户售价', { exact: true })).toHaveCount(0);
  await persona(page, '销售 · 模拟Sales');
  await expect(page.getByText('当前演示身份无此模块访问权限')).toBeVisible();
  await expect(
    page.getByText('虚构星河算力更新（模拟）', { exact: true }),
  ).toHaveCount(0);
});
test('owner reassignment changes procurement maintenance permission', async ({
  page,
}) => {
  await page.goto('/suppliers/s-1');
  await page
    .locator('.supplier-profile')
    .getByRole('button', { name: '编辑资料', exact: true })
    .click();
  await owner(page, '模拟采购乙');
  await page.getByRole('button', { name: '保存供应商', exact: true }).click();
  await expect(
    page.getByText('供应商资料已保存。', { exact: true }),
  ).toBeVisible();
  await persona(page, '采购 · 模拟Procurement');
  await expect(page.getByText('供应商不存在或无权访问')).toBeVisible();
  await persona(page, '采购 · 模拟采购乙');
  await expect(page.locator('.supplier-profile-title')).toContainText(
    '虚构供应商1（模拟）',
  );
  await page
    .locator('.supplier-profile')
    .getByRole('button', { name: '编辑资料', exact: true })
    .click();
  await expect(
    page.getByRole('combobox', { name: /主要采购负责人$/ }),
  ).toBeDisabled();
  await page.getByRole('button', { name: /^取\s*消$/ }).click();
});
test('status confirmation preserves linked channels and supports restoration', async ({
  page,
}) => {
  await page.goto('/suppliers/s-1');
  const counts = await page.locator('.supplier-resource-stats').innerText();
  await page.getByRole('button', { name: '停用供应商' }).click();
  await expect(
    page.getByText(/历史报价、渠道、测试及事件记录不会删除/),
  ).toBeVisible();
  await page.getByRole('button', { name: /^确\s*认$/ }).click();
  await expect(page.getByRole('button', { name: '启用供应商' })).toBeVisible();
  expect(await page.locator('.supplier-resource-stats').innerText()).toBe(
    counts,
  );
  await page.reload();
  await expect(page.getByRole('button', { name: '启用供应商' })).toBeVisible();
  await page.getByRole('button', { name: '启用供应商' }).click();
  await page.getByRole('button', { name: /^确\s*认$/ }).click();
  await expect(page.getByRole('button', { name: '停用供应商' })).toBeVisible();
});
test('storage error is understandable and confirmed reset recovers the fixture', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'maas-supplier-demo-v1',
      JSON.stringify({ schemaVersion: 99 }),
    );
  });
  await page.goto('/suppliers');
  await expect(page.getByText(/演示数据损坏或版本不兼容/)).toBeVisible();
  await page.getByRole('button', { name: '重置演示数据', exact: true }).click();
  await page.getByRole('button', { name: '确认重置', exact: true }).click();
  await expect(page.getByTestId('metric-supplier-total')).toContainText('3');
});
test('supplier list and detail fit desktop and mobile widths', async ({
  page,
}) => {
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/suppliers');
    await expect(page.getByTestId('metric-supplier-total')).toContainText('3');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    ).toBe(true);
    await page.goto('/suppliers/s-1');
    await expect(page.locator('.supplier-profile-title')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    ).toBe(true);
  }
});
test('failed local persistence keeps the editor open and never reports creation success', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'maas-supplier-demo-v1')
        throw new DOMException('Mock quota failure', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/suppliers');
  await page.getByRole('button', { name: '新增供应商', exact: true }).click();
  await page
    .getByRole('textbox', { name: /供应商名称$/ })
    .fill('虚构存储失败样例');
  await page.getByRole('textbox', { name: /内部缩写$/ }).fill('MOCK-FAIL');
  await owner(page, '模拟Procurement');
  await page.getByRole('button', { name: '保存供应商', exact: true }).click();
  await expect(
    page.getByText('演示数据保存失败，请检查浏览器存储空间和权限后重试。'),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: '新增供应商', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/suppliers$/);
  await expect(page.getByText('供应商已创建（模拟数据）。')).toHaveCount(0);
});
