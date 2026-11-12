# 业务模块边界

未来每个 feature 独立维护 pages、components、逻辑和测试。仅在对应阶段与 PRD 确定后创建模块；不预建空业务实现。数据访问通过 services，业务类型通过 domain，权限通过 auth。
