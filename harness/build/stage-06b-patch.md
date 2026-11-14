# Stage 06B 验收补丁与关键业务边界复核

日期：2026-11-14（Asia/Shanghai）。基线：0e0e3bb099db61391de2933e6742f20e013087cf；分支：stage-06b-bulk-quotation-adjustment。开始时工作区干净，本地与远程指定SHA一致；无其他修改。先读指定规范/交付/交接/日志及相关源码/测试，再形成专项结论和最小实施方案。使用原checkout，不创建分支或worktree，不修改/合并main。

## 1. 询价关联结论：通过，最终商业基数待确认

Stage 05B createQuote没有“一询价只能一报价”限制；prepareQuote拒绝closed、核对当前inquiryVersion及渠道/需求明细。单条录入仅当询价尚非quoted时转quoted、增版一次及追加reply_recorded，已quoted录入更多报价不重复更新。批量构造全部候选时使用同一当前快照，对inquiryId使用Set去重，仅更新非quoted的不同询价一次，语义一致。

专项测试实际通过原API建立draft/sent/quoted/closed询价，不篡改fixture：证明单条连续录入允许多报价；批次A/B同询价、C另一询价时版本/审计与报价完整对应；关闭、旧版本和非法行整批拒绝。预览后跟进/关闭改变版本，会使旧token失效；失败时询价及整聚合字节不变。没有新增回复状态/审批，不改变单条报价行为。业务文档补充现有兼容边界；未来商业基数限制待业务确认，本次不收紧。

## 2. 原子提交、幂等与并发结论

原子提交通过：全部候选、逐条审计、询价变更、submitted批次、itemId→quoteId回执及请求指纹构造完成后，一次QuoteRepository.write/setItem。结构/引用/历史前缀校验在持久化之前；缺回执、缺关联报价、草稿与回执矛盾的候选由实际validate拒绝，存储保持原样。持久化异常零部分成功，可用原requestId重试。没有循环单条保存或补偿删除。

幂等通过：请求按actor/requestId/operation/fingerprint匹配，返回首次完整回执。忽略成功返回后重建Adapter/Repository重试仍得到存储中的同一结果，无新增审计；不同版本/token/确认内容/批次/操作复用拒绝；换成另一获准操作者不能冒用原人的结果。成功后撤销会话、改变角色/域/维护授权或仅剩已删除行的部分域授权，重放也拒绝，未绕过当前权限。

版本保护通过：token包含批次及四Repository版本、actor/域、参照决策版本、正式价集合和查询时刻的期间分类。正式确认、询价跟进、供应商/渠道/寻源变化、生效/截止边界与未选参照正式价到期均使预览失效。v2旧快照不能覆盖后来的合法写入。两个同线程Adapter不同请求一个成功一个冲突，相同请求得到同一回执；此测试不声称跨标签页绝对CAS。真实两页确认窗口的失效与刷新由E2E验证。

## 3. 唯一确认的缺陷与最小修复

触发：两个标签页同一草稿都完成预览并打开二次确认；A提交后，B收到storage事件清空preview；B仍点确认。原子/授权边界仍正确拒绝，但原普通Error被resourceErrorMessage转成“资源数据查询失败，请稍后重试”，未明确要求刷新重校验。1440和390两个真实浏览器用例均在修复前复现该错误文案。

修复仅BulkQuotesPage导入现有ResourceError，并将失效预览分支改用它，固定提示“预览已失效，请刷新批次并重新校验。”。不改共享错误处理、不新增状态/锁/价格缓存，不改服务/Repository/存储格式。询价关联、报价价格/历史/比较、采购权限、单条核验/运营确认及结算价并存规则全部不变。

## 4. 测试与工程验证

新增35单元测试、2浏览器测试，保留原528单元和45浏览器。类型和Lint及专项35单元已通过。真实浏览器在1440/390验证双确认窗口失效、明确错误、刷新后同一唯一报价映射及只读结果、整页无横向溢出与无页面异常；不伪造业务数据或响应。仅通过Storage故障开关验证实际存储失败分支；异常聚合测试明确是Repository负向边界测试，不宣称普通UI会构造该数据。

完整验证实际执行退出码0：TypeScript严格检查、ESLint、Prettier、Vitest 17文件/563测试（原528+新增35）、Playwright 47测试（原45+新增2）、生产构建全部通过。共享块仍为1,047.23kB（gzip333.25kB），保留原大包提示，未提高阈值。命令：

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`

不删旧测试、放宽断言、跳过用例或增加超时/重试；不提高大包阈值。UI仅提示修复，无布局变更，不提交重复截图；既有尺寸与完整UI回归保留。旧测试自动重生成的基线截图不作为补丁变更。

## 5. 实际修改文件

- src/features/bulk-quotations/BulkQuotesPage.tsx：失效预览提示使用现有可展示错误类型。
- tests/unit/stage-06b-patch.test.ts：35项专项边界与一致性测试。
- tests/e2e/bulk-quotations.spec.ts：仅尾部追加1440/390双窗口确认场景，旧用例/断言不变。
- docs/BUSINESS_RULES.md：澄清原询价关联语义及商业基数待确认。
- harness/context/stage-06b.md：本补丁交接。
- harness/build-log.md：过程、结果与限制。
- harness/build/stage-06b-patch.md：本报告。

## 6. 已知限制与交付

Mock的单次localStorage写入及乐观版本检查不是生产事务/CAS，仍存在跨标签页最终检查与写入之间的竞争窗口；无跨设备/跨用户强一致，不能强制阻止不合作旧客户端写Storage。未加仅部分入口遵守的Web Locks，也不重构所有Repository。当前模型及渠道模型关联普通API不可变，未用非法原始存储改绑伪造迁移业务；未来真实关联迁移须独立确认。询价最终商业基数仍待确认，兼容现有多报价行为不阻塞本期。

无生产服务/真实客户或密钥、新业务功能或Stage07。普通提交推送原06B分支；最终SHA由本报告所属提交及最终交付消息核实，可运行 `git log -1 --format=%H -- harness/build/stage-06b-patch.md`。完成后停止等待验收。
