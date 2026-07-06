import { Injectable, Logger } from '@nestjs/common';

/**
 * SmsProvider — 外部短信通道适配器。
 *
 * blocked：真实短信通道（阿里云/腾讯云 SMS）资质未开通，
 * 此处以 mock 占位，仅打印日志并返回成功，
 * 限流与验证码 TTL 逻辑在 SmsCodeService 中为真实实现。
 * 待人工补齐通道凭证后，替换 send() 内部为真实 SDK 调用即可。
 */
@Injectable()
export class SmsProvider {
  private readonly logger = new Logger(SmsProvider.name);

  /** 是否已接入真实通道（由 env 控制，默认 false → mock） */
  private readonly enabled = process.env.SMS_PROVIDER_ENABLED === 'true';

  /**
   * 发送验证码短信。
   * @returns 是否发送成功（mock 恒 true）
   */
  async send(phone: string, code: string): Promise<boolean> {
    if (!this.enabled) {
      // blocked：mock 通道
      this.logger.warn(
        `[SMS MOCK][blocked] 通道未开通，占位发送。phone=${this.mask(phone)} code=${code}`,
      );
      return true;
    }
    // TODO(blocked): 接入真实短信 SDK（阿里云 dysmsapi / 腾讯云 sms），
    // 使用模板 ID 与签名下发，失败重试与错误码映射由通道方定义。
    this.logger.log(`[SMS] 真实通道发送 phone=${this.mask(phone)}`);
    return true;
  }

  private mask(phone: string): string {
    if (phone.length < 7) return '***';
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }
}