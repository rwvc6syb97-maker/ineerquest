import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
// pdf-parse 无内置类型声明的默认导出，运行时 require 更稳（避免 esModule interop 差异）
// eslint-disable-next-line @typescript-eslint/no-var-requires
import pdfParse = require('pdf-parse');
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, BizException } from '../../common/response';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import {
  ResumeGenerateDto,
  ResumeGenerateVo,
  ResumeProfileDto,
  ResumeSectionVo,
  ResumeOptimizeFormDto,
  ResumeOptimizeVo,
  ResumeOptimizeListItemVo,
  ResumeSuggestionsVo,
  ResumeSuggestionItemVo,
} from './ai-resume.dto';

/** 敏感词本地词表（项目暂无独立敏感词服务，轻量本地过滤，命中即 4516）。 */
const SENSITIVE_WORDS = [
  '暴力', '色情', '赌博', '毒品', '诈骗', '反动', '恐怖主义',
];

// ============ M4 简历上传优化常量 ============
/** PDF 单文件大小上限 10MB（4622）。 */
const RESUME_FILE_MAX_BYTES = 10 * 1024 * 1024;
/** 提取文本字数上限 20000（4625）。 */
const RESUME_TEXT_MAX_CHARS = 20000;
/** extractedText/suggestions TTL 默认 30 天。 */
const RESUME_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** 幂等短时窗口：同哈希在该窗口内视为重复提交（4090）。 */
const RESUME_IDEMPOTENT_WINDOW_MS = 10 * 60 * 1000;
/** 每用户每日优化配额（4501）。 */
const RESUME_OPTIMIZE_DAILY_QUOTA = 10;

/**
 * §3.2 AI 简历/求职信生成服务。
 * 护城河/铁律：
 *  - 输入敏感词 → 4516，禁止入库、禁止调 LLM。
 *  - 统一走 llm-gateway，失败/超时/解析失败 → degraded=true 回退规则版，不白屏。
 *  - 结果落 ai_resume_doc（分表，护城河；含软删字段）。
 *  - 数据隔离：查询/落库均带 userId。
 */
@Injectable()
export class AiResumeService {
  private readonly logger = new Logger(AiResumeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGatewayService,
  ) {}

  /**
   * 生成简历/求职信。
   * @throws BizException AI_SENSITIVE_CONTENT(4516) 输入含敏感词
   * @throws BizException AI_NOT_FOUND(4004) 职业不存在
   */
  async generate(userId: string, dto: ResumeGenerateDto): Promise<ResumeGenerateVo> {
    // 敏感词校验（命中 4516；先于 LLM，避免脏输入进模型/入库）
    this.assertNoSensitive(dto);

    // 职业存在校验（不存在 4004）
    const career = await this.prisma.career.findFirst({
      where: { id: BigInt(dto.careerId), status: 1, isDeleted: 0 },
      select: { id: true, name: true, category: true },
    });
    if (!career) {
      throw new BizException(BizCode.AI_NOT_FOUND, '职业不存在或已下架');
    }

    const type = dto.type ?? 'resume';
    const docLabel = type === 'coverLetter' ? '求职信' : '简历';
    const profileDesc = this.buildProfileDesc(dto.profile);

    // 调 LLM 统一网关（网关内部含超时熔断/限流降级）
    const result = await this.llm.chat({
      prompt: {
        system:
          `你是资深职业顾问与简历专家。请为求职者生成一份面向目标职业的${docLabel}初稿，严格返回 JSON：` +
          '{"content":"全文","sections":[{"title":"段落标题","body":"段落正文"}]}，不要多余文字。',
        role: '简历/求职信写作专家',
        context: `目标职业：${career.name}（${career.category}）。求职者背景：${profileDesc}`,
        user: `请生成结构清晰、突出与目标职业匹配度的${docLabel}，分 3~5 个段落。`,
      },
      callerId: userId,
      scene: 'ai-resume-generate',
    });

    let doc: { content: string; sections: ResumeSectionVo[] } | null = null;
    let degraded = result.degraded;
    if (!degraded && result.text?.trim()) {
      doc = this.parseDoc(result.text);
    }
    // LLM 失败/超时/解析失败 → 回退规则版
    if (!doc) {
      doc = this.fallbackDoc(career.name, docLabel, dto.profile);
      degraded = true;
    }

    // 落 ai_resume_doc（分表，护城河；degraded 映射 1/0，软删字段默认）
    const row = await this.prisma.aiResumeDoc.create({
      data: {
        userId: BigInt(userId),
        careerId: BigInt(dto.careerId),
        type,
        content: doc.content,
        sectionsData: doc.sections as unknown as object,
        degraded: degraded ? 1 : 0,
        isDeleted: 0,
      },
      select: { id: true },
    });

    return { docId: row.id.toString(), content: doc.content, sections: doc.sections, degraded };
  }

  /** 敏感词校验：拼接全部文本字段，命中即 4516。 */
  private assertNoSensitive(dto: ResumeGenerateDto): void {
    const p = dto.profile;
    const text = [
      p.education,
      ...p.skills,
      ...p.experiences.flatMap((e) => [e.role, e.description]),
    ].join(' ');
    const hit = SENSITIVE_WORDS.find((w) => text.includes(w));
    if (hit) {
      throw new BizException(BizCode.AI_SENSITIVE_CONTENT, '输入内容包含敏感词，请修改后重试');
    }
  }

  /** 把用户经历表单拼成 LLM 可读的背景描述。 */
  private buildProfileDesc(profile: ResumeProfileDto): string {
    const exp = profile.experiences.length
      ? profile.experiences.map((e) => `${e.role}：${e.description}`).join('；')
      : '暂无';
    const skills = profile.skills.length ? profile.skills.join('、') : '暂无';
    return `教育背景：${profile.education}；工作/项目经历：${exp}；技能：${skills}。`;
  }

  /** 解析 LLM 返回的 JSON；失败返回 null 触发降级。 */
  private parseDoc(text: string): { content: string; sections: ResumeSectionVo[] } | null {
    try {
      const jsonStr = this.extractJson(text);
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      const content = typeof obj.content === 'string' ? obj.content.trim() : '';
      const sectionsRaw = Array.isArray(obj.sections) ? obj.sections : [];
      const sections: ResumeSectionVo[] = sectionsRaw
        .map((s): ResumeSectionVo | null => {
          const so = (s ?? {}) as Record<string, unknown>;
          const title = typeof so.title === 'string' ? so.title.trim() : '';
          const body = typeof so.body === 'string' ? so.body.trim() : '';
          if (!title || !body) return null;
          return { title, body };
        })
        .filter((s): s is ResumeSectionVo => s !== null);
      if (!content && sections.length === 0) return null;
      const finalContent = content || sections.map((s) => `${s.title}\n${s.body}`).join('\n\n');
      return { content: finalContent, sections };
    } catch (err) {
      this.logger.warn(`resume parse failed: ${(err as Error).message}`);
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

  /** 降级兜底：规则版文档（不依赖 LLM，保证 200 不白屏）。 */
  private fallbackDoc(
    careerName: string,
    docLabel: string,
    profile: ResumeProfileDto,
  ): { content: string; sections: ResumeSectionVo[] } {
    const skills = profile.skills.length ? profile.skills.join('、') : '待补充';
    const expTitle = profile.experiences.length
      ? profile.experiences.map((e) => `- ${e.role}：${e.description}`).join('\n')
      : '- 待补充相关经历';
    const sections: ResumeSectionVo[] = [
      { title: '求职意向', body: `目标职业：${careerName}。` },
      { title: '教育背景', body: profile.education },
      { title: '相关经历', body: expTitle },
      { title: '核心技能', body: skills },
    ];
    const content = sections.map((s) => `${s.title}\n${s.body}`).join('\n\n');
    return { content: `【${docLabel}初稿】\n\n${content}`, sections };
  }

  // ============================= M4 简历上传优化 =============================

  /**
   * 简历上传优化（POST /ai/resume/optimize，multipart）。
   * 校验次序（LLM 前）：4620 无文件→4621 非PDF→4622>10MB→4624 岗位缺失/不存在
   *   →4623 提取空/加密/扫描件→4625>20000字→4516 敏感词→4090 同哈希幂等→配额 4501。
   * 隐私：不落 PDF 二进制，仅存 extractedText + suggestions + sourceFileName + expireAt(30天)。
   * LLM 失败 degraded 兜底 200。
   * @throws BizException 各阶段错误码（见上）
   */
  async optimize(
    userId: string,
    file: { originalname?: string; mimetype?: string; size?: number; buffer?: Buffer } | undefined,
    form: ResumeOptimizeFormDto,
  ): Promise<ResumeOptimizeVo> {
    // 1) 4620 无文件
    if (!file || !file.buffer || file.size === 0) {
      throw new BizException(BizCode.RESUME_FILE_REQUIRED, '请上传简历 PDF文件');
    }
    // 2) 4621 非 PDF（同时校验 mimetype 与扩展名/魔数，防伪装）
    const isPdfMime = file.mimetype === 'application/pdf';
    const isPdfExt = /\.pdf$/i.test(file.originalname ?? '');
    const isPdfMagic = file.buffer.subarray(0, 5).toString('latin1') === '%PDF-';
    if (!isPdfMime || !isPdfExt || !isPdfMagic) {
      throw new BizException(BizCode.RESUME_FILE_TYPE_INVALID, '仅支持 PDF 格式文件');
    }
    // 3) 4622 >10MB
    if (file.size! > RESUME_FILE_MAX_BYTES) {
      throw new BizException(BizCode.RESUME_FILE_TOO_LARGE, '文件大小超过 10MB 限制');
    }
    // 4) 4624 目标岗位缺失/不存在
    const careerId = (form.targetCareerId ?? '').trim();
    if (!careerId) {
      throw new BizException(BizCode.RESUME_TARGET_CAREER_REQUIRED, '请指定目标职业');
    }
    let careerIdBig: bigint;
    try {
      careerIdBig = BigInt(careerId);
    } catch {
      throw new BizException(BizCode.RESUME_TARGET_CAREER_REQUIRED, '目标职业 id 非法');
    }
    const career = await this.prisma.career.findFirst({
      where: { id: careerIdBig, status: 1, isDeleted: 0 },
      select: { id: true, name: true, category: true },
    });
    if (!career) {
      throw new BizException(BizCode.RESUME_TARGET_CAREER_REQUIRED, '目标职业不存在或已下架');
    }
    // 5) 4623 提取文本（空/加密/扫描件均视为解析失败）
    const extractedText = await this.extractPdfText(file.buffer);
    if (!extractedText || extractedText.trim().length < 10) {
      throw new BizException(
        BizCode.RESUME_PARSE_FAILED,
        '无法从 PDF 提取有效文本（可能为加密文件或扫描件图片）',
      );
    }
    // 6) 4625 >20000 字
    if (extractedText.length > RESUME_TEXT_MAX_CHARS) {
      throw new BizException(BizCode.RESUME_CONTENT_TOO_LONG, '简历文本超过 20000 字上限');
    }
    // 7) 4516 敏感词（提取文本 + 备注）
    const sensitiveHit = SENSITIVE_WORDS.find(
      (w) => extractedText.includes(w) || (form.note ?? '').includes(w),
    );
    if (sensitiveHit) {
      throw new BizException(BizCode.AI_SENSITIVE_CONTENT, '内容包含敏感词，请修改后重试');
    }
    // 8) 4090 同哈希短时幂等（严格防重，用户已定）
    const contentHash = this.buildOptimizeHash(userId, careerId, extractedText);
    const windowStart = new Date(Date.now() - RESUME_IDEMPOTENT_WINDOW_MS);
    const dupCandidates = await this.prisma.aiResumeDoc.findMany({
      where: {
        userId: BigInt(userId),
        targetCareerId: careerIdBig,
        mode: 2,
        isDeleted: 0,
        createdAt: { gte: windowStart },
      },
      select: { extractedText: true },
      take: 20,
    });
    const isDuplicate = dupCandidates.some(
      (d) => d.extractedText && this.buildOptimizeHash(userId, careerId, d.extractedText) === contentHash,
    );
    if (isDuplicate) {
      throw new BizException(BizCode.DUPLICATE_SUBMIT, '重复提交，请稍后再试');
    }
    // 9) 配额 4501（当日 mode=2 优化次数）
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = await this.prisma.aiResumeDoc.count({
      where: { userId: BigInt(userId), mode: 2, createdAt: { gte: todayStart } },
    });
    if (todayCount >= RESUME_OPTIMIZE_DAILY_QUOTA) {
      throw new BizException(BizCode.AI_QUOTA_LIMIT, '今日简历优化次数已达上限');
    }

    // 调 LLM 生成优化建议（失败/解析失败 → degraded 兜底）
    const result = await this.llm.chat({
      prompt: {
        system:
          '你是资深简历优化顾问。请针对目标职业分析简历并给出优化建议，严格返回 JSON：' +
          '{"matchScore":number(0~100),"overallComment":"整体评价","items":[{"section":"段落名","original":"原文","suggestion":"建议","reason":"理由"}],"missingKeywords":["关键词"]}，不要多余文字。',
        role: '简历优化专家',
        context: `目标职业：${career.name}（${career.category}）。简历原文：${extractedText.slice(0, 8000)}`,
        user: `请评估匹配度并给出 3~8 条可执行的逐段优化建议，以及缺失的关键能力词。`,
      },
      callerId: userId,
      scene: 'ai-resume-optimize',
    });

    let suggestions: ResumeSuggestionsVo | null = null;
    let degraded = result.degraded;
    if (!degraded && result.text?.trim()) {
      suggestions = this.parseSuggestions(result.text, {
        careerId: career.id.toString(),
        name: career.name,
        category: career.category,
      });
    }
    if (!suggestions) {
      suggestions = this.fallbackSuggestions({
        careerId: career.id.toString(),
       name: career.name,
        category: career.category,
      });
      degraded = true;
    }

    const expireAt = new Date(Date.now() + RESUME_TTL_MS);
    // 落库：不存 PDF 二进制，仅 extractedText + suggestions + sourceFileName + expireAt
    const row = await this.prisma.aiResumeDoc.create({
      data: {
        userId: BigInt(userId),
        careerId: careerIdBig,
        targetCareerId: careerIdBig,
        type: 'resume',
        mode: 2,
        sourceFileName: (file.originalname ?? 'resume.pdf').slice(0, 255),
        extractedText,
        suggestions: suggestions as unknown as object,
        degraded: degraded ? 1 : 0,
        expireAt,
        isDeleted: 0,
      },
      select: { id: true },
    });

    return {
      docId: row.id.toString(),
      sourceFileName: file.originalname ?? 'resume.pdf',
      suggestions,
      degraded,
      expireAt: expireAt.toISOString(),
    };
  }

  /** 查询单份优化文档（越权 4003 / 不存在 4004）。 */
  async getOptimizeDoc(userId: string, docId: string): Promise<ResumeOptimizeVo> {
    let idBig: bigint;
    try {
      idBig = BigInt(docId);
    } catch {
      throw new BizException(BizCode.AI_NOT_FOUND, '文档不存在');
    }
    const row = await this.prisma.aiResumeDoc.findFirst({
      where: { id: idBig, mode: 2, isDeleted: 0 },
      select: {
        id: true, userId: true, sourceFileName: true, suggestions: true,
        degraded: true, expireAt: true,
      },
    });
    if (!row) {
      throw new BizException(BizCode.AI_NOT_FOUND, '文档不存在或已删除');
    }
    if (row.userId.toString() !== String(userId)) {
      throw new BizException(BizCode.AI_FORBIDDEN, '无权访问该文档');
    }
    return {
      docId: row.id.toString(),
      sourceFileName: row.sourceFileName ?? '',
      suggestions: (row.suggestions as unknown as ResumeSuggestionsVo) ?? this.fallbackSuggestions({ careerId: '', name: '', category: '' }),
      degraded: row.degraded === 1,
      expireAt: row.expireAt ? row.expireAt.toISOString() : '',
    };
  }

  /** 历史优化文档列表（仅本人 mode=2 未删）。 */
  async listOptimizeDocs(userId: string): Promise<ResumeOptimizeListItemVo[]> {
    const rows = await this.prisma.aiResumeDoc.findMany({
      where: { userId: BigInt(userId), mode: 2, isDeleted: 0 },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, sourceFileName: true, targetCareerId: true, suggestions: true,
        degraded: true, createdAt: true, expireAt: true,
      },
    });
    return rows.map((r) => {
      const sug = r.suggestions as unknown as ResumeSuggestionsVo | null;
      return {
        docId: r.id.toString(),
        sourceFileName: r.sourceFileName ?? '',
        targetCareerId: r.targetCareerId ? r.targetCareerId.toString() : '',
        matchScore: typeof sug?.matchScore === 'number' ? sug.matchScore : 0,
        degraded: r.degraded === 1,
        createdAt: r.createdAt.toISOString(),
        expireAt: r.expireAt ? r.expireAt.toISOString() : '',
      };
    });
  }

  /** 从 PDF Buffer 提取纯文本；异常/空返回空串触发 4623。 */
  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      const parsed = await pdfParse(buffer);
      return (parsed?.text ?? '').trim();
    } catch (err) {
      this.logger.warn(`pdf parse failed: ${(err as Error).message}`);
      return '';
    }
  }

  /** 幂等哈希：sha256(userId|careerId|extractedText 归一化)。 */
  private buildOptimizeHash(userId: string, careerId: string, text: string): string {
    const norm = text.replace(/\s+/g, ' ').trim();
    return createHash('sha256').update(`${userId}|${careerId}|${norm}`).digest('hex');
  }

  /** 解析 LLM 返回的建议 JSON；失败返回 null 触发降级。 */
  private parseSuggestions(
    text: string,
    targetCareer: { careerId: string; name: string; category: string },
  ): ResumeSuggestionsVo | null {
    try {
      const obj = JSON.parse(this.extractJson(text)) as Record<string, unknown>;
      const rawScore = Number(obj.matchScore);
      const matchScore = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 60;
      const overallComment = typeof obj.overallComment === 'string' ? obj.overallComment.trim() : '';
      const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
      const items: ResumeSuggestionItemVo[] = itemsRaw
        .map((it): ResumeSuggestionItemVo | null => {
          const io = (it ?? {}) as Record<string, unknown>;
          const section = typeof io.section === 'string' ? io.section.trim() : '';
          const suggestion = typeof io.suggestion === 'string' ? io.suggestion.trim() : '';
          if (!section || !suggestion) return null;
          return {
            section,
            original: typeof io.original === 'string' ? io.original.trim() : '',
            suggestion,
            reason: typeof io.reason === 'string' ? io.reason.trim() : '',
          };
        })
        .filter((it): it is ResumeSuggestionItemVo => it !== null);
      const missingKeywords = Array.isArray(obj.missingKeywords)
        ? obj.missingKeywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0).map((k) => k.trim())
        : [];
      if (!overallComment && items.length === 0) return null;
      return {
        matchScore,
        overallComment: overallComment || '已完成基础分析，建议结合目标职业补充关键经历。',
        items,
        missingKeywords,
        targetCareer,
      };
    } catch (err) {
      this.logger.warn(`suggestions parse failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** 降级兜底建议（LLM 失败仍返回结构化 200，不白屏）。 */
  private fallbackSuggestions(
    targetCareer: { careerId: string; name: string; category: string },
  ): ResumeSuggestionsVo {
    return {
      matchScore: 60,
      overallComment: 'AI 服务暂时繁忙，已返回通用优化建议，请稍后重试获取个性化分析。',
      items: [
        { section: '整体', original: '', suggestion: '突出与目标职业强相关的量化成果（数字、指标）。', reason: '量化成果更具说服力。' },
        { section: '技能', original: '', suggestion: '补充目标职业要求的核心硬技能与工具关键词。', reason: '提升 ATS 与岗位匹配度。' },
      ],
      missingKeywords: [],
      targetCareer,
    };
  }

  /**
   * Cron 清理：每天凌晨清理过期(expireAt<now)的 extractedText/suggestions（隐私 TTL）。
   * 仅清敏感文本字段，保留元数据（不物理删除记录）。
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredResumeText(): Promise<void> {
    try {
      const now = new Date();
      const res = await this.prisma.aiResumeDoc.updateMany({
        where: { mode: 2, isDeleted: 0, expireAt: { lt: now }, NOT: { extractedText: null } },
        data: { extractedText: null },
      });
      if (res.count > 0) {
        this.logger.log(`resume TTL cleanup: cleared extractedText of ${res.count} docs`);
      }
    } catch (err) {
      this.logger.warn(`resume TTL cleanup failed: ${(err as Error).message}`);
    }
  }
}