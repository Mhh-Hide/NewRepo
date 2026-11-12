import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WelcomePage } from '../../src/app/WelcomePage';
afterEach(cleanup);
describe('welcome', () => {
  it('shows the project and explicit mock boundary', () => {
    render(<WelcomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'MaaS 模型资源全生命周期管理平台',
    );
    expect(screen.getByText(/所有展示数据均为模拟数据/)).toBeVisible();
  });
});
