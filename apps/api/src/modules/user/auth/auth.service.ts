import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { SmsCodeService } from './sms-code.service';
import { TokenService, TokenPair } from './token.service';
import { BizCode, BizException } from '../../../common/response';

/** 用户状态枚举（对齐 schema user.status，TINYINT） */
export const UserStatus = {
  NORMAL: 1,
  BANNED: 2,
} as const;

export interface AuthUserView {
  id: string;
  userNo: string;
  nickname: string;
  avatarUrl: string;
  phone: string | null;
  role: number;
  status: number;
  isPaid: number;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserView;
  /** 本次登录是否走了降级手机号路径（T1-03） */
  fallback?: boolean;
  blocked?: boolean;
}

/**
 * AuthService — 认证核心（手机验证码登录、邮箱密码注册/登录、Token 刷新/登出）。
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly smsCode: SmsCodeService,
    private readonly token: TokenService,
  ) {}

  private toView(u: {
    id: bigint;
    userNo: string;
    nickname: string;
    avatarUrl: string;
    phone: string | null;
    role: number;
    status: number;
    isPaid: number;
  }): AuthUserView {
    return {
      id: u.id.toString(),
      userNo: u.userNo,
      nickname: u.nickname,
      avatarUrl: u.avatarUrl,
      phone: u.phone,
      role: u.role,
      status: u.status,
      isPaid: u.isPaid,
    };
  }

  /** 生成 userNo（20 位）：时间戳 + 随机 */
  private genUserNo(): string {
    return `U${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 20).padEnd(20, '0');
  }

  /** 封禁判断：命中抛 20002 */
  private assertNotBanned(status: number): void {
    if (status === UserStatus.BANNED) {
      throw new BizException(BizCode.ACCOUNT_BANNED, '账号已被封禁，请联系客服');
    }
  }

  /** 按手机号查找或创建用户（自动注册） */
  private async findOrCreateByPhone(phone: string): Promise<AuthUserView> {
    let user = await this.prisma.user.findFirst({
      where: { phone, phoneCountry: '+86', isDeleted: 0 },
    });
    if (!user) {
  user = await this.prisma.user.create({
        data: {
          userNo: this.genUserNo(),
          phone,
          phoneCountry: '+86',
          nickname: `用户${phone.slice(-4)}`,
        },
      });
    }
    return this.toView(user);
  }

  /** 更新最近登录时间（尽力而为，失败不阻断） */
  private async touchLogin(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: BigInt(userId) },
        data: { lastLoginAt: new Date() },
      });
    } catch (e) {
      this.logger.warn(`touchLogin failed: ${(e as Error).message}`);
    }
  }

  /**
   * T1-02机号+验证码登录，签发双 Token。
   * 封禁账号返回 20002。
   *
   * 测试后门：非生产环境（NODE_ENV≠production）下，固定测试账号
   * 手机号 13800000000 + 验证码 888888 永久有效，跳过短信校验，
   * 方便前端联调登录后功能。生产环境该后门自动失效。
   */
  static readonly TEST_PHONE = '13800000000';
  static readonly TEST_CODE = '888888';

  async loginByPhone(phone: string, code: string): Promise<LoginResult> {
    const isProd = process.env.NODE_ENV === 'production';
    const isTestAccount =
      !isProd && phone === AuthService.TEST_PHONE && code === AuthService.TEST_CODE;

    if (!isTestAccount) {
      const valid = await this.smsCode.verify(phone, code);
      if (!valid) {
        throw new BizException(BizCode.SMS_CODE_INVALID, '验证码错误或已过期');
      }
    }
    const user = await this.findOrCreateByPhone(phone);
    this.assertNotBanned(user.status);
    const pair = this.token.issuePair(user.id);
    await this.touchLogin(user.id);
    return { accessToken: pair.accessToken, refreshToken: pair.refreshToken, user };
  }

  /**
   * 邮箱注册：校验唯一性 → bcrypt 哈希 → 创建用户 → 签发 token。
   */
  async registerByEmail(email: string, password: string, nickname?: string): Promise<LoginResult> {
    const existing = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), isDeleted: 0 },
    });
    if (existing) {
      throw new BizException(BizCode.EMAIL_ALREADY_REGISTERED, '该邮箱已被注册');
    }
    const passwordHash = this.hashPassword(password);
    const user = await this.prisma.user.create({
      data: {
        userNo: this.genUserNo(),
        email: email.toLowerCase(),
        passwordHash,
        nickname: nickname || email.split('@')[0],
      },
    });
    const userView = this.toView(user);
    const pair = this.token.issuePair(userView.id);
    return { accessToken: pair.accessToken, refreshToken: pair.refreshToken, user: userView };
  }

  /**
   * 邮箱+密码登录：查用户 → 验密码 → 签发 token。
   */
  async loginByEmail(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), isDeleted: 0 },
    });
    if (!user || !user.passwordHash) {
      throw new BizException(BizCode.LOGIN_FAILED, '邮箱或密码错误');
    }
    if (!this.verifyPassword(password, user.passwordHash)) {
      throw new BizException(BizCode.LOGIN_FAILED, '邮箱或密码错误');
    }
    this.assertNotBanned(user.status);
    const pair = this.token.issuePair(user.id.toString());
    await this.touchLogin(user.id.toString());
    return { accessToken: pair.accessToken, refreshToken: pair.refreshToken, user: this.toView(user) };
  }

  /** bcrypt-sha256 风格的密码哈希（PBKDF2 简化版：salt + sha256 iter） */
  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = this.pbkdf2(password, salt);
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const computed = this.pbkdf2(password, salt);
    try {
      return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
    } catch {
      return false;
    }
  }

  private pbkdf2(password: string, salt: string, iterations = 100000, keylen = 64): string {
    let key = createHash('sha256').update(`${salt}:${password}`).digest();
    for (let i = 1; i < iterations; i++) {
      key = createHash('sha256').update(Buffer.concat([key, Buffer.from(salt)])).digest();
    }
    return key.toString('hex');
  }

  /**
   * T1-04 刷新 Token：校验 refresh（含黑名单），签发新对并拉黑旧 refresh。
   */
  async refresh(refreshToken: string): Promise<TokenPair & { user: AuthUserView }> {
    const payload = await this.token.verifyActive(refreshToken);
    if (!payload || payload.typ !== 'refresh') {
      throw new BizException(BizCode.TOKEN_INVALID, '登录状态已失效，请重新登录');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: BigInt(payload.sub), isDeleted: 0 },
    });
    if (!user) {
      throw new BizException(BizCode.TOKEN_INVALID, '用户不存在');
    }
    this.assertNotBanned(user.status);
    // 旋转：旧 refresh 拉黑
    await this.token.blacklist(payload);
    const pair = this.token.issuePair(payload.sub);
    return { ...pair, user: this.toView(user) };
  }

  /**
   * T1-04 登出：将 access/refresh 加入黑名单，旧 token 立即失效。
   */
  async logout(accessToken?: string, refreshToken?: string): Promise<void> {
    if (accessToken) await this.token.blacklistToken(accessToken);
    if (refreshToken) await this.token.blacklistToken(refreshToken);
  }
}