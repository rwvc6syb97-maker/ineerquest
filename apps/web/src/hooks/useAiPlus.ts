/**
 * AI 能力拓展 · P0 三接口 hooks（L-P0-1/2/3）
 * -------------------------------------------------------------
 * 统一封装 loading / 错误 / 降级 三态，错误码按契约 v2.0 分流。
 * 全部走真实后端接口，禁止 mock 兜底掩盖契约；degraded=true 正常展示内容 + 轻量降级提示。
 */
import { useCallback, useRef, useState } from 'react';
import { BizCode } from '@innerquest/shared';
import { ApiError } from '../api';
import { aiPlusApi } from '../api';
import type {
  PlainTalkParams,
  PlainTalkResult,
  PersonalizedChatParams,
  CalibrationCheckResult,
  SubmitCalibrationParams,
  CalibrationSubmitResult,
  GrowthPlanParams,
  GrowthPlanResult,
  PreBriefParams,
  PreBriefResult,
  SummaryParams,
  SummaryResult,
  MatchParams,
  MatchResult,
  CollabAnalyzeParams,
  CollabAnalyzeResult,
  ResumeGenerateParams,
  ResumeGenerateResult,
  ReportChapterParams,
  ReportChapterResult,
  InterviewStartParams,
  InterviewStartResult,
  InterviewAnswerParams,
  InterviewAnswerResult,
  InterviewReportResult,
  QuestionListParams,
  QuestionListResult,
  QuestionScoreParams,
  QuestionScoreResult,
  DailyBriefResult,
  SubscriptionParams,
  SubscriptionResult,
  CareerGenerateParams,
  CareerGenerateResult,
  DraftListParams,
  DraftListResult,
  ReviewParams,
  ReviewResult,
} from '../api/modules/ai-plus.api';
import {
  PERSONALIZED_CONTENT_MAX,
  MATCH_DEMAND_MAX,
  AiPlusBizCode,
} from '../api/modules/ai-plus.api';

/** 从未知异常提取业务码（ApiError.code）。 */
function toApiCode(err: unknown): number | undefined {
  return err instanceof ApiError ? err.code : undefined;
}

/** 从未知异常提取展示文案，优先后端 message，不硬编码业务报错。 */
function toApiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

// ============================================================
// L-P0-1 报告人话翻译
// ============================================================

export interface UsePlainTalkResult {
  data: PlainTalkResult | null;
  loading: boolean;
  /** 错误文案（优先后端 message）。 */
  error: string | null;
  /** 错误业务码：4203 / 4302 / 4511 等。 */
  errorCode: number | undefined;
  /** 是否走了降级兜底（内容仍可展示 + 轻量提示）。 */
  degraded: boolean;
  run: (params: PlainTalkParams) => Promise<void>;
  reset: () => void;
}

/** L-P0-1 报告人话翻译 hook。 */
export function usePlainTalk(): UsePlainTalkResult {
  const [data, setData] = useState<PlainTalkResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);

  const run = useCallback(async (params: PlainTalkParams) => {
    if (!params.reportId) return;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
   try {
      const res = await aiPlusApi.plainTalk(params);
      // degraded=true 时仍正常展示 plainText，不视为错误
      setData(res);
    } catch (err) {
      setErrorCode(toApiCode(err));
      setError(toApiMessage(err, '生成人话解读失败，请稍后重试'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setErrorCode(undefined);
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    errorCode,
    degraded: data?.degraded ?? false,
    run,
    reset,
  };
}

// ============================================================
// L-P0-2 深度个性化问答（SSE 流式）
// ============================================================

export interface UsePersonalizedChatResult {
  /** 当前流式累积文本。 */
  answer: string;
  /** 流式进行中。 */
  streaming: boolean;
  /** 本轮是否降级（degraded=true 时展示轻量提示）。 */
  degraded: boolean;
  /** 错误文案（优先后端 message）。 */
  error: string | null;
  /** 错误业务码：4504 超长 / 4502 轮次上限 / 4501 配额用尽 等。 */
  errorCode: number | undefined;
  /** 发送消息（前端先做 ≤2000 字长度校验）。 */
  send: (params: PersonalizedChatParams) => Promise<void>;
  /** 中断当前流。 */
  abort: () => void;
  reset: () => void;
}

/** L-P0-2 深度个性化问答 hook（SSE 打字机）。 */
export function usePersonalizedChat(): UsePersonalizedChatResult {
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  },[]);

  const send = useCallback(async (params: PersonalizedChatParams) => {
    const content = params.content?.trim() ?? '';
    if (!content) return;
    // 前端基础长度校验（业务校验仍以后端 4504 为准）
    if (content.length > PERSONALIZED_CONTENT_MAX) {
      setError(`消息内容超长，最多 ${PERSONALIZED_CONTENT_MAX} 字`);
      setErrorCode(BizCode.AI_CONTENT_TOO_LONG);
      return;
    }
    setAnswer('');
    setError(null);
    setErrorCode(undefined);
    setDegraded(false);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    await aiPlusApi.personalizedChat(
      { convNo: params.convNo, content },
      {
        onDelta: (delta, isDegraded) => {
          setAnswer((prev) => prev + delta);
          if (isDegraded) setDegraded(true);
        },
        onDone: () => {
          setStreaming(false);
          abortRef.current = null;
        },
        onError: (err) => {
          setErrorCode(err.code);
          setError(err.message || 'AI 服务异常');
          setStreaming(false);
          abortRef.current = null;
        },
      },
      controller.signal,
    );
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAnswer('');
    setStreaming(false);
    setDegraded(false);
    setError(null);
    setErrorCode(undefined);
  }, []);

  return { answer, streaming, degraded, error, errorCode, send, abort, reset };
}

// ============================================================
// L-P0-3 追问式测评校准
// ============================================================

export interface UseCalibrationResult {
  /** GET 判定结果（含追问题目）。 */
  check: CalibrationCheckResult | null;
  /** POST 提交结果。 */
  submitResult: CalibrationSubmitResult | null;
  loading: boolean;
  submitting: boolean;
  /** 错误文案（优先后端 message）。 */
  error: string | null;
  /** 错误业务码。 */
  errorCode: number | undefined;
  /** 无需校准（4514）：友好提示，非报错弹窗。 */
  noNeed: boolean;
  /** 已完成校准（4090 重复提交）：提示并可回显。 */
  alreadyCalibrated: boolean;
  loadCheck: (resultId: string) => Promise<void>;
  submit: (resultId: string, params: SubmitCalibrationParams) => Promise<void>;
  reset: () => void;
}

/** L-P0-3 追问式测评校准 hook。 */
export function useCalibration(): UseCalibrationResult {
  const [check, setCheck] = useState<CalibrationCheckResult | null>(null);
  const [submitResult, setSubmitResult] = useState<CalibrationSubmitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);
  const [noNeed, setNoNeed] = useState(false);
  const [alreadyCalibrated, setAlreadyCalibrated] = useState(false);

  const loadCheck = useCallback(async (resultId: string) => {
    if (!resultId) return;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    setNoNeed(false);
    try {
      const res = await aiPlusApi.checkCalibration(resultId);
      setCheck(res);
      // 后端 GET 返回 calibrated=true 时也视为已校准（友好提示）
      if (res.calibrated) setAlreadyCalibrated(true);
    } catch (err) {
      const code = toApiCode(err);
      setErrorCode(code);
      // 4514 无临界维度 → 友好提示，非报错
      if (code === BizCode.NO_NEED_CALIBRATE) {
        setNoNeed(true);
        setCheck(null);
      } else {
        setError(toApiMessage(err, '校准判定失败，请稍后重试'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const submit = useCallback(async (resultId: string, params: SubmitCalibrationParams) => {
    if (!resultId) return;
    setSubmitting(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const res = await aiPlusApi.submitCalibration(resultId, params);
      setSubmitResult(res);
    } catch (err) {
      const code = toApiCode(err);
      setErrorCode(code);
      // 4090 已完成校准 → 提示并回显（非报错弹窗）
      if (code === BizCode.DUPLICATE_SUBMIT) {
        setAlreadyCalibrated(true);
      } else if (code === BizCode.NO_NEED_CALIBRATE) {
        setNoNeed(true);
      } else {
        setError(toApiMessage(err, '提交校准失败，请稍后重试'));
      }
    } finally {
      setSubmitting(false);
    }
  }, []);

  const reset = useCallback(() => {
    setCheck(null);
    setSubmitResult(null);
    setLoading(false);
    setSubmitting(false);
    setError(null);
    setErrorCode(undefined);
    setNoNeed(false);
    setAlreadyCalibrated(false);
  }, []);

  return {
    check,
    submitResult,
    loading,
    submitting,
    error,
    errorCode,
    noNeed,
    alreadyCalibrated,
    loadCheck,
    submit,
    reset,
  };
}

// ============================================================
// P1-1 动态成长计划（会员专享）
// ============================================================

export interface UseGrowthPlanResult {
  data: GrowthPlanResult | null;
  loading: boolean;
  /** 错误文案（优先后端 message）。 */
  error: string | null;
  /** 错误业务码：4515 / 4004 / 4005 / 5002 / 5003 等。 */
  errorCode: number | undefined;
  /** 非会员（4515）：引导开通会员，非报错弹窗。 */
  memberOnly: boolean;
  /** degraded=true（规则版）仍正常展示 weeks，仅轻提示。 */
  degraded: boolean;
  run: (params: GrowthPlanParams) => Promise<void>;
  reset: () => void;
}

/** P1-1 动态成长计划 hook。 */
export function useGrowthPlan(): UseGrowthPlanResult {
  const [data, setData] = useState<GrowthPlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);
  const [memberOnly, setMemberOnly] = useState(false);

  const run = useCallback(async (params: GrowthPlanParams) => {
    if (!params.careerId) return;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    setMemberOnly(false);
    try {
      const res = await aiPlusApi.growthPlan(params);
      // degraded=true 时仍正常展示 weeks，不视为错误
      setData(res);
    } catch (err) {
      const code = toApiCode(err);
      setErrorCode(code);
      setData(null);
      // 4515 非会员 → 引导开通会员（不吞错，仍保留后端 message）
      if (code === AiPlusBizCode.MEMBER_ONLY) {
        setMemberOnly(true);
        setError(toApiMessage(err, 'AI 成长计划为会员专享，请先开通会员'));
      } else {
        setError(toApiMessage(err, '生成成长计划失败，请稍后重试'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setErrorCode(undefined);
    setMemberOnly(false);
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    errorCode,
    memberOnly,
    degraded: data?.degraded ?? false,
    run,
    reset,
  };
}

// ============================================================
// P1-2 咨询前梳理（幂等）
// ============================================================

export interface UsePreBriefResult {
  data: PreBriefResult | null;
  loading: boolean;
  error: string | null;
  /** 错误业务码：4004 / 4003 / 4710 / 4005 等。 */
  errorCode: number | undefined;
  /** 是否降级兜底。 */
  degraded: boolean;
  run: (params: PreBriefParams) => Promise<void>;
  reset: () => void;
}

/** P1-2 咨询前梳理 hook。 */
export function usePreBrief(): UsePreBriefResult {
  const [data, setData] = useState<PreBriefResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);

  const run = useCallback(async (params: PreBriefParams) => {
    if (!params.orderId || !params.answers?.length) return;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const res = await aiPlusApi.preBrief(params);
      setData(res);
    } catch (err) {
      setErrorCode(toApiCode(err));
      setError(toApiMessage(err, '生成咨询提纲失败，请稍后重试'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setErrorCode(undefined);
    setLoading(false);
  }, []);

  return { data, loading, error, errorCode, degraded: data?.degraded ?? false, run, reset };
}

// ============================================================
// P1-3 咨询后纪要（幂等）
// ============================================================

export interface UseCoachingSummaryResult {
  data: SummaryResult | null;
  loading: boolean;
  error: string | null;
  /** 错误业务码：4004 / 4003 / 4711 / 4712 等。 */
  errorCode: number | undefined;
  /** 是否降级兜底。 */
  degraded: boolean;
  run: (params: SummaryParams) => Promise<void>;
  reset: () => void;
}

/** P1-3 咨询后纪要 hook。 */
export function useCoachingSummary(): UseCoachingSummaryResult {
  const [data, setData] = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);

  const run = useCallback(async (params: SummaryParams) => {
    if (!params.orderId) return;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const res = await aiPlusApi.coachingSummary(params);
      setData(res);
    } catch (err) {
      setErrorCode(toApiCode(err));
      setError(toApiMessage(err, '生成咨询纪要失败，请稍后重试'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setErrorCode(undefined);
    setLoading(false);
  }, []);

  return { data, loading, error, errorCode, degraded: data?.degraded ?? false, run, reset };
}

// ============================================================
// P1-4 辅导师智能匹配
// ============================================================

export interface UseCoachingMatchResult {
  data: MatchResult | null;
  loading: boolean;
  error: string | null;
  /** 错误业务码：4005 超长 / 4713 无可用辅导师。 */
  errorCode: number | undefined;
  /** 暂无可用辅导师（4713）：引导型提示，非报错弹窗。 */
  noCoach: boolean;
  /** 是否降级兜底。 */
  degraded: boolean;
  run: (params: MatchParams) => Promise<void>;
  reset: () => void;
}

/** P1-4 辅导师智能匹配 hook。 */
export function useCoachingMatch(): UseCoachingMatchResult {
  const [data, setData] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);
  const [noCoach, setNoCoach] = useState(false);

  const run = useCallback(async (params: MatchParams) => {
    const demand = params.demand?.trim() ?? '';
    if (!demand) return;
    // 前端基础长度校验（业务校验以后端 4005 为准）
    if (demand.length > MATCH_DEMAND_MAX) {
      setError(`诉求描述超长，最多 ${MATCH_DEMAND_MAX} 字`);
      setErrorCode(AiPlusBizCode.BAD_PARAM);
      return;
    }
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    setNoCoach(false);
    try {
      const res = await aiPlusApi.coachingMatch(params);
      setData(res);
    } catch (err) {
      const code = toApiCode(err);
      setErrorCode(code);
      setData(null);
      // 4713 无可用辅导师 → 引导型提示，非报错弹窗
      if (code === AiPlusBizCode.MATCH_NO_COACH) {
        setNoCoach(true);
        setError(toApiMessage(err, '当前暂无可用辅导师，请稍后再试'));
      } else {
        setError(toApiMessage(err, '智能匹配失败，请稍后重试'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setErrorCode(undefined);
    setNoCoach(false);
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    errorCode,
    noCoach,
    degraded: data?.degraded ?? false,
    run,
    reset,
  };
}

// ============================================================
// P2-1 团队协作/关系协作分析
// ============================================================

export interface UseCollabAnalyzeResult {
  data: CollabAnalyzeResult | null;
  loading: boolean;
  error: string | null;
  /** 错误业务码：9001 游客配额 / 9002 登录配额 / 4005 参数。 */
  errorCode: number | undefined;
  /** 是否触发配额限制（9001/9002）：引导型提示，非报错弹窗。 */
  quotaLimited: boolean;
  /** 是否降级兜底。 */
  degraded: boolean;
  run: (params: CollabAnalyzeParams) => Promise<void>;
  reset: () => void;
}

/** P2-1 协作分析 hook。 */
export function useCollabAnalyze(): UseCollabAnalyzeResult {
  const [data, setData] = useState<CollabAnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);
  const [quotaLimited, setQuotaLimited] = useState(false);

  const run = useCallback(async (params: CollabAnalyzeParams) => {
    // 前端基础校验：2~6 人（业务校验以后端为准）
    const members = Array.isArray(params.members) ? params.members : [];
    if (members.length < 2 || members.length > 6) {
      setError('参与成员需为 2~6 人');
      setErrorCode(AiPlusBizCode.BAD_PARAM);
      return;
    }
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    setQuotaLimited(false);
    try {
      const res = await aiPlusApi.collabAnalyze(params);
      setData(res);
    } catch (err) {
      const code = toApiCode(err);
      setErrorCode(code);
      setData(null);
      // 9001/9002 配额限制 → 引导型提示
      if (code === AiPlusBizCode.COLLAB_GUEST_LIMIT || code === AiPlusBizCode.COLLAB_USER_LIMIT) {
        setQuotaLimited(true);
        setError(toApiMessage(err, '协作分析次数已达上限'));
      } else {
        setError(toApiMessage(err, '协作分析失败，请稍后重试'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setErrorCode(undefined);
    setQuotaLimited(false);
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    errorCode,
    quotaLimited,
    degraded: data?.degraded ?? false,
    run,
    reset,
  };
}

// ============================================================
// P2-2 求职文书生成（会员专享）
// ============================================================

export interface UseResumeGenerateResult {
  data: ResumeGenerateResult | null;
  loading: boolean;
  error: string | null;
  /** 错误业务码：4515 非会员 / 4516 敏感词 / 4004 职业不存在。 */
  errorCode: number | undefined;
  /** 非会员限制（4515）：引导开通会员，非报错弹窗。 */
  memberOnly: boolean;
  /** 命中敏感词（4516）：提示修改内容后重试。 */
  sensitive: boolean;
  /** 是否降级兜底。 */
  degraded: boolean;
  run: (params: ResumeGenerateParams) => Promise<void>;
  reset: () => void;
}

/** P2-2 求职文书生成 hook（会员专享）。 */
export function useResumeGenerate(): UseResumeGenerateResult {
  const [data, setData] = useState<ResumeGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);
  const [memberOnly, setMemberOnly] = useState(false);
  const [sensitive, setSensitive] = useState(false);

  const run = useCallback(async (params: ResumeGenerateParams) => {
    if (!params.careerId) return;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    setMemberOnly(false);
    setSensitive(false);
    try {
      const res = await aiPlusApi.resumeGenerate(params);
      setData(res);
    } catch (err) {
      const code = toApiCode(err);
      setErrorCode(code);
      setData(null);
      if (code === AiPlusBizCode.MEMBER_ONLY) {
        // 4515 非会员 → 引导开通会员
        setMemberOnly(true);
        setError(toApiMessage(err, '该功能为会员专享，开通会员后可用'));
      } else if (code === AiPlusBizCode.RESUME_SENSITIVE) {
        // 4516 敏感词 → 提示修改内容
        setSensitive(true);
        setError(toApiMessage(err, '内容包含敏感信息，请修改后重试'));
      } else {
        setError(toApiMessage(err, '文书生成失败，请稍后重试'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setErrorCode(undefined);
    setMemberOnly(false);
    setSensitive(false);
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    errorCode,
    memberOnly,
    sensitive,
    degraded: data?.degraded ?? false,
    run,
    reset,
  };
}

// ============================================================
// P2-3 报告深度章节生成（DEEP 专享）
// ============================================================

export interface UseReportChapterResult {
  data: ReportChapterResult | null;
  loading: boolean;
  error: string | null;
  /** 错误业务码：4517 非 DEEP / 4003 越权 / 4004 报告不存在。 */
  errorCode: number | undefined;
  /** 非 DEEP 报告限制（4517）：引导解锁深度报告，非报错弹窗。 */
  deepOnly: boolean;
  /** 是否降级兜底。 */
  degraded: boolean;
  run: (params: ReportChapterParams) => Promise<void>;
  reset: () => void;
}

/** P2-3 报告深度章节生成 hook（DEEP 专享）。 */
export function useReportChapter(): UseReportChapterResult {
  const [data, setData] = useState<ReportChapterResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);
  const [deepOnly, setDeepOnly] = useState(false);

  const run = useCallback(async (params: ReportChapterParams) => {
    if (!params.reportId || !params.focus) return;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    setDeepOnly(false);
    try {
      const res = await aiPlusApi.reportChapter(params);
      setData(res);
    } catch (err) {
      const code = toApiCode(err);
      setErrorCode(code);
      setData(null);
      if (code === AiPlusBizCode.CHAPTER_NOT_DEEP) {
        // 4517 非 DEEP → 引导解锁深度报告
        setDeepOnly(true);
        setError(toApiMessage(err, '该章节为深度报告专享，解锁后可用'));
      } else {
        setError(toApiMessage(err, '章节生成失败，请稍后重试'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setErrorCode(undefined);
    setDeepOnly(false);
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    errorCode,
    deepOnly,
    degraded: data?.degraded ?? false,
    run,
    reset,
  };
}

// ============================================================
// P3 §4.1 AI 模拟面试（会员专享，需登录）
// ============================================================

export interface UseAiInterviewResult {
  /** 开始面试返回。 */
  startData: InterviewStartResult | null;
  /** 最近一轮作答返回。 */
  answerData: InterviewAnswerResult | null;
  /** 面试报告。 */
  reportData: InterviewReportResult | null;
  loading: boolean;
  error: string | null;
  errorCode: number | undefined;
  /** 非会员（4515）：引导开通会员。 */
  memberOnly: boolean;
  /** 4520 已结束不可再答。 */
  finishedLocked: boolean;
  /** 面试是否已结束（answerData.finished）。 */
  finished: boolean;
  /** 最近一轮是否降级。 */
  degraded: boolean;
  start: (params: InterviewStartParams) => Promise<InterviewStartResult | null>;
  answer: (interviewId: string, params: InterviewAnswerParams) => Promise<InterviewAnswerResult | null>;
  fetchReport: (interviewId: string) => Promise<InterviewReportResult | null>;
  reset: () => void;
}

/** P3 §4.1 AI 模拟面试 hook（start/answer/report 三态统一）。 */
export function useAiInterview(): UseAiInterviewResult {
  const [startData, setStartData] = useState<InterviewStartResult | null>(null);
  const [answerData, setAnswerData] = useState<InterviewAnswerResult | null>(null);
  const [reportData, setReportData] = useState<InterviewReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);
  const [memberOnly, setMemberOnly] = useState(false);
  const [finishedLocked, setFinishedLocked] = useState(false);

  const handleErr = useCallback((err: unknown, fallback: string) => {
    const code = toApiCode(err);
    setErrorCode(code);
    if (code === AiPlusBizCode.MEMBER_ONLY) {
      setMemberOnly(true);
      setError(toApiMessage(err, 'AI 模拟面试为会员专享，请先开通会员'));
    } else if (code === AiPlusBizCode.INTERVIEW_FINISHED) {
      setFinishedLocked(true);
      setError(toApiMessage(err, '本场面试已结束，请查看报告'));
    } else {
      setError(toApiMessage(err, fallback));
    }
  }, []);

  const start = useCallback(async (params: InterviewStartParams) => {
    if (!params.careerId) return null;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    setMemberOnly(false);
    setFinishedLocked(false);
    setAnswerData(null);
    setReportData(null);
    try {
      const res = await aiPlusApi.interviewStart(params);
      setStartData(res);
      return res;
    } catch (err) {
      setStartData(null);
      handleErr(err, '开始面试失败，请稍后重试');
      return null;
    } finally {
      setLoading(false);
    }
  }, [handleErr]);

  const answer = useCallback(async (interviewId: string, params: InterviewAnswerParams) => {
    if (!interviewId || !params.answer) return null;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const res = await aiPlusApi.interviewAnswer(interviewId, params);
      setAnswerData(res);
      return res;
    } catch (err) {
      handleErr(err, '提交作答失败，请稍后重试');
      return null;
    } finally {
      setLoading(false);
    }
  }, [handleErr]);

  const fetchReport = useCallback(async (interviewId: string) => {
    if (!interviewId) return null;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const res = await aiPlusApi.interviewReport(interviewId);
      setReportData(res);
      return res;
    } catch (err) {
      handleErr(err, '获取面试报告失败，请稍后重试');
      return null;
    } finally {
      setLoading(false);
    }
  }, [handleErr]);

  const reset = useCallback(() => {
    setStartData(null);
    setAnswerData(null);
    setReportData(null);
    setError(null);
    setErrorCode(undefined);
    setMemberOnly(false);
    setFinishedLocked(false);
    setLoading(false);
  }, []);

  return {
    startData,
    answerData,
    reportData,
    loading,
    error,
    errorCode,
    memberOnly,
    finishedLocked,
    finished: answerData?.finished ?? false,
    degraded: answerData?.degraded ?? false,
    start,
    answer,
    fetchReport,
    reset,
  };
}

// ============================================================
// P3 §4.2 AI 面试题库（list 登录可见 / score 会员专享）
// ============================================================

export interface UseInterviewBankResult {
  listData: QuestionListResult | null;
  scoreData: QuestionScoreResult | null;
  loading: boolean;
  error: string | null;
  errorCode: number | undefined;
  /** 评分 4515 非会员：引导开通会员。 */
  memberOnly: boolean;
  fetchList: (params: QuestionListParams) => Promise<QuestionListResult | null>;
  score: (qId: string, params: QuestionScoreParams) => Promise<QuestionScoreResult | null>;
  reset: () => void;
}

/** P3 §4.2 面试题库 hook。 */
export function useInterviewBank(): UseInterviewBankResult {
  const [listData, setListData] = useState<QuestionListResult | null>(null);
  const [scoreData, setScoreData] = useState<QuestionScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);
  const [memberOnly, setMemberOnly] = useState(false);

  const fetchList = useCallback(async (params: QuestionListParams) => {
    if (!params.careerId) return null;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const res = await aiPlusApi.interviewQuestions(params);
      setListData(res);
      return res;
    } catch (err) {
      setListData(null);
      setErrorCode(toApiCode(err));
      setError(toApiMessage(err, '获取题库失败，请稍后重试'));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const score = useCallback(async (qId: string, params: QuestionScoreParams) => {
    if (!qId || !params.answer) return null;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    setMemberOnly(false);
    try {
      const res = await aiPlusApi.interviewQuestionScore(qId, params);
      setScoreData(res);
      return res;
    } catch (err) {
      const code = toApiCode(err);
      setErrorCode(code);
      if (code === AiPlusBizCode.MEMBER_ONLY) {
        setMemberOnly(true);
        setError(toApiMessage(err, '单题评分为会员专享，请先开通会员'));
      } else {
        setError(toApiMessage(err, '评分失败，请稍后重试'));
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setListData(null);
    setScoreData(null);
    setError(null);
    setErrorCode(undefined);
    setMemberOnly(false);
    setLoading(false);
  }, []);

  return { listData, scoreData, loading, error, errorCode, memberOnly, fetchList, score, reset };
}

// ============================================================
// P3 §4.3 AI 职业热点日报（登录可见）
// ============================================================

export interface UseDailyBriefResult {
  data: DailyBriefResult | null;
  subscription: SubscriptionResult | null;
  loading: boolean;
  error: string | null;
  errorCode: number | undefined;
  /** 4004 当日无日报：展示空态，非错误弹窗。 */
  noBrief: boolean;
  fetch: (date?: string) => Promise<DailyBriefResult | null>;
  updateSubscription: (params: SubscriptionParams) => Promise<SubscriptionResult | null>;
  reset: () => void;
}

/** P3 §4.3 职业热点日报 hook。 */
export function useDailyBrief(): UseDailyBriefResult {
  const [data, setData] = useState<DailyBriefResult | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);
  const [noBrief, setNoBrief] = useState(false);

  const fetch = useCallback(async (date?: string) => {
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    setNoBrief(false);
    try {
      const res = await aiPlusApi.dailyBrief(date);
      setData(res);
      return res;
    } catch (err) {
      const code = toApiCode(err);
      setErrorCode(code);
      setData(null);
      if (code === AiPlusBizCode.NOT_FOUND) {
        setNoBrief(true);
        setError(toApiMessage(err, '当日暂无日报'));
      } else {
        setError(toApiMessage(err, '获取日报失败，请稍后重试'));
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSubscription = useCallback(async (params: SubscriptionParams) => {
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const res = await aiPlusApi.updateDailyBriefSubscription(params);
      setSubscription(res);
      return res;
    } catch (err) {
      setErrorCode(toApiCode(err));
      setError(toApiMessage(err, '保存订阅设置失败，请稍后重试'));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setSubscription(null);
    setError(null);
    setErrorCode(undefined);
    setNoBrief(false);
    setLoading(false);
  }, []);

  return { data, subscription, loading, error, errorCode, noBrief, fetch, updateSubscription, reset };
}

// ============================================================
// P3 §4.4 AI 辅助职业库生产（后台管理员，走 admin token）
// ============================================================

export interface UseCareerAiResult {
  generateData: CareerGenerateResult | null;
  draftList: DraftListResult | null;
  reviewData: ReviewResult | null;
  loading: boolean;
  error: string | null;
  errorCode: number | undefined;
  /** 4030 管理员越权。 */
  forbidden: boolean;
  /** 4461 重复职业名。 */
  dupName: boolean;
  /** 4460 草稿不存在。 */
  draftNotFound: boolean;
  /** 4462 已审核。 */
  alreadyReviewed: boolean;
  generate: (params: CareerGenerateParams) => Promise<CareerGenerateResult | null>;
  fetchDrafts: (params?: DraftListParams) => Promise<DraftListResult | null>;
  review: (draftId: string, params: ReviewParams) => Promise<ReviewResult | null>;
  reset: () => void;
}

/** P3 §4.4 职业库生产 hook（后台管理员）。 */
export function useCareerAi(): UseCareerAiResult {
  const [generateData, setGenerateData] = useState<CareerGenerateResult | null>(null);
  const [draftList, setDraftList] = useState<DraftListResult | null>(null);
  const [reviewData, setReviewData] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | undefined>(undefined);
  const [forbidden, setForbidden] = useState(false);
  const [dupName, setDupName] = useState(false);
  const [draftNotFound, setDraftNotFound] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  const clearFlags = useCallback(() => {
    setForbidden(false);
    setDupName(false);
    setDraftNotFound(false);
    setAlreadyReviewed(false);
  }, []);

  const handleErr = useCallback((err: unknown, fallback: string) => {
    const code = toApiCode(err);
    setErrorCode(code);
    if (code === AiPlusBizCode.ADMIN_SCOPE_INVALID) setForbidden(true);
    else if (code === AiPlusBizCode.DRAFT_DUP_NAME) setDupName(true);
    else if (code === AiPlusBizCode.DRAFT_NOT_FOUND) setDraftNotFound(true);
    else if (code === AiPlusBizCode.DRAFT_ALREADY_REVIEWED) setAlreadyReviewed(true);
    setError(toApiMessage(err, fallback));
  }, []);

  const generate = useCallback(async (params: CareerGenerateParams) => {
    if (!params.name || !params.category) return null;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    clearFlags();
    try {
      const res = await aiPlusApi.careerGenerate(params);
      setGenerateData(res);
      return res;
    } catch (err) {
      setGenerateData(null);
      handleErr(err, '生成职业草稿失败，请稍后重试');
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearFlags, handleErr]);

  const fetchDrafts = useCallback(async (params?: DraftListParams) => {
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    clearFlags();
    try {
      const res = await aiPlusApi.careerDrafts(params);
      setDraftList(res);
      return res;
    } catch (err) {
      setDraftList(null);
      handleErr(err, '获取草稿列表失败，请稍后重试');
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearFlags, handleErr]);

  const review = useCallback(async (draftId: string, params: ReviewParams) => {
    if (!draftId) return null;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    clearFlags();
    try {
      const res = await aiPlusApi.careerDraftReview(draftId, params);
      setReviewData(res);
      return res;
    } catch (err) {
      handleErr(err, '审核草稿失败，请稍后重试');
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearFlags, handleErr]);

  const reset = useCallback(() => {
    setGenerateData(null);
    setDraftList(null);
    setReviewData(null);
    setError(null);
    setErrorCode(undefined);
    clearFlags();
    setLoading(false);
  }, [clearFlags]);

  return {
    generateData,
    draftList,
    reviewData,
    loading,
    error,
    errorCode,
    forbidden,
    dupName,
    draftNotFound,
    alreadyReviewed,
    generate,
    fetchDrafts,
    review,
    reset,
  };
}