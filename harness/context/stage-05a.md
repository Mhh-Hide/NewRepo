# Stage 05A 交接

基线：4dc3c1af4915765e61699b4368a57fd9de0ad6b9；分支 stage-05a-procurement-sourcing。仅需求和多供应商候选寻源，未开发 05B 报价/合同价格。先读 AGENTS、docs 本阶段条目和 build-log。

入口：/sourcing 列表，/sourcing/:demandId 详情。SourcingEditor 创建/维护主单、多模型明细，运营受限内容与共享内容分区。CandidatePicker 仅查询同模型当前授权渠道，并按供应商、类型、能力及独立状态筛选。详情按模型卡片展示要求/候选/覆盖，匹配与主单进度独立人工确认，跟进可展开查看中文前后值。路由独立懒加载，复用既有 Shell/Header/统计/反馈与查询 hook，无新依赖。

类型：domain/sourcing.ts 包含 ManagedDemand/ManagedDemandItem/ManagedMatch（均交叉扩展既有实体）、SourcingState/Event、辅助判断/覆盖/状态流转。Demand.customerId 兼容 null，Match 新增 excluded，原 ID/状态代码和 DiscountBps 保留。已有明细模型及 ID 不可普通迁移/删除，可追加明细；创建表单归一化白名单输入，不把 Form 中原实体其他字段送入写 API。

存储：mocks/sourcing-repository.ts 独立 maas-sourcing-demo-v1 单键，结构版本/revision、demands/items/matches/history。原 fixture 初始化 ID 保留，受限和共享文本分别构造模拟内容。保存前完整 validateStore 使用当前供应商/渠道/任务，校验关系、模型一致、唯一候选和主单明细完整性，单次 setItem 原子提交；失败不产生部分主单/明细/历史。主单 version 用于所有编辑/候选/进度，无变化不写入。创建请求 UUID 幂等，内部 ID 与可读 MOCK-REQ 编号分开。

服务：services/sourcing-types.ts 声明新 API 与 ViewModel，由 mocks/sourcing-api.ts 实现并注入 ApiAdapter。createMockAdapter 第六参数允许测试注入 SourcingRepository，旧调用兼容。legacy listDemands/getDemand 统一改读该 Repository，旧白名单摘要不透传新增文本/assessment；前台原授权摘要保留。

权限：运营 read/create/update/match/progress/history，采购 read/match/progress/history；其他角色新内部商业接口拒绝。需求按模型域授权；候选继续沿用原采购维护供应商范围。混合域主单只返回当前域明细，主单资料/进度写入需完整明细域授权；可写当前获准明细候选。旧会话 revokeWrites 后不能写入。没有未确认的负责人、认领或组织授权字段。

投影：运营 title/description/customer 与共享标题/摘要分离。采购实际响应不含 customer/customerId/requesterUserId/运营原文/客户售价；列表搜索也只作用于当前角色标题。明细、候选、历史全部显式投影；采购跟进差异字段白名单，受限-only 事件不返回，域外明细或未授权渠道的候选历史过滤。历史 note/assessment 均明确共享分类，不是原受限文本的自动替换结果。

辅助与覆盖：能力已知不符或资源停用为 no；缺失能力/要求、地区未核实为 unknown；完全已知满足才 yes。人工 suitable 必填共享依据，拒绝明确不符/停用资源；unknown 可人工初步记录但不表示自动验证。初步符合覆盖按当前启用且无明确不符的人工 suitable 的不同 supplierId 去重。零关联为未开展，候选待核实、初步不足、人工确认 gap 与覆盖达标分别标记。缺口主单为未关闭且有已开展/人工 gap 明细不足三家，列表与 Dashboard 同用 querySourcing；原初始缺口 2→1，新增授权主单总数指标。计数不自动改主单或采购/渠道状态。

安全重置：寻源重置只恢复原需求/明细/匹配、清空跟进，保留所有其他模块；双域运营全部域二次确认。Adapter 在渠道重置前检查全部候选（含 excluded）引用的新增渠道，存在依赖先拒绝，必须先独立确认寻源重置再确认渠道；供应商重置继续原依赖保护。不改已验收 Supplier/Channel Repository 格式，不静默清空其他模块。损坏/不兼容寻源存储显示错误，只有明确重置才恢复。

验证：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify。新增 sourcing.test.ts 与 sourcing.spec.ts；最终完整 verify 退出码 0：类型/Lint/格式/构建通过，295 个单元测试与 27 个浏览器测试全部通过；截图见 harness/build/stage-05a.md。旧全部测试保留，仅 Dashboard 初始缺口口径与新增总数断言按本阶段规则更新。

限制/TBD：本地 Mock 不提供生产鉴权、跨标签页强事务或防篡改。生产共享文本审查/附件/导出、需求负责人/组织授权、原子编号分配、明细受控迁移及关闭重开待确认；地区缺少结构化渠道规格，只能人工核实。本期不新增报价/合同/价格自动化、不发送通知、不接真实 OP/CRM。不合并 main、不强制推送，完成后等待验收，不进入 05B。
