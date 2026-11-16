# Stage 07B 交接

基线 d67ad443be25563a38c2240d8b31cb46915f37dc；分支 stage-07b-remediation-management，原 checkout。

整改独立 maas-remediation-demo-v1，ChannelRepository v2 不变。旧 Fixture 字段、ID、状态与 passed 引用保留；未知元数据不补造。主档版本化，提交、复测链接、关闭、事件、幂等仅追加。每次完整候选单键保存；未知版本及损坏拒绝。

正常关闭要求本轮提交、明确链接的 passed/finished 执行、startedAt >= submittedAt、同渠道/类型/目标引用、当前配置及目标版本、仍现行的运营采纳结论；相关更晚待处理失败/不确定拒绝，无关目标不阻断。预览绑定两聚合快照，确认重验；只写整改。不要求来源任务与复测任务相同。

测试仅本人负责人范围可跟进、提交、关联，运营负责分配/期限/退回/关闭。采购与运维只有独立技术摘要，供应商保留自身 legacy 基础读取，前台拒绝。所有存储和鉴权均为前端 Mock，不是生产安全。

整改重置只影响整改，渠道重置检查所有整改及不可变历史的渠道/任务/执行/结论引用。报价/寻源全图校验使用动态整改，原 schema 和商业规则保持。

localStorage 不提供跨标签页 CAS 或跨存储键事务；不合作客户端和旧版显式重置仍可能绕过前端保护。自由文本只允许虚构技术说明，不保证自动保密审查。现行结论和测试事实仍由 Stage 07A 维护。

Stage 08 可复用 remediationId、channelId、supplierId、状态、closureType、时间和专用历史；未实现供应商评分、排名、处罚或黑名单。完成后停止等待验收。
