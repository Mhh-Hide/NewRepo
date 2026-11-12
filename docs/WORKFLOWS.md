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

TBD：寻源审批、资源匹配判定、报价合同签署、测试重试/核验失效、整改关闭条件、事件升级、渠道接入准入、开放门禁、审计保留期。当前仅有只读工作台与模块占位，没有真实写入或生产工作流。

## Stage 03：主档交互

- 运营从供应商列表新增：校验必填、目录负责人、邮箱及唯一性 → 生成内部 UUID、默认启用和版本 1 → 追加创建审计并保存 → 成功后进入详情。无需渠道；保存失败留在表单，不提示成功。
- 编辑授权主档：展示现有值 → 提交原 version → 再次鉴权并校验 → 有变化才生成新版本与 before/after 审计 → 刷新列表/详情。若 version 不一致，拒绝保存，必须显式重新加载；不自动覆盖。
- 负责人分配：仅运营调整；负责人必须是模拟采购用户。主档 ID 不变，维护授权转移，生成 owner_assigned 记录；渠道、测试、接入和开放状态均不改。
- 启停：运营二次确认，只改变主档 status 并留痕。停用提示不再作为新增采购合作默认选项；本期未开发新增采购流程，不实现级联删除或自动禁用渠道。恢复启用保留 ID、关联资源及历史。
- 合作状态与启用状态独立可编辑，不自动互相推导。无物理删除、外部邀请、报价录入或测试结果提交。
- 重置：双域运营全部域视角确认后，恢复初始供应商、主档管理范围、采购维护授权和创建历史；不触碰报价/渠道/测试/事件 fixture。

localStorage 读取失败、数据版本不兼容时显示可理解错误，不自动清除存量。可重试读取或由有权运营确认重置。持久化失败不提交内存状态。TBD：真实后端事务、跨窗口原子并发、数据迁移与组织授权审批。
