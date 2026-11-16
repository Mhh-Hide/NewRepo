import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { roleLabels, type Role } from '../../auth/types';
import {
  listDemoProfiles,
  type DemoSession,
} from '../../services/demo-session';
import { useDemoControls } from '../../services/demo-controls';
import { PageHeader } from '../../components/PageHeader';
import {
  roles,
  roleResponsibilities,
  modulePerspectives,
  fieldPerspectives,
  experienceEntries,
} from './role-presenter';
import './roles.css';
const profiles = listDemoProfiles();
const domainLabel = (d: string) =>
  d === 'domestic'
    ? '国内模型'
    : d === 'overseas'
      ? '海外模型'
      : '全部授权业务域';
export default function RolePerspectivesPage() {
  const session = useOutletContext<DemoSession>();
  return (
    <RoleWorkspace
      key={`${session.profile.user.id}:${session.domain}`}
      session={session}
    />
  );
}
function RoleWorkspace({ session }: { session: DemoSession }) {
  const controls = useDemoControls(),
    navigate = useNavigate();
  const [role, setRole] = useState<Role>(session.profile.user.role);
  const [profileId, setProfileId] = useState(session.profile.user.id);
  const selected = profiles.find((p) => p.user.id === profileId)!;
  const selectRole = (role: Role) => {
    setRole(role);
    setProfileId(profiles.find((p) => p.user.role === role)!.user.id);
  };
  const active = selected.user.id === session.profile.user.id;
  const matrix = modulePerspectives(selected),
    fields = fieldPerspectives(selected);
  const experience = (path: string) => {
    if (!active) controls.changeUser(selected.user.id);
    navigate(path);
  };
  return (
    <div className="role-workspace">
      <PageHeader
        title="角色视角与权限说明"
        description="查看角色职责与实际身份范围，并进入真实 Mock 业务模块体验。"
        group="系统"
      />
      <Alert
        showIcon
        type="info"
        title="本模块用于演示不同身份下的功能与数据权限。切换角色不是真实登录，所有数据均为模拟数据。"
      />
      <Card
        className="resource-card"
        title="当前演示身份"
        extra={<Tag color="blue">Mock 环境</Tag>}
      >
        <Descriptions
          column={{ xs: 1, sm: 2, lg: 4 }}
          items={[
            {
              key: 'role',
              label: '当前角色',
              children: roleLabels[session.profile.user.role],
            },
            {
              key: 'user',
              label: '当前模拟用户',
              children: (
                <strong data-testid="roles-current-user">
                  {session.profile.user.name}
                </strong>
              ),
            },
            {
              key: 'domain',
              label: '当前业务域',
              children: (
                <span data-testid="roles-current-domain">
                  {session.profile.domains.length
                    ? domainLabel(session.domain)
                    : '暂无业务域授权'}
                </span>
              ),
            },
            {
              key: 'grants',
              label: '授权业务域范围',
              children:
                session.profile.domains.map(domainLabel).join('、') ||
                '暂无业务域授权',
            },
          ]}
        />
        <Space wrap>
          <span>调整当前身份业务域</span>
          <Select
            aria-label="角色页业务域"
            disabled={!session.profile.domains.length}
            value={session.domain}
            onChange={controls.changeDomain}
            options={
              session.profile.domains.length
                ? [
                    ...(session.profile.domains.length > 1
                      ? [{ value: 'all', label: '全部授权业务域' }]
                      : []),
                    ...session.profile.domains.map((d) => ({
                      value: d,
                      label: domainLabel(d),
                    })),
                  ]
                : [{ value: 'all', label: '暂无业务域授权' }]
            }
          />
        </Space>
      </Card>
      <section aria-label="八类角色总览" className="role-overview">
        {roles.map((r) => {
          const entries = profiles.filter((p) => p.user.role === r),
            example = entries[0]!,
            rows = modulePerspectives(example),
            restricted = fieldPerspectives(example).filter((f) => !f.allowed);
          return (
            <button
              type="button"
              key={r}
              data-testid={`role-card-${r}`}
              aria-pressed={role === r}
              onClick={() => selectRole(r)}
              className={`role-card ${role === r ? 'selected' : ''}`}
            >
              <strong>{roleLabels[r]}</strong>
              <span>{entries.length} 个演示身份</span>
              <small>{roleResponsibilities[r]}</small>
              <small>
                主要模块：
                {rows
                  .filter((m) => m.canExperience)
                  .slice(0, 4)
                  .map((m) => m.name)
                  .join('、') || '仅既有基础读取'}
              </small>
              <small>
                限制：
                {restricted.map((f) => f.label).join('、') ||
                  '仍受业务域及记录授权约束'}
              </small>
            </button>
          );
        })}
      </section>
      <Card title={`${roleLabels[role]} · 权限详情`} className="resource-card">
        <p>{roleResponsibilities[role]}</p>
        <Space wrap>
          <label htmlFor="perspective-profile">对应演示身份</label>
          <Select
            id="perspective-profile"
            aria-label="角色对应模拟用户"
            value={profileId}
            onChange={setProfileId}
            options={profiles
              .filter((p) => p.user.role === role)
              .map((p) => ({
                value: p.user.id,
                label: `${p.user.name}${p.domains.length ? '' : '（暂无业务域授权）'}`,
              }))}
          />
          <Button
            type="primary"
            disabled={active}
            onClick={() => controls.changeUser(selected.user.id)}
          >
            切换到此身份
          </Button>
          <Tag>{active ? '当前实际身份' : '身份预览，尚未切换'}</Tag>
        </Space>
        <p data-testid="roles-selected-scope">
          所选身份授权业务域：
          {selected.domains.map(domainLabel).join('、') || '暂无业务域授权'}。
          {active && selected.domains.length
            ? `当前业务域筛选：${domainLabel(session.domain)}。`
            : ''}
          供应商维护、自身所属、客户及渠道记录范围由现有服务逐次核验；这里不读取或展示授权关系清单。
        </p>
        {!selected.domains.length && (
          <Empty description="暂无业务域授权；角色动作许可不代表该身份拥有业务数据或写入范围。" />
        )}
        <Table
          rowKey="id"
          dataSource={matrix}
          pagination={false}
          scroll={{ x: 900 }}
          size="small"
          columns={[
            { title: '业务模块', dataIndex: 'name', fixed: 'left', width: 130 },
            {
              title: '角色功能权限',
              dataIndex: 'capability',
              width: 135,
              render: (v: string) => (
                <Tag
                  color={
                    v === '未开放'
                      ? 'default'
                      : v === '无权限'
                        ? 'red'
                        : v === '仅摘要'
                          ? 'gold'
                          : 'blue'
                  }
                >
                  {v}
                </Tag>
              ),
            },
            {
              title: '所选身份实际入口',
              dataIndex: 'identityStatus',
              width: 145,
            },
            {
              title: '可执行的主要操作',
              width: 230,
              render: (_, row) =>
                row.available
                  ? row.operations.map((op) => op.label).join('、') ||
                    (['只读', '仅摘要'].includes(row.capability)
                      ? '读取获准信息，不提供管理写入'
                      : '无管理操作')
                  : '未开放，不提供治理业务操作',
            },
            { title: '范围与限制', dataIndex: 'note' },
          ]}
        />
        <Alert
          className="role-note"
          type="warning"
          title="角色功能权限是现有策略的公开说明，不是对全部记录的操作授权。"
          description="业务域、当前供应商维护授权、本人负责人、具体状态和版本等条件仍由业务服务核验；供应商治理（Stage 08）尚未开放。"
        />
        <h3>敏感信息边界</h3>
        <div className="role-field-grid">
          {fields.map((f) => (
            <div key={f.label}>
              <strong>{f.label}</strong>
              <Tag color={f.allowed ? 'blue' : 'default'}>
                {f.allowed ? '按接口与授权范围读取' : '不可读取'}
              </Tag>
              <small>{f.note}</small>
            </div>
          ))}
        </div>
        <p>
          销售、总监、VP
          三档销售价格模块尚未上线；演示页不读取任何其他身份的业务记录、报价、客户资料或完整审计。
        </p>
        <h3>以此身份体验已开放模块</h3>
        <p>
          {active
            ? '入口使用当前真实 DemoSession。'
            : '点击入口将先统一切换到所选身份，再进入对应业务页面。'}
        </p>
        <Space wrap>
          {experienceEntries(selected).map((n) => (
            <Button key={n.id} onClick={() => experience(n.path)}>
              {!selected.domains.length && n.id === 'dashboard'
                ? '体验空工作台'
                : `体验${n.name}`}
            </Button>
          ))}
        </Space>
      </Card>
    </div>
  );
}
