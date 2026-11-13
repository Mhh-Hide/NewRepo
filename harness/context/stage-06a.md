# Stage 06A交接

基线e67d257abd7f46ce46241b82a4a5e7d888a46c99，从指定提交创建stage-06a-procurement-analytics。先阅读AGENTS、业务/数据/权限规范、05B交接与不可变性补丁。只交付06A，06B未开始。

入口/analytics/procurement，旧/analysis/purchase重定向；运营/采购可见。顶层授权范围筛选、覆盖与分类指标；中层同模型渠道比较和分组趋势；下层优惠到期、目标数字差、询价跟进、数据质量及报价明细。原报价/渠道/寻源详情下钻继续服务鉴权。Dashboard增加优惠待办和分析入口，既有指标值/计算接口不变，原测试断言未改。

services/procurement-analytics-types.ts定义只读ProcurementAnalyticsApi，createMockAdapter装配原quotationApi后组合createProcurementAnalyticsApi(ctx,active,quotationApi)。分析接口先检查活动会话/quote:read/业务域，再读quoteOptions和全部50条分页queryQuotes，授权来自原渠道/采购维护供应商读边界；无新存储、写入、fixture/localStorage UI依赖或第二份价格缓存。返回前按AnalysisRecord等最小字段白名单投影，不附商业备注、联系人、证据、询价自由文本、客户/售价或审计快照。纯计算在domain/procurement-analytics.ts，展示组件在features/procurement-analytics，懒路由ProcurementAnalyticsRoute。

统计：覆盖按模型/渠道/供应商ID去重；正式/优惠历史覆盖与当前时间有效记录分开。参考/待确认排除过期和异常区间；正式需确认人/确认时间/开始且未截止；优惠当前同时间条件。过期保留，未来生效另列。近期渠道按创建时间最近7天去重。优惠提醒为查询时刻起7×24小时，(now,now+7天]，北京时间展示；跟现有Dashboard/QuotationApi口径一致。

筛选：报价支持厂商/模型/供应商/渠道/状态/币种/北京时间创建日（含止日）；指标随筛选变化。询价只受渠道关联范围限制，不用报价币种或创建日推断询价。模型选项来自授权渠道含无报价模型；有报价覆盖只计报价记录。最近一次报价/最近正式记录按报价创建时间，当前优惠全部保留，不选择唯一结算价；优惠表“正式记录并存”查看同渠道完整授权历史。

比较：compareQuotes逻辑原样复用，兼容抽出ComparableQuote必要五字段，原ManagedQuote调用不变。未知/不同模型、币种、基准、规格、维度/数量/单位、状态或有效期不比较，异常有效期也拒绝。目标无基准/规格，本期仅数字基点差，verifiedTargetRate/verifiedAchieved=null，不算金额、节约、达成或自动suitable。

趋势：buildChannelTrend用最小授权记录，按完整价格口径+原录入状态分组；图例包含计费维度/数量/单位。X轴实际创建或供应商报价时间，不用序号/确认/录入代替真实回复；时间未知/异常/口径缺失解释不绘点。同组至少两条非纠错报价才连线，更正菱形独立不连入调价线，正式方形、优惠空心/虚线。确认只改变当前状态显示，不新增价格点或迁移原录入状态分组。历史有效期可不同，仅观察同口径历史折扣，不能当作横向同有效期可比采购价。SVG无新图表库，详细数值/时间在报价明细。

询价：sent/quoted计当前已发起（未关闭），draft和closed独立。待回复sent、收到quoted、超期仅sent且已知截止早于now。关闭前是否发送无可靠数据，不推断。requestedAt是台账登记，supplierQuotedAt是报价日期，无真实发送/回复时间，因此responseHours=null，不计算平均响应或绩效排名。

最终完整verify退出码0：严格类型/Lint/格式、420单元（原378+新增42）、37浏览器（原33+新增4）及构建通过。截图及35个修改/新增文件清单见build/stage-06a.md和build-log。本批新增单元及E2E，不改既有378/33用例、超时、类型或断言。

限制：Mock客户端授权非生产安全，分页读取和多Repository不提供多窗口原子快照；真实后端需行/字段鉴权与一致快照。真实基准目录、目标元数据、财务舍入、用量、实际回复事件、附件/导出保密、审批/结算仍TBD。保留原构建共享大包提示，不引新依赖。完成后普通推送本分支，不合并main、不强制推送，不开始06B。

## Stage 06A验收补丁

本补丁基于b52304deb9f3c21ee31de948d3ff8eaf16c3d4e5在原分支继续，不是06B。compareAnalysis必传Date.parse(analysis.asOf)，规格可比/原商业比较与两条记录查询时刻有效性独立返回。不能将历史同口径数字差当作当前可执行采购价；即使时间有效也须另核正式依据/渠道准入。历史趋势改用无时钟的区间结构检查，保留历史点。

channelPriceViews同样显式传now，latestFormal仍为历史，activeFormals新增为全部当前有效正式报价，activePromotions继续独立。isCurrentFormal供统计、分组、AnalysisTable统一使用，isConfirmedFormal检查历史确认。最近/历史/当前正式/当前优惠四列，历史标当前时效，当前为空不回退。时间起点包含/截止不含，无起点未知，异常区间不计有效。原compareQuotes、所有Repository存储及追加保护、权限、Dashboard优惠逻辑未改。

补丁完整verify已通过：446单元（新增26）、39浏览器（新增2）、类型/Lint/格式及生产构建；1440/390px检查通过。14个修改/新增文件清单与截图见build/stage-06a-patch.md与build-log。原单元测试仅补充新必传参数，既有断言/用例/超时保留。完成后普通推送原分支，不修改main、不强推，不进入06B，等待验收。
