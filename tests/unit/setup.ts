import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// jsdom has no layout engine. Geometry is verified by the real Chromium tests.
vi.stubGlobal(
  'ResizeObserver',
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
const nativeComputedStyle = window.getComputedStyle.bind(window);
// jsdom does not implement pseudo-element styles (used by Ant Design scrollbars).
vi.spyOn(window, 'getComputedStyle').mockImplementation((element) =>
  nativeComputedStyle(element),
);
