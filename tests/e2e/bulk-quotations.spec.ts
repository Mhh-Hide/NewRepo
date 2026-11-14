import { test, expect, type Page } from '@playwright/test';
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
async function create(page: Page) {
  await page.goto('/procurement/bulk-quotes');
  await page.getByRole('button', { name: '创建报价批次', exact: true }).click();
  await select(page, '创建批次供应商', '虚构供应商1');
  await page
    .getByLabel('共同来源模拟引用', { exact: true })
    .fill('mock:evidence:browser-bulk');
  await page
    .getByLabel('共同说明', { exact: true })
    .fill('模拟批量报价，仅供演示');
  await page.getByRole('button', { name: '创建草稿', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '编辑报价批次' }),
  ).toBeVisible();
}
async function row(page: Page, discount = '6200') {
  await page.getByRole('button', { name: '添加报价行', exact: true }).click();
  await page
    .getByRole('button', { name: '编辑行', exact: true })
    .last()
    .click();
  await select(page, '批次报价渠道', '模拟渠道1');
  await page.getByRole('spinbutton', { name: '行报价折扣' }).fill(discount);
  await page
    .getByLabel('供应商提交人模拟引用', { exact: true })
    .fill('mock:bulk-contact');
  await page.getByRole('button', { name: '保留行编辑' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function save(page: Page) {
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText('有未保存修改，请先保存草稿')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '预览校验', exact: true }),
  ).toBeEnabled();
}
async function preview(page: Page) {
  await page.getByRole('button', { name: '预览校验', exact: true }).click();
  await expect(page.getByText('逐行预览校验', { exact: true })).toBeVisible();
}
async function confirm(page: Page) {
  await page.getByRole('button', { name: '提交整批报价', exact: true }).click();
  await page
    .getByRole('checkbox', { name: '我确认这是模拟记录，并已核对所有报价行' })
    .check();
  await page
    .getByRole('button', { name: '确认追加整批报价', exact: true })
    .click();
}
test('operations creates multiple same-channel rows, reopens, previews, submits and follows structured history links', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await create(page);
  await row(page);
  await row(page);
  await save(page);
  const url = page.url();
  await page.getByRole('button', { name: '返回批次列表' }).click();
  await page.locator('a').filter({ hasText: 'MOCK-BATCH-' }).click();
  await expect(page).toHaveURL(url);
  await preview(page);
  await expect(page.getByText(/疑似完全重复报价/).first()).toBeVisible();
  await expect(page.getByText(/未选择参照报价/).first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: '提交整批报价', exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'harness/build/screenshots/stage-06b-1440.png',
    fullPage: true,
  });
  await confirm(page);
  await expect(
    page.getByRole('heading', { name: '已提交报价批次' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '保存草稿', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: /查看报价 mock-quote/ }),
  ).toHaveCount(2);
  await page
    .getByRole('link', { name: /查看报价 mock-quote/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: '采购报价详情' }),
  ).toBeVisible();
  await expect(page.getByText('来源报价批次：')).toBeVisible();
  await page.locator('a').filter({ hasText: 'MOCK-BATCH-' }).click();
  await page
    .getByRole('link', { name: '采购价格分析', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('heading', { name: '采购价格分析' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('procurement repairs row errors, submits and retains independent verification without formal-confirm permission', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await persona(page, '模拟Procurement');
  await create(page);
  await row(page, '10001');
  await save(page);
  await preview(page);
  await expect(page.getByText(/阻断 · 第 1 行 · discount/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: '提交整批报价', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '编辑行', exact: true }).click();
  await page.getByRole('spinbutton', { name: '行报价折扣' }).fill('6500');
  await page.getByRole('button', { name: '保留行编辑' }).click();
  await save(page);
  await preview(page);
  await confirm(page);
  await expect(
    page.getByRole('heading', { name: '已提交报价批次' }),
  ).toBeVisible();
  await page.getByRole('link', { name: /查看报价 mock-quote/ }).click();
  await expect(
    page.getByRole('button', { name: '核验报价来源', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '模拟正式确认', exact: true }),
  ).toHaveCount(0);
});
test('storage failure preserves draft and enables safe retry; submitted page remains read-only on reload', async ({
  page,
}) => {
  await create(page);
  await row(page);
  await save(page);
  await preview(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'maas-quote-demo-v1')
        throw new DOMException('Mock quota', 'QuotaExceededError');
      return original.call(this, k, v);
    };
  });
  await confirm(page);
  await expect(
    page.getByRole('dialog').getByText(/报价保存失败/),
  ).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '编辑报价批次' }),
  ).toBeVisible();
  await expect(page.getByText('6200 bps /')).toBeVisible();
  await page.reload();
  await preview(page);
  await confirm(page);
  await expect(
    page.getByRole('heading', { name: '已提交报价批次' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('link', { name: /查看报价 mock-quote/ }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: '提交整批报价', exact: true }),
  ).toHaveCount(0);
});
test('other tab draft edit invalidates preview and prevents stale save without losing input', async ({
  page,
  context,
}) => {
  await create(page);
  await row(page);
  await save(page);
  await preview(page);
  const other = await context.newPage();
  await other.goto(page.url());
  await other
    .getByLabel('共同说明（行可覆盖）')
    .fill('另一页面已保存的模拟新版本');
  await save(other);
  await expect(page.getByText(/其他页面数据已变化/)).toBeVisible();
  await expect(page.getByText('逐行预览校验', { exact: true })).toHaveCount(0);
  await page.getByLabel('共同说明（行可覆盖）').fill('本页未保存的模拟输入');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText(/批次版本已变化或已提交/)).toBeVisible();
  await expect(page.getByLabel('共同说明（行可覆盖）')).toHaveValue(
    '本页未保存的模拟输入',
  );
  await other.close();
});
test('testing and sales cannot access batch workbench, direct batch IDs or procurement navigation', async ({
  page,
}) => {
  await create(page);
  const url = page.url();
  for (const role of ['模拟Testing', '模拟Sales']) {
    await persona(page, role);
    await page.goto(url);
    await expect(
      page.getByText('当前身份无批量采购报价访问权限'),
    ).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: '批量采购报价' }),
    ).toHaveCount(0);
  }
});
test('390px draft, editor and preview fit viewport with local table scrolling', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page);
  await row(page);
  await save(page);
  await preview(page);
  await expect(
    page.getByRole('button', { name: '提交整批报价', exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'harness/build/screenshots/stage-06b-390.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: '编辑行', exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(errors).toEqual([]);
});
for (const width of [1440, 390]) {
  test(`${width}px: another tab submits while confirmation is open; stale confirmation refuses and restores the same receipt`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await create(page);
    await row(page);
    await save(page);
    await preview(page);
    const other = await context.newPage();
    await other.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    other.on('pageerror', (e) => errors.push(e.message));
    await other.goto(page.url());
    await preview(other);
    await other
      .getByRole('button', { name: '提交整批报价', exact: true })
      .click();
    const dialog = other.getByRole('dialog', { name: '确认整批提交模拟报价' });
    await dialog
      .getByRole('checkbox', { name: '我确认这是模拟记录，并已核对所有报价行' })
      .check();
    await confirm(page);
    await expect(
      page.getByRole('heading', { name: '已提交报价批次' }),
    ).toBeVisible();
    const quotes = page.getByRole('link', { name: /查看报价 mock-quote/ });
    await expect(quotes).toHaveCount(1);
    const href = await quotes.getAttribute('href');
    await expect(dialog.getByText(/其他页面数据已变化/)).toBeVisible();
    await dialog
      .getByRole('button', { name: '确认追加整批报价', exact: true })
      .click();
    await expect(
      dialog.getByText('预览已失效，请刷新批次并重新校验。', { exact: true }),
    ).toBeVisible();
    expect(
      await other.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await other.getByRole('button', { name: '刷新批次', exact: true }).click();
    await expect(
      other.getByRole('heading', { name: '已提交报价批次' }),
    ).toBeVisible();
    const restored = other.getByRole('link', { name: /查看报价 mock-quote/ });
    await expect(restored).toHaveCount(1);
    await expect(restored).toHaveAttribute('href', href!);
    await expect(
      other.getByRole('button', { name: '保存草稿', exact: true }),
    ).toHaveCount(0);
    expect(
      await other.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    await other.close();
  });
}
