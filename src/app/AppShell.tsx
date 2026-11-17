import { isPrivateData } from '../services/runtime-data';
import { DemoControlsContext } from '../services/demo-controls';
import {
  selectDemoIdentity,
  replaceDemoSession,
} from '../services/demo-selection';
import { useState } from 'react';
import { Drawer, Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import { createDemoSession, listDemoProfiles } from '../services/demo-session';
import type { DomainSelection, DemoSession } from '../services/demo-session';
import { SidebarNavigation } from '../components/layout/SidebarNavigation';
import { Topbar } from '../components/layout/Topbar';
const profiles = listDemoProfiles();
type Selection = { id: string; domain: DomainSelection };
const selectionKey = 'maas-demo-selection';
function initialSelection(): Selection {
  try {
    const stored: unknown = JSON.parse(
      sessionStorage.getItem(selectionKey) ?? 'null',
    );
    if (
      stored &&
      typeof stored === 'object' &&
      'id' in stored &&
      'domain' in stored &&
      typeof stored.id === 'string'
    ) {
      const profile = profiles.find((p) => p.user.id === stored.id);
      const domain = stored.domain;
      if (
        profile &&
        (domain === 'all' ||
          ((domain === 'domestic' || domain === 'overseas') &&
            profile.domains.includes(domain)))
      )
        return { id: profile.user.id, domain };
    }
  } catch {
    /* Storage unavailable or invalid: keep the public demo default. */
  }
  return { id: 'u-ops', domain: 'all' };
}
export function AppShell() {
  const [{ selection, session }, setSelection] = useState(() => {
    const selection = initialSelection();
    return {
      selection,
      session: createDemoSession(selection.id, selection.domain),
    };
  });
  const choose = (next: Selection) => {
    const replacement = replaceDemoSession(session, next);
    setSelection({ selection: next, session: replacement });
    try {
      sessionStorage.setItem(selectionKey, JSON.stringify(next));
    } catch {
      /* Metadata persistence is optional. */
    }
  };
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const changeUser = (id: string) => choose(selectDemoIdentity(id));
  const changeDomain = (domain: DomainSelection) =>
    choose({ ...selection, domain });
  const sidebar = (
    <>
      <div className="brand">
        <span className="brand-mark">M</span>
        {!collapsed && (
          <div>
            <strong>MaaS</strong>
            <small>资源生命周期管理</small>
          </div>
        )}
      </div>
      <SidebarNavigation
        session={session}
        collapsed={collapsed && !mobile}
        onNavigate={() => setDrawer(false)}
      />
      {!collapsed && (
        <div className="sidebar-footer">
          <small>
            {isPrivateData() ? '内部资料 · 本机会话' : '内部原型 · 样本场景'}
          </small>
        </div>
      )}
    </>
  );
  return (
    <Layout className="app-shell">
      <Layout.Sider
        width={232}
        collapsedWidth={76}
        collapsed={collapsed}
        breakpoint="lg"
        onBreakpoint={setMobile}
        className={`sidebar ${mobile ? 'is-mobile' : ''}`}
        theme="light"
      >
        {sidebar}
      </Layout.Sider>
      <Drawer
        placement="left"
        size={270}
        open={mobile && drawer}
        onClose={() => setDrawer(false)}
        styles={{ body: { padding: 0, background: '#f7f7f8' } }}
        title="导航菜单"
      >
        {sidebar}
      </Drawer>
      <Layout className={`main-layout ${collapsed ? 'is-collapsed' : ''}`}>
        <Topbar
          session={session}
          profiles={profiles}
          collapsed={mobile ? !drawer : collapsed}
          onToggle={() =>
            mobile ? setDrawer((v) => !v) : setCollapsed((v) => !v)
          }
          onUser={changeUser}
          onDomain={changeDomain}
        />
        <Layout.Content className="page-content">
          <DemoControlsContext.Provider value={{ changeUser, changeDomain }}>
            <SessionContent
              key={`${selection.id}:${selection.domain}`}
              session={session}
            />
          </DemoControlsContext.Provider>
        </Layout.Content>
        <footer className="app-footer">MaaS · 资源管理</footer>
      </Layout>
    </Layout>
  );
}
function SessionContent({ session }: { session: DemoSession }) {
  return <Outlet context={session} />;
}
