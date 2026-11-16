# Stage 07B：渠道级供应商技术整改交付

## 功能与入口

正式开放 `/remediations`、`/remediations/:remediationId`。支持人工技术问题或真实保存的 failed 执行来源、同来源独立拆分原因、独立技术负责人、期限、跟进、多轮提交、关联多个已有复测、运营退回、正常关闭、例外关闭及不可变历史。测试、渠道、供应商、寻源及工作台显示授权技术摘要。全部为 Mock，不接入生产或供应商门户。

## 状态与关闭

保留 open/in_progress/submitted/closed。开始只从 open，提交只从 in_progress，运营退回 submitted 后增加轮次，正常关闭只从 submitted；例外关闭允许任意未关闭状态。closed 不重开、不编辑、不追加业务事实。

正常关闭显式选择执行和采纳结论，要求：当前轮次有效提交、已关联本轮复测、同渠道及验证类型、passed/finished、当前配置与目标版本、相同结构化目标引用、人工适用性说明、startedAt >= 本轮 submittedAt、仍现行的运营采纳依据，以及没有同目标范围内更晚未处理 failed/inconclusive。预览绑定两聚合事实，确认重验；不取默认最新通过，不补造采纳，不修改测试事实。

例外分类 duplicate/no_longer_applicable/unable_to_verify/other，必须理由，固定显示“例外结束，不代表技术修复已验证成功。”，不冒充正常验证成功。

## 工程、迁移与历史

新增 RemediationRepository v1，ChannelRepository 保持 v2。整改主档版本化，submissions/links/closures/events/requests 只追加；完整候选校验后单次 setItem。幂等先授权，再比较 actor/requestId/operation/payload 指纹，冲突拒绝，持久化失败不返回成功。

旧 Fixture ID、关联、原描述、状态、回复、人员及时间均保留。rem-other-supplier 的 passed 来源保持原样，标记 legacy；负责人、期限、创建元数据和轮次未知均为空，不伪造新提交。旧事项需运营补充分类、范围、目标与独立摘要；保留原状态，旧 submitted 不自动满足本轮提交条件。

渠道重置与正常写入检查实际整改聚合的所有来源、轮次链接及关闭结论，涵盖 closed、legacy、初始渠道新增执行和历史轮次，拒绝删除被引用的任务/执行/结论。整改重置仅作用自身存储，双域运营全部域二次确认。供应商重置仍由渠道及既有引用保护把关，报价/寻源全图校验切换为动态整改；其 schema、价格/采购规则不变。

## 权限与字段

运营有授权域内全流程权限；测试可创建、读取专用技术详情和历史，仅本人负责时跟进/提交/关联，没有分配、期限、退回、关闭或通用 audit:read。采购按当前供应商维护和厂商域获得独立摘要，运维仅授权摘要，摘要不返回内部描述、旧回复、证据及审计。供应商只保留自身 legacy 基础读取；前台无新管理接口。

新接口走统一 Adapter；服务层检查会话有效性、范围、版本、状态和负责人。摘要不复制自由文本，不依赖页面隐藏字段。

## 测试和浏览器

新增 40 个单元测试覆盖状态、轮次、来源、权限、幂等、存储失败、版本冲突、正常关闭约束、例外关闭、动态引用及报价/寻源/测试合法写入。保留原 631 个单元测试。

新增 7 个浏览器场景覆盖创建至多轮提交、已有复测关联与正常关闭、例外关闭、历史刷新、角色切换及权限拒绝、quota 失败保留输入、双窗口版本冲突、1440/390 无整页横向溢出与无 pageerror。浏览器正常关闭场景的复测前置数据通过既有 TestingApi 创建、执行和采纳，关联、预览和关闭通过真实页面完成；Stage 07A 原有浏览器用例继续验证测试操作 UI。

旧 `app-shell.spec.ts` 仅迁移 `/remediations` 的“即将开放/规划阶段07”断言为真实管理页、刷新及新建入口；保留原导航、身份和刷新测试，并增加 `/governance` 仍未开放断言。

实际完整执行 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`，退出码 **0**：严格 TypeScript、ESLint 零警告、Prettier、Vitest 19 文件 / 671 测试（原 631 + 新增 40）、Playwright 63 测试（原 56 + 新增 7）、生产构建全部通过。1440px/390px 布局及无 pageerror 检查通过。没有增加测试超时或重试，没有关闭类型检查、删减旧测试或调高构建警告阈值。

首轮新增浏览器用例暴露 Ant Design 必填标记/双字按钮自动空格导致可访问名称不一致及 Form 尚未挂载警告，修正控件配置后 7 个场景通过。跨模块新增单测发现渠道重置先返回通用引用错误，调整为优先给出明确整改历史引用保护原因，保留原拒绝断言。

截图来自真实 Chromium 模拟页面，已视觉查看：

- [1440px](screenshots/stage-07b-1440.png)
- [390px](screenshots/stage-07b-390.png)

## 限制和交接

localStorage 单键提交及版本检查不是跨标签页 CAS 或两键事务。只能拒绝已检测的过期事实，不能保证跨设备一致性或阻止不合作旧客户端。浏览器 Mock 鉴权和字段投影不代替生产后端安全；自由文本仅使用虚构技术信息，没有自动敏感内容审核。提交或关联失败不删除测试作补偿。

已有提交/复测关联的事项不再覆盖验证范围；新问题另登记，保持历史解释稳定。初始 legacy 元数据未知不推断。原约 1,047 kB 共享块构建提示保留。

Stage 08 仅交接稳定 remediationId/channelId/supplierId、状态、关闭类型、时间及专用历史查询边界；不实施评分、处罚、排名或黑名单。

最终 SHA 以本报告所属提交及最终交付消息为准，避免提交内自引用 SHA。只普通推送 Stage 07B，不修改或合并 main，完成后停止。

## 修改文件

- `README.md`
- `docs/BUSINESS_RULES.md`
- `docs/DATA_MODEL.md`
- `docs/DECISIONS.md`
- `docs/INTEGRATIONS.md`
- `docs/PERMISSIONS.md`
- `docs/PRODUCT_SCOPE.md`
- `docs/UI_GUIDELINES.md`
- `docs/WORKFLOWS.md`
- `harness/ROADMAP.md`
- `harness/build-log.md`
- `harness/build/screenshots/stage-07b-1440.png`
- `harness/build/screenshots/stage-07b-390.png`
- `harness/build/stage-07b.md`
- `harness/context/stage-07b.md`
- `src/app/RemediationRoute.tsx`
- `src/app/navigation.tsx`
- `src/app/router.tsx`
- `src/auth/policy.ts`
- `src/auth/types.ts`
- `src/domain/remediations.ts`
- `src/features/channels/ChannelDetailPage.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/remediations/RemediationPage.tsx`
- `src/features/remediations/RemediationSummaryPanel.tsx`
- `src/features/suppliers/SupplierDetailPage.tsx`
- `src/features/testing/TestSummaryPanel.tsx`
- `src/features/testing/TestingPage.tsx`
- `src/mocks/channel-repository.ts`
- `src/mocks/mock-adapter.ts`
- `src/mocks/quote-repository.ts`
- `src/mocks/remediation-api.ts`
- `src/mocks/remediation-repository.ts`
- `src/mocks/sourcing-repository.ts`
- `src/services/api-adapter.ts`
- `src/services/remediation-types.ts`
- `tests/e2e/app-shell.spec.ts`
- `tests/e2e/remediations.spec.ts`
- `tests/unit/remediations.test.ts`
