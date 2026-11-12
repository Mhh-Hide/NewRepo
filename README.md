# MaaS 模型资源全生命周期管理平台

MaaS Resource Lifecycle Management。第 02 阶段应用外壳与只读工作台；所有展示数据均为模拟数据，不连接生产系统。

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

先阅读 AGENTS.md 与 docs。统一 API 出口为 src/services/api.ts；页面禁止直接依赖未来 OP、Monitor 或测试平台接口。领域查询与工作台聚合均通过已授权 Mock Adapter；没有业务写接口。真实权限未来由后端执行。

原有 MyNewFile 原样保留。当前只有工作台和其余模块占位，不涉及生产凭据或部署。未确认事项见 docs 与 harness/ROADMAP.md；第 02 阶段完成后停止，等待验收。

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
