import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, BizException } from '../../common/response';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import { GrowthPlanDto, GrowthPlanVo, GrowthWeekVo, GrowthTaskVo } from './ai-career-plan.dto';

/**
 * §2.1 AI 动态成长计划服务。
 * 护城河铁律：
 *  - LLM 生成的成长计划落 career_growth_plan（与规则版 career_roadmap 分表，禁止写入 roadmap）。
 *  - 统一走 llm-gateway，禁止直连 SDK；LLM 失败/超时 → degraded=true 回退规则版计划并落库 degraded=1。
 *  - 数据隔离：查询/落库均带 userId。
 */
@Injectable()
export class AiCareerPlanService {
  private readonly logger = new Logger(AiCareerPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGatewayService,
  ) {}

  /**
   * 生成动态成长计划。
   * @throws BizException AI_MEMBER_ONLY(4515) 非会员/会员过期
   * @throws BizException AI_NOT_FOUND(4004) 职业不存在
   */
  async generate(userId: string, dto: GrowthPlanDto): Promise<GrowthPlanVo> {
    // 会员/付费校验（非会员 4515）
    await this.ensureMember(userId);

    // 职业存在校验（不存在 4004）
    const career = await this.prisma.career.findFirst({
      where: { id: BigInt(dto.careerId), status: 1, isDeleted: 0 },
      select: { id: true, name: true, category: true, description: true },
    });
    if (!career) {
      throw new BizException(BizCode.AI_NOT_FOUND, '职业不存在或已下架');
    }

    const totalWeeks = dto.targetMonths * 4;
    const skills = (dto.currentSkills ?? []).join('、') || '暂无';

    // 调 LLM 统一网关（网关内部含超时熔断/限流降级）
    const result = await this.llm.chat({
      prompt: {
        system:
          '你是资深职业发展教练。请输出一份可执行的分周成长计划，严格返回 JSON：' +
          '{"weeks":[{"weekNo":1,"theme":"主题","tasks":[{"title":"任务","resourceUrl":"可选链接"}]}]}，不要多余文字。',
        role: '职业规划顾问',
        context: `目标职业：${career.name}（${career.category}）。目标周期：${dto.targetMonths} 个月（约 ${totalWeeks} 周）。已具备技能：${skills}。`,
        user: `请生成 ${totalWeeks} 周的成长计划，每周聚焦一个主题，含 2~4 个具体任务。`,
      },
      callerId: userId,
      scene: 'ai-career-growth-plan',
    });

    let weeks: GrowthWeekVo[] | null = null;
    let degraded = result.degraded;

    if (!degraded && result.text?.trim()) {
      weeks = this.parseWeeks(result.text);
    }
    // LLM 失败/超时/解析失败 → 回退规则版
    if (!weeks || weeks.length === 0) {
      weeks = this.fallbackPlan(career.name, totalWeeks);
      degraded = true;
    }

    // 落 career_growth_plan（分表，护城河；degraded 映射 1/0）
    const plan = await this.prisma.careerGrowthPlan.create({
      data: {
        userId: BigInt(userId),
        careerId: BigInt(dto.careerId),
        targetMonths: dto.targetMonths,
        weeksData: weeks as unknown as object,
        degraded: degraded ? 1 : 0,
        status: 1,
      },
      select: { id: true },
    });

    return { planId: plan.id.toString(), weeks, degraded };
  }

  /** 会员/付费校验：membershipLevel>=1 且未过期，否则 4515。 */
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
      throw new BizException(BizCode.AI_MEMBER_ONLY, 'AI 成长计划为会员专享，请先开通会员');
    }
  }

  /** 解析 LLM 返回的 JSON 为 weeks；失败返回 null 触发降级。 */
  private parseWeeks(text: string): GrowthWeekVo[] | null {
    try {
      const jsonStr = this.extractJson(text);
      const parsed = JSON.parse(jsonStr) as { weeks?: unknown };
      const raw = Array.isArray(parsed.weeks) ? parsed.weeks : null;
      if (!raw) return null;
      const weeks: GrowthWeekVo[] = raw
        .map((w, idx) => {
          const obj = (w ?? {}) as Record<string, unknown>;
          const tasksRaw = Array.isArray(obj.tasks) ? obj.tasks : [];
          const tasks = tasksRaw
            .map((t): GrowthTaskVo | null => {
              const to = (t ?? {}) as Record<string, unknown>;
              const title = typeof to.title === 'string' ? to.title.trim() : '';
              if (!title) return null;
              const resourceUrl =
                typeof to.resourceUrl === 'string' && to.resourceUrl.trim()
                  ? to.resourceUrl.trim()
                  : undefined;
              return { title, resourceUrl };
            })
            .filter((t): t is GrowthTaskVo => t !== null);
          const theme = typeof obj.theme === 'string' && obj.theme.trim() ? obj.theme.trim() : `第 ${idx + 1} 周`;
          const weekNo = typeof obj.weekNo === 'number' ? obj.weekNo : idx + 1;
          if (tasks.length === 0) return null;
          return { weekNo, theme, tasks };
        })
        .filter((w): w is GrowthWeekVo => w !== null);
      return weeks.length > 0 ? weeks : null;
    } catch (err) {
      this.logger.warn(`growth-plan parse failed: ${(err as Error).message}`);
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

  /** 降级兜底：规则版分周计划（不依赖 LLM，保证 200 不白屏）。 */
  private fallbackPlan(careerName: string, totalWeeks: number): GrowthWeekVo[] {
    const phases = [
      { theme: '认知与目标对齐', task: `了解 ${careerName} 的核心职责与能力模型` },
      { theme: '基础技能补齐', task: '梳理技能差距并选定学习资源' },
      { theme: '项目实战', task: '通过小项目将所学落地并复盘' },
      { theme: '进阶与影响力', task: '产出作品/分享，建立职业影响力' },
    ];
    const weeks: GrowthWeekVo[] = [];
    const safeWeeks = Math.max(1, Math.min(totalWeeks, 96));
    for (let i = 0; i < safeWeeks; i++) {
      const phase = phases[Math.min(Math.floor((i / safeWeeks) * phases.length), phases.length - 1)];
      weeks.push({
        weekNo: i + 1,
        theme: phase.theme,
        tasks: [{ title: phase.task }],
      });
    }
    return weeks;
  }
}