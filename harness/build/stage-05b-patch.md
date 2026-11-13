# Stage 05B Patch：报价历史不可变性加固

基线：3f796260c64cea102d322fa3de4beddd81a34f2c。沿用 stage-05b-quotation-management；仅追加保护、回归测试和本批记录，不进入Stage06。

QuoteRepository.write 原有逐项比较已会拒绝 quotes/decisions/history 截短，但 requests 没有追加保护。现将四个集合纳入统一检查：next长度不得小于before，before中每项必须在原索引保持完整JSON内容；新增项只能放在旧前缀之后。错误明确指出不能覆盖或删除。保留原结构/完整引用校验、revision冲突检查与存储错误处理，不修改任何Repository格式。

inquiries继续允许原跟进流程更新，不列入完全不可变集合；询价版本、流转和审计规则沿用并由原测试回归。显式确认的演示数据重置行为不变。此保护仍是本地Mock程序校验，不是生产级防篡改。

新增18个单元用例：四个集合分别拒绝尾部截短、全部清空、字段修改和顺序颠倒；嵌套价格内容删除/审计差异修改拒绝；合法报价、更正、核验和确认追加后旧前缀保持不变并可重建读取。每次非法写入验证原持久化文本不变。修复前新测试复现4个失败（requests尾部/全部删除、修改和重排），修复后报价测试83个全部通过。

完整验证：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify 完整退出码0；严格类型、ESLint、Prettier、Vitest 13文件/378测试（原360+新增18）、Playwright 33测试（全部保留）、生产构建通过。未关闭测试、放宽类型、超时或重试。保留既有约1,047kB共享块构建提示，未调整阈值。

变更文件：

- src/mocks/quote-repository.ts
- tests/unit/quotations.test.ts
- harness/build-log.md
- harness/build/stage-05b-patch.md

仅普通提交并推送原分支，不修改main、不强制推送，完成后等待验收。
