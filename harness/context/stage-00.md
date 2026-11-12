# 第 00 阶段交接

从 AGENTS.md、README.md、docs/PRODUCT_SCOPE.md 与 harness/build-log.md 开始阅读。
当前仅欢迎页；其余业务模块未实现。统一入口 src/services/api.ts 装配 Mock Adapter。实体草案仅在 docs/DATA_MODEL.md 描述，未创建未经确认的业务契约。

在当前云环境运行完整验证：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify
```

不得自动进入第 01 阶段；等待用户下一批任务与详细 PRD。
