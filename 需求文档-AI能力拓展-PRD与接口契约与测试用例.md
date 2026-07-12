# InnerQuest AI 能力拓展 —— PRD + 接口契约 + 测试用例（权威规范 v1.0）

> 本文档为《产品分析报告-MBTI职业规划网页产品》第 5 章「AI 能力拓展 Roadmap」15 项的落地权威规范，是前端/后端/数据库三端开发的唯一契约来源。与旧文档冲突时以本文为准。
> 关联基线：《需求文档-接口与测试用例权威规范.md》(v2.0)、`.joycode/memory/project_api_contract.md`。

---

## 第 0 章 全局约定（强制，一旦确定不得私改）

### 0.1 统一返回结构

```
{ "code": number, "message": string, "data": unknown }
```

- 成功：`code = 200`（不是 0），HTTP 状态码语义同步。
- 客户端错误：4xxx；服务端异常：5xxx；限流：90xx。
- `data` 失败时为 `null`。

### 0.2 错误码分段（沿用 v2.0 基线，AI 拓展新增码归入对应段）

| 段 | 含义 | 本文档新增范围 |
| --- | --- | --- |
| 40xx | 通用/鉴权 | 复用（4001未登录/4003越权/4004不存在/4005参数错误/4009重复提交）。注：DTO/ValidationPipe 自动拦截的参数校验统一映射为 **4000**（`all-exception.filter` 全项目既有约定）；4005 为业务层显式抛出的参数错误。前端对 4000/4005 统一按「参数错误」提示 |
| 44xx | 职业 | 4460~4469（职业库AI生产） |
| 45xx | AI 能力 | 4510~4599（本文档主力分配区） |
| 47xx | 辅导 | 4710~4719（咨询前后AI闭环、辅导师匹配） |
| 48xx | 后台 | 4810~4819（内容审核） |
| 50xx | 服务端 | 5001通用/5002 LLM上游失败/5003 LLM超时 |
| 90xx | 限流 | 9001全局限流/9002 AI日配额耗尽 |

### 0.3 字段命名与时间

- 接口/前端字段：小驼峰；数据库字段：下划线（Prisma `@map` 映射）。
- 时间：DB 存 UTC，接口返回北京时间字符串（`YYYY-MM-DD HH:mm:ss` 或 ISO8601，沿用现有约定）。

### 0.4 AI 能力全局铁律

1. **护城河隔离**：报告本体（BASIC/DEEP）保持纯规则、严禁 LLM 侵入；所有报告相关 AI 一律以「旁挂增值层」独立接口提供。
2. **LLM 统一网关**：所有 LLM 调用走 `llm-gateway`（Agnes AI，OpenAI 兼容），禁止各模块直连。
3. **配额与限流**：AI 类接口统一受每日配额与 QPS 限流约束（见第 6 章）。
4. **降级语义**：LLM 上游失败/超时须返回 `degraded=true` 且给出兜底文案，不得直接 500 让前端白屏（除非无兜底内容）。
5. **人工审核红线**：AI 生成的入库内容（职业库/面试题库等）一律经 ops 后台人工审核后发布，禁止 AI 直灌线上。
6. **合规红线**：严禁爬取 BOSS/猎聘/脉脉等招聘平台数据。

### 0.5 通用鉴权/限流响应约定

| 场景 | code | message |
| --- | --- | --- |
| 未登录/凭证过期 | 4001 | 登录已失效，请重新登录 |
| 越权访问 | 4003 | 无权访问该资源 |
| 资源不存在 | 4004 | 资源不存在 |
| 参数校验失败（DTO/ValidationPipe 自动拦截） | 4000 | 参数错误 |
| 业务层显式参数错误（越界/超长等主动抛出） | 4005 | 参数错误 |
| 重复提交 | 4009 | 请勿重复提交 |
| 全局限流 | 9001 | 请求过于频繁，请稍后再试 |
| AI 日配额耗尽 | 9002 | 今日 AI 使用次数已用完 |
| LLM 上游失败 | 5002 | AI 服务暂时不可用 |
| LLM 超时 | 5003 | AI 响应超时，请重试 |

---

## 第 1 章 P0 第一批（快速验证「AI 懂你」）

### 1.1 AI 报告「人话翻译」

**业务目标**：免费用户在报告页一键把专业术语段落翻译成通俗口语解读，提前体验 AI，服务付费转化。旁挂 ai-chat REPORT 场景，不改报告本体。

**用户流程**：报告详情页某章节 → 点「人话解读」→ 调接口 → 展示口语化解读（可再点「换个说法」重生成）。

| 项 | 定义 |
| --- | --- |
| 方法/路由 | POST `/api/v1/ai/report/plain-talk` |
| 权限 | 已登录（游客不可用，引导登录） |
| Body 必填 | `reportId`(string) `sectionKey`(string) |
| Body 可选 | `regenerate`(boolean,默认false) |
| 返回 data | `{ plainText: string, degraded: boolean }` |

**异常/错误码**：

| 场景 | code |
| --- | --- |
| 未登录 | 4001 |
| reportId/sectionKey 为空 | 4005 |
| 报告��存在或非本人 | 4004/4003 |
| sectionKey 不存在于该报告 | 4511（章节无效） |
| AI 日配额耗尽 | 9002 |
| LLM 失败/超时 | 5002/5003（返回 degraded=true + 兜底：原文摘要） |

---

### 1.2 AI 报告深度个性化问答升级

**业务目标**：在 ai-chat REPORT 场景基础上，注入用户收藏职业/成长计划数据，让问答真正"懂你"。

**用户流程**：报告页/对话页发起提问 → 后端组装 MBTI+收藏职业+计划上下文 → LLM 生成个性化回答。

| 项 | 定义 |
| --- | --- |
| 方法/路由 | POST `/api/v1/ai/chat/personalized`（SSE 流式，复用 ai-chat 会话/配额/落库体系） |
| 权限 | 已登录 |
| Body 必填 | `convNo`(string) `content`(string) |
| 约束 | content ≤ 2000 字（超 4504，flush 头前以标准 JSON 返回）；单会话 ≤ 50 轮（超 4502）；每日配额 200（超 4501） |
| 返回 | SSE 流：event:message `{delta,degraded}` 逐 token → event:done 结束 → event:error `{code,message}` 携业务码 |

> 契约以后端实现为准（response.ts v2.0）。历史 T3 注释中的 50001/50002 为旧值文案，实际常量为 4501/4502。

**异常/错误码**：

| 场景 | code |
| --- | --- |
| 未登录 | 4001（TOKEN_INVALID） |
| content 为空/超 2000 字 | 4504（AI_CONTENT_TOO_LONG） |
| 会话不存在或非本人 | 4004/4003 |
| 超 50 轮 | 4502（AI_ROUND_LIMIT） |
| 日配额耗尽 |4501（AI_QUOTA_LIMIT） |
| LLM 失败/超时 | 5002/5003（degraded=true 逐 token 兜底，不白屏） |

---

### 1.3 AI 追问式测评校准

**业务目标**：测评完成后，对处于维度临界值（如 E/I 51:49）的用户发起 AI 追问，二次校准结果精准度。

**用户流程**：测评结果生成 → 若存在临界维度 → 返回追问问题 → 用户作答 → AI 校准并回写校准结果字段。

| 接口 | 方法/路由 | Body | 返回 data |
| --- | --- | --- | --- |
| 获取追问 | GET `/api/v1/ai/assessment/calibration/:resultId` | — | `{ resultId, mbtiType, calibrated:boolean, questions:[{dimension, currentPercent, question, options:[{choice:'first'|'second', label}]}] }` |
| 提交校准 | POST `/api/v1/ai/assessment/calibration/:resultId` | `{ answers:[{dimension, choice:'first'|'second'}] }` | `{ resultId, originalType, calibratedType, changed:boolean }` |

**权限**：已登录且 resultId 属于本人。

> 临界判定：维度偏好百分比 percent∈[50,55] 判定为临界维度。校准为**纯规则重算**，严禁调 LLM；仅回写 `calibrated`/`calibration_data`，绝不修改 `mbtiType`（护城河）。契约以实现为准。

**异常/错误码**：

| 场景 | code |
| --- | --- |
| 未登录/越权 | 4001/4003 |
| resultId 不存在/非本人 | 4203（ASSESSMENT_RECORD_NOT_FOUND） |
| answers 为空/dimension 非法 | 4005 |
| 无临界维度却提交校准 | 4514（NO_NEED_CALIBRATE，无需校准） |
| 重复提交校准 | 4090（DUPLICATE_SUBMIT，幂等拦截） |
| LLM 失败/超时 | 5002/5003（degraded=true，保持原结果不调整） |

**数据库**：`assessment_result` 增 `calibrated`(tinyint)、`calibration_data`(json)；需 DB Agent 评审。

---

## 第 2 章 P1 第二批（增值与闭环）

### 2.1 AI 动态成长计划

**业务目标**：将 career-plan 现有"规则生成"升级为 LLM 生成的分周可执行任务（会员/付费卖点），生成结果人工可编辑。

| 项 | 定义 |
| --- | --- |
| 方法/路由 | POST `/api/v1/ai/career/growth-plan` |
| 权限 | 已登录 + 会员/付费校验（非会员返回 4515） |
| Body 必填 | `careerId`(string) `targetMonths`(number, 1~24) |
| Body 可选 | `currentSkills`(string[]) |
| 返回 data | `{ planId, weeks:[{weekNo, theme, tasks:[{title, resourceUrl?}]}], degraded }` |

**异常**：4001 未登录 / 4515 非会员无权 / 4005 targetMonths 越界 / 4004 职业不存在 / 5002/5003 LLM 失败（degraded=true 回退规则版计划）。

**数据库**：新增 `career_growth_plan`（AI 生成计划，与规则 career_roadmap 分表）；需 DB Agent 评审。

---

### 2.2 AI 咨询前「问题梳理师」

**业务目标**：用户预约辅导后，AI 引导梳理咨询诉求，生成结构化提纲同步给辅导师，提升咨询效率与单价。

| 项 | 定义 |
| --- | --- |
| 方法/路由 | POST `/api/v1/ai/coaching/pre-brief` |
| 权限 | 已登录 + 该咨询订单属于本人 |
| Body 必填 | `orderId`(string) `answers`([{question, answer}]) |
| 返回 data | `{ briefId, outline: string, tags: string[] }` |

**异常**：4001/4003/4004（订单不存在或非本人）/ 4005 answers 为空 / 4710（订单状态不允许生成提纲，如已完成）/ 5002/5003。

**数据库**：新增 `coaching_pre_brief`；需 DB Agent 评审。

---

### 2.3 AI 咨询后「行动纪要」

**业务目标**：咨询结束后从会话消息流自动生成纪要 + 待办，待办可一键回写成长计划，形成闭环留存。

| 项 | 定义 |
| --- | --- |
| 方法/路由 | POST `/api/v1/ai/coaching/summary` |
| 权限 | 已登录 + 订单属于本人 + 咨询已结束 |
| Body 必填 | `orderId`(string) |
| 返回 data | `{ summaryId, summary: string, todos:[{title, done:false}] }` |

**异常**：4001/4003/4004 / 4711（咨询未结束不可生成纪要）/ 4712（会话无消息可总结）/ 5002/5003。

**数据库**：新增 `coaching_summary`（含 todos json）；需 DB Agent 评审。

---

### 2.4 AI 辅导师智能匹配

**业务目标**：根据用户 MBTI + 诉求画像，AI 推荐最匹配的辅导师，替代人工筛选、提转化。

| 项 | 定义 |
| --- | --- |
| 方法/路由 | POST `/api/v1/ai/coaching/match` |
| 权限 | 已登录 |
| Body 必填 | `demand`(string, ≤500字) |
| Body 可选 | `topN`(number, 默认3, 1~10) |
| 返回 data | `{ matches:[{coachId, name, matchScore:number, reason:string}] }` |

**异常**：4001 / 4005 demand 为空或超长 / 4713（当前无可用辅导师）/ 5002/5003（degraded=true 回退按评分排序的规则匹配）。

**说明**：matchScore 为 0~100，由画像相似度计算，reason 由 LLM 生成解释；仅推荐 status=已审核通过的辅导师。

---

## 第 3 章 P2 第三批（新品类与裂变）

### 3.1 AI 双人/团队协作分析

**业务目标**：输入两人（或多人）MBTI，AI 输出协作建议、冲突预警，作为拉新裂变卖点（可无账号体验入口，但结果保存需登录）。

| 项 | 定义 |
| --- | --- |
| 方法/路由 | POST `/api/v1/ai/collab/analyze` |
| 权限 | 游客可试用（限 1 次/日/IP），保存结果需登录 |
| Body 必填 | `members`([{name?, mbtiType}], 2~6 人) |
| Body 可选 | `scene`(string, 如"项目协作") |
| 返回 data | `{ analysisId?, summary, pairs:[{a, b, synergy:number, advice}], risks:string[], degraded }` |

**异常**：4005 members 少于2或超6或 mbtiType 非法 / 9001 游客试用超限 / 9002 登录用户日配额耗尽 / 5002/5003。

---

### 3.2 AI 简历/求职信生成器

**业务目标**：结合目标职业 + 用户经历表单，AI 生成简历要点与求职信初稿，商业化新品类。

| 项 | 定义 |
| --- | --- |
| 方法/路由 | POST `/api/v1/ai/resume/generate` |
| 权限 | 已登录 + 会员/付费（非会员 4515） |
| Body 必填 | `careerId`(string) `profile`({education, experiences[], skills[]}) |
| Body 可选 | `type`("resume"\|"coverLetter", 默认 resume) |
| 返回 data | `{ docId, content: string, sections:[{title, body}], degraded }` |

**异常**：4001/4515 / 4005 profile 必填缺失 / 4004 职业不存在 / 4516（生成内容触发敏感词，需重试）/ 5002/5003。

**数据库**：新增 `ai_resume_doc`；需 DB Agent 评审。

---

### 3.3 AI 深度报告「个性化章节」

**业务目标**：DEEP 付费报告旁挂一个 AI 生成的"职业情景推演"章节，强化付费差异，**严格与规则报告本体隔离**（独立接口、独立存储）。

| 项 | 定义 |
| --- | --- |
| 方法/路由 | POST `/api/v1/ai/report/scenario-chapter` |
| 权限 | 已登录 + 持有该报告 + 报告为 DEEP 类型（非 DEEP 返回 4517） |
| Body 必填 | `reportId`(string) |
| Body 可选 | `focusCareerId`(string) |
| 返回 data | `{ chapterId, title, paragraphs:string[], degraded }` |

**异常**：4001/4003/4004 / 4517（非 DEEP 报告不支持）/ 9002 / 5002/5003。

**铁律**：本章节结果不得写入 report 本体表，须独立存 `report_ai_chapter`；报告本体生成逻辑不得依赖本接口。需 DB Agent 评审。

---

## 第 4 章 P3 第四批（重投入高价值）

### 4.1 AI 模拟面试 + 即时反馈

**业务目标**：针对目标职业发起多轮模拟面试，AI 出题、评分、给反馈，高价值付费点。

| 接口 | 方法/路由 | Body | 返回 data |
| --- | --- | --- | --- |
| 开始面试 | POST `/api/v1/ai/interview/start` | `{careerId, difficulty?}` | `{interviewId, firstQuestion}` |
| 提交答案 | POST `/api/v1/ai/interview/:interviewId/answer` | `{answer}` | `{score, feedback, nextQuestion?, finished:boolean}` |
| 面试报告 | GET `/api/v1/ai/interview/:interviewId/report` | — | `{overallScore, dimensions[], suggestions[]}` |

**权限**：已登录 + 会员/付费（4515）。
**异常**：4001/4515 / 4004 面试会话不存在 / 4003 越权 / 4005 answer 为空 / 4520（面试已结束不可再答）/ 9002 / 5002/5003。
**数据库**：新增 `ai_interview`、`ai_interview_qa`；需 DB Agent 评审。

---

### 4.2 AI 面试题库 + 模拟评分

**业务目标**：按职业/难度沉淀面试题库，支持练习模式 AI 评分，内容资产沉淀。

| 接口 | 方法/路由 | Query/Body | 返回 data |
| --- | --- | --- | --- |
| 题库列表 | GET `/api/v1/ai/interview/questions` | Query: `careerId, difficulty?, page, pageSize` | `{list:[{qId, question, tags}], total}` |
| 单题评分 | POST `/api/v1/ai/interview/questions/:qId/score` | `{answer}` | `{score, feedback, sampleAnswer}` |

**权限**：列表登录可见；评分需会员（4515）。
**异常**：4001/4515/4004（题不存在）/4005 / 9002 / 5002/5003。
**数据库**：新增 `interview_question`（AI 生成 + 人工审核发布，status 控制）；需 DB Agent 评审。

---

### 4.3 AI 职业热点日报（个性化推送）

**业务目标**：结合用户画像 + 岗位库，scheduler 定时生成个性化职业热点日报，提留存/复购。

| 接口 | 方法/路由 | 说明 | 返回 data |
| --- | --- | --- | --- |
| 获取我的日报 | GET `/api/v1/ai/daily-brief` | Query: `date?` | `{briefId, date, items:[{title, summary, careerId?}]}` |
| 订阅设置 | PUT `/api/v1/ai/daily-brief/subscription` | Body: `{enabled, categories[]}` | `{enabled, categories}` |

**权限**：已登录。
**异常**：4001 / 4004（当日无日报）/ 4005 / 5001。
**说明**：生成由 scheduler 后台批量跑（非请求触发），内容源限权威数据+AI 摘要，**严禁爬取招聘平台**；日报内容经 ops 审核策略后发布。
**数据库**：新增 `daily_brief`、`daily_brief_subscription`；需 DB Agent 评审。

---

### 4.4 AI 辅助职业库生产（后台）

**业务目标**：后台批量用 AI 生成岗位描述/职责/技能清单/薪资区间草稿，写 career/career_skill，经人工审核发布，降运营成本。

| 接口 | 方法/路由 | Body | 返回 data |
| --- | --- | --- | --- |
| 生成草稿 | POST `/api/v1/admin/ai/career/generate` | `{name, category, refSources?:string[]}` | `{draftId, career:{...}, skills:[...]}` |
| 草稿列表 | GET `/api/v1/admin/ai/career/drafts` | Query: `status, page, pageSize` | `{list, total}` |
| 审核发布 | POST `/api/v1/admin/ai/career/drafts/:draftId/review` | `{action:"approve"\|"reject", remark?}` | `{status}` |

**权限**：仅管理员（普通用户 4003）。
**异常**：4001/4003 / 4005 name/category 为空 / 4460（草稿不存在）/ 4461（重复职业名）/ 4462（草稿已审核不可重复操作）/ 5002/5003。
**红线**：`refSources` 仅允许权威数据源（统计局/行业白皮书/正规开放API/授权数据集）；**严禁传入招聘平台抓取数据**；AI 草稿禁止直灌线上，必须经 approve 后才写入正式 career 表。
**数据库**：新增 `career_ai_draft`（草稿态，approve 后同步 career/career_skill）；需 DB Agent 评审。

---

## 第 5 章 远期（方向占位，落地前需单独细化 PRD）

> 以下 3 项为平台级差异化方向，接口为方向性约定，正式立项前须补齐完整字段/异常/DB 设计。

### 5.1 AI 简历诊断

- 路由：POST `/api/v1/ai/resume/diagnose`，Body `{resumeText 或 docId}`，返回 `{score, issues:[{type, detail, suggestion}]}`。
- 权限：会员（4515）。异常：4005/4516 敏感内容/5002/5003。
- 依赖：文本解析（PDF/DOCX 上传解析链路需另立项）。

### 5.2 AI 职业树可视化

- 路由：GET `/api/v1/ai/career/tree`，Query `{rootCareerId}`，返回 `{nodes:[{id, name, level}], edges:[{from, to, relation}]}`。
- 权限：已登录。异常：4004/5001。
- 依赖：职业关系图谱数据积累（career 关系表需另立项）。

### 5.3 跨会话长期记忆顾问

- 路由：POST `/api/v1/ai/chat/memory-advisor`，复用会话体系，注入用户长期画像记忆。
- 权限：会员（4515）。异常：4001/4515/9002/5002/5003。
- 铁律：长期记忆仅存脱敏画像摘要，**不得存敏感个人信息明文**；用户可一键清除记忆（POST `/api/v1/ai/chat/memory/clear`）。
- 依赖：长期记忆存储与召回机制（`user_ai_memory` 表）需另立项，含用户可删除权（个保法合规）。

---

## 第 6 章 全局异常场景 / 权限 / 限流 / 数据库汇总

### 6.1 全局异常场景清单（所有 AI 接口通用）

| 场景 | 处理 | code |
| --- | --- | --- |
| 空输入 | 必填校验拦截 | 4005 |
| 格式错误（枚举/类型不符） | DTO 校验拦截 | 4005 |
| 参数超长（content/demand 等） | 长度校验 | 4513/对应超长码 |
| 重复提交（校准/纪要等一次性操作） | 幂等键 + 唯一约束 | 4009 |
| 登录凭证过期 | 网关鉴权拦截 | 4001 |
| 越权访问他人资源 | 归属校验 | 4003 |
| LLM 上游失败 | 兜底文案 + degraded=true | 5002 |
| LLM 超时 | 兜底 + degraded=true | 5003 |
| 网络中断/前端 | 前端重试 + 保留输入 | — |
| 并发请求同一资源 | FOR UPDATE / 唯一约束 | 视场景 |
| 频繁调用超 QPS | 限流拦截 | 9001 |
| AI 日配额耗尽 | 配额拦截 | 9002 |
| 软删除资源访问 | is_deleted 过滤 | 4004 |
| 管理员接口普通用户访问 | 角色校验 | 4003 |

### 6.2 权限矩阵

| 能力 | 游客 | 登录用户 | 会员/付费 | 管理员 |
| --- | --- | --- | --- | --- |
| 报告人话翻译/个性化问答 | ✗ | ✓ | ✓ | ✓ |
| 追问式校准/协作分析 | 协作可试1次/日 | ✓ | ✓ | ✓ |
| 成长计划/简历/深度章节/模拟面试/记忆顾问 | ✗ | ✗ | ✓ | ✓ |
| 咨询前后闭环/辅导师匹配 | ✗ | ✓（订单归属） | ✓ | ✓ |
| 职业库AI生产/内容审核 | ✗ | ✗ | ✗ | ✓ |

### 6.3 限流与配额策略

- 全局 QPS：单用户 AI 接口 ≤ 5 req/s，超返 9001。
- 每日配额：AI对话类 200 次/日；重成本类（面试/简历/成长计划）单列配额 20 次/日；超返 9002。
- 游客协作分析：1 次/日/IP，超返 9001。
- 无 Redis：配额/限流计数落 MySQL（cache_kv / cache_zset）。

### 6.4 数据库新增表汇总（均需 DB Agent 评审）

| 表 | 用途 |
| --- | --- |
| assessment_result（改）| 增 calibrated / calibration_data |
| career_growth_plan | AI 成长计划（与规则 roadmap 分表） |
| coaching_pre_brief / coaching_summary | 咨询前提纲 / 咨询后纪要 |
| ai_resume_doc | 简历/求职信生成结果 |
| report_ai_chapter | 深度报告 AI 旁挂章节（隔离本体） |
| ai_interview / ai_interview_qa | 模拟面试会话与问答 |
| interview_question | 面试题库（审核发布） |
| daily_brief / daily_brief_subscription | 职业热点日报与订阅 |
| career_ai_draft | 职业库 AI 草稿（审核后同步 career） |
| user_ai_memory（远期）| 长期记忆脱敏画像（可删除） |

---

## 第 7 章 上线验收测试用例清单

### 7.1 通用验收（每个接口必过）

| 编号 | 用例 | 预期 |
| --- | --- | --- |
| G-01 | 正常入参 | code=200，data 结构与契约完全一致 |
| G-02 | 未登录调用需登录接口 | code=4001 |
| G-03 | 越权访问他人资源 | code=4003 |
| G-04 | 必填缺失/类型错误 | code=4005 |
| G-05 | 参数超长 | 对应超长码 |
| G-06 | 一次性操作重复提交 | code=4009 |
| G-07 | 非会员调会员接口 | code=4515 |
| G-08 | 普通用户调管理员接口 | code=4003 |
| G-09 | 触发日配额上限 | code=9002 |
| G-10 | 高频调用 | code=9001 |
| G-11 | LLM 上游失败 | code=5002 或 degraded=true+兜底 |
| G-12 | LLM 超时 | code=5003 或 degraded=true+兜底 |
| G-13 | 返回时间字段 | 北京时间字符串格式 |
| G-14 | 前端字段驼峰、DB 下划线映射 | 一致 |

### 7.2 关键专项用例

| 编号 | 用例 | 预期 |
| --- | --- | --- |
| S-01 | 报告本体接口在 AI 全挂时仍可用 | 报告纯规则不受 LLM 影响 |
| S-02 | 深度章节结果不写入 report 本体表 | 独立表 report_ai_chapter |
| S-03 | 测评无临界维度提交校准 | code=4514 |
| S-04 | 职业库 AI 草稿未审核不入正式表 | career 表无新记录，仅 draft |
| S-05 | 职业库生成传入招聘平台数据源 | 拒绝/校验失败（合规红线） |
| S-06 | 咨询未结束生成纪要 | code=4711 |
| S-07 | 长期记忆清除后不再召回 | 记忆置空 |
| S-08 | 游客协作分析超 1 次/日 | code=9001 |

### 7.3 上线放行标准

接口入参/返回字段/数据类型三端一致；异常场景全覆盖；权限矩阵校验完备；配额限流生效；LLM 降级不白屏；报告本体与 AI 旁挂严格隔离；AI 入库内容经人工审核；无招聘平台爬取；敏感信息不泄露；全部用例通过后方可上线。

---

## 修订记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.0 | 2026-07-12 | 首版：覆盖第5章 AI 拓展 15 项PRD+接口契约+测试用例 |