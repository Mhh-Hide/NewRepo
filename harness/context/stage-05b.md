# Stage 05B 交接

基线 383aabee1ff5d6aad678d01061f012f24db20207，分支 stage-05b-quotation-management。仅询价/采购报价/版本，不进入 06。先读 AGENTS、docs 本阶段条目和 build-log。

页面：/quotes 台账、询价/跟进、条件对照；/quotes/:quoteId 证据/口径、核验与确认、同渠道历史及审计。QuoteEditor 支持日常报价、后续真实调价、correction 和优惠；InquiryPanel 发起与跟进、接收报价，不外发通知。渠道 RelatedQuotes 展示历史，寻源明细 RelatedQuotes 展示目标与关联报价、回复状态，候选链接进入相关渠道询价。QuoteTable 复用列表/关联/历史，受控远程分页或本地分页按场景选择；路由懒加载，无新增依赖。

domain/quotations.ts 定义 ManagedQuote（ChannelQuote 交叉扩展）、PriceSpec/Rate、InquiryRecord、QuoteDecision/Audit/Request/State。DiscountBps 不变；金额为最多12位整数6位小数的十进制字符串，bigint 微单位仅用于精确比较。币种/价格基准/规格可空，rates 显式维度、数量、单位、可空金额；不假定 Token、官方价格或汇率。不同模型/币种/基准/规格/维度/数量/单位/状态/有效期不可直接比较，未知说明原因；目标缺基准仍不可比较，不改采购目标或 suitable。

mocks/quote-repository.ts 使用 maas-quote-demo-v1，schemaVersion/revision，quotes/inquiries/decisions/history/requests；旧报价 ID/价格/证据/确认元数据保留，新增缺失商业字段未知，不推断 recordedBy 或外部提交人。保存前完整 validateStore 和 appendQuote，检查所有关联/模型、唯一性和版本/revision；报价/决策/审计前缀只追加。单次 setItem 包含报价、关联询价回复和审计，失败无部分记录；请求按操作人+标识+内容幂等。单浏览器 Mock 不是多窗口原子事务。

mocks/quotation-api.ts 实现 services/quotation-types.ts 的统一 QuotationApi，createMockAdapter 第七参数可注入 QuoteRepository。旧 getQuoteHistory、报价审计实体查找、Dashboard 统一读取当前报价源；不在页面导入 fixture/localStorage。供应商、渠道、寻源 Repository 均未改格式或业务实体。

正式确认是独立事件：运营/采购都能录入/更正/核验，只有 quote:confirm 运营可确认。要求已独立核验、参考/待合同且未结束、有效生效时间、mock: 依据、说明；不确认优惠。独立事件合成兼容 ChannelQuote 的 effective/confirmedBy/At/effectiveFrom/evidence 视图，原存储状态和价格不改。原录入状态在详情单独展示。操作版本为 1+该报价决策数，询价单独 version，旧会话不可写。历史 q-1 等原有正式确认字段保留，但无独立核验事件时不假装补出来源核验。

原 submittedBy 保留为系统提交人，新报价另存 supplierSubmitterReference（mock: 原供应商联系引用）和 recordedBy；采购转录仍是 supplier_submission，不是采购确认价。更正必须 previousQuoteId/原因，同渠道；后续真实调价来源保持独立。所有价格记录、优惠/正式、过期历史均保留，不推断唯一结算价或促销优先级。

询价状态 draft/sent/quoted/closed，人工跟进版本化、变化追加审计，收到关联报价可在同次提交标 quoted，不等于核验。当前 UI 列当前跟进，报价详情显示报价决策和本记录审计；原材料只保存 mock: 引用，没有实际附件/外部通信。

权限：新 quote:create/verify/confirm/correct/history 与 inquiry 动作仅运营/采购，confirm 仅运营；采购渠道范围继续原维护授权，其他角色无内部价格/API读取。需求选项只使用共享标题、编号、模型和采购目标，不带客户或运营原文；报价/证据/审计显式投影，商业共享说明不得含客户信息。生产文档分级/附件/导出仍 TBD。

重置：报价恢复原 fixture/未知口径，清新增报价、询价、决策/本期审计和请求，保留其他模块，双域运营全部域二次确认。报价/询价引用动态渠道或需求明细时，Adapter 拒绝相应局部重置，先独立确认报价重置，再依原寻源→渠道→供应商保护顺序；不静默清空跨模块历史。不兼容报价数据只显式重置恢复。

Dashboard：queryQuotes 提供待合同、未来7天到期有效优惠、最近7天有新报价的不同渠道，授权商业角色才显示。有效期判断与记录状态分开；正式/优惠有效计数不含未来或已结束记录。创建/筛选日期以北京时间解释，不自动选择结算价。

验证命令仍为 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify；已完整通过：严格类型/Lint/格式、360单元（新增65）、33浏览器（新增6）及生产构建，退出码0。截图/完整文件清单见 build/stage-05b.md 和 build-log。保留原295单元/27浏览器用例，旧占位导航改用仍未开放的模型测试页；Dashboard 原断言加入本期真实报价指标。没有跳过用例或放宽类型/超时。

限制：真实审批、供应商门户、金融精度/舍入、基准目录、目标基准、促销优先级、生产持久性/鉴权/防篡改均待确认。多币种不换算，其他单位不猜测可比性。不合并 main、不强制推送，完成后等待验收，不进入 06。
