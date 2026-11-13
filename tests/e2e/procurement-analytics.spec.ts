import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function select(page: Page, name: string | RegExp, label: string) {
  const combo = page.getByRole('combobox', { name, exact: true });
  await combo.click();
  const id = await combo.getAttribute('aria-controls');
  const dropdown = page
    .locator('.ant-select-dropdown')
    .filter({ has: page.locator(`[id="${id}"]`) });
  const option = dropdown
    .locator('.ant-select-item-option')
    .filter({ hasText: label });
  await option.hover();
  await expect(option).toHaveClass(/ant-select-item-option-active/);
  await combo.press('Enter');
}
async function createTextQuote(page: Page, discount: string) {
  await page.goto('/quotes');
  await page.getByRole('button', { name: '录入采购报价', exact: true }).click();
  await select(page, '报价渠道选择', '模拟渠道5');
  const d = page.getByRole('dialog', { name: '录入采购报价', exact: true });
  await d.getByRole('spinbutton', { name: /上游实际报价折扣/ }).fill(discount);
  await d
    .getByRole('textbox', { name: /供应商原始提交人引用$/ })
    .fill('mock:demo-contact');
  await d
    .getByRole('textbox', { name: '币种（可未知）', exact: true })
    .fill('CNY');
  await d
    .getByRole('textbox', { name: '折扣价格基准（可未知）', exact: true })
    .fill('mock:analysis-reference');
  await d
    .getByRole('textbox', { name: '适用规格（可未知）', exact: true })
    .fill('模拟文本输入规格，非官方价格');
  await d.getByRole('button', { name: '添加计价维度' }).click();
  await select(page, /维度 1 类型$/, '输入 Token');
  await d
    .getByRole('textbox', { name: '维度 1 绝对单价（可未知）', exact: true })
    .fill('0.123456');
  await d
    .getByRole('spinbutton', { name: /维度 1 每份计量数量$/ })
    .fill('1000000');
  await d.getByRole('textbox', { name: /维度 1 计量单位$/ }).fill('Token');
  await d
    .getByRole('textbox', { name: /报价证据模拟引用$/ })
    .fill('mock:analysis-evidence');
  await d
    .getByRole('textbox', { name: /报价来源说明与备注$/ })
    .fill('模拟供应商文本报价，用于分析演示，非真实商业数据。');
  await d.getByRole('button', { name: '保存报价记录', exact: true }).click();
  await expect(page).toHaveURL(/\/quotes\/mock-quote-/);
  await expect(
    page.getByRole('heading', { name: '采购报价详情' }),
  ).toBeVisible();
}
test('operations compares authorized same-model channels, inspects unavailable trend and promotion reminders', async ({
  page,
}) => {
  await page.goto('/analytics/procurement');
  await expect(
    page.getByRole('heading', { name: '采购价格分析', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('metric-analysis-channels')).toContainText('3');
  await expect(
    page.getByText('七天内到期，待人工跟进', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('同基准可比性未确认', { exact: true }),
  ).toBeVisible();
  await select(page, '分析模型', 'Seedance 示例国内版');
  await select(page, '分析比较基准报价', 'q-1 ·');
  await expect(page.getByText(/无法比较：币种未提供/).first()).toBeVisible();
  await page
    .getByRole('button', { name: '查看渠道趋势', exact: true })
    .first()
    .click();
  await expect(
    page.getByText(/信息不足，无法比较（币种未提供/).first(),
  ).toBeVisible();
  await expect(page.getByText(/没有至少两条同口径的非纠错记录/)).toBeVisible();
  await page.goto('/analysis/purchase');
  await expect(page).toHaveURL(/\/analytics\/procurement/);
  await page.goto('/dashboard');
  await page.getByRole('link', { name: '七天内到期优惠开发计划' }).click();
  await expect(
    page.getByRole('heading', { name: '采购价格分析', exact: true }),
  ).toBeVisible();
});
test('new quotes refresh analysis immediately and comparable text records produce a channel trend', async ({
  page,
}) => {
  await page.goto('/analytics/procurement');
  await expect(page.getByTestId('analysis-reference')).toContainText('2');
  await createTextQuote(page, '6000');
  await page.goto('/analytics/procurement');
  await page.getByRole('button', { name: '刷新分析', exact: true }).click();
  await expect(page.getByTestId('analysis-reference')).toContainText('3');
  await createTextQuote(page, '5800');
  await page.goto('/analytics/procurement');
  await select(page, '分析模型', 'GPT 示例');
  await select(page, '趋势渠道', '模拟渠道5');
  await expect(
    page.getByRole('img', { name: '渠道报价折扣历史趋势', exact: true }),
  ).toBeVisible();
  const chart = page.getByRole('img', {
    name: '渠道报价折扣历史趋势',
    exact: true,
  });
  await expect(chart.locator('polyline')).toHaveCount(1);
  await expect(chart.locator('circle')).toHaveCount(2);
  await page.reload();
  await expect(page.getByTestId('analysis-reference')).toContainText('4');
  await select(page, '趋势时间轴', '供应商报价时间');
  await expect(
    page.getByText(/供应商报价时间缺失或异常/).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: '渠道报价折扣历史趋势', exact: true }),
  ).toHaveCount(0);
});
test('testing and sales cannot access analysis or receive prices through navigation', async ({
  page,
}) => {
  await page.goto('/analytics/procurement');
  for (const label of ['模拟Testing', '模拟Sales']) {
    await page.getByRole('combobox', { name: '演示身份' }).fill(label);
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option')
      .filter({ hasText: label })
      .click();
    await expect(
      page.getByText('当前身份无采购价格分析权限', { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('metric-analysis-channels')).toHaveCount(0);
    await expect(
      page.getByRole('img', { name: '渠道报价折扣历史趋势', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('menuitem', { name: '采购价格分析', exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByText('当前身份无采购价格分析权限', { exact: true }),
    ).toBeVisible();
  }
});
test('1440, 1280 and 390px analysis filters, comparisons and historical tables stay usable', async ({
  page,
}) => {
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/analytics/procurement');
    await select(page, '分析模型', 'Seedance 示例国内版');
    await select(page, '分析比较基准报价', 'q-1 ·');
    await expect(page.getByText(/无法比较：币种未提供/).first()).toBeVisible();
    await page.getByRole('button', { name: '刷新分析', exact: true }).click();
    await expect(page.getByTestId('metric-analysis-models')).toContainText('1');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole('button', { name: '重置分析筛选', exact: true })
      .click();
    await expect(page.getByTestId('metric-analysis-models')).toContainText('2');
  }
});
