# 第 01 阶段状态与流转边界

基础词汇定义在 `src/domain/statuses.ts`，每个状态都有独立中文映射。

| 维度           | 稳定代码                                                       |
| -------------- | -------------------------------------------------------------- |
| 采购寻源       | draft / sourcing / gap / matched / closed                      |
| 渠道质量测试   | pending / running / passed / failed / exempted                 |
| 渠道连通性测试 | pending / running / passed / failed                            |
| 渠道接入       | not_started / integrating / integrated                         |
| 渠道开放       | closed / open / suspended                                      |
| 报价           | reference / pending_contract / effective / temporary / expired |
| 供应商整改     | open / in_progress / submitted / closed                        |
| 供应商事件     | reported / investigating / resolved / closed                   |

另有 TestTask.status = pending/running/completed/cancelled；执行 result = passed/failed/inconclusive/null。任务完成不等于测试通过，执行结果不会自动改变接入/开放状态。Demand 与 DemandItem 分别记录寻源状态。

以上是第 01 阶段基础词汇，不是已审批的完整状态机。不提供任意改状态的写接口，不凭空增加审批路径。详细可流转边、角色、条件、回滚和并发策略全部 TBD。

已实现的纯规则边界：

- `canExemptQuality` 要求官方原厂类型、来源已核验及独立证据；其他渠道不豁免。具体证据核验标准 TBD。每个渠道独立连通性任务，即使质量豁免也保留。
- `appendQuote` 追加版本，新 ID 不重复；正式价需确认信息，促销需起止区间，更正需原因与原报价 ID；不覆盖旧记录。不提供最终有效价格选择或合同审批。
- `bindOpChannelId` 只接受初始绑定或相同值，不允许覆盖；纠错流程 TBD。
- `supplierCoverage` 计数不同供应商并报告资源缺口，不把“三家”变成硬约束。

一任务多执行，每次独立 ID；原执行不覆盖。质量与连通性互不代替，也不默认固定先后顺序。报价状态不等于渠道状态，正式合同历史、新待确认报价和临时优惠可同时存在。

TBD：寻源审批、资源匹配判定、报价合同签署、测试重试/核验失效、整改关闭条件、事件升级、渠道接入准入、开放门禁、审计保留期。当前无工作台页面、真实写入或生产工作流。
