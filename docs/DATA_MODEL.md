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
