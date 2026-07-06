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

function load(): DraftSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DraftSnapshot;
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
    Object.entries(get().answers).map(([questionId, value]) => ({ questionId, optionId: String(value) })),

  hasDraft: () => !!get().recordId && Object.keys(get().answers).length > 0,

  reset: () => {
    set({ recordId: null, answers: {}, page: 0, resultId: null });
    localStorage.removeItem(STORAGE_KEY);
  },
}));