import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RecordStatus } from '../assessment/assessment.constants';

/** 首页统计出参（对齐 PM 接口契约：驼峰字段） */
export interface HomeStats {
  /**
   * 已完成测评数（首页文案"已完成测评"）。
   * 口径（四缺陷整改基线 §一.2 强制）：= submitted
   *   = count(assessment_record WHERE status=SUBMITTED(2) AND isDeleted=0)
   * 与后台 assessment-rate.submitted 完全一致，禁止用 event_log 计数。
   */
  completedCount: number;
  /** 用户满意度：有效评价中 isSatisfied=1 占比 *100，四舍五入为 0~100 整数，无评价=0 */
  satisfactionRate: number;
  /** 职业库方向数：career.status=1 且未删除 的计数 */
  careerCount: number;
  /** 报告平均评分：有效评价 rating 平均值，保留 1 位小数，无评价=0 */
  avgReportRating: number;
}

/** 5 分钟内存缓存 TTL（毫秒） */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * StatsService —— 首页真实数据化。
 * 口径依据（PM 已确认，勿改）：
 * - completedCount = count(assessment_record where status=SUBMITTED(2) AND isDeleted=0)
 * - careerCount    = count(career where status=1 AND isDeleted=0)
 * - satisfactionRate / avgReportRating 仅统计有效评价 report_feedback where isDeleted=0
 * 全部计数无数据兜底为 0，绝不报错；加 5 分钟内存缓存避免每次全表 count。
 */
@Injectable()
export class StatsService {
  private cache: { data: HomeStats; expireAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getHomeStats(): Promise<HomeStats> {
    const now = Date.now();
    if (this.cache && this.cache.expireAt > now) {
      return this.cache.data;
    }

    const data = await this.computeHomeStats();
    this.cache = { data, expireAt: now + CACHE_TTL_MS };
    return data;
  }

  /** 手动清空首页统计缓存（口径校验/整改后强制刷新用）。 */
  clearCache(): void {
    this.cache = null;
  }

  private async computeHomeStats(): Promise<HomeStats> {
    // 已完成测评数（口径基线 §一.2）：status=SUBMITTED(2) 且未删除，等同后台 submitted
    const completedCount = await this.prisma.assessmentRecord.count({
      where: { status: RecordStatus.SUBMITTED, isDeleted: 0 },
    });

    // 职业库方向数：上架且未删除
    const careerCount = await this.prisma.career.count({
      where: { status: 1, isDeleted: 0 },
    });

    // 有效评价统计：总数、满意数、评分聚合
    const feedbackWhere = { isDeleted: 0 } as const;
    const totalFeedback = await this.prisma.reportFeedback.count({ where: feedbackWhere });

    let satisfactionRate = 0;
    let avgReportRating = 0;

    if (totalFeedback > 0) {
      const satisfiedCount = await this.prisma.reportFeedback.count({
        where: { ...feedbackWhere, isSatisfied: 1 },
      });
      satisfactionRate = Math.round((satisfiedCount / totalFeedback) * 100);

      const agg = await this.prisma.reportFeedback.aggregate({
        where: feedbackWhere,
        _avg: { rating: true },
      });
      const avg = agg._avg.rating ?? 0;
      avgReportRating = Math.round(avg * 10) / 10;
    }

    return { completedCount, satisfactionRate, careerCount, avgReportRating };
  }
}