# 第 01 阶段交付清单

范围：核心领域、独立状态字典、权限策略与字段投影、只读 Mock API、关联数据、规则验证与测试。欢迎页及第 00 阶段测试保持不变，没有安装新依赖，没有业务页面、写 API、真实服务或密码。

分支：stage-01-domain-permissions，基于 stage-00-engineering-harness 的 2d1a5b6c06f2399a0ffac0f708602e3dfe8744c1；开始时 main 尚未包含第 00 阶段。

新增：domain/entities、statuses、store、rules、validation；auth/types、policy、view-models、projections；mocks/data；领域与权限单元测试。扩展 services/api-adapter 与 mocks/mock-adapter。ESLint 禁止 UI 直接导入 mocks。文档与本批交接同步更新。

验收命令与最终结果见 build-log.md；所有 19 项要求映射到 tests/unit/domain.test.ts 与 permissions.test.ts，保留 stage-00 的 api/welcome 测试及原浏览器测试。

TBD 与架构限制见 docs/PERMISSIONS.md、DATA_MODEL.md、WORKFLOWS.md。停止于第 01 阶段，等待验收，不进入第 02 阶段。
