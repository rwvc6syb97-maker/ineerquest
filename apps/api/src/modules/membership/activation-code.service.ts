import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { EmailService } from '../../infra/email/email.service';
import { BizCode, CommonCode, BizException } from '../../common/response';

/**
 * ActivationCodeService — 激活码生命周期管理。
 * - 管理员批量生成 → 通过邮件/SMS 触达用户
 * - 用户在前端输入兑换码 → 校验 → 升级会员 → 标记已用
 */
@Injectable()
export class ActivationCodeService {
  private readonly logger = new Logger(ActivationCodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly email: EmailService,
  ) {}

  /** 生成 16 位字母数字激活码（大写 + 数字，避免易混淆字符） */
  private genCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 16 }, () => chars[randomBytes(1)[0] % chars.length]).join('');
  }

  private toBigInt(v: string | number): bigint {
    return typeof v === 'bigint' ? v : BigInt(v);
  }

  // ============ 管理员：批量生成 ============

  async generate(dto: { planCode: string; count: number; expireDays?: number; note?: string }) {
    // 校验套餐存在
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { code: dto.planCode, isDeleted: 0 },
    });
    if (!plan) {
      throw new BizException(CommonCode.BAD_REQUEST, `套餐编码不存在: ${dto.planCode}`);
    }

    const batchNo = `B${Date.now().toString(36).toUpperCase()}`;
    const expireAt = dto.expireDays
      ? new Date(Date.now() + dto.expireDays * 86400_000)
      : null;

    const codes: string[] = [];
    // 批量插入（小批量逐条写，大批量可用 createMany）
    for (let i = 0; i < dto.count; i++) {
      const code = this.genCode();
      await this.prisma.activationCode.create({
        data: {
          code,
          planCode: dto.planCode,
          status: 0,
          expireAt,
          note: dto.note ?? null,
          batchNo,
        },
      });
      codes.push(code);
    }

    this.logger.log(`生成 ${dto.count} 个激活码，批次 ${batchNo}，套餐 ${dto.planCode}`);
    return {
      batchNo,
      planCode: dto.planCode,
      planName: plan.name,
      count: dto.count,
      expireAt: expireAt?.toISOString() ?? null,
      codes, // 返回明文列表供管理员复制/分发
    };
  }

  // ============ 管理员：列表查询 ============

  async list(params: {
    planCode?: string;
    status?: number;
    batchNo?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(params.pageSize, 100) : 20;
    const where: Record<string, unknown> = {};
    if (params.planCode) where.planCode = params.planCode;
    if (params.status !== undefined) where.status = params.status;
    if (params.batchNo) where.batchNo = params.batchNo;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.activationCode.count({ where }),
      this.prisma.activationCode.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      list: rows.map((r) => ({
        id: r.id.toString(),
        code: r.code,
        planCode: r.planCode,
        status: r.status,
        statusLabel: r.status === 0 ? 'unused' : r.status === 1 ? 'used' : 'expired',
        usedBy: r.usedBy?.toString() ?? null,
        usedAt: r.usedAt?.toISOString() ?? null,
        sentTo: r.sentTo,
        sentChannel: r.sentChannel,
        expireAt: r.expireAt?.toISOString() ?? null,
        note: r.note,
        batchNo: r.batchNo,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  // ============ 管理员：发送激活码 ============

  async sendCode(
    id: string,
    dto: { email?: string; phone?: string; channel: number },
  ): Promise<{ sent: boolean; method: string; mock?: boolean }> {
    const record = await this.prisma.activationCode.findFirst({
      where: { id: this.toBigInt(id) },
    });
    if (!record) {
      throw new BizException(CommonCode.NOT_FOUND, '激活码不存在');
    }
    if (record.status !== 0) {
      throw new BizException(CommonCode.BAD_REQUEST, '该激活码已使用或已过期');
    }

    // 获取套餐名称
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { code: record.planCode },
      select: { name: true },
    });
    const planName = plan?.name ?? record.planCode;

    if (dto.channel === 1 && dto.email) {
      // 通过 Resend 发送邮件
      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px">
          <h1 style="color:#1e293b;font-size:20px;margin:0 0 8px">🧭 InnerQuest 向内求索</h1>
          <p style="color:#475569;font-size:14px;line-height:1.6">你获得了 <strong style="color:#0f172a">${planName}</strong> 的激活码：</p>
          <div style="background:#fff;border:2px dashed #e2e8f0;border-radius:8px;padding:16px;text-align:center;margin:16px 0">
            <span style="font-family:monospace;font-size:24px;font-weight:700;letter-spacing:4px;color:#0f172a">${record.code}</span>
          </div>
          <p style="color:#64748b;font-size:12px;line-height:1.5">登录 InnerQuest 后在「定价」页面输入激活码即可兑换。如有问题请回复此邮件。</p>
        </div>`;
      const sent = await this.email.send(dto.email, `你的 InnerQuest ${planName} 激活码`, html);
      if (sent) {
        await this.prisma.activationCode.update({
          where: { id: record.id },
          data: { sentTo: dto.email, sentChannel: 1 },
        });
        return { sent: true, method: 'email' };
      }
      throw new BizException(CommonCode.INTERNAL_ERROR, '邮件发送失败，请稍后重试');
    }

    if (dto.channel === 2 && dto.phone) {
      // 短信发送（mock：当前短信通道未实装，仅记录日志；真实接入后调用 SmsProvider）
      const text = `【InnerQuest】您的${planName}激活码：${record.code}，请登录兑换。`;
      this.logger.log(`[SMS MOCK] 向 ${dto.phone} 发送: ${text}`);
      const smsEnabled = process.env.SMS_PROVIDER_ENABLED === 'true';
      if (!smsEnabled) {
        this.logger.warn(`[SMS MOCK] 短信通道未启用（SMS_PROVIDER_ENABLED≠true），激活码 ${record.code} 仅记录未真实发送`);
      }
      await this.prisma.activationCode.update({
        where: { id: record.id },
        data: { sentTo: dto.phone, sentChannel: 2 },
      });
      return { sent: !smsEnabled ? false : true, method: 'sms', mock: !smsEnabled };
    }

    throw new BizException(CommonCode.BAD_REQUEST, '请提供有效的邮箱或手机号');
  }

  // ============ 用户：兑换激活码 ============

  async redeem(userId: string, code: string): Promise<{
    planName: string;
    durationDays: number | null;
    expireAt: string | null;
  }> {
    const uid = this.toBigInt(userId);

    // 防并发兑换：Redis 分布式锁
    const lockKey = `activation:redeem:${code}`;
    const locked = await this.redis.raw.set(lockKey, '1', 'EX', 10, 'NX');
    if (locked === null) {
      throw new BizException(CommonCode.BAD_REQUEST, '兑换处理中，请勿重复提交');
    }

    try {
      const record = await this.prisma.activationCode.findFirst({
        where: { code: code.toUpperCase() },
      });
      if (!record) {
        throw new BizException(CommonCode.NOT_FOUND, '激活码无效');
      }
      if (record.status !== 0) {
        throw new BizException(CommonCode.BAD_REQUEST, '激活码已被使用或已过期');
      }
      if (record.expireAt && new Date() > record.expireAt) {
        // 标记过期
        await this.prisma.activationCode.update({
          where: { id: record.id },
          data: { status: 2 },
        });
        throw new BizException(CommonCode.BAD_REQUEST, '激活码已过期');
      }

      // 查套餐
      const plan = await this.prisma.membershipPlan.findFirst({
        where: { code: record.planCode, isDeleted: 0 },
      });
      if (!plan || plan.status !== 1) {
        throw new BizException(CommonCode.BAD_REQUEST, '对应套餐已下架');
      }

      // 计算会员到期时间
      let paidExpireAt: Date | null = null;
      if (plan.durationDays) {
        // 如果已有会员且在有效期内，叠加；否则从今天起算
        const user = await this.prisma.user.findFirst({
          where: { id: uid },
          select: { paidExpireAt: true },
        });
        const base = user?.paidExpireAt && new Date(user.paidExpireAt) > new Date()
          ? new Date(user.paidExpireAt)
          : new Date();
        paidExpireAt = new Date(base.getTime() + plan.durationDays * 86400_000);
      }

      // 原子操作：升级用户 + 标记激活码已用
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: uid },
          data: { isPaid: 1, paidExpireAt },
        });
        await tx.activationCode.update({
          where: { id: record.id },
          data: { status: 1, usedBy: uid, usedAt: new Date() },
        });
      });

      this.logger.log(`用户 ${userId} 兑换激活码 ${code}，套餐 ${plan.name}`);

      return {
        planName: plan.name,
        durationDays: plan.durationDays,
        expireAt: paidExpireAt?.toISOString() ?? null,
      };
    } finally {
      await this.redis.raw.del(lockKey).catch(() => {});
    }
  }

  /** 查当前用户会员到期时间 */
  async getUserMembership(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: this.toBigInt(userId) },
      select: { isPaid: true, paidExpireAt: true },
    });
    if (!user) throw new BizException(CommonCode.NOT_FOUND, '用户不存在');
    const expired = user.paidExpireAt ? new Date() > user.paidExpireAt : false;
    return {
      isPaid: expired ? 0 : user.isPaid,
      paidExpireAt: user.paidExpireAt?.toISOString() ?? null,
      expired,
    };
  }
}
