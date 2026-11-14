# Stage 06B 交接

- 唯一基线：863f8444cab5147b67f501ba53cc425f2de009d7；分支 stage-06b-bulk-quotation-adjustment。使用原 checkout；不动 main、不合并、不强推。
- 入口 /procurement/bulk-quotes、/:batchId；QuoteDetail 以结构化结果关联回批次。页面不导入 fixture/Storage；所有服务从当前授权 Repository 读取，无价格副本。
- 领域：bulk-quotations.ts；统一 QuoteInput 在 domain/quotations.ts，services/quotation-types.ts 继续兼容导出。quote-command.ts 为单条/批量共用验证和无持久化候选构造；compareQuotes/compareAnalysis 未改变。
- 批次 draft/submitted；itemId 独立、同渠道可多行；删除行保留审计且不能复用 ID。无实质变化不写盘/递增版本/追加事件。保存半成品不形成报价，提交才完整校验。
- QuoteRepository 同键 v2：原五集合原样保留；新增 batches/batchEvents/batchSubmissions。读取 v1 仅内存补空集合；写入校验当前与候选完整领域引用，再一次持久化升级。损坏/未知普通读写拒绝。原四类历史和新事件/回执都只追加，询价仍可跟进更新。提交后批次不可改。
- 原子提交不循环 createQuote：构造所有新 quote、逐条审计、必要询价跟进、批次、稳定映射与 actor/request/op/fingerprint 结果，再一次 write。写前完整快照比较；任何校验/存储失败保持原字节及草稿。相同请求重放返回首次完整结果；重新提交已提交批次失败。
- 完整范围授权同时覆盖当前及已删除行的历史渠道。采购必须有当前维护关系和域；运营/采购可编辑同范围别人创建的草稿。其他角色批次 API 拒绝；猜测 ID 不泄露；显式投影不返回原对象。提交和重放重新鉴权。
- 预览令牌覆盖全局报价/供应商/渠道/寻源 revision、批次版本、前序决策、当前正式集合、当前期间分类及身份/域。保守失效，刷新重校验；storage 事件只辅助 UI，非权威授权。
- 参考选择显式可空；更正继续 quote:correct/前序/原因。规格、商业状态与期间分别展示；数字差非采购结论。未知金额/口径不推断；多条正式价/优惠不替换，无自动核验/确认。
- 报价显式重置清完整 v2；渠道/供应商/寻源局部重置检查批次现存及历史动态引用，不改变其他 Repo 格式。
- Mock 限制：单次 setItem 不是生产事务/CAS；跨标签页最终检查仍有竞争窗口，无跨设备/多人保证。合作旧 v1 客户端普通读写拒绝 v2；无法防止不合作旧代码直接 Storage 写入或旧版显式重置。没有引入片面 Web Lock；生产须统一后端事务与版本协商。
- 自由文本限虚构共享商业资料，不含客户/真实合同/Key；没有自动脱敏或生产权限承诺。未做 Excel、批量核验/审批、真实发送、结算选择、Stage 07。
- 完整测试、截图和文件清单见 ../build/stage-06b.md。保留此前全部 446 单元与 39 浏览器用例，完成后等待验收。
