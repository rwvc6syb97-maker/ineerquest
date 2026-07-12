import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, BizException } from '../../common/response';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import { findRecruitSource } from './recruit-blacklist';
import {
  CareerGenerateDto,
  CareerGenerateVo,
  DraftListQueryDto,
  ReviewDto,
  ReviewResultVo,
} from './career-ai.dto';

/**
 * §4.4 AI 辅助职业库生产服务（仅管理员，鉴权由 PermissionGuard 前置）。
 * 护城河/红线：
 *  - S-04：AI 生成结果只落 career_ai_draft（status=0），approve 才事务同步 career/career_skill；
 *    reject 仅置 status=2，绝不写正式表。
 *  - S-05：refSources 命中招聘平台黑名单 → 拒绝（4005）。
 *  - 统一走 llm-gateway，失败/解析失败 → 规则兜底草稿（degraded），不阻断录入。
 *  - 错误码：4005 参数/红线；4460 草稿不存在；4461 重复职业名；4462 已审核不可重复。
 */
@Injectable()
export class CareerAiService {
  private readonly logger = new Logger(CareerAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGatewayService,
  ) {}

  /**
   * 生成职业草稿：仅入 career_ai_draft，绝不直灌正式职业库。
   * @throws BizException AI_BAD_PARAM(4005) 名称/品类空或命中招聘源 / CAREER_DRAFT_DUPLICATE_NAME(4461) 正式库或待审草稿重名
   */
  async generate(adminId: string, dto: CareerGenerateDto): Promise<CareerGenerateVo> {
    const name = (dto.name ?? '').trim();
    const category = (dto.category ?? '').trim();
    if (!name || !category) {
      throw new BizException(BizCode.AI_BAD_PARAM, 'name/category 不能为空');
    }

    // S-05 红线：拒绝招聘平台来源
    const hit = findRecruitSource(dto.refSources);
    if (hit) {
      throw new BizException(BizCode.AI_BAD_PARAM, `参考来源命中招聘平台黑名单，禁止引用：${hit}`);
    }

    // 4461：正式职业库或待审草稿中已存在同名职业
    const dupCareer = await this.prisma.career.findFirst({
      where: { name, isDeleted: 0 },
      select: { id: true },
    });
    const dupDraft = await this.prisma.careerAiDraft.findFirst({
      where: { name, status: 0 },
      select: { id: true },
    });
    if (dupCareer || dupDraft) {
      throw new BizException(BizCode.CAREER_DRAFT_DUPLICATE_NAME, '同名职业已存在于职业库或待审草稿');
    }

    const gen = await this.genDraft(name, category);

    const draft = await this.prisma.careerAiDraft.create({
      data: {
        creatorId: BigInt(adminId),
        name,
        category,
        draftData: gen.draft as unknown as Prisma.InputJsonValue,
        skillsData: gen.skills as unknown as Prisma.InputJsonValue,
        refSourcesData: (dto.refSources ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        status: 0,
      },
      select: { id: true },
    });

    return {
      draftId: draft.id.toString(),
      career: { name, category, ...gen.draft },
      skills: gen.skills,
    };
  }

  /** 草稿列表（分页），status 可选过滤。 */
  async listDrafts(query: DraftListQueryDto): Promise<{ list: unknown[]; total: number }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 50) : 20;
    const where = query.status !== undefined ? { status: query.status } : {};

    const [rows, total] = await Promise.all([
      this.prisma.careerAiDraft.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          category: true,
          status: true,
          reviewRemark: true,
          syncedCareerId: true,
          createdAt: true,
        },
      }),
      this.prisma.careerAiDraft.count({ where }),
    ]);

    const list = rows.map((r) => ({
      draftId: r.id.toString(),
      name: r.name,
      category: r.category,
      status: r.status,
      reviewRemark: r.reviewRemark ?? null,
      syncedCareerId: r.syncedCareerId ? r.syncedCareerId.toString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
    return { list, total };
  }

  /**
   * 审核草稿：approve → 事务同步 career + career_skill 并回写 syncedCareerId/status=1；
   * reject → 仅 status=2。
   * @throws BizException CAREER_DRAFT_NOT_FOUND(4460) / CAREER_DRAFT_ALREADY_REVIEWED(4462) 已审核不可重复
   */
  async review(draftId: string, dto: ReviewDto): Promise<ReviewResultVo> {
    const id = safeBigInt(draftId);
    if (id === null) {
      throw new BizException(BizCode.CAREER_DRAFT_NOT_FOUND, '草稿不存在');
    }
    const draft = await this.prisma.careerAiDraft.findUnique({ where: { id } });
    if (!draft) {
      throw new BizException(BizCode.CAREER_DRAFT_NOT_FOUND, '草稿不存在');
    }
    if (draft.status !== 0) {
      throw new BizException(BizCode.CAREER_DRAFT_ALREADY_REVIEWED, '草稿已审核，不可重复操作');
    }

    if (dto.action === 'reject') {
      await this.prisma.careerAiDraft.update({
        where: { id },
        data: { status: 2, reviewRemark: dto.remark ?? undefined },
      });
      return { status: 2 };
    }

    // approve：S-04 此刻才允许写入正式表，事务保证 career + career_skill 原子性
    const draftData = (draft.draftData ?? {}) as Record<string, unknown>;
    const skillsData = Array.isArray(draft.skillsData) ? (draft.skillsData as unknown[]) : [];

    const syncedId = await this.prisma.$transaction(async (tx) => {
      const career = await tx.career.create({
        data: {
          careerCode: await this.genCareerCode(),
          name: draft.name,
          category: draft.category,
          description: str(draftData.description),
          responsibility: str(draftData.responsibility),
          salaryMin: int(draftData.salaryMin),
          salaryMax: int(draftData.salaryMax),
          prospect: str(draftData.prospect),
          suitTypes: str(draftData.suitTypes)?.slice(0, 128),
          status: 1,
        },
        select: { id: true },
      });

      for (const raw of skillsData) {
        const s = (raw ?? {}) as Record<string, unknown>;
        const skillName = str(s.skillName ?? s.name)?.slice(0, 64);
        if (!skillName) continue;
        await tx.careerSkill.create({
          data: {
            careerId: career.id,
            skillName,
            skillType: int(s.skillType) ?? 1,
            requireLevel: int(s.requireLevel ?? s.level) ?? 3,
            weight: numDec(s.weight) ?? 1.0,
          },
        });
      }

      await tx.careerAiDraft.update({
        where: { id },
        data: { status: 1, reviewRemark: dto.remark ?? undefined, syncedCareerId: career.id },
      });
      return career.id;
    });

    return { status: 1, syncedCareerId: syncedId.toString() };
  }

  /** LLM 生成职业草稿（LLM→parse→fallback 三段式降级）。 */
  private async genDraft(
    name: string,
    category: string,
  ): Promise<{ draft: Record<string, unknown>; skills: Record<string, unknown>[]; degraded: boolean }> {
    const result = await this.llm.chat({
      prompt: {
        system:
          '你是职业库编辑。严格返回 JSON：{"description":"","responsibility":"","salaryMin":10000,"salaryMax":30000,"prospect":"","suitTypes":"","skills":[{"skillName":"","skillType":1,"requireLevel":3,"weight":1.0}]}，不要多余文字。',
        role: '职业库内容编辑',
        context: `职业名：${name}；品类：${category}。数据须来自权威职业标准，严禁引用招聘平台。`,
        user: '请生成该职业的岗位描述、职责、薪资区间、发展前景、适配人格与技能清单。',
      },
      callerId: 'career-ai-generate',
      scene: 'career-ai-generate',
    });
    if (!result.degraded && result.text?.trim()) {
      const parsed = this.parseDraft(result.text);
      if (parsed) return { ...parsed, degraded: false };
    }
    return { ...this.fallbackDraft(name, category), degraded: true };
  }

  private parseDraft(
    text: string,
  ): { draft: Record<string, unknown>; skills: Record<string, unknown>[] } | null {
    try {
      const obj = JSON.parse(this.extractJson(text)) as Record<string, unknown>;
      const skills = Array.isArray(obj.skills) ? (obj.skills as Record<string, unknown>[]) : [];
      const { skills: _drop, ...draft } = obj;
      return { draft, skills };
    } catch (err) {
      this.logger.warn(`career draft parse failed: ${(err as Error).message}`);
      return null;
    }
  }

  private extractJson(text: string): string {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1] : text;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) return body.slice(start, end + 1);
    return body;
  }

  private fallbackDraft(
    name: string,
    category: string,
  ): { draft: Record<string, unknown>; skills: Record<string, unknown>[] } {
    return {
      draft: {
        description: `${name}是${category}领域的重要职业，负责相关专业工作。`,
        responsibility: '承担该岗位核心专业职责，配合团队达成业务目标。',
        salaryMin: 10000,
        salaryMax: 30000,
        prospect: '行业需求稳定，具备良好的成长与发展空间。',
        suitTypes: '',
      },
      skills: [
        { skillName: '专业基础能力', skillType: 1, requireLevel: 3, weight: 1.0 },
        { skillName: '沟通协作能力', skillType: 2, requireLevel: 3, weight: 1.0 },
      ],
    };
  }

  /** 生成唯一 careerCode（AI 前缀 + 时间戳 + 随机，落库前校验唯一）。 */
  private async genCareerCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = `AI${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`.slice(0, 32);
      const exists = await this.prisma.career.findUnique({ where: { careerCode: code }, select: { id: true } });
      if (!exists) return code;
    }
    return `AI${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 100000)}`.slice(0, 32);
  }
}

function safeBigInt(v: string): bigint | null {
  if (!/^\d+$/.test(v)) return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function int(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function numDec(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}