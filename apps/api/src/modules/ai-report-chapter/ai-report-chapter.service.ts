import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, BizException } from '../../common/response';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import { ReportType } from '../report/report.constants';
import { ChapterFocus, ReportChapterDto, ReportChapterVo } from './ai-report-chapter.dto';

/** 章节主题 → 中文标题/写作侧重。 */
const FOCUS_META: Record<ChapterFocus, { title: string; angle: string }> = {
  career: { title: '职业发展深度扩展', angle: '结合 MBTI 类型给出职业赛道选择、能力构建与晋升路径建议' },
  relationship: { title: '人际关系深度扩展', angle: '分析该类型在协作、沟通与冲突处理中的模式与改进建议' },
  growth: { title: '个人成长深度扩展', angle: '给出该类型的成长盲区、习惯养成与自我突破路径' },
  leadership: { title: '领导力深度扩展', angle: '分析该类型的领导风格、团队管理优势与需规避的陷阱' },
};

/**
 * §3.3 深度报告 AI 扩展章节服务。
 * 护城河/铁律：
 *  - 结果仅写 report_ai_chapter（旁挂表），绝不写 report / report_section 本体表。
 *  - 仅 DEEP 报告可扩展：非 DEEP → 4517。
 *  - 数据隔离：报告不存在 4004；非归属人 4003。
 *  - 统一走 llm-gateway，失败/超时/解析失败 → degraded=true 回退规则版，不白屏。
 */
@Injectable()
export class AiReportChapterService {
  private readonly logger = new Logger(AiReportChapterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGatewayService,
  ) {}

  /**
   * 生成深度报告扩展章节。
   * @throws BizException AI_NOT_FOUND(4004) 报告不存在
   * @throws BizException AI_FORBIDDEN(4003) 越权访问他人报告
   * @throws BizException AI_NEED_DEEP_REPORT(4517) 非深度报告不可扩展
   */
  async generate(userId: string, dto: ReportChapterDto): Promise<ReportChapterVo> {
    // 报告存在校验（不存在 4004）
    const report = await this.prisma.report.findFirst({
      where: { id: BigInt(dto.reportId), isDeleted: 0 },
      select: { id: true, userId: true, reportType: true, mbtiType: true },
    });
    if (!report) {
      throw new BizException(BizCode.AI_NOT_FOUND, '报告不存在或已删除');
    }

    // 归属校验（越权 4003）
    if (report.userId !== BigInt(userId)) {
      throw new BizException(BizCode.AI_FORBIDDEN, '无权访问该报告');
    }

    // DEEP 报告判定（非 DEEP → 4517）
    if (report.reportType !== ReportType.DEEP) {
      throw new BizException(BizCode.AI_NEED_DEEP_REPORT, '扩展章节仅对深度报告开放，请先解锁深度报告');
    }

    const meta = FOCUS_META[dto.focus];

    // 可选聚焦职业（存在才带入 prompt；不阻断）
    let careerName: string | null = null;
    if (dto.focusCareerId) {
      const career = await this.prisma.career.findFirst({
        where: { id: BigInt(dto.focusCareerId), status: 1, isDeleted: 0 },
        select: { name: true },
      });
      careerName = career?.name ?? null;
    }

    // 调 LLM 统一网关（网关内部含超时熔断/限流降级）
    const result = await this.llm.chat({
      prompt: {
        system:
          '你是资深 MBTI 报告撰写专家。请生成一段深度报告扩展章节，严格返回 JSON：' +
          '{"title":"章节标题","paragraphs":["段落1","段落2"]}，不要多余文字。',
        role: 'MBTI 深度报告作者',
        context:
          `报告对象 MBTI 类型：${report.mbtiType}。章节主题：${meta.title}。写作侧重：${meta.angle}。` +
          (careerName ? `聚焦职业：${careerName}。` : ''),
        user: `请围绕「${meta.title}」输出 3~5 个自然段，语言专业且有洞察。`,
      },
      callerId: userId,
      scene: 'ai-report-chapter',
    });

    let parsed: { title: string; paragraphs: string[] } | null = null;
    let degraded = result.degraded;
    if (!degraded && result.text?.trim()) {
      parsed = this.parseChapter(result.text);
    }
    // LLM 失败/超时/解析失败 → 回退规则版
    if (!parsed) {
      parsed = this.fallbackChapter(report.mbtiType, dto.focus);
      degraded = true;
    }

    // 护城河：仅落 report_ai_chapter 旁挂表（reportId/userId 逻辑关联，无物理外键）
    const row = await this.prisma.reportAiChapter.create({
      data: {
        reportId: report.id,
        userId: BigInt(userId),
        focusCareerId: dto.focusCareerId ? BigInt(dto.focusCareerId) : null,
        title: parsed.title,
        paragraphs: parsed.paragraphs as unknown as object,
        degraded: degraded ? 1 : 0,
      },
      select: { id: true },
    });

    return {
      chapterId: row.id.toString(),
      reportId: report.id.toString(),
      title: parsed.title,
      paragraphs: parsed.paragraphs,
      degraded,
    };
  }

  /** 解析 LLM 返回的 JSON；失败返回 null 触发降级。 */
  private parseChapter(text: string): { title: string; paragraphs: string[] } | null {
    try {
      const jsonStr = this.extractJson(text);
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      const title = typeof obj.title === 'string' ? obj.title.trim() : '';
      const paragraphs = Array.isArray(obj.paragraphs)
        ? obj.paragraphs
            .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
            .map((p) => p.trim())
        : [];
      if (!title || paragraphs.length === 0) return null;
      return { title, paragraphs };
    } catch (err) {
      this.logger.warn(`report-chapter parse failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** 从可能含围栏的文本中提取 JSON 段。 */
  private extractJson(text: string): string {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1] : text;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) return body.slice(start, end + 1);
    return body;
  }

  /** 降级兜底：规则版章节（不依赖 LLM，保证 200 不白屏）。 */
  private fallbackChapter(mbtiType: string, focus: ChapterFocus): { title: string; paragraphs: string[] } {
    const meta = FOCUS_META[focus];
    return {
      title: meta.title,
      paragraphs: [
        `作为 ${mbtiType} 类型，你在「${meta.title}」这一维度有其独特优势与成长空间。`,
        `${meta.angle}。建议结合自身实际情况，制定阶段性目标并持续复盘。`,
        '（当前为占位内容，AI 深度撰写服务恢复后将自动补全更具个性化的解读。）',
      ],
    };
  }
}