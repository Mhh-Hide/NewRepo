# MaaS 模型资源全生命周期管理平台

MaaS Resource Lifecycle Management。Stage 06A 采购价格分析，保留询价、报价版本、寻源、主档与工作台；所有展示数据均为模拟数据，不连接生产系统。

## 安装与启动

需要 Node.js >=22.12（当前使用 Node 24）及 npm。仓库目录为 `/workspace/NewRepo`，其他环境进入实际 checkout 路径。

```sh
cd /workspace/NewRepo
npm ci
npm run browser:install
npm run dev
```

浏览器访问开发服务器终端提示的地址（默认端口 5173）。Linux 缺少浏览器系统库时，由有权限的环境管理员运行 `npx playwright install-deps chromium`。首次安装浏览器需要下载权限。浏览器存放于 node_modules 内，浏览器脚本适用于本项目 Linux 云环境。项目 npm 缓存位于 `/tmp/maas-npm-cache`，可重建。

## 验证

```sh
npm run verify
```

依次执行严格类型检查、ESLint、格式检查、Vitest、Playwright Chromium、生产构建。单独执行：

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:e2e
npm run build
npm run preview
```

Playwright 自动启动并关闭 4173 端口的 Vite 服务；运行前确保端口空闲。CI 应安装依赖和 Chromium，设置 CI=true。`npm run format` 修复格式；`npm run test:watch` 用于交互测试。构建输出 dist/，不会自动部署。

## 目录与边界

```text
src/
  app/          # 应用外壳、路由、欢迎页及依赖装配
  components/   # 共享 UI
  domain/       # 明确的领域类型
  features/     # 后续模块独立页面、组件、逻辑
  services/     # API Adapter 契约与统一出口
  auth/         # Demo 角色、字段及记录权限边界
  mocks/        # 模拟 Adapter
  styles/       # 全局样式
tests/
  unit/         # Vitest
  e2e/          # Playwright
docs/           # 产品边界与已知规则
harness/
  ROADMAP.md
  build/        # 阶段交付记录
  context/      # 脱敏交接上下文
  build-log.md
AGENTS.md
```

先阅读 AGENTS.md 与 docs。统一 API 出口为 src/services/api.ts；页面禁止直接依赖未来 OP、Monitor 或测试平台接口。领域查询与工作台聚合均通过已授权 Mock Adapter；供应商主档提供本地 Mock 写接口，其他业务仍只读。真实权限未来由后端执行。

原有 MyNewFile 原样保留。当前开放工作台、供应商主档、模型资源池与渠道只读详情，其他模块仍为占位，不涉及生产凭据或部署。未确认事项见 docs 与 harness/ROADMAP.md；Stage 04A 完成后停止，等待验收，不开始 Stage 04B。

## 云环境已有 Chromium 时

若下载域名被限制且系统已有可信 Chromium，可使用显式覆盖路径（不要关闭 TLS 或校验）：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify
```

此方式不需要下载 Playwright 浏览器；浏览器版本由环境提供，与 Playwright 固定版本的兼容性须以实际测试为准。默认不设置此变量时仍使用 Playwright 配套浏览器。

## 第 01 阶段领域验收

只读 ApiAdapter 见 src/services/api-adapter.ts；createMockAdapter(userId) 通过模拟用户选择绑定权限。默认 api 匿名，不返回业务数据。演示 ID 包含 u-ops、u-proc、u-test、u-support、u-supplier、u-sales、u-account、u-solution；详见 Mock 夹具与权限文档。页面不能直接导入 mocks；第 01 阶段没有页面或真实登录，第 02 阶段界面见下。

运行原有 verify 命令同时验证领域与权限测试；模型/权限矩阵见 docs/DATA_MODEL.md 与 docs/PERMISSIONS.md，交接见 harness/context/stage-01.md。第 01 阶段已验收，禁止越过当前任务自动推进后续阶段。

## 第 02 阶段 Demo

运行 npm run dev 后，在环境浏览器打开终端所示服务地址的 /dashboard；根路径也会进入工作台。/welcome 保留第 00 阶段欢迎页。侧栏其余模块均为只读开发计划占位，不能创建、编辑或改变业务状态。

顶部“演示身份”可选八类角色，以及仅国内、仅海外、无业务域授权的运营样例；业务域选项由当前身份授权生成。切换会重建 Adapter 并丢弃旧查询结果。仅演示用户 ID 与域选项保存在 sessionStorage，不存业务数据；这不是真实登录。

页面包括授权统计、独立状态概览、角色范围待办、每类最近活动及资源速览。指标口径见 docs/DECISIONS.md D02，路由见 docs/PRODUCT_SCOPE.md。测试覆盖加载、空态、错误重试、角色切换竞态、权限、业务域、导航、刷新及窄屏。

分支 stage-02-app-shell 基于已验收 6b0324d；不合并 main，不自动开始 Stage 03。

## Stage 03 供应商管理

进入 /suppliers。产品运营可新增、编辑、调整负责人及确认启停；点击名称进入详情，查看授权资源摘要和变更历史。采购可编辑明确分配的供应商，但不能新增、转交或启停。测试/运维只读摘要；供应商用户仅自身资料；前台拒绝访问。

业务演示数据保存到独立 localStorage 键 maas-supplier-demo-v1（schemaVersion=1），刷新可恢复；身份选择仍只存 sessionStorage。页面与工作台共用同一供应商 Repository。禁止输入真实联系人、客户、密码、Key 或商业敏感信息。

资料 version 冲突时需重新加载，不静默覆盖。数据损坏/版本不兼容会显示错误；双域运营在全部业务域视角可通过“重置演示数据”二次确认恢复初始主档。重置不会改报价、渠道、测试或事件。

当前分支 stage-03-supplier-management 基于已验收 d996d0e。localStorage 只用于 Demo，不代表生产安全、多用户一致性或真正审计。截图和交接见 harness/build/stage-03.md 与 harness/context/stage-03.md。停止在 Stage 03，不开始 Stage 04。

## Stage 04A 模型资源池

运行开发服务后进入 /models，可按模型名称/代码、授权厂商、类别、地区、启用状态、可见渠道及获准的供应商覆盖筛选。打开模型详情查看当前供应商主档、渠道能力和四个独立状态，再进入 /channels/:channelId 只读详情；/channels 管理列表继续占位。

供应商改名/缩写/启停沿用 Stage 03 存储，刷新资源视图可见最新主档；无渠道供应商不增加覆盖数。前台只获得匿名渠道，不返回供应商身份/覆盖家数、技术引用或商业价格。资源页不写 localStorage，也不修改模型、渠道或 OP ID。

分支 stage-04a-model-resource-pool，基于已验收 b1a6bb1。完整验证仍使用既有 verify 命令；截图和交接见 harness/build/stage-04a.md、harness/context/stage-04a.md。停止于 Stage 04A，不开始 Stage 04B。

## Stage 04B 渠道管理（当前）

运行 `npm run dev` 后进入 `/channels`。产品运营可新增渠道，详情中编辑能力/非敏感引用、独立启停、查看历史；未绑定渠道可输入 MOCK- 开头 ID，预览后确认模拟绑定。其他角色只读，前台使用匿名渠道。所有数据均为 Mock，不连接生产 OP。

渠道和待测试任务/历史保存在 `maas-channel-demo-v1`，供应商仍用原 Stage 03 存储；新建成功在模型资源池、供应商详情和工作台重新查询时同步。重置渠道会恢复初始渠道/任务并清除渠道变更历史，保留供应商。若供应商重置会破坏引用，先被阻止，需先独立确认渠道重置。存储不兼容时不自动清空，显示错误，可由双域运营明确重置渠道恢复。

完整检查：`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`（有 Playwright 自带 Chromium 时可直接 `npm run verify`）。交付见 `harness/build/stage-04b.md`、`harness/context/stage-04b.md`。旧阶段章节为历史记录，以本节为当前入口和行为。只提交/普通推送 stage-04b-channel-management，不合并 main，不开始 Stage 05。

## Stage 05A 采购寻源（当前入口）

运行 `npm run dev` 后进入 `/sourcing`。产品运营点击“新增采购需求”，分别填写受限信息/客户关联和独立共享标题/摘要，添加至少一条模型明细与整数基点采购目标（8000=八折）。保存后进入详情，可维护需求要求、添加候选、人工评估、查看覆盖和跟进。

切换采购身份只能看到共享内容，可选择同模型的当前授权渠道、修改人工匹配状态和寻源进度；其他角色不开放内部商业详情，原授权需求摘要 API 保留。零候选明确为“尚未开展”，不自动当作已调查缺口；初步覆盖按不同供应商计数，不表示采购/测试完成。

新增独立 `maas-sourcing-demo-v1`，不改变已有供应商/渠道存储。渠道被寻源候选（含排除历史）引用时，渠道重置会被阻止；必须先独立确认重置寻源，再确认渠道，必要时再按原依赖规则重置供应商。寻源重置保留其他模块数据，不自动清空浏览器。

完整检查仍为 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`（已安装 Playwright Chromium 时直接 `npm run verify`）。交接、测试与截图见 `harness/build/stage-05a.md`、`harness/context/stage-05a.md`。仅普通推送 stage-05a-procurement-sourcing，不合并 main，不进入 Stage 05B。旧章节为各历史阶段记录，以此节为当前行为。

## Stage 05B 采购报价（当前入口）

运行 `npm run dev` 后进入 `/quotes`，台账可筛选/分页；询价页签发起/跟进模拟询价并录入回复，或直接录入无需求关联的日常报价。折扣为整数基点，绝对单价是最多6位小数的文本，各币种/维度/单位/基准必须明确，未知不填0。

详情 `/quotes/:quoteId` 可独立核验，运营才能模拟正式确认；Demo 不代表真实合同签署。真实调价录入后续报价，更正用新记录并链接前序，不覆盖旧价。临时优惠独立保留，到期有明确标签，不自动决定唯一结算价。对照页签仅同口径才比较。渠道详情显示授权历史，寻源候选可进入询价并查看关联报价；目标基准缺失时明确不可比，不自动改变匹配。

新增 `maas-quote-demo-v1`，不改原三个存储格式。报价/询价引用的新需求或渠道会阻止对应局部重置；先独立确认报价重置，再按既有顺序重置寻源/渠道/供应商。报价重置只清本模块的新记录，保留其他模块。所有数据模拟，无真实合同、价格材料或凭据。

完整检查：`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`（有自带 Chromium 时直接 verify）。交付见 `harness/build/stage-05b.md`、`harness/context/stage-05b.md`。仅普通推送 stage-05b-quotation-management，不合并 main，不进入 Stage 06。旧阶段章节为历史，以此节为当前行为。

## Stage 06A 采购价格分析（当前入口）

启动后打开/analytics/procurement，运营与采购按授权域/供应商查看分析。选模型及比较基准查看渠道价格，选择渠道/时间轴查看历史趋势；未知口径、异常日期或不足两条同口径记录会解释原因。创建/核验/确认/更正仍用/quotes，返回刷新分析读取最新数据，无新存储或价格副本。

覆盖、报价分类、七天到期提醒、询价台账效率与目标数字差分别展示。无真实响应时间不算时长，目标无基准不算商业达成率，不算实际节约或唯一结算价。旧/analysis/purchase重定向到新入口。测试/运维/供应商/前台无分析权限。

验证命令沿用README上述系统Chromium设置。完整口径、截图与交接见harness/build/stage-06a.md、harness/context/stage-06a.md。本期仅普通推送stage-06a-procurement-analytics，不修改main，不进入Stage06B。旧阶段章节保留历史记录，以本节为当前分析入口。

## Stage 06B 批量采购报价（当前入口）

启动后进入 `/procurement/bulk-quotes`。运营/采购选择一家授权供应商创建批次，添加或重复添加其渠道，编辑各行，选择行后填写共同字段。共同来源和说明仅在行未填时使用。先保存草稿，再预览逐行错误/提示，二次确认后整批追加。草稿可恢复；提交结果只读，可进入原单条核验/确认及采购分析。

报价存储键仍为 `maas-quote-demo-v1`，内部升级 schemaVersion=2。v1 读取不改盘，下一次完整校验成功的写入才无损升级。不要手工改 schema、清缓存或用旧版本页面重置；未知/损坏数据不会自动回退。报价显式重置会同时清除批次草稿、提交结果、映射与历史，保留其他模块；引用保护可能要求先独立重置报价，再按原顺序重置其他模块。

完整检查：`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify`。交付及 Mock 一致性/旧客户端限制见 `harness/build/stage-06b.md`、`harness/context/stage-06b.md`。分支 `stage-06b-bulk-quotation-adjustment`，基线 `863f8444cab5147b67f501ba53cc425f2de009d7`。完成后停止，不进入 Stage 07；旧章节为历史记录。
