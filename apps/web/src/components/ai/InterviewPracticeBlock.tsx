import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  Card,
  SectionHeading,
  SpringButton,
  StatPill,
  Tag,
  EmptyState,
} from '../../components';
import { useAiInterview } from '../../hooks/useAiPlus';
import { useInterviewBank } from '../../hooks/useAiPlus';
import type { InterviewDifficulty } from '../../api/modules/ai-plus.api';

const COLORS = { accent: '#f97316' } as const;

const DIFFICULTIES: { value: InterviewDifficulty; label: string }[] = [
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
];

type Mode = 'mock' | 'bank';

interface InterviewPracticeBlockProps {
  careerId: string;
}

/** amber 引导提示条（会员/锁定等非报错语义）。 */
function GuideNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      {children}
    </div>
  );
}

/** 红色错误提示条。 */
function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

/** P3-1 模拟面试子块：start → 逐轮 answer → finished 后 fetchReport。 */
function MockInterview({ careerId }: { careerId: string }) {
  const {
    answerData,
    reportData,
    loading,
    error,
    memberOnly,
    finishedLocked,
    finished,
    degraded,
    start,
    answer,
    fetchReport,
    reset,
  } = useAiInterview();

  const [difficulty, setDifficulty] = useState<InterviewDifficulty>('medium');
  const [interviewId, setInterviewId] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [round, setRound] = useState(0);
  const [localError, setLocalError] = useState('');

  const handleStart = async () => {
    setLocalError('');
    const res = await start({ careerId, difficulty });
    if (res && res.interviewId) {
      setInterviewId(res.interviewId);
      setCurrentQuestion(res.firstQuestion);
      setRound(1);
      setAnswerText('');
    }
  };

  const handleAnswer = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (!answerText.trim()) {
      setLocalError('请先填写作答内容');
      return;
    }
    if (!interviewId) return;
    const res = await answer(interviewId, { answer: answerText.trim() });
    if (res) {
      setAnswerText('');
      if (res.finished) {
        await fetchReport(interviewId);
      } else if (res.nextQuestion) {
        setCurrentQuestion(res.nextQuestion);
        setRound((n) => n + 1);
      }
    }
  };

  const handleRestart = () => {
    reset();
    setInterviewId('');
    setCurrentQuestion('');
    setAnswerText('');
    setRound(0);
    setLocalError('');
  };

  // 未开始
  if (!interviewId) {
    return (
      <div>
        <p className="text-sm text-neutral-500">
          选择难度后开始一场 AI 模拟面试，逐轮作答并获得即时反馈，结束后生成能力报告。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDifficulty(d.value)}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                difficulty === d.value
                  ? 'border-transparent bg-neutral-900 text-white'
                  : 'border-neutral-300 text-neutral-600 hover:border-neutral-400'
              }`}
            >
              {d.label}
            </button>
          ))}
          <SpringButton variant="accent" onClick={handleStart} disabled={loading}>
            {loading ? '准备中…' : '开始模拟面试'}
          </SpringButton>
        </div>
        {memberOnly && (
          <GuideNotice>
            AI 模拟面试为会员专享能力，
            <a href="/pricing" className="font-semibold underline">
              开通会员
            </a>
            后即可解锁逐轮反馈与能力报告。
          </GuideNotice>
        )}
        {localError && <ErrorNotice message={localError} />}
        {error && !memberOnly && <ErrorNotice message={error} />}
      </div>
    );
  }

  return (
    <div>
      {/* 报告态 */}
      {reportData ? (
        <div>
          <div className="flex items-center gap-3">
            <StatPill label="综合评分" value={reportData.overallScore} tone="accent" />
            {degraded && <Tag>降级生成</Tag>}
          </div>
          {reportData.dimensions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {reportData.dimensions.map((d, i) => (
                <StatPill key={`${d.name}-${i}`} label={d.name} value={d.score} tone="brand" />
              ))}
            </div>
          )}
          {reportData.suggestions.length > 0 && (
            <Card padding="md" className="mt-4">
              <h4 className="text-sm font-semibold text-neutral-800">改进建议</h4>
              <ul className="mt-2 space-y-1.5">
                {reportData.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-neutral-600">
                    <span style={{ color: COLORS.accent }}>•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className="mt-5">
            <SpringButton variant="ghost" onClick={handleRestart}>
              再来一次
            </SpringButton>
          </div>
        </div>
      ) : (
        // 作答态
        <div>
          <div className="flex items-center justify-between">
            <Tag>第 {round} 轮</Tag>
            {answerData?.degraded && <Tag>降级评分</Tag>}
          </div>
          <Card padding="md" className="mt-3">
            <p className="text-sm font-medium text-neutral-800">{currentQuestion}</p>
          </Card>

          {/* 上一轮反馈 */}
          {answerData && !answerData.finished && (
            <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-neutral-700">上一轮评分</span>
                <StatPill label="" value={answerData.score} tone="neutral" />
              </div>
              {answerData.feedback && (
                <p className="mt-1.5 text-sm text-neutral-600">{answerData.feedback}</p>
              )}
            </div>
          )}

          <form onSubmit={handleAnswer} className="mt-4">
            <textarea
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              rows={4}
              placeholder="输入你的回答…"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
            <div className="mt-3 flex items-center gap-3">
              <SpringButton variant="accent" type="submit" disabled={loading}>
                {loading ? '评分中…' : '提交作答'}
              </SpringButton>
              <SpringButton variant="ghost" onClick={handleRestart}>
                结束并重开
              </SpringButton>
            </div>
          </form>

          {finishedLocked && (
            <GuideNotice>本场面试已结束，请查看能力报告或重新开始一场。</GuideNotice>
          )}
          {finished && !reportData && (
            <GuideNotice>面试已完成，正在生成能力报告…</GuideNotice>
          )}
          {localError && <ErrorNotice message={localError} />}
          {error && !finishedLocked && <ErrorNotice message={error} />}
        </div>
      )}
    </div>
  );
}

/** P3-2 题库练习子块：fetchList 列表 → 单题 score 评分。 */
function BankPractice({ careerId }: { careerId: string }) {
  const { listData, scoreData, loading, error, memberOnly, fetchList, score, reset } =
    useInterviewBank();

  const [difficulty, setDifficulty] = useState<InterviewDifficulty | ''>('');
  const [activeQid, setActiveQid] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [localError, setLocalError] = useState('');

  const handleLoad = async () => {
    setLocalError('');
    setActiveQid('');
    reset();
    await fetchList({
      careerId,
      ...(difficulty ? { difficulty } : {}),
      page: 1,
      pageSize: 20,
    });
  };

  const handleScore = async (qId: string) => {
    setLocalError('');
    if (!answerText.trim()) {
      setLocalError('请先填写作答内容');
      return;
    }
    await score(qId, { answer: answerText.trim() });
  };

  return (
    <div>
      <p className="text-sm text-neutral-500">
        按职业加载高频面试题，选题作答后获得评分与参考答案（评分为会员专享）。
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDifficulty('')}
          className={`rounded-full border px-4 py-1.5 text-sm transition ${
            difficulty === ''
              ? 'border-transparent bg-neutral-900 text-white'
              : 'border-neutral-300 text-neutral-600 hover:border-neutral-400'
          }`}
        >
          全部
        </button>
        {DIFFICULTIES.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => setDifficulty(d.value)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              difficulty === d.value
                ? 'border-transparent bg-neutral-900 text-white'
                : 'border-neutral-300 text-neutral-600 hover:border-neutral-400'
            }`}
          >
            {d.label}
          </button>
        ))}
        <SpringButton variant="primary" onClick={handleLoad} disabled={loading}>
          {loading ? '加载中…' : '加载题库'}
        </SpringButton>
      </div>

      {error && !memberOnly && <ErrorNotice message={error} />}
      {localError && <ErrorNotice message={localError} />}

      {listData && listData.list.length === 0 && (
        <div className="mt-6">
          <EmptyState icon="search" title="暂无题目" description="换个难度或职业再试试。" />
        </div>
      )}

      {listData && listData.list.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="text-xs text-neutral-400">共 {listData.total} 题</p>
          {listData.list.map((q) => (
            <Card key={q.qId} padding="md">
              <p className="text-sm font-medium text-neutral-800">{q.question}</p>
              {q.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {q.tags.map((t, i) => (
                    <Tag key={`${q.qId}-${i}`}>{t}</Tag>
                  ))}
                </div>
              )}
              {activeQid === q.qId ? (
                <div className="mt-3">
                  <textarea
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    rows={3}
                    placeholder="输入你的回答…"
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <SpringButton
                      variant="accent"
                      onClick={() => handleScore(q.qId)}
                      disabled={loading}
                    >
                      {loading ? '评分中…' : '提交评分'}
                    </SpringButton>
                    <SpringButton variant="ghost" onClick={() => setActiveQid('')}>
                      收起
                    </SpringButton>
                  </div>
                  {scoreData && (
                    <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold text-neutral-700">评分</span>
                        <StatPill label="" value={scoreData.score} tone="accent" />
                      </div>
                      {scoreData.feedback && (
                        <p className="mt-1.5 text-sm text-neutral-600">{scoreData.feedback}</p>
                      )}
                      {scoreData.sampleAnswer && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-neutral-500">参考答案</p>
                          <p className="mt-1 text-sm text-neutral-600">{scoreData.sampleAnswer}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {memberOnly && (
                    <GuideNotice>
                      题目评分与参考答案为会员专享，
                      <a href="/pricing" className="font-semibold underline">
                        开通会员
                      </a>
                      后即可解锁。
                    </GuideNotice>
                  )}
                </div>
              ) : (
                <div className="mt-3">
                  <SpringButton
                    variant="ghost"
                    onClick={() => {
                      setActiveQid(q.qId);
                      setAnswerText('');
                    }}
                  >
                    作答此题
                  </SpringButton>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** P3-1/2 模拟面试与题库练习聚合块。 */
export function InterviewPracticeBlock({ careerId }: InterviewPracticeBlockProps) {
  const [mode, setMode] = useState<Mode>('mock');

  return (
    <div>
      <SectionHeading eyebrow="AI 面试" title="面试准备" size="md" as="h3" />
      <div className="mt-4 inline-flex rounded-full border border-neutral-200 p-1">
        <button
          type="button"
          onClick={() => setMode('mock')}
          className={`rounded-full px-4 py-1.5 text-sm transition ${
            mode === 'mock' ? 'bg-neutral-900 text-white' : 'text-neutral-600'
          }`}
        >
          模拟面试
        </button>
        <button
          type="button"
          onClick={() => setMode('bank')}
          className={`rounded-full px-4 py-1.5 text-sm transition ${
            mode === 'bank' ? 'bg-neutral-900 text-white' : 'text-neutral-600'
          }`}
        >
          题库练习
        </button>
      </div>
      <div className="mt-5">
        {mode === 'mock' ? (
          <MockInterview careerId={careerId} />
        ) : (
          <BankPractice careerId={careerId} />
        )}
      </div>
    </div>
  );
}