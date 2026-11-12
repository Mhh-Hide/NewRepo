# 工程决策记录

- D00-01：React + TypeScript + Vite，Ant Design，React Router；仅欢迎页。
- D00-02：feature-based 模块化，app 负责装配，domain 定义领域类型，services 提供统一 Adapter，mocks 提供模拟实现，auth 保留授权边界。
- D00-03：TypeScript strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes；禁止为通过检查放宽约束。
- D00-04：ESLint + Prettier，Vitest/jsdom 组件与 Adapter 测试，Playwright Chromium 浏览器冒烟测试。
- D00-05：npm lockfile 固定依赖树，使用 npm ci 重装；Node >=22.12。当前验证环境 Node 24。
- D00-06：不实现未确认业务实体、流程或权限系统；原文件 MyNewFile 原样保留。
- D00-07：普通 npm 缓存目录在当前云环境不可写，项目 .npmrc 使用 /tmp/maas-npm-cache；不影响依赖校验或锁文件。

待确认：详细 PRD、各模块分期、渠道类型、角色授权细节、接口契约及数据字典。第 01 阶段仅在用户明确授权后开始。
