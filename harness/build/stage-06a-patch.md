# Stage 06A验收补丁：报价时效和正式历史

基线b52304deb9f3c21ee31de948d3ff8eaf16c3d4e5，原stage-06a-procurement-analytics分支继续。仅本期验收问题，不开始06B。

根因一：compareAnalysis原先用analysisValidity(q,0)仅判断结构异常，结果没有实际查询时刻的时效信息，容易把历史可比误读为当前有效。现在必传now，页面使用分析响应asOf；specComparable（规格）、comparable（原商业比较）、currentValidity（两条报价时效）分别输出，配固定采购用途提示。过期或未来同口径报价仍可作历史/约定比较，但不能自动作为当前采购依据；缺失起点/异常日期不假装当前有效。Stage05B compareQuotes逻辑原样保留。

根因二：渠道只有latest/latestFormal/activePromotions，缺少当前有效正式集合。latestFormal本来可以是过期/未来已确认历史，界面没有独立当前正式列。现在channelPriceViews(records,now)返回activeFormals全部有效正式记录，统计和明细共用isCurrentFormal，保留已确认人/时间及有效区间要求；历史另显示查询时刻标签。没有当前正式记录明确提示，不回退历史报价；多条全部列出，不选择唯一结算价。当前优惠独立保留。

时间规则：起点包含、截止不含，允许有明确起点且无截止的开放区间；缺失起点为未知（除已明确到期），无法解析/倒置/零长区间异常。趋势只检查历史区间结构，不依赖假时钟，不删除过期点。实际报价仍来自原授权API/Repository，没有缓存、存储迁移、审计修改、权限扩展或新业务功能；Dashboard优惠提醒原逻辑保留。

新增26个单元测试：当前/到期/未来/缺失/异常、不同口径、同口径历史、起止边界、无确认、历史与当前分离、多条正式与优惠并存、实际API时钟推进、跨模块计数/提醒及只读持久化。既有分析单元只补传now，原断言不变。新增2个浏览器用例：1440/390多条正式及无有效价提示；真实UI创建/核验/确认未来报价，推进查询时刻至起点/截止，验证生效/到期和历史保留。

完整验证：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify完整退出码0：严格类型、ESLint、Prettier、Vitest15文件/446测试（原420+新增26）、Playwright39测试（原37+新增2）、生产构建全部通过。未删旧测试/放宽断言/跳过用例或调高超时。构建保留既有约1,047kB共享块提示，未调整阈值。

1440px/390px真实浏览器交互及横向溢出检查通过，两个截图已视觉核验。新增E2E初次因多个渠道同时“有效期内”导致全页文字定位不唯一，已改按对应渠道行定位，未放宽断言；最终完整回归通过。

风险：未新增本期业务风险或后续能力。原Mock生产鉴权/跨窗口一致性限制不属于本次修复；不推进相关设计。历史可比仍不代表可执行采购，正式与优惠并存优先级不在本补丁内决定。

验收截图（真实页面模拟操作与受控查询时钟，已视觉检查）：

- [1440px已到期历史与当前正式价分离](stage-06a-patch-expired-1440.png)
- [390px多条当前正式报价及空状态](stage-06a-patch-current-390.png)

本补丁修改/新增文件完整清单（14个）：

- `docs/BUSINESS_RULES.md`
- `docs/DATA_MODEL.md`
- `harness/build-log.md`
- `harness/build/stage-06a-patch-current-390.png`
- `harness/build/stage-06a-patch-expired-1440.png`
- `harness/build/stage-06a-patch.md`
- `harness/context/stage-06a.md`
- `src/domain/procurement-analytics.ts`
- `src/features/procurement-analytics/AnalysisTable.tsx`
- `src/features/procurement-analytics/ProcurementAnalyticsPage.tsx`
- `src/services/procurement-analytics.ts`
- `tests/e2e/stage-06a-patch.spec.ts`
- `tests/unit/procurement-analytics.test.ts`
- `tests/unit/stage-06a-patch.test.ts`
