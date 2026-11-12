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

## Stage 02 — 2026-11-13（Asia/Shanghai）

基线：已验收 6b0324d70b7425cafa9f8073be0d7dd6054ad802，开始时工作区干净，本地及远程没有 stage-02-app-shell，创建独立分支，不从 main 建分支。

实施：统一导航与路由配置、AppShell、侧栏折叠/窄屏抽屉、顶部角色和业务域选择、通用 PageHeader/StatCard/StatusBadge/加载/空态/错误反馈、工作台、其余模块占位。保留 /welcome 与原 WelcomePage；/ 进入 /dashboard。导航项按既有动作权限显示，直达无权占位路由显示 403，未知路由显示 404。占位只说明职责和规划 Stage，没有编辑或写入。

数据：services/demo-session 通过安全演示身份元数据创建绑定用户与业务域的 Mock Adapter。可选业务域在 Adapter 内校验授权并与原 modelDomain 规则交集；没有改变领域模型、权限规则、报价规则、测试状态或 OP 绑定规则。仅补充一个海外单域运营演示身份，未复制业务记录装饰页面。getMockProfiles 不返回客户/供应商授权列表。loadDashboard 只聚合现有授权查询，不依赖原始 Mock，不返回原审计快照/受限事件详情。

指标：运营七项授权统计由记录计算；需求缺口按合适候选供应商不足三家、主需求去重；质量和连通待处理为 pending/running；整改未关闭；报价待合同确认；事件已登记/调查中。寻源概览按需求明细，其余按渠道独立状态；不构造混合漏斗，不推断实时健康、价格结算或审批规则。活动每类最近一条；资源/供应商速览不宣称未经授权的更新时间排序。未知能力保持 null，在 UI 显示“未知”。

身份隔离：角色/域切换重建 Adapter，按选择 key 卸载内容树；请求清理标记拒绝过期响应，结果还按 API 实例隔离。sessionStorage 仅存演示用户 ID 和域选择，刷新保留选择与路由，不存业务记录。演示选择不是认证，生产仍需后端鉴权。

共享组件影响：新增组件仅由本阶段 Shell、工作台和占位页使用；原 WelcomePage、原 65 个单元测试及原 Playwright 文件未修改。官方 @ant-design/icons 从已有间接依赖显式声明为直接依赖（npm install 无新增安装包），无其他 UI/状态管理依赖。

测试修复：jsdom 没有 ResizeObserver/伪元素样式，需要浏览器几何 API 的环境适配；真实布局另用 Chromium 测试，不屏蔽 console 或测试错误。首轮域选择 E2E 遇到下拉关闭动画导致多个可见容器匹配，改用具体选项断言后通过。使用当前 Ant Design API，移除新代码中废弃的 List、Spin tip 和 Drawer width 用法。

验证：执行 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`，TypeScript 严格检查、ESLint、Prettier、Vitest 7 文件 / 88 个测试（保留原 65，新增 23）、Playwright 5 个测试（保留原 1，新增 4）及生产构建全部通过，退出码 0。覆盖角色/域统计、底层字段缺席、供应商范围、前台匿名、过期请求、已渲染敏感数据清除、空态、错误重试、占位、路由刷新、选择刷新和窄屏导航。另用 Chromium 在 1440、1280、390px 实测整页无水平溢出，pageerror 为 0，并查看截图。

风险与交接：当前构建 JS 约 1.14 MB（gzip 约 361 kB），保留 Vite 大包提示，不调高阈值掩盖；后续有性能目标时再规划分包。Mock 数据在前端代码中可读取，不是生产权限；单域供应商主档与无渠道主档、供应商级跨域事件规则沿用 Stage 01 限制。我的待办是角色范围汇总，不是认领系统；活动是分类摘要而非完整审计。角色视角/系统说明仅说明占位，切换入口在顶部。没有业务写入、生产连接、数据库或真实账号，没有合并 main/强制推送。完成后停止，Stage 03 未开始。

## Stage 03 — 2026-11-13（Asia/Shanghai）

基线 d996d0e5eb8468448187347f5410536d2ddb5467，开始时工作区干净，本地/远程不存在 stage-03-supplier-management，从验收提交创建独立分支，不使用 main。

完成：供应商列表、授权统计、名称/缩写检索、合作/启用/类别/负责人筛选、排序分页、重置筛选；新增/编辑抽屉；主档详情；负责人分配；启停二次确认；按当前授权域计算资源概览；字段级前后值的主档历史；本地演示重置及存储错误恢复。其余业务仍占位，无报价/渠道编辑、测试结果、外部门户、生产接口或新依赖。

共享影响：继续使用 Supplier.id/name，扩展主档字段与 version；新增主档管理范围和独立采购维护授权，修复无渠道不可读。旧渠道仍按厂商域和最新维护授权过滤，供应商负责人不决定模型域。测试/运维只读身份摘要，供应商仅自身，前台拒绝。既有客户/成本字段策略、事件投影、报价历史、OP 绑定和测试状态未重写。

Mock Repository 统一支撑旧 listSuppliers、工作台与管理 API。localStorage 单键 maas-supplier-demo-v1、schemaVersion=1，持久化 suppliers/scopes/maintenance/history/revision，演示身份仍用独立 sessionStorage。每次写入重新鉴权、检查版本及全局 trim/大小写唯一性，成功写入后才返回成功；失败无内存提交。无实际变动不追加版本/日志。新主档不要求渠道，采购主要负责人取得明确维护授权。

旧会话写隔离：角色/域切换撤销旧 DemoSession 写标记，保留原数据子树卸载及过期读取防护。AppShell 仅将选择和会话成对保存并更新 Mock 文案，不重写布局。检查 SidebarNavigation 的全部引用（仅 AppShell）后补上详情路由的父菜单高亮。ErrorState 仅新增可选说明，工作台默认提示保持原样。

自动化：完整执行 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`，退出码 0。TypeScript 严格检查、ESLint、Prettier 全通过；Vitest 8 文件 / 130 测试（保留原 88，新增 42）通过；Playwright 11 测试（原 5、新增 6）通过；生产构建通过。覆盖新增、唯一性、无渠道授权、身份切换、负责人转交、启停不级联、字段/历史权限、并发冲突、无变化不留痕、刷新恢复、确认重置、读写失败、未知 schema、未知存储字段、搜索筛选分页与 1440/1280/390px。

原测试保留；Stage 02 的占位导航测试改用仍未开放的模型资源池（Stage 04），因为供应商已正式开放，原导航/刷新/占位断言意图不变；未删除、跳过或放宽测试。新增浏览器测试修复了必填标签星号、中文按钮空格及路由切换未完成时定位重复按钮的问题。负责人选择需等待选择提交和正确标签后再填写其他字段，使用状态断言，不加重试或任意等待掩盖问题。Descriptions 使用响应式 filled 跨列，消除窄屏列数警告。

截图：harness/build/stage-03-suppliers-1440.png 与 stage-03-supplier-detail-1440.png，均为真实 Chromium 1440px 截图，已查看；截图运行 pageerror 为 0。没有真实客户、供应商联系人、密码或 Key。

限制：localStorage 可被浏览器工具修改，非生产安全、真实审计或多用户一致性；版本校验不是跨标签页原子锁。组织管理范围、多采购维护、外部账号流程、schema 迁移及生产备注/附件分级仍 TBD。保留构建大包提示，当前 JS 约 1.24 MB，gzip 约 391 kB；未提高阈值掩盖。文档和 Stage 03 交接已更新，停止等待验收，不开始 Stage 04，不合并 main 或强制推送。
