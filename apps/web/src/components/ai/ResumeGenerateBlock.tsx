/**
 * P2-2 求职文书生成块（会员专享）——内嵌于职业详情页
 * -------------------------------------------------------------
 * 收集履历资料（教育/技能/经历），选择类型（简历/求职信），调用 useResumeGenerate。
 * 会员限制（4515）走 memberOnly 引导开通会员；敏感词（4516）走 sensitive 提示修改。
 * degraded=true 仍完整展示 content/sections。前端仅做基础非空校验，业务校验交后端。
 */
import { useState } from 'react';
import { useResumeGenerate } from '../../hooks/useAiPlus';
import type { ResumeGenerateType, ResumeExperience } from '../../api/modules/ai-plus.api';
import { Card, SectionHeading, Tag, SpringButton } from '../../components';

interface ResumeGenerateBlockProps {
  /** 目标职业 id（来自 CareerDetailPage useParams）。 */
  careerId: string;
}

const inputCls =
  'w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand-primary-500';

export function ResumeGenerateBlock({ careerId }: ResumeGenerateBlockProps) {
  const [type, setType] = useState<ResumeGenerateType>('resume');
  const [education, setEducation] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [experiences, setExperiences] = useState<ResumeExperience[]>([
    { role: '', description: '' },
  ]);
  const [localError, setLocalError] = useState<string | null>(null);
  const { data, loading, error, memberOnly, sensitive, degraded, run, reset } =
    useResumeGenerate();

  const updateExp = (idx: number, patch: Partial<ResumeExperience>) => {
    setExperiences((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };
  const addExp = () =>
    setExperiences((prev) => (prev.length < 5 ? [...prev, { role: '', description: '' }] : prev));
  const removeExp = (idx: number) =>
    setExperiences((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const handleSubmit = async () => {
    setLocalError(null);
    if (!education.trim()) {
      setLocalError('请填写教育背景');
      return;
    }
    const skills = skillsText
      .split(/[,，;；\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const validExps = experiences.filter((e) => e.role.trim() || e.description.trim());
    await run({
      careerId,
      type,
      profile: {
        education: education.trim(),
        skills,
        experiences: validExps.map((e) => ({
          role: e.role.trim(),
          description: e.description.trim(),
        })),
      },
    });
  };

  return (
    <section className="mt-10">
      <SectionHeading
        as="h2"
        size="md"
        eyebrow="Resume"
        title="AI 求职文书生成"
        subtitle="填写你的履历，AI 为该职业量身生成简历或求职信初稿（会员专享）。"
      />

      <Card padding="lg" className="mt-4">
        {/* 类型切换 */}
        <div className="mb-4 inline-flex rounded-lg border border-neutral-200 p-1">
          {(['resume', 'coverLetter'] as ResumeGenerateType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-md px-4 py-1.5 text-sm transition ${
                type === t
                  ? 'bg-brand-primary-500 text-white'
                  : 'text-neutral-600 hover:text-brand-primary-600'
              }`}
            >
              {t === 'resume' ? '简历' : '求职信'}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">教育背景</label>
            <input
              type="text"
              value={education}
              onChange={(e) => setEducation(e.target.value)}
              placeholder="如：某某大学 计算机科学 本科"
              maxLength={100}
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              技能（逗号或换行分隔）
            </label>
            <textarea
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              placeholder="如：Java, 项目管理, 数据分析"
              rows={2}
              maxLength={300}
              className={inputCls}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-neutral-700">工作/项目经历</label>
              <button
                type="button"
                onClick={addExp}
                disabled={experiences.length >= 5}
                className="text-xs text-brand-primary-600 hover:underline disabled:opacity-40"
              >
                + 添加经历
              </button>
            </div>
            <div className="space-y-3">
              {experiences.map((exp, idx) => (
                <div key={idx} className="rounded-lg border border-neutral-200/70 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={exp.role}
                      onChange={(e) => updateExp(idx, { role: e.target.value })}
                  placeholder="角色/岗位"
                      maxLength={50}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => removeExp(idx)}
                      disabled={experiences.length <= 1}
                      className="shrink-0 text-xs text-neutral-400 hover:text-red-500 disabled:opacity-40"
                    >
                      删除
                    </button>
                  </div>
                  <textarea
                    value={exp.description}
                    onChange={(e) => updateExp(idx, { description: e.target.value })}
                    placeholder="经历描述"
                    rows={2}
                    maxLength={300}
                    className={`${inputCls} mt-2`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {localError ? <p className="mt-3 text-sm text-red-500">{localError}</p> : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <SpringButton variant="accent" onClick={handleSubmit} disabled={loading}>
            {loading ? '生成中…' : type === 'resume' ? '生成简历' : '生成求职信'}
          </SpringButton>
          {data ? (
            <SpringButton variant="ghost" onClick={reset}>
              重新填写
            </SpringButton>
          ) : null}
        </div>
      </Card>

      {/* 会员限制（4515）引导开通会员 */}
      {memberOnly ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm text-amber-800">{error ?? '该功能为会员专享'}</p>
          <a
            href="/pricing"
            className="mt-1 inline-block text-xs font-medium text-amber-700 underline"
          >
            开通会员解锁 AI 文书生成
          </a>
        </div>
      ) : null}

      {/* 敏感词（4516）提示修改 */}
      {sensitive ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">{error ?? '内容包含敏感信息，请修改后重试'}</p>
        </div>
      ) : null}

      {/* 普通错误（非会员/敏感） */}
      {error && !memberOnly && !sensitive ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}

      {/* 结果区 */}
      {data ? (
        <div className="mt-6 space-y-5">
          {degraded ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
              <p className="text-xs text-amber-700">当前为快速兜底初稿，稍后可重试获取更完整内容。</p>
            </div>
          ) : null}

          {data.sections.length ? (
            data.sections.map((s, i) => (
              <Card key={`${s.title}-${i}`} padding="md">
                <h3 className="font-medium text-brand-primary-950">{s.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                  {s.body}
                </p>
              </Card>
            ))
          ) : (
            <Card padding="md">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                {data.content || '暂无生成内容。'}
              </p>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Tag tone="brand" size="sm">文档 ID：{data.docId || '—'}</Tag>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default ResumeGenerateBlock;