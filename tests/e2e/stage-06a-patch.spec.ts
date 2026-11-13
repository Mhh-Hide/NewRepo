import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function select(page: Page, name: string, label: string) {
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
  await expect(combo).toHaveAttribute('aria-expanded', 'false');
}
test('1440 and 390px distinguish all active formal prices, confirmed history and absence without fallback', async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date('2026-11-13T08:00:00Z'));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/analytics/procurement');
    await select(page, '分析模型', 'Seedance 示例国内版');
    await select(page, '分析比较基准报价', 'q-1 ·');
    await expect(
      page.getByText(/查询时刻有效性：基准有效期内；此报价有效期内/).first(),
    ).toBeVisible();
    const history = page.getByTestId('channel-formal-history-ch-1');
    await history.scrollIntoViewIfNeeded();
    await expect(history).toContainText('已确认历史');
    const current = page.getByTestId('channel-current-formals-ch-1');
    await current.scrollIntoViewIfNeeded();
    await expect(current).toContainText('2 条当前有效正式报价');
    await expect(
      current.getByRole('link', { name: /查看正式报价/ }),
    ).toHaveCount(2);
    await expect(current).toContainText('不选择唯一结算价');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`patch-${width}.png`) });
    const noFormal = page.getByTestId('channel-current-formals-ch-2');
    await noFormal.scrollIntoViewIfNeeded();
    await expect(noFormal).toHaveText('暂无当前有效正式报价');
    await expect(page.getByTestId('channel-formal-history-ch-2')).toHaveText(
      '无已确认正式历史报价',
    );
    await expect(
      page.getByText('当前有效优惠 1 条（不覆盖正式价）', { exact: true }),
    ).toBeVisible();
  }
});
test('confirmed future price activates at start and expires at exclusive end without replacing history', async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date('2026-11-13T08:00:00Z'));
  await page.goto('/quotes');
  await page.getByRole('button', { name: '录入采购报价', exact: true }).click();
  await select(page, '报价渠道选择', '模拟渠道3');
  const d = page.getByRole('dialog', { name: '录入采购报价', exact: true });
  await d.getByRole('spinbutton', { name: /上游实际报价折扣/ }).fill('6500');
  await d
    .getByRole('textbox', { name: /供应商原始提交人引用$/ })
    .fill('mock:supplier');
  await d.getByLabel(/生效日期（北京时间00:00）$/).fill('2026-11-16');
  await d.getByLabel(/截止日期（北京时间00:00，不含）$/).fill('2026-11-18');
  await d
    .getByRole('textbox', { name: /报价证据模拟引用$/ })
    .fill('mock:future-price');
  await d
    .getByRole('textbox', { name: /报价来源说明与备注$/ })
    .fill('模拟未来生效报价，用于时间边界验收');
  await d.getByRole('button', { name: '保存报价记录', exact: true }).click();
  await expect(page).toHaveURL(/\/quotes\/mock-quote-/);
  const quoteId = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: '核验报价来源', exact: true }).click();
  const verification = page.getByRole('dialog', {
    name: '核验报价来源',
    exact: true,
  });
  await verification
    .getByRole('textbox', { name: '核验或确认依据模拟引用', exact: true })
    .fill('mock:verify');
  await verification
    .getByRole('textbox', { name: '核验或确认说明', exact: true })
    .fill('模拟核验');
  await verification.getByRole('button', { name: '确认来源核验' }).click();
  await expect(verification).toHaveCount(0);
  await page.getByRole('button', { name: '模拟正式确认', exact: true }).click();
  const confirmation = page.getByRole('dialog', {
    name: '模拟正式确认',
    exact: true,
  });
  await confirmation
    .getByRole('textbox', { name: '核验或确认依据模拟引用', exact: true })
    .fill('mock:confirm');
  await confirmation
    .getByLabel('正式生效日期（北京时间00:00）')
    .fill('2026-11-16');
  await confirmation
    .getByRole('textbox', { name: '核验或确认说明', exact: true })
    .fill('模拟确认未来生效，不代表当前可执行采购');
  await confirmation
    .getByRole('checkbox', { name: '我确认这是模拟动作，不代表真实合同签署' })
    .check();
  await confirmation.getByRole('button', { name: '确认模拟正式生效' }).click();
  await expect(confirmation).toHaveCount(0);
  async function inspect(state: string, active: boolean) {
    await page.goto('/analytics/procurement');
    await select(page, '分析模型', 'Seedance 示例国内版');
    const history = page.getByTestId('channel-formal-history-ch-3'),
      current = page.getByTestId('channel-current-formals-ch-3');
    await expect(history).toContainText(`查询时刻：${state}`);
    if (active)
      await expect(
        current.getByRole('link', { name: '6500 基点 · 查看正式报价' }),
      ).toHaveCount(1);
    else await expect(current).toHaveText('暂无当前有效正式报价');
    await select(page, '分析比较基准报价', `${quoteId} ·`);
    await expect(
      page
        .getByRole('row')
        .filter({ has: history })
        .getByText(`查询时刻有效性：基准${state}；此报价${state}`, {
          exact: true,
        }),
    ).toBeVisible();
    await expect(
      page
        .getByText(
          '历史口径可比不等于当前可执行采购价格；时间有效也不替代正式依据与渠道准入核实。',
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    await expect(history.getByRole('link')).toHaveAttribute(
      'href',
      `/quotes/${quoteId}`,
    );
  }
  await inspect('尚未生效', false);
  await page.clock.setFixedTime(new Date('2026-11-16T00:00:00+08:00'));
  await inspect('有效期内', true);
  await page.clock.setFixedTime(new Date('2026-11-18T00:00:00+08:00'));
  await inspect('已到期', false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByTestId('channel-formal-history-ch-3')
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('patch-expired-1440.png') });
});
