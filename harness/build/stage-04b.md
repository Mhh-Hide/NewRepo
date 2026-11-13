# Stage 04B：渠道主档与资源数据一致性

基线 ddf02ffaed75994303c00531db50085470bc65ac；交付分支 stage-04b-channel-management。

已开放 /channels 渠道列表与按权限升级的 /channels/:channelId 详情。产品运营从“新增渠道”选择当前启用供应商和授权模型；详情可编辑白名单能力/非敏感引用、独立启停、查看变更前后值，未绑定渠道可预览并确认模拟 OP ID。其他角色只读，前台匿名，无采购/测试/上线/真实生产操作。

统一 ChannelRepository 单键保存渠道、测试任务、历史；供应商仍使用原 SupplierRepository，不迁移覆盖已有数据。新渠道原子建立两条待测试任务。所有已有模块重新查询同一数据源，供应商/模型按稳定关联汇总，覆盖去重。关联会悬空的供应商重置被阻止，需先单独确认渠道重置。详见 docs/DECISIONS D04B 与 context/stage-04b.md。

验证：最终 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify` 退出码 0；严格类型、Lint、格式、Vitest 11 文件 / 232 测试（保留原 161，新增 71）、Playwright 21 测试（保留原 16，新增 5）、生产构建全部通过。含 1440/1280/390px 操作回归，截图流程 pageerror=0。未跳过测试、放宽类型或超时。既有 Node 侧资源期望查询新增只读渠道存储注入，保留原断言。共享块约 1,047 kB / gzip 333 kB 的体积提示保留，未来仍需评估拆包。

截图：

- [渠道目录截图](stage-04b-channels-1440.png)：1440px 渠道目录。
- [新增渠道截图](stage-04b-editor-1440.png)：新增渠道抽屉。
- [渠道详情截图](stage-04b-detail-1440.png)：渠道详情及运营维护。
- [OP 模拟绑定截图](stage-04b-op-preview-1440.png)：模拟 OP 绑定前后预览。

主要变更：app 路由/导航/阶段标识；auth 新五项动作；services ChannelApi/types；mocks ChannelRepository/ChannelApi 与统一读边界及供应商重置依赖保护；features/channels 的目录、编辑和维护面板；资源样式；新增单元/E2E 测试；指定 docs 与 Harness。README 额外更新当前入口、存储重置说明及停止阶段，避免使用旧只读说明。

已知限制：单浏览器 Mock 的持久化/并发不等同真实事务/鉴权；模型目录仍只读；完整执行/报价/整改流程尚未开发；OP 契约及受控迁移/解绑、停用合作例外等待确认。Stage 05 未开始。

本批文件清单（共 33 个）：

```text
README.md
docs/DATA_MODEL.md
docs/DECISIONS.md
docs/PERMISSIONS.md
docs/UI_GUIDELINES.md
docs/WORKFLOWS.md
harness/ROADMAP.md
harness/build-log.md
harness/build/stage-04b-channels-1440.png
harness/build/stage-04b-detail-1440.png
harness/build/stage-04b-editor-1440.png
harness/build/stage-04b-op-preview-1440.png
harness/build/stage-04b.md
harness/context/stage-04b.md
src/app/AppShell.tsx
src/app/ResourceRoutes.tsx
src/app/navigation.tsx
src/app/router.tsx
src/auth/policy.ts
src/auth/types.ts
src/features/channels/ChannelDetailPage.tsx
src/features/channels/ChannelEditor.tsx
src/features/channels/ChannelListPage.tsx
src/features/channels/ChannelManagement.tsx
src/features/models/resources.css
src/mocks/channel-api.ts
src/mocks/channel-repository.ts
src/mocks/mock-adapter.ts
src/services/api-adapter.ts
src/services/channel-types.ts
tests/e2e/channels.spec.ts
tests/e2e/model-resources.spec.ts
tests/unit/channels.test.ts
```
