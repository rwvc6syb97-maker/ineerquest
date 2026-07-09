/**
 * P10 报告章节详情页（/app/report/:id/section/:sectionId）
 * -------------------------------------------------------------
 * 从报告中取出单个章节深度阅读；付费锁态段引导解锁。
 * 复用 useReport（含 mock 兜底），按 sectionId 匹配 section.sectionKey。
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useReport } from '../../hooks/useReport';
import {
  Card,
  Quote,
  SectionHeading,
  Reveal,
  EmptyState,
  BackButton,
  SpringButton,
  SpringLink,
} from '../../components';
import { FAMILY_COLORS, FAMILY_LABEL } from '../../theme/tokens';

export function ReportSectionPage() {
  const { id = '', sectionId = '' } = useParams();
  const navigate = useNavigate();
  const { data: report, isLoading, isError } = useReport(id);

  if (isLoading) {
    return <p className="py-16 text-center font-serif text-neutral-400">加载章节…</p>;
  }
  if (isError || !report) {
    return (
      <div className="py-16">
        <EmptyState
          icon="sparkle"
          title="暂无报告数据"
          description="还没有可展示的报告，先完成一次测评再回来阅读章节。"
          action={
            <SpringButton variant="accent" onClick={() => navigate('/assessment')}>
              去做测评
            </SpringButton>
          }
        />
      </div>
    );
  }

  const color = FAMILY_COLORS[report.family];
  const section = report.sections.find((s) => s.sectionKey === sectionId);

  // 章节不存在
  if (!section) {
    return (
      <div className="py-16">
        <EmptyState
          icon="search"
          title="找不到这个章节"
          description="该章节可能已调整，返回报告页查看全部内容。"
          action={
            <SpringLink to={`/app/report/${report.id}`} variant="primary">
              返回报告
            </SpringLink>
          }
        />
      </div>
    );
  }

  const idx = report.sections.findIndex((s) => s.sectionKey === sectionId);
  const prev = report.sections[idx - 1];
  const next = report.sections[idx + 1];

  return (
    <article className="mx-auto max-w-3xl pb-20">
      <div className="mb-4">
        <BackButton to={`/app/report/${report.id}`} label="返回报告" />
      </div>

      <SectionHeading
        size="lg"
        eyebrow={`${report.mbtiType} · ${FAMILY_LABEL[report.family]}`}
        title={section.title}
      />

      {section.paid && section.content == null ? (
        // 付费锁态段
        <Card padding="lg" className="mt-10 flex flex-col items-center gap-4 text-center">
          <span
            className="rounded-full px-4 py-1.5 text-sm font-semibold"
            style={{ backgroundColor: `${color}14`, color }}
          >
            该章节为付费内容
          </span>
          <p className="max-w-md font-serif leading-relaxed text-neutral-600">
            解锁完整报告后，即可阅读「{section.title}」的深度解读——把人格优势转化为现实选择。
          </p>
          <SpringLink to={`/pricing?reportId=${report.id}`} variant="accent">
            解锁完整报告
          </SpringLink>
        </Card>
      ) : (
        <Reveal className="mt-10" deps={[section.sectionKey]}>
          <Quote size="md" className="text-left">
            {report.summary}
          </Quote>
          <Card padding="lg" className="mt-8">
            <div className="flex items-center gap-2">
              <span className="h-6 w-1.5 rounded-full" style={{ background: color }} />
              <h2 className="font-display text-xl font-bold text-brand-primary-950">
                {section.title}
              </h2>
            </div>
            <p className="mt-5 whitespace-pre-line text-base leading-loose text-neutral-700">
              {section.content}
            </p>
          </Card>
        </Reveal>
      )}

      {/* 章节导航 */}
      <nav className="mt-10 flex items-center justify-between gap-3 border-t border-neutral-200 pt-6 text-sm">
        {prev ? (
          <SpringLink to={`/app/report/${report.id}/section/${prev.sectionKey}`} variant="ghost">
            ← {prev.title}
          </SpringLink>
        ) : (
          <span />
        )}
        {next ? (
          <SpringLink to={`/app/report/${report.id}/section/${next.sectionKey}`} variant="ghost">
            {next.title} →
          </SpringLink>
        ) : (
          <span />
        )}
      </nav>
    </article>
  );
}

export default ReportSectionPage;