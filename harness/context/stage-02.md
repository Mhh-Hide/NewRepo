# Stage 02 交接

先读 AGENTS.md、docs/UI_GUIDELINES.md、PERMISSIONS.md、DECISIONS.md 及 build-log。基线为已验收 6b0324d，不是 main。

- navigation.tsx 是路由导航元数据唯一来源，定义权限、可用性和未来 Stage。占位页从同一配置读取，角色无权限时返回 403 提示。
- createDemoSession 从安全身份元数据创建已绑定用户/业务域的 Mock Adapter，原权限策略不变。u-domestic 仅国内、u-overseas 仅海外；u-ops 可切换全部授权域；u-no-domain 验证空态。
- AppShell 对用户/业务域内容树设置 key，useDashboard 额外按 API 实例隔离结果并清理过期请求。sessionStorage 仅存 userId/业务域选择，不存业务数据。身份选择不是登录，不能用于真实认证。
- loadDashboard 只聚合授权 API 返回；不导入原始 Mock，不向页面传审计快照或事件受限全文。失败整页报错，避免半成品统计。
- 资源缺口看需求明细的合适候选供应商去重数 <3，再按需求计数。寻源维度按需求明细计数，四个渠道状态维度独立。待办是角色授权范围汇总，不是认领或审批引擎。
- 无渠道供应商展示、供应商级跨域事件范围沿用 Stage 01 限制。活动每类最多最近一条，报价历史不是结算价；不引入实时监控/计量/账单。

启动：仓库根目录 npm ci，npm run dev；浏览器打开服务地址的 /dashboard。/welcome 保留原欢迎页。当前运行进程不会随环境快照保证保留，需要时重新启动。

完整验证：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify。jsdom 仅模拟缺少的浏览器几何接口；布局实测以 Chromium 为准。

等待本阶段验收，不自动开始 Stage 03。其他业务模块的页面、写 API、真实权限和生产集成均未开发。
