# Stage 04A 交付

分支 stage-04a-model-resource-pool，基线 b1a6bb121e8e108cf3855578d118d21ceb161b6e。

只读页面：/models、/models/:modelId、/channels/:channelId。/channels 管理列表仍占位。供应商详情增加只读关联模型导航，其余主档交互和存储不变。

数据：统一 ApiAdapter 扩展 ResourceApi，批量获取授权目录/渠道/当前主档后分组统计，不引入重复实体或供应商目录。前台不返回身份和覆盖数，未知能力不补零，四类状态独立。详细权限与口径见 docs/DATA_MODEL.md、PERMISSIONS.md、DECISIONS D04A。

截图：

- stage-04a-model-pool-1440.png：桌面模型资源池。
- stage-04a-model-detail-channels-1440.png：模型详情及渠道清单。
- stage-04a-channel-detail-1440.png：渠道只读详情。

完整验证及文件清单见 build-log.md 与本次 Commit。没有模型/渠道编辑、OP 写入、价格变更、测试执行或生产接口。不合并 main，不强制推送，停止于 Stage 04A。

## 文件清单

新增：

```text
harness/build/stage-04a-channel-detail-1440.png
harness/build/stage-04a-model-detail-channels-1440.png
harness/build/stage-04a-model-pool-1440.png
harness/build/stage-04a.md
harness/context/stage-04a.md
src/app/ResourceRoutes.tsx
src/features/channels/ChannelDetailPage.tsx
src/features/channels/ChannelResourceTable.tsx
src/features/channels/ResourceStateSummary.tsx
src/features/channels/format-capacity.ts
src/features/models/ModelDetailPage.tsx
src/features/models/ModelPoolPage.tsx
src/features/models/resource-labels.ts
src/features/models/resources.css
src/features/models/use-resource-query.ts
src/mocks/resource-api.ts
src/services/resource-types.ts
tests/e2e/model-resources.spec.ts
tests/unit/model-resource-ui.test.tsx
tests/unit/model-resources.test.ts
```

修改：

```text
README.md
docs/DATA_MODEL.md
docs/DECISIONS.md
docs/PERMISSIONS.md
docs/PRODUCT_SCOPE.md
docs/UI_GUIDELINES.md
harness/ROADMAP.md
harness/build-log.md
src/app/AppShell.tsx
src/app/navigation.tsx
src/app/router.tsx
src/features/suppliers/SupplierDetailPage.tsx
src/mocks/mock-adapter.ts
src/services/api-adapter.ts
tests/e2e/app-shell.spec.ts
tests/e2e/suppliers.spec.ts
```
