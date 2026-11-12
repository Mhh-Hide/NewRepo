# 阶段路线图

- 第 00 阶段：已交付工程基础、Harness、欢迎页及基础验证；提交 2d1a5b6c06f2399a0ffac0f708602e3dfe8744c1。
- 第 01 阶段：本批建立核心领域、状态词汇、权限策略与投影、只读 Mock API、关联夹具和规则测试；保留欢迎页。验收材料见 build/stage-01.md、context/stage-01.md 与 build-log.md。
- 第 02 阶段：未开始，等待用户验收和下一步授权。
- 后续业务页面、状态机、真实集成顺序待独立任务确认。

分支依赖：开始第 01 阶段时 main 尚未含第 00 阶段，因此 stage-01-domain-permissions 基于 stage-00-engineering-harness。提交不直接合并 main；审查时可先以第 00 阶段分支为比较基线。

build/ 保存阶段记录，context/ 保存脱敏交接；禁止真实凭据和客户数据。dist/ 与测试运行输出不提交。
