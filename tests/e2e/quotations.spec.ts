import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
const date = (offset = 0) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
async function select(page: Page, name: string | RegExp, label: string) {
  const c = page.getByRole('combobox', { name, exact: true });
  await c.click();
  const controls = await c.getAttribute('aria-controls');
  const dropdown = page
    .locator('.ant-select-dropdown')
    .filter({ has: page.locator(`[id="${controls}"]`) });
  const o = dropdown
    .locator('.ant-select-item-option')
    .filter({ hasText: label });
  await o.hover();
  await expect(o).toHaveClass(/ant-select-item-option-active/);
  await c.press('Enter');
  await expect(c).toHaveAttribute('aria-expanded', 'false');
}
async function persona(page: Page, label: string) {
  await page.getByRole('combobox', { name: '演示身份' }).fill(label);
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: label })
    .click();
}
async function form(
  page: Page,
  {
    discount = '6000',
    promo = false,
    correction = false,
    price = false,
  }: {
    discount?: string;
    promo?: boolean;
    correction?: boolean;
    price?: boolean;
  } = {},
) {
  const d = page.getByRole('dialog', {
    name: correction ? '更正历史报价' : '录入采购报价',
    exact: true,
  });
  await d.getByRole('spinbutton', { name: /上游实际报价折扣/ }).fill(discount);
  if (!correction && !promo)
    await d
      .getByRole('textbox', { name: /供应商原始提交人引用$/ })
      .fill('mock:supplier:source');
  if (promo) {
    await select(page, '原始报价来源', '临时优惠');
    await d.getByLabel(/生效日期（北京时间00:00）$/).fill(date(-1));
    await d.getByLabel(/截止日期（北京时间00:00，不含）$/).fill(date(3));
  }
  if (price) {
    await d
      .getByRole('textbox', { name: '币种（可未知）', exact: true })
      .fill('CNY');
    await d
      .getByRole('textbox', { name: '折扣价格基准（可未知）', exact: true })
      .fill('mock:shared-catalog');
    await d
      .getByRole('textbox', { name: '适用规格（可未知）', exact: true })
      .fill('mock:same-spec');
    await d.getByRole('button', { name: '添加计价维度' }).click();
    await select(page, /维度 1 类型$/, '输入 Token');
    await d
      .getByRole('textbox', { name: '维度 1 绝对单价（可未知）', exact: true })
      .fill('0.123456');
    await d
      .getByRole('spinbutton', { name: /维度 1 每份计量数量$/ })
      .fill('1000000');
    await d.getByRole('textbox', { name: /维度 1 计量单位$/ }).fill('Token');
  }
  await d
    .getByRole('textbox', { name: /报价证据模拟引用$/ })
    .fill('mock:evidence:browser');
  await d
    .getByRole('textbox', {
      name: correction ? /更正原因（不覆盖原值）$/ : /报价来源说明与备注$/,
    })
    .fill(
      correction
        ? '模拟录入数字有误，追加更正，不覆盖历史。'
        : '模拟供应商来源说明，仅采购台账。',
    );
  await d.getByRole('button', { name: '保存报价记录', exact: true }).click();
  await expect(page).toHaveURL(/\/quotes\/mock-quote-/);
  await expect(
    page.getByRole('heading', { name: '采购报价详情' }),
  ).toBeVisible();
}
async function create(page: Page, options: Parameters<typeof form>[1] = {}) {
  await page.goto('/quotes');
  await page.getByRole('button', { name: '录入采购报价', exact: true }).click();
  await select(page, '报价渠道选择', '模拟渠道1');
  await form(page, options);
}
async function verify(page: Page) {
  await page.getByRole('button', { name: '核验报价来源', exact: true }).click();
  const d = page.getByRole('dialog', { name: '核验报价来源', exact: true });
  await d
    .getByRole('textbox', { name: '核验或确认依据模拟引用', exact: true })
    .fill('mock:evidence:verified');
  await d
    .getByRole('textbox', { name: '核验或确认说明', exact: true })
    .fill('人工核实模拟来源，不代表正式合同。');
  await d.getByRole('button', { name: '确认来源核验' }).click();
  await expect(d).toHaveCount(0);
}
test('procurement initiates and follows inquiry, records linked quote and sees consistent channel/sourcing history', async ({
  page,
}) => {
  await page.goto('/quotes');
  await persona(page, '模拟Procurement');
  await expect(
    page.getByRole('heading', { name: '采购报价管理' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '询价记录与跟进' }).click();
  await page.getByRole('button', { name: '发起模拟询价' }).click();
  await select(page, '询价渠道选择', '模拟渠道1');
  await select(page, '询价关联需求明细', 'Seedance 示例国内版');
  await page
    .getByRole('textbox', { name: /询价共享跟进说明$/ })
    .fill('模拟待询价记录，不对外发送。');
  await page.getByRole('button', { name: '保存询价记录', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '更新询价', exact: true }).click();
  await select(page, '询价跟进状态', '已询价待回复');
  await page
    .getByRole('textbox', { name: /询价共享跟进说明$/ })
    .fill('人工登记已询价，等待供应商回复。');
  await page.getByRole('button', { name: '保存询价记录', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('cell', { name: '已询价待回复', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '收到并录入报价', exact: true })
    .click();
  await form(page, { price: true });
  const quoteUrl = page.url();
  await expect(
    page.getByRole('button', { name: '模拟正式确认', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('虚构客户1');
  await page.reload();
  await expect(
    page
      .getByText('0.123456 / 1000000 Token（输入 Token）', { exact: false })
      .first(),
  ).toBeVisible();
  await page.goto('/channels/ch-1');
  await expect(
    page.getByRole('link', { name: '查看报价', exact: true }),
  ).toHaveCount(5);
  await page.goto('/sourcing/d-1');
  const section = page.getByTestId('sourcing-item-1');
  await expect(section).toContainText('6000 基点');
  await expect(section).toContainText('不具备直接可比性');
  await expect(
    section
      .getByRole('link', { name: '发起或查看相关渠道询价', exact: true })
      .first(),
  ).toBeVisible();
  await page.goto('/quotes?tab=inquiries');
  await expect(
    page.getByRole('cell', { name: '已收到报价', exact: true }),
  ).toBeVisible();
  await page.goto(quoteUrl);
  await verify(page);
  await expect(page.getByRole('button', { name: '模拟正式确认' })).toHaveCount(
    0,
  );
});
test('operations formally confirms only after independent verification and explicit simulated basis', async ({
  page,
}) => {
  await create(page);
  await expect(
    page.getByRole('button', { name: '模拟正式确认', exact: true }),
  ).toBeDisabled();
  await verify(page);
  await page.getByRole('button', { name: '模拟正式确认', exact: true }).click();
  const d = page.getByRole('dialog', { name: '模拟正式确认', exact: true });
  await d
    .getByRole('textbox', { name: '核验或确认依据模拟引用', exact: true })
    .fill('mock:formal:reference');
  await d.getByLabel('正式生效日期（北京时间00:00）').fill(date());
  await d
    .getByRole('textbox', { name: '核验或确认说明', exact: true })
    .fill('模拟正式依据，不代表真实签约。');
  await d
    .getByRole('checkbox', { name: '我确认这是模拟动作，不代表真实合同签署' })
    .check();
  await d.getByRole('button', { name: '确认模拟正式生效' }).click();
  await expect(d).toHaveCount(0);
  await expect(
    page.getByText('正式生效价', { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('mock:formal:reference', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '模拟正式确认', exact: true }),
  ).toBeDisabled();
});
test('temporary offers remain independent and correction preserves original version after refresh', async ({
  page,
}) => {
  await create(page, { promo: true, discount: '5500' });
  const original = page.url();
  await expect(
    page.getByText('临时优惠报价', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: '更正历史报价' }).click();
  await form(page, { correction: true, promo: false, discount: '5800' });
  await expect(
    page.getByText('历史纠错', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('5500 基点（5.5 折）', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '查看报价', exact: true }),
  ).toHaveCount(6);
  await page.reload();
  await expect(
    page.getByText('5800 基点（5.8 折）', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByText('模拟录入数字有误，追加更正，不覆盖历史。', { exact: false })
      .first(),
  ).toBeVisible();
  await page.goto(original);
  await expect(
    page.getByText('5500 基点（5.5 折）', { exact: true }).first(),
  ).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByTestId('metric-quote-expiring')).toContainText('3');
});
test('unknown old price basis is explicitly incomparable and roles never see procurement price pages', async ({
  page,
}) => {
  await page.goto('/quotes');
  await page.getByRole('tab', { name: '有条件的价格对照' }).click();
  await select(page, '第一条对比报价', 'q-1 ·');
  await select(page, '第二条对比报价', 'q-2 ·');
  await page.getByRole('button', { name: '检查可比性' }).click();
  await expect(page.getByText('不具备可比性', { exact: true })).toBeVisible();
  await expect(page.getByText('价格基准未提供', { exact: true })).toBeVisible();
  for (const label of [
    '模拟Testing',
    '模拟OperationsSupport',
    '模拟SupplierUser',
    '模拟Sales',
  ]) {
    await persona(page, label);
    await expect(
      page.getByText('当前身份无采购报价访问权限', { exact: true }),
    ).toBeVisible();
    await page.goto('/quotes/q-1');
    await expect(
      page.getByText('当前身份无采购报价访问权限', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText('9000 基点');
    await page.goto('/channels/ch-1');
    await expect(
      page.getByText('授权渠道报价历史', { exact: true }),
    ).toHaveCount(0);
    await page.goto('/quotes');
  }
});
test('390px quotation form, verification and history are usable without document overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await create(page, { price: true });
  await verify(page);
  await expect(
    page.getByText('同渠道报价版本历史', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: '更正历史报价' }).click();
  await form(page, { correction: true, discount: '6100' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('explicit quote reset restores legacy data without deleting channel or sourcing records and recovers schema errors', async ({
  page,
}) => {
  await create(page);
  await page.goto('/quotes');
  await page.getByRole('button', { name: '重置报价演示数据' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    '供应商、渠道、寻源、测试保持原样',
  );
  await page.getByRole('button', { name: '确认重置报价', exact: true }).click();
  await expect(page.getByTestId('metric-quote-reference')).toContainText('2');
  await page.goto('/channels');
  await expect(page.getByTestId('metric-channel-total')).toContainText('7');
  await page.evaluate(() =>
    localStorage.setItem('maas-quote-demo-v1', '{"schemaVersion":99}'),
  );
  await page.goto('/quotes');
  await expect(
    page.getByText(/报价演示数据读取失败或版本不兼容/),
  ).toBeVisible();
  await page.getByRole('button', { name: '重置报价演示数据' }).click();
  await page.getByRole('button', { name: '确认重置报价', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '采购报价管理' }),
  ).toBeVisible();
  await expect(page.getByTestId('metric-quote-reference')).toBeVisible();
});
