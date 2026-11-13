# Stage 04B 交接

基线 ddf02ffaed75994303c00531db50085470bc65ac，分支 stage-04b-channel-management。仅渠道主档，不进入 Stage 05。先读 AGENTS 和 docs 本阶段章节；后端/真实 OP/测试执行仍未接入。

入口：/channels（ChannelListPage，授权筛选、统计、排序分页、重置）；/channels/:channelId（原详情升级，运营主档操作，其他角色只读）。ChannelEditor 负责基础表单，ChannelManagement 负责启停、模拟绑定预览确认、分页历史及前后快照。复用 Shell、PageHeader、StatCard、StatusBadge、FeedbackStates、资源查询 hook 与现有模型详情渠道表，无额外依赖。

统一 ChannelApi 类型在 services/channel-types.ts，由 mocks/channel-api.ts 实现并注入 ApiAdapter。ManagedChannel 是原 Channel 交叉扩展；普通编辑字段白名单，关联对象不可改。仅运营 channel:create/update/toggle/bind-op/history，读权限仍用原 projection + records/domain。写时 guard、version、校验、保存；旧 DemoSession 撤销写能力。相同 OP 绑定重试可以不写入地返回当前授权投影。

ChannelRepository（maas-channel-demo-v1）单键 schemaVersion/revision/channels/tasks/history，从原 fixture 复制初始渠道和任务并保留 ID。新渠道和 quality/connectivity 两条 pending 任务及审计一次写入；不产生执行、豁免、报价。保存前 validateStore 使用当前 SupplierRepository，另有结构验证及 revision 检查；失败无部分提交，无变化不增版本/历史。

mock-adapter 所有渠道/任务（包括授权过滤、需求关联、测试/执行查询、事件/审计过滤）读该 Repository；SupplierApi channels 回调、ResourceApi readers、Dashboard 均因此共享数据。历史报价/执行等仍为原 fixture，不能伪造新结果。供应商主档/历史/管理范围沿用 Stage 03 唯一 Repository；新无渠道主档可以成为创建候选，已停用主档不新建合作渠道。

安全重置：渠道重置恢复初始渠道与任务、清空渠道变更历史，保留供应商及原静态历史；供应商重置前检查所有渠道是否引用新增供应商，是则拒绝并要求先单独确认渠道重置。均限双域运营全部域并二次确认；不自动迁移或覆盖 Stage 03 存储。损坏/不兼容渠道存储显示错误，运营可显式确认渠道重置恢复。读失败不自动清空。

Mock OP 输入格式 MOCK- 加 1–80 个字母数字/连字符/下划线；原绑定保留。完整集合唯一性复用 bindOpChannelId，一对一假设待真实 OP 确认。无解绑/覆盖、真实配置或技术状态联动。TTFT 单位毫秒，其余能力非负安全整数，null 为未知。

验证命令：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify。新增 channels.test.ts 包含领域/API/存储/角色和一致性场景；channels.spec.ts 覆盖保存导航刷新/OP冲突/角色切换/1440、1280、390px/重置恢复。既有测试保留，仅原尺寸用例的运营详情标题更新为“渠道详情”。最终完整 verify 退出码 0：232 个单元测试和 21 个浏览器测试全部通过，类型/Lint/格式/构建通过；详见 build/stage-04b.md、build-log。

限制：localStorage revision 只能检测明显并发变化，不能提供跨标签页强事务或生产安全；真实后端需事务/权限/日志。生产自由文本/附件、真实 OP 格式/解绑、停用供应商合作例外、关联迁移仍 TBD。截图在 harness/build/stage-04b-*.png。完成后等待验收，不合并 main、不强制推送。

共享块约 1,047 kB（gzip 333 kB），保留原阈值提示；本期未引入大型新依赖，后续性能优化需独立评估。
