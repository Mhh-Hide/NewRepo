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

## Stage 04A — 2026-11-13（Asia/Shanghai）

基线：已验收 b1a6bb121e8e108cf3855578d118d21ceb161b6e，本地/远程核对一致，工作区干净，目标分支不存在；从该提交创建 stage-04a-model-resource-pool，不使用 main。

页面：开放 /models 列表、/models/:modelId 详情和 /channels/:channelId 只读详情。支持名称/代码、授权厂商、类别、地区、启用、可见渠道、获准的供应商覆盖筛选，排序/分页/重置；展示模型覆盖、类型分布、能力与四个独立状态。供应商身份可链接到现有详情，供应商详情仅增加“查看关联模型”入口；/channels 管理列表及历史能力继续占位，无写入表单。

数据/一致性：ApiAdapter 只新增 ResourceApi；createResourceApi 从既有授权 readers 批量查询后按模型/供应商 ID 汇总。无 per-model API 请求，测试验证每个 reader 每次查询仅调用一次。SupplierIdentity 摘要来自原 listSuppliers 的当前 Repository，不导入或复制供应商 fixture；改名/缩写/停用后刷新同步，新增无渠道主档不增加覆盖，停用不删除渠道或修改状态。领域模型、auth、SupplierRepository、SupplierApi 写入、报价、OP 绑定和测试状态定义均未修改。

权限：继续使用原角色/域/所属范围；未知和未授权详情返回 null。资源接口不含客户、价格、联系人、备注或审计快照。前台不调用供应商主档 reader，不返回身份/覆盖家数或技术引用，并拒绝 supplierId/覆盖参数探测。技术字段仅从已授权 ChannelView 存在的属性复制，null 能力保留“未知”，OP null 为“未绑定”。渠道匿名代号由原投影提供。

界面/兼容：复用已有 Shell/Header/统计卡/状态与反馈；新增三个页面懒加载包装，保持 Fast Refresh 规则，不改 ESLint。SupplierDetail 仅在已有授权资源摘要有模型时显示关联模型链接，原编辑和保存逻辑不动；Shell 仅更新阶段文案。新请求 hook 忽略旧响应，继承身份/域子树隔离。无新增依赖、无 localStorage 直读写、无真实 OP/测试平台/Monitor。

测试：执行 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify` 最终退出码 0；严格类型、Lint、格式通过；Vitest 10 文件 / 161 测试（原 130 + 新 31）全部通过；Playwright 16 测试（原 11 + 新 5）全部通过；生产构建通过。覆盖模型多供应商/同供应商多渠道去重、厂商域/地区版本、主档改名同步与停用保留、无渠道供应商、Dashboard 一致性、各角色字段和记录边界、未知能力、独立状态、空态/错误重试/过期响应、筛选导航/刷新及 1440/1280/390px。

既有测试保留：原占位导航用例因模型模块已开放，改为检验仍未开放的报价页；未删除或跳过断言。完整运行曾复现原 Stage 03 下拉选项指针提交未关闭的时序问题；现用“hover 目标、断言 active、键盘 Enter 提交、断言关闭及正确标签”，不增加重试/等待时间，不改供应商业务逻辑。单独回归与完整验证均通过。新增 E2E 的期望数据取自实际授权 Service，不注入假的页面响应。

截图：stage-04a-model-pool-1440.png、stage-04a-model-detail-channels-1440.png、stage-04a-channel-detail-1440.png，保存在 harness/build，均由真实 Chromium 1440px 截取并查看；运行 pageerror=0。仅虚构业务资料与公开厂商/模型示例。

限制：模型和渠道仍是原只读目录，Stage 04B 应在统一授权 readers 后接入 Repository，不能在页面建立副本；供应商本地存储安全与并发限制沿用 Stage 03。覆盖为存量关联统计，不保证需求匹配或即时可用；前台不提供供应商家数筛选；完整历史尚未开发。三个业务页已独立拆包，仍有共享块约 783 kB（gzip 251 kB）的既有大包提示，未提高阈值，不声称已完成整体性能优化。文档及交接已更新，不合并 main、不强制推送，不开始 Stage 04B。

## Stage 04B — 2026-11-13（Asia/Shanghai）

基线：已验收 ddf02ffaed75994303c00531db50085470bc65ac，开始时工作区干净；从该提交创建 stage-04b-channel-management，未使用旧 main，远程目标分支为空。仅渠道主档与资源一致性，不启动 Stage 05。

页面：/channels 正式启用目录，授权指标、名称/代号和厂商/模型/获准供应商/类型/状态/OP 绑定筛选，排序分页及重置。运营从抽屉新增，成功进入详情；详情支持基础信息编辑、独立资源启停、模拟 OP ID 输入/前后预览/确认与历史。其他角色保持只读，前台匿名且不显示供应商/OP 筛选或技术字段。复用 Shell、Header、统计卡、状态与反馈、资源查询 hook/模型渠道表，渠道路由懒加载，无新增依赖。

存储与领域：保留 Channel 和初始 ID，以 ManagedChannel 交叉扩展 version/操作人；新 ID 由 UUID 生成，普通编辑白名单不含关联/技术状态/OP ID。数值空为 null，非负有限，TPM/RPM/并发为安全整数，TTFT 毫秒；表单拒绝小数整数能力，不自动四舍五入。新渠道与 quality/connectivity 两条 pending 任务及创建历史同次保存，保持 validateStore，不生成报价、执行、豁免或通过结果。

统一 ChannelRepository（独立 maas-channel-demo-v1）保存 schemaVersion/revision/channels/tasks/history，SupplierRepository 原 v1 保留不迁移覆盖。所有 mock-adapter 渠道/任务查询及授权、资源池、供应商摘要、Dashboard 均引用统一数据源。模型覆盖按供应商 ID 去重；新无渠道供应商可成为候选。创建授权复用已有 canReadSupplierMaster，不把供应商管理域当模型域，不按负责人推断。供应商重置若会破坏新增渠道引用则拒绝，要求先单独确认渠道重置；渠道重置保留供应商/历史与原静态报价/执行，不静默清空其他模块。损坏/不兼容渠道数据不自动覆盖，显式确认渠道重置可恢复。

权限/审计：五项独立 Channel PermissionAction 仅运营。每次写入检查有效会话、角色、可见记录/域和版本，采购维护权不继承渠道写权。已有投影仍保护供应商、前台和其他角色；技术可见性元信息避免空列表推断权限。历史只向授权运营按域投影返回，记录前后值、字段、操作人、时间、原因；无变化不写入、不增版本、不生成历史。OP 复用完整集合唯一性规则，不允许覆盖或重绑，相同 ID 重试幂等（含旧请求版本），不联动技术状态。页面始终标识模拟未接生产。

验证：最终执行 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify，退出码 0。类型、Lint、格式通过；Vitest 11 文件 / 232 测试（既有 161 + 新增 71）全部通过；Playwright 21 测试（既有 16 + 新增 5）全部通过；生产构建通过。覆盖原 30 项场景及非法能力参数、全部非运营角色写入拒绝、历史投影、跨域/旧会话、OP 全局冲突/幂等、乐观并发/无变化、存储失败/刷新/重置、供应商访问策略与跨模块同步。E2E 验证真实表单、非法小数保留、详情导航、修改恢复、覆盖统计、绑定预览/冲突、角色切换、1440/1280/390px 及兼容错误显式恢复，不修改 fixture 伪造保存。

回归说明：保留全部既有测试；旧资源页尺寸场景仅将运营详情标题更新为“渠道详情”，前台仍为“渠道只读详情”。其 Node 侧期望值查询新增注入只读 ChannelRepository，避免服务计算期望时误用浏览器 localStorage；不改变页面返回，不删断言，不增加超时/重试。开发期失败的下拉选项名称、异步断言和范围选择器已修正，最终完整回归通过。

截图：harness/build/stage-04b-channels-1440.png、stage-04b-editor-1440.png、stage-04b-detail-1440.png、stage-04b-op-preview-1440.png。真实 Chromium 截取并逐张查看，仅虚构主档与公开模型示例，截图流程 pageerror=0。

风险与交接：本地 Mock revision 不能保证跨标签页/多用户事务或真实鉴权；生产后端、附件/自由文本保密、OP 一对一契约/真实格式/解绑、关联迁移及停用合作例外继续待确认。无新依赖，但新增组件使共享块约 1,047 kB（gzip 333 kB），保留构建提示，不放宽阈值，不声称已完成性能优化。README 额外更新当前操作入口/重置影响/停止阶段，指定 docs、ROADMAP、build/stage-04b.md、context/stage-04b.md 已更新。检查忽略规则和变更范围，无真实接口/凭据、运行产物或敏感数据。只提交/普通推送本分支，不合并 main、不强制推送，完成后等待验收。

## Stage 05A — 2026-11-13（Asia/Shanghai）

基线：确认 HEAD=4dc3c1af4915765e61699b4368a57fd9de0ad6b9、工作区干净，从该已验收提交创建 stage-05a-procurement-sourcing，不使用旧 main；远程目标分支不存在。阅读 AGENTS、docs、04B 交接、相关领域/权限/Adapter/Repository 与页面和原测试，实施计划先于编码。只交付 05A，不推进 05B。

页面：/sourcing 由占位升级为正式列表，授权主单统计、编号/当前角色标题、模型/状态/优先级/日期区间筛选、排序分页/重置/空态；运营抽屉新建、维护主单与多模型明细，受限信息和采购共享内容独立填写，客户可空。/sourcing/:demandId 按模型分卡，展示需求状态/目标/能力/地区与候选、独立覆盖、人工匹配与进度、追加跟进的中文前后差异。候选抽屉支持供应商、类型、能力阈值和资源/质量/连通/接入/开放筛选；同模型、当前授权渠道，允许同供应商多渠道。复用已有 Shell/Header/StatCard/StatusBadge/反馈与资源 hook，新增路由懒加载，不复制整页或引入依赖。

领域与存储：兼容复用 Demand/DemandItem/Match，仅 Demand.customerId 支持 null、Match 新增 excluded；其余信息通过 Managed 交叉类型扩展，保留旧 ID 和 DiscountBps 定点整数。新建至少一条有效授权模型，未知能力 null，TPM/RPM/并发非负安全整数、TTFT 有限非负毫秒。已有明细普通编辑不能改模型/ID/删除，可追加明细。独立 SourcingRepository（maas-sourcing-demo-v1、schemaVersion/revision）存 demands/items/matches/history，从 fixture 初始化；创建请求 UUID 幂等，内部 ID 和可读模拟编号分离；主单、明细/候选和历史单次提交。所有保存检查完整领域引用、唯一关系、模型一致、版本及 revision；失败无部分提交，无变化不写入。

数据边界：原 listDemands/getDemand 全部改读 SourcingRepository，继续旧白名单摘要，不透传新增文本、采购受限数据或 assessment。供应商/渠道主档仍各自唯一 Repository，不改其存储格式；候选查询实时读取当前渠道能力和供应商主档，停用保留关系与人工历史，但辅助判断及当前初步覆盖变化。Adapter 渠道重置检查全部候选（含排除）对新增渠道的引用，依赖存在先阻止，必须先单独确认寻源重置再确认渠道；必要时再按 04B 原规则重置供应商。寻源重置仅双域运营全部域二次确认，恢复原需求/明细/匹配、清空新增跟进，保留供应商/渠道/测试/报价。损坏或不兼容存储不自动覆盖，明确重置才恢复。

权限/保密：新 sourcing 动作仅运营/采购；创建/业务需求维护仅运营，采购可在域内查看共享内容、添加/评估获准渠道及维护进度，不继承供应商维护为主单写权。测试/运维/供应商/前台不能读取新内部商业详情，前台原需求摘要保留。运营原始 title/description/customer 与 sharedTitle/sharedSummary 分开；采购查询搜索和返回只含共享内容，无 customer/customerId/requesterUserId/客户售价/运营原文。明细、候选与历史显式投影，历史差异共享字段白名单，受限-only 事件省略；按明细域/当前候选渠道范围过滤，不返回通用原始快照。混合域主单资料/状态写入要求全部明细域授权，单域可维护当前获准明细的候选。旧会话切换后失去所有寻源写能力。

业务规则：能力辅助判断 known failure 优先、其次 unknown、完全已知满足才 yes，地区限制始终需人工核实，测试通过不自动代表采购要求满足。人工 suitable 需共享依据，当前明确不符/停用禁止新增 suitable；未知可人工初步记录但不等于自动验证通过。当前初步覆盖按启用且无明确能力不符的人工 suitable 的不同 supplierId 去重，不把三条渠道当三家，不足三家仍可保存。未开展、候选待核实、初步不足、人工确认 gap 和初步覆盖达标明确区分。主单进度用统一流转表，matched 需每明细三家，gap 需不足并人工说明；closed 终止写入。计数不自动改合同、测试、OP 或主单历史结论。

Dashboard：需求来自当前 SourcingRepository，缺口直接复用 querySourcing 的授权规则；新增主单总数。零关联且未人工标 gap 不直接计缺口，已有候选待核实则计当前覆盖不足并独立显示阶段；初始全域/海外缺口从 2→1，国内仍 0。人工 matched 状态和当前数学覆盖独立，资源变化后可同时计入已匹配和当前缺口；不会自动覆写人工历史。

验证：最终 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify 退出码 0。严格类型、Lint、格式、Vitest 12 文件 / 295 测试（保留原 232 + 新增 63）、Playwright 27 测试（保留原 21 + 新增 6）、生产构建全部通过。覆盖 PRD 25 项及定点/非法数值、原 ID/关联、创建重试幂等、编辑/候选/状态版本、失败原子性/无变化、共享搜索/原文/未知字段/历史泄露防护、混合域与旧会话、供应商去重、未知/TTFT方向/停用、排除与重新评估、显式进度及 Dashboard。E2E 用真实页面保存，不改 fixture 伪造成功，验证多模型、采购视角/历史、候选/去重/匹配/排除、刷新/统计、角色拒绝、390px 和损坏数据显式重置。

回归说明：全部既有测试保留；仅原 Dashboard 主单总数和缺口统计断言按新业务规则更新，没有删除用例/关闭断言/放宽类型或超时。开发期新增历史数量测试期望修正为新增事件后 +1；最终完整测试均通过。所有原供应商/渠道/模型资源池/OP Mock/角色边界浏览器用例正常。最终补上每明细寻源状态展示，并完成类型/Lint 和完整 verify 复核。

截图：harness/build/stage-05a-list-1440.png、stage-05a-multi-detail-1440.png、stage-05a-candidate-picker-1440.png、stage-05a-procurement-detail-1440.png，真实 Chromium 通过实际创建/选择角色/候选流程截取，已视觉检查；仅虚构业务资料与公开模型示例，pageerror=0。另检查 1280px 详情无文档横向溢出，390px 操作由浏览器测试覆盖。

交接/风险：docs 六份本期规则、ROADMAP、build/stage-05a.md、context/stage-05a.md 已更新；README 额外更新当前启动入口、角色操作与重置顺序，避免旧只读说明造成误解。无真实 API、凭据、客户数据、数据库、报价写入、合同流程、自动采购或外发通知；忽略规则继续排除依赖/环境变量/密钥/运行产物。共享块仍约 1,047 kB（gzip 333 kB），保留阈值提示，无新增大型依赖。Mock 不提供生产鉴权/多标签页强事务/防篡改；生产共享文本审查/附件/导出、负责人/组织授权、编号分配事务、关联迁移、关闭重开与真实地区规格仍 TBD。只提交并普通推送本分支，不合并 main、不强制推送，完成后停止等待验收。

## Stage 05B — 2026-11-13（Asia/Shanghai）

基线：383aabee1ff5d6aad678d01061f012f24db20207，开始时工作区干净，从已验收提交创建 stage-05b-quotation-management；远程目标分支不存在。先阅读 AGENTS、README、docs、05A交接与相关领域/授权/Adapter/Repository/页面及测试，实施计划、共享影响和验证计划先于修改。仅本期询价/采购报价/版本，不进入 Stage06。

流程与页面：正式启用 /quotes 台账、询价跟进、条件价格对照，/quotes/:quoteId 展示来源/证据、口径、独立核验、运营模拟确认、版本历史与审计。采购/运营创建询价，记录人工回复，关联报价保存与询价 quoted 状态原子提交；日常报价可无需求关联。收到回复不等于来源核验或正式合同。原始供应商报价提交引用与实际录入人分离；后续真实调价保持真实来源，更正用 correction/previousQuoteId/原因追加，不覆盖原值。优惠必须起止、证据，独立保留，不计算唯一结算价。

结构与精度：ManagedQuote 交叉扩展 ChannelQuote，原ID、DiscountBps及历史确认值保留；历史缺少币种/规格/计量/外部提交人/录入人则保持未知。PriceSpec 显式币种、基准、适用规格，rates支持输入/输出Token、图像、视频秒、请求或其他维度，各自数量/单位/可空金额；不假定所有模型按Token。金额为最多12位整数6位小数文本，bigint微单位仅精确比较，拒绝负数/指数/NaN/Infinity。缺口径或不同模型/币种/基准/规格/维度/单位/状态/有效期列不可比原因；不计算汇率、节约率或最优渠道。采购目标缺基准时仅并列，保持原目标和人工 suitable 不变。

统一存储：独立 QuoteRepository maas-quote-demo-v1，schemaVersion/revision；报价、询价、独立核验/确认决策、审计与幂等请求单键保存。报价/决策/历史前缀只追加，保存前复用完整领域校验与 appendQuote，检查渠道/需求/明细/询价引用及模型一致、版本和revision。相同操作人请求重试返回原结果，不同内容冲突；存储失败无部分提交。旧 Supplier/Channel/Sourcing Repository 格式不变。渠道详情、寻源关联面板、原 getQuoteHistory 与 Dashboard 共用当前报价数据，不继续返回静态旧报价。动态渠道/需求被报价或询价引用时拒绝局部重置，要求先单独确认报价重置，再按原寻源→渠道→供应商保护顺序操作。不兼容数据不自动覆盖。

权限：quote:create/verify/correct/history、inquiry:read/create/update 仅运营/采购，quote:confirm 独立且仅运营；每次写入检查有效会话、域、渠道和供应商范围。确认必须已核验、未到期参考/待合同状态、明确生效时间/mock:依据/原因，生成独立事件投影为兼容正式价，不改原始记录。测试、运维、供应商、前台均无上游价格读取。需求选择仅共享标题/编号/模型/目标，无客户或运营原文；报价/审计白名单投影，不返回原始业务快照。页面始终标明Mock/确认不等于真实合同签署，不以按钮隐藏替代API检查。

统计和布局：报价台账支持全部本期授权筛选、日期/排序/分页，状态与有效期分开；Dashboard待合同、未来7天到期有效优惠、最近7天有新报价不同渠道读取同源。复用 Ant Design 与共享 Header/指标/状态/反馈/查询Hook；QuoteTable用于台账、渠道、寻源和版本历史，报价路由懒加载，无新依赖。

验证：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify 完整退出码0。严格类型、Lint、格式、Vitest13文件/360测试（保留原295+新增65）、Playwright33测试（保留原27+新增6）、生产构建全部通过。覆盖用户32项及显式投影/未知字段、来源原始提交引用、询价状态/版本、精确金额、并发/幂等/失败原子性、过期不改历史、恢复与重置。浏览器通过真实页面录入，不修改fixture伪造成功，覆盖询价→关联回复报价→核验→运营确认、优惠、更正原值保留、渠道/寻源读、角色切换、刷新、390px与不兼容数据恢复。

回归说明：既有用例保留；旧报价占位导航用例转到仍未开放的模型测试页，Dashboard既有指标断言加入本期真实统计。开发期新E2E的下拉选项定位改按各combobox的aria-controls限定，状态断言限定表格避免隐藏表单重复节点，重置后参考报价数量按原fixture校正。完整回归通过，未删除用例/关闭断言/放宽类型、超时或重试。

截图：harness/build/stage-05b-quotes-1440.png、stage-05b-editor-1440.png、stage-05b-confirm-1440.png、stage-05b-history-1440.png、stage-05b-sourcing-1440.png，真实Chromium操作截图并逐张视觉检查；pageerror=0，1280px页面无整体溢出，390px表单测试通过。文本模型采用明确标记模拟的CNY/输入Token示例，不宣称官方价格，所有业务身份和依据虚构。

交接：指定六份docs、ROADMAP、build/stage-05b.md、context/stage-05b.md已更新；README额外更新入口/操作/重置，完整变更清单见build报告。忽略规则排除node_modules、环境变量/密钥、构建与测试运行产物。无真实接口/合同/密钥/客户资料，无新依赖。共享块仍约1,047kB（gzip333kB）保留构建提示，不提高阈值。Mock不提供生产鉴权、防篡改或跨窗口强事务；生产审批/金融精度与舍入/目标基准/基准目录/附件导出/促销结算优先级继续TBD。只提交并普通推送本分支，不合并main、不强制推送，完成后停止等待验收，不进入Stage06。

## Stage 05B Patch — 2026-11-13（Asia/Shanghai）

基线：3f796260c64cea102d322fa3de4beddd81a34f2c，工作区干净，当前及远程分支均为stage-05b-quotation-management指定基线。阅读AGENTS、05B交接、报价Repository/API与现有测试，先给出局部修复和验证计划。

修复：write原有逐项比较能拒绝quotes/decisions/history截短，但遗漏requests。现在统一检查四个集合的next长度不减与原记录逐索引JSON内容不变，只允许追加新后缀，错误明确禁止覆盖/删除。保留既有validate引用检查、revision冲突、API幂等及写入失败处理；inquiries仍可按原版本/流转/审计跟进，不施加完全不可变约束。不改其他Repository格式或报价业务/UI。

测试：新增18个用例，分别覆盖四集合截尾/清空/修改/重排，嵌套报价内容删除及审计差异篡改；每次拒绝均断言持久化原始文本不变；合法新增、更正、核验、确认保持旧前缀并刷新恢复。修复前复现4个requests保护失败；修复后报价文件83个测试通过。完整验证：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify 完整退出码0；严格类型、ESLint、Prettier、Vitest 13文件/378测试（原360+新增18）、Playwright 33测试（全部保留）、生产构建通过。未关闭测试、放宽类型、超时或重试。保留既有约1,047kB共享块构建提示，未调整阈值。

修改范围仅quote-repository.ts、quotations.test.ts、本日志和build/stage-05b-patch.md。无新依赖、生产接口或敏感数据；Mock防篡改和并发的生产限制不变。按用户要求只在原分支新增修复提交并普通推送，不合并main、不强制推送，不进入Stage06，完成后停止等待验收。

## Stage 06A — 2026-11-13（Asia/Shanghai）

基线：e67d257abd7f46ce46241b82a4a5e7d888a46c99，开始时工作区干净，从指定SHA创建stage-06a-procurement-analytics；阅读AGENTS、全部规范、05B交接/补丁、相关Repository/权限/Adapter/报价与Dashboard。编码前给出指标/授权/可比性/测试方案。仅只读采购价格分析，不开发06B。

实现：/analytics/procurement三层工作台与旧/analysis/purchase重定向，授权覆盖、报价状态/当前有效性、同模型渠道比较、渠道时间趋势、优惠提醒、目标数字差、询价跟进、质量提示和分页下钻。沿用Shell/导航/PageHeader/StatCard/反馈/查询Hook，懒加载且无新依赖。Dashboard指标保留定义，新增到期优惠待办和分析入口。

数据/授权：ProcurementAnalyticsApi先检查活动会话/quote:read/域，复用QuotationApi授权分页报价/目录读取当前四Repository，再按最小白名单投影。无第二份价格缓存/新持久化/主档格式或报价写流程变更；QuoteRepository四集合追加保护不改。采购供应商范围沿用最新维护授权，模型域按厂商；未授权角色/猜测ID筛选不能读商业统计/选项/图表。无客户/售价/运营原文/证据/联系人/备注/快照或导出原始字段。供应商改名/渠道停用及报价变化重新查询同步。

口径：有报价模型/渠道/供应商分别稳定ID去重；历史正式/优惠覆盖与当前有效记录分开。参考/待确认排除到期/异常；正式需确认及有效时间；优惠提醒(now,now+7×24小时]显示北京时间，Dashboard同定义。趋势按完整币种/基准/规格/维度数量单位及原录入状态分组，以实际创建或供应商报价时间绘点，未知/异常说明原因；确认不新增点，更正菱形单列不接供应商调价线。图例标单位避免不同单位同名。横向compareQuotes逻辑不改，仅类型兼容抽出五字段ComparableQuote；跨状态/有效期等不可比。目标仅整数数字差且标未确认同基准，不计算达成率/节约或自动设置匹配。询价仅sent/quoted当前发起、草稿/关闭单列，逾期按已知截止；无真实发送/回复时间不计算时长。

验证：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify完整退出码0；严格类型、ESLint、Prettier、Vitest14文件/420测试（原378+新增42）、Playwright37测试（原33+新增4）、生产构建全部通过。原测试文件/断言未修改，未放宽类型、超时或重试。最终版本复核通过；既有共享块约1,047kB（gzip333kB）警告保留，不提高阈值。开发中新增用例的fixture计数按实际原始ID校正，主档操作用原API；E2E定位修正为多条不可比结果的首行和带必填符号的维度标签。常量移到feature labels文件遵守Fast Refresh Lint，未关闭规则/测试或放宽类型/超时/重试。原378单元/33浏览器断言未改；新增42单元/4浏览器。

交付：docs本期相关规范、ROADMAP、README、build/stage-06a.md、context/stage-06a.md及本日志更新，完整文件清单见build报告。四组真实Chromium截图仅虚构报价，已逐张视觉检查，pageerror=0；1280/390px无文档横向溢出。比较包含第二家虚构供应商报价，趋势包含UI实际录入的同口径文本报价，无fixture伪造。Mock非生产安全与跨窗口事务；真实基准/回复事件/财务/合同/文本附件保密继续TBD。共享大包提示保留阈值，无生产连接、密钥、客户资料、外部通知或部署。只提交并普通推送本分支，不合并main、不强推、不开始06B，完成后停止等待验收。
