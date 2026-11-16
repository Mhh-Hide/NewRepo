# Stage 07C 交接

基线 713bea2ae5cb6d427096127f0583a1cee9827654；分支 stage-07c-role-perspectives；使用原 checkout。

入口 `/system/roles`。八类角色名称来自 roleLabels，一个角色对应多个公开 DemoProfile。当前身份读取 Outlet DemoSession，选择其他角色或身份只是明确标记的预览，未创建会话或调用他人 API。

role-presenter 将 can()/canSeeField() 与 navigation 转成中文模块状态、操作、字段限制和体验入口。角色抽象能力与所选身份业务域/入口分别展示。记录授权由原服务核验，未导出供应商/客户关系，不扩大任何业务权限；旧供应商基础读取不冒充新测试或整改模块访问权。

DemoControlsContext 仅提供 AppShell 的切换回调；Topbar 和角色页共用同一函数。selectDemoIdentity 重设单域或 all，replaceDemoSession 先创建验证新 Session，再 revokeWrites 旧会话，selection/session 原子更新；原 sessionStorage 键与恢复路径保留。身份/域 key 变化卸载旧页面查询和表单。体验入口先切换再 React Router 导航，不绕过实际模块授权。

无授权身份明确显示空态，不提供有业务数据的体验入口；允许空工作台。单域不可扩到另一域，双域可按原业务域筛选。完整通用审计和整改内部详情与技术摘要分开说明。

这是公开 Mock 演示，不是真实登录、用户/角色配置后台或生产安全边界；销售三档价格模块与 Stage 08 尚未开放。报价、寻源、测试、整改、渠道和存储 schema 均未改动。不执行自动部署。完成后停止等待验收。
