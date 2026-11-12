# 构建与交接日志

## 第 00 阶段 — 2026-11-13（Asia/Shanghai）

完成 React + TypeScript + Vite、Ant Design、React Router 欢迎页，严格类型、ESLint/Prettier、Vitest 与 Playwright 基础环境。建立模块目录、统一 API Adapter 与显式 mock 来源类型。建立 AGENTS 的 22 条规则、8 份产品工程文档、路线图与交接目录。

原仓库仅有 MyNewFile，保持原样；未增加业务页面、真实接口、敏感数据、权限引擎或业务流程。没有部署、推送或进入第 01 阶段。

验证命令：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify
```

锁文件复现：npm ci 成功安装 298 个包，重装后再次执行完整验证。

实际结果：TypeScript、ESLint、Prettier 全部通过；Vitest 2 个文件 / 2 个测试通过；Playwright Chromium 1 个测试通过（加载、模拟数据提示、刷新、无页面运行错误）；生产构建通过。

环境诊断：默认 npm 缓存不可写，改用项目 .npmrc 指向 /tmp/maas-npm-cache。Playwright 默认浏览器缓存不可写，browser:install 使用 node_modules 内缓存。配套 Chromium 下载被网络策略 403 Domain forbidden 拒绝；本次已用环境提供的 /usr/bin/chromium 完成真实浏览器验证，不代表配套浏览器下载成功。

风险：Ant Design 基础依赖导致当前构建 JS 约 651 kB（gzip 约 212 kB），Vite 提示超过 500 kB；本阶段不扩展为性能重构。系统 Chromium 与 Playwright 配套版本可能不同，未来更新后须重跑测试。

交接：已保存云环境 install_script、start_skill 和浏览器下载域名草稿；草稿保存不等于应用或发布。当前可使用系统 Chromium，无需等待下载域名生效。未来默认安装配套浏览器需允许对应下载域名。详细 PRD、角色冲突规则、字段字典及接口契约尚未提供，不能自行补全。第 01 阶段等待用户授权。

## GitHub 协作配置 — 2026-11-13（Asia/Shanghai）

检查已有 origin：https://github.com/Mhh-Hide/NewRepo，远程默认分支 main。保留已有历史及 MyNewFile，不创建新仓库、不改变权限、不强制推送、不开始第 01 阶段。

补充私钥、凭据目录及 sensitive-data/ 的忽略规则。检查 43 个候选文件，凭据特征扫描未发现命中；源码数据为 Mock，无真实客户或供应商数据。特征扫描不能替代未来提交时的人工审查；敏感数据不得加入仓库，.env.example 仅可包含无敏感值的占位说明。

第 00 阶段保存为独立本地提交。GitHub API 读取返回 Forbidden，无法自动核实 Private 状态；上传须先确认仓库私有。若上传，采用独立分支普通推送以供审查，不覆盖 main。最终上传状态及 Commit ID 以本次交付消息和 Git 记录为准。

## 第 01 阶段 — 2026-11-13（Asia/Shanghai）

用户已授权第 01 阶段。工作区开始时干净；远程 main=819f864，尚未包含第 00 阶段。创建独立 stage-01-domain-permissions，基于已验收 stage-00-engineering-harness=2d1a5b6c06f2399a0ffac0f708602e3dfe8744c1；不覆盖分支、不直接合并 main。

完成核心领域及状态、厂商推导业务域、定点折扣、OP 绑定约束、报价追加历史、质量豁免证据及供应商缺口计算。实现默认拒绝的动作、字段和记录范围策略；只读 Mock API 在返回前实施授权及白名单投影，返回深拷贝。建立虚构供应商/客户/商业价格与完整关联夹具，加载期校验外键。扩展文档、交付及交接记录，保留原欢迎页和测试，未新增依赖、业务页面或真实接口。

中间检查：类型检查发现集合枚举时隐式类型推断问题，已改为明确类型集合，不使用 any 或放宽编译约束；修复后原有与新增测试通过。最终验证结果在下方记录。

风险：前端夹具可被开发工具读取，因此这些策略仅模拟响应授权，不构成生产安全。后端必须实现鉴权、事务、审计持久化及防篡改。临时优惠与历史报价没有实现当前结算价选择，不能将历史列表直接用于结算。跨域供应商主档无可见渠道时默认不可读。自由文本/附件的真实敏感信息隔离仍需后端设计。保留原有构建体积提示。

TBD：详细状态流转、报价优先级、折扣业务边界、原厂核验细则、OP 纠错、多角色合并、无渠道主档授权、真实身份与接口契约。第 02 阶段未开始，等待本阶段验收。

最终验证（2026-11-13）：执行 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`，退出码 0。TypeScript strict、ESLint、Prettier 全通过；Vitest 4 个文件 / 49 个测试通过（含第 00 阶段原有 2 个测试）；Playwright Chromium 原有 1 个测试通过；生产构建通过。保留约 651 kB 的既有 JS 包体积提示，未放宽阈值。另检查 git diff --check，无空白错误；欢迎页、原测试、依赖与锁文件无改动。未安装依赖、未连接生产、未部署。提交在第 01 阶段分支独立保存并采用普通推送供审查，不合并 main。

## Stage 01 Patch — 2026-11-13（Asia/Shanghai）

基线与远程均为 f5562540456c2472b39b1ede82ea3e9fb61bc2bb，开始时工作区干净，继续在 stage-01-domain-permissions 局部修复。未修改角色或记录范围规则，没有页面、依赖、数据库、生产连接或第 02 阶段开发。

修改：validateStore 拒绝重复非空 OP 渠道 ID、允许多个 null；bindOpChannelId 增加必传完整渠道集合、冲突错误、规范记录检查和幂等确认。原 OP 绑定测试仅补齐参数，原断言保留。一对一假设待真实 OP 契约确认，未来后端需原子唯一约束。

事件拆分固定摘要代码、受限混合 description、结构化客户身份、客户售价和采购折扣；listIncidents 返回明确白名单 SupplierIncidentView。产品运营读完整授权信息，采购不见客户及售价，运维不见商业字段，均不见混合全文。没有自动关键词清洗。Mock 夹具加入完全虚构的敏感详情用于验证泄露边界，API 深拷贝保护保留。前台渠道增加稳定 anonymousCode，显示名称可区分，不引用供应商 shortCode。

验证：执行 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`，类型、Lint、格式、Vitest 5 个文件 / 65 个测试（原 49 + 新 16）、Playwright 1 个测试与生产构建全部通过，退出码 0。原页面、原权限测试、依赖及锁文件保持不变；新增测试涵盖冲突/null/幂等/陈旧绑定、各角色事件投影与受限全文、原始额外字段、固定摘要与匿名代号。

中间检查发现测试对 null 结果使用了对象属性断言，已区分无权限返回 null 与可读角色字段断言后重跑通过；没有关闭测试或放宽类型。

未决：生产附件及自由文本的分级录入/审查/下载鉴权待设计；Mock 投影不是生产权限，前端夹具仍可读取；OP 一对一契约及正式匿名代号策略待确认；保留原 651 kB 构建体积提示。以上记录在 DATA_MODEL、PERMISSIONS、DECISIONS 和 stage-01 交接中。没有合并 main，不强制推送，停止于本次补丁。
