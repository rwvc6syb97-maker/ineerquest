import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { RedisService } from '../../../infra/redis/redis.service';

export interface JwtPayload {
  /** 用户 id（字符串化 BigInt） */
  sub: string;
  /** token 类型 */
  typ: 'access' | 'refresh';
  /** jti：token 唯一标识，用于黑名单 */
  jti: string;
  /**
   * 作用域：默认 'app'（C 端用户）；运营后台签发 'admin'。
   * 后台守卫据此隔离作用域，避免 C 端 token 越权访问后台接口。
   */
  scope?: 'app' | 'admin';
  /** 顶层角色位（对齐 user.role：1普通/2辅导师/3管理员），后台鉴权用 */
  role?: number;
  /** 后台权限点集合（RBAC，如 ['question:*']），由角色映射展开后签入 token */
  perms?: string[];
  /** 签发时间（秒） */
  iat: number;
  /** 过期时间（秒） */
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessJti: string;
  refreshJti: string;
  expiresIn: number;
}

/**
 * TokenService — 双 Token 签发/校验 + Redis 黑名单（T1-02 / T1-04）。
 *
 * 自实现 HS256 JWT（零新增依赖），密钥从 env 读取（占位 CHANGE_ME）。
 * 黑名单：登出后将 jti 写入 Redis（TTL=token 剩余寿命），校验时命中即拒绝。
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly secret = process.env.JWT_SECRET ?? 'CHANGE_ME';
  private readonly accessTtl = Number(process.env.JWT_ACCESS_TTL_SEC ?? 7200); // 2h
  private readonly refreshTtl = Number(process.env.JWT_REFRESH_TTL_SEC ?? 2592000); // 30d
  private readonly adminRefreshTtl = Number(process.env.JWT_ADMIN_REFRESH_TTL_SEC ?? 28800); // 8h

  constructor(private readonly redis: RedisService) {}

  private base64url(input: Buffer | string): string {
    return Buffer.from(input)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  private sign(data: string): string {
    return this.base64url(createHmac('sha256', this.secret).update(data).digest());
  }

  private encode(payload: JwtPayload): string {
    const header = this.base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = this.base64url(JSON.stringify(payload));
    const sig = this.sign(`${header}.${body}`);
    return `${header}.${body}.${sig}`;
  }

  /** 签发一对 token */
  issuePair(userId: string): TokenPair {
    const now = Math.floor(Date.now() / 1000);
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const accessToken = this.encode({
      sub: userId,
      typ: 'access',
      jti: accessJti,
      iat: now,
      exp: now + this.accessTtl,
    });
    const refreshToken = this.encode({
      sub: userId,
      typ: 'refresh',
      jti: refreshJti,
      iat: now,
      exp: now + this.refreshTtl,
    });
    return { accessToken, refreshToken, accessJti, refreshJti, expiresIn: this.accessTtl };
  }

  /**
   * T4-10 后台专用：签发 scope=admin 的双 Token，携带 role 与展开后的权限点集合。
   * 与 C 端 issuePair 隔离作用域，后台守卫仅认 scope=admin 的 token。
   */
  issueAdminPair(userId: string, role: number, perms: string[]): TokenPair {
    const now = Math.floor(Date.now() / 1000);
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const accessToken = this.encode({
      sub: userId,
      typ: 'access',
      jti: accessJti,
      scope: 'admin',
      role,
      perms,
      iat: now,
      exp: now + this.accessTtl,
    });
    const refreshToken = this.encode({
      sub: userId,
      typ: 'refresh',
      jti: refreshJti,
      scope: 'admin',
      role,
      perms,
      iat: now,
      exp: now + this.adminRefreshTtl,
    });
    return { accessToken, refreshToken, accessJti, refreshJti, expiresIn: this.accessTtl };
  }

  /**
   * 校验 token 签名与有效期（不查黑名单）。
   * @returns payload，失败返回 null
   */
  verify(token: string): JwtPayload | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = this.sign(`${header}.${body}`);
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
      return null;
    }
    let payload: JwtPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8')) as JwtPayload;
    } catch {
      return null;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  }

  /** 校验并确认未被拉黑（登出后旧 token 拒绝的关键） */
  async verifyActive(token: string): Promise<JwtPayload | null> {
    const payload = this.verify(token);
    if (!payload) return null;
    const blacklisted = await this.isBlacklisted(payload.jti);
    if (blacklisted) return null;
    // 用户级封禁强制下线：管理员封禁后，该用户所有存量 token 立即失效
    if (payload.scope !== 'admin' && (await this.isUserBanned(payload.sub))) return null;
    return payload;
  }

  private blacklistKey(jti: string): string {
    return `auth:bl:${jti}`;
  }

  private userBanKey(userId: string): string {
    return `auth:ban:${userId}`;
  }

  /**
   * 用户级封禁（T4-14强制下线）。写 Redis 标记，verifyActive 命中即拒绝该用户所有 token。
   * TTL 取 refresh 寿命上限，超期后 token 本身也已失效，标记自动清理。
   * @returns true=已写入标记 false=Redis 不可用（降级，需依赖 user.status 拦截）
   */
  async banUser(userId: string): Promise<boolean> {
    try {
      await this.redis.raw.set(this.userBanKey(userId), '1', 'EX', this.refreshTtl);
      return true;
    } catch (e) {
      this.logger.warn(`banUser redis 降级: ${(e as Error).message}`);
      return false;
    }
  }

  /** 解封：清除用户级封禁标记。 */
  async unbanUser(userId: string): Promise<boolean> {
    try {
      await this.redis.raw.del(this.userBanKey(userId));
      return true;
    } catch (e) {
      this.logger.warn(`unbanUser redis 降级: ${(e as Error).message}`);
      return false;
    }
  }

  async isUserBanned(userId: string): Promise<boolean> {
    try {
      const v = await this.redis.raw.get(this.userBanKey(userId));
      return v !== null;
    } catch {
      return false;
    }
  }

  /** 加入黑名单：TTL 取 token 剩余寿命，过期后自动清理 */
  async blacklist(payload: JwtPayload): Promise<void> {
    const ttl = Math.max(payload.exp - Math.floor(Date.now() / 1000), 1);
    await this.redis.raw.set(this.blacklistKey(payload.jti), '1', 'EX', ttl);
  }

  /** 通过 token 字符串加入黑名单（登出用） */
  async blacklistToken(token: string): Promise<void> {
    const payload = this.verify(token);
    if (payload) await this.blacklist(payload);
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    const v = await this.redis.raw.get(this.blacklistKey(jti));
    return v !== null;
  }
}