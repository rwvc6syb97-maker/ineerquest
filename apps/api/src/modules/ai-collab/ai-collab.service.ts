import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { BizCode, BizException } from '../../common/response';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import { CollabAnalyzeDto, CollabAnalyzeVo, CollabMemberDto, CollabPairVo } from './ai-collab.dto';

/** 登录用户每日协作分析配额（PRD 第 6 章配额策略）。 */
export const COLLAB_USER_DAILY_LIMIT = 20;
/** 游客试用每日配额（1 次/日/IP）。 */
export const COLLAB_GUEST_DAILY_LIMIT = 1;

/**
 * §3.1 AI 双人/团队协作分析服务。
 * 护城河/铁律：
 *  - 游客可试用（1 次/日/IP，超限 9001），不落库；登录用户日配额超限 9002。
 *  - 仅登录用户 save=true 时才 create 入 ai_collab_analysis。
 *  - 统一走 llm-gateway，失败/超时/解析失败 → degraded=true 回退规则版，不白屏。
 */
@Injectable()
export class AiCollabService {
  private readonly logger = new Logger(AiCollabService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly llm: LlmGatewayService,
  ) {}

  /**
   * 协作分析。
   * @param userId 登录用户 id；游客为 undefined
   * @param clientIp 客户端 IP（游客限流用）
   * @throws BizException RATE_LIMITED(9001) 游客试用超限
   * @throws BizException AI_USER_QUOTA_EXHAUSTED(9002) 登录用户日配额耗尽
   */
  async analyze(
    userId: string | undefined,
    clientIp: string,
    dto: CollabAnalyzeDto,
  ): Promise<CollabAnalyzeVo> {
    // 限流：登录用户走用户日配额(9002)，游客走 IP 试用(9001)
    if (userId) {
      await this.consumeQuota(`collab:quota:u:${userId}`, COLLAB_USER_DAILY_LIMIT, BizCode.AI_USER_QUOTA_EXHAUSTED, '今日协作分析次数已用完，请明日再来');
    } else {
      await this.consumeQuota(`collab:trial:ip:${clientIp}`, COLLAB_GUEST_DAILY_LIMIT, BizCode.RATE_LIMITED, '游客每日仅可试用 1 次，登录后可获得更多次数');
    }

    const members = dto.members;
    const memberDesc = members
      .map((m, i) => `${i + 1}. ${m.name ?? '成员' + (i + 1)}（${m.mbtiType}）`)
      .join('；');

    const result = await this.llm.chat({
      prompt: {
        system:
          '你是资深团队协作与组织行为专家。请基于成员 MBTI 输出协作分析，严格返回 JSON：' +
          '{"summary":"整体摘要","pairs":[{"a":"成员A","b":"成员B","synergy":80,"advice":"建议"}],"risks":["风险1"]}，不要多余文字。',
        role: '团队协作分析师',
        context: `协作成员：${memberDesc}。${dto.scene ? `协作场景：${dto.scene}。` : ''}`,
        user: '请分析成员两两之间的协同度（0~100）与协作建议，并给出团整体协作风险预警。',
      },
      callerId: userId ?? `guest:${clientIp}`,
      scene: 'ai-collab-analyze',
    });

    let parsed: { summary: string; pairs: CollabPairVo[]; risks: string[] } | null = null;
    let degraded = result.degraded;
    if (!degraded && result.text?.trim()) {
      parsed = this.parseResult(result.text, members);
    }
    if (!parsed) {
      parsed = this.fallbackResult(members);
      degraded = true;
    }

    // 仅登录用户 save=true 才落库（游客不落库）
    let analysisId: string | undefined;
    if (userId && dto.save === true) {
      const row = await this.prisma.aiCollabAnalysis.create({
        data: {
          userId: BigInt(userId),
          membersData: members as unknown as object,
          scene: dto.scene ?? null,
          summary: parsed.summary,
          pairsData: parsed.pairs as unknown as object,
          risksData: parsed.risks as unknown as object,
          degraded: degraded ? 1 : 0,
          isDeleted: 0,
        },
        select: { id: true },
      });
      analysisId = row.id.toString();
    }

    return { analysisId, summary: parsed.summary, pairs: parsed.pairs, risks: parsed.risks, degraded };
  }

  /** 日粒度计数配额：首次调用设置到当日 24 点过期；超限抛指定业务码。 */
  private async consumeQuota(key: string, limit: number, code: number, message: string): Promise<void> {
    try {
      const count = await this.redis.raw.incr(key);
      if (count === 1) {
        await this.redis.raw.expire(key, this.secondsToEndOfDay());
      }
      if (count > limit) {
        throw new BizException(code, message);
      }
    } catch (err) {
      if (err instanceof BizException) throw err;
      // 计数基础设施异常不阻断主流程（放行），仅告警
      this.logger.warn(`collab quota check failed(${key}): ${(err as Error).message}`);
    }
  }

  private secondsToEndOfDay(): number {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return Math.max(1, Math.floor((end.getTime() - now.getTime()) / 1000));
  }

  /** 解析 LLM JSON；失败返回 null 触发降级。 */
  private parseResult(
    text: string,
    members: CollabMemberDto[],
  ): { summary: string; pairs: CollabPairVo[]; risks: string[] } | null {
    try {
      const jsonStr = this.extractJson(text);
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      const summary = typeof obj.summary === 'string' && obj.summary.trim() ? obj.summary.trim() : '';
      const pairsRaw = Array.isArray(obj.pairs) ? obj.pairs : [];
      const pairs: CollabPairVo[] = pairsRaw
        .map((p): CollabPairVo | null => {
          const po = (p ?? {}) as Record<string, unknown>;
          const a = typeof po.a === 'string' ? po.a.trim() : '';
          const b = typeof po.b === 'string' ? po.b.trim() : '';
          const advice = typeof po.advice === 'string' ? po.advice.trim() : '';
          if (!a || !b) return null;
          const synergyNum = typeof po.synergy === 'number' ? po.synergy : Number(po.synergy);
          const synergy = Number.isFinite(synergyNum) ? Math.max(0, Math.min(100, Math.round(synergyNum))) : 60;
          return { a, b, synergy, advice: advice || '保持开放沟通，发挥各自优势。' };
        })
        .filter((p): p is CollabPairVo => p !== null);
      const risks = Array.isArray(obj.risks)
        ? obj.risks.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
        : [];
      if (!summary || pairs.length === 0) return null;
      return { summary, pairs, risks };
    } catch (err) {
      this.logger.warn(`collab parse failed: ${(err as Error).message}`);
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

  /** 降级兜底：规则版协作分析（不依赖 LLM，保证 200 不白屏）。 */
  private fallbackResult(members: CollabMemberDto[]): { summary: string; pairs: CollabPairVo[]; risks: string[] } {
    const label = (m: CollabMemberDto, i: number) => m.name ?? `成员${i + 1}（${m.mbtiType}）`;
    const pairs: CollabPairVo[] = [];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const sameJudge = members[i].mbtiType[3] === members[j].mbtiType[3];
        const synergy = sameJudge ? 75 : 60;
        pairs.push({
          a: label(members[i], i),
          b: label(members[j], j),
          synergy,
          advice: '明确分工与沟通节奏，尊重彼此的决策与信息处理偏好。',
        });
      }
    }
    return {
      summary: `本次共 ${members.length} 位成员参与协作。建议围绕目标对齐、分工清晰与定期复盘展开，发挥不同性格类型的互补优势。`,
      pairs,
      risks: ['沟通风格差异可能引发误解，建议建立明确的协作规范。'],
    };
  }
}