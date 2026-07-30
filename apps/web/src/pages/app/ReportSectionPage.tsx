/**
 * P10 报告章节详情页（/app/report/:id/section/:sectionId）
 * -------------------------------------------------------------
 * 从报告中取出单个章节深度阅读。免费化：全部章节直接渲染，无付费门禁。
 * 复用 useReport（含 mock 兜底），按 sectionId 匹配 section.sectionKey。
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useReport, useSectionDetail } from '../../hooks/useReport';
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
  // 缺陷1：概览接口对深度付费章节只下发预览/空 content，完整深度内容须走章节详情接口。
  // 已解锁章节用 detail.content 渲染，避免"深度报告无内容展示"。
  const { data: detail } = useSectionDetail(id, sectionId);

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
            {detail?.content ?? section.content}
          </p>
        </Card>
      </Reveal>

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