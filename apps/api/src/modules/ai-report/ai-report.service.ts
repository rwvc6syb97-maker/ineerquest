import { Injectable, Logger } from '@nestjs/common';
import { BizCode, BizException } from '../../common/response';
import { ReportService } from '../report/report.service';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import { PlainTalkDto, PlainTalkVo } from './ai-report.dto';

/** 报告可见章节的最小结构（取自 ReportService.getReportForOwner 概览）。 */
interface OverviewSection {
  sectionKey: string;
  title: string;
  content: string | null;
}

const TONE_ROLE: Record<string, string> = {
  warm: '你是一位温暖、鼓励的职业规划顾问，用亲切口吻把专业报告讲成大白话。',
  plain: '你是一位平实直白的顾问，用最朴素的日常语言解释报告，不堆砌术语。',
  pro: '你是一位专业理性的职业规划顾问，用严谨但易懂的语言解读报告。',
};

/**
 * L-P0-1 报告人话翻译服务。
 * 护城河铁律：仅【只读】报告本体（复用 ReportService.getReportForOwner 做 userId 隔离/软删/归属校验），
 * 绝不写入 report / report_section 任何表；LLM 结果不落库，纯即时增值层。
 * 降级：LLM 失败/超时 → degraded=true + 兜底摘要（HTTP 200，不白屏）。
 */
@Injectable()
export class AiReportService {
  private readonly logger = new Logger(AiReportService.name);

  constructor(
    private readonly reportService: ReportService,
    private readonly llm: LlmGatewayService,
  ) {}

  /**
   * 把报告解读成"人话"。
   * @throws BizException ASSESSMENT_RECORD_NOT_FOUND(4203) 报告不存在/无权访问（由 getReportForOwner 抛出）
   * @throws BizException PLAIN_TALK_SECTION_INVALID(4511) sectionKey 非该报告可见章节
   */
  async plainTalk(userId: string, dto: PlainTalkDto): Promise<PlainTalkVo> {
    const tone = dto.tone ?? 'warm';

    // 只读报告：getReportForOwner 内含 userId 隔离 + 软删过滤 + 归属校验（不存在抛 4203）。
    // 指定付费未解锁章节会抛 REPORT_LOCKED(4302)，语义正确，直接透传。
    const overview = (await this.reportService.getReportForOwner(
      userId,
      dto.reportId,
      dto.sectionKey,
    )) as { mbtiType: string; summary: string; sections: OverviewSection[] };

    const sections = overview.sections ?? [];

    // 指定章节：校验 sectionKey 属于该报告可见章节，否则 4511。
    let targets = sections;
    if (dto.sectionKey) {
      targets = sections.filter((s) => s.sectionKey === dto.sectionKey);
      if (targets.length === 0) {
        throw new BizException(BizCode.PLAIN_TALK_SECTION_INVALID, '该章节不存在或不可见');
      }
    }

    const sourceText = this.buildSourceText(overview.mbtiType, overview.summary, targets);

    // 调 LLM 统一网关（非流式）；网关内部已含超时熔断/限流降级，degraded 会置位。
    const result = await this.llm.chat({
      prompt: {
        system: '把 MBTI 职业报告翻译成普通人一看就懂的"人话"，保留关键结论，去掉术语与套话，控制在 400 字内。',
        role: TONE_ROLE[tone],
        context: sourceText,
        user: '请用人话把上面这份报告讲给我听。',
      },
      callerId: userId,
      scene: 'ai-report-plain-talk',
    });

    // 降级兜底：LLM 返回空文本时用原文摘要，保证前端不白屏。
    const plainText =
      result.degraded || !result.text?.trim()
        ? this.fallbackText(overview.mbtiType, overview.summary, targets)
        : result.text.trim();

    return {
      plainText,
      degraded: result.degraded || !result.text?.trim(),
      degradeReason: result.degradeReason,
    };
  }

  /** 拼接喂给 LLM 的报告素材文本。 */
  private buildSourceText(mbtiType: string, summary: string, sections: OverviewSection[]): string {
    const lines = [`人格类型：${mbtiType}`, `概览：${summary}`];
    for (const s of sections) {
      if (s.content && s.content.trim()) {
        lines.push(`【${s.title}】${s.content.trim()}`);
      }
    }
    return lines.join('\n');
  }

  /** 降级兜底文案：不依赖 LLM，直接由报告原文拼接一段可读摘要。 */
  private fallbackText(mbtiType: string, summary: string, sections: OverviewSection[]): string {
    const parts = [`你的人格类型是 ${mbtiType}。${summary}`];
    const first = sections.find((s) => s.content && s.content.trim());
    if (first?.content) {
      parts.push(first.content.trim().slice(0, 200));
    }
    return parts.join(' ');
  }
}