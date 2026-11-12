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
