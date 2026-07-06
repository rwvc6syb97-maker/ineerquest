import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TokenService } from '../user/auth/token.service';
import { BizCode, BizException } from '../../common/response';
import {
  resolvePermsByUserRole,
  USER_ROLE_TO_ADMIN_ROLE,
} from './admin-rbac.constants';

export interface AdminLoginResult {
  accessToken: string;
  refreshToken: string;
  admin: {
    id: string;
    nickname: string;
    role: number;
    adminRole: string;
    perms: string[];
  };
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly token: TokenService,
  ) {}

  async login(username: string, password: string): Promise<AdminLoginResult> {
    const admin = await this.prisma.admin.findFirst({
      where: { username, isDeleted: 0, status: 1 },
    });

    if (!admin) {
      throw new BizException(BizCode.ADMIN_LOGIN_FORBIDDEN, '账号不存在或已禁用', 403);
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      throw new BizException(BizCode.ADMIN_LOGIN_FORBIDDEN, '密码错误', 403);
    }

    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueForAdmin(admin.id.toString(), admin.nickname, admin.role);
  }

  private issueForAdmin(adminId: string, nickname: string, role: number): AdminLoginResult {
    const perms = resolvePermsByUserRole(role);
    const adminRole = USER_ROLE_TO_ADMIN_ROLE[role] ?? '';
    const pair = this.token.issueAdminPair(adminId, role, perms);
    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      admin: { id: adminId, nickname, role, adminRole, perms },
    };
  }

  async refresh(refreshToken: string): Promise<AdminLoginResult> {
    const payload = await this.token.verifyActive(refreshToken);
    if (!payload || payload.typ !== 'refresh' || payload.scope !== 'admin') {
      throw new BizException(BizCode.TOKEN_INVALID, '登录状态已失效，请重新登录', 401);
    }

    const admin = await this.prisma.admin.findFirst({
      where: { id: BigInt(payload.sub), isDeleted: 0, status: 1 },
    });

    if (!admin) {
      throw new BizException(BizCode.ADMIN_LOGIN_FORBIDDEN, '账号不存在或已禁用', 403);
    }

    await this.token.blacklist(payload);
    return this.issueForAdmin(admin.id.toString(), admin.nickname, admin.role);
  }

  async logout(accessToken?: string, refreshToken?: string): Promise<void> {
    if (accessToken) await this.token.blacklistToken(accessToken);
    if (refreshToken) await this.token.blacklistToken(refreshToken);
  }
}