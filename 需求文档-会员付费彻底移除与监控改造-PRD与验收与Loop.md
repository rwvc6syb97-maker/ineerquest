# 需求文档：会员/付费彻底移除 + 运营监控改造（PRD · 验收 · Loop）

> 版本：v1.0　｜　产品：InnerQuest（MBTI+职业规划）　｜　角色：PM 权威裁定
> 决策基线：**方案A —— 彻底删除，免费化永久化，不可回滚**（用户 2026-07-29 确认）
> 前置状态：全功能免费化改造已上线（FREE_MODE 开关式）。本次将开关式免费化转为**代码级永久移除**，并将运营监控从「营收转化」转向「各功能模块使用趋势与分析」。

---

## 一、业务需求简述

1. **彻底移除会员与付费体系**：删除 payment（支付订单）、membership（会员套餐）两大模块及其接口、路由、前端页面（收银台/套餐/订单/支付结果），删除数据库付费相关表与用户付费字段，移除付费相关错误码。产品全功能永久免费。
2. **取消营收监控**：后端不再统计营收（GMV/付费用户/订单/营收趋势），移除后台看板营收指标与转化漏斗中的「付费/解锁」步骤。
3. **新增功能模块监控**：为各核心功能模块建立**使用趋势与分析**监控（日活跃使用量趋势、模块使用占比、周期对比），数据源走权威业务表聚合，供后台运营看板展示。

## 二、全局强制约定（不可私改，变更须经 PM 确认）

- 后端统一返回结构：`{ code:number; message:string; data:any }`；code：200 成功、4xxx 客户端错误、5xxx 服务端异常。
- 时间：后端存 UTC，接口返回北京时间字符串（ISO8601）。
- 命名：前端/接口驼峰，数据库下划线，ORM 映射。
- **删除即彻底**：本次删除的模块/字段/错误码不保留兼容分支，不保留 FREE_MODE 开关（开关本身一并移除，代码走无门禁直连）。
- **鉴权与越权隔离不放松**：删除的仅是「付费门禁」，登录鉴权（4001）、越权（4003）、管理员权限隔离照旧。
- **数据安全**：删表前须评估外键依赖，按「先删引用后删主表」顺序执行；删除操作须走 Prisma migration 版本化，禁止手工改库。

---

## 三、残余清除清单（分层）

### A. 后端（apps/api）

| 编号 | 清除对象 | 位置 | 处理动作 |
|---|---|---|---|
| BE-1 | PaymentModule 整模块 | `modules/payment/*` | 删除模块目录、controller/service/dto/spec |
| BE-2 | MembershipModule 整模块 | `modules/membership/*` | 删除模块目录及全部文件 |
| BE-3 | 模块注册 | `app.module.ts:32,33,51,52` | 移除 import 与 imports 数组注册 |
| BE-4 | 白名单/路由前缀 | `app.controller.ts:17 'payment'` | 移除 payment 前缀声明 |
| BE-5 | 错误码定义 | `common/response.ts` | 移除 REPORT_LOCKED(4302)、AI_MEMBER_ONLY(4515)、MEMBERSHIP_LEVEL_HIGHER(4605)、COACH_MEMBERSHIP_REQUIRED(4703)、PAYMENT_DUP(4090)、PAYMENT_AMOUNT_MISMATCH(4000 复核)、MEMBERSHIP_PLAN_OFFLINE(4040)、PAYMENT_SIGN_INVALID(4030) |
| BE-5b | 4302 依赖点复核 | `ai-report/ai-report.service.ts:44` | 移除 REPORT_LOCKED 透传注释与相关分支（免费无锁段） |
| BE-6 | AI 会员校验（4处） | `ai-career-plan/ai-resume/ai-interview/interview-bank` service | 删除 ensureMember 方法及其调用与 FREE_MODE 常量，控制器/DTO/注释中 4515 会员描述清理 |
| BE-7 | user 出参付费字段 | `user/user.service.ts:44,46,47` | 移除 isPaid / membershipLevel / membershipExpireAt 出参字段 |
| BE-8 | report 解锁逻辑 | `report/report.service.ts` | 删除 unlock 方法、isUnlocked 判定与 lockedSectionKeys 全部逻辑及 FREE_MODE 常量，报告恒全量返回 |
| BE-9 | 报告解锁路由 | report.controller unlock 端点 | 删除 POST /reports/:id/unlock |
| BE-10 | 单测清理 | 4 个 AI `.spec.ts`、report.spec、payment/membership spec | 删除付费/会员断言用例，其余用例保留 |
| BE-11 | audit 装饰器示例 | `audit.decorator.ts:8,15` | 更新示例注释（去 membership:plan 示例，不影响功能） |

### B. 前端（apps/web）

| 编号 | 清除对象 | 位置 | 处理动作 |
|---|---|---|---|
| FE-1 | 付费/套餐/订单页面 | `pages/app/PricingPage`、`CheckoutPage`、`PaymentResultPage`、`OrdersPage`(如有) | 删除页面组件文件 |
| FE-2 | 路由 | `routes.tsx:40-43,82-85,135,149,237,245` | 删除 pricing/payment/orders/P09 付费段路由、payment:manage/membership:plan:manage 管理路由 |
| FE-3 | RequirePaid 守卫 | `components/guards/RequirePaid.tsx` | 删除守卫组件及全部引用（改为直接渲染） |
| FE-4 | 付费 hooks | `hooks/usePayment.ts`、`hooks/useMembership.ts` | 删除文件 |
| FE-5 | 付费 API | `api/modules/payment.api.ts`、`membership.api.ts`、`admin-membership.api.ts` | 删除文件及 api index 导出 |
| FE-6 | memberOnly 死代码 | `hooks/useAiPlus.ts`(342/355/391/664/722/816/925/947/1011 等)、`MyPlanPage.tsx:108-115`、`ai-plus.api.ts:310-311 MEMBER_ONLY` | 删除 memberOnly 状态/字段/渲染块/MEMBER_ONLY 常量与「会员专享」注释 |
| FE-7 | AI 组件残留文案 | `ResumeGenerateBlock.tsx`、`InterviewPracticeBlock.tsx`、`ReportChapterBlock.tsx:87 (/pricing 链接)` | 移除 memberOnly 分支与 /pricing 跳转 |
| FE-8 | 后台菜单 | `AdminLayout.tsx`（套餐管理/支付管理菜单）、`ProfilePage.tsx`（会员状态展示） | 移除入口与会员状态卡 |
| FE-9 | AI 对话文案 | `hooks/useAiChat.ts:215`「升级会员」 | 改为「请开启新会话继续」 |

### C. 数据库（Prisma / MySQL）

| 编号 | 清除对象 | 处理动作（版本化 migration） |
|---|---|---|
| DB-1 | payment_order 表 | 评估外键后 DROP TABLE |
| DB-2 | membership_plan 表 | DROP TABLE |
| DB-3 | user.membership_level / user.is_paid / user.paid_expire_at / user.membership_expire_at 字段 | ALTER TABLE DROP COLUMN |
| DB-4 | report.is_unlocked 字段 | ALTER TABLE DROP COLUMN（先确认无残留读取） |
| DB-5 | schema.prisma 模型 | 同步删除 PaymentOrder / MembershipPlan model 及 User/Report 相关字段 |
| DB-6 | seed 脚本 | 移除套餐/订单种子数据 |

> **删除顺序**：先 FE（停止调用）→ BE（下线接口与读取）→ DB（删字段删表）。DB 变更单独一个 Loop，删除前全库 grep 确认无代码引用被删字段/表。

---

## 四、监控改造

### 4.1 取消营收监控（后台看板 /admin/analytics/*）

| 动作 | 位置 |
|---|---|
| 删除 `revenue` 方法与 `GET /admin/analytics/revenue` 路由 | `admin-analytics.service.ts:130`、`admin-analytics.controller.ts:40-42` |
| `overview` 移除 paidUsers/payRate/paidOrders/gmvCents 字段 | `admin-analytics.service.ts:41-66` |
| `funnel` 删除 report_unlock 步骤，改为三步（测评开始→提交→报告生成） | `admin-analytics.service.ts:105-127` |
| analytics.service 事件枚举移除 REPORT_UNLOCK / REPORT_UNLOCK_VIEW_BLOCKED | `analytics/analytics.service.ts:23,25` |
| funnel 单测同步改为三步、去 report_unlock 断言 | `admin-analytics.service.spec.ts` |

### 4.2 新增功能模块使用趋势与分析监控

见「五、接口清单」moduleUsage 与 moduleTrend 两接口。口径原则：**全部走权威业务表聚合**（沿用 funnel/assessmentRate 已验证的口径基线，不依赖 event_log，避免埋点缺失导致恒 0）。

**纳入监控的功能模块（moduleKey 枚举，权威表口径）：**

| moduleKey | 模块中文名 | 权威计数源（近 N 天） |
|---|---|---|
| assessment | MBTI 测评 | count(assessment_record WHERE created_at≥since) |
| report | 测评报告 | count(report WHERE created_at≥since) |
| careerPlan | AI 成长计划 | count(ai_career_plan WHERE created_at≥since) |
| resume | AI 简历生成 | count(ai_resume WHERE created_at≥since) |
| interview | AI 模拟面试 | count(ai_interview WHERE created_at≥since) |
| interviewBank | 面试题库评分 | count(题库评分记录 WHERE created_at≥since) |
| aiChat | AI 对话 | count(ai_chat_message WHERE role=user AND created_at≥since) |
| coaching | 职业辅导 | count(coach_order WHERE created_at≥since) |
| dailyBrief | 职业日报 | count(daily_brief WHERE created_at≥since) |

> 若某表名/字段与实际 schema 不符，由数据库 Agent 校验后以 schema.prisma 实际为准，PM 不锁死表名，仅锁死「走业务表、不走 event_log」的口径原则与 moduleKey 枚举。

---

## 五、接口清单（新增/变更）

### 5.1 变更：`GET /admin/analytics/overview`（权限 analytics:read）

- 返回 data：`{ source:string; totalUsers:number; newUsers7d:number; assessmentCount:number; reportCount:number; aiCallCount:number }`
- **移除字段**：paidUsers、payRate、paidOrders、gmvCents。
- aiCallCount = 各 AI 模块调用合计（careerPlan+resume+interview+aiChat）。

### 5.2 删除：`GET /admin/analytics/revenue`（整端点下线，返回 404）

### 5.3 变更：`GET /admin/analytics/funnel`

- 三步：`funnel:[{step:'assessment_start',count},{step:'assessment_submit',count},{step:'report_generate',count}]`
- 移除 report_unlock 第四步。source 逻辑不变。

### 5.4 新增：`GET /admin/analytics/module-usage`（权限 analytics:read）

- Query：`days`（选，默认 30，范围 1~365）
- 返回 data：`{ source:string; days:number; total:number; items:[{ moduleKey:string; moduleName:string; count:number; ratio:number }] }`
- items 按 count 降序；ratio = count/total（total=0 时 ratio=0），保留 4 位小数。

### 5.5 新增：`GET /admin/analytics/module-trend`（权限 analytics:read）

- Query：`days`（选，默认 30，1~365）、`moduleKey`（选；缺省返回全部模块分组，传入则仅该模块）
- 返回 data：`{ source:string; days:number; series:[{ date:string; [moduleKey]:number }] }`（date=YYYY-MM-DD 北京时区，按日聚合，缺口日补 0）
- moduleKey 非法 → 4000。

---

## 六、异常场景与错误码

| 场景 | 错误码 | 说明 |
|---|---|---|
| 未登录访问后台看板 | 4001 | 登录鉴权照旧 |
| 非管理员/无 analytics:read | 4003 | 权限隔离照旧 |
| days 非数字/越界 | 4000 | 入参校验，兜底为默认值或 400 |
| moduleKey 非法 | 4000 | module-trend 校验 |
| 聚合查询异常 | 降级 source='mock' 返回 0 值 | 绝不抛错阻断看板（沿用现有降级策略） |
| 访问已删除的 /revenue、/pricing、/payment、/reports/:id/unlock | 404 | 端点/路由已彻底移除 |
| 已移除错误码（4302/4515/4605/4703/409x/40xx 付费类） | —— | 全局搜索确认无抛出点残留 |

> **本次删除后不得再出现**：任何 `isUnlocked`、`membershipLevel`、`isPaid`、`memberOnly`、`MEMBER_ONLY`、`REPORT_LOCKED`、`AI_MEMBER_ONLY`、`FREE_MODE`、`/pricing`、`revenue`、`gmv` 的活跃代码引用（注释/文档除外）。验收以全库 grep 零命中为准。

---

## 七、上线验收测试用例清单

| 用例 | 步骤 | 预期 |
|---|---|---|
| TC-01 | 访问 /pricing、/payment/result、/orders | 前端无此路由（404 或重定向首页） |
| TC-02 | 调 GET /memberships/plans、POST /payments/orders、POST /reports/:id/unlock | 后端 404（模块已删） |
| TC-03 | 非会员登录后使用 AI 成长计划/简历/面试/题库评分 | 全部正常返回，无 4515 |
| TC-04 | 获取报告详情 | 全部章节返回，无 lockedSectionKeys、无 isUnlocked 字段 |
| TC-05 | GET /admin/analytics/overview | 无 paidUsers/gmvCents 等字段，含 assessmentCount/reportCount/aiCallCount |
| TC-06 | GET /admin/analytics/revenue | 404 |
| TC-07 | GET /admin/analytics/funnel | 仅三步，无 report_unlock |
| TC-08 | GET /admin/analytics/module-usage?days=30 | 返回各模块 count 与 ratio，items 降序，ratio 合计≈1 |
| TC-09 | GET /admin/analytics/module-trend?days=7 | 按日 series，缺口补 0；传非法 moduleKey→4000 |
| TC-10 | 全库 grep 付费/会员关键词 | 活跃代码零命中（见六节清单） |
| TC-11 | tsc 编译 + jest 全量 | 零错误、全绿（付费相关用例已删除） |
| TC-12 | DB 校验 | payment_order/membership_plan 表已删、user/report 付费字段已删、无残留外键引用 |

**放行标准**：TC-01~TC-12 全通过；前后端接口字段类型一致；数据库无残留付费表/字段；鉴权与越权隔离完备；无��感信息泄露。

---

## 八、Loop 执行编排（交调度 Agent）

| Loop | 负责 Agent | 任务 | 出口验收 |
|---|---|---|---|
| L0 | PM | 本 PRD 定稿、moduleKey 口径裁定 | 文档交付（本文件） |
| L1 | 前端 | FE-1~FE-9：删页面/路由/hooks/api/守卫/死代码/文案 | 前端 tsc 零错、无付费关键词、页面正常 |
| L2 | 后端 | BE-1~BE-11：删 payment/membership 模块、AI 会员校验、report 解锁、错误码、user 出参字段 | 后端 tsc 零错、jest 绿、无付费关键词 |
| L3 | 后端 | 监控改造 4.1+4.2：删 revenue、改 overview/funnel、新增 module-usage/module-trend | 新接口按契约返回、单测覆盖 |
| L4 | 数据库 | DB-1~DB-6：schema 删模型/字段、生成 migration、清 seed | migration 版本化、外键无残留、可迁移 |
| L5 | 数据库 | 校验新监控数据源表名/字段与 moduleKey 口径落地 | 各 moduleKey 计数源确认，出参口径自洽 |
| L6 | 测试 | 执行 TC-01~TC-12 全量回归 | 全部通过 |
| L7 | PM | 终审放行、记忆存档 | 出放行结论 |

> **强制次序**：L1→L2→L3 完成且代码无引用后，方可进入 L4/L5 删库；删库前必须全库 grep 确认零引用（防止删字段后代码读取报错）。L6 在全部开发后统一回归。

---

## 九、风险提示

1. **不可回滚**：方案A 删表后历史付费/订单数据永久丢失，删除前建议 DBA 全量备份 payment_order/membership_plan 及 user 付费字段快照留存（合规/审计需要）。
2. **外键连锁**：payment_order 可能与 report/user 有外键；report.isUnlocked 删列前须确认无触发器/视图依赖。
3. **coach 会员门禁**：COACH_MEMBERSHIP_REQUIRED(4703) 若辅导下单有会员校验，需一并放行删除。
4. **前端缓存**：usePayment 的 localStorage 订单缓存 key 需清理，避免残留脏数据。