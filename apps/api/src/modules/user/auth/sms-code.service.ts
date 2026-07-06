import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../infra/redis/redis.service';
import { SmsProvider } from './sms.provider';
import { BizCode, BizException } from '../../../common/response';

/**
 * SmsCodeService — 短信验证码发送与校验（T1-01）。
 *
 * 真实实现：
 *  - 限流：同一手机号 1 次/60s（Redis SET NX EX 60）
 *  - 验证码入 Redis 且有 TTL（默认 300s）
 *  - 校验后即删除（一次性）
 * blocked：通道下发走 SmsProvider mock。
 */
@Injectable()
export class SmsCodeService {
  private readonly logger = new Logger(SmsCodeService.name);

  /** 发送限流窗口（秒）：1 次/60s */
  static readonly SEND_INTERVAL_SEC = 60;
  /** 验证码有效期（秒） */
  static readonly CODE_TTL_SEC = 300;

  constructor(
    private readonly redis: RedisService,
    private readonly sms: SmsProvider,
  ) {}

  private lockKey(phone: string): string {
    return `sms:lock:${phone}`;
  }

  private codeKey(phone: string): string {
    return `sms:code:${phone}`;
  }

  /** 生成 6 位数字验证码 */
  private genCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * 发送验证码：先校验 60s 限流，再写入验证码（带 TTL）并触发通道下发。
   * @throws BizException(SMS_RATE_LIMITED) 命中限流
   */
  async send(phone: string): Promise<{ ttl: number; blocked: boolean; devCode?: string }> {
    const client = this.redis.raw;
    // 限流：SET NX EX —— 60s 内已发送则拒绝
    const locked = await client.set(
      this.lockKey(phone),
      '1',
      'EX',
      SmsCodeService.SEND_INTERVAL_SEC,
      'NX',
    );
    if (locked === null) {
      throw new BizException(BizCode.SMS_RATE_LIMITED, '验证码发送过于频繁，请稍后再试');
    }

    const code = this.genCode();
    // 验证码入 Redis 且带 TTL（可断言 TTL 存在）
    await client.set(this.codeKey(phone), code, 'EX', SmsCodeService.CODE_TTL_SEC);

    const ok = await this.sms.send(phone, code);
    if (!ok) {
      // 通道失败时释放限流锁，避免用户被误锁
      await client.del(this.lockKey(phone));
      throw new BizException(BizCode.SMS_CODE_INVALID, '验证码发送失败，请重试');
    }

    // blocked=true 表示通道为 mock 占位
    const blocked = process.env.SMS_PROVIDER_ENABLED !== 'true';
    // 开发调试：非生产环境直接把验证码返回给前端，方便本地登录联调。
    // 生产环境（NODE_ENV=production）绝不返回 devCode，验证码只经真实短信通道下发。
    const isProd = process.env.NODE_ENV === 'production';
    return {
      ttl: SmsCodeService.CODE_TTL_SEC,
      blocked,
      ...(isProd ? {} : { devCode: code }),
    };
  }

  /**
   * 校验验证码：命中即删除（一次性）。
   * @returns 是否有效
   */
  async verify(phone: string, code: string): Promise<boolean> {
    const client = this.redis.raw;
    const stored = await client.get(this.codeKey(phone));
    if (!stored || stored !== code) {
      return false;
    }
    await client.del(this.codeKey(phone));
    return true;
  }

  /** 供测试/校验读取当前验证码 TTL */
  async getCodeTtl(phone: string): Promise<number> {
    return this.redis.raw.ttl(this.codeKey(phone));
  }
}