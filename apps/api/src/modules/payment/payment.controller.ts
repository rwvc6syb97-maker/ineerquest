import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { PaymentService } from './payment.service';
import { CreateOrderDto, PayOrderDto, PaymentCallbackDto, RefundOrderDto } from './payment.dto';
import { PayChannel } from './payment.constants';

/**
 * PaymentController — 支付订单链路（T2-01 / T2-03 / T2-04 / T2-07）。
 *
 * - POST /payments/orders            多态创建订单（需登录）
 * - POST /payments/orders/:id/pay    发起支付（需登录）
 * - POST /payments/callback/:channel 渠道异步回调（免登录，靠签名校验）
 * - POST /payments/orders/:id/refund 退款申请（需登录）
 */
@ApiTags('支付')
@ApiBearerAuth('user-token')
@Controller('payments')
export class PaymentController {
  constructor(private readonly payment: PaymentService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.TOKEN_INVALID, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** T2-01 多态创建订单 POST /api/v1/payments/orders */
  @Post('orders')
  async createOrder(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: CreateOrderDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(
      await this.payment.createOrder(uid, dto.bizType, dto.bizId),
      getTraceId(req),
      '订单已创建',
    );
  }

  /** T2-03 发起支付 POST /api/v1/payments/orders/:id/pay */
  @Post('orders/:id/pay')
  async pay(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') orderId: string,
    @Body() dto: PayOrderDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(
      await this.payment.pay(uid, orderId, dto.channel ?? PayChannel.WECHAT, dto.openid),
      getTraceId(req),
      '预支付已创建',
    );
  }

  /**
   * T2-04 支付回调 POST /api/v1/payments/callback/:channel
   * 免登录入口：合法性完全依赖渠道签名校验（失败返回 70007）。
   */
  @Post('callback/:channel')
  async callback(
    @Param('channel') channel: string,
    @Body() dto: PaymentCallbackDto,
    @Req() req: Request,
  ) {
    return ok(
      await this.payment.handleCallback(channel, {
        payNo: dto.payNo,
        channelTradeNo: dto.channelTradeNo,
        amount: dto.amount,
        sign: dto.sign,
      }),
      getTraceId(req),
      '回调已处理',
    );
  }

  /** T2-07 退款申请 POST /api/v1/payments/orders/:id/refund */
  @Post('orders/:id/refund')
  async refund(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') orderId: string,
    @Body() dto: RefundOrderDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(
      await this.payment.refund(uid, orderId, dto.amount, dto.reason),
      getTraceId(req),
      '退款已受理',
    );
  }
}