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
| T3 | 逐环节端到端联调核对字段契约一致 | qp52lwfz | atyb1n4m | T1,T2 | P0 | READY | READY(契约v2.2前后端修复已VERIFIED并部署e6bc90d;但回归遭Railway后端全端点502阻断。根因:apps/api start脚本含`db seed`,seed非幂等——旧题删除顺序未先删assessment_answer致P2003外键约束,seed非零退出→nest never start。已双管齐下修复:①seed.ts:250-252删除顺序改answer→option→question(幂等);②package.json:8 start脚本移除db seed与db push --accept-data-loss,仅保留migrate deploy。经总指挥独立核验schema外键字段一致、修复完备。待提交push触发Railway重新部署→验证/api/v1/health恢复200后重启八环节回归) |
| T4 | 配置并验证 AI 对话真实 LLM 通道 | s19lr0dt | qp52lwfz | LLM Key 就绪 | P1 | BLOCKED | BLOCKED |
| T5 | 生产环境关闭后台 mock 登录（前端+后端） | au-orwo5 / s19lr0dt | qp52lwfz | — | P1 | READY | READY |
| T6 | shared 错误码对齐后端契约 v2.0 | au-orwo5 | qp52lwfz | — | P2 | READY | DONE ✅(PM验收:码值与后端response.ts逐项一致,SUCCESS判定正确,build通过) |
| T7 | 修订产品分析报告 AI/辅导状态描述 | atyb1n4m | atyb1n4m | — | P2 | READY | READY |
| T8 | 外部依赖接入（Redis/MQ/OSS/支付/短信邮件） | s19lr0dt | qp52lwfz | 资源开通 | P2 | BLOCKED | BLOCKED |
| T9 | 全量回归 + 上线验收报告 | qp52lwfz | atyb1n4m | 全部 | P0 | BLOCKED | BLOCKED |

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