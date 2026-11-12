import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createMockAdapter } from '../../src/mocks/mock-adapter';
import { SupplierRepository } from '../../src/mocks/supplier-repository';
/** Expected values come from the actual authorized service, never a mocked page payload. */
const service = (user = 'u-ops', domain?: 'domestic' | 'overseas') =>
  createMockAdapter(
    user,
    domain,
    new SupplierRepository({
      getItem: () => null,
      setItem: () => {
        throw new Error('Read-only expected-data source');
      },
    }),
  );
async function persona(page: Page, name: string) {
  await page.getByRole('combobox', { name: '演示身份' }).fill(name);
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: name })
    .click();
}
async function select(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: option })
    .click();
}
test('model pool filters, model details, channel list and supplier navigation use authorized service data', async ({
  page,
}) => {
  const a = service();
  const expected = await a.queryModelResources();
  const detail = (await a.getModelResource('m-seed-cn'))!;
  await page.goto('/models');
  await expect(page.getByTestId('metric-resource-models')).toContainText(
    String(expected.stats.models),
  );
  await expect(page.getByTestId('resource-channel-total')).toContainText(
    String(expected.stats.channels),
  );
  await page
    .getByRole('textbox', { name: '模型名称或代码' })
    .fill(detail.summary.model.modelCode);
  await select(page, '地区版本筛选', '国内版');
  await page
    .getByRole('link', { name: detail.summary.model.name, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: '模型详情', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('metric-model-channels')).toContainText(
    String(detail.summary.channelCount),
  );
  await expect(page.getByTestId('model-business-domain')).toHaveText(
    '国内模型',
  );
  for (const c of detail.channels)
    await expect(
      page.getByRole('link', { name: c.displayName, exact: true }),
    ).toBeVisible();
  const supplier = detail.suppliers[0]!.supplier;
  await page
    .getByRole('link', { name: supplier.name, exact: true })
    .first()
    .click();
  await expect(page.locator('.supplier-profile-title')).toContainText(
    supplier.name,
  );
  await page.getByRole('link', { name: '查看关联模型', exact: true }).click();
  const related = await a.queryModelResources({ supplierId: supplier.id });
  await expect(page.getByTestId('metric-resource-models')).toContainText(
    String(related.stats.models),
  );
  await expect(page.locator('.resource-scope')).toContainText(supplier.name);
});
test('supplier rename and disable are reflected in resource views without removing channels', async ({
  page,
}) => {
  const before = (await service().getModelResource('m-seed-cn'))!;
  await page.goto('/suppliers/s-1');
  await page
    .locator('.supplier-profile')
    .getByRole('button', { name: '编辑资料', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: /供应商名称$/ })
    .fill('虚构资源同步供应商');
  await page.getByRole('textbox', { name: /内部缩写$/ }).fill('MOCK-SYNC');
  await page.getByRole('button', { name: '保存供应商', exact: true }).click();
  await expect(page.locator('.supplier-profile-title')).toContainText(
    '虚构资源同步供应商',
  );
  await page.goto('/models/m-seed-cn');
  await expect(
    page.getByRole('link', { name: '虚构资源同步供应商', exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('MOCK-SYNC', { exact: true }).first(),
  ).toBeVisible();
  await page.goto('/channels/ch-1');
  await expect(
    page.getByRole('link', { name: '虚构资源同步供应商', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText('MOCK-SYNC', { exact: true })).toBeVisible();
  await page
    .getByRole('link', { name: '虚构资源同步供应商', exact: true })
    .click();
  await page.getByRole('button', { name: '停用供应商', exact: true }).click();
  await page.getByRole('button', { name: /^确\s*认$/ }).click();
  await expect(page.getByRole('button', { name: '启用供应商' })).toBeVisible();
  await page.goto('/models/m-seed-cn');
  await expect(page.getByTestId('metric-model-channels')).toContainText(
    String(before.summary.channelCount),
  );
  await expect(page.getByText('停用', { exact: true }).first()).toBeVisible();
  for (const c of before.channels)
    await expect(
      page.getByRole('link', { name: c.displayName, exact: true }),
    ).toBeVisible();
});
test('test, supplier and sales perspectives keep technical and supplier boundaries', async ({
  page,
}) => {
  await page.goto('/channels/ch-1');
  await persona(page, '测试 · 模拟Testing');
  await expect(page.getByText('Endpoint 引用', { exact: true })).toBeVisible();
  await expect(page.getByText('采购折扣', { exact: true })).toHaveCount(0);
  await persona(page, '供应商 · 模拟SupplierUser');
  await expect(page.getByText('Endpoint 引用', { exact: true })).toHaveCount(0);
  await page.goto('/models/m-seed-cn');
  const own = (await service('u-supplier').getModelResource('m-seed-cn'))!;
  await expect(page.getByTestId('metric-model-channels')).toContainText(
    String(own.summary.channelCount),
  );
  await expect(
    page.getByText('虚构供应商2（模拟）', { exact: true }),
  ).toHaveCount(0);
  await page.goto('/channels/ch-3');
  await expect(page.getByText('渠道不存在或无权访问')).toBeVisible();
  await persona(page, '销售 · 模拟Sales');
  await page.goto('/models/m-seed-cn');
  const front = (await service('u-sales').getModelResource('m-seed-cn'))!;
  await expect(page.getByTestId('metric-model-channels')).toContainText(
    String(front.summary.channelCount),
  );
  await expect(page.getByText(/虚构供应商/)).toHaveCount(0);
  await expect(page.getByTestId('metric-model-suppliers')).toHaveCount(0);
  const channel = front.channels.find((c) => c.tpm === null)!;
  await page
    .getByRole('link', { name: channel.displayName, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: '渠道只读详情' }),
  ).toBeVisible();
  await expect(page.getByText('Endpoint 引用', { exact: true })).toHaveCount(0);
  await expect(page.getByText('OP 渠道 ID', { exact: true })).toHaveCount(0);
  expect(
    await page.getByText('未知', { exact: true }).count(),
  ).toBeGreaterThanOrEqual(2);
});
test('domain change filters vendors and models and does not turn overseas variants into overseas business domains', async ({
  page,
}) => {
  await page.goto('/models');
  await select(page, '业务域', '国内模型');
  const domestic = await service('u-ops', 'domestic').queryModelResources();
  await expect(page.getByTestId('metric-resource-models')).toContainText(
    String(domestic.stats.models),
  );
  await page.getByRole('combobox', { name: '厂商筛选' }).click();
  await expect(
    page
      .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
      .filter({ hasText: 'OpenAI' }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await select(page, '地区版本筛选', '海外版');
  await page
    .getByRole('link', { name: 'Seedance 示例海外版', exact: true })
    .click();
  await expect(page.getByTestId('model-region-variant')).toHaveText('海外版');
  await expect(page.getByTestId('model-business-domain')).toHaveText(
    '国内模型',
  );
  await select(page, '业务域', '海外模型');
  await expect(page.getByText('模型不存在或无权访问')).toBeVisible();
  await page.goto('/models');
  const overseas = await service('u-ops', 'overseas').queryModelResources();
  await expect(page.getByTestId('metric-resource-models')).toContainText(
    String(overseas.stats.models),
  );
  await expect(page.getByTestId('resource-channel-total')).toContainText(
    String(overseas.stats.channels),
  );
});
test('empty model resources, routing refresh and 1440/1280/390 layouts remain usable', async ({
  page,
}) => {
  await page.goto('/models/m-claude');
  await expect(
    page.getByText('当前模型暂无可见渠道', { exact: true }),
  ).toBeVisible();
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, title] of [
      ['/models', '模型资源池'],
      ['/models/m-seed-cn', '模型详情'],
      ['/channels/ch-2', '渠道只读详情'],
    ] as const) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('status', { name: '正在加载授权数据' }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 2,
        ),
      ).toBe(true);
    }
  }
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '渠道只读详情', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('未知', { exact: true }).first()).toBeVisible();
});
