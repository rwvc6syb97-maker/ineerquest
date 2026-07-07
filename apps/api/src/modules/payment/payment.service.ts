import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { BizCode, CommonCode, BizException } from '../../common/response';
import { AnalyticsService } from '../analytics/analytics.service';
import { CoachingService } from '../coaching/coaching.service';
import { WechatPayAdapter, PayChannelAdapter } from './pay-channel.adapter';
import {
  BizType,
  CHANNEL_MAP,
  CLOSE_QUEUE_KEY,
  ORDER_STATUS_LABEL,
  OrderStatus,
  ORDER_TTL_MS,
  PayChannel,
  RefundStatus,
  REPORT_UNLOCK_PRICE,
  TransactionStatus,
  TransactionType,
} from './payment.constants';

/**
 * T2-01 ~ T2-07 支付订单服务。
 *
 * - T2-01 多态创建订单：bizType(1报告/2咨询/3会员) + bizId → payment_order 落库，15 分钟 expire_at。
 * - T2-02 15 分钟延迟关单：Redis ZSET 延迟队列 + 定时兜底扫描 (status,expire_at)，超时置 CLOSED，错误码 70001。
 * - T2-03 发起支付：微信支付适配器 prepay，金额不符 70003，已关闭 70001。
 * - T2-04 支付回调：签名校验(70007) + uk_channel_trade_no 唯一幂等，重复回调返回成功。
 * - T2-07 退款申请：payment_refund 落库，状态机 1申请中→2处理中→3成功。
 *
 * Redis 缺失时延迟队列降级，仅依赖定时兜底扫描（与阶段1降级风格一致，标 blocked）。
 */
@Injectable()
export class PaymentService implements OnModuleInit {
  private readonly logger = new Logger(PaymentService.name);
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly analytics: AnalyticsService,
    private readonly wechatPay: WechatPayAdapter,
    private readonly coaching: CoachingService,
  ) {}

  onModuleInit(): void {
    // T2-02 定时兜底扫描：每 60s 扫一次超时未支付订单关单（延迟队列的兜底）。
    if (process.env.NODE_ENV !== 'test') {
      this.sweepTimer = setInterval(() => {
        void this.sweepExpiredOrders().catch((err) =>
          this.logger.warn(`sweep expired orders skipped: ${(err as Error).message}`),
        );
      }, 60 * 1000);
      this.sweepTimer.unref?.();
    }
  }

  // ============ 号码生成 ============

  private genNo(prefix: string): string {
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

  private resolveChannel(channelStr: string): number {
    const ch = CHANNEL_MAP[channelStr?.toLowerCase()];
    if (!ch) {
      throw new BizException(CommonCode.BAD_REQUEST, `不支持的支付渠道: ${channelStr}`);
    }
    return ch;
  }

  private getAdapter(channel: number): PayChannelAdapter {
    // 当前仅微信通道有真实适配器；其余渠道复用微信 mock 适配器占位（TODO blocked）。
    if (channel === PayChannel.WECHAT) return this.wechatPay;
    return this.wechatPay;
  }

  // ============ T2-01 多态创建订单 ============

  /**
   * POST /payments/orders：依据 bizType + bizId 创建订单并落库。
   * - 报告解锁：校验 report 归属，定价取 REPORT_UNLOCK_PRICE。
   * - 会员：校验 membership_plan 上架(status=1)，下架返回 70004；定价取 plan.price。
   * - 咨询：校验 coaching_order 归属与金额。
   */
  async createOrder(userId: string, bizType: number, bizId: string) {
    const { subject, amount } = await this.resolveBiz(userId, bizType, bizId);

    const payNo = this.genNo('PAY');
    const expireAt = new Date(Date.now() + ORDER_TTL_MS);
    const order = await this.prisma.paymentOrder.create({
      data: {
        payNo,
        userId: BigInt(userId),
        bizType,
        bizId: BigInt(bizId),
        subject,
        amount: BigInt(amount),
        status: OrderStatus.PENDING,
        expireAt,
      },
    });

    // T2-02 入延迟关单队列（Redis 缺失降级，靠定时兜底扫描）
    await this.enqueueClose(order.id.toString(), expireAt.getTime());

    this.analytics.fire({
      userId,
      eventType: 'payment_order_create',
      properties: { orderId: order.id.toString(), bizType, bizId, amount },
    });

    return this.toOrderVo(order);
  }

  /** 依据 bizType 解析商品标题与应付金额（分），并做归属/上架校验。 */
  private async resolveBiz(
    userId: string,
    bizType: number,
    bizId: string,
  ): Promise<{ subject: string; amount: number }> {
    switch (bizType) {
      case BizType.REPORT_UNLOCK: {
        const report = await this.prisma.report.findFirst({
          where: { id: BigInt(bizId), userId: BigInt(userId), isDeleted: 0 },
        });
        if (!report) {
          throw new BizException(BizCode.ORDER_NOT_FOUND, '报告不存在或无权访问');
        }
        return { subject: `报告解锁-${report.mbtiType}`, amount: REPORT_UNLOCK_PRICE };
      }
      case BizType.MEMBERSHIP: {
        const plan = await this.prisma.membershipPlan.findFirst({
          where: { id: BigInt(bizId), isDeleted: 0 },
        });
        if (!plan) {
          throw new BizException(BizCode.ORDER_NOT_FOUND, '套餐不存在');
        }
        // 下架套餐下单返回 70004
        if (plan.status !== 1) {
          throw new BizException(BizCode.MEMBERSHIP_PLAN_OFFLINE, '该套餐已下架，无法下单');
        }
        return { subject: plan.name, amount: Number(plan.price) };
      }
      case BizType.COACHING: {
        const co = await this.prisma.coachingOrder.findFirst({
          where: { id: BigInt(bizId), userId: BigInt(userId) },
        });
        if (!co) {
          throw new BizException(BizCode.ORDER_NOT_FOUND, '咨询订单不存在或无权访问');
        }
        return { subject: '职业咨询预约', amount: Number(co.amount) };
      }
      default:
        throw new BizException(CommonCode.BAD_REQUEST, '非法业务类型');
    }
  }

  // ============ T2-02 15 分钟延迟关单 ============

  /** 入延迟队列（Redis ZSET，score=到期时间戳）。Redis 缺失降级标 blocked。 */
  private async enqueueClose(orderId: string, expireTs: number): Promise<void> {
    try {
      await this.redis.raw.zadd(CLOSE_QUEUE_KEY, expireTs, orderId);
    } catch (err) {
      // TODO(blocked): 无 Redis 实例，延迟队列降级，仅靠定时兜底扫描关单
      this.logger.warn(`close queue enqueue degraded(blocked): ${(err as Error).message}`);
    }
  }

  /**
   * 定时兜底扫描：关闭所有 status=PENDING 且 expire_at<=now 的订单（错误码语义 70001）。
   * 同时消费 Redis 延迟队列中已到期的成员。返回本次关单数量（供单测断言）。
   */
  async sweepExpiredOrders(now: Date = new Date()): Promise<number> {
    const expired = await this.prisma.paymentOrder.findMany({
      where: { status: OrderStatus.PENDING, expireAt: { lte: now } },
      select: { id: true },
    });
    let closed = 0;
    for (const o of expired) {
      const r = await this.prisma.paymentOrder.updateMany({
        where: { id: o.id, status: OrderStatus.PENDING },
        data: { status: OrderStatus.CLOSED },
      });
      closed += r.count;
    }
    // 清理延迟队列已到期成员（降级时忽略）
    try {
      await this.redis.raw.zremrangebyscore(CLOSE_QUEUE_KEY, 0, now.getTime());
    } catch {
      /* 降级忽略 */
    }
    if (closed > 0) this.logger.log(`sweep closed ${closed} expired orders`);
    return closed;
  }

  // ============ T2-03 发起支付 ============

  /**
   * POST /orders/:id/pay：校验订单状态与金额，调用渠道适配器预下单，返回支付参数。
   * - 已关闭订单 → 70001；金额不符 → 70003。
   */
  async pay(userId: string, orderId: string, channel: number, openid?: string) {
    const order = await this.findOwnedOrder(userId, orderId);

    if (order.status === OrderStatus.CLOSED) {
      throw new BizException(BizCode.ORDER_CLOSED, '订单已关闭，无法支付');
    }
    if (order.status === OrderStatus.PAID) {
      throw new BizException(BizCode.PAYMENT_DUP, '订单已支付，请勿重复支付');
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new BizException(BizCode.ORDER_CLOSED, '订单状态不支持支付');
    }
    // 过期未扫描时，实时关单
    if (order.expireAt && order.expireAt.getTime() <= Date.now()) {
      await this.prisma.paymentOrder.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING },
        data: { status: OrderStatus.CLOSED },
      });
      throw new BizException(BizCode.ORDER_CLOSED, '订单已超时关闭');
    }

    const useChannel = channel || PayChannel.WECHAT;
    const adapter = this.getAdapter(useChannel);
    const prepay = await adapter.prepay({
      payNo: order.payNo,
      amount: Number(order.amount),
      subject: order.subject,
      openid,
    });

    // 校验渠道返回金额与订单一致（模拟金额不符场景 → 70003）
    await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: { channel: useChannel },
    });

    this.analytics.fire({
      userId,
      eventType: 'payment_pay_prepay',
      properties: { orderId, channel: useChannel, mock: prepay.mock },
    });

    return {
      orderId: order.id.toString(),
      payNo: order.payNo,
      amount: Number(order.amount),
      channel: useChannel,
      prepayId: prepay.prepayId,
      payParams: prepay.payParams,
      mock: prepay.mock,
    };
  }

  // ============ T2-04 支付回调（签名校验 + 幂等） ============

  /**
   * POST /payments/callback/:channel：渠道异步通知入口。
   * - 签名校验失败 → 70007。
   * - uk_channel_trade_no 唯一约束保证幂等：重复回调命中唯一冲突时直接返回成功（不重复解锁）。
   * - 事务内：写支付流水 + 订单置 PAID + 报告解锁 isUnlocked=1。
   */
  async handleCallback(
    channelStr: string,
    body: { payNo: string; channelTradeNo: string; amount: number; sign: string },
  ): Promise<{ ok: true; duplicated: boolean }> {
    const channel = this.resolveChannel(channelStr);
    const adapter = this.getAdapter(channel);

    // 1) 验签（排除 sign 字段本身参与复算）
    const { sign, ...rest } = body;
    if (!adapter.verifySign(rest, sign)) {
      throw new BizException(BizCode.PAYMENT_SIGN_INVALID, '支付回调签名校验失败');
    }

    // 2) 定位订单
    const order = await this.prisma.paymentOrder.findFirst({
      where: { payNo: body.payNo, isDeleted: 0 },
    });
    if (!order) {
      throw new BizException(BizCode.ORDER_NOT_FOUND, '回调订单不存在');
    }

    // 3) 金额一致性校验 → 70003
    if (Number(order.amount) !== body.amount) {
      throw new BizException(BizCode.PAYMENT_AMOUNT_MISMATCH, '回调金额与订单不符');
    }

    // 4) 幂等写入：先探测流水唯一键，命中即视为重复回调直接成功
    const existed = await this.prisma.paymentTransaction.findUnique({
      where: {
        channel_channelTradeNo: { channel, channelTradeNo: body.channelTradeNo },
      },
    });
    if (existed) {
      return { ok: true, duplicated: true };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // 4.1 落支付流��
        await tx.paymentTransaction.create({
          data: {
            payOrderId: order.id,
            channel,
            channelTradeNo: body.channelTradeNo,
            type: TransactionType.PAY,
            amount: BigInt(body.amount),
            status: TransactionStatus.SUCCESS,
            rawNotify: body as any,
            finishedAt: new Date(),
          },
        });

        // 4.2 订单置 PAID（仅当仍为 PENDING，防止并发覆盖）
        const upd = await tx.paymentOrder.updateMany({
          where: { id: order.id, status: OrderStatus.PENDING },
          data: {
            status: OrderStatus.PAID,
            channel,
            paidAmount: BigInt(body.amount),
            paidAt: new Date(),
          },
        });
        if (upd.count === 0) {
          // 订单已非 PENDING（可能已关闭）：抛出让事务回滚
          throw new BizException(BizCode.ORDER_CLOSED, '订单状态不可支付');
        }

        // 4.3 业务履约：报告解锁
        if (order.bizType === BizType.REPORT_UNLOCK) {
          await tx.report.updateMany({
            where: { id: order.bizId, userId: order.userId },
            data: { isUnlocked: 1, orderId: order.id },
          });
        }
      });
    } catch (err) {
      // 并发下唯一键冲突（P2002）视为重复回调，幂等成功
      if ((err as { code?: string }).code === 'P2002') {
        return { ok: true, duplicated: true };
      }
      throw err;
    }

    // 4.4 业务履约（事务外，各自独立事务/幂等）：咨询订单支付成功 → 确认时段占用（LOCKED→BOOKED）。
    // confirmAfterPaid 自带幂等（订单已 PAID 直接成功），履约异常不影响回调幂等回执。
    if (order.bizType === BizType.COACHING) {
      try {
        await this.coaching.confirmAfterPaid(order.bizId.toString(), order.id.toString());
      } catch (err) {
        this.logger.warn(
          `coaching confirmAfterPaid failed(order=${order.id}): ${(err as Error).message}`,
        );
      }
    }

    this.analytics.fire({
      userId: order.userId.toString(),
      eventType: 'payment_callback_success',
      properties: { orderId: order.id.toString(), channel, amount: body.amount },
    });

    return { ok: true, duplicated: false };
  }

  // ============ T2-07 退款申请 ============

  /**
   * POST /orders/:id/refund：对已支付订单发起退款。
   * - 订单非 PAID/PARTIAL_REFUNDED → 70006。
   * - 退款额 > 可退余额（amount - refundedAmount）→ 70006。
   * - 落 payment_refund（状态 1申请中→渠道成功后 3成功）+ 退款流水；
   *   全额退款订单置 REFUNDED，部分退款置 PARTIAL_REFUNDED。
   */
  async refund(userId: string, orderId: string, refundAmount?: number, reason?: string) {
    const order = await this.findOwnedOrder(userId, orderId);

    if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.PARTIAL_REFUNDED) {
      throw new BizException(BizCode.REFUND_INVALID, '订单未支付或状态不支持退款');
    }

    const total = Number(order.amount);
    const alreadyRefunded = Number(order.refundedAmount);
    const remaining = total - alreadyRefunded;
    const amount = refundAmount ?? remaining;
    if (amount <= 0 || amount > remaining) {
      throw new BizException(BizCode.REFUND_INVALID, '退款金额非法或超过可退余额');
    }

    const refundNo = this.genNo('REF');
    const adapter = this.getAdapter(order.channel ?? PayChannel.WECHAT);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1) 创建退款单（申请中）
      const refund = await tx.paymentRefund.create({
        data: {
          refundNo,
          payOrderId: order.id,
          userId: order.userId,
          amount: BigInt(amount),
          reason: reason ?? null,
          status: RefundStatus.PROCESSING,
        },
      });

      // 2) 调渠道退款（mock）
      const channelRes = await adapter.refund({
        payNo: order.payNo,
        refundNo,
        refundAmount: amount,
        totalAmount: total,
      });

      // 3) 落退款流水
      await tx.paymentTransaction.create({
        data: {
          payOrderId: order.id,
          channel: order.channel ?? PayChannel.WECHAT,
          channelTradeNo: channelRes.channelRefundNo,
          type: TransactionType.REFUND,
          amount: BigInt(amount),
          status: TransactionStatus.SUCCESS,
          finishedAt: new Date(),
        },
      });

      // 4) 更新退款单为成功 + 回填渠道退款号
      await tx.paymentRefund.update({
        where: { id: refund.id },
        data: {
          status: RefundStatus.SUCCESS,
          channelRefundNo: channelRes.channelRefundNo,
          finishedAt: new Date(),
        },
      });

      // 5) 更新订单退款累计与状态
      const newRefunded = alreadyRefunded + amount;
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: {
          refundedAmount: BigInt(newRefunded),
          status:
            newRefunded >= total ? OrderStatus.REFUNDED : OrderStatus.PARTIAL_REFUNDED,
        },
      });

      return { refundNo, amount, status: RefundStatus.SUCCESS };
    });

    this.analytics.fire({
      userId,
      eventType: 'payment_refund_success',
      properties: { orderId, refundNo, amount },
    });

    return result;
  }

  private async findOwnedOrder(userId: string, orderId: string) {
    const order = await this.prisma.paymentOrder.findFirst({
      where: { id: BigInt(orderId), userId: BigInt(userId), isDeleted: 0 },
    });
    if (!order) {
      throw new BizException(BizCode.ORDER_NOT_FOUND, '订单不存在或无权访问');
    }
    return order;
  }

  private toOrderVo(order: {
    id: bigint;
    payNo: string;
    bizType: number;
    bizId: bigint;
    subject: string;
    amount: bigint;
    status: number;
    channel: number | null;
    expireAt: Date | null;
    paidAt: Date | null;
  }) {
    return {
      id: order.id.toString(),
      payNo: order.payNo,
      bizType: order.bizType,
      bizId: order.bizId.toString(),
      subject: order.subject,
      amount: Number(order.amount),
      status: order.status,
      statusLabel: ORDER_STATUS_LABEL[order.status] ?? 'unknown',
      channel: order.channel,
      expireAt: order.expireAt,
      paidAt: order.paidAt,
    };
  }
}