import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../infra/redis/redis.service';
import { EmailProvider } from './email.provider';
import { BizCode, BizException } from '../../../common/response';

/**
 * EmailCodeService — 邮箱验证码发送与校验。
 *
 * 真实实现：
 *  - 限流：同一邮箱 1 次/60s（Redis SET NX EX 60）
 *  - 验证码入 Redis 且有 TTL（默认 300s）
 *  - 校验后即删除（一次性）
 * blocked：通道下发走 EmailProvider mock。
 */
@Injectable()
export class EmailCodeService {
  private readonly logger = new Logger(EmailCodeService.name);

  /** 发送限流窗口（秒）：1 次/60s */
  static readonly SEND_INTERVAL_SEC = 60;
  /** 验证码有效期（秒） */
  static readonly CODE_TTL_SEC = 300;

  constructor(
    private readonly redis: RedisService,
    private readonly email: EmailProvider,
  ) {}

  private norm(email: string): string {
    return email.trim().toLowerCase();
  }

  private lockKey(email: string): string {
    return `email:lock:${this.norm(email)}`;
  }

  private codeKey(email: string): string {
    return `email:code:${this.norm(email)}`;
  }

  /** 生成 6 位数字验证码 */
  private genCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * 发送验证码：先校验 60s 流，再写入验证码（带 TTL）并触发通道下发。
   * @throws BizException(EMAIL_RATE_LIMITED) 命中限流
   */
  async send(email: string): Promise<{ ttl: number; blocked: boolean; devCode?: string }> {
    const client = this.redis.raw;
    // 限流：SET NX EX —— 60s 内已发送则拒绝
    const locked = await client.set(
      this.lockKey(email),
      '1',
      'EX',
      EmailCodeService.SEND_INTERVAL_SEC,
      'NX',
    );
    if (locked === null) {
      throw new BizException(BizCode.EMAIL_RATE_LIMITED, '验证码发送过于频繁，请稍后再试');
    }

    const code = this.genCode();
    await client.set(this.codeKey(email), code, 'EX', EmailCodeService.CODE_TTL_SEC);

    const sent = await this.email.send(this.norm(email), code);
    if (!sent) {
      // 通道失败时释放限流锁，避免用户被误锁
      await client.del(this.lockKey(email));
      throw new BizException(BizCode.EMAIL_CODE_INVALID, '验证码发送失败，请重试');
    }

    // blocked=true 表示通道为 mock 占位
    const blocked = process.env.EMAIL_PROVIDER_ENABLED !== 'true';
    // 开发调试：非生产环境直接把验证码返回给前端，方便本地登录联调。
    // 生产环境（NODE_ENV=production）绝不返回 devCode。
    const isProd = process.env.NODE_ENV === 'production';
    return {
      ttl: EmailCodeService.CODE_TTL_SEC,
      blocked,
      ...(isProd ? {} : { devCode: code }),
    };
  }

  /**
   * 校验验证码：命中即删除（一次性）。
   * @returns 是否有效
   */
  async verify(email: string, code: string): Promise<boolean> {
    const client = this.redis.raw;
    const stored = await client.get(this.codeKey(email));
    if (!stored || stored !== code) {
      return false;
    }
    await client.del(this.codeKey(email));
    return true;
  }
}