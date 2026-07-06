import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BIZ_TYPE_VALUES } from './payment.constants';

/** T2-01 多态创建订单请求：bizType + bizId 承载报告解锁/咨询/会员三态。 */
export class CreateOrderDto {
  /** 业务类型：1报告解锁 2咨询 3会员 */
  @Type(() => Number)
  @IsInt()
  @IsIn(BIZ_TYPE_VALUES)
  bizType!: number;

  /** 关联业务主键（会员类型指向 membership_plan.id） */
  @IsString()
  bizId!: string;
}

/** T2-03 发起支付请求：指定渠道。 */
export class PayOrderDto {
  /** 渠道：1微信 2支付宝 3余额，默认微信 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  channel?: number;

  /** 微信 JSAPI openid（可选） */
  @IsOptional()
  @IsString()
  openid?: string;
}

/** T2-04 支付回调请求体（渠道原始报文，含交易号/金额/签名）。 */
export class PaymentCallbackDto {
  /** 商户订单号（payNo） */
  @IsString()
  payNo!: string;

  /** 第三方交易号 */
  @IsString()
  channelTradeNo!: string;

  /** 实付金额（分） */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount!: number;

  /** 回调签名 */
  @IsString()
  sign!: string;
}

/** T2-07 退款申请请求。 */
export class RefundOrderDto {
  /** 退款金额（分），不传则全额退款 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount?: number;

  /** 退款原因 */
  @IsOptional()
  @IsString()
  reason?: string;
}