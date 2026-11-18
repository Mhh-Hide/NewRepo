import { test, expect, type Page } from '@playwright/test';
const models = [
  'Seedance 1.0 国内版',
  'Doubao-1.5-pro',
  'Kling 2.1',
  'Kimi K2',
  'DeepSeek-V3',
];
async function select(
  page: Page,
  label: string,
  value: string,
  search = false,
) {
  const c = page.getByRole('combobox', { name: label, exact: true });
  if (search) await c.fill(value);
  else await c.click();
  const id = await c.getAttribute('aria-controls');
  const option = page
    .locator('.ant-select-dropdown')
    .filter({ has: page.locator(`[id="${id}"]`) })
    .locator('.ant-select-item-option')
    .filter({ hasText: value })
    .first();
  await option.hover();
  await c.press('Enter');
}
async function persona(page: Page, name: string) {
  await select(page, '演示身份', name, true);
}
async function fiveQuotes(page: Page) {
  await page.goto('/quotes');
  await page
    .getByRole('button', { name: '新增供应商报价', exact: true })
    .click();
  await select(page, '报价供应商', '华北资源', true);
  for (let i = 0; i < 5; i++) {
    if (i)
      await page
        .getByRole('button', { name: '添加报价行', exact: true })
        .click();
    await select(page, `第${i + 1}行模型`, models[i]!, true);
    await select(
      page,
      `第${i + 1}行渠道类型`,
      ['官 Key', '官转', '云厂商自部署', '云厂商自部署中转', '供应商自部署'][
        i
      ]!,
    );
    await page
      .getByRole('spinbutton', { name: `第${i + 1}行折扣`, exact: true })
      .fill(['9', '8.5', '8', '7.2', '8.55'][i]!);
  }
}
test('supplier quotes five models; per-channel current view and personal columns survive refresh', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fiveQuotes(page);
  await page.screenshot({
    path: 'docs/stage-07f/screenshots/supplier-quote.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: '保存供应商报价', exact: true })
    .click();
  await expect(page).toHaveURL(/\/quotes$/);
  await expect(
    page.getByRole('heading', { name: '采购报价管理' }),
  ).toBeVisible();
  for (const text of ['9 折', '8.5 折', '7.2 折', '8.55 折'])
    await expect(
      page.getByRole('cell', { name: text, exact: true }).first(),
    ).toBeVisible();
  expect(await page.locator('.ant-table-thead th').allTextContents()).toEqual([
    '模型名称',
    '供应商简称',
    '渠道名称',
    '渠道类型',
    '当前采购折扣',
    '商务推进状态',
    '操作',
  ]);
  await expect(
    page.locator('main').or(page.locator('.page-content')),
  ).not.toContainText(/基点|bps|无独立核验/);
  await page.screenshot({
    path: 'docs/stage-07f/screenshots/quotes.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '列设置', exact: true }).click();
  await page.getByRole('checkbox', { name: 'TPM', exact: true }).check();
  await page.getByRole('checkbox', { name: '渠道类型', exact: true }).uncheck();
  await page.getByRole('heading', { name: '采购报价管理' }).click();
  await page.reload();
  await expect(
    page.getByRole('columnheader', { name: 'TPM', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: '渠道类型', exact: true }),
  ).toHaveCount(0);
  await persona(page, '陈嘉宁');
  await expect(
    page.getByRole('columnheader', { name: '渠道类型', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: 'TPM', exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('customer five-model request expands into model-specific candidate channels and safe sales progress', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/sourcing');
  await page.getByRole('button', { name: '新增采购需求', exact: true }).click();
  await page
    .getByRole('textbox', { name: /需求名称$/ })
    .fill('客户多模型采购计划');
  await page
    .getByRole('textbox', { name: /采购共享标题$/ })
    .fill('五模型资源采购计划');
  await page
    .getByRole('textbox', { name: /采购共享需求摘要$/ })
    .fill('按模型分别寻找稳定资源');
  await select(page, '需求客户关联', '虚构客户1');
  for (let i = 0; i < 5; i++) {
    if (i)
      await page
        .getByRole('button', { name: '添加模型明细', exact: true })
        .click();
    await select(page, `明细 ${i + 1} 模型选择`, models[i]!, true);
  }
  await page.getByRole('button', { name: '保存采购需求', exact: true }).click();
  await expect(page).toHaveURL(/\/sourcing\/mock-demand-/);
  const id = page.url().split('/').at(-1)!;
  await page.evaluate(async (id) => {
    const path = '/src/mocks/mock-adapter.ts';
    const { createMockAdapter } = await import(/* @vite-ignore */ path);
    const a = createMockAdapter('u-ops'),
      k = () => crypto.randomUUID();
    const d = await a.getSourcingDemand(id);
    const rows = d.items.map((i: { model: { id: string; name: string } }) => ({
      modelId: i.model.id,
      displayName: `候选-${i.model.name}`,
      channelType: 'official_proxy',
      discount: 8500,
      modelInvocationName: '',
      endpointReference: '',
      tpm: null,
      rpm: null,
      concurrencyLimit: null,
      ttftMs: null,
    }));
    await a.saveSupplierQuote(
      {
        supplierId: 's-1',
        quotedAt: null,
        ownerId: 'u-proc',
        remark: '独立演示报价',
        rows,
      },
      k(),
    );
    await a.saveSupplierQuote(
      {
        supplierId: 's-2',
        quotedAt: null,
        ownerId: 'u-proc',
        remark: '独立演示报价',
        rows: rows.map((r: { displayName: string }) => ({
          ...r,
          displayName: `备选-${r.displayName}`,
        })),
      },
      k(),
    );
    for (const item of d.items) {
      const cs = (await a.listChannels()).filter(
        (c: { modelId: string; displayName: string }) =>
          c.modelId === item.model.id && /^(候选|备选)-/.test(c.displayName),
      );
      for (const c of cs) {
        const current = await a.getSourcingDemand(id);
        await a.addSourcingCandidate(
          id,
          current.demand.version,
          item.item.id,
          c.id,
          '待安排测试',
        );
      }
    }
  }, id);
  await page.goto('/sourcing');
  const row = page.getByRole('row').filter({
    has: page.getByRole('link', { name: '客户多模型采购计划', exact: true }),
  });
  await row.locator('.ant-table-row-expand-icon').click();
  const expanded = page.locator('.ant-table-expanded-row').first();
  await expanded.locator('.ant-table-row-expand-icon').first().click();
  await expect(
    page.getByRole('cell', { name: '候选-Seedance 1.0 国内版', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', {
      name: '备选-候选-Seedance 1.0 国内版',
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: 'docs/stage-07f/screenshots/demands.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '列设置', exact: true }).click();
  await page.getByRole('checkbox', { name: '发起日期', exact: true }).check();
  await page.getByRole('heading', { name: '采购需求', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('columnheader', { name: '发起日期', exact: true }),
  ).toBeVisible();
  await persona(page, '沈悦');
  await expect(
    page.getByRole('heading', { name: '客户需求进度', exact: true }),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText(
    /华北资源|华东模型|8.5 折|采购折扣|候选-Seedance/,
  );
  await expect(
    page.getByRole('button', { name: '复制进度摘要' }).first(),
  ).toBeVisible();
  await page.goto('/quotes');
  await expect(
    page.getByText('当前身份无采购报价访问权限', { exact: true }),
  ).toBeVisible();
});
test('domestic and overseas buyers get manufacturer-based own work; colleagues do not grant more authority', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/models');
  await persona(page, '周思齐');
  await expect(
    page.getByRole('link', { name: 'Seedance 1.0 海外版', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'GPT-4.1', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: 'docs/stage-07f/screenshots/personnel.png',
    fullPage: true,
  });
  await select(page, '模型工作范围', '陈嘉宁');
  await expect(
    page.getByRole('link', { name: 'GPT-4.1', exact: true }),
  ).toHaveCount(0);
  await persona(page, '李沐');
  await expect(
    page.getByRole('link', { name: 'GPT-4.1', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Seedance 1.0 海外版', exact: true }),
  ).toHaveCount(0);
  await page.goto('/channels');
  await expect(
    page.getByRole('heading', { name: '渠道总览', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'docs/stage-07f/screenshots/channels.png',
    fullPage: true,
  });
});
