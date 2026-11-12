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
