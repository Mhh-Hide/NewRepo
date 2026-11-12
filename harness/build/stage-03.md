# Stage 03 交付

基线 d996d0e5eb8468448187347f5410536d2ddb5467；独立分支 stage-03-supplier-management。

开放供应商列表 /suppliers 和详情 /suppliers/:supplierId，支持新增、资料编辑、负责人分配、启停、授权资源摘要和追加式主档历史。保留其他业务占位，不开发报价/接入/测试结果/供应商门户。

统一 Adapter + SupplierRepository：领域 Supplier 扩展、独立主档管理范围、采购维护授权、字段投影、版本冲突、trim/大小写唯一性、localStorage 版本化保存和确认重置。新主档无需渠道；工作台与管理页读取同一主档。

截图：

- stage-03-suppliers-1440.png：1440px 供应商管理桌面。
- stage-03-supplier-detail-1440.png：1440px 供应商详情。

实际验证结果见 build-log.md。生产局限与权限解释见 docs/PERMISSIONS.md 和 DECISIONS D03。等待验收，不开始 Stage 04，不合并 main。

## 文件清单

新增：

```text
harness/build/stage-03-supplier-detail-1440.png
harness/build/stage-03-suppliers-1440.png
harness/build/stage-03.md
harness/context/stage-03.md
src/auth/supplier-policy.ts
src/domain/suppliers.ts
src/features/suppliers/SupplierDetailPage.tsx
src/features/suppliers/SupplierEditor.tsx
src/features/suppliers/SupplierListPage.tsx
src/features/suppliers/SupplierRoute.tsx
src/features/suppliers/suppliers.css
src/features/suppliers/use-supplier-resource.ts
src/mocks/supplier-api.ts
src/mocks/supplier-repository.ts
src/services/supplier-types.ts
tests/e2e/suppliers.spec.ts
tests/unit/suppliers.test.ts
```

修改：

```text
README.md
docs/DATA_MODEL.md
docs/DECISIONS.md
docs/PERMISSIONS.md
docs/PRODUCT_SCOPE.md
docs/UI_GUIDELINES.md
docs/WORKFLOWS.md
harness/ROADMAP.md
harness/build-log.md
src/app/AppShell.tsx
src/app/navigation.tsx
src/app/router.tsx
src/auth/policy.ts
src/auth/projections.ts
src/auth/types.ts
src/auth/view-models.ts
src/components/FeedbackStates.tsx
src/components/layout/SidebarNavigation.tsx
src/domain/entities.ts
src/mocks/data.ts
src/mocks/mock-adapter.ts
src/services/api-adapter.ts
src/services/demo-session.ts
tests/e2e/app-shell.spec.ts
```
