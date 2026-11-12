import { Button, Select, Tag, Tooltip } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import type {
  DemoProfile,
  DemoSession,
  DomainSelection,
} from '../../services/demo-session';
import { roleLabels } from '../../auth/types';
export function Topbar({
  session,
  profiles,
  collapsed,
  onToggle,
  onUser,
  onDomain,
}: {
  session: DemoSession;
  profiles: readonly DemoProfile[];
  collapsed: boolean;
  onToggle: () => void;
  onUser: (id: string) => void;
  onDomain: (domain: DomainSelection) => void;
}) {
  const domains = session.profile.domains;
  const options = [
    ...(domains.length > 1 ? [{ value: 'all', label: '全部授权业务域' }] : []),
    ...domains.map((d) => ({
      value: d,
      label: d === 'domestic' ? '国内模型' : '海外模型',
    })),
  ];
  return (
    <header className="topbar">
      <div className="topbar-title">
        <Button
          type="text"
          aria-label={collapsed ? '展开导航' : '收起导航'}
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
        />
        <span>MaaS 模型资源全生命周期管理平台</span>
        <Tag color="blue">Mock 环境</Tag>
      </div>
      <div className="topbar-controls">
        <label>
          业务域
          <Select
            aria-label="业务域"
            value={
              domains.length === 1 ? (domains[0] ?? 'all') : session.domain
            }
            disabled={domains.length === 0}
            options={
              options.length
                ? options
                : [{ value: 'all', label: '无业务域授权' }]
            }
            onChange={onDomain}
          />
        </label>
        <label>
          <Tooltip title="仅切换模拟身份，不是真实登录">演示身份</Tooltip>
          <Select
            aria-label="演示身份"
            showSearch={{ optionFilterProp: 'label' }}
            value={session.profile.user.id}
            options={profiles.map((p) => ({
              value: p.user.id,
              label: `${roleLabels[p.user.role]} · ${p.user.name}`,
            }))}
            onChange={onUser}
          />
        </label>
      </div>
    </header>
  );
}
