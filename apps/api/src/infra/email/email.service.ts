import { Injectable, Logger } from '@nestjs/common';

/**
 * EmailService — Resend 邮件发送服务。
 * 通过 HTTP API 发送邮件，无需 SMTP 配置。
 * 环境变量：RESEND_API_KEY、RESEND_FROM（发件人地址）。
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey = process.env.RESEND_API_KEY ?? '';
  private readonly from = process.env.RESEND_FROM ?? 'InnerQuest <noreply@innerquest.app>';

  /** 发送邮件。无 API Key 时仅打印日志并返回 false。 */
  async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.apiKey || this.apiKey.startsWith('re_placeholder')) {
      this.logger.warn(`[EMAIL MOCK] apiKey not set — to=${to} subject="${subject}"`);
      return false;
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: this.from, to: [to], subject, html }),
      });

      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        this.logger.log(`Email sent to=${to} id=${(body as any).id ?? 'ok'}`);
        return true;
      }

      const errText = await res.text().catch(() => 'unknown');
      this.logger.error(`Email failed status=${res.status}: ${errText.slice(0, 200)}`);
      return false;
    } catch (err) {
      this.logger.error(`Email network error: ${(err as Error).message}`);
      return false;
    }
  }

  /** 发送纯文本邮件（自动转 HTML） */
  async sendText(to: string, subject: string, text: string): Promise<boolean> {
    const html = text
      .split('\n')
      .map((line) => `<p style="margin:0 0 8px;color:#333;font-size:14px">${line || '&nbsp;'}</p>`)
      .join('');
    return this.send(to, subject, html);
  }
}
