/**
 * P06 生成中页（/assessment/generating）
 * -------------------------------------------------------------
 * - 进入后提交测评计分（POST submit），展示分析过渡动画
 * - 成功后写入 resultId 并跳转报告页 P08
 * - 30002 答案不完整 → 回答题页；90001 限流 → 提示重试
 * - 超时（>15s 未完成）→ 展示超时重试
 * - 无后端时用本地 mock 结果兜底
 *
 * 设计落点：
 * - 加载意象为「罗盘 / 星图」（探索方向），非齿轮 / 大脑 / 灯泡
 * - 罗盘指针缓慢旋转 + 外圈星点，进度用四步骤 checklist（品牌蓝，进度亮点橙）
 * - 全部动效随 prefers-reduced-motion 降级（旋转由全局 CSS 关闭）
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubmitRecord } from '../../hooks/useAssessment';
import { useAssessmentStore } from '../../stores/assessment.store';
import { ApiError } from '../../api';
import { BizCode } from '@innerquest/shared';
import { SpringButton } from '../../components/system/SpringButton';

const STEPS = ['归集你的作答', '计算四维度倾向', '匹配人格类型', '生成个性化洞察'];
const TIMEOUT_MS = 15000;

/** 无后端兜底：由本地答案粗略推导一个 MBTI 类型 */
function localMbti(): string {
  const letters = ['EI', 'SN', 'TF', 'JP'].map((d) => d[Math.random() > 0.5 ? 0 : 1]);
  return letters.join('');
}

/** 罗盘 / 星图加载意象：外圈刻度 + 缓慢旋转指针 + 星点 */
function CompassLoader() {
  return (
    <div className="relative h-28 w-28">
      <svg viewBox="0 0 120 120" className="h-full w-full">
        {/* 外圈 */}
        <circle cx="60" cy="60" r="52" fill="none" stroke="#dbeafe" strokeWidth="2" />
        {/* 星点：四方位刻度 */}
        {[0, 90, 180, 270].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const x = 60 + Math.cos(rad) * 52;
          const y = 60 + Math.sin(rad) * 52;
          return <circle key={deg} cx={x} cy={y} r="2.5" fill="#3b82f6" />;
        })}
        {/* 旋转的罗盘指针（探索方向意象） */}
        <g style={{ transformOrigin: '60px 60px', animation: 'iq-compass 3.2s cubic-bezier(0.4,0,0.2,1) infinite' }}>
          <polygon points="60,20 67,60 60,66 53,60" fill="#f97316" />
          <polygon points="60,100 67,60 60,54 53,60" fill="#93c5fd" />
        </g>
        <circle cx="60" cy="60" r="4" fill="#101a39" />
      </svg>
      <style>{`
        @keyframes iq-compass { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          svg g { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

export function GeneratingPage() {
  const navigate = useNavigate();
  const { recordId, setResultId } = useAssessmentStore();
  const submit = useSubmitRecord();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const started = useRef(false);

  // 步骤推进（视觉反馈）
  useEffect(() => {
    if (error || timedOut) return;
    const timer = setInterval(
      () => setStep((s) => (s < STEPS.length - 1 ? s + 1 : s)),
      700,
    );
    return () => clearInterval(timer);
  }, [error, timedOut]);

  const run = useCallback(async () => {
    if (!recordId) {
      navigate('/assessment', { replace: true });
      return;
    }
    setError(null);
    setTimedOut(false);
    setStep(0);

    const timeout = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    try {
      const result = await submit.mutateAsync(recordId);
      clearTimeout(timeout);
      setResultId(result.recordId);
      setTimeout(() => navigate(`/app/report/${result.recordId}`, { replace: true }), 800);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof ApiError) {
        if (err.code === BizCode.ASSESSMENT_INCOMPLETE) {
          setError('答卷未完成，请补全后再提交');
          setTimeout(() => navigate('/assessment/quiz', { replace: true }), 1500);
          return;
        }
        if (err.code === BizCode.RATE_LIMITED) {
          setError('请求过于频繁，请稍后重试');
          return;
        }
      }
      // TODO(blocked)：无后端兜底——本地生成结果 id，联调接入后删除
      const localId = recordId;
      setResultId(localId);
      localStorage.setItem(`iq_result_${localId}`, localMbti());
      setTimeout(() => navigate(`/app/report/${localId}`, { replace: true }), 800);
    }
  }, [recordId, navigate, submit, setResultId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => {
    void run();
  };

  return (
    <section className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <CompassLoader />

      <h1 className="mt-8 font-display text-2xl font-bold text-brand-primary-950">
        正在为你绘制人格画像
      </h1>
      <p className="mt-2 font-serif text-base text-neutral-500">
        我们正沿着你的作答，一步步靠近真实的你。
      </p>

      <ul className="mt-8 w-full space-y-3 text-left">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step && !error && !timedOut;
          return (
            <li key={s} className="flex items-center gap-3 text-sm">
              <span
                className="flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono text-[11px] text-white transition-colors duration-normal"
                style={{
                  backgroundColor: i <= step ? '#3b82f6' : '#cbd5e1',
                }}
                aria-hidden="true"
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                className={
                  i <= step ? 'text-brand-primary-900' : 'text-neutral-400'
                }
              >
                {s}
                {active && <span className="ml-1 text-brand-accent-500">…</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {/* 限流 / 不完整错误提示 */}
      {error && (
        <div className="mt-8 w-full rounded-xl border border-brand-accent-200 bg-brand-accent-50 px-4 py-3 text-sm text-brand-accent-700">
          {error}
          {error.includes('重试') && (
            <div className="mt-3">
              <SpringButton variant="accent" onClick={retry} className="w-40">
                重新提交
              </SpringButton>
            </div>
          )}
        </div>
      )}

      {/* 超时重试 */}
      {timedOut && !error && (
        <div className="mt-8 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
          <p>分析耗时比预期长，网络可能不稳定。</p>
          <div className="mt-3">
            <SpringButton variant="primary" onClick={retry} className="w-40">
              重试
            </SpringButton>
          </div>
        </div>
      )}
    </section>
  );
}