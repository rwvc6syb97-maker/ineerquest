import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { BizCode, CommonCode, BizException } from '../../common/response';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  COACHING_ORDER_STATUS_LABEL,
  COACHING_PAY_TTL_MS,
  CoachAuditStatus,
  CoachingOrderStatus,
  CoachStatus,
  ScheduleStatus,
  SLOT_LOCK_KEY_PREFIX,
  SLOT_LOCK_TTL_MS,
} from './coaching.constants';
import { BookCoachingDto, ListCoachesDto, ReviewCoachingDto } from './coaching.dto';

/**
 * T4-01 ~ T4-04 辅导咨询服务。
 *
 * - T4-01 辅导师列表/详情/排期：仅返回 audit_status=通过 且 status=上架 的辅导师。
 * - T4-02 辅导预约下单：Redis 分布式锁锁定时段（无 Redis 降级内存锁），
 *   DB uk_coach_slot 唯一约束双重兜底防重叠；时段已占 → 60001，停止接单 → 60002。
 *   复用 payment 下单能力（bizType=2），此处仅创建 coaching_order（PENDING）与锁定时段。
 * - T4-03 confirmAfterPaid：支付回调成功后确认时段占用（LOCKED→BOOKED），
 *   未支付超时释放时段（LOCKED→FREE）。供 payment 模块/事件调用。
 * - T4-04 咨询评价：仅已完成订单可评价，coaching_review 入库并聚合更新辅导师 rating 均值/计数。
 *
 * 无真实 Redis 实例时：分布式锁降级为「进程内内存锁 + DB uk_coach_slot 唯一约束」双重兜底，标 blocked。
 */
@Injectable()
export class CoachingService implements OnModuleInit {
  private readonly logger = new Logger(CoachingService.name);
  private sweepTimer?: NodeJS.Timeout;

  /** 内存锁兜底：scheduleId → 锁到期时间戳（无 Redis 时使用）。 */
  private readonly memoryLocks = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly analytics: AnalyticsService,
  ) {}

  onModuleInit(): void {
    // T4-03 定时兜底扫描：每 60s 释放超时未支付的锁定时段（LOCKED→FREE）。
    if (process.env.NODE_ENV !== 'test') {
      this.sweepTimer = setInterval(() => {
        void this.releaseExpiredSlots().catch((err) =>
          this.logger.warn(`release expired slots skipped: ${(err as Error).message}`),
        );
      }, 60 * 1000);
      this.sweepTimer.unref?.();
    }
  }

  // ============ 号码生成 ============

  private genOrderNo(prefix = 'CO'): string {
    const now = new Date();
    const p = (n: number) => n.toString().padStart(2, '0');
    const ts =
      now.getFullYear().toString() +
      p(now.getMonth() + 1) +
      p(now.getDate()) +
      p(now.getHours()) +
      p(now.getMinutes()) +
      p(now.getSeconds());
    const rand = randomBytes(6).toString('hex');
    return `${prefix}${ts}${rand}`.slice(0, 32);
  }

  // ============ T4-01 辅导师列表 / 详情 / 排期 ============

  /**
   * GET /coaches：分页列表，仅返回已审核通过（audit_status=1）且已上架（status=1）的辅导师。
   * 支持 keyword（姓名/头衔模糊）与 expertise（专长命中）筛选。
   */
  async listCoaches(query: ListCoachesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where: Record<string, unknown> = {
      auditStatus: CoachAuditStatus.APPROVED,
      status: CoachStatus.ONLINE,
      isDeleted: 0,
    };
    if (query.keyword) {
      where.OR = [
        { realName: { contains: query.keyword } },
        { title: { contains: query.keyword } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.coach.count({ where }),
      this.prisma.coach.findMany({
        where,
        orderBy: [{ rating: 'desc' }, { orderCount: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // expertise 命中筛选（JSON 数组，DB 侧不便过滤，取回后内存过滤）
    let list = rows.map((c) => this.toCoachVo(c));
    const expertise = query.expertise;
    if (expertise) {
      list = list.filter((c) => Array.isArray(c.expertise) && c.expertise.includes(expertise));
    }

    return { list, total, page, pageSize };
  }

  /** GET /coaches/:id：详情，仅返回已审核通过且已上架的辅导师。 */
  async getCoach(id: string) {
    const coach = await this.findOnlineCoach(id);
    return this.toCoachVo(coach);
  }

  /**
   * GET /coaches/:id/schedule：返回可约时段。
   * 默认仅返回 FREE 且未开始的时段；LOCKED 但锁已过期的时段视为可约（前端提示）。
   */
  async getSchedule(id: string) {
    await this.findOnlineCoach(id);
    const now = new Date();
    const schedules = await this.prisma.coachSchedule.findMany({
      where: {
        coachId: BigInt(id),
        startTime: { gte: now },
        OR: [
          { status: ScheduleStatus.FREE },
          { status: ScheduleStatus.LOCKED, lockExpireAt: { lte: now } },
        ],
      },
      orderBy: { startTime: 'asc' },
    });
    return schedules.map((s) => ({
      id: s.id.toString(),
      coachId: s.coachId.toString(),
      startTime: s.startTime,
      endTime: s.endTime,
      status: ScheduleStatus.FREE,
    }));
  }

  /** 定位「已审核通过 + 已上架」的辅导师，否则 60002（停止接单）或 70005（不存在）。 */
  private async findOnlineCoach(id: string) {
    const coach = await this.prisma.coach.findFirst({
      where: { id: BigInt(id), isDeleted: 0 },
    });
    if (!coach) {
      throw new BizException(BizCode.ORDER_NOT_FOUND, '辅导师不存在');
    }
    if (coach.auditStatus !== CoachAuditStatus.APPROVED || coach.status !== CoachStatus.ONLINE) {
      throw new BizException(BizCode.COACH_NOT_ACCEPTING, '该辅导师已停止接单');
    }
    return coach;
  }

  private toCoachVo(c: {
    id: bigint;
    realName: string;
    avatar: string | null;
    title: string | null;
    intro: string | null;
    expertise: unknown;
    pricePerHour: bigint;
    rating: unknown;
    orderCount: number;
  }) {
    return {
      id: c.id.toString(),
      realName: c.realName,
      avatar: c.avatar,
      title: c.title,
      intro: c.intro,
      expertise: Array.isArray(c.expertise) ? (c.expertise as string[]) : [],
      pricePerHour: Number(c.pricePerHour),
      rating: Number(c.rating),
      orderCount: c.orderCount,
    };
  }

  // ============ 时段分布式锁（Redis SET NX PX，降级内存锁） ============

  /** 尝试获取时段锁。返回 true 表示获取成功。Redis 缺失时降级内存锁（标 blocked）。 */
  private async acquireSlotLock(scheduleId: string): Promise<boolean> {
    const key = `${SLOT_LOCK_KEY_PREFIX}${scheduleId}`;
    try {
      const res = await this.redis.raw.set(key, '1', 'PX', SLOT_LOCK_TTL_MS, 'NX');
      return res === 'OK';
    } catch (err) {
      // TODO(blocked): 无 Redis 实例，时段锁降级为进程内内存锁 + DB uk_coach_slot 唯一约束兜底
      this.logger.warn(`slot lock degraded to memory(blocked): ${(err as Error).message}`);
      const now = Date.now();
      const existed = this.memoryLocks.get(scheduleId);
      if (existed && existed > now) return false;
      this.memoryLocks.set(scheduleId, now + SLOT_LOCK_TTL_MS);
      return true;
    }
  }

  /** 释放时段锁（Redis DEL / 内存锁清理）。 */
  private async releaseSlotLock(scheduleId: string): Promise<void> {
    const key = `${SLOT_LOCK_KEY_PREFIX}${scheduleId}`;
    try {
      await this.redis.raw.del(key);
    } catch {
      /* 降级忽略 */
    }
    this.memoryLocks.delete(scheduleId);
  }

  // ============ T4-02 辅导预约下单（时段锁 + uk_coach_slot 防重叠） ============

  /**
   * POST /coaches/book：创建咨询订单（bizType=2）并锁定时段。
   * 1) 校验辅导师已上架接单，否则 60002。
   * 2) Redis 分布式锁抢占时段，抢锁失败 → 60001。
   * 3) 事务内 CAS 将 schedule FREE→LOCKED（写 lock_expire_at）；命中 0 行说明已被占 → 60001。
   * 4) 创建 coaching_order（PENDING，pay_expire_at=15min），金额取 coach.price_per_hour × 时长。
   * 5) 后续复用 payment 下单能力：前端以 bizType=2 + coachingOrder.id 调 POST /payments/orders。
   */
  async bookCoaching(userId: string, dto: BookCoachingDto) {
    const coach = await this.findOnlineCoach(dto.coachId);
    const scheduleId = dto.scheduleId;

    // 抢时段锁（Redis NX；降级内存锁）
    const locked = await this.acquireSlotLock(scheduleId);
    if (!locked) {
      throw new BizException(BizCode.COACH_SLOT_TAKEN, '该时段已被占用，请选择其他时段');
    }

    try {
      const now = new Date();
      const lockExpireAt = new Date(now.getTime() + SLOT_LOCK_TTL_MS);
      const payExpireAt = new Date(now.getTime() + COACHING_PAY_TTL_MS);

      const order = await this.prisma.$transaction(async (tx) => {
        // 校验时段归属该辅导师且当前可约（FREE 或锁已过期的 LOCKED）
        const schedule = await tx.coachSchedule.findFirst({
          where: { id: BigInt(scheduleId), coachId: BigInt(dto.coachId) },
        });
        if (!schedule) {
          throw new BizException(BizCode.ORDER_NOT_FOUND, '排期时段不存在');
        }
        const reusable =
          schedule.status === ScheduleStatus.FREE ||
          (schedule.status === ScheduleStatus.LOCKED &&
            schedule.lockExpireAt !== null &&
            schedule.lockExpireAt.getTime() <= now.getTime());
        if (!reusable) {
          // 已 BOOKED 或仍在有效锁定期 → 时段已占用
          throw new BizException(BizCode.COACH_SLOT_TAKEN, '该时段已被占用，请选择其他时段');
        }

        // CAS FREE/过期LOCKED → LOCKED（防并发覆盖；uk_coach_slot 唯一约束兜底防重叠）
        const cas = await tx.coachSchedule.updateMany({
          where: { id: schedule.id, status: schedule.status },
          data: { status: ScheduleStatus.LOCKED, lockExpireAt },
        });
        if (cas.count === 0) {
          throw new BizException(BizCode.COACH_SLOT_TAKEN, '该时段已被占用，请选择其他时段');
        }

        const durationMin = 60;
        const amount = BigInt(coach.pricePerHour); // 单价（分/小时）× 1 小时
        const created = await tx.coachingOrder.create({
          data: {
            orderNo: this.genOrderNo(),
            userId: BigInt(userId),
            coachId: BigInt(dto.coachId),
            scheduleId: schedule.id,
            consultType: dto.consultType ?? 1,
            durationMin,
            amount,
            status: CoachingOrderStatus.PENDING,
            payExpireAt,
          },
        });
        // 回填 schedule.order_id
        await tx.coachSchedule.update({
          where: { id: schedule.id },
          data: { orderId: created.id },
        });
        return created;
      });

      this.analytics.fire({
        userId,
        eventType: 'coaching_order_create',
        properties: {
          orderId: order.id.toString(),
          coachId: dto.coachId,
          scheduleId,
          amount: Number(order.amount),
        },
      });

      return {
        id: order.id.toString(),
        orderNo: order.orderNo,
        coachId: order.coachId.toString(),
        scheduleId: order.scheduleId.toString(),
        amount: Number(order.amount),
        status: order.status,
        statusLabel: COACHING_ORDER_STATUS_LABEL[order.status] ?? 'unknown',
        payExpireAt: order.payExpireAt,
        // 幂等键：同一用户对同一时段唯一（uk_user_schedule），供前端防重复提交
        idempotencyKey: `${userId}:${order.scheduleId.toString()}`,
        // 复用 payment 下单：bizType=2 + bizId=order.id
        bizType: 2,
      };
    } catch (err) {
      // 下单失败释放锁，允许其他用户重试
      await this.releaseSlotLock(scheduleId);
      // 唯一约束冲突（P2002）按约束名区分：
      // - uk_user_schedule：同一用户对同一时段重复下单 → 4090 幂等提示
      // - uk_coach_slot（或其他）：并发抢占时段重叠 → 60001 时段已占
      if ((err as { code?: string }).code === 'P2002') {
        const target = (err as { meta?: { target?: unknown } }).meta?.target;
        const targetStr = Array.isArray(target) ? target.join(',') : String(target ?? '');
        if (targetStr.includes('uk_user_schedule')) {
          throw new BizException(BizCode.DUPLICATE_SUBMIT, '该时段您已预约，请勿重复下单');
        }
        throw new BizException(BizCode.COACH_SLOT_TAKEN, '该时段已被占用，请选择其他时段');
      }
      throw err;
    }
  }

  // ============ T4-03 支付成功确认占用时段 / 超时释放 ============

  /**
   * confirmAfterPaid：支付回调成功后确认时段占用。供 payment 模块或事件调用。
   * - 依据 coachingOrderId 定位订单：PENDING → PAID；schedule LOCKED → BOOKED。
   * - 幂等：订单已 PAID 直接返回成功。
   */
  async confirmAfterPaid(coachingOrderId: string, paymentOrderId?: string): Promise<{ ok: true }> {
    const order = await this.prisma.coachingOrder.findFirst({
      where: { id: BigInt(coachingOrderId) },
    });
    if (!order) {
      throw new BizException(BizCode.ORDER_NOT_FOUND, '咨询订单不存在');
    }
    if (order.status === CoachingOrderStatus.PAID) {
      return { ok: true }; // 幂等
    }
    if (order.status !== CoachingOrderStatus.PENDING) {
      throw new BizException(CommonCode.BAD_REQUEST, '咨询订单状态不支持确认');
    }

    await this.prisma.$transaction(async (tx) => {
      // 订单 PENDING → PAID
      const upd = await tx.coachingOrder.updateMany({
        where: { id: order.id, status: CoachingOrderStatus.PENDING },
        data: {
          status: CoachingOrderStatus.PAID,
          paidAt: new Date(),
          paymentOrderId: paymentOrderId ? BigInt(paymentOrderId) : undefined,
        },
      });
      if (upd.count === 0) {
        throw new BizException(CommonCode.BAD_REQUEST, '咨询订单状态已变更');
      }
      // 时段 LOCKED → BOOKED（确认占用）
      await tx.coachSchedule.updateMany({
        where: { id: order.scheduleId },
        data: { status: ScheduleStatus.BOOKED, lockExpireAt: null },
      });
    });

    await this.releaseSlotLock(order.scheduleId.toString());
    this.analytics.fire({
      userId: order.userId.toString(),
      eventType: 'coaching_slot_confirmed',
      properties: { orderId: order.id.toString(), scheduleId: order.scheduleId.toString() },
    });
    return { ok: true };
  }

  /**
   * 定时兜底：释放超时未支付订单占用的时段（LOCKED→FREE），并关闭订单（PENDING→CANCELLED）。
   * 返回释放数量（供单测断言）。
   */
  async releaseExpiredSlots(now: Date = new Date()): Promise<number> {
    const expired = await this.prisma.coachingOrder.findMany({
      where: { status: CoachingOrderStatus.PENDING, payExpireAt: { lte: now } },
      select: { id: true, scheduleId: true },
    });
    let released = 0;
    for (const o of expired) {
      await this.prisma.$transaction(async (tx) => {
        const upd = await tx.coachingOrder.updateMany({
          where: { id: o.id, status: CoachingOrderStatus.PENDING },
          data: { status: CoachingOrderStatus.CANCELLED, cancelReason: '支付超时自动释放' },
        });
        if (upd.count > 0) {
          await tx.coachSchedule.updateMany({
            where: { id: o.scheduleId, status: ScheduleStatus.LOCKED },
            data: { status: ScheduleStatus.FREE, orderId: null, lockExpireAt: null },
          });
        }
        released += upd.count;
      });
      await this.releaseSlotLock(o.scheduleId.toString());
    }
    if (released > 0) this.logger.log(`released ${released} expired coaching slots`);
    return released;
  }

  // ============ T4-04 咨询评价（聚合更新辅导师评分） ============

  /**
   * POST /orders/:id/review：仅已完成订单（FINISHED）可评价。
   * - 一单一评（coaching_review uk_order_id）；重复评价 → 已存在报错。
   * - 评价入库后聚合更新辅导师 rating（历史均值再平均）与订单计数 order_count。
   */
  async reviewOrder(userId: string, orderId: string, dto: ReviewCoachingDto) {
    const order = await this.prisma.coachingOrder.findFirst({
      where: { id: BigInt(orderId), userId: BigInt(userId) },
    });
    if (!order) {
      throw new BizException(BizCode.ORDER_NOT_FOUND, '咨询订单不存在或无权访问');
    }
    if (order.status !== CoachingOrderStatus.FINISHED) {
      throw new BizException(CommonCode.BAD_REQUEST, '仅已完成的咨询订单可评价');
    }
    const existed = await this.prisma.coachingReview.findUnique({
      where: { orderId: order.id },
    });
    if (existed) {
      throw new BizException(CommonCode.BAD_REQUEST, '该订单已评价，请勿重复评价');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const review = await tx.coachingReview.create({
        data: {
          orderId: order.id,
          userId: BigInt(userId),
          coachId: order.coachId,
          rating: dto.rating,
          content: dto.content ?? null,
          tags: dto.tags ?? undefined,
          isAnonymous: dto.isAnonymous ?? 0,
        },
      });

      // 聚合更新辅导师评分：avg = (SUM(rating)) / COUNT，用 aggregate 精确计算
      const agg = await tx.coachingReview.aggregate({
        where: { coachId: order.coachId, isDeleted: 0 },
        _avg: { rating: true },
        _count: { _all: true },
      });
     const avg = agg._avg.rating ?? dto.rating;
      const rounded = Math.round(avg * 100) / 100;
      await tx.coach.update({
        where: { id: order.coachId },
        data: { rating: rounded, orderCount: agg._count._all },
      });
      return { review, avg: rounded, count: agg._count._all };
    });

    this.analytics.fire({
      userId,
      eventType: 'coaching_review_create',
      properties: {
        orderId,
        coachId: order.coachId.toString(),
        rating: dto.rating,
        coachAvgRating: result.avg,
      },
    });

    return {
      id: result.review.id.toString(),
      orderId: orderId,
      rating: dto.rating,
      coachRating: result.avg,
      reviewCount: result.count,
    };
  }
}