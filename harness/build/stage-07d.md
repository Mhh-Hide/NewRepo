# Stage 07D 交付记录

## 基线与范围

2026-11-16（Asia/Shanghai）。初始工作区干净，本地和实际远程 Stage 07C 均为 `0b3cab23645a5e8f122922373c923b1daa7b9572`，目标分支不存在。在原 `/workspace/NewRepo` checkout 创建 `stage-07d-resource-lifecycle`；未创建 worktree、合并 main 或覆盖未知修改。main 预检 SHA 为 `819f8641ab7bee01412d4fb057843d2bdd09efd4`。本次只开发授权 Stage 07D Mock 协作流程，允许普通提交推送，不部署、不进入 Stage 08。

## 数据与流程

- 新增 LifecycleRepository 单键 `maas-lifecycle-demo-v1`：DeliveryRecord、PhaseVerification、LifecycleTask、LifecycleEvent、内部评论、客户合同目标与供应商沟通。原 Supplier/Channel/Testing/Remediation/Sourcing/Quote 仍持有主档、执行、整改、需求及商业真值，原 schema/锁文件/依赖不变。
- 新交付显式获取后推进六步：获取、质量核验、供应商合同、生产配置、连通性/计量/计费人工核验、运营开放。原未登记渠道待补核验，历史通过/豁免不能填充新合同与配置。核验引用实际已完成执行，检查渠道、类型、现行配置与目标版本；后续失败必须新执行复测。
- 动态进度按六步加当前有效异常工作计算，失败事实不计完成；同阶段仅最近失败参与当前分母，多轮历史保留。未全完成封顶99%，已交付历史与当前可调度性分开。已接入渠道后续不满足资格时保守暂停 Mock 调度，读取旧渠道不改状态。
- 失败自动触发测试反馈、运营监督、同需求聚合采购补资源；原整改提交触发等待新执行复测。合同生效只通知运营配置，配置完成通知测试，第二阶段通过通知运营人工开放。电子合同有效即可配置，不等纸质寄回。凭据/报告/Endpoint 新交付字段仅接受 mock: 引用，无明文 Key。
- 原寻源三供应商规则保留；新增初始至少一条质量合格渠道，显式下游客户合同后至少三条当前可调度渠道，供应商数独立显示。
- 任务支持来源、对象、发起/接收、责任、期限、版本、已读、完成/取消/重开与审计。稳定来源去重，同一幂等请求仍先验证会话权限；完成业务任务须保存真实业务事实。@ 只允许当前授权内部人员，通知不复制敏感正文。需求重置后的孤立通知归档；交付关联动态需求禁止重置。

## UI 与权限

渠道同页资源进度默认视图/原管理视图切换，九项统计及模型、供应商、阶段、责任人、开放、异常、本人和逾期筛选。桌面完整表格含展开性能/商务/整改；390px 卡片直接展示核心进度/卡点/动作。抽屉含六步/异常、实测与承诺、原测试及整改链接、合同/配置、历史和内部 @。工作台同一任务入口；供应商原主档继续复用，仅沟通群与跟进说明新增。

新增细粒度权限，不放宽旧角色动作。运营管指派/配置/开放/客户目标，指派采购管获取/承诺/合同，指派测试管实测核验和失败反馈；均校验当前会话、业务域、对象及当前负责人/版本。运维支持只读技术摘要和本人通知；前台仍匿名旧视图，供应商不开放内部交付接口。Testing 不返回合同商业细节、使用条件或完整审计，不授予旧通用审计；角色页按实际策略说明增量权限。

## 一致性与限制

交付单键 revision/指纹冲突检查，主档版本及任务版本递增，核验/事件/评论/请求历史追加保护。原模块引用保护接入渠道、整改和寻源显式重置，保留所有历史。正常07B关闭仍依赖原采纳和本轮复测，不以交付人工结论绕过。

原事实成功后同步通知可能失败：保留原执行，显示存储失败，可显式重试测试通知，稳定来源不重复。没有跨 Repository 事务或跨窗口 CAS，Channel 资源/调度与交付两键写入也不具有原子性；异常后须恢复存储并重试/刷新核对。生产实现需后端事务、鉴权、持久化和通知服务。未接真实登录、Key、OP、Monitor、计费或企业微信/邮件；没有外部 Monitor/表格附件可同步。不自动开发下一阶段。

## 验证与截图

最终验证日期 2026-11-17（Asia/Shanghai）。完整执行 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`，退出码 0：严格 TypeScript、ESLint 零警告、Prettier、Vitest 22 文件 / 737 测试（原 698 + 新增 39）、Playwright 76 测试（原 69 + 新增 7）、生产构建全部通过。Node v24.22.1、npm 11.9.0、系统 Chromium 156.0.8078.79。原共享块体积提示保留，不调高阈值。

新增39个单元用例覆盖六步、第二阶段独立门槛、前后配置执行、失败循环、整改引用、安全暂停、角色/域/会话/供应商授权、敏感字段、幂等、版本、配额恢复及同需求多渠道聚合。新增7个浏览器用例覆盖实际获取/失败、原整改提交、有效电子合同及配置、第二阶段计量计费拒绝与人工开放、刷新、两种宽度和匿名/只读隔离。原698单元/69浏览器保留，仅原渠道表单测试显式切到原管理视图，断言不删减。

真实 Chromium 截图（通过公开 Mock API 生成实际渠道/执行/合同/配置前置事实）：

- [1440px 总览](screenshots/stage-07d-lifecycle-1440.png)
- [390px 总览](screenshots/stage-07d-lifecycle-390.png)
- [失败整改](screenshots/stage-07d-failed-remediation.png)

回归发现的问题已修正：抽屉打开时顶部身份不可交互，测试改为先切身份再开抽屉；Ant Design loading 图标改变按钮名称，按保存按钮名称后缀定位；390px 首屏进度不可见改为卡片。未提高超时/重试、关闭测试、降低类型检查或放宽旧断言。测试期间热更新使一项表单卸载，最终以固定代码完整重跑为准。

复核修复配置撤回：取消配置完成会失效当前第二阶段资格并暂停 Mock 调度，原历史保留，新增专门单元回归。总览异常状态仍显示数字百分比，桌面首列补充渠道识别及可见节点，移动端直接使用卡片。异常截图补充抽屉/等待复测节点与原整改链接的正向就绪断言，实际查看三图。两轮完整回归均为75通过/1个旧寻源长流程总时限失败；减少资源目标对未登记候选的无用计算，并按需加载新增进度界面，避免旧模块反复加载新表单。独立浏览器用例执行并发显式设为1，原30秒限制、断言、用例及用例内部多窗口并发覆盖保留；目标长流程单worker专项29.6秒通过，最终完整verify内26.8秒通过，整体验证退出0。中止校验时残留的4173测试进程已清理，不修改端口复用配置。未放宽旧断言、提高超时/重试或跳过测试；旧阶段重生成截图恢复基线，只提交本期三图。

## 完整文件清单

- `README.md`
- `docs/BUSINESS_RULES.md`
- `docs/DECISIONS.md`
- `docs/PERMISSIONS.md`
- `docs/PRODUCT_SCOPE.md`
- `docs/UI_GUIDELINES.md`
- `harness/ROADMAP.md`
- `harness/build-log.md`
- `harness/build/screenshots/stage-07d-failed-remediation.png`
- `harness/build/screenshots/stage-07d-lifecycle-1440.png`
- `harness/build/screenshots/stage-07d-lifecycle-390.png`
- `harness/build/stage-07d.md`
- `harness/context/stage-07d.md`
- `playwright.config.ts`
- `src/app/AppShell.tsx`
- `src/auth/policy.ts`
- `src/auth/types.ts`
- `src/domain/lifecycle.ts`
- `src/features/channels/ChannelListPage.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/lifecycle/LifecycleBoard.tsx`
- `src/features/lifecycle/LifecycleDetail.tsx`
- `src/features/lifecycle/ResourceGoal.tsx`
- `src/features/lifecycle/SupplierCommunication.tsx`
- `src/features/lifecycle/WorkInbox.tsx`
- `src/features/roles/role-presenter.ts`
- `src/features/sourcing/SourcingDetailPage.tsx`
- `src/features/suppliers/SupplierDetailPage.tsx`
- `src/mocks/channel-repository.ts`
- `src/mocks/lifecycle-api.ts`
- `src/mocks/lifecycle-repository.ts`
- `src/mocks/mock-adapter.ts`
- `src/mocks/remediation-repository.ts`
- `src/services/api-adapter.ts`
- `src/services/lifecycle-types.ts`
- `tests/e2e/channels.spec.ts`
- `tests/e2e/lifecycle.spec.ts`
- `tests/e2e/quotations.spec.ts`
- `tests/e2e/sourcing.spec.ts`
- `tests/unit/lifecycle.test.ts`

## Stage 07D 验收补丁 — 2026-11-17（Asia/Shanghai）

基线及范围：本地/远程分支 stage-07d-resource-lifecycle 均为 0949e127216ed0be50e8019b407a18d726c23528，工作区干净。保留 main 与 Stage07C；在原 checkout 修复三项 P1，不创建 worktree、不引入新阶段或生产连接。

1. 正常质量通过：旧逻辑创建 contract + supervise；现改为 contract + quality_passed_notice。原执行 passed 尚需人工核验，只有核验通过才发运营通知。通知可已读/跳转，不是整改待办。
2. 阶段失败：syncSignals / verify 统一调用 phaseFailureWork / notifyFailure。质量失败仍测试反馈、运营监督、采购替代并行；接入失败改为测试排障、运营监督和采购 integration_failed_notice。原失败执行再核验共用 execution 来源，不重复发；连通通过但计量/计费失败用人工核验来源。
3. 有序进度：补齐阶段、稳定显示 ID、节点类型/状态、引用、轮次、完成时间与负责人，单次聚合输出 orderedSteps。异常插在所属测试节点之后；board Tooltip 与 detail Steps 共用 ProgressStep，显式颜色/图标/中文状态。旧字段保留兼容，百分比依同一集合；六步、99%上限、当前有效异常、历史交付和调度区分不变。

历史：不删除任务、执行、整改、请求或审计。只识别标准自动来源且未处理误发；合法质量失败、人工来源、已处理/已完成、已重新指派及不明确的记录保留。需求聚合任务只要存在相关质量失败就不取消；跨域/不完整关联授权不得迁移。读取副本兼容投影不改盘；授权写入/通知已读/重试同步时单键保存取消及补通知，递增版本并追加 legacy-task-corrected，保留旧 ID/type/source/time，重试不重复追加，误发不得重开。schema仍v1，不清空旧数据。

原有权限、业务动作授权、依赖、锁文件、测试超时/重试/worker设置均保持。唯一旧业务断言修正：原单测错误期待“第二阶段失败采购 replacement=true”，改为 replacement=false 且抄送通知存在，保留风险、复测恢复与开放断言。原737单元/76浏览器有效覆盖保留。

补丁最终验证：2026-11-17（Asia/Shanghai）完整执行 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`，退出码0。TypeScript、ESLint零警告、Prettier、Vitest 22文件/759测试（原737+新增22）、Playwright79测试（原76+新增3）、生产构建全部通过。生命周期专项61单元及10浏览器覆盖通过，其中补丁3浏览器另行复测通过。原测试超时、重试、worker设置和依赖锁文件未改；仅替换一条已确认错误业务断言，保留原执行风险/恢复/开放覆盖。构建大包提示保留，阈值未放宽。

真实截图：更新 stage-07d-failed-remediation.png（质量异常插入），原总览两图随专项重新生成；新增 stage-07d-patch-quality-notice.png、stage-07d-patch-integration-failure-1440.png、stage-07d-patch-integration-failure-390.png。已实际查看，供本次验收。

补丁文件清单：

- `docs/BUSINESS_RULES.md`
- `docs/UI_GUIDELINES.md`
- `harness/build-log.md`
- `harness/build/screenshots/stage-07d-failed-remediation.png`
- `harness/build/screenshots/stage-07d-lifecycle-1440.png`
- `harness/build/screenshots/stage-07d-lifecycle-390.png`
- `harness/build/screenshots/stage-07d-patch-integration-failure-1440.png`
- `harness/build/screenshots/stage-07d-patch-integration-failure-390.png`
- `harness/build/screenshots/stage-07d-patch-quality-notice.png`
- `harness/build/stage-07d.md`
- `harness/context/stage-07d.md`
- `src/domain/lifecycle.ts`
- `src/features/lifecycle/LifecycleBoard.tsx`
- `src/features/lifecycle/LifecycleDetail.tsx`
- `src/features/lifecycle/ProgressStep.tsx`
- `src/features/lifecycle/WorkInbox.tsx`
- `src/mocks/lifecycle-api.ts`
- `src/mocks/lifecycle-repository.ts`
- `src/services/lifecycle-types.ts`
- `tests/e2e/lifecycle.spec.ts`
- `tests/unit/lifecycle.test.ts`

限制：仍为 Mock；无真实 Key、账号、API、计费或企业微信/邮件；LocalStorage 无跨键事务或跨窗口 CAS。已处理或来源不明确的历史记录只保留，不自动推断其应取消；旧客户端不保证遵守新规则。不部署、不开始 Stage08。

补充截图用例2项通过：质量整改改用1440×1100视口展示完整节点，通知图直接捕获通知卡片；其余业务断言保留。截图专项发现入场过渡帧，补充抽屉边界断言并在截图时结束有限动画；采用真实浏览器捕获，没有用绘图替代。清理 Steps 新增状态描述的弃用属性，使用 content。质量失败异常步骤位于质量节点后；第二阶段失败位于接入节点后；桌面总览 Tooltip 与详情实际DOM顺序比较通过。质量整改、通过通知、1440/390接入异常图已视觉查看；原总览两图经原截图用例重新生成；旧06B/07A/07B/07C测试重生成图片恢复基线，避免无关二进制变更。
