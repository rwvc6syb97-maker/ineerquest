import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizException, BizCode, CommonCode } from '../../common/response';

/** 学习资源类型：DB(TinyInt) ↔ 前端枚举字符串 */
const RESOURCE_TYPE_TO_STR: Record<number, string> = {
  1: 'course',
  2: 'book',
  3: 'article',
  4: 'video',
};
const RESOURCE_STR_TO_TYPE: Record<string, number> = {
  course: 1,
  book: 2,
  article: 3,
  video: 4,
};

/** 成长计划任务状态映射（DB is_done TinyInt ↔ 前端 boolean） */
type SkillGapItemView = {
  skillName: string;
  requireLevel: number;
  currentLevel: number;
  gapLevel: number;
  suggestion?: string;
};

/**
 * 职业规划扩展服务：P16 技能差距 / P17 学习资源 / P18 成长计划。
 * 对齐前端契约 apps/web/src/api/modules/career-plan.api.ts。
 */
@Injectable()
export class CareerPlanService {
  private readonly logger = new Logger(CareerPlanService.name);

  constructor(private readonly prisma: PrismaService) {}

  private splitTags(raw: string | null): string[] {
    return (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // ============ P16 技能差距 GET /skills-gap/:careerId ============

  /**
   * 优先返回用户已有的 skill_gap_analysis 结果；
   * 若无记录则基于 career_skill 的 requireLevel 生成基线（currentLevel=0）。
   */
  async skillGap(userId: string, careerId: string): Promise<{
    careerId: string;
    careerTitle: string;
    items: SkillGapItemView[];
  }> {
    const cid = BigInt(careerId);
    const career = await this.prisma.career.findFirst({
      where: { id: cid, isDeleted: 0 },
    });
    if (!career) {
      throw new BizException(BizCode.CAREER_NOT_FOUND, '职业不存在');
    }

    const gaps = await this.prisma.skillGapAnalysis.findMany({
      where: { userId: BigInt(userId), careerId: cid },
      orderBy: { gapLevel: 'desc' },
    });

    let items: SkillGapItemView[];
    if (gaps.length > 0) {
      items = gaps.map((g) => ({
        skillName: g.skillName,
        requireLevel: g.requireLevel,
        currentLevel: g.currentLevel,
        gapLevel: g.gapLevel,
        suggestion: g.suggestion ?? undefined,
      }));
    } else {
      // 无个性化分析时，用职业技能要求生成基线（等级 1-5 归一到 0-100）
      const skills = await this.prisma.careerSkill.findMany({
        where: { careerId: cid },
        orderBy: { weight: 'desc' },
      });
      items = skills.map((s) => {
        const requireLevel = Math.min(100, s.requireLevel * 20);
        return {
          skillName: s.skillName,
          requireLevel,
          currentLevel: 0,
          gapLevel: requireLevel,
          suggestion: `建议系统学习「${s.skillName}」相关课程与实践。`,
        };
      });
    }

    return {
      careerId: career.id.toString(),
      careerTitle: career.name,
      items,
    };
  }

  // ============ P17 学习资源 GET /learning/resources ============

  async learningResources(params: {
    skill?: string;
    careerId?: string;
    type?: string;
  }): Promise<
    Array<{
      id: string;
      title: string;
      resourceType: string;
      url?: string;
      skillTags: string[];
      provider?: string;
    }>
  > {
    const where: {
      isDeleted: number;
      status: number;
      careerId?: bigint;
      resourceType?: number;
      skillTags?: { contains: string };
    } = { isDeleted: 0, status: 1 };

    if (params.careerId) where.careerId = BigInt(params.careerId);
    if (params.type && RESOURCE_STR_TO_TYPE[params.type] !== undefined) {
      where.resourceType = RESOURCE_STR_TO_TYPE[params.type];
    }
    if (params.skill) where.skillTags = { contains: params.skill };

    const rows = await this.prisma.learningResource.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 50,
    });

    return rows.map((r) => ({
      id: r.id.toString(),
      title: r.title,
      resourceType: RESOURCE_TYPE_TO_STR[r.resourceType] ?? 'article',
      url: r.url ?? undefined,
      skillTags: this.splitTags(r.skillTags),
      provider: r.provider ?? undefined,
    }));
  }

  // ============ P18 成长计划 GET /growth/plan ============

  async growthPlans(userId: string): Promise<
    Array<{
      id: string;
      title: string;
      status: 1 | 2 | 3;
      progress: number;
      careerTitle?: string;
      tasks: Array<{ id: string; content: string; isDone: boolean; doneAt?: string }>;
      createdAt: string;
    }>
  > {
    const plans = await this.prisma.growthPlan.findMany({
      where: { userId: BigInt(userId), isDeleted: 0 },
      orderBy: { createdAt: 'desc' },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
    });

    // 关联职业标题（careerId 可空）
    const careerIds = Array.from(
      new Set(plans.map((p) => p.careerId).filter((v): v is bigint => v !== null)),
    );
    const careers = careerIds.length
      ? await this.prisma.career.findMany({ where: { id: { in: careerIds } } })
      : [];
    const careerMap = new Map(careers.map((c) => [c.id.toString(), c.name]));

    return plans.map((p) => ({
      id: p.id.toString(),
      title: p.title,
      status: (p.status as 1 | 2 | 3) ?? 1,
      progress: p.progress,
      careerTitle: p.careerId ? careerMap.get(p.careerId.toString()) : undefined,
      tasks: p.tasks.map((t) => ({
        id: t.id.toString(),
        content: t.content,
        isDone: t.isDone === 1,
        doneAt: t.doneAt ? t.doneAt.toISOString() : undefined,
      })),
      createdAt: p.createdAt.toISOString(),
    }));
  }

  // ============ 任务打卡 PATCH /growth/plan/:planId/tasks/:taskId ============

  async toggleTask(
    userId: string,
    planId: string,
    taskId: string,
    isDone: boolean,
  ): Promise<{ id: string; content: string; isDone: boolean; doneAt?: string }> {
    const pid = BigInt(planId);
    // 校验计划归属当前用户
    const plan = await this.prisma.growthPlan.findFirst({
      where: { id: pid, userId: BigInt(userId), isDeleted: 0 },
    });
    if (!plan) {
      throw new BizException(CommonCode.NOT_FOUND, '成长计划不存在');
    }

    const task = await this.prisma.growthPlanTask.findFirst({
      where: { id: BigInt(taskId), planId: pid },
    });
    if (!task) {
      throw new BizException(CommonCode.NOT_FOUND, '任务不存在');
    }

    const updated = await this.prisma.growthPlanTask.update({
      where: { id: task.id },
      data: {
        isDone: isDone ? 1 : 0,
        doneAt: isDone ? new Date() : null,
      },
    });

    // 重算计划进度并同步状态
    const tasks = await this.prisma.growthPlanTask.findMany({ where: { planId: pid } });
    const total = tasks.length;
    const done = tasks.filter((t) => t.isDone === 1).length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    await this.prisma.growthPlan.update({
      where: { id: pid },
      data: {
        progress,
        status: total > 0 && done === total ? 2 : 1,
      },
    });

    return {
      id: updated.id.toString(),
      content: updated.content,
      isDone: updated.isDone === 1,
      doneAt: updated.doneAt ? updated.doneAt.toISOString() : undefined,
    };
  }
}