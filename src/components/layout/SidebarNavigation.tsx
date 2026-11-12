import { Menu, Tag } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { navigation } from '../../app/navigation';
import type { DemoSession } from '../../services/demo-session';
export function SidebarNavigation({
  session,
  collapsed,
  onNavigate,
}: {
  session: DemoSession;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const entries = navigation.filter(
    (n) => n.permission === null || session.permits(n.permission),
  );
  const groups = [...new Set(entries.map((n) => n.group))];
  const item = (n: (typeof entries)[number]) => ({
    key: n.path,
    icon: n.icon,
    label: (
      <span>
        {n.name}
        {!n.available && !collapsed && <Tag className="nav-soon">未开放</Tag>}
      </span>
    ),
  });
  return (
    <nav aria-label="主导航">
      <Menu
        mode="inline"
        theme="dark"
        selectedKeys={[location.pathname]}
        inlineCollapsed={collapsed}
        items={
          collapsed
            ? entries.map(item)
            : groups.map((group) => ({
                type: 'group' as const,
                label: group,
                children: entries.filter((n) => n.group === group).map(item),
              }))
        }
        onClick={({ key }) => {
          navigate(key);
          onNavigate();
        }}
      />
    </nav>
  );
}
