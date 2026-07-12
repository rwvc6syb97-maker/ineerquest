import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, BizException } from '../../common/response';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import {
  InterviewAnswerDto,
  InterviewAnswerVo,
  InterviewDimensionVo,
  InterviewReportVo,
  InterviewStartDto,
  InterviewStartVo,
} from './ai-interview.dto';

/** 一次模拟面试的总轮数（达到即结束）。 */
export const INTERVIEW_MAX_ROUNDS = 5;

/**
 * §4.1 AI 模拟面试服务（会员专享）。
 * 护城河/铁律：
 *  - 会员专享：非会员/会员过期 → 4515。
 *  - 结果只落 ai_interview + ai_interview_qa（P3 分表），绝不写其他业务表。
 *  - 数据隔离：所有查询/落库均带 userId；越权访问他人会话 → 4003。
 *  - 4520：会话 status=1（已结束）时再 answer → 抛 4520。
 *  - 统一走 llm-gateway，失败/超时/解析失败 → degraded=true 回退规则版，不白屏。
 */
@Injectable()
export class AiInterviewService {
  private readonly logger = new Logger(AiInterviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGatewayService,
  ) {}

  /**
   * 开始一次模拟面试：校验会员/职业，落 ai_interview + 首题 ai_interview_qa。
   * @throws BizException AI_MEMBER_ONLY(4515)/AI_NOT_FOUND(4004)
   */
  async start(userId: string, dto: InterviewStartDto): Promise<InterviewStartVo> {
    await this.ensureMember(userId);

    const career = await this.prisma.career.findFirst({
      where: { id: BigInt(dto.careerId), status: 1, isDeleted: 0 },
      select: { id: true, name: true, category: true },
    });
    if (!career) {
      throw new BizException(BizCode.AI_NOT_FOUND, '职业不存在或已下架');
    }

    const difficulty = dto.difficulty ?? 'medium';
    const gen = await this.genQuestion(career.name, career.category, difficulty, 1, []);

    const interview = await this.prisma.aiInterview.create({
      data: {
        userId: BigInt(userId),
        careerId: BigInt(dto.careerId),
        difficulty,
        status: 0,
        degraded: gen.degraded ? 1 : 0,
      },
      select: { id: true },
    });
    await this.prisma.aiInterviewQa.create({
      data: {
        interviewId: interview.id,
        userId: BigInt(userId),
        seq: 1,
        question: gen.question,
      },
    });

    return { interviewId: interview.id.toString(), firstQuestion: gen.question };
  }

  /**
   * 提交本轮作答：评分 + 出下一题；达到轮数上限则结束并汇总报告。
   * @throws BizException AI_NOT_FOUND(4004) 会话不存在/AI_FORBIDDEN(4003) 越权/AI_INTERVIEW_FINISHED(4520) 已结束/AI_BAD_PARAM(4005) answer 为空
   */
  async answer(userId: string, interviewId: string, dto: InterviewAnswerDto): Promise<InterviewAnswerVo> {
    await this.ensureMember(userId);

    if (!dto.answer || !dto.answer.trim()) {
      throw new BizException(BizCode.AI_BAD_PARAM, 'answer 不能为空');
    }

    const interview = await this.loadInterviewOwned(userId, interviewId);
    // 4520：已结束不可再答
    if (interview.status === 1) {
      throw new BizException(BizCode.AI_INTERVIEW_FINISHED, '本次面试已结束，不可继续作答');
    }

    // 找到当前未作答的最新一题（seq 最大且 answer 为空）
    const current = await this.prisma.aiInterviewQa.findFirst({
      where: { interviewId: interview.id, userId: BigInt(userId), answer: null },
      orderBy: { seq: 'desc' },
    });
    if (!current) {
      throw new BizException(BizCode.AI_INTERVIEW_FINISHED, '暂无待作答的问题');
    }

    const career = await this.prisma.career.findFirst({
      where: { id: interview.careerId },
      select: { name: true, category: true },
    });
    const careerName = career?.name ?? '目标职业';
    const difficulty = interview.difficulty ?? 'medium';

    // 评分本轮
    const scored = await this.scoreAnswer(careerName, current.question, dto.answer, difficulty);
    let degraded = scored.degraded;

    await this.prisma.aiInterviewQa.update({
      where: { id: current.id },
      data: { answer: dto.answer, score: scored.score, feedback: scored.feedback },
    });

    const finished = current.seq >= INTERVIEW_MAX_ROUNDS;
    let nextQuestion: string | undefined;

    if (!finished) {
      const answered = await this.prisma.aiInterviewQa.findMany({
        where: { interviewId: interview.id, userId: BigInt(userId) },
        orderBy: { seq: 'asc' },
        select: { question: true },
      });
      const gen = await this.genQuestion(
        careerName,
        career?.category ?? '',
        difficulty,
        current.seq + 1,
        answered.map((a) => a.question),
      );
      degraded = degraded || gen.degraded;
      nextQuestion = gen.question;
      await this.prisma.aiInterviewQa.create({
        data: {
          interviewId: interview.id,
          userId: BigInt(userId),
          seq: current.seq + 1,
          question: gen.question,
        },
      });
    } else {
      // 结束：汇总报告写回 ai_interview
      const report = await this.summarize(userId, interview.id, careerName);
      degraded = degraded || report.degraded;
      await this.prisma.aiInterview.update({
        where: { id: interview.id },
        data: {
          status: 1,
          overallScore: report.overallScore,
          dimensionsData: report.dimensions as unknown as object,
          suggestionsData: report.suggestions as unknown as object,
          degraded: degraded ? 1 : 0,
        },
      });
    }

    return { score: scored.score, feedback: scored.feedback, nextQuestion, finished, degraded };
  }

  /**
   * 面试报告：结束后返回汇总；未结束则实时汇总当前已答轮次。
   * @throws BizException AI_NOT_FOUND(4004)/AI_FORBIDDEN(4003)
   */
  async report(userId: string, interviewId: string): Promise<InterviewReportVo> {
    const interview = await this.loadInterviewOwned(userId, interviewId);
    if (interview.status === 1 && interview.overallScore != null) {
      return {
        overallScore: interview.overallScore,
        dimensions: (interview.dimensionsData as unknown as InterviewDimensionVo[]) ?? [],
        suggestions: (interview.suggestionsData as unknown as string[]) ?? [],
      };
    }
    const career = await this.prisma.career.findFirst({
      where: { id: interview.careerId },
      select: { name: true },
    });
    const r = await this.summarize(userId, interview.id, career?.name ?? '目标职业');
    return { overallScore: r.overallScore, dimensions: r.dimensions, suggestions: r.suggestions };
  }

  /** 载入会话并校验归属：不存在 4004；非本人 4003（数据隔离）。 */
  private async loadInterviewOwned(userId: string, interviewId: string) {
    let id: bigint;
    try {
      id = BigInt(interviewId);
    } catch {
      throw new BizException(BizCode.AI_NOT_FOUND, '面试会话不存在');
    }
    const interview = await this.prisma.aiInterview.findFirst({ where: { id } });
    if (!interview) {
      throw new BizException(BizCode.AI_NOT_FOUND, '面试会话不存在');
    }
    if (interview.userId.toString() !== userId) {
      throw new BizException(BizCode.AI_FORBIDDEN, '无权访问该面试会话');
    }
    return interview;
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
      throw new BizException(BizCode.AI_MEMBER_ONLY, 'AI 模拟面试为会员专享，请先开通会员');
    }
  }

  /** 生成一道面试题（LLM→fallback）。 */
  private async genQuestion(
    careerName: string,
    category: string,
    difficulty: string,
    seq: number,
    asked: string[],
  ): Promise<{ question: string; degraded: boolean }> {
    const result = await this.llm.chat({
      prompt: {
        system: '你是资深面试官。请只输出一道面试问题本身，不要编号、不要多余说明。',
        role: `${careerName}（${category}）岗位面试官`,
        context: `难度：${difficulty}；这是第 ${seq} 题。已问过：${asked.join(' / ') || '无'}。`,
        user: '请提出一道与该岗位相关、不与已问重复的面试问题。',
      },
      callerId: userIdSafe(),
      scene: 'ai-interview-question',
    });
    if (!result.degraded && result.text?.trim()) {
      return { question: result.text.trim().slice(0, 500), degraded: false };
    }
    return { question: this.fallbackQuestion(careerName, seq), degraded: true };
  }

  /** 评分本轮作答（LLM→fallback）。 */
  private async scoreAnswer(
    careerName: string,
    question: string,
    answer: string,
    difficulty: string,
  ): Promise<{ score: number; feedback: string; degraded: boolean }> {
    const result = await this.llm.chat({
      prompt: {
        system:
          '你是面试评分官。请严格返回 JSON：{"score":80,"feedback":"反馈"}，score 为 0~100 整数，不要多余文字。',
        role: `${careerName} 面试评分官`,
        context: `难度：${difficulty}；面试问题：${question}`,
        user: `候选人作答：${answer}。请评分并给出简短反馈。`,
      },
      callerId: userIdSafe(),
      scene: 'ai-interview-score',
    });
    if (!result.degraded && result.text?.trim()) {
      const parsed = this.parseScore(result.text);
      if (parsed) return { ...parsed, degraded: false };
    }
    return { score: 60, feedback: '作答基本切题，建议结合具体案例展开，突出与岗位的匹配度。', degraded: true };
  }

  /** 汇总面试报告：基于已答轮次评分求均值 + 维度 + 建议。 */
  private async summarize(
    userId: string,
    interviewId: bigint,
    careerName: string,
  ): Promise<{ overallScore: number; dimensions: InterviewDimensionVo[]; suggestions: string[]; degraded: boolean }> {
    const qas = await this.prisma.aiInterviewQa.findMany({
      where: { interviewId, userId: BigInt(userId), answer: { not: null } },
      orderBy: { seq: 'asc' },
      select: { score: true },
    });
    const scores = qas.map((q) => q.score ?? 60);
    const overall = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const dimensions: InterviewDimensionVo[] = [
      { name: '专业能力', score: clamp(overall) },
      { name: '沟通表达', score: clamp(overall - 5) },
      { name: '岗位匹配度', score: clamp(overall + 2) },
    ];
    const suggestions = [
      `围绕「${careerName}」核心职责，用 STAR 法组织回答，突出可量化成果。`,
      '面试前梳理典型问题与项目复盘，控制答题结构与时长。',
    ];
    return { overallScore: overall, dimensions, suggestions, degraded: false };
  }

  private parseScore(text: string): { score: number; feedback: string } | null {
    try {
      const s = this.extractJson(text);
      const obj = JSON.parse(s) as Record<string, unknown>;
      const num = typeof obj.score === 'number' ? obj.score : Number(obj.score);
      const score = Number.isFinite(num) ? clamp(Math.round(num)) : 60;
      const feedback = typeof obj.feedback === 'string' && obj.feedback.trim() ? obj.feedback.trim() : '作答切题。';
      return { score, feedback };
    } catch (err) {
      this.logger.warn(`interview score parse failed: ${(err as Error).message}`);
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

  private fallbackQuestion(careerName: string, seq: number): string {
    const bank = [
      `请做一个简短的自我介绍，并说明你为何适合「${careerName}」这个岗位。`,
      `请分享一个你在过往工作/项目中最有成就感的经历。`,
      `面对该岗位常见的挑战，你会如何拆解并解决？`,
      `你如何评估自己在该领域的核心竞争力与不足？`,
      `未来 1~3 年，你在该职业方向的成长规划是什么？`,
    ];
    return bank[(seq - 1) % bank.length];
  }
}

/** 生成 LLM 调用的 callerId（面试内部不区分用户额度，走场景标识即可）。 */
function userIdSafe(): string {
  return 'ai-interview';
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}