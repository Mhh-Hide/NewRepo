import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../../src/features/dashboard/DashboardPage';
import { createDemoSession } from '../../src/services/demo-session';
import type { DemoSession } from '../../src/services/demo-session';
import type { ApiAdapter } from '../../src/services/api-adapter';
afterEach(cleanup);
const page = (s: DemoSession) => (
  <MemoryRouter>
    <DashboardPage session={s} />
  </MemoryRouter>
);
describe('dashboard query lifecycle', () => {
  it('renders default authorized metrics and preserves shared Chinese UI', async () => {
    render(page(createDemoSession('u-ops')));
    expect(
      screen.getByRole('status', { name: '正在加载授权数据' }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('metric-suppliers')).toHaveTextContent(
      '3',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '工作台',
    );
  });
  it('renders a meaningful authorized empty state', async () => {
    render(page(createDemoSession('u-no-domain')));
    expect(
      await screen.findByText('当前演示身份及业务域暂无授权数据'),
    ).toBeVisible();
  });
  it('shows generic error and retries without exposing internal error content', async () => {
    const s = createDemoSession('u-ops');
    const query = vi
      .fn(s.api.listModels)
      .mockRejectedValueOnce(new Error('SECRET CUSTOMER CONTENT'));
    const session = { ...s, api: { ...s.api, listModels: query } };
    render(page(session));
    expect(await screen.findByText('授权数据查询失败')).toBeVisible();
    expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByTestId('metric-channels')).toBeVisible();
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('synchronously isolates old-role data and ignores a late previous-role response', async () => {
    const s = createDemoSession('u-ops');
    let resolve:
      | ((models: Awaited<ReturnType<ApiAdapter['listModels']>>) => void)
      | undefined;
    const delayed = {
      ...s,
      api: {
        ...s.api,
        listModels: () =>
          new Promise<Awaited<ReturnType<ApiAdapter['listModels']>>>((r) => {
            resolve = r;
          }),
      },
    };
    const rendered = render(page(delayed));
    rendered.rerender(page(createDemoSession('u-sales')));
    await waitFor(() =>
      expect(screen.getByTestId('metric-demands')).toBeInTheDocument(),
    );
    expect(screen.queryByText('采购报价摘要')).not.toBeInTheDocument();
    expect(screen.queryByText(/虚构供应商/)).not.toBeInTheDocument();
    await act(async () => {
      resolve?.(await s.api.listModels());
    });
    expect(screen.queryByText('采购报价摘要')).not.toBeInTheDocument();
    expect(screen.queryByTestId('metric-suppliers')).not.toBeInTheDocument();
  });
  it('removes an already rendered privileged response when identity changes', async () => {
    const r = render(page(createDemoSession('u-ops')));
    expect(await screen.findByText('采购报价摘要')).toBeVisible();
    r.rerender(page(createDemoSession('u-test')));
    expect(screen.queryByText('采购报价摘要')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('metric-quality')).toBeVisible(),
    );
    expect(screen.queryByText('采购折扣（模拟）')).not.toBeInTheDocument();
  });
});
