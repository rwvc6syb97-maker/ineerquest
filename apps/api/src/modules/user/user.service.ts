import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, BizException } from '../../common/response';
import { UpdateProfileDto } from './auth/auth.dto';

/** 注销冷静期天数（对齐产品：注销进入冷静期） */
const DEACTIVATION_COOLDOWN_DAYS = 15;

/** 注销申请状态（对齐 schema user_deactivation.status） */
export const DeactivationStatus = {
  PENDING: 1,
  CANCELLED: 2,
  PURGED: 3,
} as const;

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  private async getUserOrThrow(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: BigInt(userId), isDeleted: 0 },
    });
    if (!user) {
      throw new BizException(BizCode.TOKEN_INVALID, '用户不存在或已注销');
    }
    return user;
  }

  /** T1-05 读取当前用户资料 GET /users/me */
  async getProfile(userId: string) {
    const u = await this.getUserOrThrow(userId);
    return {
      // 对齐契约 v2.0：userId / avatar / email / createdAt
      userId: u.id.toString(),
      userNo: u.userNo,
      nickname: u.nickname,
      avatar: u.avatarUrl,
      phone: u.phone,
      email: u.email ?? null,
      gender: u.gender,
      role: u.role,
      status: u.status,
      isPaid: u.isPaid,
      paidExpireAt: u.paidExpireAt ? u.paidExpireAt.toISOString() : null,
      membershipLevel: u.membershipLevel,
      membershipExpireAt: u.membershipExpireAt ? u.membershipExpireAt.toISOString() : null,
      deactivatedAt: u.deactivatedAt,
      createdAt: u.createdAt ? u.createdAt.toISOString() : null,
    };
  }

  /** T1-05 更新当前用户资料 PATCH /users/me */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.getUserOrThrow(userId);
    const updated = await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: {
        ...(dto.nickname !== undefined ? { nickname: dto.nickname } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
      },
    });
    return {
      id: updated.id.toString(),
      nickname: updated.nickname,
      avatarUrl: updated.avatarUrl,
      gender: updated.gender,
    };
  }

  /** T1-05 读取隐私设置 GET /users/me/privacy（无则返回默认） */
  async getPrivacy(userId: string) {
    await this.getUserOrThrow(userId);
    let setting = await this.prisma.userPrivacySetting.findFirst({
      where: { userId: BigInt(userId) },
    });
    if (!setting) {
      setting = await this.prisma.userPrivacySetting.create({
        data: { userId: BigInt(userId) },
      });
    }
    return {
      profilePublic: setting.profilePublic,
      reportShareable: setting.reportShareable,
      allowRecommend: setting.allowRecommend,
      allowDataAnalysis: setting.allowDataAnalysis,
      pushNotification: setting.pushNotification,
    };
  }

  /** T1-05 更新隐私设置 PATCH /users/me/privacy（upsert） */
  async updatePrivacy(userId: string, data: Partial<Record<string, number>>) {
    await this.getUserOrThrow(userId);
    const patch = {
      ...(data.profilePublic !== undefined ? { profilePublic: data.profilePublic } : {}),
      ...(data.reportShareable !== undefined ? { reportShareable: data.reportShareable } : {}),
      ...(data.allowRecommend !== undefined ? { allowRecommend: data.allowRecommend } : {}),
      ...(data.allowDataAnalysis !== undefined
        ? { allowDataAnalysis: data.allowDataAnalysis }
        : {}),
      ...(data.pushNotification !== undefined ? { pushNotification: data.pushNotification } : {}),
    };
    const setting = await this.prisma.userPrivacySetting.upsert({
      where: { userId: BigInt(userId) },
      create: { userId: BigInt(userId), ...patch },
      update: patch,
    });
    return {
      profilePublic: setting.profilePublic,
      reportShareable: setting.reportShareable,
      allowRecommend: setting.allowRecommend,
      allowDataAnalysis: setting.allowDataAnalysis,
      pushNotification: setting.pushNotification,
    };
  }

  /** T1-05 申请注销：进入冷静期 POST /users/me/deactivation */
  async applyDeactivation(userId: string, reason?: string) {
    await this.getUserOrThrow(userId);
    // 已有进行中的申请则直接返回
    const existing = await this.prisma.userDeactivation.findFirst({
      where: { userId: BigInt(userId), status: DeactivationStatus.PENDING },
    });
    if (existing) {
      return {
        id: existing.id.toString(),
        status: existing.status,
        applyAt: existing.applyAt,
        purgeAt: existing.purgeAt,
        cooldownDays: DEACTIVATION_COOLDOWN_DAYS,
      };
    }
    const applyAt = new Date();
    const purgeAt = new Date(applyAt.getTime() + DEACTIVATION_COOLDOWN_DAYS * 86400_000);
    const record = await this.prisma.userDeactivation.create({
      data: {
        userId: BigInt(userId),
        reason,
        status: DeactivationStatus.PENDING,
        applyAt,
        purgeAt,
      },
    });
    // 标记用户进入注销冷静期
    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { deactivatedAt: applyAt },
    });
    return {
      id: record.id.toString(),
      status: record.status,
      applyAt,
      purgeAt,
      cooldownDays: DEACTIVATION_COOLDOWN_DAYS,
    };
  }

  /** T1-05 撤销注销申请 DELETE /users/me/deactivation */
  async cancelDeactivation(userId: string) {
    await this.getUserOrThrow(userId);
    const existing = await this.prisma.userDeactivation.findFirst({
      where: { userId: BigInt(userId), status: DeactivationStatus.PENDING },
    });
    if (!existing) {
      throw new BizException(BizCode.ACCOUNT_DEACTIVATING, '无进行中的注销申请');
    }
    await this.prisma.userDeactivation.update({
      where: { id: existing.id },
      data: { status: DeactivationStatus.CANCELLED, cancelledAt: new Date() },
    });
    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { deactivatedAt: null },
    });
    return { cancelled: true };
  }
}