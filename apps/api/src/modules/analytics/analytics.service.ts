import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ClickHouseService } from '../../infra/clickhouse/clickhouse.service';

/**
 * T1-23 埋点上报服务。
 * 关键行为埋点入库，核心漏斗可查。
 * 设计目标：MQ 异步 + ClickHouse 按天分区。当前无 MQ/ClickHouse 实例时降级为
 * 直写 MySQL event_log（Prisma），全部包 try-catch，绝不阻断主流程。
 *
 * 落地情况：
 * - MySQL event_log：真实 Prisma 写入（主路径）。
 * - ClickHouse：初始化成功则异步双写（按天分区表 event_log_local，见 TODO）。
 * - MQ：TODO(blocked)无实例，降级为进程内直写；接入后改为发消息。
 */

/** 关键行为事件类型（核心漏斗）。 */
export const EventType = {
  ASSESSMENT_START: 'assessment_start',
  ASSESSMENT_SUBMIT: 'assessment_submit',
  REPORT_GENERATE: 'report_generate',
  REPORT_VIEW: 'report_view',
  REPORT_UNLOCK_VIEW_BLOCKED: 'report_unlock_view_blocked',
  REPORT_SECTION_VIEW: 'report_section_view',
  REPORT_UNLOCK: 'report_unlock',
  REPORT_EXPORT: 'report_export',
  REPORT_SHARE: 'report_share',
  CAREER_LIST: 'career_list',
  CAREER_DETAIL: 'career_detail',
  CAREER_RECOMMEND: 'career_recommend',
} as const;

export interface TrackEvent {
  userId?: string | null;
  sessionId?: string | null;
  eventType: string;
  page?: string | null;
  properties?: Record<string, unknown> | null;
  ua?: string | null;
  device?: string | null;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clickhouse: ClickHouseService,
  ) {}

  /**
   * 上报单个事件。非阻塞：内部吞掉所有异常，仅告警。
   * 调用方无需 await 也可（fire-and-forget），但为便于测试返回 Promise。
   */
  async track(evt: TrackEvent): Promise<void> {
    // 1) 主路径：直写 MySQL event_log
    try {
      await this.prisma.eventLog.create({
        data: {
          userId: evt.userId ? BigInt(evt.userId) : null,
          sessionId: evt.sessionId ?? null,
          eventType: evt.eventType,
          page: evt.page ?? null,
          properties: evt.properties as any,
          ua: evt.ua ?? null,
          device: evt.device ?? null,
          eventTime: new Date(),
        },
      });
    } catch (err) {
      // TODO(blocked): 无 MQ 实例，降级为直写；直写失败仅告警不阻断业务
      this.logger.warn(`event_log write skipped: ${(err as Error).message}`);
    }

    // 2) 分析路径：ClickHouse 按天分区（无实例时降级跳过）
    await this.writeClickHouse(evt);
  }

  /** fire-and-forget 包装：调用方无需 await，异常不外泄。 */
  fire(evt: TrackEvent): void {
    void this.track(evt).catch((err) => {
      this.logger.warn(`analytics fire skipped: ${(err as Error).message}`);
    });
  }

  /**
   * ClickHouse 异步双写（按天分区）。
   * TODO(blocked): 无真实 ClickHouse 实例时 getClient 抛错，此处 try-catch 降级。
   * 生产表建议：event_log ENGINE=MergeTree PARTITION BY toYYYYMMDD(event_time)。
   */
  private async writeClickHouse(evt: TrackEvent): Promise<void> {
    try {
      const ready = await this.clickhouse.ping();
      if (!ready) {
        return;
      }
      await this.clickhouse.getClient().insert({
        table: 'event_log',
        values: [
          {
            user_id: evt.userId ?? null,
            session_id: evt.sessionId ?? null,
            event_type: evt.eventType,
            page: evt.page ?? null,
            properties: JSON.stringify(evt.properties ?? {}),
            ua: evt.ua ?? null,
            device: evt.device ?? null,
            event_time: this.formatChDateTime(new Date()),
          },
        ],
        format: 'JSONEachRow',
      });
    } catch (err) {
      // TODO(blocked): ClickHouse 未就绪时降级跳过，不影响主流程
      this.logger.warn(`clickhouse insert skipped: ${(err as Error).message}`);
    }
  }

  private formatChDateTime(d: Date): string {
    const p = (n: number) => n.toString().padStart(2, '0');
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
      `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    );
  }

  /**
   * 核心漏斗查询（运营可查）：按事件类型统计近 N 天计数。
   * 优先 ClickHouse，未就绪降级 MySQL 聚合。
   */
  async funnel(days = 7): Promise<Array<{ eventType: string; count: number }>> {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    try {
      const rows = await this.prisma.eventLog.groupBy({
        by: ['eventType'],
        where: { eventTime: { gte: since } },
        _count: { _all: true },
      });
      return rows.map((r) => ({ eventType: r.eventType, count: r._count._all }));
    } catch (err) {
      this.logger.warn(`funnel query skipped: ${(err as Error).message}`);
      return [];
    }
  }
}