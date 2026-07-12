import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, BizException } from '../../common/response';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import { CoachingOrderStatus, CoachAuditStatus, CoachStatus } from '../coaching/coaching.constants';
import {
  PreBriefDto,
  PreBriefVo,
  SummaryDto,
  SummaryVo,
  SummaryTodoVo,
  MatchDto,
  MatchVo,
  MatchItemVo,
} from './ai-coaching.dto';

/**
 * §2.2~2.4 AI 辅导相关服务。
 * 护城河铁律：
 *  - 生成内容落 coaching_pre_brief / coaching_summary（逻辑关联 orderId，无物理外键）。
 *  - 统一走 llm-gateway；LLM 失败/超时 → degraded=true 兜底（HTTP 200 不白屏）。
 *  - 数据隔离：订单归属校验（非本人 4003 / 不存在 4004）。
 *  - 幂等：orderId 唯一约束，重复生成捕获 P2002。
 */
@Injectable()
export class AiCoachingService {
  private readonly logger = new Logger(AiCoachingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGatewayService,
  ) {}

  // ===================== §2.2 咨询前问题梳理师 =====================
  /**
   * 生成咨询前提纲。
   * @throws 4004 订单不存在；4003 非本人；4710 订单状态不允许（已完成/取消）；4005 answers 空（DTO 已拦）
   */
  async preBrief(userId: string, dto: PreBriefDto): Promise<PreBriefVo> {
    const order = await this.getOwnedOrder(userId, dto.orderId);
    // 已完成/已取消不允许再生成提纲
    if (order.status === CoachingOrderStatus.FINISHED || order.status === CoachingOrderStatus.CANCELLED) {
      throw new BizException(BizCode.COACHING_PRE_BRIEF_NOT_ALLOWED, '当前订单状态不允许生成咨询提纲');
    }

    const qaText = dto.answers.map((a, i) => `${i + 1}. 问：${a.question}\n   答：${a.answer}`).join('\n');
    const result = await this.llm.chat({
      prompt: {
        system:
          '你是资深职业咨询助理。请根据用户的问答，为线上咨询生成一份结构化提纲，严格返回 JSON：' +
          '{"outline":"分点提纲文本","tags":["标签1","标签2"]}，不要多余文字。',
        role: '咨询前梳理师',
        context: `用户咨询前问答：\n${qaText}`,
        user: '请生成提纲(outline)与3~6个诉求标签(tags)。',
      },
      callerId: userId,
      scene: 'ai-coaching-pre-brief',
    });

    let outline = '';
    let tags: string[] = [];
    let degraded = result.degraded;
    if (!degraded && result.text?.trim()) {
      const parsed = this.parsePreBrief(result.text);
      if (parsed) {
        outline = parsed.outline;
        tags = parsed.tags;
      }
    }
    if (!outline) {
      const fb = this.fallbackPreBrief(dto);
      outline = fb.outline;
      tags = fb.tags;
      degraded = true;
    }

    try {
      const brief = await this.prisma.coachingPreBrief.create({
        data: {
          orderId: BigInt(dto.orderId),
          userId: BigInt(userId),
          outline,
          tags: tags as unknown as object,
          answersData: dto.answers as unknown as object,
        },
        select: { id: true },
      });
      return { briefId: brief.id.toString(), outline, tags, degraded };
    } catch (err) {
      // 幂等：一订单一提纲，重复生成 → 返回已存在的
      if (this.isUniqueViolation(err)) {
        const exist = await this.prisma.coachingPreBrief.findUnique({
          where: { orderId: BigInt(dto.orderId) },
          select: { id: true, outline: true, tags: true },
        });
        if (exist) {
          return {
            briefId: exist.id.toString(),
            outline: exist.outline,
            tags: (exist.tags as unknown as string[]) ?? [],
            degraded: false,
          };
        }
      }
      throw err;
    }
  }

  // ===================== §2.3 咨询后行动纪要 =====================
  /**
   * 生成咨询后纪要。
   * @throws 4004 订单不存在；4003 非本人；4711 咨询未结束；4712 会话无消息
   */
  async summary(userId: string, dto: SummaryDto): Promise<SummaryVo> {
    const order = await this.getOwnedOrder(userId, dto.orderId);
    if (order.status !== CoachingOrderStatus.FINISHED) {
      throw new BizException(BizCode.COACHING_SUMMARY_NOT_FINISHED, '咨询尚未结束，暂不可生成纪要');
    }

    const session = await this.prisma.coachingSession.findUnique({
      where: { orderId: BigInt(dto.orderId) },
      select: { id: true, msgCount: true },
    });
    if (!session || session.msgCount <= 0) {
      throw new BizException(BizCode.COACHING_SUMMARY_NO_MESSAGE, '会话无消息可供总结');
    }
    const messages = await this.prisma.coachingMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { seq: 'asc' },
      take: 200,
      select: { senderRole: true, content: true },
    });
    if (messages.length === 0) {
      throw new BizException(BizCode.COACHING_SUMMARY_NO_MESSAGE, '会话无消息可供总结');
    }

    const dialog = messages.map((m) => `[${m.senderRole}] ${m.content}`).join('\n');
    const result = await this.llm.chat({
      prompt: {
        system:
          '你是职业咨询记录助理。请根据咨询对话生成行动纪要，严格返回 JSON：' +
          '{"summary":"纪要文本","todos":[{"title":"待办","done":false}]}，不要多余文字。',
        role: '咨询纪要师',
        context: `咨询对话记录：\n${dialog.slice(0, 6000)}`,
        user: '请生成 summary 与 3~6 条可执行 todos。',
      },
      callerId: userId,
      scene: 'ai-coaching-summary',
    });

    let summary = '';
    let todos: SummaryTodoVo[] = [];
    let degraded = result.degraded;
    if (!degraded && result.text?.trim()) {
      const parsed = this.parseSummary(result.text);
      if (parsed) {
        summary = parsed.summary;
        todos = parsed.todos;
      }
    }
    if (!summary) {
      summary = '本次咨询已完成，请结合沟通要点推进后续行动。';
      todos = [{ title: '整理咨询要点并制定下一步计划', done: false }];
      degraded = true;
    }

    try {
      const rec = await this.prisma.coachingSummary.create({
        data: {
          orderId: BigInt(dto.orderId),
          userId: BigInt(userId),
          summary,
          todosData: todos as unknown as object,
        },
        select: { id: true },
      });
      return { summaryId: rec.id.toString(), summary, todos, degraded };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        const exist = await this.prisma.coachingSummary.findUnique({
          where: { orderId: BigInt(dto.orderId) },
          select: { id: true, summary: true, todosData: true },
        });
        if (exist) {
          return {
            summaryId: exist.id.toString(),
            summary: exist.summary,
            todos: (exist.todosData as unknown as SummaryTodoVo[]) ?? [],
            degraded: false,
          };
        }
      }
      throw err;
    }
  }

  // ===================== §2.4 辅导师智能匹配 =====================
  /**
   * 智能匹配辅导师。
   * @throws 4713 当前无可用辅导师
   */
  async match(userId: string, dto: MatchDto): Promise<MatchVo> {
    const topN = dto.topN ?? 3;
    // 仅推荐审核通过 + 上架的辅导师
    const coaches = await this.prisma.coach.findMany({
      where: {
        auditStatus: CoachAuditStatus.APPROVED,
        status: CoachStatus.ONLINE,
        isDeleted: 0,
      },
      orderBy: { rating: 'desc' },
      take: 50,
      select: { id: true, realName: true, title: true, intro: true, expertise: true, rating: true },
    });
    if (coaches.length === 0) {
      throw new BizException(BizCode.COACHING_MATCH_NO_COACH, '当前暂无可用辅导师');
    }

    // 规则版打分（画像相似度：诉求关键词 vs 专长/简介命中）
    const scored = coaches.map((c) => {
      const score = this.calcMatchScore(dto.demand, c);
      return { coach: c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const picked = scored.slice(0, topN);

    // LLM 生成匹配理由（失败降级为规则理由）
    const result = await this.llm.chat({
      prompt: {
        system:
          '你是辅导师匹配顾问。请为每位候选辅导师生成一句匹配理由，严格返回 JSON：' +
          '{"reasons":[{"coachId":"id","reason":"理由"}]}，不要多余文字。',
        role: '匹配顾问',
        context:
          `用户诉求：${dto.demand}\n候选辅导师：` +
          picked
            .map((p) => `id=${p.coach.id} 姓名=${p.coach.realName} 专长=${this.expertiseText(p.coach.expertise)}`)
            .join('；'),
        user: '请为每位候选生成简短匹配理由。',
      },
      callerId: userId,
      scene: 'ai-coaching-match',
    });

    let reasonMap: Record<string, string> = {};
    let degraded = result.degraded;
    if (!degraded && result.text?.trim()) {
      reasonMap = this.parseReasons(result.text);
      if (Object.keys(reasonMap).length === 0) degraded = true;
    } else {
      degraded = true;
    }

    const matches: MatchItemVo[] = picked.map((p) => ({
      coachId: p.coach.id.toString(),
      name: p.coach.realName,
      matchScore: p.score,
      reason:
        reasonMap[p.coach.id.toString()] ??
        `擅长${this.expertiseText(p.coach.expertise) || '综合咨询'}，与您的诉求较为契合`,
    }));

    return { matches, degraded };
  }

  // ===================== 私有辅助 =====================

  /** 订单归属校验：不存在 4004；非本人 4003。 */
  private async getOwnedOrder(userId: string, orderId: string) {
    let oid: bigint;
    try {
      oid = BigInt(orderId);
    } catch {
      throw new BizException(BizCode.AI_NOT_FOUND, '订单不存在');
    }
    const order = await this.prisma.coachingOrder.findFirst({
      where: { id: oid, isDeleted: 0 },
      select: { id: true, userId: true, status: true },
    });
    if (!order) {
      throw new BizException(BizCode.AI_NOT_FOUND, '订单不存在');
    }
    if (order.userId.toString() !== userId) {
      throw new BizException(BizCode.AI_FORBIDDEN, '无权访问该订单');
    }
    return order;
  }

  /** Prisma 唯一约束冲突（P2002）判定。 */
  private isUniqueViolation(err: unknown): boolean {
    return !!err && typeof err === 'object' && (err as { code?: string }).code === 'P2002';
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

  /** 解析 pre-brief JSON。 */
  private parsePreBrief(text: string): { outline: string; tags: string[] } | null {
    try {
      const obj = JSON.parse(this.extractJson(text)) as { outline?: unknown; tags?: unknown };
      const outline = typeof obj.outline === 'string' ? obj.outline.trim() : '';
      if (!outline) return null;
      const tags = Array.isArray(obj.tags)
        ? obj.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()).map((t) => t.trim()).slice(0, 10)
        : [];
      return { outline, tags };
    } catch (err) {
      this.logger.warn(`pre-brief parse failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** 降级兜底：由问答直接拼装提纲。 */
  private fallbackPreBrief(dto: PreBriefDto): { outline: string; tags: string[] } {
    const outline = dto.answers.map((a, i) => `${i + 1}. ${a.question}：${a.answer}`).join('\n');
    return { outline, tags: ['咨询诉求'] };
  }

  /** 解析 summary JSON。 */
  private parseSummary(text: string): { summary: string; todos: SummaryTodoVo[] } | null {
    try {
      const obj = JSON.parse(this.extractJson(text)) as { summary?: unknown; todos?: unknown };
      const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
      if (!summary) return null;
      const todos: SummaryTodoVo[] = Array.isArray(obj.todos)
        ? obj.todos
            .map((t) => {
              const to = (t ?? {}) as Record<string, unknown>;
              const title = typeof to.title === 'string' ? to.title.trim() : '';
              return title ? { title, done: false } : null;
            })
            .filter((t): t is SummaryTodoVo => !!t)
            .slice(0, 10)
        : [];
      return { summary, todos };
    } catch (err) {
      this.logger.warn(`summary parse failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** 解析 match 理由 JSON → { coachId: reason }。 */
  private parseReasons(text: string): Record<string, string> {
    try {
      const obj = JSON.parse(this.extractJson(text)) as { reasons?: unknown };
      const arr = Array.isArray(obj.reasons) ? obj.reasons : [];
      const map: Record<string, string> = {};
      for (const r of arr) {
        const ro = (r ?? {}) as Record<string, unknown>;
        const cid = ro.coachId != null ? String(ro.coachId) : '';
        const reason = typeof ro.reason === 'string' ? ro.reason.trim() : '';
        if (cid && reason) map[cid] = reason;
      }
      return map;
    } catch (err) {
      this.logger.warn(`match reasons parse failed: ${(err as Error).message}`);
      return {};
    }
  }

  /** 规则版匹配打分：诉求关键词命中专长/简介 → 0~100。 */
  private calcMatchScore(
    demand: string,
    coach: { intro: string | null; expertise: unknown; rating: unknown },
  ): number {
    const text = (this.expertiseText(coach.expertise) + ' ' + (coach.intro ?? '')).toLowerCase();
    const tokens = demand
      .toLowerCase()
      .split(/[\s,，。、;；/]+/)
      .filter((t) => t.length >= 2);
    let hit = 0;
    for (const t of tokens) {
      if (text.includes(t)) hit++;
    }
    const hitRatio = tokens.length > 0 ? hit / tokens.length : 0;
    const ratingScore = Math.min(Number(coach.rating ?? 5), 5) / 5; // 0~1
    // 命中占 70%，评分占 30%，保底 40 分避免全 0
    const score = Math.round((hitRatio * 0.7 + ratingScore * 0.3) * 100);
    return Math.max(40, Math.min(100, score));
  }

  /** expertise(Json) → 可读文本。 */
  private expertiseText(expertise: unknown): string {
    if (Array.isArray(expertise)) {
      return expertise.filter((e) => typeof e === 'string').join('、');
    }
    if (typeof expertise === 'string') return expertise;
    return '';
  }
}