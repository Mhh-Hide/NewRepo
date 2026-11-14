# Stage 07A 交接：模型渠道测试管理

## 基线与范围

- 指定已验收基线：f21891d8a5e04075113de35f3f6a46b983d2bc66。
- 分支：stage-07a-model-testing；使用原 checkout；不改 main，不合并、强推或部署。
- `/tests`、`/tests/:taskId` 正式开放。仅人工 Mock，未开始07B/08或生产集成。

## 数据与状态

ChannelRepository schemaVersion 1→2，键仍 maas-channel-demo-v1。首次读旧数据只内存归一化，首次成功写前双图校验，单键提交。保留旧渠道、任务顺序/状态、动态渠道、OP与历史；仅导入已有fixture执行/豁免，不补造元数据或采纳。unknown/corrupt 拒绝，不自动重置。

领域 `src/domain/testing.ts`，迁移/投影与校验 `src/mocks/testing-state.ts`，服务 `src/mocks/testing-api.ts`，契约 `src/services/testing-types.ts`。任务定义扩展原 TestTask；执行 run（开始）与 execution（终态）独立追加；conclusion/review/source/exemption/revocation/audit/request 同聚合。

任务 pending→running→completed；相同目标 completed→running 复测；pending/running 可取消并明确终止，null 不当失败。任务同刻最多一个执行，跨任务独立。已执行目标不能覆盖，配置变更生成新版本，即使恢复旧字段也不复活旧依据。旧任务可取消或明确审阅，当前配置须新任务。

新通过/失败/不确定均待复核；最新执行不自动替换旧结论。运营对单条执行明确采纳 passed/failed；inconclusive 或已失效目标可无结论审阅，不覆盖现结论。处理一条不清除其他待复核。新失败单独风险，不触发整改/停用/报价/寻源联动。

官方来源核验、质量豁免与连通性独立；只有运营能核验来源、登记/撤销豁免，来源撤销或关键配置变化使豁免失效，保留证据链。legacy 状态单列来源，无采纳事实不伪装已确认。

## API 与权限

- Ops：全部授权测试动作；Testing：任务维护、执行、取消、专用历史，不能采纳、审阅、核验来源或豁免；无通用 audit:read。
- Procurement/Support：仅白名单 TestSummary；采购按当前供应商维护授权及厂商域过滤。不得包含执行ID、内部说明、旧failureReason、证据、操作者、审计、客户或商业信息。
- Supplier：维持原有自身基本读取，不新增完整测试/新摘要接口；前台拒绝新接口。
- 服务逐次校验会话、角色、记录范围、版本与请求幂等。相同actor+key+operation+payload重放返回原结果，改变内容或操作冲突；无权限不能借重放取结果。
- UI 不导入 fixture/storage。共享摘要人工单独录入，不取旧自由文本，不宣称自动脱敏。

## 一致性与重置

Channel/Sourcing/Quote 校验均经 testingSnapshot 读取同一测试事实。渠道兼容状态由当前依据的采纳/豁免/legacy推导，渠道修改的返回值与变更后快照也使用实际保存投影。资源池/渠道/寻源/Dashboard 摘要走同API，无第二缓存。

新测试指标见 BUSINESS_RULES；旧 Dashboard 任务计数保持原口径，精确指标独立显示。无当前采纳连通性依据计待验证（legacy不伪造证据），有依据但失败计失败而非缺依据。

显式渠道重置包括初始渠道上的新增执行/采纳/核验/豁免及历史，保留初始fixture整改引用；动态渠道如被报价/批次/寻源引用拒绝；assertTestResetReferences 检查整改引用经执行到任务渠道。不会级联清理其他存储。供应商既有引用保护保留。

## Stage 07B 仅交接、不实施

未来整改应引用稳定 channelId/taskId/executionId/conclusionId；只可在授权测试范围内选引用，测试失败不自动创建或关闭整改。必须将实际整改Repository引用接入现有重置保护，不可只依赖当前静态fixture。整改状态、供应商响应、关闭权限及证据策略须单独批准。

## 限制

localStorage 单键写入+乐观版本检查不是跨标签页CAS，不保证跨设备/跨Repository共同事务，不能阻止不合作旧客户端直接改写存储。Mock 鉴权与前端投影不替代生产后端控制。真实自由文本、附件下载及保密审核仍需后端策略；此期全部仅模拟数据，没有真实测试服务、密钥或通知。

验证结果、完整文件清单及截图见 `harness/build/stage-07a.md`；最终SHA以该报告所属提交及最终交付消息为准，避免在提交内自引用SHA。
