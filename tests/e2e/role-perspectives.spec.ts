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
async function roles(page: Page) {
  await page.goto('/system/roles');
  await expect(
    page.getByRole('heading', { name: '角色视角与权限说明' }),
  ).toBeVisible();
}
test('八角色、采购摘要预览、自动切换测试身份体验并由菜单返回', async ({
  page,
}) => {
  await roles(page);
  await expect(page.locator('[data-testid^="role-card-"]')).toHaveCount(8);
  await page.getByTestId('role-card-Procurement').click();
  await expect(page.getByTestId('roles-current-user')).toHaveText(
    '模拟ProductOperations',
  );
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '模型测试', exact: true }) });
  await expect(row).toContainText('仅摘要');
  await expect(row).not.toContainText('采纳测试结论');
  await page.getByTestId('role-card-Testing').click();
  await page.getByRole('button', { name: '体验模型测试', exact: true }).click();
  await expect(page).toHaveURL(/\/tests$/);
  await expect(page.locator('.topbar-controls')).toContainText(
    '测试 · 模拟Testing',
  );
  await expect(
    page.getByRole('button', { name: '新建测试任务' }),
  ).toBeVisible();
  await page.getByRole('menuitem', { name: /角色视角/ }).click();
  await expect(page.getByTestId('roles-current-user')).toHaveText(
    '模拟Testing',
  );
  await expect(page.getByTestId('role-card-Testing')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const remediation = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '整改管理', exact: true }) });
  await expect(remediation).not.toContainText('正常或例外关闭');
});
test('销售真实体验保留匿名渠道和权限拒绝，深链接刷新身份恢复', async ({
  page,
}) => {
  await roles(page);
  await page.getByTestId('role-card-Sales').click();
  await expect(
    page.getByRole('button', { name: '体验供应商管理' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '体验采购报价管理' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '体验渠道管理', exact: true }).click();
  await expect(page).toHaveURL(/\/channels$/);
  await expect(page.locator('.topbar-controls')).toContainText(
    '销售 · 模拟Sales',
  );
  await expect(page.locator('main')).not.toContainText('虚构供应商');
  await expect(page.locator('main')).not.toContainText('采购折扣');
  await page.goto('/remediations');
  await expect(page.getByText('无整改访问权限')).toBeVisible();
  await roles(page);
  await page.reload();
  await expect(page.getByTestId('roles-current-user')).toHaveText('模拟Sales');
  await expect(page.getByTestId('role-card-Sales')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
test('多身份选择、单域/双域切换、无授权空状态与刷新恢复', async ({ page }) => {
  await roles(page);
  await select(page, '角色对应模拟用户', '模拟国内运营');
  await page.getByRole('button', { name: '切换到此身份' }).click();
  await expect(page.getByTestId('roles-current-domain')).toHaveText('国内模型');
  await page.getByRole('combobox', { name: '角色页业务域' }).click();
  await expect(page.locator('.ant-select-dropdown:visible')).not.toContainText(
    '海外模型',
  );
  await page.keyboard.press('Escape');
  await select(page, '角色对应模拟用户', '模拟海外运营');
  await page.getByRole('button', { name: '切换到此身份' }).click();
  await expect(page.getByTestId('roles-current-domain')).toHaveText('海外模型');
  await select(page, '角色对应模拟用户', '模拟ProductOperations');
  await page.getByRole('button', { name: '切换到此身份' }).click();
  await select(page, '角色页业务域', '海外模型');
  await expect(page.getByTestId('roles-current-domain')).toHaveText('海外模型');
  await expect(page.locator('.topbar-controls')).toContainText('海外模型');
  await page.reload();
  await expect(page.getByTestId('roles-current-domain')).toHaveText('海外模型');
  await select(page, '角色对应模拟用户', '模拟未授权运营');
  await page.getByRole('button', { name: '切换到此身份' }).click();
  await expect(page.getByTestId('roles-current-domain')).toHaveText(
    '暂无业务域授权',
  );
  await expect(
    page.getByRole('combobox', { name: '角色页业务域' }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: '体验整改管理' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: '体验空工作台' }).click();
  await expect(
    page.getByText('当前演示身份及业务域暂无授权数据'),
  ).toBeVisible();
});
for (const width of [1440, 390])
  test(`${width}px 权限矩阵、键盘操作与真实截图`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await roles(page);
    const testing = page.getByTestId('role-card-Testing');
    await testing.focus();
    await page.keyboard.press('Enter');
    await expect(testing).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('row').filter({
        has: page.getByRole('cell', { name: '供应商治理', exact: true }),
      }),
    ).toContainText('未开放');
    await expect(
      page.getByRole('button', { name: '体验供应商治理' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: '切换到此身份' }).click();
    await expect(page.getByTestId('roles-current-user')).toHaveText(
      '模拟Testing',
    );
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `harness/build/screenshots/stage-07c-roles-${width}.png`,
      fullPage: true,
    });
  });
test('顶部切换与页面共用身份、返回不残留旧预览', async ({ page }) => {
  await roles(page);
  await page.getByTestId('role-card-Procurement').click();
  await page
    .getByRole('combobox', { name: '演示身份', exact: true })
    .fill('模拟Sales');
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '模拟Sales' })
    .click();
  await expect(page.getByTestId('roles-current-user')).toHaveText('模拟Sales');
  await expect(page.getByTestId('role-card-Sales')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('身份预览，尚未切换')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '体验采购报价管理' }),
  ).toHaveCount(0);
});
