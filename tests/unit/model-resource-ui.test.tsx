import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import type { DemoSession } from '../../src/services/demo-session';
import { createDemoSession } from '../../src/services/demo-session';
import ModelPoolPage from '../../src/features/models/ModelPoolPage';
import ModelDetailPage from '../../src/features/models/ModelDetailPage';
import ChannelDetailPage from '../../src/features/channels/ChannelDetailPage';
import type { ModelResourcePage } from '../../src/services/resource-types';
afterEach(cleanup);
function page(session: DemoSession, path = '/models') {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Outlet context={session} />}>
          <Route path="/models" element={<ModelPoolPage />} />
          <Route path="/models/:modelId" element={<ModelDetailPage />} />
          <Route path="/channels/:channelId" element={<ChannelDetailPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
describe('model resource UI data lifecycle', () => {
  it('uses actual authorized totals, searches an empty result and resets filters', async () => {
    const s = createDemoSession('u-ops');
    const expected = await s.api.queryModelResources();
    render(page(s));
    expect(
      screen.getByRole('status', { name: '正在加载授权数据' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('metric-resource-models'),
    ).toHaveTextContent(String(expected.stats.models));
    fireEvent.change(screen.getByRole('textbox', { name: '模型名称或代码' }), {
      target: { value: 'no-such-model' },
    });
    expect(
      await screen.findByText('当前授权范围或筛选条件下暂无模型'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '重置筛选' }));
    await waitFor(() =>
      expect(
        screen.queryByText('当前授权范围或筛选条件下暂无模型'),
      ).not.toBeInTheDocument(),
    );
  });
  it('preserves an existing model with no channels and an explicit channel empty state', async () => {
    render(page(createDemoSession('u-ops'), '/models/m-claude'));
    expect(await screen.findByText('当前模型暂无可见渠道')).toBeVisible();
    expect(screen.getByTestId('metric-model-channels')).toHaveTextContent('0');
  });
  it('shows unknown capacities and does not render unauthorized supplier or technical detail rows', async () => {
    render(page(createDemoSession('u-sales'), '/channels/ch-2'));
    await waitFor(() =>
      expect(screen.getAllByText('未知').length).toBeGreaterThanOrEqual(2),
    );
    expect(screen.queryByText('Endpoint 引用')).not.toBeInTheDocument();
    expect(screen.queryByText('OP 渠道 ID')).not.toBeInTheDocument();
    expect(screen.queryByText(/虚构供应商/)).not.toBeInTheDocument();
  });
  it('sanitizes unexpected errors and can retry a failed query', async () => {
    const s = createDemoSession('u-ops');
    const query = vi
      .fn(s.api.queryModelResources)
      .mockRejectedValueOnce(new Error('SECRET RAW ERROR'));
    render(page({ ...s, api: { ...s.api, queryModelResources: query } }));
    expect(
      await screen.findByText('资源数据查询失败，请稍后重试。'),
    ).toBeVisible();
    expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByTestId('metric-resource-models')).toBeVisible();
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('ignores late privileged data after a perspective change', async () => {
    const ops = createDemoSession('u-ops');
    const expected = await ops.api.queryModelResources();
    let resolve: ((data: ModelResourcePage) => void) | undefined;
    const deferred = {
      ...ops,
      api: {
        ...ops.api,
        queryModelResources: () =>
          new Promise<ModelResourcePage>((r) => {
            resolve = r;
          }),
      },
    };
    const r = render(page(deferred));
    r.rerender(page(createDemoSession('u-sales')));
    expect(await screen.findByTestId('metric-resource-models')).toBeVisible();
    expect(
      screen.queryByRole('combobox', { name: '供应商覆盖筛选' }),
    ).not.toBeInTheDocument();
    await act(async () => resolve?.(expected));
    expect(
      screen.queryByTestId('metric-resource-three-suppliers'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: '供应商覆盖筛选' }),
    ).not.toBeInTheDocument();
  });
});
