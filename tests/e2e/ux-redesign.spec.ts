import { test, expect } from '@playwright/test';

test('compact workspace and business test filters use linked service records', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/dashboard');
  await expect(page.getByTestId('metric-channels')).toContainText('7');
  await expect(page.locator('.home-stats .stat-card')).toHaveCount(4);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(1500);
  await page.getByRole('link', { name: /模型测试/ }).click();
  const select = page.getByRole('combobox', { name: '测试进度筛选' });
  for (const label of ['测试通过', '测试失败']) {
    await select.click();
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option')
      .filter({ hasText: label })
      .click();
    const rows = page.locator('.testing-task-table tbody tr.ant-table-row');
    await expect.poll(() => rows.count()).toBeGreaterThan(0);
    for (const row of await rows.all())
      await expect(row).toContainText(label === '测试通过' ? '通过' : '失败');
  }
  await page.goto('/channels');
  await page
    .getByRole('textbox', { name: '搜索模型、渠道或供应商' })
    .fill('no-such-resource');
  await expect(
    page.locator('.ant-empty-description').filter({ hasText: '暂无数据' }),
  ).toBeVisible();
  await page.goto('/sourcing');
  await expect(
    page.getByRole('columnheader', { name: '采购负责人', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: '需求截止时间', exact: true }),
  ).toBeVisible();
  const response = await page.request.get('/__local_business_data');
  expect(response.status()).toBe(204);
});
