import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CoachingOrderStatus, CoachStatus } from '../coaching/coaching.constants';

/**
 * T4-15 辅导师管理服务 `/admin/coaches/*`。
 * 权限：coach:audit（审核）、coach:shelf（上下架）、review:manage（评价管理）。
 *
 * 核心业务约束：
 *  - 审核通过（auditStatus=1）后辅导师方可被 C 端检索（复用 coaching.service 检索条件）。
 *  - 下线（status=0）时若存在进行中订单（PENDING/PAID 未完成）默认拦截，
 *    需 force=true 强制下线，避免影响已成交咨询。
 */
@Injectable()
export class AdminCoachService {
  /** 进行中（未结束）订单状态：待支付 + 已支付未完成 */
  private static readonly ACTIVE_ORDER_STATUS = [
    CoachingOrderStatus.PENDING,
    CoachingOrderStatus.PAID,
  ];

  constructor(private readonly prisma: PrismaService) {}

  private toId(id: string | number): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException('无效的辅导师 ID');
    }
  }

  private serialize(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === 'bigint' ? v.toString() : v;
    }
    return out;
  }

  /** 辅导师列表：可按 auditStatus / status 过滤（审核队列 & 上下架管理）。 */
  async list(params: {
    auditStatus?: number;
    status?: number;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const where: Record<string, unknown> = { isDeleted: 0 };
    if (Number.isInteger(params.auditStatus)) where.auditStatus = params.auditStatus;
    if (params.status === 0 || params.status === 1) where.status = params.status;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.coach.count({ where }),
      this.prisma.coach.findMany({
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
      list: rows.map((r) => this.serialize(r as unknown as Record<string, unknown>)),
    };
  }

  async detail(id: string | number) {
    const row = await this.prisma.coach.findFirst({
      where: { id: this.toId(id), isDeleted: 0 },
      include: { qualifications: true },
    });
    if (!row) throw new NotFoundException('辅导师不存在');
    return {
      ...this.serialize(row as unknown as Record<string, unknown>),
      qualifications: (row.qualifications ?? []).map((q) =>
        this.serialize(q as unknown as Record<string, unknown>),
      ),
    };
  }

  /**
   * 审核：auditStatus 1=通过 / 2=驳回。
   * 通过时不自动上架（保持 status 现状，由运营手动上架），仅放开检索资格。
   */
  async audit(id: string | number, auditStatus: number, remark?: string) {
    const cid = this.toId(id);
    const coach = await this.prisma.coach.findFirst({ where: { id: cid, isDeleted: 0 } });
    if (!coach) throw new NotFoundException('辅导师不存在');

    await this.prisma.coach.update({
      where: { id: cid },
      data: { auditStatus },
    });
    return { id: cid.toString(), auditStatus, remark: remark ?? null };
  }

  /** 统计辅导师进行中订单数量（下线校验用）。 */
  async countActiveOrders(coachId: bigint): Promise<number> {
    return this.prisma.coachingOrder.count({
      where: {
        coachId,
        isDeleted: 0,
        status: { in: AdminCoachService.ACTIVE_ORDER_STATUS },
      },
    });
  }

  /**
   * 上下架：status 1=上架 / 0=下架。
   * 上架要求已审核通过（auditStatus=1）。
   * 下架若存在进行中订单则拦截（除非 force=true）。
   */
  async shelf(id: string | number, status: number, opts: { force?: boolean; reason: string }) {
    const cid = this.toId(id);
    const coach = await this.prisma.coach.findFirst({ where: { id: cid, isDeleted: 0 } });
    if (!coach) throw new NotFoundException('辅导师不存在');

    if (status === CoachStatus.ONLINE && coach.auditStatus !== 1) {
      throw new BadRequestException('辅导师未审核通过，无法上架');
    }

    if (status === CoachStatus.OFFLINE) {
      const active = await this.countActiveOrders(cid);
      if (active > 0 && !opts.force) {
        throw new ConflictException(
          `该辅导师存在 ${active} 个进行中订单，下线将影响已成交咨询；如确需下线请传 force=true`,
        );
      }
    }

    await this.prisma.coach.update({ where: { id: cid }, data: { status } });
    return { id: cid.toString(), status, reason: opts.reason, forced: !!opts.force };
  }

  /** 供审计前值快照（审核/上下架）。 */
  async snapshot(id: string | number) {
    const cid = this.toId(id);
    const row = await this.prisma.coach.findFirst({
      where: { id: cid, isDeleted: 0 },
      select: { id: true, auditStatus: true, status: true },
    });
    if (!row) return null;
    return { id: row.id.toString(), auditStatus: row.auditStatus, status: row.status };
  }

  // ---------- 评价管理 review:manage ----------

  async listReviews(params: { coachId?: string | number; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const where: Record<string, unknown> = { isDeleted: 0 };
    if (params.coachId !== undefined && params.coachId !== '') {
      where.coachId = this.toId(params.coachId);
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.coachingReview.count({ where }),
      this.prisma.coachingReview.findMany({
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
      list: rows.map((r) => this.serialize(r as unknown as Record<string, unknown>)),
    };
  }

  /** 官方回复评价。 */
  async replyReview(id: string | number, reply: string) {
    const rid = this.toId(id);
    const review = await this.prisma.coachingReview.findFirst({
      where: { id: rid, isDeleted: 0 },
    });
    if (!review) throw new NotFoundException('评价不存在');
    await this.prisma.coachingReview.update({ where: { id: rid }, data: { reply } });
    return { id: rid.toString(), replied: true };
  }

  /** 软删除违规评价（isDeleted=1），需理由。 */
  async deleteReview(id: string | number, reason?: string) {
    const rid = this.toId(id);
    const review = await this.prisma.coachingReview.findFirst({
      where: { id: rid, isDeleted: 0 },
    });
    if (!review) throw new NotFoundException('评价不存在');
    await this.prisma.coachingReview.update({ where: { id: rid }, data: { isDeleted: 1 } });
    return { id: rid.toString(), deleted: true, reason: reason ?? null };
  }

  async reviewSnapshot(id: string | number) {
    const rid = this.toId(id);
    const row = await this.prisma.coachingReview.findFirst({
      where: { id: rid, isDeleted: 0 },
      select: { id: true, reply: true, isDeleted: true },
    });
    if (!row) return null;
    return { id: row.id.toString(), reply: row.reply, isDeleted: row.isDeleted };
  }
}