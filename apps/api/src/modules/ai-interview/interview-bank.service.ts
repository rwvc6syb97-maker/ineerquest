import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, BizException } from '../../common/response';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import {
  QuestionListQueryDto,
  QuestionListVo,
  QuestionScoreDto,
  QuestionScoreVo,
} from './interview-bank.dto';

/**
 * §4.2 AI 面试题库 + 模拟评分。
 * 护城河/铁律：
 *  - 列表仅返回已发布题（status=1 且 isDeleted=0），未审核草稿不对外。
 *  - 评分为会员专享（4515）；题不存在 4004。
 *  - 结果不落库（练习模式，无写操作）；统一走 llm-gateway，失败降级。
 */
@Injectable()
export class InterviewBankService {
  private readonly logger = new Logger(InterviewBankService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGatewayService,
  ) {}

  /** 题库列表（登录可见）：仅已发布题，按职业+难度分页。 */
  async list(query: QuestionListQueryDto): Promise<QuestionListVo> {
    let careerId: bigint;
    try {
      careerId = BigInt(query.careerId);
    } catch {
      throw new BizException(BizCode.AI_BAD_PARAM, 'careerId 非法');
    }
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 50) : 10;

    const where = {
      careerId,
      status: 1,
      isDeleted: 0,
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.interviewQuestion.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, question: true, tagsData: true },
      }),
      this.prisma.interviewQuestion.count({ where }),
    ]);

    return {
      list: rows.map((r) => ({
        qId: r.id.toString(),
        question: r.question,
        tags: this.toTags(r.tagsData),
      })),
      total,
    };
  }

  /** 单题评分（会员专享）：题不存在 4004；answer 空 4005；LLM 失败降级。 */
  async score(userId: string, qId: string, dto: QuestionScoreDto): Promise<QuestionScoreVo> {
    await this.ensureMember(userId);

    if (!dto.answer || !dto.answer.trim()) {
      throw new BizException(BizCode.AI_BAD_PARAM, 'answer 不能为空');
    }
    let id: bigint;
    try {
      id = BigInt(qId);
    } catch {
      throw new BizException(BizCode.AI_NOT_FOUND, '题目不存在');
    }
    const q = await this.prisma.interviewQuestion.findFirst({
      where: { id, status: 1, isDeleted: 0 },
      select: { question: true, difficulty: true, sampleAnswer: true },
    });
    if (!q) {
      throw new BizException(BizCode.AI_NOT_FOUND, '题目不存在或未发布');
    }

    const sample = q.sampleAnswer ?? '';
    const result = await this.llm.chat({
      prompt: {
        system:
          '你是面试评分官。请严格返回 JSON：{"score":80,"feedback":"反馈"}，score 为 0~100 整数，不要多余文字。',
        role: '面试评分官',
        context: `难度：${q.difficulty}；面试问题：${q.question}${sample ? `；参考答案：${sample}` : ''}`,
        user: `候选人作答：${dto.answer}。请评分并给出简短反馈。`,
      },
      callerId: 'ai-interview-bank',
      scene: 'ai-interview-score',
    });

    if (!result.degraded && result.text?.trim()) {
      const parsed = this.parseScore(result.text);
      if (parsed) return { ...parsed, sampleAnswer: sample };
    }
    return {
      score: 60,
      feedback: '作答基本切题，建议结合具体案例展开，突出与岗位的匹配度。',
      sampleAnswer: sample,
    };
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
      throw new BizException(BizCode.AI_MEMBER_ONLY, '题库评分为会员专享，请先开通会员');
    }
  }

  private toTags(data: unknown): string[] {
    if (Array.isArray(data)) return data.filter((x): x is string => typeof x === 'string');
    return [];
  }

  private parseScore(text: string): { score: number; feedback: string } | null {
    try {
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const body = fence ? fence[1] : text;
      const start = body.indexOf('{');
      const end = body.lastIndexOf('}');
      const s = start >= 0 && end > start ? body.slice(start, end + 1) : body;
      const obj = JSON.parse(s) as Record<string, unknown>;
      const num = typeof obj.score === 'number' ? obj.score : Number(obj.score);
      const score = Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : 60;
      const feedback =
        typeof obj.feedback === 'string' && obj.feedback.trim() ? obj.feedback.trim() : '作答切题。';
      return { score, feedback };
    } catch (err) {
      this.logger.warn(`bank score parse failed: ${(err as Error).message}`);
      return null;
    }
  }
}