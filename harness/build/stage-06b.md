# Stage 06B 交付报告

基线：863f8444cab5147b67f501ba53cc425f2de009d7。交付分支：stage-06b-bulk-quotation-adjustment。最终提交可通过该分支 `git rev-parse HEAD` 核对（交付报告随该提交保存，避免自引用 SHA）。

已交付授权批次列表/筛选、同供应商多模型多渠道与同渠道多行编辑、选中行共同字段、半成品草稿保存/恢复、逐行校验/参照/商业条件/有效期预览、二次确认、全有或全无提交、只读结果及历史、单条报价与批次双向追溯。批次状态仅 draft/submitted；校验不产生新业务状态。完全重复警告不合并。未确认的旧正式价、优惠、有效期和结算选择保持原规则。

QuoteRepository v2 保留原五集合和存储键，新增批次、追加事件、回执映射；读取不改盘，首次成功写前完整验证当前/候选再迁移，不重新生成旧 ID，不回退坏数据。失败不破坏旧数据。所有原历史与新事件/回执受前缀保护，已提交批次不可变；inquiries 保留跟进版本/审计。合作旧 v1 页面普通写入拒绝 v2；不合作旧客户端直接 Storage 写入/显式重置仍无法防御。

服务复用单条报价 prepareQuote、PriceSpec、基点及比较规则，不循环 createQuote。内存构造全部报价、审计、批次、必要询价跟进、稳定映射和幂等结果，完整校验后一次 setItem。无第二价格缓存。整批失败不返回成功、不补偿删除历史。版本令牌检查资源与决策/期间变化；单次 setItem 及完整快照比较仍不等于数据库 CAS/多标签页强一致。

bulk 独立权限只给运营/采购，逐行继续检查 quote:create/correct。完整授权覆盖现存及历史渠道、维护关系与模型厂商域；部分域整批隐藏/拒绝，其他角色所有批次端点拒绝；字段显式投影。原单条核验可继续，正式确认仅运营，无批量核验/确认。报价重置显式包含完整批次；其他模块重置保护现存/已删除行的动态引用。

报价台账/详情、渠道和供应商授权查询、寻源关联、采购分析及 Dashboard 继续共用 QuoteRepository。刷新后可见新报价；不修改需求目标、候选、资源/测试/接入/OP 状态，不自动覆盖多个正式价或优惠。

验证记录：第一轮完整 verify 退出码0，严格类型、ESLint、Prettier、16文件/525单元、45浏览器及生产构建全部通过。随后补齐3个边界用例，新增单元文件82测试通过（原446保留，总计528）；最终再次完整verify退出码0：严格TypeScript、ESLint、Prettier、Vitest 16文件/528测试（原446+新增82）、Playwright 45测试（原39+新增6）、生产构建全部通过。旧测试/断言/超时未改。共享块1,047.23kB（gzip333.25kB）提示保留，未提高阈值。执行命令：

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`

截图：[1440px](screenshots/stage-06b-1440.png)、[390px](screenshots/stage-06b-390.png)。浏览器检查创建、多行、恢复、修复、预览、提交、历史与报价/分析联动，另检查存储失败重试、双标签页版本冲突、角色拒绝、响应式及页面错误。截图仅模拟资料；明细局部滚动，整页不横向溢出。

发现并解决：删除跨域行后历史泄露风险（历史渠道完整授权）；未填表单 undefined 导致草稿结构拒绝（界面提交前移除未知可选项）；导航返回时创建弹窗保留（成功关闭）；加载图标/中文自动空格影响按钮可访问名称（明确 aria-label）。保留原所有断言、超时和依赖。

已知风险：Mock 数据可被本地开发工具修改，不能替代后端权限/事务；多窗口存在最后检查与写入间竞争；跨版本不合作客户端无法强制隔离。大包构建提示保留。无生产服务、真实商业数据、通知、文件导出、批量审批或 Stage 07。

## 修改文件清单（共39个）

- `README.md`
- `docs/BUSINESS_RULES.md`
- `docs/DATA_MODEL.md`
- `docs/DECISIONS.md`
- `docs/PERMISSIONS.md`
- `docs/PRODUCT_SCOPE.md`
- `docs/UI_GUIDELINES.md`
- `docs/WORKFLOWS.md`
- `harness/ROADMAP.md`
- `harness/build-log.md`
- `harness/build/screenshots/stage-06b-1440.png`
- `harness/build/screenshots/stage-06b-390.png`
- `harness/build/stage-06b.md`
- `harness/context/stage-06b.md`
- `src/app/AppShell.tsx`
- `src/app/BulkQuotationRoute.tsx`
- `src/app/navigation.tsx`
- `src/app/router.tsx`
- `src/auth/policy.ts`
- `src/auth/types.ts`
- `src/domain/bulk-quotations.ts`
- `src/domain/quotations.ts`
- `src/features/bulk-quotations/BulkItemEditor.tsx`
- `src/features/bulk-quotations/BulkQuotesPage.tsx`
- `src/features/bulk-quotations/QuoteBatchOrigin.tsx`
- `src/features/bulk-quotations/bulk.css`
- `src/features/quotes/QuoteDetailPage.tsx`
- `src/features/quotes/QuoteListPage.tsx`
- `src/mocks/bulk-quotation-api.ts`
- `src/mocks/bulk-repository-rules.ts`
- `src/mocks/mock-adapter.ts`
- `src/mocks/quotation-api.ts`
- `src/mocks/quote-command.ts`
- `src/mocks/quote-repository.ts`
- `src/services/api-adapter.ts`
- `src/services/bulk-quotation-types.ts`
- `src/services/quotation-types.ts`
- `tests/e2e/bulk-quotations.spec.ts`
- `tests/unit/bulk-quotations.test.ts`
