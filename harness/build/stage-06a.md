# Stage 06A：采购价格分析交付

基线e67d257abd7f46ce46241b82a4a5e7d888a46c99，分支stage-06a-procurement-analytics，仅本期只读分析。

实际入口/analytics/procurement；运营/采购选授权域、模型、供应商、渠道、厂商、报价状态、币种和北京时间创建日。指标反映当前筛选的授权报价，询价只按渠道关联范围统计。覆盖按稳定ID，正式/优惠历史覆盖与当前生效分类分开，不能把报价记录数相加当供应商数量。未来7天优惠窗口为(now,now+7×24小时]，明确显示北京时间；旧Dashboard指标复用同口径并新增待办链接。

同模型价格比较保留最近报价、最近已确认正式记录和当前有效优惠，不选择唯一结算价。原compareQuotes逻辑不改，只有完整且相同的模型/币种/价格基准/规格/计量维度数量单位/状态/有效期才可比。价格未知不补0或官方默认值，金额仍为十进制文本，不做汇率/金额结算/真实节约。

渠道趋势按完整价格口径和原录入状态分组，实际时间比例横轴（创建或供应商报价时间），整数基点纵轴。图例列明单位；确认不新增价格点，历史纠错菱形单列不连入供应商调价线。不同有效期的同口径历史点仅观察记录变化，不宣称商业横向可比；不足两个非纠错同组点、未知口径和异常时间都有原因说明。正式/优惠有形状及线型区别，不只靠颜色。

询价当前已发起=sent/quoted（关闭另列，不推测之前发送）；待回复=sent、收到=quoted、逾期=sent且截止早于查询时刻。台账登记/报价时间不等于真实发送或回复，响应时长不计算。采购目标无基准和规格，显示报价减目标的数字差并固定“同基准可比性未确认”；经过验证的达成率=null，不算实际采购节约，不改目标/匹配/进度。

API：ProcurementAnalyticsApi扩展统一Adapter，先检查活动会话/quote:read/域，再组合原报价授权读（50条分页全部读取）和当前目录。Supplier/Channel/Sourcing/Quote四Repository不改格式，不写分析状态。业务纯函数/服务最小投影/UI分离，无客户/售价/运营原文/证据/联系人/备注/原始快照，无正式导出。原授权渠道仍按维护供应商和厂商域过滤；角色/域切换清理当前分析视图。停用渠道保留报价并提示状态，重新查询反映新增/核验/确认/更正。

验证：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify完整退出码0；严格类型、ESLint、Prettier、Vitest14文件/420测试（原378+新增42）、Playwright37测试（原33+新增4）、生产构建全部通过。原测试文件/断言未修改，未放宽类型、超时或重试。最终版本复核通过；既有共享块约1,047kB（gzip333kB）警告保留，不提高阈值。

截图由真实页面录入生成，逐张视觉检查，pageerror=0；1280px和390px文档无整体横向溢出，1440/1280/390交互由浏览器测试覆盖。比较截图实际通过UI录入第二家虚构供应商的未知口径报价，趋势截图通过UI录入同口径文本报价；没有修改fixture伪造保存。

截图（真实页面操作，均模拟数据）：

- [1440px分析工作台](stage-06a-overview-1440.png)
- [同模型供应商渠道比较](stage-06a-comparison-1440.png)
- [渠道报价趋势](stage-06a-trend-1440.png)
- [390px响应式](stage-06a-mobile-390.png)

已知限制：单浏览器Mock不提供生产鉴权、防篡改或跨窗口一致快照；实际供应商发送/回复时间、目标基准、合同金融/舍入、附件导出、用量和结算优先级继续TBD。本期无真实OP/Monitor/通知、排名、中标、自动采购、批量调价或新审批。README额外更新当前入口与停止阶段；PRODUCT_SCOPE记录本期正式开放。仅普通提交推送，不修改main，不进入06B。

本批修改/新增完整清单（35个）：

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
- `harness/build/stage-06a-comparison-1440.png`
- `harness/build/stage-06a-mobile-390.png`
- `harness/build/stage-06a-overview-1440.png`
- `harness/build/stage-06a-trend-1440.png`
- `harness/build/stage-06a.md`
- `harness/context/stage-06a.md`
- `src/app/AppShell.tsx`
- `src/app/ProcurementAnalyticsRoute.tsx`
- `src/app/navigation.tsx`
- `src/app/router.tsx`
- `src/domain/procurement-analytics.ts`
- `src/domain/quotations.ts`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/procurement-analytics/AnalysisTable.tsx`
- `src/features/procurement-analytics/PriceTrend.tsx`
- `src/features/procurement-analytics/ProcurementAnalyticsPage.tsx`
- `src/features/procurement-analytics/analytics.css`
- `src/features/procurement-analytics/labels.ts`
- `src/mocks/mock-adapter.ts`
- `src/services/api-adapter.ts`
- `src/services/dashboard.ts`
- `src/services/procurement-analytics-types.ts`
- `src/services/procurement-analytics.ts`
- `tests/e2e/procurement-analytics.spec.ts`
- `tests/unit/procurement-analytics.test.ts`
