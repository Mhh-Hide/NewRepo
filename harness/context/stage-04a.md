# Stage 04A 交接

先读 AGENTS.md、DATA_MODEL/PERMISSIONS/UI_GUIDELINES/DECISIONS 的 Stage 04A 部分及 build-log。基线 b1a6bb1，分支 stage-04a-model-resource-pool。

入口：src/features/models 的列表、详情与取消旧查询的 hook；src/features/channels 的只读详情、渠道表和独立状态摘要；src/app/ResourceRoutes.tsx 懒加载三个页面，router/nav 保留统一结构。

ResourceApi 类型位于 services/resource-types.ts，由 mocks/resource-api.ts 组合授权 readers 实现。mock-adapter 先构造原 base 接口，再注入资源查询；原领域、权限和主档写入逻辑未改。每次查询批量读取 ModelVendor/Model/ChannelView/SupplierView，重新分组，不缓存主档名称，也不导入供应商 fixture。

供应商以 Stage 03 当前 Repository 为准，更名/缩写/停用立即在刷新后的模型/渠道详情反映。无渠道新供应商只存在主档，不增加模型覆盖。目录可有无资源模型，仍可打开基础信息。业务域由 modelDomain 推导，Seedance 海外版仍属国内厂商域。

前台没有供应商身份与覆盖数，拒绝覆盖/供应商 ID 筛选；内部技术属性只复制原 ChannelView 已存在字段。所有资源接口不含报价/客户/审计快照。猜测无权详情 ID 返回 null。测试应同时验证 API 键缺席和 UI，不以页面隐藏冒充鉴权。

模型覆盖按不同供应商 ID 去重，不是需求级三家匹配达标；四个渠道状态分别计数。顶部统计不随普通筛选变化；supplierId 关联筛选限制模型集合，但每模型仍汇总全部授权渠道。UI 文案已说明，前台清除该参数即可回到匿名资源池。

运行 npm run dev 后访问 /models。/models/m-seed-cn、/channels/ch-2 为虚构验收示例。完整验证：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify。截图见 harness/build/stage-04a-*.png。

未来 Stage 04B：将模型/渠道读实现替换为统一 Repository，保留 ResourceReaders 边界，供 Dashboard/主档摘要/资源池共用；不在页面增加存储或缓存副本。本阶段未开发可变渠道存储、编辑、OP 写入、报价、执行、上线或真实接口。等待验收，不开始 Stage 04B。
