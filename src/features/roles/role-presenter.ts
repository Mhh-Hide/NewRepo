import { can, canSeeField } from '../../auth/policy';
import type {
  AccessContext,
  PermissionAction,
  Role,
  SensitiveField,
} from '../../auth/types';
import { roleLabels } from '../../auth/types';
import type { DemoProfile } from '../../services/demo-session';
import { navigation } from '../../app/navigation';
export const roles = Object.keys(roleLabels) as Role[];
export const roleResponsibilities: Record<Role, string> = {
  ProductOperations: '统筹授权资源与业务，人工审核、确认和关闭。',
  Procurement: '维护获准供应商，开展寻源、询价与采购报价分析。',
  Testing: '执行授权技术测试，跟进本人负责的技术整改。',
  OperationsSupport: '查看授权技术资源、状态摘要和相关事件信息。',
  SupplierUser: '读取自身获准的既有基础资料，不提供新的供应商门户。',
  Sales: '查看匿名资源与获准客户需求，不展示上游采购成本。',
  AccountManager: '服务获准客户需求，查看匿名资源，不展示采购成本。',
  SolutionArchitect: '查看匿名资源能力及获准需求，支持方案沟通。',
};
interface ModuleDisplay {
  readonly id: string;
  readonly reads: readonly PermissionAction[];
  readonly detail?: PermissionAction;
  readonly operations: readonly {
    readonly action: PermissionAction;
    readonly label: string;
  }[];
  readonly manages?: PermissionAction;
  readonly note: string;
}
const modules: readonly ModuleDisplay[] = [
  {
    id: 'suppliers',
    reads: ['supplier:read'],
    manages: 'supplier:create',
    operations: [
      { action: 'supplier:create', label: '新增主档' },
      { action: 'supplier:maintain', label: '维护获准主档' },
      { action: 'supplier:assign', label: '调整采购负责人' },
      { action: 'supplier:toggle', label: '调整主档启停' },
    ],
    note: '主档管理范围与渠道业务域分别校验；采购仅当前维护授权，供应商仅自身。',
  },
  {
    id: 'models',
    reads: ['model:read'],
    operations: [],
    note: '按模型厂商业务域过滤；前台只能读取匿名渠道和获准资源。',
  },
  {
    id: 'channels',
    reads: ['channel:read'],
    manages: 'channel:create',
    operations: [
      { action: 'channel:create', label: '新增渠道' },
      { action: 'resource:acquire', label: '维护采购资源交接' },
      { action: 'lifecycle:verify', label: '核验两阶段技术交付' },
      { action: 'contract:update', label: '登记采购合同进度' },
      { action: 'production-config:update', label: '记录生产配置' },
      { action: 'lifecycle:open', label: '确认对客开放' },
      { action: 'channel:update', label: '维护能力' },
      { action: 'channel:toggle', label: '独立启停' },
      { action: 'channel:bind-op', label: '模拟 OP 绑定' },
    ],
    note: '逐渠道核验业务域与供应商范围；前台不返回供应商身份或内部技术引用。',
  },
  {
    id: 'sourcing',
    reads: ['sourcing:read'],
    manages: 'sourcing:create',
    operations: [
      { action: 'sourcing:create', label: '登记需求' },
      { action: 'sourcing:update', label: '维护需求资料' },
      { action: 'sourcing:match', label: '维护授权候选' },
      { action: 'sourcing:progress', label: '人工推进寻源' },
    ],
    note: '采购只见共享内容；混合域主单写入还需完整明细授权。',
  },
  {
    id: 'quotes',
    reads: ['quote:read'],
    manages: 'quote:confirm',
    operations: [
      { action: 'inquiry:create', label: '发起模拟询价' },
      { action: 'quote:create', label: '录入报价' },
      { action: 'quote:verify', label: '来源核验' },
      { action: 'quote:correct', label: '追加更正' },
      { action: 'quote:confirm', label: '正式确认（模拟）' },
    ],
    note: '按当前渠道授权过滤；价格版本追加，不代表真实合同签署。',
  },
  {
    id: 'bulk-quotes',
    reads: ['bulk:read'],
    manages: 'bulk:create',
    operations: [
      { action: 'bulk:create', label: '创建批次草稿' },
      { action: 'bulk:update', label: '维护批次' },
      { action: 'bulk:preview', label: '逐行预览' },
      { action: 'bulk:submit', label: '整批追加报价' },
    ],
    note: '整批及历史渠道引用均须授权；提交不等于正式确认。',
  },
  {
    id: 'purchase-analysis',
    reads: ['quote:read'],
    operations: [],
    note: '只读分析；基于当前获准报价与供应商范围，不产生自动采购决定。',
  },
  {
    id: 'tests',
    reads: ['test:summary', 'test:read'],
    detail: 'test:detail',
    manages: 'test:adopt',
    operations: [
      { action: 'test:create', label: '维护测试任务' },
      { action: 'test:execute', label: '人工执行测试' },
      { action: 'test:cancel', label: '取消任务' },
      { action: 'test:adopt', label: '采纳测试结论' },
      { action: 'test:review', label: '无结论审阅' },
      { action: 'test:exemption', label: '登记或撤销质量豁免' },
    ],
    note: '采购/运维仅技术摘要；供应商仅自身旧基础读取，没有新测试管理入口。',
  },
  {
    id: 'remediations',
    reads: ['remediation:summary', 'remediation:read'],
    detail: 'remediation:detail',
    manages: 'remediation:close',
    operations: [
      { action: 'remediation:create', label: '人工登记整改' },
      { action: 'remediation:assign', label: '分配技术负责人或期限' },
      { action: 'remediation:followup', label: '跟进整改' },
      { action: 'remediation:submit', label: '提交本轮结果' },
      { action: 'remediation:link-test', label: '关联已有复测' },
      { action: 'remediation:return', label: '退回整改' },
      { action: 'remediation:close', label: '正常或例外关闭' },
    ],
    note: '测试仅本人负责的事项可跟进、提交及关联；采购/运维仅摘要；供应商仅旧基础读取，无新门户。',
  },
  {
    id: 'governance',
    reads: ['incident:read'],
    operations: [],
    note: 'Stage 08 尚未开放。既有事件基础读取不代表完整供应商治理功能。',
  },
];
/** Public display only: no record grants, business APIs, or new authorization source. */
function displayContext(profile: DemoProfile): AccessContext {
  return {
    user: profile.user,
    domains: profile.domains,
    supplierIds: [],
    customerIds: [],
  };
}
export type AccessLabel =
  '可管理' | '可执行特定操作' | '只读' | '仅摘要' | '无权限' | '未开放';
export function modulePerspectives(profile: DemoProfile) {
  const ctx = displayContext(profile);
  return modules.map((m) => {
    const nav = navigation.find((n) => n.id === m.id)!;
    const granted = m.operations.filter((op) => can(ctx, op.action));
    const reads = m.reads.some((a) => can(ctx, a));
    const permittedRoute = nav.permission === null || can(ctx, nav.permission);
    let capability: AccessLabel = '无权限';
    if (!nav.available) capability = '未开放';
    else if (m.manages && can(ctx, m.manages)) capability = '可管理';
    else if (granted.length) capability = '可执行特定操作';
    else if (reads)
      capability =
        m.detail && !can(ctx, m.detail) && permittedRoute ? '仅摘要' : '只读';
    return {
      id: m.id,
      name: nav.name,
      path: nav.path,
      capability,
      available: nav.available,
      operations: granted.map((g) => ({ ...g })),
      note: m.note,
      identityStatus: !nav.available
        ? '未开放'
        : !profile.domains.length
          ? '暂无业务域授权'
          : !permittedRoute
            ? '无新模块入口'
            : capability,
      canExperience:
        nav.available && permittedRoute && profile.domains.length > 0,
    };
  });
}
const fieldLabels: readonly { field: SensitiveField; label: string }[] = [
  { field: 'supplierIdentity', label: '真实供应商身份' },
  { field: 'supplierContact', label: '供应商联系资料' },
  { field: 'purchaseDiscount', label: '采购商业折扣' },
  { field: 'customerIdentity', label: '客户身份' },
  { field: 'customerPrice', label: '客户售价' },
  { field: 'internalMetadata', label: '内部技术元数据' },
];
export function fieldPerspectives(profile: DemoProfile) {
  const ctx = displayContext(profile);
  return [
    ...fieldLabels.map((f) => ({
      label: f.label,
      allowed: canSeeField(ctx, f.field),
      note:
        f.field === 'customerPrice'
          ? '当前字段策略不代表已上线销售三档价格模块；服务按具体接口投影。'
          : f.field === 'supplierIdentity' &&
              profile.user.role === 'SupplierUser'
            ? '仅自身获准供应商。'
            : '角色允许仍须通过具体记录范围和接口字段白名单。',
    })),
    {
      label: '完整通用审计',
      allowed: can(ctx, 'audit:read'),
      note: '专用技术历史与通用审计是独立权限，不互相授予。',
    },
    {
      label: '新整改完整详情',
      allowed: can(ctx, 'remediation:detail'),
      note: '技术摘要不包含内部说明、证据或完整历史。',
    },
  ];
}

export function experienceEntries(profile: DemoProfile) {
  const ctx = displayContext(profile);
  return navigation
    .filter(
      (n) =>
        n.available &&
        n.id !== 'roles' &&
        (n.permission === null || can(ctx, n.permission)) &&
        (n.id === 'dashboard' || profile.domains.length > 0),
    )
    .map((n) => ({ id: n.id, name: n.name, path: n.path }));
}
