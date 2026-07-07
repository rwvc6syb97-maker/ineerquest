import { Injectable, Logger } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { BizCode, BizException } from '../../common/response';
import { AnalyticsService, EventType } from '../analytics/analytics.service';
import { buildSections, DimensionScores } from './report-content.builder';
import {
  PAID_SECTION_KEYS,
  REPORT_DAILY_QUOTA,
  REPORT_QUOTA_REDIS_PREFIX,
  ReportStatus,
  ReportType,
  SHARE_CODE_ALPHABET,
} from './report.constants';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import { REPORT_DEEP_PROMPT } from '../llm-gateway/llm-gateway.constants';

/**
 * T1-14 / T1-15 / T1-17 报告服务。
 * - 生成报告：写 report / report_section（含免预览 + 付费占位），报告数 3 表之二，
 *   分享写 report_share（第 3 表）。
 * - 每日 3 份配额：Redis 日计数器，超限抛 40003；无 Redis 时降级放行标 blocked。
 * - 查询：未解锁仅返回预览段；访问付费段返回 40002。
 */
@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly analytics: AnalyticsService,
    private readonly llm: LlmGatewayService,
  ) {}

  // ============ 号码/码生成 ============

  private genReportNo(): string {
    const now = new Date();
    const p = (n: number) => n.toString().padStart(2, '0');
    const prefix =
      p(now.getFullYear() % 100) +
      p(now.getMonth() + 1) +
      p(now.getDate()) +
      p(now.getHours()) +
      p(now.getMinutes());
    const raw = randomBytes(13);
    let rand = '';
    for (let i = 0; i < 13; i++) rand += SHARE_CODE_ALPHABET[raw[i] % SHARE_CODE_ALPHABET.length];
    return `RP${prefix}${rand}`.slice(0, 24);
  }

  private genShareCode(): string {
    const raw = randomBytes(16);
    let code = '';
    for (let i = 0; i < 16; i++) code += SHARE_CODE_ALPHABET[raw[i] % SHARE_CODE_ALPHABET.length];
    return code;
  }

  // ============ T1-14 每日配额（Redis 日计数器） ============

  /**
   * 检查并占用一次日配额。基于 Redis INCR + EXPIRE 到当天 24:00。
   * 超限抛 40003；无 Redis 实例时 try-catch 降级放行（标 blocked）。
   */
  private async consumeDailyQuota(userId: string): Promise<{ used: number; blocked: boolean }> {
    const day = new Date().toISOString().slice(0, 10);
    const key = `${REPORT_QUOTA_REDIS_PREFIX}${userId}:${day}`;
    try {
      const used = await this.redis.raw.incr(key);
      if (used === 1) {
     // 到当天结束的秒数
        const now = new Date();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
        const ttl = Math.max(60, Math.ceil((end.getTime() - now.getTime()) / 1000));
        await this.redis.raw.expire(key, ttl);
      }
      if (used > REPORT_DAILY_QUOTA) {
        // 回退计数，避免超限后仍累加
        await this.redis.raw.decr(key);
        throw new BizException(BizCode.REPORT_DAILY_LIMIT, '今日报告生成次数已达上限（3 份/天）');
      }
      return { used, blocked: false };
    } catch (err) {
      if (err instanceof BizException) throw err;
      // TODO(blocked): 无真实 Redis 实例时降级放行，不阻断报告生成
      this.logger.warn(`report quota degraded(blocked): ${(err as Error).message}`);
      return { used: 0, blocked: true };
    }
  }

  // ============ T1-14 生成报告 ============

  /**
   * POST /reports：依据测评结果生成报告，写 report + report_section（3 表之二）。
   * 免费预览段不依赖 LLM；深度段走占位/兜底（LLM 不可用不阻断）。
   */
  async generate(userId: string, recordId: string) {
    // 1) 定位测评果（校验归属）
    const result = await this.prisma.assessmentResult.findFirst({
      where: { recordId: BigInt(recordId), userId: BigInt(userId) },
    });
    if (!result) {
      throw new BizException(BizCode.ASSESSMENT_RECORD_NOT_FOUND, '测评结果不存在或无权访问');
    }

    // 2) 幂等：同一 result 已有报告则直接返回
    const existed = await this.prisma.report.findFirst({
      where: { resultId: result.id, isDeleted: 0 },
    });
    if (existed) {
      return this.getReportForOwner(userId, existed.id.toString());
    }

    // 3) 日配额校验（3 份/天）
    const quota = await this.consumeDailyQuota(userId);

    // 4) 组装内容（免费预览 + 付费占位；LLM 深度解读走兜底）
    const scores: DimensionScores = {
      EI: Number(result.scoreEi),
      SN: Number(result.scoreSn),
      TF: Number(result.scoreTf),
      JP: Number(result.scoreJp),
    };
    // 接入 LLMGateway（T3-01）生成深度文本；网关内部超时重试/熔断/限流均降级不阻塞，
    // 返回 undefined 或兜底文案时 buildSections 走 DEEP_SECTION_FALLBACK 占位。
    const llmDeepText = await this.tryGenerateDeepText(result.mbtiType, scores, userId);
    const sections = buildSections(result.mbtiType, scores, llmDeepText);

    // 5) 事务写 report 主表 + report_section
    const reportNo = this.genReportNo();
    const report = await this.prisma.$transaction(async (tx) => {
      const r = await tx.report.create({
        data: {
          reportNo,
          userId: BigInt(userId),
          resultId: result.id,
          reportType: ReportType.BASIC,
          mbtiType: result.mbtiType,
          status: ReportStatus.READY,
          isUnlocked: 0,
          summary: { mbtiType: result.mbtiType, scores } as any,
          generatedAt: new Date(),
        },
      });
      await tx.reportSection.createMany({
        data: sections.map((s) => ({
          reportId: r.id,
          sectionKey: s.sectionKey,
          title: s.title,
          content: s.content as any,
          sortOrder: s.sortOrder,
        })),
      });
      return r;
    });

    // 6) 埋点（fire-and-forget）
    this.analytics.fire({
      userId,
      eventType: EventType.REPORT_GENERATE,
      properties: { reportId: report.id.toString(), mbtiType: result.mbtiType, quotaBlocked: quota.blocked },
    });

    return this.getReportForOwner(userId, report.id.toString());
  }

  /**
   * 经 LLMGateway（T3-01）为三个付费段落生成深度解读文本。
   * 网关内部已处理超时重试(>10s)/熔断降级(>30s)/Redis 限流，均降级不阻塞：
   * 任一段落 degraded 时返回兜底文本，此处过滤掉降级段落 → buildSections 走 DEEP_SECTION_FALLBACK。
   * 真实 LLM 通道为 blocked（无 Key），默认 mock 输出；见《阶段3-人工调试待办清单.md》。
   */
  private async tryGenerateDeepText(
    mbtiType: string,
    scores: DimensionScores,
    userId: string,
  ): Promise<Record<string, string> | undefined> {
    const sceneTitles: Record<string, string> = {
      deep_personality: '深度性格解读',
      career_advice: '职业发展建议',
      relationship: '人际关系解读',
    };
    try {
      const out: Record<string, string> = {};
      for (const key of PAID_SECTION_KEYS) {
        const topic = sceneTitles[key] ?? key;
        const res = await this.llm.chat({
          prompt: {
            system: REPORT_DEEP_PROMPT.system,
            role: REPORT_DEEP_PROMPT.role,
            context: `用户 MBTI 类型：${mbtiType}；四维度得分：EI=${scores.EI} SN=${scores.SN} TF=${scores.TF} JP=${scores.JP}。`,
            user: `请围绕「${topic}」为该用户输出一段专业、具体、可执行的深度解读。`,
          },
          callerId: userId,
          scene: `report:${key}`,
        });
        // 仅采用非降级、非空的文本；降级段落交由 buildSections 走兜底占位
        if (!res.degraded && res.text && res.text.trim()) {
          out[key] = res.text;
        }
      }
      return Object.keys(out).length > 0 ? out : undefined;
    } catch (err) {
      this.logger.warn(`llm deep text degraded(blocked): ${(err as Error).message}`);
      return undefined;
    }
  }

  // ============ T1-15 报告查询 ============

  /**
   * GET /reports/:id：报告所有者查看。
   * 未解锁时仅返回预览段落（付费段落被过滤，附 locked 标记）。
   */
  async getReportForOwner(userId: string, reportId: string, sectionKey?: string) {
    const report = await this.prisma.report.findFirst({
      where: { id: BigInt(reportId), userId: BigInt(userId), isDeleted: 0 },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!report) {
      throw new BizException(BizCode.ASSESSMENT_RECORD_NOT_FOUND, '报告不存在或无权访问');
    }
    const unlocked = report.isUnlocked === 1;

    // 访问指定付费段落但未解锁 → 40002
    if (sectionKey && PAID_SECTION_KEYS.includes(sectionKey) && !unlocked) {
      this.analytics.fire({
        userId,
        eventType: EventType.REPORT_UNLOCK_VIEW_BLOCKED,
        properties: { reportId, sectionKey },
      });
      throw new BizException(BizCode.REPORT_LOCKED, '该段落需解锁后查看');
    }

    // 未解锁：仅返回预览段落
    const sections = report.sections
      .filter((s) => unlocked || !PAID_SECTION_KEYS.includes(s.sectionKey))
      .map((s) => ({
        sectionKey: s.sectionKey,
        title: s.title,
        content: s.content,
        sortOrder: s.sortOrder,
        paid: PAID_SECTION_KEYS.includes(s.sectionKey),
      }));

    // 被隐藏的付费段落列表（前端可提示解锁）
    const lockedSectionKeys = unlocked
      ? []
      : report.sections
          .filter((s) => PAID_SECTION_KEYS.includes(s.sectionKey))
          .map((s) => s.sectionKey);

    this.analytics.fire({ userId, eventType: EventType.REPORT_VIEW, properties: { reportId } });

    return {
      id: report.id.toString(),
      reportNo: report.reportNo,
      mbtiType: report.mbtiType,
      reportType: report.reportType,
      status: report.status,
      isUnlocked: unlocked,
      summary: report.summary,
      sections,
      lockedSectionKeys,
      generatedAt: report.generatedAt,
    };
  }

  // ============ T1-17 报告分享/海报 ============

  /**
   * POST /reports/:id/share：生成分享链接与海报数据，写 report_share。
   */
  async createShare(userId: string, reportId: string, channel?: number) {
    const report = await this.prisma.report.findFirst({
      where: { id: BigInt(reportId), userId: BigInt(userId), isDeleted: 0 },
    });
    if (!report) {
      throw new BizException(BizCode.ASSESSMENT_RECORD_NOT_FOUND, '报告不存在或无权访问');
    }

    let shareCode = this.genShareCode();
    for (let i = 0; i < 3; i++) {
      const dup = await this.prisma.reportShare.findFirst({
        where: { shareCode },
        select: { id: true },
      });
      if (!dup) break;
      shareCode = this.genShareCode();
    }

    const expireAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const share = await this.prisma.reportShare.create({
      data: {
        reportId: report.id,
        userId: BigInt(userId),
        shareCode,
        channel: channel ?? null,
        posterUrl: null, // TODO(blocked): 海报图片生成/上传 OSS，无实例时前端用海报数据自渲染
        expireAt,
      },
    });

    this.analytics.fire({
      userId,
      eventType: EventType.REPORT_SHARE,
      properties: { reportId, shareCode, channel: channel ?? null },
    });

    // 海报数据（前端可自渲染），链接由前端域名拼接
    const posterData = {
      mbtiType: report.mbtiType,
      reportNo: report.reportNo,
      shareCode,
      title: `我的 MBTI 类型是 ${report.mbtiType}`,
    };

    return {
      shareId: share.id.toString(),
      shareCode,
      shareUrl: `/s/${shareCode}`,
      posterUrl: share.posterUrl,
      posterData,
      expireAt,
    };
  }

  // ============ T2-05 报告解锁 ============

  /**
   * POST /reports/:id/unlock：在支付成功后置报告 isUnlocked=1。
   * - 已解锁：幂等返回。
   * - 未解锁且无已支付订单：抛 40002（需先完成支付；正常路径由支付回调自动解锁）。
   * 主解锁路径在 PaymentService.handleCallback 事务内完成，此接口用于前端主动确认/补偿。
   */
  async unlock(userId: string, reportId: string) {
    const report = await this.prisma.report.findFirst({
      where: { id: BigInt(reportId), userId: BigInt(userId), isDeleted: 0 },
    });
    if (!report) {
      throw new BizException(BizCode.ASSESSMENT_RECORD_NOT_FOUND, '报告不存在或无权访问');
    }
    if (report.isUnlocked === 1) {
      return { reportId, isUnlocked: true, alreadyUnlocked: true };
    }

    const paidOrder = await this.prisma.paymentOrder.findFirst({
      where: { bizType: 1, bizId: report.id, userId: BigInt(userId), status: 2, isDeleted: 0 },
      select: { id: true },
    });
    if (!paidOrder) {
      throw new BizException(BizCode.REPORT_LOCKED, '报告未解锁，请先完成支付');
    }

    await this.prisma.report.update({
      where: { id: report.id },
      data: { isUnlocked: 1, orderId: paidOrder.id },
    });

    this.analytics.fire({
      userId,
      eventType: EventType.REPORT_UNLOCK,
      properties: { reportId, orderId: paidOrder.id.toString() },
    });

    return { reportId, isUnlocked: true, alreadyUnlocked: false };
  }

  // ============ T2-06 报告 PDF 导出（pdfkit + 中文字体） ============

  /**
   * GET /reports/:id/export：导出报告 PDF。
   * - 未解锁 → 40002。使用 pdfkit + 系统 SimHei 中文字体。
   */
  async exportPdf(userId: string, reportId: string) {
    const report = await this.prisma.report.findFirst({
      where: { id: BigInt(reportId), userId: BigInt(userId), isDeleted: 0 },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!report) {
      throw new BizException(BizCode.ASSESSMENT_RECORD_NOT_FOUND, '报告不存在或无权访问');
    }
    if (report.isUnlocked !== 1) {
      throw new BizException(BizCode.REPORT_LOCKED, '报告未解锁，无法导出');
    }

    const pdf = await this.buildPdf(report.reportNo, report.mbtiType, report.sections);

    this.analytics.fire({
      userId,
      eventType: EventType.REPORT_EXPORT,
      properties: { reportId },
    });

    return {
      fileName: `report-${report.reportNo}.pdf`,
      contentType: 'application/pdf',
      base64: pdf.toString('base64'),
    };
  }

  /** 使用 pdfkit 生成含中文的 PDF */
  private async buildPdf(
    reportNo: string,
    mbtiType: string,
    sections: Array<{ title: string; content: unknown; sectionKey: string }>,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new (PDFDocument as any)({ size: 'A4', margin: 50, bufferPages: true }) as typeof PDFDocument;
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // 加载中文字体
      const fontPath = this.resolveCjkFont();
      if (fontPath && fs.existsSync(fontPath)) {
        doc.registerFont('CJK', fontPath);
        this.logger.log(`PDF using CJK font: ${fontPath}`);
      } else {
        this.logger.warn('CJK font not found, Chinese text may render as boxes');
      }
      const font = fontPath && fs.existsSync(fontPath) ? 'CJK' : 'Helvetica';

      // 标题
      doc.font(font).fontSize(20).text('InnerQuest 向内求索', { align: 'center' });
      doc.fontSize(12).text(`报告编号：${reportNo}`, { align: 'center' });
      doc.fontSize(12).text(`MBTI 类型：${mbtiType}`, { align: 'center' });
      doc.moveDown();

      // 分割线
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
      doc.moveDown(0.5);

      // 章节内容
      for (const section of sections) {
        // 检查是否换页
        if (doc.y > 700) doc.addPage();

        doc.font(font).fontSize(14).text(section.title, { underline: true });
        doc.moveDown(0.3);

        const text = this.extractSectionText(section.content);
        const paragraphs = text.split('\n').filter((p) => p.trim());

        for (const para of paragraphs) {
          if (doc.y > 760) doc.addPage();
          doc.font(font).fontSize(10).text(para, { lineGap: 4 });
          doc.moveDown(0.2);
        }
        doc.moveDown(0.5);
      }

      // 页脚
      const totalPages = (doc as any).bufferedPageRange?.().count ?? 1;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.font(font).fontSize(8).text(
          `第 ${i + 1} / ${totalPages} 页`,
          50, doc.page.height - 40,
          { align: 'center', width: 495 },
        );
      }

      doc.end();
    });
  }

  /** 解析系统可用的 CJK 字体路径 */
  private resolveCjkFont(): string | null {
    const candidates = [
      'C:/Windows/Fonts/simhei.ttf',       // Windows 黑体
      'C:/Windows/Fonts/STXIHEI.TTF',      // 华文细黑
      'C:/Windows/Fonts/simsun.ttc',       // 宋体
      'C:/Windows/Fonts/STSONG.TTF',       // 华文宋体
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',  // Linux Noto
      '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
      '/System/Library/Fonts/PingFang.ttc', // macOS
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /** 将段落内容提取为可读文本 */
  private extractSectionText(content: unknown): string {
    if (content == null) return '';
    if (typeof content === 'string') return content;
    if (typeof content === 'object') {
      const c = content as Record<string, unknown>;
      return (c.text as string) || (c.overview as string) || JSON.stringify(c);
    }
    return String(content);
  }
}