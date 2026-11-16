# Stage 07C 交付：角色视角与权限展示

## 页面与状态

正式开放 `/system/roles`，展示实际身份、八类角色紧凑卡、每角色多个模拟用户、权限矩阵、敏感信息边界、业务域控制和体验入口。标签来自现有 roleLabels，身份及授权域来自公开 DemoProfile。

当前身份直接读取 AppShell 的 Outlet DemoSession。预览只保存角色/用户选择，有“尚未切换”提示，不创建第二份业务会话。通过 DemoControlsContext 调用与 Topbar 完全相同的 changeUser/changeDomain；体验入口先切换后真实导航。旧 Session 写能力撤销，原 maas-demo-selection 与 sessionStorage 恢复保留，身份/域变化卸载旧页面与预览。新会话校验失败时不撤销原有效会话。

## 权限一致性与隐私

模块/动作中文映射只作展示，权限逐项调用 can()，字段边界来自 canSeeField()。入口读取 navigation.available/permission，治理始终未开放；旧自身测试/整改基础读取与新管理路由明确区分。矩阵分别显示角色功能许可与身份入口状态，无业务域身份不能体验业务数据，仅可进入空工作台。

角色页不查询其他用户业务 API，不返回原始 AccessContext、供应商/客户授权清单、报价、客户资料或审计。业务服务中的采购维护、供应商自身、测试本人负责人、域、版本和状态规则均保持。前台不获得供应商身份、采购折扣或内部整改详情，不宣称销售三档价格已实现。

## 验证

新增 27 个单元测试涵盖八角色策略映射、导航一致性、摘要/只读/未开放、字段限制、多身份与无域、统一切换、单域防扩权、旧写 Session 失效、无效切换保留原 Session，以及页面预览/切换同步。

新增 6 个 Playwright 场景覆盖角色页、采购摘要预览、切换测试身份与体验、菜单返回、销售匿名资源与越权拒绝、单域/双域/无授权及刷新恢复、顶部同步、键盘操作、1440/390 无横向溢出和无 pageerror。

实际完整执行 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`，退出码 **0**：TypeScript 严格检查、ESLint 零警告、Prettier、Vitest 21 文件 / 698 测试（原 671 + 新增 27）、Playwright 69 测试（原 63 + 新增 6）及生产构建全部通过。1440px/390px、键盘、无 pageerror 和无整页横向溢出检查通过；截图已实际查看。既有 671 单元 / 63 浏览器有效覆盖保留，未发现需要迁移 `/system/roles` 占位断言的旧用例；原治理占位、导航、刷新和无授权检查保留。未修改测试超时、重试、类型严格程度或构建阈值。

首轮新增浏览器测试有模拟用户名称与菜单图标参与可访问名称造成的定位错误，校正为真实 Profile 名称和对应菜单定位；同时让页面与顶部用户选择器使用独立可访问名称，避免定位歧义，没有修改权限规则。

截图为真实 Chromium 模拟界面：

- [1440px](screenshots/stage-07c-roles-1440.png)
- [390px](screenshots/stage-07c-roles-390.png)

## 限制与交接

这是公开前端 Mock 的权限说明与体验入口，不是真实登录、RBAC 配置或生产权限系统。抽象动作许可不保证任何特定记录可操作，实际以业务 API 的授权、状态和版本校验为准。既有 localStorage 一致性及大包构建提示保持，不扩展为性能重构。

报价、寻源、渠道、测试和整改业务规则与存储 schema 均未修改。main 与基线分支不修改、不合并、不强推；仅普通推送 Stage 07C。没有自动部署、供应商门户、生产 API 或 Stage 08 开发。最终 SHA 以本报告所属提交与交付消息为准，避免提交内自引用。

## 修改文件

- `README.md`
- `docs/DECISIONS.md`
- `docs/PERMISSIONS.md`
- `docs/PRODUCT_SCOPE.md`
- `docs/UI_GUIDELINES.md`
- `harness/ROADMAP.md`
- `harness/build-log.md`
- `harness/build/screenshots/stage-07c-roles-1440.png`
- `harness/build/screenshots/stage-07c-roles-390.png`
- `harness/build/stage-07c.md`
- `harness/context/stage-07c.md`
- `src/app/AppShell.tsx`
- `src/app/RolePerspectivesRoute.tsx`
- `src/app/navigation.tsx`
- `src/app/router.tsx`
- `src/features/roles/RolePerspectivesPage.tsx`
- `src/features/roles/role-presenter.ts`
- `src/features/roles/roles.css`
- `src/services/demo-controls.ts`
- `src/services/demo-selection.ts`
- `tests/e2e/role-perspectives.spec.ts`
- `tests/unit/role-perspectives-ui.test.tsx`
- `tests/unit/role-perspectives.test.ts`
