import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TokenService } from '../user/auth/token.service';
import { maskPhone, maskEmail } from './admin-mask.util';

/**
 * T4-14 用户管理服务 `/admin/users/*`。
 * 权限：user:read（列表/详情，默认脱敏）、user:pii（明文 PII）、user:ban（封禁/解封）。
 *
 * 封禁强制下线：user.status=0 + TokenService.banUser 写 Redis 用户级封禁标记，
 * verifyActive 命中即拒绝该用户所有存量 token。Redis 不可用时降级为仅改 status，
 * 由后续 token 校验依赖 status 拦截（标 blocked，见待办清单）。
 */
@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly token: TokenService,
  ) {}

  private toId(id: string | number): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException('无效的用户 ID');
    }
  }

  /** 组装对外用户视图。pii=true 且持 user:pii 权限时下发明文，否则脱敏。 */
  private view(u: Record<string, unknown>, pii: boolean) {
    const phone = (u.phone as string | null) ?? null;
    const email = (u.email as string | null) ?? null;
    return {
      id: (u.id as bigint)?.toString?.() ?? String(u.id),
      userNo: u.userNo,
      nickname: u.nickname,
      avatarUrl: u.avatarUrl,
      phone: pii ? phone : maskPhone(phone),
      // email 受 user:pii 权限控制：无权限脱敏为 a***@b.com 形式（任务4.1）
      email: pii ? email : maskEmail(email),
      phoneCountry: u.phoneCountry,
      gender: u.gender,
      role: u.role,
      status: u.status,
      isPaid: u.isPaid,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    };
  }

  /** 分页列表（默认脱敏）。 */
  async list(params: {
    status?: number;
    role?: number;
    keyword?: string;
    page?: number;
    pageSize?: number;
    pii?: boolean;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const where: Record<string, unknown> = { isDeleted: 0 };
    if (params.status === 0 || params.status === 1) where.status = params.status;
    if (Number.isInteger(params.role)) where.role = params.role;
    if (params.keyword) {
      where.OR = [
        { nickname: { contains: params.keyword } },
        { userNo: { contains: params.keyword } },
        { phone: { contains: params.keyword } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
     this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      list: rows.map((r) => this.view(r as unknown as Record<string, unknown>, !!params.pii)),
    };
  }

  /** 用户详情。pii 由 controller 依据 user:pii 权限传入。 */
  async detail(id: string | number, pii: boolean) {
    const uid = this.toId(id);
    const row = await this.prisma.user.findFirst({
      where: { id: uid, isDeleted: 0 },
    });
    if (!row) throw new NotFoundException('用户不存在');
    const base = this.view(row as unknown as Record<string, unknown>, pii);
    const { latestReport, dimensions } = await this.latestReportView(uid);
    return { ...base, latestReport, dimensions };
  }

  /**
   * 关联该用户「最新一条报告」(report 按 createdAt desc, isDeleted=0)（任务4.2）。
   * - latestReport: { mbtiType, reportNo, reportType, createdAt }（无报告时 null）
   * - dimensions:   对应 assessment_result 四维度 [{ dimension, score }]
   *                 dimension ∈ EI/SN/TF/JP，score 取 scoreEi/scoreSn/scoreTf/scoreJp（Decimal→number）
   * report.result 已强关联 AssessmentResult，故随报告取维度，保证与该报告口径一致。
   */
  private async latestReportView(uid: bigint): Promise<{
    latestReport: {
      mbtiType: string;
      reportNo: string;
      reportType: number;
      createdAt: Date;
    } | null;
    dimensions: Array<{ dimension: string; score: number }>;
  }> {
    const report = await this.prisma.report.findFirst({
      where: { userId: uid, isDeleted: 0 },
      orderBy: { createdAt: 'desc' },
      include: { result: true },
    });
    if (!report) return { latestReport: null, dimensions: [] };

    const r = report.result;
    const dimensions = r
      ? [
          { dimension: 'EI', score: Number(r.scoreEi) },
          { dimension: 'SN', score: Number(r.scoreSn) },
          { dimension: 'TF', score: Number(r.scoreTf) },
          { dimension: 'JP', score: Number(r.scoreJp) },
        ]
      : [];

    return {
      latestReport: {
        mbtiType: report.mbtiType,
        reportNo: report.reportNo,
        reportType: report.reportType,
        createdAt: report.createdAt,
      },
      dimensions,
    };
  }

  /**
   * 封禁用户：status=1→0，并强制下线（Redis 用户级封禁标记）。
   * @returns 含 forceLogout 标记（Redis 是否成功；false 表示降级需依赖 status 拦截）
   */
  async ban(id: string | number, reason: string) {
    const uid = this.toId(id);
    const user = await this.prisma.user.findFirst({ where: { id: uid, isDeleted: 0 } });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.status === 0) {
      return { id: uid.toString(), status: 0, alreadyBanned: true, reason };
    }

    await this.prisma.user.update({ where: { id: uid }, data: { status: 0 } });
    const forceLogout = await this.token.banUser(uid.toString());
    if (!forceLogout) {
      this.logger.warn(`用户 ${uid} 封禁：Redis 强制下线降级，仅改 status`);
    }
    return { id: uid.toString(), status: 0, forceLogout, reason };
  }

  /** 解封用户：status=0→1，清除强制下线标记。 */
  async unban(id: string | number, reason: string) {
    const uid = this.toId(id);
    const user = await this.prisma.user.findFirst({ where: { id: uid, isDeleted: 0 } });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.status === 1) {
      return { id: uid.toString(), status: 1, alreadyActive: true, reason };
    }

    await this.prisma.user.update({ where: { id: uid }, data: { status: 1 } });
    await this.token.unbanUser(uid.toString());
    return { id: uid.toString(), status: 1, reason };
  }

  /** 供审计前值快照使用（返回未脱敏的关键状态字段）。 */
  async snapshot(id: string | number) {
    const uid = this.toId(id);
    const row = await this.prisma.user.findFirst({
      where: { id: uid, isDeleted: 0 },
      select: { id: true, status: true, role: true },
    });
    if (!row) return null;
    return { id: row.id.toString(), status: row.status, role: row.role };
  }
}