import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import RolePerspectivesPage from '../../src/features/roles/RolePerspectivesPage';
import {
  createDemoSession,
  type DemoSession,
} from '../../src/services/demo-session';
import { DemoControlsContext } from '../../src/services/demo-controls';
const controls = { changeUser: vi.fn(), changeDomain: vi.fn() };
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function view(session: DemoSession) {
  return (
    <DemoControlsContext.Provider value={controls}>
      <MemoryRouter initialEntries={['/system/roles']}>
        <Routes>
          <Route element={<Outlet context={session} />}>
            <Route path="/system/roles" element={<RolePerspectivesPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </DemoControlsContext.Provider>
  );
}
it('实际身份直接来自 Outlet；预览角色不创建会话或读取他人业务', () => {
  const session = createDemoSession('u-ops');
  const query = vi.spyOn(session.api, 'queryRemediationSummaries');
  render(view(session));
  expect(screen.getByTestId('roles-current-user')).toHaveTextContent('林知远');
  fireEvent.click(screen.getByTestId('role-card-Procurement'));
  expect(screen.getByTestId('roles-current-user')).toHaveTextContent('林知远');
  expect(screen.getByText('身份预览，尚未切换')).toBeVisible();
  expect(query).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '切换到此身份' }));
  expect(controls.changeUser).toHaveBeenCalledWith('u-proc');
});
it('身份变更同步丢弃原预览；敏感业务内容没有进入页面', () => {
  const r = render(view(createDemoSession('u-ops')));
  fireEvent.click(screen.getByTestId('role-card-Procurement'));
  r.rerender(view(createDemoSession('u-sales', 'domestic')));
  expect(screen.getByTestId('roles-current-user')).toHaveTextContent('沈悦');
  expect(screen.getByTestId('role-card-Sales')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.queryByText('身份预览，尚未切换')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: '体验整改管理' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/华北资源合作方|华东模型合作方|海外资源合作方/),
  ).not.toBeInTheDocument();
});
it('无授权身份显示明确空状态及禁用业务域', () => {
  render(view(createDemoSession('u-no-domain')));
  expect(screen.getByTestId('roles-current-domain')).toHaveTextContent(
    '暂无业务域授权',
  );
  expect(screen.getByText(/角色动作许可不代表/)).toBeVisible();
  expect(screen.getByRole('combobox', { name: '角色页业务域' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '体验空工作台' })).toBeVisible();
});
