# Stage 05A：采购需求管理与多供应商资源寻源

基线 4dc3c1af4915765e61699b4368a57fd9de0ad6b9；交付分支 stage-05a-procurement-sourcing。

开放页面：/sourcing 列表、运营新增/维护需求抽屉、/sourcing/:demandId 多模型明细详情、同模型候选筛选及人工匹配/进度对话框。运营分别填写受限标题/说明与客户关联、采购共享标题/摘要，至少一个模型明细，目标折扣为整数基点。采购只查看共享内容并维护候选/进度；其他角色内部商业页面拒绝，原需求摘要 API 保留。

候选使用 Stage 04B 当前统一渠道目录，供应商名称从当前主档取得；支持多渠道与供应商去重，展示能力辅助判断和人工评估。零候选与调查后确认缺口区分；三家是寻源目标，不阻止不足三家保存。历史追加前后差异，不向采购透传运营受限信息。所有展示均为模拟数据。

SourcingRepository 独立 v1 单键保存主单、明细、候选和历史，原 ID 保留、请求幂等、主单版本及 revision 检查；不修改 SupplierRepository/ChannelRepository 的存储格式。新数据通过旧需求摘要与新 API 同时查询，Dashboard 使用当前授权需求和同一覆盖统计。寻源/渠道/供应商重置独立确认并保护依赖，不静默删除其他模块数据。

验证：最终 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify` 退出码 0；严格类型、Lint、格式、Vitest 12 文件 / 295 测试（原 232 + 新 63）、Playwright 27 测试（原 21 + 新 6）、生产构建全部通过。包含原供应商/渠道/模型回归，未跳过断言或增加超时。截图流程 pageerror=0，另检查 1280px 详情无页面横向溢出，390px 由真实浏览器操作测试覆盖。新增单元场景覆盖主单多明细、定点折扣、模型/域、候选去重与能力、停用、投影/历史、旧会话、版本/幂等/失败原子性、持久化/重置及工作台同步；浏览器覆盖真实表单、采购视角、匹配/去重、刷新、Dashboard、角色拒绝及 390px。

截图：

- [桌面需求列表](stage-05a-list-1440.png)
- [多模型明细详情](stage-05a-multi-detail-1440.png)
- [候选渠道匹配操作](stage-05a-candidate-picker-1440.png)
- [采购共享视角详情](stage-05a-procurement-detail-1440.png)

主要修改：domain/sourcing 规则/扩展、可空客户及 excluded 兼容；auth 新动作与原摘要投影兼容；services SourcingApi 与 Dashboard 统计；mocks SourcingRepository/Api 和统一需求数据源、渠道重置依赖保护；features/sourcing 与懒加载路由/导航；单元/E2E；指定文档/Harness。README 额外更新当前启动入口、操作与重置说明，避免读到旧阶段的只读说明。

已知限制：Mock localStorage 不是生产安全/多窗口事务；人工初步符合与能力信息不足可同时存在，不等于自动验证或正式采购完成；地区条件仅人工核实。生产共享文本/附件/导出、细粒度需求分配、关闭重开/模型关联迁移、后端编号分配待确认。无真实 API、数据库、报价写入、合同流程、自动采购或外发通知。Stage 05B 未开始。

生产构建保留共享块约 1,047 kB（gzip 333 kB）的既有体积提示，没有提高阈值或新增依赖。

本批文件清单（41 个）：

```text
README.md
docs/BUSINESS_RULES.md
docs/DATA_MODEL.md
docs/DECISIONS.md
docs/PERMISSIONS.md
docs/UI_GUIDELINES.md
docs/WORKFLOWS.md
harness/ROADMAP.md
harness/build-log.md
harness/build/stage-05a-candidate-picker-1440.png
harness/build/stage-05a-list-1440.png
harness/build/stage-05a-multi-detail-1440.png
harness/build/stage-05a-procurement-detail-1440.png
harness/build/stage-05a.md
harness/context/stage-05a.md
src/app/AppShell.tsx
src/app/SourcingRoutes.tsx
src/app/navigation.tsx
src/app/router.tsx
src/auth/policy.ts
src/auth/projections.ts
src/auth/types.ts
src/auth/view-models.ts
src/domain/entities.ts
src/domain/sourcing.ts
src/domain/validation.ts
src/features/sourcing/CandidatePicker.tsx
src/features/sourcing/SourcingDetailPage.tsx
src/features/sourcing/SourcingEditor.tsx
src/features/sourcing/SourcingListPage.tsx
src/features/sourcing/labels.ts
src/features/sourcing/sourcing.css
src/mocks/mock-adapter.ts
src/mocks/sourcing-api.ts
src/mocks/sourcing-repository.ts
src/services/api-adapter.ts
src/services/dashboard.ts
src/services/sourcing-types.ts
tests/e2e/sourcing.spec.ts
tests/unit/dashboard.test.ts
tests/unit/sourcing.test.ts
```
