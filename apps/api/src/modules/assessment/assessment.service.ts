import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { BizCode, BizException } from '../../common/response';
import { ScoringService, ScoredAnswer } from './scoring.service';
import {
  DEFAULT_QUESTION_VERSION,
  DimensionKey,
  DRAFT_REDIS_PREFIX,
  DRAFT_REDIS_TTL_SEC,
  RecordStatus,
} from './assessment.constants';
import { AnswerItemDto } from './assessment.dto';

@Injectable()
export class AssessmentService {
  private readonly logger = new Logger(AssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly scoring: ScoringService,
  ) {}

  // ============ T1-08 防遍历记录号 ============

  /**
   * 生成不可遍历的 record_no（Char(24)）：时间前缀 + 高熵随机，避免自增裸露被遍历。
   * 形如 R + yyMMddHHmm(10) + 13 位随机大写字母数字。
   */
  private genRecordNo(): string {
    const now = new Date();
    const p = (n: number) => n.toString().padStart(2, '0');
    const prefix =
      p(now.getFullYear() % 100) +
      p(now.getMonth() + 1) +
      p(now.getDate()) +
      p(now.getHours()) +
      p(now.getMinutes());
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const raw = randomBytes(13);
    let rand = '';
    for (let i = 0; i < 13; i++) rand += alphabet[raw[i] % alphabet.length];
    return `R${prefix}${rand}`.slice(0, 24);
  }

  // ============ T1-07 拉取题库 ============

  /**
   * GET /assessments/questions：返回指定版本题库，按 EI/SN/TF/JP 维度组织。
   * 题库为公开内容（无个人数据），可供未登录预览。
   */
  async getQuestions(version?: string, dimension?: number) {
    const ver = version || DEFAULT_QUESTION_VERSION;
    const questions = await this.prisma.assessmentQuestion.findMany({
      where: {
        version: ver,
        status: 1,
        isDeleted: 0,
        ...(dimension ? { dimension } : {}),
      },
      orderBy: [{ dimension: 'asc' }, { sortOrder: 'asc' }],
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
      },
    });

    // 按维度分组组织
    const grouped: Record<string, unknown[]> = { EI: [], SN: [], TF: [], JP: [] };
    for (const q of questions) {
      const key = (DimensionKey as Record<number, string>)[q.dimension];
      if (!key) continue;
      grouped[key].push({
        id: q.id.toString(),
        dimension: q.dimension,
        content: q.content,
        sortOrder: q.sortOrder,
        isReverse: q.isReverse,
        options: q.options.map((o) => ({
          id: o.id.toString(),
          optionKey: o.optionKey,
          content: o.content,
          polarity: o.polarity,
          score: o.score,
          sortOrder: o.sortOrder,
        })),
      });
    }

    return {
      version: ver,
      total: questions.length,
      dimensions: grouped,
    };
  }

  // ============ T1-08 创建测评记录 ============

  /** POST /assessments/records：创建进行中的测评记录，生成防遍历 record_no。 */
  async createRecord(userId: string, version?: string) {
    const ver = version || DEFAULT_QUESTION_VERSION;
    const totalQuestions = await this.prisma.assessmentQuestion.count({
      where: { version: ver, status: 1, isDeleted: 0 },
    });

    // 重试保证 record_no 唯一（极低概率碰撞）
    let recordNo = this.genRecordNo();
    for (let i = 0; i < 3; i++) {
      const dup = await this.prisma.assessmentRecord.findFirst({
        where: { recordNo },
        select: { id: true },
      });
      if (!dup) break;
      recordNo = this.genRecordNo();
    }

    const record = await this.prisma.assessmentRecord.create({
      data: {
        recordNo,
        userId: BigInt(userId),
        questionVersion: ver,
        totalQuestions: totalQuestions || 60,
        status: RecordStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });

    return {
      id: record.id.toString(),
      recordNo: record.recordNo,
      questionVersion: record.questionVersion,
      totalQuestions: record.totalQuestions,
      status: record.status,
      startedAt: record.startedAt,
    };
  }

  /** 校验记录归属并返回（不存在/越权抛 30001）。 */
  private async getOwnedRecord(userId: string, recordId: string) {
    const record = await this.prisma.assessmentRecord.findFirst({
      where: { id: BigInt(recordId), userId: BigInt(userId), isDeleted: 0 },
    });
    if (!record) {
      throw new BizException(BizCode.ASSESSMENT_RECORD_NOT_FOUND, '测评记录不存在或无权访问');
    }
    return record;
  }

  private draftKey(recordId: string): string {
    return `${DRAFT_REDIS_PREFIX}${recordId}`;
  }

  // ============ T1-09 分段暂存答案（草稿） ============

  /**
   * PATCH /records/:id/answers：答案入库 + Redis 草稿，支持断点续答。
   * 答案 upsert 到 assessment_answer（唯一 [recordId, questionId]），
   * 同步 assessment_progress，并写 Redis 草稿快照（无 Redis 时降级不阻断）。
   */
  async saveAnswers(userId: string, recordId: string, answers: AnswerItemDto[]) {
    const record = await this.getOwnedRecord(userId, recordId);
    if (record.status !== RecordStatus.IN_PROGRESS) {
      throw new BizException(BizCode.ASSESSMENT_STATUS_INVALID, '该测评已提交，无法继续作答');
    }

    // 逐条 upsert 答案入库
    for (const a of answers) {
      await this.prisma.assessmentAnswer.upsert({
        where: {
          recordId_questionId: {
            recordId: record.id,
            questionId: BigInt(a.questionId),
          },
        },
        create: {
          recordId: record.id,
          userId: BigInt(userId),
          questionId: BigInt(a.questionId),
          optionId: BigInt(a.optionId),
        },
        update: { optionId: BigInt(a.optionId), answeredAt: new Date() },
      });
    }

    const answeredCount = await this.prisma.assessmentAnswer.count({
      where: { recordId: record.id },
    });

    // 同步进度表
    await this.prisma.assessmentProgress.upsert({
      where: { recordId: record.id },
      create: {
        recordId: record.id,
        userId: BigInt(userId),
        answeredCount,
        currentQuestion: answeredCount + 1,
        draftAnswers: answers as unknown as object,
        lastSavedAt: new Date(),
      },
      update: {
        answeredCount,
        currentQuestion: answeredCount + 1,
        draftAnswers: answers as unknown as object,
        lastSavedAt: new Date(),
      },
    });

    // Redis 草稿快照（断点续答加速，失败降级不阻断）
    try {
      await this.redis.raw.set(
        this.draftKey(recordId),
        JSON.stringify({ answeredCount, answers, savedAt: Date.now() }),
        'EX',
        DRAFT_REDIS_TTL_SEC,
      );
    } catch (err) {
      // TODO(blocked): 无真实 Redis 实例时降级，仅告警不影响入库
      this.logger.warn(`draft cache skipped: ${(err as Error).message}`);
    }

    return {
      recordId,
      answeredCount,
      totalQuestions: record.totalQuestions,
      completed: answeredCount >= record.totalQuestions,
    };
  }

  // ============ T1-10 提交计分 ============

  /**
   * POST /records/:id/submit：校验完整性（不完整抛 30002），
   * 纯规则计分得出 4 字母 MBTI 类型并落库 assessment_result。严禁 LLM。
   */
  async submit(userId: string, recordId: string) {
    const record = await this.getOwnedRecord(userId, recordId);
    if (record.status === RecordStatus.SUBMITTED) {
      // 已提交则直接返回既有结果（幂等）
      const existed = await this.prisma.assessmentResult.findFirst({
        where: { recordId: record.id },
      });
      if (existed) return this.formatResult(record.recordNo, existed);
    }

    // 拉取答案 + 关联题目维度/选项极性分值
    const answers = await this.prisma.assessmentAnswer.findMany({
      where: { recordId: record.id },
      include: { question: true },
    });

    // 完整性校验
    if (answers.length < record.totalQuestions) {
      throw new BizException(
        BizCode.ASSESSMENT_INCOMPLETE,
        `答卷未完成（${answers.length}/${record.totalQuestions}）`,
      );
    }

    // 批量取所选选项的极性与分值
    const optionIds = answers.map((a) => a.optionId);
    const options = await this.prisma.assessmentOption.findMany({
      where: { id: { in: optionIds } },
      select: { id: true, polarity: true, score: true },
    });
    const optMap = new Map(options.map((o) => [o.id.toString(), o]));

    const scored: ScoredAnswer[] = answers.map((a) => {
      const opt = optMap.get(a.optionId.toString());
      return {
        dimension: a.question.dimension,
        polarity: opt?.polarity ?? 0,
        score: opt?.score ?? 0,
      };
    });

    const result = this.scoring.score(scored);

    const saved = await this.prisma.assessmentResult.upsert({
      where: { recordId: record.id },
      create: {
        recordId: record.id,
        userId: BigInt(userId),
        mbtiType: result.mbtiType,
        scoreEi: result.scoreEi,
        scoreSn: result.scoreSn,
        scoreTf: result.scoreTf,
        scoreJp: result.scoreJp,
        typeGroup: result.typeGroup,
        isAbnormal: result.isAbnormal ? 1 : 0,
      },
      update: {
        mbtiType: result.mbtiType,
        scoreEi: result.scoreEi,
        scoreSn: result.scoreSn,
        scoreTf: result.scoreTf,
        scoreJp: result.scoreJp,
        typeGroup: result.typeGroup,
        isAbnormal: result.isAbnormal ? 1 : 0,
      },
    });

    // 更新记录状态为已提交
    await this.prisma.assessmentRecord.update({
      where: { id: record.id },
      data: { status: RecordStatus.SUBMITTED, submittedAt: new Date() },
    });

    // 清理 Redis 草稿
    try {
      await this.redis.raw.del(this.draftKey(recordId));
    } catch {
      /* 降级忽略 */
    }

    return this.formatResult(record.recordNo, saved);
  }

  private formatResult(
    recordNo: string,
    r: { mbtiType: string; scoreEi: unknown; scoreSn: unknown; scoreTf: unknown; scoreJp: unknown; typeGroup: number; isAbnormal: number; recordId: bigint },
  ) {
    return {
      recordNo,
      recordId: r.recordId.toString(),
      mbtiType: r.mbtiType,
      scores: {
        EI: Number(r.scoreEi),
        SN: Number(r.scoreSn),
        TF: Number(r.scoreTf),
        JP: Number(r.scoreJp),
      },
      typeGroup: r.typeGroup,
      isAbnormal: r.isAbnormal === 1,
    };
  }

  // ============ T1-11 历史/结果查询 ============

  /** GET /records：当前用户测评历史列表。 */
  async listRecords(userId: string) {
    const records = await this.prisma.assessmentRecord.findMany({
      where: { userId: BigInt(userId), isDeleted: 0 },
      orderBy: { createdAt: 'desc' },
      include: { result: { select: { mbtiType: true } } },
    });
    return records.map((r) => ({
      id: r.id.toString(),
      recordNo: r.recordNo,
      questionVersion: r.questionVersion,
      totalQuestions: r.totalQuestions,
      status: r.status,
      mbtiType: r.result?.mbtiType ?? null,
      startedAt: r.startedAt,
      submittedAt: r.submittedAt,
    }));
  }

  /** GET /records/:id/result：单次测结果详情。 */
  async getResult(userId: string, recordId: string) {
    const record = await this.getOwnedRecord(userId, recordId);
    const result = await this.prisma.assessmentResult.findFirst({
      where: { recordId: record.id },
    });
    if (!result) {
      throw new BizException(BizCode.ASSESSMENT_INCOMPLETE, '该测评尚未完成计分');
    }
    return this.formatResult(record.recordNo, result);
  }
}