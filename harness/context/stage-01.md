# 第 01 阶段交接

先读 AGENTS.md、docs/DATA_MODEL.md、PERMISSIONS.md、WORKFLOWS.md 与本批 build-log。

基线是第 00 阶段分支 2d1a5b6c06f2399a0ffac0f708602e3dfe8744c1，不是开始时尚未合并的 main。第 01 阶段只保存独立分支提交，不直接合并 main。

关键入口：

- domain/entities.ts、statuses.ts：字段与状态真值；modelDomain 从厂商推导业务域。
- auth/policy.ts：动作与字段白名单；projections.ts：显式字段投影。
- services/api-adapter.ts：只读查询契约。
- mocks/mock-adapter.ts：绑定演示用户，先检查角色/业务域/供应商或客户范围再投影，深拷贝返回。
- mocks/data.ts：完全模拟的关联夹具；validateStore 加载期校验。

默认 api 未绑定用户，除原项目元信息外不返回业务数据。createMockAdapter('u-ops') 等只用于 Demo 验收，不是生产认证。所有真实权限和审计持久性需后端支持。禁止页面导入 mocks。不要把敏感快照放到无权限角色能访问的报告、备注或附件中。

完整验证：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify
```

环境已有系统 Chromium；Playwright 配套浏览器下载限制见第 00 阶段记录。没有新增依赖。前端保持欢迎页，第 02 阶段未开始。详细流转、多角色合并、定价优先级、真正鉴权及写入流程全部等待后续确认。

## Stage 01 Patch 交接

本批基线 f5562540456c2472b39b1ede82ea3e9fb61bc2bb，继续在 stage-01-domain-permissions 修复，不进入第 02 阶段。

OP ID 校验：validateStore 检查非 null ID 唯一，bindOpChannelId 第三个参数必须是完整渠道集合；规范记录防止陈旧对象改绑，同值确认允许。未来后端唯一约束与 OP 一对一契约仍需确认。

事件 API 改为 SupplierIncidentView。description 仅产品运营；采购与运维读取受控摘要，分别按原权限取得采购折扣或客户身份，均不取得客户售价。summaryCode 固定映射而非文本清洗；不得把未分类原始对象直接返回。前台 ChannelView 有稳定 anonymousCode，displayName 不再全部相同。真实附件/自由文本的后端保密策略见 PERMISSIONS 待办。
