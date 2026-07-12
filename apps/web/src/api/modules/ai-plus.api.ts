/**
 * AI 能力拓展 · P0/P1/P2 接口 API
 * -------------------------------------------------------------
 * 唯一契约来源：需求文档-AI能力拓展-PRD与接口契约与测试用例.md + 后端实现/交付 VO。
 *
 *  L-P0-1 报告人话翻译  POST /ai/report/plain-talk（axios，含 degraded 兜底）
 *  L-P0-2 深度个性化问答 POST /ai/chat/personalized（SSE 流式，fetch+ReadableStream）
 *  L-P0-3 追问式测评校准 GET/POST /ai/assessment/calibration/:resultId（axios）
 *  P1-1 动态成长计划 / P1-2 咨询前梳理 / P1-3 咨询后纪要 / P1-4 辅导师匹配
 *  P2-1 团队协作分析 / P2-2 简历生成 / P2-3 深度报告扩展章节
 *
 * 硬性红线：
 *  - 严禁 mock 掩盖契约：接口失败必须暴露真实错误码/降级 UI。
 *  - degraded=true 仍正常展示内容 + 轻量降级提示，绝不白屏/报错弹窗。
 *  - data 字段全部可选判空，防 undefined 崩溃。
 *  - 无业务逻辑前置：临界判定、权限判断、有效期判断全后端做，前端只渲染/回传。
 *  - reportId / convNo / resultId 均为 string。
 */
import { request } from '../client';
import { adminRequest } from '../admin-client';
import { getAccessToken } from '../token';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

// ============================================================
// L-P0-1 报告人话翻译
// ============================================================

/** 翻译语气：warm 温暖鼓励 / plain 平实直白 / pro 专业理性（缺省 warm）。 */
export type PlainTalkTone = 'warm' | 'plain' | 'pro';

/** 报告人话翻译入参。 */
export interface PlainTalkParams {
  /** 报告 id（GET /reports/:id 返回的 id），字符串。 */
  reportId: string;
  /** 语气，默认 warm。 */
  tone?: PlainTalkTone;
  /** 仅翻译指定章节；缺省翻译整份报告可见章节。 */
  sectionKey?: string;
}

/** 报告人话翻译出参 data。 */
export interface PlainTalkResult {
  /** 人话版解读文本。 */
  plainText: string;
  /** 是否走了降级兜底（LLM 失败/超时为 true）。 */
  degraded: boolean;
  /** 降级原因（degraded=true 时给出）。 */
  degradeReason?: string;
}

/**
 * L-P0-1 报告人话翻译。
 * 成功/降级均 code=200；错误码：4203 报告不存在/无权、4302 章节已锁、4511 sectionKey 非法。
 * 出参做可选判空归一化，防后端字段缺失导致白屏。
 */
export function plainTalk(params: PlainTalkParams): Promise<PlainTalkResult> {
  return request<Partial<PlainTalkResult> | undefined>({
    url: '/ai/report/plain-talk',
    method: 'POST',
    data: {
      reportId: params.reportId,
      tone: params.tone ?? 'warm',
      ...(params.sectionKey ? { sectionKey: params.sectionKey } : {}),
    },
  }).then((data) => ({
    plainText: data?.plainText ?? '',
    degraded: data?.degraded ?? false,
    degradeReason: data?.degradeReason,
  }));
}

// ============================================================
// L-P0-2 深度个性化问答（SSE 流式）
// ============================================================

/** 个性化问答内容长度上限（后端二次校验 > 2000 抛 4504）。 */
export const PERSONALIZED_CONTENT_MAX = 2000;

/** 个性化问答入参。 */
export interface PersonalizedChatParams {
  /** 会话号，字符串。 */
  convNo: string;
  /** 用户消息内容，≤ 2000 字（前端先做长度校验提示）。 */
  content: string;
}

/** SSE 流式回调集合。 */
export interface PersonalizedStreamHandlers {
  /** 收到一个 token 增量（event:message → {delta, degraded}）。 */
  onDelta: (delta: string, degraded: boolean) => void;
  /** 流正常结束（event:done）。 */
  onDone?: () => void;
  /**
   * 流内/前置错误（event:error 或握手失败）。
   * code 为业务码：4504 超长 / 4502 轮次上限 / 4501 配额用尽 等。
   */
  onError?: (err: { code?: number; message: string }) => void;
}

/** 解析单条 SSE 记录的 event 与 data 负载。 */
function parseSseRecord(record: string): { event: string; data: string } {
  let event = 'message';
  let data = '';
  for (const line of record.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice(5).trim();
    }
  }
  return { event, data };
}

/**
 * L-P0-2 深度个性化问答，SSE 流式接收。
 * 用 fetch + ReadableStream 逐块解析（复用现有 ai-chat 的 SSE 消费模式）。
 * event:message → {delta, degraded} 逐 token；event:done 结束；event:error 携带业务码。
 * iframe 下同源 fetch 携带 Bearer，SSE 正常。
 * @param params convNo + content
 * @param handlers 流式回调
 * @param signal AbortController.signal 用于中断
 */
export async function personalizedChat(
  params: PersonalizedChatParams,
  handlers: PersonalizedStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const token = getAccessToken();
  let resp: Response;
  try {
    resp = await fetch(`${BASE_URL}/ai/chat/personalized`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ convNo: params.convNo, content: params.content }),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return;
    handlers.onError?.({ message: (err as Error)?.message ?? '连接失败，请稍后重试' });
    return;
  }

  // 非流式错误（如 4504 超长在 flush 头前以标准 JSON 返回）：解析业务码
  if (!resp.ok || !resp.body) {
    let code: number | undefined;
    let message = `请求失败（${resp.status}）`;
    try {
      const body = await resp.json();
      code = body?.code;
      message = body?.message ?? message;
    } catch {
      /* 忽略解析失败，保留 HTTP 兜底文案 */
    }
    handlers.onError?.({ code, message });
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let errored = false;

  const flush = (record: string) => {
    const { event, data } = parseSseRecord(record);
    let payload: { delta?: string; degraded?: boolean; code?: number; message?: string } = {};
    try {
      payload = data ? JSON.parse(data) : {};
    } catch {
      payload = { delta: data };
    }
    if (event === 'error') {
      errored = true;
      handlers.onError?.({ code: payload?.code, message: payload?.message ?? 'AI 服务异常' });
    } else if (event === 'done') {
      handlers.onDone?.();
    } else if (payload?.delta) {
      handlers.onDelta(payload.delta, payload?.degraded ?? false);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const record = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (record.trim()) flush(record);
      }
    }
    if (buffer.trim()) flush(buffer);
    if (!errored) handlers.onDone?.();
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return;
    handlers.onError?.({ message: (err as Error)?.message ?? '连接中断' });
  }
}

// ============================================================
// L-P0-3 追问式测评校准
// ============================================================

/** 追问选项：first=第一极(E/S/T/J)，second=第二极(I/N/F/P)。 */
export type CalibrationChoice = 'first' | 'second';

/** 追问题目单元。 */
export interface CalibrationQuestion {
  /** 维度键：EI/SN/TF/JP。 */
  dimension: string;
  /** 当前该维度偏好百分比(0-100，越接近 50 越模糊)。 */
  currentPercent: number;
  /** 追问题干。 */
  question: string;
  /** 两极选项。 */
  options: Array<{ choice: CalibrationChoice; label: string }>;
}

/** GET 校准判定出参 data。 */
export interface CalibrationCheckResult {
  resultId: string;
  mbtiType: string;
  /** 是否已完成过校准（幂等标记）。 */
  calibrated: boolean;
  /** 临界维度追问题目（无临界时抛 4514，正常情况非空）。 */
  questions: CalibrationQuestion[];
}

/** POST 提交答案入参。 */
export interface SubmitCalibrationParams {
  answers: Array<{ dimension: string; choice: CalibrationChoice }>;
}

/** POST 校准结果出参 data。 */
export interface CalibrationSubmitResult {
  resultId: string;
  /** 校准前 MBTI 类型。 */
  originalType: string;
  /** 校准后 MBTI 类型。 */
  calibratedType: string;
  /** 本次是否发生类型变化。 */
  changed: boolean;
}

/**
 * L-P0-3 GET 校准判定：返回临界维度追问题目。
 * 无临界维度后端抛 4514（前端应友好提示"无需校准"，非报错弹窗）。
 * 4203 结果不存在/无权。出参做可选判空归一化。
 */
export function checkCalibration(resultId: string): Promise<CalibrationCheckResult> {
  return request<Partial<CalibrationCheckResult> | undefined>({
    url: `/ai/assessment/calibration/${resultId}`,
    method: 'GET',
  }).then((data) => ({
    resultId: data?.resultId ?? resultId,
    mbtiType: data?.mbtiType ?? '',
    calibrated: data?.calibrated ?? false,
    questions: Array.isArray(data?.questions) ? (data!.questions as CalibrationQuestion[]) : [],
  }));
}

/**
 * L-P0-3 POST 提交追问答案：后端重算并落库，前端只回传 answers。
 * 4203 结果不存在、4514 无需校准、4090 重复提交（前端提示"已完成校准"并回显结果，非报错）。
 * 出参做可选判空归一化。
 */
export function submitCalibration(
  resultId: string,
  params: SubmitCalibrationParams,
): Promise<CalibrationSubmitResult> {
  return request<Partial<CalibrationSubmitResult> | undefined>({
    url: `/ai/assessment/calibration/${resultId}`,
    method: 'POST',
    data: { answers: params.answers },
  }).then((data) => ({
    resultId: data?.resultId ?? resultId,
    originalType: data?.originalType ?? '',
    calibratedType: data?.calibratedType ?? '',
    changed: data?.changed ?? false,
  }));
}

// ============================================================
// AI 能力拓展 · P1 四接口（会员成长计划 / 咨询前梳理 / 咨询后纪要 / 辅导师匹配）
// -------------------------------------------------------------
// 错误码严格对齐后端 apps/api/src/common/response.ts AI 拓展段（非 shared BizCode）：
//  4515 非会员 / 4001 未登录 / 4003 越权 / 4004 不存在 / 4005 参数 /
//  4710 pre-brief 状态不允许 / 4711 咨询未结束 / 4712 无消息 / 4713 无可用辅导师 /
//  5002 第三方异常 / 5003 上游超时（后两者一般以 degraded 兜底返回 code=200）。
// 前端不硬编码业务报错文案，除 4515/4713 做引导型提示外，其余展示后端真实 message。
// ============================================================

/** P1/P2 专用业务错误码（与后端 response.ts 一致，仅供前端错误分流，勿用于业务判定）。 */
export const AiPlusBizCode = {
  /** 成长计划/简历：非会员/会员过期 → 引导开通会员。 */
  MEMBER_ONLY: 4515,
  /** 未登录或登录失效。 */
  UNAUTHORIZED: 4001,
  /** 越权：资源非本人。 */
  FORBIDDEN: 4003,
  /** 资源不存在：职业/订单/会话/报告不存在。 */
  NOT_FOUND: 4004,
  /** 参数校验失败：必填缺失/越界/超长。 */
  BAD_PARAM: 4005,
  /** pre-brief：订单状态不允许生成提纲。 */
  PRE_BRIEF_NOT_ALLOWED: 4710,
  /** summary：咨询未结束不可生成纪要。 */
  SUMMARY_NOT_FINISHED: 4711,
  /** summary：会话无消息可总结。 */
  SUMMARY_NO_MESSAGE: 4712,
  /** match：当前无可用辅导师 → 引导型提示。 */
  MATCH_NO_COACH: 4713,
  /** 简历生成：命中敏感词 → 提示修改内容。 */
  RESUME_SENSITIVE: 4516,
  /** 报告章节：非 DEEP 报告 → 引导解锁深度报告。 */
  CHAPTER_NOT_DEEP: 4517,
  /** 协作分析：游客 1 次/日/IP 超限 → 提示登录/次日再试。 */
  COLLAB_GUEST_LIMIT: 9001,
  /** 协作分析：登录用户日配额 20 超限 → 提示次日再试。 */
  COLLAB_USER_LIMIT: 9002,
  // ---- P3 §4.1~§4.4 追加（勿改既有值）----
  /** §4.1 模拟面试：本场已结束不可再答。 */
  INTERVIEW_FINISHED: 4520,
  /** §4.4 职业库生产：草稿不存在。 */
  DRAFT_NOT_FOUND: 4460,
  /** §4.4 职业库生产：重复职业名。 */
  DRAFT_DUP_NAME: 4461,
  /** §4.4 职业库生产：草稿已审核，不可重复审核。 */
  DRAFT_ALREADY_REVIEWED: 4462,
  /** §4.4 后台越权：非管理员 scope（后台统一 4030，非 4003）。 */
  ADMIN_SCOPE_INVALID: 4030,
} as const;

// ---- P1-1 动态成长计划（会员专享）POST /ai/career/growth-plan ----

/** 成长计划入参（targetMonths 1~24，currentSkills 可选）。 */
export interface GrowthPlanParams {
  /** 职业 id（career.id），字符串。 */
  careerId: string;
  /** 目标月数，1~24（前端做基础范围提示，业务校验以后端 4005 为准）。 */
  targetMonths: number;
  /** 已具备技能（可选）。 */
  currentSkills?: string[];
}

/** 成长计划单个任务。 */
export interface GrowthTask {
  /** 任务标题。 */
  title: string;
  /** 参考资源链接（可选）。 */
  resourceUrl?: string;
}

/** 成长计划单周。 */
export interface GrowthWeek {
  /** 第几周（从 1 开始）。 */
  weekNo: number;
  /** 本周主题。 */
  theme: string;
  /** 本周任务列表。 */
  tasks: GrowthTask[];
}

/** 成长计划出参 data。 */
export interface GrowthPlanResult {
  /** 计划 id。 */
  planId: string;
  /** 分周计划。 */
  weeks: GrowthWeek[];
  /** 是否走了降级兜底（规则版）。degraded=true 仍正常展示 weeks。 */
  degraded: boolean;
}

/** 归一化单周（防后端字段缺失，tasks 默认 []）。 */
function normalizeWeek(w: Partial<GrowthWeek> | undefined): GrowthWeek {
  return {
    weekNo: w?.weekNo ?? 0,
    theme: w?.theme ?? '',
    tasks: Array.isArray(w?.tasks)
      ? w!.tasks!.map((t) => ({ title: t?.title ?? '', resourceUrl: t?.resourceUrl }))
      : [],
  };
}

/**
 * P1-1 动态成长计划（会员专享）。
 * 成功/降级均code=200；错误码：4515 非会员 / 4004 职业不存在 / 4005 参数越界 / 5002|5003 上游异常。
 * 出参可选判空：weeks/tasks 默认 []。
 */
export function growthPlan(params: GrowthPlanParams): Promise<GrowthPlanResult> {
  return request<Partial<GrowthPlanResult> | undefined>({
    url: '/ai/career/growth-plan',
    method: 'POST',
    data: {
      careerId: params.careerId,
      targetMonths: params.targetMonths,
      ...(params.currentSkills ? { currentSkills: params.currentSkills } : {}),
    },
  }).then((data) => ({
    planId: data?.planId ?? '',
    weeks: Array.isArray(data?.weeks) ? data!.weeks!.map(normalizeWeek) : [],
    degraded: data?.degraded ?? false,
  }));
}

// ---- P1-2 咨询前梳理（幂等）POST /ai/coaching/pre-brief ----

/** 咨询前梳理单条问答。 */
export interface PreBriefAnswer {
  /** 引导问题。 */
  question: string;
  /** 用户回答。 */
  answer: string;
}

/** 咨询前梳理入参（answers 至少 1 条）。 */
export interface PreBriefParams {
  /** 咨询订单 id。 */
  orderId: string;
  /** 引导问答列表。 */
  answers: PreBriefAnswer[];
}

/** 咨询前梳理出参 data。 */
export interface PreBriefResult {
  /** 提纲 id。 */
  briefId: string;
  /** 结构化提纲文本。 */
  outline: string;
  /** 标签。 */
  tags: string[];
  /** 是否降级兜底。 */
  degraded: boolean;
}

/**
 * P1-2 咨询前梳理（一订单一提纲，幂等）。
 * 错误码：4004 订单不存在 / 4003 非本人 / 4710 状态不允许 / 4005 参数。
 * 出参可选判空：tags 默认 []。
 */
export function preBrief(params: PreBriefParams): Promise<PreBriefResult> {
  return request<Partial<PreBriefResult> | undefined>({
    url: '/ai/coaching/pre-brief',
    method: 'POST',
    data: {
      orderId: params.orderId,
      answers: params.answers.map((a) => ({ question: a.question, answer: a.answer })),
    },
  }).then((data) => ({
    briefId: data?.briefId ?? '',
    outline: data?.outline ?? '',
    tags: Array.isArray(data?.tags) ? data!.tags! : [],
    degraded: data?.degraded ?? false,
  }));
}

// ---- P1-3 咨询后纪要（幂等）POST /ai/coaching/summary ----

/** 咨询后纪要待办项。 */
export interface SummaryTodo {
  /** 待办标题。 */
  title: string;
  /** 是否完成。 */
  done: boolean;
}

/** 咨询后纪要入参。 */
export interface SummaryParams {
  /** 咨询订单 id。 */
  orderId: string;
}

/** 咨询后纪要出参 data。 */
export interface SummaryResult {
  /** 纪要 id。 */
  summaryId: string;
  /** 行动纪要文本。 */
  summary: string;
  /** 待办清单。 */
  todos: SummaryTodo[];
  /** 是否降级兜底。 */
  degraded: boolean;
}

/**
 * P1-3 咨询后纪要（幂等）。
 * 错误码：4004 订单不存在 / 4003 非本人 / 4711 咨询未结束 / 4712 无消息。
 * 出参可选判空：todos 默认 []。
 */
export function coachingSummary(params: SummaryParams): Promise<SummaryResult> {
  return request<Partial<SummaryResult> | undefined>({
    url: '/ai/coaching/summary',
    method: 'POST',
    data: { orderId: params.orderId },
  }).then((data) => ({
    summaryId: data?.summaryId ?? '',
    summary: data?.summary ?? '',
    todos: Array.isArray(data?.todos)
      ? data!.todos!.map((t) => ({ title: t?.title ?? '', done: t?.done ?? false }))
      : [],
    degraded: data?.degraded ?? false,
  }));
}

// ---- P1-4 辅导师智能匹配 POST /ai/coaching/match ----

/** 辅导师匹配诉求长度上限（后端 4005 超长）。 */
export const MATCH_DEMAND_MAX = 500;

/** 辅导师匹配入参（demand ≤500 字，topN 默认 3，1~10）。 */
export interface MatchParams {
  /** 咨询诉求描述，≤500 字。 */
  demand: string;
  /** 返回条数，默认 3，1~10（可选）。 */
  topN?: number;
}

/** 单条匹配结果。 */
export interface MatchItem {
  /** 辅导师 id。 */
  coachId: string;
  /** 辅导师姓名。 */
  name: string;
  /** 匹配度 0~100。 */
  matchScore: number;
  /** 匹配理由。 */
  reason: string;
}

/** 辅导师匹配出参 data。 */
export interface MatchResult {
  /** 匹配列表。 */
  matches: MatchItem[];
  /** 是否降级兜底。 */
  degraded: boolean;
}

/**
 * P1-4 辅导师智能匹配。
 * 错误码：4005 demand 超长 / 4713 无可用辅导师。
 * 出参可选判空：matches 默认 []。
 */
export function coachingMatch(params: MatchParams): Promise<MatchResult> {
  return request<Partial<MatchResult> | undefined>({
    url: '/ai/coaching/match',
    method: 'POST',
    data: {
      demand: params.demand,
      ...(params.topN != null ? { topN: params.topN } : {}),
    },
  }).then((data) => ({
    matches: Array.isArray(data?.matches)
      ? data!.matches!.map((m) => ({
          coachId: m?.coachId ?? '',
          name: m?.name ?? '',
          matchScore: m?.matchScore ?? 0,
          reason: m?.reason ?? '',
        }))
      : [],
    degraded: data?.degraded ?? false,
  }));
}

// ============================================================
// AI 能力拓展 · P2 三接口（协作分析 / 简历生成 / 深度报告扩展章节）
// -------------------------------------------------------------
// 权威 VO 来源：Batch P2-Step3 后端交付契约（PM 门禁核验通过）。
// 请求地址与后端路由完全一致：
//   /ai/collab/analyze、/ai/resume/generate、/ai/report/chapter
// 错误码（AiPlusBizCode）：
//   9001 游客配额 / 9002 登录配额 / 4515 非会员 / 4516 敏感词 /
//   4517 非 DEEP 报告 / 4004 不存在 / 4003 越权。
// 铁律：字段严格对齐 VO、全字段判空归一化、degraded=true 不白屏、无业务逻辑前置。
// ============================================================

// ---- P2-1 团队协作分析 POST /ai/collab/analyze ----

/** 协作分析成员（name 可选，mbtiType 必填）。 */
export interface CollabMember {
  /** 成员昵称（可选）。 */
  name?: string;
  /** MBTI 类型，如 INTJ。 */
  mbtiType: string;
}

/** 协作分析入参（members 2~6 人，前端做基础数量提示，业务校验以后端为准）。 */
export interface CollabAnalyzeParams {
  /** 参与成员，2~6 人。 */
  members: CollabMember[];
  /** 协作场景（可选，如"项目协作"）。 */
  scene?: string;
  /** 仅登录用户 save=true 才落库；游客不落库（可选）。 */
  save?: boolean;
}

/** 协作两两配对分析。 */
export interface CollabPair {
  /** 成员 A 标识（name 或 mbtiType）。 */
  a: string;
  /** 成员 B 标识。 */
  b: string;
  /** 协同度 0~100。 */
  synergy: number;
  /** 配对建议。 */
  advice: string;
}

/** 协作分析出参 data。 */
export interface CollabAnalyzeResult {
  /** 分析 id（游客/未保存时不返回）。 */
  analysisId?: string;
  /** 团队总览。 */
  summary: string;
  /** 两两配对结果。 */
  pairs: CollabPair[];
  /** 风险提示。 */
  risks: string[];
  /** 是否降级兜底。degraded=true 仍正常展示 summary/pairs/risks。 */
  degraded: boolean;
}

/**
 * P2-1 团队协作分析。
 * 成功/降级均 code=200；错误码：9001 游客配额超限 / 9002 登录配额超限。
 * 出参可选判空：analysisId 可空、pairs/risks 默认 []。
 */
export function collabAnalyze(params: CollabAnalyzeParams): Promise<CollabAnalyzeResult> {
  return request<Partial<CollabAnalyzeResult> | undefined>({
    url: '/ai/collab/analyze',
    method: 'POST',
    data: {
      members: params.members.map((m) => ({
        ...(m.name ? { name: m.name } : {}),
        mbtiType: m.mbtiType,
      })),
      ...(params.scene ? { scene: params.scene } : {}),
      ...(params.save != null ? { save: params.save } : {}),
    },
  }).then((data) => ({
    analysisId: data?.analysisId,
    summary: data?.summary ?? '',
    pairs: Array.isArray(data?.pairs)
      ? data!.pairs!.map((p) => ({
          a: p?.a ?? '',
          b: p?.b ?? '',
          synergy: p?.synergy ?? 0,
          advice: p?.advice ?? '',
        }))
      : [],
    risks: Array.isArray(data?.risks) ? data!.risks!.filter((r): r is string => r != null) : [],
    degraded: data?.degraded ?? false,
  }));
}

// ---- P2-2 简历/求职信生成 POST /ai/resume/generate（会员专享）----

/** 生成类型：resume 简历 / coverLetter 求职信（默认 resume）。 */
export type ResumeGenerateType = 'resume' | 'coverLetter';

/** 用户履历经历项。 */
export interface ResumeExperience {
  /** 角色/岗位。 */
  role: string;
  /** 经历描述。 */
  description: string;
}

/** 用户履历资料。 */
export interface ResumeProfile {
  /** 教育背景。 */
  education: string;
  /** 技能列表。 */
  skills: string[];
  /** 工作/项目经历。 */
  experiences: ResumeExperience[];
}

/** 简历生成入参。 */
export interface ResumeGenerateParams {
  /** 目标职业 id，字符串。 */
  careerId: string;
  /** 生成类型，默认 resume（可选）。 */
  type?: ResumeGenerateType;
  /** 用户履历资料。 */
  profile: ResumeProfile;
}

/** 生成文档分节。 */
export interface ResumeSection {
  /** 分节标题。 */
  title: string;
  /** 分节正文。 */
  body: string;
}

/** 简历生成出参 data。 */
export interface ResumeGenerateResult {
  /** 文档 id。 */
  docId: string;
  /** 全文初稿。 */
  content: string;
  /** 分节内容。 */
  sections: ResumeSection[];
  /** 是否降级兜底。degraded=true 仍正常展示 content/sections。 */
  degraded: boolean;
}

/**
 * P2-2 简历/求职信生成（会员专享）。
 * 成功/降级均 code=200；错误码：4515 非会员/过期 / 4516 敏感词 / 4004 职业不存在。
 * 出参可选判空：sections 默认 []。
 */
export function resumeGenerate(params: ResumeGenerateParams): Promise<ResumeGenerateResult> {
  return request<Partial<ResumeGenerateResult> | undefined>({
    url: '/ai/resume/generate',
    method: 'POST',
    data: {
      careerId: params.careerId,
      type: params.type ?? 'resume',
      profile: {
        education: params.profile.education,
        skills: Array.isArray(params.profile.skills) ? params.profile.skills : [],
        experiences: Array.isArray(params.profile.experiences)
          ? params.profile.experiences.map((e) => ({
              role: e.role,
              description: e.description,
            }))
          : [],
      },
    },
  }).then((data) => ({
    docId: data?.docId ?? '',
    content: data?.content ?? '',
    sections: Array.isArray(data?.sections)
      ? data!.sections!.map((s) => ({ title: s?.title ?? '', body: s?.body ?? '' }))
      : [],
    degraded: data?.degraded ?? false,
  }));
}

// ============================================================
// P3 §4.1 AI 模拟面试（会员专享，需登录）
// 路由：POST /ai/interview/start、POST /ai/interview/:interviewId/answer、
//       GET /ai/interview/:interviewId/report
// 错误码：4515 非会员 / 4004 会话不存在 / 4003 越权 / 4005 answer 空 / 4520 已结束不可再答。
// ============================================================

/** 面试难度。 */
export type InterviewDifficulty = 'easy' | 'medium' | 'hard';

/** §4.1 开始面试入参。 */
export interface InterviewStartParams {
  /** 目标职业 id（career.id），字符串。 */
  careerId: string;
  /** 难度，默认 medium。 */
  difficulty?: InterviewDifficulty;
}

/** §4.1 开始面试出参 data。 */
export interface InterviewStartResult {
  /** 面试会话 id。 */
  interviewId: string;
  /** 首个面试问题。 */
  firstQuestion: string;
}

/** §4.1 提交作答入参。 */
export interface InterviewAnswerParams {
  /** 本轮作答内容（非空，后端 4005；超长后端校验）。 */
  answer: string;
}

/** §4.1 作答评分出参 data。 */
export interface InterviewAnswerResult {
  /** 本轮评分 0~100。 */
  score: number;
  /** 本轮反馈。 */
  feedback: string;
  /** 下一题；面试结束时为空。 */
  nextQuestion?: string;
  /** 面试是否已结束。 */
  finished: boolean;
  /** 是否走了降级兜底。 */
  degraded: boolean;
}

/** §4.1 面试报告维度评分。 */
export interface InterviewDimension {
  name: string;
  score: number;
}

/** §4.1 面试报告出参 data。 */
export interface InterviewReportResult {
  /** 综合总分 0~100。 */
  overallScore: number;
  /** 各维度评分。 */
  dimensions: InterviewDimension[];
  /** 改进建议。 */
  suggestions: string[];
}

/**
 * §4.1 开始 AI 模拟面试（会员专享）。
 * 错误码：4515 非会员 / 4004 职业不存在 / 4005 入参。出参判空归一化。
 */
export function interviewStart(params: InterviewStartParams): Promise<InterviewStartResult> {
  return request<Partial<InterviewStartResult> | undefined>({
    url: '/ai/interview/start',
    method: 'POST',
    data: {
      careerId: params.careerId,
      ...(params.difficulty ? { difficulty: params.difficulty } : {}),
    },
  }).then((data) => ({
    interviewId: data?.interviewId ?? '',
    firstQuestion: data?.firstQuestion ?? '',
  }));
}

/**
 * §4.1 提交面试作答。
 * 错误码：4520 已结束 / 4003 越权 / 4004 会话不存在 / 4005 answer 空。
 * degraded=true 仍正常展示 feedback，不视为错误。出参判空归一化。
 */
export function interviewAnswer(
  interviewId: string,
  params: InterviewAnswerParams,
): Promise<InterviewAnswerResult> {
  return request<Partial<InterviewAnswerResult> | undefined>({
    url: `/ai/interview/${interviewId}/answer`,
    method: 'POST',
    data: { answer: params.answer },
  }).then((data) => ({
    score: typeof data?.score === 'number' ? data.score : 0,
    feedback: data?.feedback ?? '',
    nextQuestion: data?.nextQuestion,
    finished: data?.finished ?? false,
    degraded: data?.degraded ?? false,
  }));
}

/**
 * §4.1 获取面试报告。
 * 错误码：4003 越权 / 4004 会话不存在。出参判空：dimensions/suggestions 默认 []。
 */
export function interviewReport(interviewId: string): Promise<InterviewReportResult> {
  return request<Partial<InterviewReportResult> | undefined>({
    url: `/ai/interview/${interviewId}/report`,
    method: 'GET',
  }).then((data) => ({
    overallScore: typeof data?.overallScore === 'number' ? data.overallScore : 0,
    dimensions: Array.isArray(data?.dimensions)
      ? data!.dimensions!.map((d) => ({
          name: d?.name ?? '',
          score: typeof d?.score === 'number' ? d.score : 0,
        }))
      : [],
    suggestions: Array.isArray(data?.suggestions)
      ? data!.suggestions!.filter((s): s is string => s != null)
      : [],
  }));
}

// ============================================================
// P3 §4.2 AI 面试题库（list 登录可见 / score 会员专享）
// 路由：GET /ai/interview/questions、POST /ai/interview/questions/:qId/score
// 错误码：4515 非会员 / 4004 题不存在 / 4005 空参。
// ============================================================

/** §4.2 题库列表查询入参。 */
export interface QuestionListParams {
  /** 职业 id（必填），字符串。 */
  careerId: string;
  /** 难度（可选）。 */
  difficulty?: InterviewDifficulty;
  /** 页码，从 1 开始。 */
  page?: number;
  /** 每页条数。 */
  pageSize?: number;
}

/** §4.2 题库列表项。 */
export interface QuestionItem {
  /** 题目 id。 */
  qId: string;
  /** 题干。 */
  question: string;
  /** 标签。 */
  tags: string[];
}

/** §4.2 题库列表出参 data。 */
export interface QuestionListResult {
  list: QuestionItem[];
  total: number;
}

/** §4.2 单题评分入参。 */
export interface QuestionScoreParams {
  /** 用户作答（非空，后端 4005；超长后端校验）。 */
  answer: string;
}

/** §4.2 单题评分出参 data。 */
export interface QuestionScoreResult {
  /** 评分 0~100。 */
  score: number;
  /** 反馈。 */
  feedback: string;
  /** 参考答案。 */
  sampleAnswer: string;
}

/**
 * §4.2 题库列表（登录可见）。
 * 错误码：4001 未登录 / 4005 入参。出参判空：list 默认 []、total 默认 0。
 */
export function interviewQuestions(params: QuestionListParams): Promise<QuestionListResult> {
  return request<Partial<QuestionListResult> | undefined>({
    url: '/ai/interview/questions',
    method: 'GET',
    params: {
      careerId: params.careerId,
      ...(params.difficulty ? { difficulty: params.difficulty } : {}),
      ...(params.page ? { page: params.page } : {}),
      ...(params.pageSize ? { pageSize: params.pageSize } : {}),
    },
  }).then((data) => ({
    list: Array.isArray(data?.list)
      ? data!.list!.map((q) => ({
          qId: q?.qId ?? '',
          question: q?.question ?? '',
          tags: Array.isArray(q?.tags) ? q!.tags!.filter((t): t is string => t != null) : [],
        }))
      : [],
    total: typeof data?.total === 'number' ? data.total : 0,
  }));
}

/**
 * §4.2 单题评分（会员专享）。
 * 错误码：4515 非会员 / 4004 题不存在 / 4005 answer 空。出参判空归一化。
 */
export function interviewQuestionScore(
  qId: string,
  params: QuestionScoreParams,
): Promise<QuestionScoreResult> {
  return request<Partial<QuestionScoreResult> | undefined>({
    url: `/ai/interview/questions/${qId}/score`,
    method: 'POST',
    data: { answer: params.answer },
  }).then((data) => ({
    score: typeof data?.score === 'number' ? data.score : 0,
    feedback: data?.feedback ?? '',
    sampleAnswer: data?.sampleAnswer ?? '',
  }));
}

// ============================================================
// P3 §4.3 AI 职业热点日报（登录可见，内容由 scheduler 生成）
// 路由：GET /ai/daily-brief、PUT /ai/daily-brief/subscription
// 错误码：4001 未登录 / 4004 当日无日报 / 4005 date 格式错。
// ============================================================

/** §4.3 日报条目。 */
export interface DailyBriefItem {
  /** 标题。 */
  title: string;
  /** 摘要。 */
  summary: string;
  /** 关联职业 id（可选）。 */
  careerId?: string;
}

/** §4.3 日报出参 data。 */
export interface DailyBriefResult {
  /** 日报 id。 */
  briefId: string;
  /** 日期 YYYY-MM-DD。 */
  date: string;
  /** 日报条目。 */
  items: DailyBriefItem[];
}

/** §4.3 订阅设置入参 = 出参。 */
export interface SubscriptionParams {
  /** 是否开启订阅。 */
  enabled: boolean;
  /** 订阅品类。 */
  categories: string[];
}

/** §4.3 订阅设置出参 data。 */
export type SubscriptionResult = SubscriptionParams;

/**
 * §4.3 获取我的职业热点日报（登录可见）。
 * 错误码：4001 未登录 / 4004 当日无日报 / 4005 date 格式错。出参判空：items 默认 []。
 * @param date 可选 YYYY-MM-DD，缺省今日。
 */
export function dailyBrief(date?: string): Promise<DailyBriefResult> {
  return request<Partial<DailyBriefResult> | undefined>({
    url: '/ai/daily-brief',
    method: 'GET',
    params: date ? { date } : undefined,
  }).then((data) => ({
    briefId: data?.briefId ?? '',
    date: data?.date ?? (date ?? ''),
    items: Array.isArray(data?.items)
      ? data!.items!.map((it) => ({
          title: it?.title ?? '',
          summary: it?.summary ?? '',
          careerId: it?.careerId,
        }))
      : [],
  }));
}

/**
 * §4.3 日报订阅设置（幂等，PUT）。
 * 错误码：4001 未登录 / 4005 入参。出参判空：categories 默认 []。
 */
export function updateDailyBriefSubscription(
  params: SubscriptionParams,
): Promise<SubscriptionResult> {
  return request<Partial<SubscriptionResult> | undefined>({
    url: '/ai/daily-brief/subscription',
    method: 'PUT',
    data: {
      enabled: params.enabled,
      categories: Array.isArray(params.categories) ? params.categories : [],
    },
  }).then((data) => ({
    enabled: data?.enabled ?? false,
    categories: Array.isArray(data?.categories)
      ? data!.categories!.filter((c): c is string => c != null)
      : [],
  }));
}

// ============================================================
// P3 §4.4 AI 辅助职业库生产（后台管理员，前缀 /admin/ai/career，走 admin token）
// 路由：POST /admin/ai/career/generate、GET /admin/ai/career/drafts、
//       POST /admin/ai/career/drafts/:draftId/review
// 错误码：4005 参数/招聘源被拒 / 4460 草稿不存在 / 4461 重复职业名 /
//         4462 已审核 / 4030 管理员越权。
// 注意：refSources 仅权威数据源，严禁招聘平台（后端硬校验命中 4005）。
// ============================================================

/** §4.4 生成职业草稿入参。 */
export interface CareerGenerateParams {
  /** 职业名。 */
  name: string;
  /** 职业品类。 */
  category: string;
  /** 权威参考来源（可选，严禁招聘平台，后端 4005）。 */
  refSources?: string[];
}

/** §4.4 生成职业草稿出参 data（career/skills 结构由后端动态给出，归一化为宽松结构）。 */
export interface CareerGenerateResult {
  /** 草稿 id。 */
  draftId: string;
  /** 生成的职业草稿对象。 */
  career: Record<string, unknown>;
  /** 生成的技能列表。 */
  skills: Record<string, unknown>[];
}

/** §4.4 草稿状态：0 待审 / 1 通过 / 2 拒绝。 */
export type DraftStatus = 0 | 1 | 2;

/** §4.4 草稿列表查询入参。 */
export interface DraftListParams {
  /** 状态过滤（可选）。 */
  status?: DraftStatus;
  /** 页码，从 1 开始。 */
  page?: number;
  /** 每页条数（最大 50）。 */
  pageSize?: number;
}

/** §4.4 草稿列表项。 */
export interface CareerDraftItem {
  /** 草稿 id。 */
  draftId: string;
  /** 职业名。 */
  name: string;
  /** 品类。 */
  category: string;
  /** 状态 0/1/2。 */
  status: number;
  /** 审核备注（可能为 null）。 */
  reviewRemark: string | null;
  /** approve 同步的正式职业 id（可能为 null）。 */
  syncedCareerId: string | null;
  /** 创建时间 ISO8601。 */
  createdAt: string;
}

/** §4.4 草稿列表出参 data。 */
export interface DraftListResult {
  list: CareerDraftItem[];
  total: number;
}

/** §4.4 审核动作。 */
export type ReviewAction = 'approve' | 'reject';

/** §4.4 审核草稿入参。 */
export interface ReviewParams {
  /** 审核动作。 */
  action: ReviewAction;
  /** 审核备注（可选）。 */
  remark?: string;
}

/** §4.4 审核结果出参 data。 */
export interface ReviewResult {
  /** 审核后状态 1 通过 / 2 拒绝。 */
  status: number;
  /** approve 时同步的正式职业 id（可选）。 */
  syncedCareerId?: string;
}

/**
 * §4.4 AI 生成职业草稿（后台管理员，走 admin token）。
 * 错误码：4005 参数/招聘源被拒 / 4461 重复职业名 / 4030 越权。出参判空归一化。
 */
export function careerGenerate(params: CareerGenerateParams): Promise<CareerGenerateResult> {
  return adminRequest<Partial<CareerGenerateResult> | undefined>({
    url: '/admin/ai/career/generate',
    method: 'POST',
    data: {
      name: params.name,
      category: params.category,
      ...(params.refSources && params.refSources.length ? { refSources: params.refSources } : {}),
    },
  }).then((data) => ({
    draftId: data?.draftId ?? '',
    career: (data?.career as Record<string, unknown>) ?? {},
    skills: Array.isArray(data?.skills) ? (data!.skills as Record<string, unknown>[]) : [],
  }));
}

/**
 * §4.4 草稿列表（后台管理员，走 admin token）。
 * 错误码：4030 越权。出参判空：list 默认 []、total 默认 0。
 */
export function careerDrafts(params?: DraftListParams): Promise<DraftListResult> {
  return adminRequest<Partial<DraftListResult> | undefined>({
    url: '/admin/ai/career/drafts',
    method: 'GET',
    params: {
      ...(params?.status !== undefined ? { status: params.status } : {}),
      ...(params?.page ? { page: params.page } : {}),
      ...(params?.pageSize ? { pageSize: params.pageSize } : {}),
    },
  }).then((data) => ({
    list: Array.isArray(data?.list)
      ? data!.list!.map((d) => ({
          draftId: d?.draftId ?? '',
          name: d?.name ?? '',
          category: d?.category ?? '',
          status: typeof d?.status === 'number' ? d.status : 0,
          reviewRemark: d?.reviewRemark ?? null,
          syncedCareerId: d?.syncedCareerId ?? null,
          createdAt: d?.createdAt ?? '',
        }))
      : [],
    total: typeof data?.total === 'number' ? data.total : 0,
  }));
}

/**
 * §4.4 审核职业草稿（后台管理员，走 admin token）。
 * 错误码：4005 参数 / 4460 草稿不存在 / 4462 已审核 / 4030 越权。出参判空归一化。
 */
export function careerDraftReview(draftId: string, params: ReviewParams): Promise<ReviewResult> {
  return adminRequest<Partial<ReviewResult> | undefined>({
    url: `/admin/ai/career/drafts/${draftId}/review`,
    method: 'POST',
    data: {
      action: params.action,
      ...(params.remark !== undefined ? { remark: params.remark } : {}),
    },
  }).then((data) => ({
    status: typeof data?.status === 'number' ? data.status : 0,
    syncedCareerId: data?.syncedCareerId,
  }));
}

// ---- P2-3 深度报告扩展章节 POST /ai/report/chapter（DEEP 报告专享）----

/** 扩展章节聚焦方向。 */
export type ReportChapterFocus = 'career' | 'relationship' | 'growth' | 'leadership';

/** 深度报告扩展章节入参。 */
export interface ReportChapterParams {
  /** 报告 id，字符串。 */
  reportId: string;
  /** 聚焦方向：职业/关系/成长/领导力。 */
  focus: ReportChapterFocus;
  /** 关联职业 id（可选，focus=career 时可用）。 */
  focusCareerId?: string;
}

/** 深度报告扩展章节出参 data。 */
export interface ReportChapterResult {
  /** 章节 id。 */
  chapterId: string;
  /** 归属报告 id。 */
  reportId: string;
  /** 章节标题。 */
  title: string;
  /** 章节段落。 */
  paragraphs: string[];
  /** 是否降级兜底。degraded=true 仍正常展示 paragraphs。 */
  degraded: boolean;
}

/**
 * P2-3 深度报告扩展章节（DEEP 报告专享）。
 * 成功/降级均 code=200；错误码：4004 报告不存在 / 4003 越权 / 4517 非 DEEP 报告。
 * 出参可选判空：paragraphs 默认 []。
 */
export function reportChapter(params: ReportChapterParams): Promise<ReportChapterResult> {
  return request<Partial<ReportChapterResult> | undefined>({
    url: '/ai/report/chapter',
    method: 'POST',
    data: {
      reportId: params.reportId,
      focus: params.focus,
      ...(params.focusCareerId ? { focusCareerId: params.focusCareerId } : {}),
    },
  }).then((data) => ({
    chapterId: data?.chapterId ?? '',
    reportId: data?.reportId ?? params.reportId,
    title: data?.title ?? '',
    paragraphs: Array.isArray(data?.paragraphs)
      ? data!.paragraphs!.filter((p): p is string => p != null)
      : [],
    degraded: data?.degraded ?? false,
  }));
}