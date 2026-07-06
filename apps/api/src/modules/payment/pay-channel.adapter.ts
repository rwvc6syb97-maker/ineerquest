import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';

/**
 * 支付渠道适配器接口与 mock 通道。
 *
 * 关键约束（Loop Engineering）：微信支付商户号属外部资质 blocked 项。
 * 通过开关 WECHAT_PAY_ENABLED（默认 false）走 mock 通道，使编译/单测/契约可自动通过；
 * 真实商户联调待人工补齐，见 阶段2-人工调试待办清单.md。
 */

/** 预支付下单入参。 */
export interface PrepayParams {
  payNo: string;
  amount: number; // 分
  subject: string;
  openid?: string;
}

/** 预支付返回（前端拉起支付所需参数）。 */
export interface PrepayResult {
  channel: number;
  prepayId: string;
  /** 前端可直接用于拉起支付的参数包（mock 下为占位） */
  payParams: Record<string, string>;
  mock: boolean;
}

/** 退款入参。 */
export interface ChannelRefundParams {
  payNo: string;
  refundNo: string;
  refundAmount: number; // 分
  totalAmount: number; // 分
}

/** 退款返回。 */
export interface ChannelRefundResult {
  channelRefundNo: string;
  mock: boolean;
}

export interface PayChannelAdapter {
  readonly channel: number;
  /** 预下单，返回前端拉起支付参数 */
  prepay(params: PrepayParams): Promise<PrepayResult>;
  /** 校验回调签名，返回是否合法 */
  verifySign(rawBody: Record<string, unknown>, signature: string): boolean;
  /** 发起渠道退款 */
  refund(params: ChannelRefundParams): Promise<ChannelRefundResult>;
}

/**
 * 微信支付适配器：开关 WECHAT_PAY_ENABLED 默认关闭走 mock。
 * mock 通道产出可预测的 prepayId / 交易号 / 签名，供 L2 单测与 L3 契约断言。
 */
@Injectable()
export class WechatPayAdapter implements PayChannelAdapter {
  readonly channel = 1;
  private readonly logger = new Logger(WechatPayAdapter.name);
  private readonly enabled = process.env.WECHAT_PAY_ENABLED === 'true';
  /** mock 签名密钥（真实环境使用商户 APIv3 密钥）。 */
  private readonly mockKey = process.env.WECHAT_PAY_MOCK_KEY ?? 'mock-wechat-key';

  async prepay(params: PrepayParams): Promise<PrepayResult> {
    if (this.enabled) {
      // TODO(blocked): 接入微信支付 JSAPI/Native 统一下单，回填商户号/证书。
      this.logger.warn('WECHAT_PAY_ENABLED=true 但真实商户通道未实现，回退 mock');
    }
    const prepayId = `mock_prepay_${params.payNo}`;
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = randomBytes(8).toString('hex');
    const pkg = `prepay_id=${prepayId}`;
    return {
      channel: this.channel,
      prepayId,
      payParams: {
        appId: 'mock_appid',
        timeStamp,
        nonceStr,
        package: pkg,
        signType: 'HMAC-SHA256',
        paySign: this.sign({ prepayId, timeStamp, nonceStr }),
      },
      mock: true,
    };
  }

  /**
   * 回调签名校验。mock 通道用 HMAC-SHA256 复算比对，保证 T2-04 契约可断言。
   * 真实环境改为微信 APIv3 平台证书验签。
   */
  verifySign(rawBody: Record<string, unknown>, signature: string): boolean {
    if (this.enabled) {
      // TODO(blocked): 微信 APIv3 平台证书验签，回填证书序列号与公钥。
      this.logger.warn('WECHAT_PAY_ENABLED=true 但真实验签未实现，回退 mock 验签');
    }
    const expect = this.sign(rawBody);
    return expect === signature;
  }

  async refund(params: ChannelRefundParams): Promise<ChannelRefundResult> {
    if (this.enabled) {
      // TODO(blocked): 接入微信退款 API，回填商户退款接口凭证。
      this.logger.warn('WECHAT_PAY_ENABLED=true 但真实退款未实现，回退 mock');
    }
    return {
      channelRefundNo: `mock_refund_${params.refundNo}`,
      mock: true,
    };
  }

  /** 供 mock 通道与测试构造合法签名：对报文按 key 排序后 HMAC-SHA256。 */
  sign(payload: Record<string, unknown>): string {
    const keys = Object.keys(payload)
      .filter((k) => k !== 'sign' && payload[k] !== undefined && payload[k] !== null)
      .sort();
    const raw = keys.map((k) => `${k}=${String(payload[k])}`).join('&');
    return createHmac('sha256', this.mockKey).update(raw).digest('hex');
  }
}