# MaaS 模型资源全生命周期管理平台

MaaS Resource Lifecycle Management。第 00 阶段独立前端 Demo，所有展示数据均为模拟数据，不连接生产系统，仅欢迎页。

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
  app/          # 入口、路由、欢迎页及依赖装配
  components/   # 共享 UI
  domain/       # 明确的领域类型
  features/     # 后续模块独立页面、组件、逻辑
  services/     # API Adapter 契约与统一出口
  auth/         # 权限边界（当前无权限引擎）
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

先阅读 AGENTS.md 与 docs。统一 API 出口为 src/services/api.ts；页面禁止直接依赖未来 OP、Monitor 或测试平台接口。当前 Adapter 元信息方法用于验证契约，不代表业务 API 已完成。真实权限未来由后端执行。

原有 MyNewFile 原样保留。本阶段不开发任何业务页面，不涉及生产凭据、部署或推送。未确认事项见 docs 与 harness/ROADMAP.md；完成第 00 阶段后停止。

## 云环境已有 Chromium 时

若下载域名被限制且系统已有可信 Chromium，可使用显式覆盖路径（不要关闭 TLS 或校验）：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify
```

此方式不需要下载 Playwright 浏览器；浏览器版本由环境提供，与 Playwright 固定版本的兼容性须以实际测试为准。默认不设置此变量时仍使用 Playwright 配套浏览器。
