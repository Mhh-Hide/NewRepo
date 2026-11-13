# 第 01 阶段数据模型

类型真值：`src/domain/entities.ts`；集合契约：`src/domain/store.ts`。本阶段仅内存只读查询，无数据库、写接口或真实商业信息。所有实体含 `source: 'mock'` 与稳定 `id`；除专门记录时间的明细外，主实体含 `createdAt`、`updatedAt`。时间为 ISO 8601 UTC 字符串。

| 实体               | 字段与关系（公共 id/source/时间见代码）                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ModelVendor        | name、code（唯一）、businessDomain（domestic/overseas）、status                                                                                                                                                                                                                      |
| Model              | vendorId → ModelVendor；name、modelCode、version、regionVariant、category、status                                                                                                                                                                                                    |
| Supplier           | name 与 shortCode 分开且各自唯一；status、contactName/Email/Phone、ownerUserId → DemoUser                                                                                                                                                                                            |
| Channel            | supplierId → Supplier、modelId → Model；channelType、displayName、opChannelId、modelInvocationName、endpointReference、sourceVerificationStatus、tpm/rpm/concurrencyLimit/ttftMs、resourceStatus；四个独立维度 qualityStatus/connectivityStatus/integrationStatus/availabilityStatus |
| Demand             | requesterUserId → DemoUser、customerId → Customer、status                                                                                                                                                                                                                            |
| DemandItem         | demandId → Demand、modelId → Model、targetPurchaseDiscount、requiredTpm/Rpm/TtftMs/Concurrency、status                                                                                                                                                                               |
| DemandChannelMatch | demandItemId → DemandItem、channelId → Channel、matchStatus、createdAt；模型必须一致                                                                                                                                                                                                 |
| ChannelQuote       | channelId、discount、priceStatus、reason、sourceType、effectiveFrom/Until、evidenceReference、submittedBy、confirmedBy/At、createdAt、previousQuoteId（历史版本关联）                                                                                                                |
| TestTask           | channelId、testType、status、assignedTo、时间                                                                                                                                                                                                                                        |
| TestExecution      | taskId → TestTask、externalTestId、startedAt/finishedAt、result、failureReason、reportReference、createdAt                                                                                                                                                                           |
| QualityExemption   | channelId、verifiedBy/At、evidenceReference、reason；独立核验/豁免证据                                                                                                                                                                                                               |
| Remediation        | channelId、relatedTestExecutionId（可空，须属同渠道）、description、status、supplierResponse、submittedBy、updatedBy、时间                                                                                                                                                           |
| SupplierIncident   | supplierId、channelId（可空，须属同供应商）、category、severity、summaryCode、description（受限）、customer、salesPriceMinorUnits、purchaseDiscount、status、reportedBy、时间                                                                                                        |
| AuditEvent         | entityType/entityId、action、actorUserId、occurredAt、reason、changeSummary、beforeSnapshot/afterSnapshot                                                                                                                                                                            |
| Customer           | name、salesPriceMinorUnits；完全虚构的权限验收夹具，不是销售定价模块                                                                                                                                                                                                                 |
| DemoUser           | name、role、salesPriceLevel（sales/director/vp/null）；不含密码                                                                                                                                                                                                                      |

关系：厂商 1:N 模型；供应商 N:M 模型由渠道关联；同供应商同模型允许多渠道。需求 1:N 明细，明细 N:M 渠道由匹配记录关联。渠道 1:N 报价/测试任务/整改；测试任务 1:N 执行。供应商 1:N 事件。

模型业务域唯一真值是厂商，`modelDomain` 关联推导；模型没有独立 businessDomain。模型身份组合为 vendorId + modelCode + version + regionVariant，不使用显示名称。供应商不存 businessDomain，一份主档可跨域。渠道 displayName 不唯一，内部 id 唯一，OP ID 可 null；`bindOpChannelId` 允许初次绑定及幂等绑定，拒绝覆盖。没有任何 API Key 字段。

折扣采用品牌类型 `DiscountBps`，通过 `discountBps` 验证为 0..10000 安全整数，10000 为原价，8000 为八折。此范围是 Demo 的明确实现假设；超原价采购、零折扣可用性及币种/商业精度仍为 TBD。能力未知使用 null，不能转换为 0。报价更正 sourceType=correction 并引用 previousQuoteId；追加新 id，不覆盖历史；接口只返回历史列表，不推断当前结算价或叠加促销。

`validateStore` 校验各集合 ID、供应商名称/缩写、模型组合身份、外键、明细/匹配模型一致、整改执行归属、事件供应商归属、报价确认与有效期、能力非负、每渠道连通性任务及豁免证据。Mock Adapter 加载时校验失败会报错。类型不是数据库约束；未来真实写入仍需后端校验与事务。

用户范围由 `UserDomainGrant`、`UserSupplierGrant`、`UserCustomerGrant` 分别表达。供应商授权关系不是登录认证；角色与销售价格等级分开存储。暂用单一活动角色，组合角色冲突规则 TBD。

状态真值与中文映射见 `src/domain/statuses.ts`：模型地区 domestic/overseas/global/other，类别 text/image/video/audio/multimodal/other，基础启停 enabled/disabled。各流程状态见 WORKFLOWS。

TBD：业务字段最终字典、时间校验的服务端契约、审计快照扩展格式（当前标量键值）、历史链冲突解决、OP 绑定纠错流程、客户定价契约、真实账号管理和持久化。

## Stage 01 Patch：绑定与事件分级

- OP ID 暂按与内部渠道一对一绑定处理：非 null 的 opChannelId 全集合唯一，多个 null 合法。`validateStore` 返回 `Duplicate OP channel ID`；`bindOpChannelId(channel, opChannelId, channels)` 要求传入完整渠道集合，冲突抛出 `OP channel ID conflict`。同渠道相同值可幂等确认，且通过集合内当前记录防止旧对象覆盖已有绑定。未来后端需全局唯一约束和事务，调用方不可通过提供局部集合代替全局校验。
- SupplierIncident 保留 `description`，但作为可能混合敏感信息的受限全文；增加受控 `summaryCode`（resource_unavailable/service_feedback/compliance_review/other_issue），投影生成固定摘要，不复制自由文本。另设 `customer`（id/name 或 null）、`salesPriceMinorUnits`（或 null）、`purchaseDiscount`（DiscountBps 或 null），分别授权。
- `SupplierIncidentView` 显式列举允许返回的字段；原始实体不再作为 listIncidents 返回类型。事件客户引用与商业数值在夹具校验中检查。
- ChannelView 新增 `anonymousCode`，Demo 使用 `DEMO-` 加内部渠道 ID；前台 displayName 使用该代号，可稳定区分渠道。它与供应商 shortCode 无关，不是加密或安全凭证；内部 ID 必须保持不含供应商身份语义。没有新增 UI。

## Stage 03：供应商主档

继续使用 Supplier.id/name（界面分别显示“内部 ID / 供应商名称”），不改名为第二套 supplierId/supplierName 实体。新增 cooperationStatus、supplierCategory、countryOrRegion、description、contactPosition、alternativeContact、remark、externalAccountStatus、createdBy、updatedBy、version。选填文本持久化为空字符串；首次创建 version=1，真正变更时递增。内部 ID、创建人/时间、版本及外部账号状态不接受表单写入。

- cooperationStatus：potential / negotiating / cooperating / paused / terminated，与 enabled/disabled 独立。
- supplierCategory：official_vendor / cloud_provider / third_party / other。
- externalAccountStatus：not_created / invited / active / disabled；当前只预留，默认 not_created，无邀请、密码、外部登录或编辑功能。
- name 与 shortCode 分别全局唯一，忽略首尾空格和英文大小写；停用或终止也不释放唯一性。更名不改变 ID。
- ownerUserId 从模拟采购用户目录选择；不是供应商账号，也不是模型业务域。新增 u-proc-alt（采购，国内授权）用于负责人调整验收。

SupplierMasterScope 独立记录主档管理域授权，不是供应商模型业务域。新建时取创建者当前选中且已授权的管理范围；全部域视角取其全部授权域。既有主档的初始管理范围由 fixture 渠道厂商域推导，只用于兼容基线。供应商主档仍无 businessDomain 真值。

采购维护授权复用 UserSupplierGrant 形状，持久化在 repository.maintenance，与供应商用户静态所属关系分离。本期主要采购负责人就是明确的主档维护受让人；调整负责人时回收旧维护授权并授予新负责人。明确授权的采购可以读取无渠道主档；域筛选仍限制可见渠道，不能因负责人属国内就把供应商限制为国内模型。

供应商专用审计 SupplierChangeEvent：id、supplierId、action、actorUserId、occurredAt、reason、changedFields、beforeSnapshot、afterSnapshot。action 为 created/edited/status_changed/owner_assigned；快照是同一 Supplier 类型，接口通过字段投影后返回。没有将客户、报价、密码或凭据加入快照。原 AuditEvent 及报价/测试审计查询不改变。

Mock Repository 是唯一可变供应商主档来源；原 fixture 只作初始化/重置基线。legacy listSuppliers、工作台与管理 API 均读取同一 repository。单一 localStorage 键 maas-supplier-demo-v1 保存 schemaVersion=1、全局 revision、suppliers、scopes、maintenance 和 history。写前检查记录 version、结构、全局名称/缩写唯一性；持久化成功后才返回成功。不变字段不生成新版本/审计。没有数据库、物理删除或渠道级联更新。

TBD：组织/部门级主档管理授权、多采购协作与转交规则、账号邀请流程、生产审计保留及防篡改、未来 schema 迁移。浏览器同步写入及版本校验不是生产事务或跨标签页原子锁。

## Stage 04A：资源查询 ViewModel

ModelVendor、Model、Supplier、Channel 和各独立状态定义不变。新增只读契约位于 src/services/resource-types.ts，不是第二套主档：

| ViewModel              | 内容                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| ModelResourceSummary   | 原 Model、授权厂商、modelDomain 推导的业务域、渠道数量、可见时的不同供应商数量、类型分布及四个独立状态计数 |
| ModelResourcePage      | 分页模型汇总、授权厂商选项、授权目录统计、可选供应商关联筛选摘要                                           |
| ModelResourceDetail    | 模型汇总、当前主档供应商覆盖、授权渠道清单、身份可见标记                                                   |
| ChannelResourceSummary | 显式选择的渠道代号、类型、能力、资源及四个独立状态；身份允许时附当前供应商的 id/name/shortCode/status 摘要 |
| ChannelResourceDetail  | 渠道摘要、关联模型/厂商/派生域，以及原 ChannelView 已授权的调用名、Endpoint 引用、OP ID 和来源核验状态     |

未知能力保留 null，显示为“未知”，不补零；OP ID 的 null 显示“未绑定”，不是未授权字段。未授权技术属性直接缺席，不填假值。资源 ViewModel 不包含报价、客户、联系人、备注或审计快照。

供应商覆盖按当前授权渠道的不同 supplierId 去重，同供应商同模型多渠道仅算一家；不按名称判断身份，也不把模型覆盖阈值当成需求匹配达标。无渠道供应商仍存在于 Stage 03 主档，但不会进入任何模型的覆盖统计。

前台没有 supplierCount/threeSupplierModels 属性，不返回供应商身份列表；仅返回可见渠道数量、匿名代号、类型和能力/状态。供应商覆盖数量筛选对前台拒绝，防止用筛选反推隐藏身份关系。

queryModelResources 的顶部统计以当前授权目录为基准，不随名称等普通筛选变化；供应商关联入口先约束模型集合，再对这些模型的全部授权渠道统计覆盖。因此“查看关联模型”不是把模型详情限制成某一家供应商渠道。分页总数始终对应全部筛选后的结果。

所有供应商名称/缩写/启停来自原 listSuppliers → Stage 03 SupplierRepository 的当前主档，不读取初始 fixture 替代它；没有新增供应商或渠道存储。供应商更名/停用不改模型关联 ID、渠道数量及渠道状态。资源与 Dashboard 对相同身份/业务域的模型/渠道计数保持一致；主档总数可以包含无渠道供应商，不能与资源提供方数量混用。

未来 Stage 04B：createResourceApi 只依赖 ResourceReaders 的既有授权批量读方法，不内嵌 fixture。模型/渠道变为可变 Repository 时应统一接入原 listModels/listChannels，再供资源页、Dashboard 和供应商摘要共同读取；本阶段不预先实现渠道写入、OP 绑定、价格或测试执行。

## Stage 04B：可维护渠道与一致的数据图

继续使用 Channel；ManagedChannel 仅交叉扩展 `version/createdBy/updatedBy`，不引入第二种业务实体。初始 ID 原样保留，新增 ID 由 UUID 生成，不依赖供应商名称。普通编辑严格白名单，不能修改 id/supplierId/modelId/OP ID/来源核验/测试/接入/开放状态。未知能力保留 null，TPM/RPM/并发为非负安全整数，TTFT 为有限非负毫秒数。

ChannelRepository 的独立 `maas-channel-demo-v1` 存储 envelope 为 schemaVersion=1、revision、channels、tasks、history；不修改 Stage 03 供应商存储。每次读新快照，结构/版本不兼容报错且不自动覆盖；每次保存执行完整 validateStore（使用当前供应商）和 revision 检查，单次 setItem 保存渠道、关联任务及历史。写入失败不产生部分成功。仅用于单浏览器 Mock，不保证跨标签页原子事务。

新建渠道默认 enabled、unverified、quality/connectivity pending、integration not_started、availability closed、opChannelId null。原子初始化 quality/connectivity 两条 pending TestTask，assignedTo=null；不生成执行、豁免、报价或通过结果。既有执行、豁免、报价仍保留 fixture 历史，查询引用当前渠道/任务 Repository。

ChannelChange 保存 channelId/action/actorUserId/occurredAt/changedFields/beforeSnapshot/afterSnapshot/reason，创建 before=null，其余为同一渠道前后快照。主档写入与事件同一存储单元，普通操作只追加；无实质变更不写入、不增 version、不产生事件。历史限获准产品运营及当前业务域读取。

SupplierRepository 是唯一供应商主档，ChannelRepository 只存 supplierId。模型覆盖按 supplierId 去重，主档名称/状态实时从 SupplierRepository 取得。渠道重置恢复初始渠道/任务并清除本阶段渠道历史，保留供应商与既有静态历史；供应商重置若将使新增渠道关联悬空则拒绝，要求先明确重置渠道，再单独确认供应商重置。

## Stage 05A：采购寻源持久化与分级文本

继续使用 Demand/DemandItem/DemandChannelMatch。Demand.customerId 兼容扩展为 string|null，内部资源优化可无客户；已有 ID、状态和折扣品牌类型不变。Match 保留 candidate/suitable/unsuitable，并增加 excluded，排除保留原关联及历史，可通过原 ID 重新评估。

ManagedDemand 是原 Demand 的交叉扩展：demandCode、title/description（运营受限）、sharedTitle/sharedSummary（采购共享）、priority（normal/high/urgent）、dueAt、version、createdBy/updatedBy。创建请求使用每次表单独立的 UUID 幂等标识，内部 ID 与可读 MOCK-REQ 编号分离；重试不会创建第二套主单和明细。主单版本覆盖所有编辑、候选和进度写入。

ManagedDemandItem 交叉扩展 requiredRegion、priority、createdAt/updatedAt；模型关联已有明细后不可普通迁移或删除，可追加明细。能力为空表示未知，TPM/RPM/并发为非负安全整数，TTFT 为有限非负毫秒数；targetPurchaseDiscount 仍为 0..10000 的 DiscountBps，UI 展示折数不改变存储真值。requiredRegion 不决定模型业务域。ManagedMatch 交叉扩展共享 assessment、createdBy/updatedAt，一对明细/渠道只能存在一条关系（含排除），同供应商多个渠道合法。

SourcingRepository 独立键 maas-sourcing-demo-v1，schemaVersion=1、revision、demands/items/matches/history。从 fixture 初始化并保留原 ID，已知缺少的分级字段使用独立模拟内容补齐，不从受限文本自动复制共享摘要。一次 setItem 保存主单、明细/候选及追加历史；写前检查结构、完整领域引用、模型一致、唯一关系、版本/revision，失败无部分提交。无变化不写入或生成新历史。

SourcingEvent 记录 demandId/demandItemId/matchId、action、actorUserId、occurredAt、共享 note 以及字段 before/after 差异，不采用通用原始快照返回。查询显式投影主单、明细、候选及历史；采购历史仅允许共享/采购技术字段，不接受未知字段自动透传。

供应商与渠道仍分别由原 Repository 管理，不改其持久化格式；寻源只存稳定关联 ID。查询当前渠道能力/状态与当前供应商主档，停用保留历史关系但影响辅助判断和初步覆盖。渠道重置若会移除任何被候选（含排除）引用的新增渠道则被阻止；需先明确重置寻源，再单独确认渠道重置。寻源重置只恢复原需求/明细/匹配并清空本阶段跟进，不清除供应商、渠道、测试或报价。

## Stage 05B：渠道报价、询价和独立确认

沿用 ChannelQuote/DiscountBps/QuoteStatus/appendQuote；ManagedQuote 交叉扩展 inquiryId、demandId、demandItemId、recordedBy、supplierSubmitterReference、supplierQuotedAt 和 priceSpec，不创建第二套 Price 真值。供应商/模型通过当前 channelId 推导。主单/明细关联可空，关联明细时必须同模型且属于指定主单；前序报价必须同渠道。采购目标与报价折扣完全独立。

PriceSpec 包含可空 ISO 三字母币种、折扣价格基准、适用规格和 rates。每条 rate 明确 dimension（input_token/output_token/image/video_second/request/other）、每份数量、单位及可空 amount。不得为未知模型自动填 Token 规格。金额真值是非负十进制字符串，最多12位整数/6位小数，精确比较转为 bigint 微单位，bigint 不进入 JSON；不用浮点金额或汇率。不提供金融结算舍入规则。缺失金额是未知，不是零。

InquiryRecord 记录稳定 ID、channelId、可空 demandItemId、requestedBy/At、responseDueAt、status、followUpNote、version、createdAt/updatedAt。状态 draft/sent/quoted/closed；收到关联报价可在同一次保存中标记 quoted，不表示已核验。

QuoteRepository 单键 maas-quote-demo-v1，schemaVersion=1、revision、quotes/inquiries/decisions/history/requests。旧报价 ID、原折扣/确认/证据原样保留，新口径缺失用 null/空 rates，recordedBy 与原始供应商提交人引用未知时不推断。原 submittedBy 保留为系统提交人；新手工转录另存供应商原始 mock: 引用及系统录入人，sourceType 保持 supplier_submission，不改成“采购确认”。

报价记录及 QuoteDecision/QuoteAudit 只追加，Repository 拒绝旧数组前缀被覆盖。核验和模拟正式确认写独立决策事件，不改旧报价；查询兼容投影将正式确认人/时间/依据/生效时间与 effective 状态合成到 ChannelQuote 视图。原录入状态仍单独展示，操作 version=1+该报价决策数。更正新建 sourceType=correction、previousQuoteId 和原因，真实后续调价仍用原来源类型，均保留全部历史。

请求按操作人+请求标识幂等，内容不一致复用标识报冲突。保存前复用 appendQuote 和完整 validateStore，并校验询价/需求/明细/渠道引用、模型、版本/revision；报价+询价回复+审计单次 setItem，失败无部分记录。其他三个 Repository 格式不变。
