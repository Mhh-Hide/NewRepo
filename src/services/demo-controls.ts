import { createContext, useContext } from 'react';
import type { DomainSelection } from './demo-session';
export const DemoControlsContext = createContext<{
  changeUser: (id: string) => void;
  changeDomain: (domain: DomainSelection) => void;
} | null>(null);
export function useDemoControls() {
  const controls = useContext(DemoControlsContext);
  if (!controls) throw Error('演示切换入口不可用');
  return controls;
}
