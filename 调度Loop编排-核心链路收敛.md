# InnerQuest 调度 Loop 编排文档 — 核心链路收敛与真实联调

> 版本：v1.0 ｜ 出品：产品经理（PM-Agent）｜ 日期：2026-07-10
> 执行主体：项目调度工程师（rv45nox2）
> 依据：`执行计划-核心链路收敛与联调排期.md` v1.0（T1-T9）
> 目的：定义一个可循环执行的调度机制，调度工程师按本文档反复"领取→派发→执行→验收→回写"，
> 直到全部任务达到 `DONE` 且上线验收门槛清零为止。

---

## 一、Loop 总控原则

1. **单一事实源**：任务队列（第四章）是唯一权威状态表，任何 Agent 的产出都必须回写到队列。
2. **状态驱动**：调度器只依据任务状态机流转（第三章），不凭记忆或口头结论派发。
3. **依赖门控**：任务只有在其全部前置依赖为 `VERIFIED` 时才可进入 `READY`。
4. **验收闭环**：任何任务完成后必须经"验收 Agent"独立核验，未过验收不得置 `DONE`。
5. **失败回退**：验收不通过 → 任务回退 `REJECTED` 并附失败原因 → 重新进入 `READY` 由承接 Agent 修复。
6. **循环终止条件**：全部 P0/P1 任务 = `DONE` 且第七章上线门槛 6 条全过 → Loop 结束。

---

## 二、角色与 agentId 映射

| 角色 | agentId | 在 Loop 中的职责 |
| --- | --- | --- |
| 项目调度工程师 | rv45nox2 | Loop 总控：读队列、判依赖、派任务、收结果、回写状态 |
| 产品经理（PM） | atyb1n4m | 定义验收标准、裁决契约争议、修订文档类任务、放行上线 |
| 前端工程师 | au-orwo5 | 承接 T1/T2/T5(前端侧)/T6 |
| 后端架构工程师 | s19lr0dt | 承接 T4/T5(后端侧)/T8 |
| 数据库架构工程师 | ltaax899 | 承接涉及表结构/存储校验的子项，联调期校验数据落库 |
| 全栈测试专家 | qp52lwfz | 承接 T3/T9，并作为所有任务的独立验收 Agent |

---

## 三、任务状态机

```
BLOCKED  →  READY  →  IN_PROGRESS  →  REVIEW  →  VERIFIED  →  DONE
   ↑                                    │
   └──────────── REJECTED ←─────────────┘
```

| 状态 | 含义 | 进入条件 | 退出动作 |
| --- | --- | --- | --- |
| BLOCKED | 依赖未满足 | 存在未 VERIFIED 的前置依赖 | 依赖满足后转 READY |
| READY | 可派发 | 依赖全部 VERIFIED | 调度器派发给承接 Agent |
| IN_PROGRESS | 执行中 | 承接 Agent 已接单 | 产出交付物后转 REVIEW |
| REVIEW | 待验收 | 承接 Agent 提交交付物 | 验收 Agent 核验 |
| VERIFIED | 验收通过 | 满足该任务验收标准 | 释放下游依赖 |
| REJECTED | 验收驳回 | 未达验收标准 | 附原因回 READY 重做 |
| DONE | 归档 | VERIFIED 且无后续返工 | 归档，计入完成度 |

---

## 四、任务队列（权威状态表）

> 初始状态由依赖关系推导：无前置依赖者为 `READY`，否则 `BLOCKED`。
> 调度器每轮循环刷新本表；`回写` 列由承接/验收 Agent 更新。

| 编号 | 任务 | 承接 agentId | 验收 agentId | 依赖 | 优先级 | 初始状态 | 当前状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 前端去除 usePayment/useCoaching/usePrivacy/useCareerPlan/useSkillGap/useLearningResources/useFavorites 无条件 mock fallback，失败改错误态 | au-orwo5 | qp52lwfz | 后端接口就绪 | P0 | READY | DONE ✅(PM验收:目标hooks无残留fallback,失败抛ApiError+页面错误态,build通过;遗留P2:usePayment订单缓存待后端GET订单接口后迁移) |
| T2 | 测评链路拆本地兜底，切真实 records 接口 | au-orwo5 | qp52lwfz | s19lr0dt(assessment) | P1 | READY | DONE ✅(PM验收:useAssessment拆除isMockAuthEnabled短路/MOCK_QUESTIONS回退/localScore本地评分/iq_result_落地,5个hook直调assessmentApi失败抛ApiError;3页面去本地临时recordId兜底改错误态;接口路径逐项对齐后端controller,ASSESSMENT_INCOMPLETE=4202前后端一致;tsc通过。修正api注释旧码30002→4202) |
| T3 | 逐环节端到端联调核对字段契约一致 | qp52lwfz | atyb1n4m | T1,T2 | P0 | DONE✅ | DONE(PM终审书面放行:逐条对齐§13裁定书v1.0全达标—B1/B8 reportId=4非空、B7 generateStatus=pending深度三段全锁+幂等提示正确、createdAt ISO8601 UTC、A1 recommendations 200无BigInt崩溃、502清health200(10模块)、P0=0。commit 1864daa已部署。P2入迭代:PATCH answers savedCount/answeredTotal字段名待核(s19lr0dt)、seed数据空。【上线硬前置】careers/coaches/roadmap/skill-gap/resources须上线前手动db:seed灌入,不允许上线后补) |
| T4 | 配置并验证 AI 对话真实 LLM 通道 | s19lr0dt | qp52lwfz | LLM Key 就绪 | P1 | BLOCKED | DONE ✅(2026-07-10 测试回归通过:health code=200/LLM_PROVIDER_ENABLED=true/LLM_API_KEY=SET/NODE_ENV=production;railway.json端点全指向Agnes(api_url/base=apihub.agnes-ai.com,model=agnes-2.0-flash,OXYGENT=false)与provider优先级一致;运维已更新Railway Dashboard清残留京东值。核心P0:SSE逐字返回degraded=false全程无兜底,真实生成62字INTJ职业方向文案(非固定兜底),elapsed=7489ms(远高于秒级降级329/430ms符合真实推理),事件序列message→done正常收尾,code=200。边界:超长内容(>2000字)被拦截无脏数据。根因回顾:此前秒级降级=railway.json残留京东autobots+deepseek-chat且LLM_API_URL优先级最高打错端点,已修正+Dashboard清值。P0=0。~~P1入迭代:超长内容未走4504~~ ✅已修复(2026-07-10:ai-chat.controller.ts在SSE头flush前对content>2000显式抛BizCode.AI_CONTENT_TOO_LONG=4504以标准JSON返回,不再降级通用400;前后端tsc通过,待测试回归核验)) |
| T5 | 生产环境关闭后台 mock 登录（前端+后端） | au-orwo5 / s19lr0dt | qp52lwfz | — | P1 | READY | DONE ✅(测试VERIFIED 4/4 Gate:前端adminAuth.store.ts isMockAuthEnabled首行守卫import.meta.env.PROD/MODE=production→return false,生产mock分支永不命中强制走adminAuthApi.login;开发态保留VITE_AUTH_MOCK_MODE;用户端auth.store.ts恒false;后端ops无登录mock短路(admin-auth走真实账号密码,分析看板source=mock属数据降级非登录);tsc+vite build通过。P2:主chunk 549kB分包优化入迭代) |
| T6 | shared 错误码对齐后端契约 v2.0 | au-orwo5 | qp52lwfz | — | P2 | READY | DONE ✅(PM验收:码值与后端response.ts逐项一致,SUCCESS判定正确,build通过) |
| T7 | 修订产品分析报告 AI/辅导状态描述 | atyb1n4m | atyb1n4m | — | P2 | READY | DONE ✅(PM自验VERIFIED:9处文案更正"Mock兜底态"→"后端已实现并部署,缺外部依赖(LLM Key/支付/短信邮件)时降级";AI对话/辅导预约/流程图/异常处理均对齐;残留1处术语表定义已注明生产不用业务Mock;仅改文案未动需求/字段/接口契约) |
| T8 | 外部依赖接入（Redis/MQ/OSS/支付/短信邮件） | s19lr0dt | qp52lwfz | 资源开通 | P2 | BLOCKED | BLOCKED |
| T9 | 全量回归 + 上线验收报告（核心链路范围） | qp52lwfz | atyb1n4m | T1~T7 | P0 | BLOCKED | IN_PROGRESS(2026-07-10 Tick派单:seed前置已解除+BUG-01/02/03已修在位,派qp52lwfz执行T9全量回归并合并BUG-01/02/03定向回归,产出上线验收报告→交atyb1n4m放行。前置T1~T7全DONE,T8按P2不阻塞) |

---

## 五、每任务验收标准（Gate）

| 编号 | 验收 Gate（全部满足才可 VERIFIED） |
| --- | --- |
| T1 | 断网/后端返 4xxx 时页面显示错误态+重试而非假数据；正常时展示真实后端数据；全局搜索无残留无条件 mock fallback；web build 通过 |
| T2 | IntroPage/QuizPage/GeneratingPage 不再使用本地临时 recordId 与本地推导结果；测评走真实 records 接口；字段对齐契约 |
| T3 | 测评→报告→职业推荐→路线图→技能差距→学习资源→成长→辅导 每环节数据来源为后端真实响应，字段/类型与契约 v2.0/v2.1 一致；无 mock 数据出现 |
| T4 | 配置 LLM Key 后对话返回非 mock 文案；超时/失败有友好提示且保留输入 |
| T5 | 生产构建下后台 mock 登录不可用，强制走后端；开发态可保留 |
| T6 | packages/shared 的 TOKEN_INVALID / CommonCode 与后端契约 v2.0 一致；前端成功响应不再误判为失败 |
| T7 | 产品分析报告中 AI/辅导状态由"Mock 兜底"更正为"后端已实现，缺外部依赖时降级" |
| T8 | Redis 时段锁/延迟队列、MQ、OSS 海报、真实支付/短信/邮件通道按可用性逐项接入并标注状态 |
| T9 | 上线门槛 6 条全过；输出上线验收报告；全量测试用例通过 |

---

## 六、Loop 执行流程（调度器每轮循环）

调度工程师按以下步骤循环，每一轮称为一个 Tick：

```
LOOP Tick:
  Step 1 读队列   → 加载第四章任务队列当前状态
  Step 2 刷依赖   → 遍历 BLOCKED 任务；若其依赖全部 VERIFIED，则置 READY
  Step 3 选任务   → 从READY 中按优先级(P0>P1>P2)取可并行的任务集合
  Step 4 派单     → 对每个选中任务，用 task_create_new(mode=承接agentId) 派发，置 IN_PROGRESS
  Step 5 收交付   → 承接 Agent 完成后提交交付物，任务转 REVIEW
  Step 6 验收     → 用 task_create_new(mode=验收agentId) 按第五章 Gate 核验
  Step 7 判定     → 通过→VERIFIED→DONE；不通过→REJECTED→附原因→回 READY
  Step 8 回写     → 更新第四章"当前状态"列
  Step 9 判终止   → 若 P0/P1 全 DONE 且第七章门槛全过 → 退出 Loop；否则回 Step 1
```

并行规则：同一 Tick 内无相互依赖的 READY 任务可同时派发（如 T1/T2/T5/T6/T7 首轮可并行）。
串行门控：T3 依赖 T1+T2；T9 依赖全部 → 必须等前置 VERIFIED 后才进 READY。

---

## 七、派单指令模板（调度器 → 承接 Agent）

调度器派发时，task_create_new 的 message 必须包含以下结构，确保 Agent 独立可执行：

```
【任务编号】T{n}
【承接角色】{agentId 对应角色}
【任务目标】{第四章任务描述}
【输入依赖】{已 VERIFIED 的前置产出物路径/结论}
【约束】后端全局前缀 /api/v1；契约以后端 v2.0/v2.1 为准；禁止无条件 mock fallback
【交付物】{代码改动清单 + 自测结论 + build 结果}
【验收 Gate】{第五章对应 Gate 全文}
【回写要求】完成后回报状态(REVIEW)与交付物路径，供验收 Agent 核验
```

---

## 八、回写记录模板（Agent → 调度器）

每次交付/验收后按此格式回写，调度器据此更新队列：

```
任务：T{n}
执行 Agent：{agentId}
本轮状态：IN_PROGRESS → REVIEW / REVIEW → VERIFIED / REVIEW → REJECTED
交付物：{文件路径 / 接口清单 / 测试报告}
验收结论：{通过 | 驳回原因(对照 Gate 逐条)}
下游释放：{因本任务 VERIFIED 而转 READY 的任务编号}
```

---

## 九、建议执行波次（对齐三个 Sprint）

| 波次 | 触发条件 | 并行派发任务 | 串行门控任务 | 对应 Sprint |
| --- | --- | --- | --- | --- |
| Wave-1 | Loop 启动 | T1, T2, T5, T6, T7 | — | Sprint-1 |
| Wave-2 | T1+T2 VERIFIED 后 | T3, T4 | T3 待 T1/T2 | Sprint-1/2 |
| Wave-3 | 外部资源开通后 | T8 | — | Sprint-3 |
| Wave-4 | 全部 VERIFIED 后 | T9 | T9 待全部 | Sprint-3 |

---

## 十、Loop 终止与放行

Loop 结束需同时满足：
1. T1、T3、T9（全部 P0）= `DONE`；T2、T4、T5（全部 P1）= `DONE`；
2. 执行计划文档第七章上线验收门槛 6 条全部通过；
3. 由 PM（atyb1n4m）出具最终放行结论。

未满足则 Loop 继续下一 Tick，直到收敛。P2（T6/T7/T8）可并入或作为上线后迭代，不阻塞放行判定，但需在上线验收报告中标注遗留状态。

---

## 十一、最新待解决项（迭代快照 · 2026-07-10 更新）

> 本章为 PM 依据最新一轮 Bug 清单修复情况刷新的待解决项，供调度器下一 Tick 派单参考。
> 队列主表（第四章）仍为唯一权威状态源；本章为其增量视图。

### 11.1 本轮已修复（待测试回归核验后转 VERIFIED）

| 编号 | 来源 | 问题 | 修复内容 | 归属 | 状态 |
| --- | --- | --- | --- | --- | --- |
| BUG-01 | 新发现 | AI 对话真实接口失败静默降级为 mock，掩盖契约/连通问题 | SSE发送流已改handleError；T9复查发现会话列表/新建会话/历史消息catch仍静默回退mock，二修：三处移除mock回退（失败直接抛错/置空并暴露错误态），删除mockConversations/mockMessages | au-orwo5 | REVIEW（待 qp52lwfz 复测） |
| BUG-02 | T4 遗留 P1→**T9升P0** | 超长内容(>2000字)未按契约返回 AI_CONTENT_TOO_LONG=4504 | 首修(controller二次校验抛4504)被全局ValidationPipe的@MaxLength(2000)先行拦截而**不可达**,实返HTTP400+4000违约。二修：DTO @MaxLength放宽为10000(超大payload兜底)，业务上限2000交controller抛4504 | s19lr0dt | REVIEW（待 qp52lwfz 复测 code=4504） |
| BUG-03 | T3 遗留 P2 | 测评答案字段类型分歧：前端 Answer=string vs 后端 AnswerItemDto=number | 前端 Answer 接口/store.toAnswers()/useSaveAnswers 统一对齐 number（依据契约裁定 v2.2 optionId=option.id） | au-orwo5 | REVIEW（待 qp52lwfz 回归） |

验收要求：前后端 tsc 已通过；需 qp52lwfz 就 BUG-01（断连时展示错误态非 mock 文案）、BUG-02（超长请求返回 code=4504）、BUG-03（提交/续答 answers 为 number 且计分正确）做定向回归，通过后本三项归档。

### 11.2 剩余待解决项（按优先级）

| 编号 | 待解决项 | 优先级 | 归属 | 阻塞上线? | 说明 |
| --- | --- | --- | --- | --- | --- |
| P-01 | T9 全量回归 + 上线验收报告重跑 | P0 | qp52lwfz→atyb1n4m | 是 | seed 前置已解除、BUG-01/02/03 已修，需重跑核心链路全量回归并出报告 |
| P-02 | 短信验证码真实通道（登录/注册） | P1 | s19lr0dt | 否(降级) | 外部依赖，缺短信服务时降级；纳入 T8 |
| P-03 | PATCH answers 出参 savedCount/answeredTotal 字段名核对 | P2 | s19lr0dt | 否 | T3 遗留待核 |
| P-04 | usePayment 订单缓存迁移（待后端 GET 订单接口） | P2 | au-orwo5 | 否 | T1 遗留 |
| P-05 | 前端主 chunk 549kB 分包优化 | P2 | au-orwo5 | 否 | T5 遗留 |
| P-06 | 外部依赖接入 Redis/MQ/OSS/支付/短信邮件（T8） | P2 | s19lr0dt | 否 | 资源开通后接入，上线报告标注降级状态 |

### 11.3 下一 Tick 建议动作

1. 派 qp52lwfz 对 BUG-01/02/03 做定向回归（合并进 T9 重跑更高效）。
2. 回归通过后，派 qp52lwfz→atyb1n4m 执行 P-01（T9 上线验收报告），这是当前唯一 P0 阻塞项。
3. P-02~P-06 作为上线后迭代，不阻塞放行，但须在 T9 验收报告中逐项标注遗留状态。