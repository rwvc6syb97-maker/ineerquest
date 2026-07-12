import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, BizException } from '../../common/response';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import {
  ResumeGenerateDto,
  ResumeGenerateVo,
  ResumeProfileDto,
  ResumeSectionVo,
} from './ai-resume.dto';

/** 敏感词本地词表（项目暂无独立敏感词服务，轻量本地过滤，命中即 4516）。 */
const SENSITIVE_WORDS = [
  '暴力', '色情', '赌博', '毒品', '诈骗', '反动', '恐怖主义',
];

/**
 * §3.2 AI 简历/求职信生成服务。
 * 护城河/铁律：
 *  - 会员专享：非会员/会员过期 → 4515。
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
   * @throws BizException AI_MEMBER_ONLY(4515) 非会员/会员过期
   * @throws BizException AI_SENSITIVE_CONTENT(4516) 输入含敏感词
   * @throws BizException AI_NOT_FOUND(4004) 职业不存在
   */
  async generate(userId: string, dto: ResumeGenerateDto): Promise<ResumeGenerateVo> {
    // 会员/付费校验（非会员 4515）
    await this.ensureMember(userId);

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

  /** 会员/付费校验：membershipLevel>=1 或 isPaid==1 且未过期，否则 4515。 */
  private async ensureMember(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: BigInt(userId), isDeleted: 0 },
      select: { membershipLevel: true, membershipExpireAt: true, paidExpireAt: true, isPaid: true },
    });
    if (!user) {
      throw new BizException(BizCode.AI_UNAUTHORIZED, '未登录或登录已失效');
    }
    const expire = user.membershipExpireAt ?? user.paidExpireAt ?? null;
    const active =
      (user.membershipLevel >= 1 || user.isPaid === 1) && (!expire || expire.getTime() > Date.now());
    if (!active) {
      throw new BizException(BizCode.AI_MEMBER_ONLY, 'AI 简历生成为会员专享，请先开通会员');
    }
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
}