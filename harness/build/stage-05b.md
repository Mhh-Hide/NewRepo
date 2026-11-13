# Stage 05B：供应商询价、采购报价与价格版本管理

基线 383aabee1ff5d6aad678d01061f012f24db20207；交付分支 stage-05b-quotation-management。

流程：/quotes 的询价页签创建模拟询价、记录人工跟进；收到回复录入关联报价，也可录入日常报价。保存后进入 /quotes/:quoteId，采购/运营独立核验来源，运营才能模拟正式确认（不代表合同签署）。后续真实报价与录入更正分开来源，更正追加新 ID 并链接父记录；原值不可覆盖。临时优惠独立起止，过期保留历史，不自动选唯一结算价。

兼容 ChannelQuote/DiscountBps，PriceSpec 记录明确币种、基准、规格、计量维度/数量/单位与可空金额；历史缺失保留未知，不编造。金额为最多12位整数/6位小数的文本，bigint 精确比较，不用浮点价格。跨币种/单位/维度/基准等不可比时列原因，不用折扣差代表节约比例。采购目标保持独立，缺基准时仅并列展示不可比。

权限：运营/采购读取、录入、更正、核验及询价维护；正式确认独立权限仅运营。其他角色无上游价格读取，前台模型资源不展示成本。需求选项只用共享内容，报价/历史显式投影，不返回客户、运营原文或原始业务快照。

QuoteRepository v1 单键原子保存报价、询价、决策、审计和幂等请求；旧三个存储格式不变。报价/决策/审计前缀只追加。渠道详情、寻源关联、旧 getQuoteHistory 和 Dashboard 共用当前报价源；动态引用会阻止渠道/寻源局部重置，必须先独立确认报价重置，不能静默删除价格历史。

验证：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify 完整退出码 0。严格类型、ESLint、Prettier、Vitest 13 文件 / 360 测试（原295+新增65）、Playwright 33 测试（原27+新增6）、生产构建全部通过。保留既有用例；旧占位导航改用仍未开放的模型测试页，Dashboard 断言加入新报价指标。新增用例覆盖询价回复原子保存、来源/确认权限、追加更正、价格口径、精确金额、过期、幂等/冲突、存储失败、刷新恢复、跨模块读与重置、角色隔离、390px 表单。未关闭断言或放宽类型/超时/重试。共享构建块仍有约 1,047 kB（gzip 333 kB）提示，阈值未提高。

截图由实际 Chromium 页面操作取得并逐张检查；截图流程 pageerror=0，额外检查1280px页面无整体横向溢出，390px由浏览器用例覆盖。所有身份、价格、依据均为模拟数据。

截图：

- [1440px 报价台账](stage-05b-quotes-1440.png)
- [报价录入](stage-05b-editor-1440.png)
- [模拟正式确认](stage-05b-confirm-1440.png)
- [历史及更正](stage-05b-history-1440.png)
- [寻源需求与报价关联](stage-05b-sourcing-1440.png)

主要变更：domain/quotations 与 QuotationApi 类型；QuoteRepository/Api、Mock Adapter 统一报价读边界和重置保护；报价模块/路由/导航；渠道/寻源关联面板和 Dashboard；新增单元/E2E；指定 docs/Harness。README 额外更新本期入口、操作和重置顺序，避免继续按旧占位说明使用。

已知限制：本地 Mock 不等于后端安全或多窗口事务。目标基准、真实审批/合同、金融精度/舍入、供应商门户、文档/附件/导出和促销结算优先级继续 TBD。不提供正式批量调价、绩效、外部通信、汇率或自动采购。Stage 06 未开始。

本批修改/新增文件完整清单（43个）：

- `README.md`
- `docs/BUSINESS_RULES.md`
- `docs/DATA_MODEL.md`
- `docs/DECISIONS.md`
- `docs/PERMISSIONS.md`
- `docs/UI_GUIDELINES.md`
- `docs/WORKFLOWS.md`
- `harness/ROADMAP.md`
- `harness/build-log.md`
- `harness/build/stage-05b-confirm-1440.png`
- `harness/build/stage-05b-editor-1440.png`
- `harness/build/stage-05b-history-1440.png`
- `harness/build/stage-05b-quotes-1440.png`
- `harness/build/stage-05b-sourcing-1440.png`
- `harness/build/stage-05b.md`
- `harness/context/stage-05b.md`
- `src/app/AppShell.tsx`
- `src/app/QuotationRoutes.tsx`
- `src/app/navigation.tsx`
- `src/app/router.tsx`
- `src/auth/policy.ts`
- `src/auth/types.ts`
- `src/domain/quotations.ts`
- `src/features/channels/ChannelDetailPage.tsx`
- `src/features/quotes/InquiryPanel.tsx`
- `src/features/quotes/QuoteDetailPage.tsx`
- `src/features/quotes/QuoteEditor.tsx`
- `src/features/quotes/QuoteListPage.tsx`
- `src/features/quotes/QuoteTable.tsx`
- `src/features/quotes/RelatedQuotes.tsx`
- `src/features/quotes/quote-format.ts`
- `src/features/quotes/quotes.css`
- `src/features/sourcing/SourcingDetailPage.tsx`
- `src/mocks/mock-adapter.ts`
- `src/mocks/quotation-api.ts`
- `src/mocks/quote-repository.ts`
- `src/services/api-adapter.ts`
- `src/services/dashboard.ts`
- `src/services/quotation-types.ts`
- `tests/e2e/app-shell.spec.ts`
- `tests/e2e/quotations.spec.ts`
- `tests/unit/dashboard.test.ts`
- `tests/unit/quotations.test.ts`
