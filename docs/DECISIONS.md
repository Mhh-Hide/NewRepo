# 工程决策记录

- D00-01：React + TypeScript + Vite，Ant Design，React Router；仅欢迎页。
- D00-02：feature-based 模块化，app 负责装配，domain 定义领域类型，services 提供统一 Adapter，mocks 提供模拟实现，auth 保留授权边界。
- D00-03：TypeScript strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes；禁止为通过检查放宽约束。
- D00-04：ESLint + Prettier，Vitest/jsdom 组件与 Adapter 测试，Playwright Chromium 浏览器冒烟测试。
- D00-05：npm lockfile 固定依赖树，使用 npm ci 重装；Node >=22.12。当前验证环境 Node 24。
- D00-06：不实现未确认业务实体、流程或权限系统；原文件 MyNewFile 原样保留。
- D00-07：普通 npm 缓存目录在当前云环境不可写，项目 .npmrc 使用 /tmp/maas-npm-cache；不影响依赖校验或锁文件。

待确认：详细 PRD、各模块分期、渠道类型、角色授权细节、接口契约及数据字典。第 01 阶段仅在用户明确授权后开始。

## 第 01 阶段

第 01 阶段已由用户明确授权；以下决策补充第 00 阶段，不改变其历史记录。

- D01-01：分支 stage-01-domain-permissions 基于 stage-00-engineering-harness 的 2d1a5b6c06f2399a0ffac0f708602e3dfe8744c1；开始时远程 main 仍是 819f864，尚未包含第 00 阶段。不合并 main。
- D01-02：领域接口只读，品牌 DiscountBps 避免浮点比较；0..10000 是明确的演示假设，超范围业务 TBD。能力未知为 null。
- D01-03：单一活动角色 + 业务域、供应商、客户独立授权；多角色冲突 TBD。默认拒绝，前台不支持按隐藏供应商 ID 查询。
- D01-04：Adapter 绑定演示 userId，从内存用户和授权关系创建上下文；无默认管理员。纯字段投影与记录范围检查分离，返回深拷贝。生产不能信任浏览器传入角色或用户 ID。
- D01-05：只扩展只读接口；状态字典与中文展示分开，没有复杂审批状态机。报价追加纯函数用于规则验证，不是写 API；历史列表不计算结算价。
- D01-06：完整关联夹具与加载期校验；所有供应商、客户、报价、证据均模拟，联系邮箱使用 example.invalid。每渠道建连通性任务；质量豁免证据独立记录。
- D01-07：UI 目录通过 ESLint 禁止直接导入 mocks，统一走 services；欢迎页和第 00 阶段测试保持不变。没有新增依赖。
- D01-08：审计接口仅产品运营授权域可读，避免快照泄露采购折扣；后端持久化、防篡改和细粒度审计投影 TBD。

## Stage 01 Patch

- D01-P01：以 f5562540456c2472b39b1ede82ea3e9fb61bc2bb 为修复基线，在原 stage-01-domain-permissions 分支独立提交，不属于第 02 阶段。
- D01-P02：假设非空 OP 渠道 ID 与本系统内部渠道一对一绑定；null 可重复。此假设待 OP 接口确认，不接入真实 OP。绑定纯函数要求完整渠道集合，检查其他渠道冲突、当前规范记录和幂等；后端仍须原子唯一约束。
- D01-P03：保留事件 description 为运营受限混合全文；客户身份、客户售价、采购折扣独立结构化字段。跨角色摘要由 summaryCode 映射固定文本，字段按既有权限策略投影；不增加事件写 API，不改变角色或范围规则。
- D01-P04：最小实现匿名渠道代号为 DEMO-加内部渠道 ID，仅 ViewModel 增加 anonymousCode。既有内部 ID 已公开且不含供应商语义；不是安全匿名化算法，正式分配与防关联策略 TBD。无 UI 扩展。
