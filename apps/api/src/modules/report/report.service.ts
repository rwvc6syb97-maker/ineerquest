import { Injectable, Logger } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { BizCode, BizException } from '../../common/response';
import { AnalyticsService, EventType } from '../analytics/analytics.service';
import { buildSections, DimensionScores, getProfile } from './report-content.builder';
import {
  DIMENSION_POLES,
  PAID_SECTION_KEYS,
  REPORT_DAILY_QUOTA,
  REPORT_QUOTA_REDIS_PREFIX,
  ReportStatus,
  ReportType,
  SHARE_CODE_ALPHABET,
  deriveFamily,
  mapGenerateStatus,
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

  // ============ B1 提交测评时同步创建报告（无配额、幂等） ============

  /**
   * ensureReport：测评提交完成后同步创建一条基础报告并返回其 id（B1/B2/B5）。
   * - 幂等：同一 resultId 已有未删报告则直接复用（不重复创建）。
   * - 不消耗每日报告配额（配额仅约束用户主动“生成报告”入口 POST /reports）。
   * - 事务内写 report 主表 + 免费预览 report_section，status=READY 以便前端提交后立即可预览，
   *   规避“跳转报告页即 404”的竞态（不再懒创建报告主记录）。
   * @returns reportId 字符串；resultId 不存在或并发回读仍未命中返回 null。
   *   注意（PM 终裁 §13.2 B8）：submit 正常成功路径 result 必存在，调用方须将 null 视为提交失败并抛 5xxx；
   *   并发唯一约束命中后回读到既有 report 属正常成功（返非空 id），不算失败。null 仅保留历史/极端回读场景。
   */
  async ensureReport(userId: string, recordId: string): Promise<string | null> {
    const result = await this.prisma.assessmentResult.findFirst({
      where: { recordId: BigInt(recordId), userId: BigInt(userId) },
    });
    if (!result) return null;

    const existed = await this.prisma.report.findFirst({
      where: { resultId: result.id, isDeleted: 0 },
      select: { id: true },
    });
    if (existed) return existed.id.toString();

    const scores: DimensionScores = {
      EI: Number(result.scoreEi),
      SN: Number(result.scoreSn),
      TF: Number(result.scoreTf),
      JP: Number(result.scoreJp),
    };
    // 免费预览段不依赖 LLM；深度段走占位（提交阶段不触发深度生成，保持轻量）
    const sections = buildSections(result.mbtiType, scores);
    const reportNo = this.genReportNo();
    try {
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
      return report.id.toString();
    } catch {
      // resultId 唯一约束并发命中：回读既有报告
      const again = await this.prisma.report.findFirst({
        where: { resultId: result.id, isDeleted: 0 },
        select: { id: true },
      });
      return again ? again.id.toString() : null;
    }
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

  /**
   * POST /reports/:id/generate：触发 LLM 深度生成（§6.1 #4）。
   * - 已生成报告且 status=READY 时幂等返回
   * - 生成中（status=GENERATING）抛 4303
   * - 生成失败（status=FAILED）允许重试
   * - 入参 sections 可选，默认全部三段
   */
  async generateDeepContent(userId: string, reportId: string, sectionKeys?: string[]) {
    const report = await this.prisma.report.findFirst({
      where: { id: BigInt(reportId), userId: BigInt(userId), isDeleted: 0 },
    });
    if (!report) {
      throw new BizException(BizCode.ASSESSMENT_RECORD_NOT_FOUND, '报告不存在或无权访问');
    }

    // 生成中 → 4303
    if (report.status === ReportStatus.GENERATING) {
      throw new BizException(BizCode.REPORT_GENERATING, '报告正在生成中，请稍后查看');
    }

    // 已就绪 → 幂等返回。B7 契约：仅当深度段确有 LLM 实际写回内容（fallback=false）才返 done，
    // 否则（基础报告仅占位）返 pending，语义与 GET /reports/:id 一致。
    if (report.status === ReportStatus.READY) {
      const paidSections = await this.prisma.reportSection.findMany({
        where: { reportId: report.id, sectionKey: { in: PAID_SECTION_KEYS } },
        select: { content: true },
      });
      const hasGenerated = paidSections.some(
        (s) => (s.content as { fallback?: boolean } | null)?.fallback === false,
      );
      return {
        reportId: report.id.toString(),
        generateStatus: hasGenerated ? 'done' : 'pending',
        message: hasGenerated ? '报告已生成完毕' : '深度解读尚未生成',
      };
    }

    // 失败 → 允许重试，先置为 GENERATING
    const targetKeys = (sectionKeys?.length ?? 0) > 0
      ? sectionKeys!.filter((k) => PAID_SECTION_KEYS.includes(k))
      : PAID_SECTION_KEYS;

    await this.prisma.report.update({
      where: { id: report.id },
      data: { status: ReportStatus.GENERATING },
    });

    // 异步触发 LLM（fire-and-forget，不阻塞响应）
    this.triggerDeepGeneration(report.mbtiType, report.id, targetKeys, userId).catch((err) => {
      this.logger.error(`deep generation failed for report ${reportId}: ${(err as Error).message}`);
      // 失败后回写 status=FAILED
      this.prisma.report.update({
        where: { id: report.id },
        data: { status: ReportStatus.FAILED },
      }).catch(() => {});
    });

    return {
      reportId: report.id.toString(),
      generateStatus: 'generating',
      taskId: `deep-gen-${report.id}-${Date.now()}`,
      targetSections: targetKeys,
    };
  }

  /**
   * 异步触发 LLM 深度生成并回写 report_section.content。
   * 失败时回写 report.status=FAILED。
   */
  private async triggerDeepGeneration(
    mbtiType: string,
    reportId: bigint,
    sectionKeys: string[],
    userId: string,
  ) {
    // 获取维度得分（用于 LLM context）
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { result: true },
    });
    if (!report?.result) return;

    const scores: DimensionScores = {
      EI: Number(report.result.scoreEi),
      SN: Number(report.result.scoreSn),
      TF: Number(report.result.scoreTf),
      JP: Number(report.result.scoreJp),
    };

    const sceneTitles: Record<string, string> = {
      deep_personality: '深度性格解读',
      career_advice: '职业发展建议',
      relationship: '人际关系解读',
    };

    for (const key of sectionKeys) {
      const topic = sceneTitles[key] ?? key;
      try {
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

        if (!res.degraded && res.text && res.text.trim()) {
          // 回写 section content
          await this.prisma.reportSection.updateMany({
            where: { reportId, sectionKey: key },
            data: { content: { text: res.text } },
          });
        }
      } catch (err) {
        this.logger.warn(`deep generation degraded for ${key}: ${(err as Error).message}`);
      }
    }

    // 全部完成后置 status=READY
    await this.prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.READY, generatedAt: new Date() },
    });
  }

  // ============ T1-15 报告查询 ============

  /**
   * GET /reports/:id：报告所有者查看。
   * 未解锁时仅返回预览段落（付费段落被过滤，附 locked 标记）。
   */
  async getReportForOwner(userId: string, reportId: string, sectionKey?: string) {
    const report = await this.prisma.report.findFirst({
      where: { id: BigInt(reportId), userId: BigInt(userId), isDeleted: 0 },
      include: {
        sections: { orderBy: { sortOrder: 'asc' } },
        result: true, // 反查 recordId 与维度得分（PM v2.1 §6.2①）
      },
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
        // 契约 v2.1：content 为 string | null。DB 中 content 存 Json 对象，
        // 此处统一渲染为可读文本，避免前端把对象当 React 子节点渲染（React error #31）。
        content: this.renderSectionContent(s.sectionKey, s.content),
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

    // ---- 契约 v2.1 顶层结构组装（后端渲染，前端不得反解） ----
    return this.buildReportOverview(report, sections, lockedSectionKeys, unlocked);
  }

  /**
   * GET /reports：报告所有者列表（PM 裁定 P0）。
   * userId 隔离 + 软删除过滤 + 分页；list 项复用 GET /reports/:id 概览 Report 结构。
   * 未解锁报告仅返回预览段落（付费段落被过滤，附 lockedSectionKeys）。
   */
  async listReportsForOwner(userId: string, page = 1, pageSize = 10) {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safeSize = Math.min(50, Math.max(1, Math.floor(Number(pageSize) || 10)));
    const where = { userId: BigInt(userId), isDeleted: 0 };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        include: {
          sections: { orderBy: { sortOrder: 'asc' } },
          result: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeSize,
        take: safeSize,
      }),
    ]);

    const list = rows.map((report) => {
      const unlocked = report.isUnlocked === 1;
      const sections = report.sections
        .filter((s) => unlocked || !PAID_SECTION_KEYS.includes(s.sectionKey))
        .map((s) => ({
          sectionKey: s.sectionKey,
          title: s.title,
          content: this.renderSectionContent(s.sectionKey, s.content),
          sortOrder: s.sortOrder,
          paid: PAID_SECTION_KEYS.includes(s.sectionKey),
        }));
      const lockedSectionKeys = unlocked
        ? []
        : report.sections
            .filter((s) => PAID_SECTION_KEYS.includes(s.sectionKey))
            .map((s) => s.sectionKey);
      return this.buildReportOverview(report, sections, lockedSectionKeys, unlocked);
    });

    return { list, total, page: safePage, pageSize: safeSize };
  }

  /**
   * 契约 v2.1 顶层概览结构组装（后端渲染，前端不得反解）。
   * 详情(getReportForOwner)与列表(listReportsForOwner)共用，保证结构一致。
   */
  private buildReportOverview(
    report: {
      id: bigint;
      reportNo: string;
      mbtiType: string;
      status: number;
      isUnlocked: number;
      createdAt: Date;
      summary: unknown;
      result: { recordId: bigint; scoreEi: unknown; scoreSn: unknown; scoreTf: unknown; scoreJp: unknown };
      sections: Array<{ sectionKey: string; content: unknown }>;
    },
    sections: Array<{ sectionKey: string; title: string; content: string | null; sortOrder: number; paid: boolean }>,
    lockedSectionKeys: string[],
    unlocked: boolean,
  ) {
    const family = deriveFamily(report.mbtiType);
    const dimensions = this.buildDimensionScores(report.result);
    const summary = this.renderSummaryText(report.mbtiType, family, report.summary);
    // B7 契约：付费段 content.fallback === false 才视为已实际生成，否则 generateStatus 恒 pending。
    const hasGeneratedPaidSection = report.sections.some(
      (s) =>
        PAID_SECTION_KEYS.includes(s.sectionKey) &&
        (s.content as { fallback?: boolean } | null)?.fallback === false,
    );
    const generateStatus = hasGeneratedPaidSection ? mapGenerateStatus(report.status) : 'pending';

    return {
      id: report.id.toString(),
      recordId: report.result.recordId.toString(),
      reportNo: report.reportNo,
      mbtiType: report.mbtiType,
      family,
      summary,
      dimensions,
      generateStatus,
      sections,
      lockedSectionKeys,
      isUnlocked: unlocked,
      createdAt: report.createdAt.toISOString(),
    };
  }

  /**
   * 组装契约固定 4 项维度结构：{ dimension, left, right, score }。
   * score 取自 assessment_result 各维度得分（0~100，偏向 right 极百分比）。
   */
  private buildDimensionScores(result: {
    scoreEi: unknown;
    scoreSn: unknown;
    scoreTf: unknown;
    scoreJp: unknown;
  }): Array<{ dimension: string; left: string; right: string; score: number }> {
    const scoreMap: Record<'EI' | 'SN' | 'TF' | 'JP', number> = {
      EI: Number(result.scoreEi),
      SN: Number(result.scoreSn),
      TF: Number(result.scoreTf),
      JP: Number(result.scoreJp),
    };
    return DIMENSION_POLES.map((p) => ({
      dimension: p.dimension,
      left: p.left,
      right: p.right,
      score: Math.round(Math.max(0, Math.min(100, scoreMap[p.dimension] || 0))),
    }));
  }

  /**
   * 后端渲染概览文案（string）。summary 列历史存 Json，此处统一转为可读文本，
   * 避免前端 summary.slice 对对象取值报错（PM v2.1）。
   */
  private renderSummaryText(mbtiType: string, family: string, raw: unknown): string {
    const profile = getProfile(mbtiType);
    return `${mbtiType} · ${profile.nickname}。${profile.overview}`;
  }

  /**
   * 概览章节 content 渲染为可读文本（契约 v2.1：content 为 string | null）。
   * DB 中 content 列存 Json 对象（见 report-content.builder.ts），不同章节结构不同：
   *  - 类型概述     { mbtiType, nickname, overview }
   *  - 四维度得分   { dimensions: [{ dimension, title, leaning, percent }] }
   *  - 核心优势     { strengths: string[] }
   *  - 付费深度段   { text, fallback }
   * 统一转文本，避免前端把对象当 React 子节点渲染（React error #31）。
   */
  private renderSectionContent(sectionKey: string, raw: unknown): string | null {
    if (raw == null) return null;
    if (typeof raw === 'string') return raw;
    if (typeof raw !== 'object') return String(raw);

    const c = raw as Record<string, unknown>;

    // 付费深度段 / LLM 文本
    if (typeof c.text === 'string') return c.text;

    // 类型概述
    if (typeof c.overview === 'string') return c.overview;

    // 核心优势
    if (Array.isArray(c.strengths)) {
      return (c.strengths as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .join('\n');
    }

    // 四维度得分
    if (Array.isArray(c.dimensions)) {
      return (c.dimensions as Array<Record<string, unknown>>)
        .map((d) => {
          const title = typeof d.title === 'string' ? d.title : String(d.dimension ?? '');
          const leaning = typeof d.leaning === 'string' ? d.leaning : '';
          const percent = typeof d.percent === 'number' ? `（${d.percent}%）` : '';
          return `${title}：${leaning}${percent}`.trim();
        })
        .join('\n');
    }

    // 兜底：无法识别的结构不下发对象，避免前端渲染报错
    return null;
  }

  /**
   * GET /reports/:id/sections：章节列表（§6.1 #2）。
   * 返回所有章节，免费/付费标记 + 未解锁时付费章节内容置空。
   */
  async getSectionsForOwner(userId: string, reportId: string) {
    const report = await this.prisma.report.findFirst({
      where: { id: BigInt(reportId), userId: BigInt(userId), isDeleted: 0 },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!report) {
      throw new BizException(BizCode.ASSESSMENT_RECORD_NOT_FOUND, '报告不存在或无权访问');
    }
    const unlocked = report.isUnlocked === 1;

    return report.sections.map((s) => ({
      sectionKey: s.sectionKey,
      title: s.title,
      isFree: s.isFree === 1,
      paid: PAID_SECTION_KEYS.includes(s.sectionKey),
      sortOrder: s.sortOrder,
      // 未解锁时付费章节内容置空，前端展示锁图标
      content: unlocked || !PAID_SECTION_KEYS.includes(s.sectionKey) ? s.content : null,
    }));
  }

  /**
   * GET /reports/:id/sections/:sectionKey：章节详情（§6.1 #3）。
   * 付费章节需已解锁，否则抛 4302。
   */
  async getSectionDetail(userId: string, reportId: string, sectionKey: string) {
    const report = await this.prisma.report.findFirst({
      where: { id: BigInt(reportId), userId: BigInt(userId), isDeleted: 0 },
    });
    if (!report) {
      throw new BizException(BizCode.ASSESSMENT_RECORD_NOT_FOUND, '报告不存在或无权访问');
    }

    const section = await this.prisma.reportSection.findFirst({
      where: { reportId: report.id, sectionKey },
    });
    if (!section) {
      throw new BizException(BizCode.REPORT_SECTION_NOT_FOUND, '章节不存在');
    }

    // 付费章节未解锁 → 4302
    if (PAID_SECTION_KEYS.includes(sectionKey) && report.isUnlocked !== 1) {
      this.analytics.fire({
        userId,
        eventType: EventType.REPORT_UNLOCK_VIEW_BLOCKED,
        properties: { reportId, sectionKey },
      });
      throw new BizException(BizCode.REPORT_LOCKED, '该段落需解锁后查看');
    }

    this.analytics.fire({ userId, eventType: EventType.REPORT_SECTION_VIEW, properties: { reportId, sectionKey } });

    return {
      sectionKey: section.sectionKey,
      title: section.title,
      isFree: section.isFree === 1,
      paid: PAID_SECTION_KEYS.includes(sectionKey),
      content: section.content,
      sortOrder: section.sortOrder,
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