# Stage 03 交接

先读 AGENTS.md、DATA_MODEL、PERMISSIONS、WORKFLOWS、DECISIONS D03 与 build-log。本批基于 d996d0e，在 stage-03-supplier-management 保存。

入口：src/features/suppliers/SupplierRoute.tsx、SupplierListPage、SupplierDetailPage、SupplierEditor；query hook 负责过期响应隔离。页面不读写 localStorage/fixture，全部经统一 ApiAdapter 的 SupplierApi。

领域：Supplier 保留 id/name，新增合作状态、类别、选填联系/管理字段、创建/修改人及 version。src/domain/suppliers.ts 定义字段字典、输入和专用审计事件。

授权：src/auth/supplier-policy.ts 分离主档管理范围、采购维护授权与渠道域过滤。新无渠道主档可由授权运营及被分配采购读取；测试/运维仍需已有可见渠道，供应商仅所属主档，前台拒绝。采购负责人域不改变模型域。负责人调整转移维护授权，资源摘要仍按用户厂商域授权计算。

持久化：src/mocks/supplier-repository.ts 是唯一可变主档，浏览器键 maas-supplier-demo-v1。schemaVersion=1，包含 suppliers/scopes/maintenance/history/revision；旧 fixture 只是初始化与重置基线。每次写读最新状态，检查版本/唯一性/结构后写入，失败不提交。旧 DemoSession 的写能力在角色/域切换时失效。

历史只追加，before/after 投影给有权限角色，普通编辑不能改历史。双域运营在全部域视角可二次确认重置，恢复主档及维护授权/历史，不修改渠道、报价、测试或事件。

运行 npm run dev 后进入 /suppliers；主要流程：运营新增 → 详情 → 编辑 → 变更历史；采购仅编辑明确维护资料；启停只影响主档。有未知版本/损坏存储时先读错误提示，必要时由运营确认重置，不自动删除数据。所有表单只能填写虚构模拟信息。

验证：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify；测试覆盖创建/唯一性/权限/无渠道/并发/持久化/失败恢复/角色切换/域过滤，另验证 1440/1280/390px。原测试全部保留；Stage 02 占位测试改测仍未开放的模型资源池。

TBD：组织管理范围、多采购协作、后端认证/事务/持久审计、schema 迁移、真实备注/附件保密；localStorage 可被浏览器工具修改，不是生产安全或跨窗口事务。Stage 04 未授权，停止等待验收。
