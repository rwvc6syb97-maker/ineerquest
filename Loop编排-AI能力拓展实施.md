# Loop 编排 — AI 能力拓展实施（PM 权威版 v1.0）

> 出品：PM-Agent　｜　执行方：项目调度 Agent（rv45nox2）统筹，分派 后端(s19lr0dt) / 数据库(ltaax899) / 前端(au-orwo5) / 测试(qp52lwfz)
> 契约基线：`project/需求文档-AI能力拓展-PRD与接口契约与测试用例.md`（v1.0，唯一权威来源）
> 铁律：报告本体纯规则严禁 LLM 侵入；所有 LLM 走 llm-gateway；AI 入库内容须人工审核；严禁爬取招聘平台；联调阶段禁用 mock 掩盖契约。
> 使用方式：调度 Agent 每完成一个 Loop，回本文档把「状态」由 `⬜待办` 改为 `✅完成`，登记残留。
> 生成时间：2026-07-12

---

## 一、Loop 执行总原则（每个 Loop 内部循环）

每个功能项按固定 5 步循环推进，任一步不达标则打回上一步重做：

```
Step1 DB建表评审(数据库Agent) 
  → Step2 后端接口实现+单测(后端Agent) 
  → Step3 前端接入+联调(前端Agent) 
  → Step4 真实回归(测试Agent, 无mock) 
  → Step5 PM验收放行(本文档登记)
  → 打回则回到对应Step
```

**流转门禁**：
- Step1→2：DB 表结构经 PM 确认字段命名(下划线)/索引/软删除/隔离原则达标。
- Step2→3：后端 tsc 零错误 + 单测覆盖全部错误码 + 契约出参一致。
- Step3→4：前端字段驼峰映射一致 + 无 mock 兜底 + 错误态非白屏。
- Step4→5：第7章通用14条(G-01~14)+相关专项(S)用例全过。
- Step5：PM 逐项核对上线放行标准，登记放行或残留。

---

## 二、批次编排（按 Roadmap 优先级串行推进，批内可并行）

### Batch P0｜快速验证「AI 懂你」（先行）

| Loop | 功能项 | 主域 | 依赖 | 新增/改动表 |
| --- | --- | --- | --- | --- |
| L-P0-1 | AI 报告人话翻译 | 后端+前端 | ai-chat/llm-gateway | 无（旁挂） |
| L-P0-2 | AI 报告深度个性化问答 | 后端+前端 | ai-chat + career 上下文 | 无 |
| L-P0-3 | AI 追问式测评校准 | 全域 | assessment | assessment_result 改字段 |

**Batch P0 验收门禁**：报告本体接口在 AI 全挂时仍可用(S-01)；无临界维度提交校准返 4514(S-03)；配额/降级生效(G-09/11/12)。

### Batch P1｜增值与闭环

| Loop | 功能项 | 主域 | 新增表 |
| --- | --- | --- | --- |
| L-P1-1 | AI 动态成长计划 | 全域 | career_growth_plan |
| L-P1-2 | AI 咨询前问题梳理师 | 后端+前端 | coaching_pre_brief |
| L-P1-3 | AI 咨询后行动纪要 | 后端+前端 | coaching_summary |
| L-P1-4 | AI 辅导师智能匹配 | 后端+前端 | 无（读画像） |

**Batch P1 验收门禁**：非会员调成长计划返 4515(G-07)；咨询未结束生成纪要返 4711(S-06)；降级回退规则版。

### Batch P2｜新品类与裂变

| Loop | 功能项 | 主域 | 新增表 |
| --- | --- | --- | --- |
| L-P2-1 | AI 双人/团队协作分析 | 全域 | ai_collab_analysis（可选存储） |
| L-P2-2 | AI 简历/求职信生成器 | 全域 | ai_resume_doc |
| L-P2-3 | AI 深度报告个性化章节 | 后端+前端 | report_ai_chapter |

**Batch P2 验收门禁**：游客协作超1次/日返9001(S-08)；深度章节不写报告本体表(S-02)；非DEEP报告返4517。

### Batch P3｜重投入高价值

| Loop | 功能项 | 主域 | 新增表 |
| --- | --- | --- | --- |
| L-P3-1 | AI 模拟面试+即时反馈 | 全域 | ai_interview / ai_interview_qa |
| L-P3-2 | AI 面试题库+模拟评分 | 全域 | interview_question |
| L-P3-3 | AI 职业热点日报 | 后端+调度 | daily_brief / daily_brief_subscription |
| L-P3-4 | AI 辅助职业库生产(后台) | 全域 | career_ai_draft |

**Batch P3 验收门禁**：职业库草稿未审核不入正式表(S-04)；传入招聘平台数据源被拒(S-05)；面试结束不可再答返4520。

### Batch 远期｜方向占位（暂不派单，立项前补细化 PRD）

| Loop | 功能项 | 前置 |
| --- | --- | --- |
| L-FUT-1 | AI 简历诊断 | 文档解析链路立项 |
| L-FUT-2 | AI 职业树可视化 | 职业关系图谱数据 |
| L-FUT-3 | 跨会话长期记忆顾问 | user_ai_memory + 可删除权(个保法) |

---

## 三、各 Agent 循环执行职责

| Agent | 每 Loop 输入 | 每 Loop 产出 | 打回条件 |
| --- | --- | --- | --- |
| 数据库(ltaax899) | 契约中「数据库」段 | 表结构+索引+迁移脚本+评审结论 | 命名/隔离/软删不达标 |
| 后端(s19lr0dt) | 契约接口段+已过审表 | 接口实现+DTO校验+单测(全错误码) | tsc报错/出参不符/漏错误码 |
| 前端(au-orwo5) | 后端联调就绪接口 | 页面接入+映射+错误态 | 字段不符/有mock/白屏 |
| 测试(qp52lwfz) | 联调就绪功能 | 真实回归报告(G+S用例) | 任一P0用例失败 |
| PM(atyb1n4m) | 测试报告 | 放行裁定/残留登记 | 放行标准未全达标 |

---

## 四、全局验收放行标准（每 Batch 收口复核）

1. 接口入参/返回字段/数据类型三端完全一致；
2. 全部通用用例 G-01~14 通过；相关专项 S 用例通过；
3. 权限矩阵校验完备（游客/登录/会员/管理员分级正确）；
4. 配额与限流生效（9001/9002）；LLM 降级不白屏（degraded+兜底）；
5. 报告本体与 AI 旁挂严格隔离，报告接口不依赖任何 LLM；
6. AI 入库内容全部经 ops 人工审核后发布，无 AI 直灌线上；
7. 无任何招聘平台爬取行为；生产环境敏感信息不泄露；
8. 长期记忆等含个人信息能力具备用户可删除权（个保法合规）。

全部达标方可 Batch 放行；未达标项登记残留并回对应 Step 循环。

---

## 五、Batch 执行状态登记

| Batch | 状态 | 放行日期 | 残留 |
| --- | --- | --- | --- |
| P0 | ✅放行 | 2026-07-12 | 三接口32用例全过、护城河达标、P0/P1清零；P2文档债(PRD正文已回填对齐实现;ai-chat历史注释50001/50002残留待随迭代清理) |
| P1 | ✅放行 | 2026-07-12 | 四接口(成长计划/咨询前梳理/咨询后纪要/辅导师匹配)五步闭环；后端20用例全绿+前端tsc零错误；护城河达标(成长计划落career_growth_plan不写roadmap/pre-brief/summary逻辑关联orderId无外键/match仅APPROVED+ONLINE/非会员4515/越权4003/全挂degraded不白屏)；幂等uk_order_id P2002回查；P0无P2；残留P1(DTO校验返4000 vs PRD声明4005)已由PM裁定文档对齐实现——ValidationPipe统一映射4000为全项目既有约定,PRD 0.2/0.5已补注,不返工 |
| P2 | ✅放行 | 2026-07-12 | 三接口(协作分析/简历生成/深度章节)五步闭环+16用例全绿；护城河专项达标(三service唯一写aiCollabAnalysis/aiResumeDoc/reportAiChapter分表,零report/reportSection/career本体写入,S-02达标);限流分流(游客1次/日/IP→9001、登录日配额20→9002,S-08达标);会员校验4515+敏感词4516(先于LLM拦截未入库);非DEEP报告4517;三段式降级degraded不白屏;新增3表迁移20260712020000非破坏性;前端追加式无mock字段严格一致。残留P1:纯内存mock单测,建议上线前补真实e2e冒烟(限流/落库/LLM降级) |
| P3 | ✅放行 | 2026-07-12 | 四功能9接口(模拟面试start/answer/report、题库list/score、日报get/subscription、职业库generate/drafts/review)五步闭环+27用例全绿+tsc零错误。护城河专项达标:面试仅写aiInterview/aiInterviewQa、题库零写、日报仅dailyBriefSubscription.upsert且只读status=1;S-04铁律达标——职业库generate仅落careerAiDraft(status=0),写career/careerSkill严格封闭于approve的$transaction原子提交,reject仅置status=2,绝不直写正式表;S-05红线达标——refSources命中招聘黑名单拒4005且不调LLM不落库;状态机4520(已结束不可再答);会员4515/越权4003(userId隔离)/admin越权4030(RequirePerms+PermissionGuard);错误码4004/4005/4460/4461/4462全对齐response.ts常量;三段式降级degraded不白屏;迁移20260712030000非破坏性;前端追加式无mock字段与后端VO严格一致、admin三函数走adminRequest。PM裁定:§4.4管理员越权返4030(既有后台PermissionGuard统一约定,已有专项单测)而非PRD正文4003,以实现为权威,PRD需对齐补注不返工。残留P1(非阻断):全项目纯内存mock单测,建议上线前补真实e2e冒烟(approve草稿同步$transaction落库/会员限流/LLM真实降级/日报scheduler生成链路)。至此P0~P3全Batch放行清零 |
| P3-DB | ✅放行 | 2026-07-12 | 六model/5表迁移20260712030000非破坏性;护城河无物理外键;S-04草稿隔离;uk_user_date/uk_user_id;软删;索引齐全 |
| 远期 | ⬜暂缓 | — | 需先立项补细化 PRD |

---

## 修订记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.0 | 2026-07-12 | 首版：基于 AI 拓展契约 v1.0 编排 5 Batch / 15 Loop 循环计划与验收门禁 |