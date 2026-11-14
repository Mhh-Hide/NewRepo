# Stage 07A 交付报告：模型渠道测试管理

## 1. 功能

正式实现 `/tests` 任务列表、授权模型/渠道/类型/状态筛选和任务详情；创建/维护目标及负责人、人工执行结果、复测、取消、运营采纳和无结论审阅、来源核验、质量豁免及撤销、专用审计。按授权提供技术摘要，与模型、渠道、寻源及工作台联动。全部标记 Mock，不连接外部模型、OP、Monitor，不开放整改写流程或07B/08。

列表分别显示当前采纳来源、该任务最近执行结果及时间、渠道待复核及风险、豁免和负责人；详情保留每轮执行、目标版本、执行人、时间和证据。提交失败保留输入，版本冲突不覆盖。

## 2. 领域语义与规则

- TestTask/TaskDefinition 管目标和当前轮次状态；不可变 TestRun 是独立开始事实，ExecutionRecord 是终态。pending→running→completed；失败也完成；同目标可复测追加，不能并行同任务。取消明确终止，null 不当 failed；cancelled不重开。
- TestConclusion 关联实际执行、类型与配置/目标版本。仅运营采纳 completed passed/failed，检查任务/执行/当前结论版本并记理由、操作者和时间。当前结论从有效依据采纳链推导，非最新执行自动替换。
- 每个新完成结果独立待复核，failed 另提示新风险；处理一条不清除其他。inconclusive不可采纳，可独立ReviewDisposition；失效目标执行也可说明后无结论结案。
- 官方渠道、有效来源核验、独立证据复用 canExemptQuality；核验、豁免及撤销/失效分别追加；豁免非 passed，连通性不可豁免。名称/容量编辑不失效；关键配置变化生成新配置版本，旧任务不能复用，恢复旧字段不复活依据。
- 测试不自动改资源启用、接入、开放、OP、报价、寻源人工匹配或需求，不创建整改，不设有效天数或自动周期复测。

## 3. 工程与权限

ChannelRepository v1→v2，键名保留。v1读时仅内存迁移，保留旧ID/任务顺序/状态、动态渠道、OP及历史；只将已有fixture执行/豁免导入一次，缺失新字段为null，不伪造采纳。写前完整校验旧/新图，单setItem提交渠道、任务、执行、采纳、审计和幂等事实。未知版本/损坏不自动清空。

不可变集合执行长度与完整前缀保护，任务身份、目标、版本及审计受校验；同actor/key/op/指纹幂等，变内容冲突。Channel/Sourcing/Quote完整图统一使用testingSnapshot；其他Repository数据格式和商业规则不变，无第二套结论/报价缓存。渠道变更返回与审计后快照保持实际投影一致。

TestingApi经统一Adapter提供summary、task/detail/options和独立写动作；Ops授权管理，Testing只执行/任务/专用历史，无audit:read/采纳/来源/豁免。采购/运维仅白名单技术摘要，采购维护供应商授权与厂商域过滤；不能拿内部说明、证据、执行ID/操作者或商业字段。供应商维持旧自身基本读取，前台拒绝新API。详情也显式投影，旧自由文本不自动共享。

显式重置说明清除初始及新增渠道上的本期测试历史；保留既有报价/寻源/供应商存储，外部动态引用冲突则拒绝。整改执行引用即使在初始渠道也检查，未来07B须接入实际整改存储。

## 4. 指标

授权范围内pending任务、running任务分别计数；当前明确采纳failed的distinct渠道、legacy失败distinct渠道、新失败待复核distinct渠道、任意结果待复核distinct渠道、当前有效豁免distinct渠道分别展示，不相加。连通性待验证为缺少当前明确采纳依据的distinct渠道，legacy仍保留来源。有依据failed计失败，不混同无依据。

旧工作台任务处理统计保留原pending/running合计口径，新精确指标共用queryTestSummaries，同步复测、采纳、审阅和豁免变化。报价优惠到期待办保持。

## 5. 测试与浏览器验收

最终真实执行 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`，退出码 **0**：

| 检查                       | 最终结果                                 |
| -------------------------- | ---------------------------------------- |
| TypeScript 严格检查        | 通过                                     |
| ESLint（0 warnings）       | 通过                                     |
| Prettier                   | 通过                                     |
| Vitest                     | 18 文件 / 631 测试通过（原563 + 新增68） |
| Playwright / 系统 Chromium | 56 测试通过（原47 + 新增9），零失败      |
| 生产构建                   | 通过                                     |

1440px工作台及390px详情截图均在授权数据就绪后生成并视觉检查，复杂表格局部滚动，整页无横向溢出；新增浏览器场景均检查无pageerror。既有共享块约1,047.62kB构建提示保留，未提高阈值或改依赖。

初轮完整验证因旧重置提示缺少“保留供应商主档”而失败，修正文案后保留旧断言；专项quota重试定位修正见build-log。末轮补齐任务自身最近执行时间及当前目标投影，严格类型检查也发现并纠正新增契约字段缺失后，重新完整执行以上最终验证。未删除/跳过测试，未放宽旧业务断言、类型或超时/重试。

新增单元覆盖任务状态/并行/复测/取消/目标、采纳/待复核/审阅、来源/豁免独立性、各角色/范围/旧会话/自由文本、v1迁移与失败保持、追加保护/截短/版本/幂等/单键失败、重置引用、渠道即时投影与寻源/报价实际保存回归。

新增浏览器场景覆盖运营任务/执行/复测/采纳、新失败保留旧结论、inconclusive审阅、Testing权限、来源/豁免/撤销且连通性独立、采购运维摘要/其他身份拒绝、取消null、quota失败保留输入及重试、双窗口版本冲突、1440/390及无整页横向溢出/无pageerror。

旧 `app-shell.spec.ts` 首用例仅将 `/tests` 过时“即将开放/规划阶段”断言迁移为真实新建入口和任务列表；保留导航、刷新、原路由身份覆盖，并增加 `/remediations` 占位断言。其他旧业务测试与断言保留。

截图：[1440px 测试工作台](screenshots/stage-07a-1440.png)、[390px 测试任务详情](screenshots/stage-07a-390.png)。截图全为模拟数据。

## 6. 风险及后续交接

Mock localStorage不保证跨标签页原子CAS、跨设备或跨Repository共同事务，无法阻止不合作旧客户端改Storage。权限和内容保密生产实现必须由后端执行；共享摘要是独立人工字段，不是可靠自动文本脱敏。附件、真实证据/测试回调、生产并发和真实身份认证均未实现。无本期已知业务阻塞。

07B仅预留channel/task/execution/conclusion稳定ID；实际整改引用、权限和状态规则须单独授权，并连接重置保护。完成07A后停止等待验收。

## 7. 修改文件

共 46 个新增或修改文件（包含本报告、交接及两张截图）：

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
- `harness/build/screenshots/stage-07a-1440.png`
- `harness/build/screenshots/stage-07a-390.png`
- `harness/build/stage-07a.md`
- `harness/context/stage-07a.md`
- `src/app/AppShell.tsx`
- `src/app/TestingRoute.tsx`
- `src/app/navigation.tsx`
- `src/app/router.tsx`
- `src/auth/policy.ts`
- `src/auth/types.ts`
- `src/domain/testing.ts`
- `src/features/channels/ChannelDetailPage.tsx`
- `src/features/channels/ChannelListPage.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/dashboard/types.ts`
- `src/features/models/ModelDetailPage.tsx`
- `src/features/sourcing/SourcingDetailPage.tsx`
- `src/features/testing/TestSummaryPanel.tsx`
- `src/features/testing/TestingPage.tsx`
- `src/features/testing/testing-labels.ts`
- `src/features/testing/testing.css`
- `src/mocks/channel-api.ts`
- `src/mocks/channel-repository.ts`
- `src/mocks/mock-adapter.ts`
- `src/mocks/quote-repository.ts`
- `src/mocks/sourcing-repository.ts`
- `src/mocks/testing-api.ts`
- `src/mocks/testing-state.ts`
- `src/services/api-adapter.ts`
- `src/services/channel-types.ts`
- `src/services/dashboard.ts`
- `src/services/testing-types.ts`
- `tests/e2e/app-shell.spec.ts`
- `tests/e2e/testing-management.spec.ts`
- `tests/unit/testing-management.test.ts`

基线f21891d8a5e04075113de35f3f6a46b983d2bc66；分支stage-07a-model-testing。最终SHA由本报告所属提交及最终交付消息核实，不在提交内自引用。
