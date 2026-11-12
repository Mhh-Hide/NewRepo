# Demo 权限

单一活动角色与独立业务域/供应商/客户授权关系见 types.ts；动作与字段白名单见 policy.ts；纯 ViewModel 投影见 projections.ts。Mock Adapter 在投影之前校验记录范围，并返回深拷贝；不依赖 React 隐藏字段。

createMockAdapter(userId) 仅是演示身份选择，不是真实认证。原始 Mock 数据存在前端代码里，不提供生产安全。真实授权必须由后端强制执行。规则矩阵与 TBD 见 docs/PERMISSIONS.md。
