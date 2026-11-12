# Stage 02 交付

范围：AppShell、单一导航配置、中文顶部工具栏、角色/业务域演示切换、授权数据工作台、通用反馈状态和其余模块占位页。没有业务编辑、真实登录、生产接口或新数据库。

路由及规划见 docs/PRODUCT_SCOPE.md。视觉规范见 docs/UI_GUIDELINES.md。指标口径见 docs/DECISIONS.md 的 D02-05/06/07。

代码入口：src/app/AppShell.tsx、navigation.tsx、router.tsx；src/features/dashboard；src/features/placeholder；src/services/demo-session.ts、dashboard.ts。页面不依赖原始 Mock，领域和既有权限/报价/OP 规则未修改。

验证入口：npm run verify；云环境使用 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium。原有 65 个单元测试和原 Playwright 保留，新增聚合/Adapter权限/查询生命周期/布局路由测试。最终结果见 build-log.md。

基线 6b0324d70b7425cafa9f8073be0d7dd6054ad802；交付于 stage-02-app-shell 独立提交，不合并 main。停止在 Stage 02。
