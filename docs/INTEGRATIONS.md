# 集成设计

当前 `src/services/api.ts` 统一选择 Mock Adapter。`ApiAdapter` 暴露领域契约，`src/mocks` 实现模拟数据。第 01 阶段已扩展只读领域查询，包含厂商、模型、供应商、渠道、报价历史、需求及候选资源、测试、整改、事件和审计。Mock Adapter 在返回前实施授权与字段投影。

未来 OP 生产运营后台、MaaS Monitor、模型自动化测试平台应分别用 Adapter 转换原始 DTO、错误与状态到领域模型；页面与业务逻辑不得依赖上游原始接口。
新增集成须先确认契约、认证、权限、超时、错误处理和测试方式。本期无真实 URL、请求、生产写入或实时监控。
严禁真实供应商 Key、客户数据、密码或密钥；不得在前端存放敏感凭据。Mock 数据明确标记 source: mock。审计的持久性及不可篡改性需要未来后端支持。

## Stage 07A TestingApi（当前为 Mock）

统一 ApiAdapter 扩展 TestingApi：queryTestSummaries、queryTestTasks、getTestTask、testingOptions；create/update/start/cancelTestTask、finishTestExecution、adopt/reviewTestExecution、verifyTestSource、record/revokeQualityExemption。写操作传 requestId 和对应版本；采纳额外传 executionVersion 与 conclusionVersion。证据只接受 mock: 引用。页面不依赖 fixture/localStorage。

未来真实测试平台须将外部执行映射到稳定内部 taskId/executionId/targetVersion，不能把回调自动当作运营采纳；后端负责授权、幂等、不可变历史和真实事务。此期未建立任何外部连接，未调用 Endpoint、OP、Monitor 或通知服务。
