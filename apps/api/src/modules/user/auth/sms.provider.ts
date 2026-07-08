import { Injectable, Logger } from '@nestjs/common';
import Dysmsapi, { SendSmsRequest } from '@alicloud/dysmsapi20170525';
import * as OpenApi from '@alicloud/openapi-client';
import * as Util from '@alicloud/tea-util';

/**
 * SmsProvider — 阿里云短信通道适配器。
 * 当 SMS_PROVIDER_ENABLED=true 时使用阿里云 dysmsapi 真实发送；
 * 否则走 mock 占位，仅打印日志并返回成功。
 * 限流与验证码 TTL 逻辑在 SmsCodeService 中。
 */
@Injectable()
export class SmsProvider {
  private readonly logger = new Logger(SmsProvider.name);
  private readonly enabled = process.env.SMS_PROVIDER_ENABLED === 'true';
  private client: Dysmsapi;

  constructor() {
    if (this.enabled) {
      const config = new OpenApi.Config({
        accessKeyId: process.env.SMS_ACCESS_KEY_ID,
        accessKeySecret: process.env.SMS_ACCESS_KEY_SECRET,
        endpoint: 'dysmsapi.aliyuncs.com',
      });
      this.client = new Dysmsapi(config);
    }
  }

  async send(phone: string, code: string): Promise<boolean> {
    if (!this.enabled) {
      this.logger.warn(`[SMS MOCK] 通道未开通，占位发送。phone=${this.mask(phone)} code=${code}`);
      return true;
    }

    const signName = process.env.SMS_SIGN_NAME;
    const templateCode = process.env.SMS_TEMPLATE_CODE;

    if (!signName || !templateCode) {
      this.logger.error('[SMS] 缺少 SMS_SIGN_NAME 或 SMS_TEMPLATE_CODE 环境变量');
      return false;
    }

    const request = new SendSmsRequest({
      phoneNumbers: phone,
      signName,
      templateCode,
      templateParam: JSON.stringify({ code }),
    });

    const runtime = new Util.RuntimeOptions({});

    try {
      const resp = await this.client.sendSmsWithOptions(request, runtime);
      const body = resp.body;
      if (body?.code === 'OK') {
        this.logger.log(`[SMS] 发送成功 phone=${this.mask(phone)} requestId=${body.requestId}`);
        return true;
      }
      this.logger.error(
        `[SMS] 发送失败 phone=${this.mask(phone)} code=${body?.code} message=${body?.message}`,
      );
      return false;
    } catch (err) {
      this.logger.error(`[SMS] SDK异常 phone=${this.mask(phone)}`, err?.message || err);
      return false;
    }
  }

  private mask(phone: string): string {
    if (phone.length < 7) return '***';
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }
}