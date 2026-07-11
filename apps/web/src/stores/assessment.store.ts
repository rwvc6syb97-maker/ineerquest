/**
 * 测评草稿状态（Zustand + localStorage 持久化）
 * 职责：持有当前测评 recordId、逐题作答、当前分页，支持断点续答。
 * 无真实后端运行时，草稿以本地缓存兜底；有后端时由 PATCH answers 同步。
 */
import { create } from 'zustand';
import type { Answer } from '../api/modules/assessment.api';

const STORAGE_KEY = 'iq_assessment_draft';

interface DraftSnapshot {
  recordId: string | null;
  answers: Record<string, string>;
  page: number;
  resultId: string | null;
}

interface AssessmentState extends DraftSnapshot {
  setRecordId: (id: string) => void;
  /** 记录单题作答 */
  answer: (questionId: string, optionId: string) => void;
  setPage: (page: number) => void;
  /** 提交完成后记录结果 id，供 RequireResult 守卫使用 */
  setResultId: (id: string) => void;
  /** 已作答数量 */
  answeredCount: () => number;
  /** 导出为接口所需的 answers 数组 */
  toAnswers: () => Answer[];
  /** 是否有可续答草稿 */
  hasDraft: () => boolean;
  reset: () => void;
}

/** 校验为纯数字字符串（后端题库 id 均为 BigInt→数字串，如 401/2001）。 */
function isNumericId(v: string): boolean {
  return /^\d+$/.test(v);
}

/**
 * 清洗答案：仅保留 questionId(key) 与 optionId(value) 均为纯数字串的条目。
 * 目的：剔除历史 mock 时代的字符串 id（如 mq-EI-1 / opt-1），
 * 否则 toAnswers() 的 Number() 会得到 NaN，导致后端 BigInt(NaN)/外键 P2003 → 500。
 */
function sanitizeAnswers(answers: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [qid, val] of Object.entries(answers ?? {})) {
    if (isNumericId(qid) && isNumericId(String(val))) {
      clean[qid] = String(val);
    }
  }
  return clean;
}

function load(): DraftSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const snap = JSON.parse(raw) as DraftSnapshot;
      const cleanAnswers = sanitizeAnswers(snap.answers);
      // 若清洗后条目数变化，说明存在脏草稿，回写清洗结果避免复燃
      if (Object.keys(cleanAnswers).length !== Object.keys(snap.answers ?? {}).length) {
        const fixed = { ...snap, answers: cleanAnswers };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(fixed));
        } catch {
          /* ignore */
        }
        return fixed;
      }
      return snap;
    }
  } catch {
    /* ignore */
  }
  return { recordId: null, answers: {}, page: 0, resultId: null };
}

function persist(state: DraftSnapshot): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        recordId: state.recordId,
        answers: state.answers,
        page: state.page,
        resultId: state.resultId,
      }),
    );
  } catch {
    /* ignore */
  }
}

export const useAssessmentStore = create<AssessmentState>((set, get) => ({
  ...load(),

  setRecordId: (id) => {
    set({ recordId: id });
    persist(get());
  },

  answer: (questionId, value) => {
    set((s) => ({ answers: { ...s.answers, [questionId]: value } }));
    persist(get());
  },

  setPage: (page) => {
    set({ page });
    persist(get());
  },

  setResultId: (id) => {
    set({ resultId: id });
    persist(get());
  },

  answeredCount: () => Object.keys(get().answers).length,

  toAnswers: () =>
    Object.entries(get().answers)
      .map(([questionId, value]) => ({
        questionId: Number(questionId),
        optionId: Number(value),
      }))
      // 双重保险：剔除任何非法数字（NaN/负值），避免后端 BigInt(NaN)/外键 500
      .filter((a) => Number.isSafeInteger(a.questionId) && Number.isSafeInteger(a.optionId)),

  // 方案A：游客答题阶段不建 recordId，草稿仅以本地答案为准
  hasDraft: () => Object.keys(get().answers).length > 0,

  reset: () => {
    set({ recordId: null, answers: {}, page: 0, resultId: null });
    localStorage.removeItem(STORAGE_KEY);
  },
}));