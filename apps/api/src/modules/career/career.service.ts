import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizException, CommonCode } from '../../common/response';
import { AnalyticsService, EventType } from '../analytics/analytics.service';

/** 推荐返回的 TOP N（验收点：TOP10） */
const RECOMMEND_TOP_N = 10;

/**
 * T1-16 职业库服务：列表 / 详情 / MBTI 推荐 TOP10 / 检索。
 * - 检索优先 MySQL FULLTEXT（MATCH ... AGAINST），异常降级 LIKE（禁止引入 ES）。
 * - 推荐：基于报告 mbtiType 与 career.suit_types（逗号分隔）匹配打分，取 TOP10。
 */
@Injectable()
export class CareerService {
  private readonly logger = new Logger(CareerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  private toView(c: {
    id: bigint;
    careerCode: string;
    name: string;
    category: string;
    description: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    suitTypes: string | null;
  }) {
    return {
      id: c.id.toString(),
      careerCode: c.careerCode,
      name: c.name,
      category: c.category,
      description: c.description,
      salaryMin: c.salaryMin,
      salaryMax: c.salaryMax,
      suitTypes: (c.suitTypes ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    };
  }

  // ============ 列表 GET /careers ============

  async list(params: { category?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20));
    const where: Prisma.CareerWhereInput = {
      isDeleted: 0,
      status: 1,
      ...(params.category ? { category: params.category } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.career.count({ where }),
      this.prisma.career.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      list: rows.map((r) => this.toView(r)),
    };
  }

  // ============ 详情 GET /careers/:id ============

  async detail(careerId: string) {
    const career = await this.prisma.career.findFirst({
      where: { id: BigInt(careerId), isDeleted: 0 },
      include: {
        skills: { orderBy: { weight: 'desc' } },
        roadmaps: { orderBy: { stageNo: 'asc' } },
      },
    });
    if (!career) {
      throw new BizException(CommonCode.NOT_FOUND, '职业不存在');
    }
    return {
      ...this.toView(career),
      responsibility: career.responsibility,
      prospect: career.prospect,
      skills: career.skills.map((s) => ({
        skillName: s.skillName,
        skillType: s.skillType,
        requireLevel: s.requireLevel,
        weight: Number(s.weight),
      })),
      roadmaps: career.roadmaps.map((r) => ({
        stageNo: r.stageNo,
        stageName: r.stageName,
        duration: r.duration,
        milestones: r.milestones,
      })),
    };
  }

  // ============ 推荐 GET /careers/recommend（TOP10） ============

  /**
   * 依据用户最近报告的 mbtiType，匹配 career.suit_types 包含该类型的职业，
   * 打分排序取 TOP10。同时把结果写入 career_match（若带 reportId）。
   */
  async recommend(userId: string, reportId?: string) {
    // 1) 取 mbtiType：优先入参 reportId，否则取用户最近报告
    const report = reportId
      ? await this.prisma.report.findFirst({
          where: { id: BigInt(reportId), userId: BigInt(userId), isDeleted: 0 },
        })
      : await this.prisma.report.findFirst({
          where: { userId: BigInt(userId), isDeleted: 0 },
          orderBy: { createdAt: 'desc' },
        });
    if (!report) {
      throw new BizException(CommonCode.NOT_FOUND, '暂无可用报告，请先生成报告');
    }
    const mbtiType = report.mbtiType;

    // 2) 候选职业（suit_types 包含该类型），MVP 用 contains 过滤
    const candidates = await this.prisma.career.findMany({
      where: {
        isDeleted: 0,
        status: 1,
        suitTypes: { contains: mbtiType },
      },
      take: 100,
    });

    // 3) 打分：精确命中 100 分；同族（前 2 字母/末位）给递减分
    const scored = candidates
      .map((c) => {
        const types = (c.suitTypes ?? '').split(',').map((s) => s.trim());
        const exact = types.includes(mbtiType);
        let score = exact ? 100 : 0;
        if (!exact) {
          // 兜底相似度：逐位相同字母加分
          for (const t of types) {
            let same = 0;
            for (let i = 0; i < 4 && i < t.length; i++) if (t[i] === mbtiType[i]) same++;
            score = Math.max(score, same * 20);
          }
        }
        return { career: c, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, RECOMMEND_TOP_N);

   // 4) 落库 career_match（幂等：先删该报告旧匹配再写）
    try {
      await this.prisma.$transaction([
        this.prisma.careerMatch.deleteMany({ where: { reportId: report.id } }),
        this.prisma.careerMatch.createMany({
          data: scored.map((x, idx) => ({
            userId: BigInt(userId),
            reportId: report.id,
            careerId: x.career.id,
            matchScore: new Prisma.Decimal(x.score),
            rankNo: idx + 1,
            matchReason: { mbtiType, matched: true } as object,
          })),
          skipDuplicates: true,
        }),
      ]);
    } catch (err) {
      // 落库失败不阻断返回结果
      this.logger.warn(`career_match persist failed: ${(err as Error).message}`);
    }

    this.analytics.fire({
      userId,
      eventType: EventType.CAREER_RECOMMEND,
      properties: { reportId: report.id.toString(), mbtiType, count: scored.length },
    });

    return {
      mbtiType,
      total: scored.length,
      list: scored.map((x, idx) => ({
        rankNo: idx + 1,
        matchScore: x.score,
        ...this.toView(x.career),
      })),
    };
  }

  // ============ 检索 GET /careers/search（FULLTEXT→LIKE 降级） ============

  async search(keyword: string, limit = 20) {
    const kw = keyword.trim();
    if (!kw) return { keyword: kw, list: [] };
    const take = Math.min(50, Math.max(1, limit));

    // 1) 优先 FULLTEXT（MATCH ... AGAINST），MySQL 无 FT 索引/报错则降级
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: bigint;
          career_code: string;
          name: string;
          category: string;
          description: string | null;
          salary_min: number | null;
          salary_max: number | null;
          suit_types: string | null;
        }>
      >`
        SELECT id, career_code, name, category, description, salary_min, salary_max, suit_types
        FROM career
        WHERE is_deleted = 0 AND status = 1
          AND MATCH(name, description) AGAINST(${kw} IN NATURAL LANGUAGE MODE)
        LIMIT ${take}
      `;
      if (rows.length > 0) {
        return {
          keyword: kw,
          mode: 'fulltext',
          list: rows.map((r) =>
            this.toView({
              id: r.id,
              careerCode: r.career_code,
              name: r.name,
              category: r.category,
              description: r.description,
              salaryMin: r.salary_min,
              salaryMax: r.salary_max,
              suitTypes: r.suit_types,
            }),
          ),
        };
      }
    } catch (err) {
      this.logger.warn(`fulltext search degraded to LIKE: ${(err as Error).message}`);
    }

    // 2) 降级 LIKE（禁止引入 ES）
    const rows = await this.prisma.career.findMany({
      where: {
        isDeleted: 0,
        status: 1,
        OR: [{ name: { contains: kw } }, { description: { contains: kw } }],
      },
      take,
    });
    return { keyword: kw, mode: 'like', list: rows.map((r) => this.toView(r)) };
  }
}