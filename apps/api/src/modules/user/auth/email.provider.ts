import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

/**
 * EmailProvider — Resend 邮件通道适配器。
 * enabled=false 时走 mock 占位，仅打印日志不真实发送。
 */
@Injectable()
export class EmailProvider {
  private readonly logger = new Logger(EmailProvider.name);
  private readonly enabled = process.env.EMAIL_PROVIDER_ENABLED === 'true';
  private client: Resend;

  constructor() {
    if (this.enabled) {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        this.logger.error('[EMAIL] 缺少 RESEND_API_KEY 环境变量');
      }
      this.client = new Resend(apiKey);
    }
  }

  async send(email: string, code: string): Promise<boolean> {
    if (!this.enabled) {
      this.logger.warn(`[EMAIL MOCK] 通道未开通，占位发送。email=${this.mask(email)} code=${code}`);
      return true;
    }
    const from = process.env.RESEND_FROM;
    if (!from) {
      this.logger.error('[EMAIL] 缺少 RESEND_FROM 环境变量（发信地址）');
      return false;
    }
    const subject = process.env.EMAIL_SUBJECT || '验证码';
    const html = this.buildHtmlBody(code);
    try {
      const { data, error } = await this.client.emails.send({
        from,
        to: email,
        subject,
        html,
      });
      if (error) {
        this.logger.error(`[EMAIL] 发送失败 email=${this.mask(email)} error=${error.name} message=${error.message}`);
        return false;
      }
      this.logger.log(`[EMAIL] 发送成功 email=${this.mask(email)} id=${data?.id}`);
      return true;
    } catch (err) {
      this.logger.error(`[EMAIL] SDK异常 email=${this.mask(email)}`, err?.message || err);
      return false;
    }
  }

  private buildHtmlBody(code: string): string {
    return `
      <div style="max-width:480px;margin:0 auto;font-family:sans-serif;padding:24px;">
        <h2 style="color:#333;">验证码</h2>
        <p style="font-size:32px;font-weight:bold;color:#1890ff;letter-spacing:4px;">${code}</p>
        <p style="color:#666;">此验证码将在 5 分钟内失效，请勿泄露给他人。</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
        <p style="color:#999;font-size:12px;">如非本人操作，请忽略此邮件。</p>
      </div>`;
  }

  private mask(email: string): string {
    const [name, domain] = email.split('@');
    if (!domain) return '***';
    const head = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
    return `${head}***@${domain}`;
  }
}