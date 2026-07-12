import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, BizException } from '../../common/response';

/** 收藏目标类型：1=职业 career */
const TARGET_TYPE_CAREER = 1;

/**
 * L4 收藏功能服务（契约 v2.0，需求文档 §7.1/§7.2/§7.3）。
 *
 * 复用 user_favorite 表（targetType=1 表示职业），软删除以 status(1有效/0取消)+deletedAt 标记。
 * - 重复收藏 → CAREER_ALREADY_FAVORITED(4403)
 * - 职业不存在/下架 → CAREER_NOT_FOUND(4402)
 * - userId 强隔离，列表只返当前登录用户自己的收藏
 * - DB 存 UTC，接口出参统一转北京时间字符串 YYYY-MM-DD HH:mm:ss
 */
@Injectable()
export class CareerFavoriteService {
  private readonly logger = new Logger(CareerFavoriteService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** DB(UTC) → 北京时间字符串 YYYY-MM-DD HH:mm:ss（+08:00） */
  private toBeijingString(date: Date): string {
    const bj = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const p = (n: number) => n.toString().padStart(2, '0');
    return (
      `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ` +
      `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`
    );
  }

  /** 安全解析 careerId：非数字/非法直接返 4402（禁止 BigInt 抛 5000） */
  private parseCareerId(careerId: string): bigint {
    if (!/^\d+$/.test(String(careerId ?? '').trim())) {
      throw new BizException(BizCode.CAREER_NOT_FOUND, '职业不存在');
    }
    try {
      return BigInt(careerId);
    } catch {
      throw new BizException(BizCode.CAREER_NOT_FOUND, '职业不存在');
    }
  }

  /** 校验职业存在且未下架，返回其 id（不存在/下架 → 4402） */
  private async ensureCareerActive(careerId: string): Promise<bigint> {
    const id = this.parseCareerId(careerId);
    const career = await this.prisma.career.findFirst({
      where: { id, isDeleted: 0, status: 1 },
      select: { id: true },
    });
    if (!career) {
      throw new BizException(BizCode.CAREER_NOT_FOUND, '职业不存在或已下架');
    }
    return career.id;
  }

  // ============ 收藏 POST /careers/:careerId/favorite ============

  async favorite(userId: string, careerId: string) {
    const uid = BigInt(userId);
    const cid = await this.ensureCareerActive(careerId);

    // 查是否已有记录（含软删除）
    const existing = await this.prisma.userFavorite.findUnique({
      where: {
        userId_targetType_targetId: {
          userId: uid,
          targetType: TARGET_TYPE_CAREER,
          targetId: cid,
        },
      },
    });

    // 已存在有效收藏 → 4403 重复
    if (existing && existing.status === 1) {
      throw new BizException(BizCode.CAREER_ALREADY_FAVORITED, '该职业已收藏，请勿重复收藏');
    }

    // 软删除记录重新激活；否则新建（并发唯一约束冲突 P2002 视为已收藏 → 4403）
    let record;
    try {
      if (existing) {
        record = await this.prisma.userFavorite.update({
          where: { id: existing.id },
          data: { status: 1, deletedAt: null },
        });
      } else {
        record = await this.prisma.userFavorite.create({
          data: { userId: uid, targetType: TARGET_TYPE_CAREER, targetId: cid, status: 1 },
        });
      }
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        const target = (err as { meta?: { target?: unknown } }).meta?.target;
        const targetStr = Array.isArray(target) ? target.join(',') : String(target ?? '');
        if (targetStr.includes('uk_user_target')) {
          throw new BizException(BizCode.CAREER_ALREADY_FAVORITED, '该职业已收藏，请勿重复收藏');
        }
      }
      throw err;
    }

    return {
      favorited: true,
      favoriteId: record.id.toString(),
      createdAt: this.toBeijingString(record.createdAt),
    };
  }

  // ============ 取消收藏 DELETE /careers/:careerId/favorite（幂等软删除） ============

  async unfavorite(userId: string, careerId: string) {
    const uid = BigInt(userId);
    // 取消收藏不校验职业是否下架（允许对已下架职业取消），仅解析 id
    const cid = this.parseCareerId(careerId);

    const existing = await this.prisma.userFavorite.findUnique({
      where: {
        userId_targetType_targetId: {
          userId: uid,
          targetType: TARGET_TYPE_CAREER,
          targetId: cid,
        },
      },
    });

    // 幂等：未收藏或已取消也返 200 favorited=false（不报错）
    if (existing && existing.status === 1) {
      await this.prisma.userFavorite.update({
        where: { id: existing.id },
        data: { status: 0, deletedAt: new Date() },
      });
    }

    return { favorited: false };
  }

  // ============ 我的收藏列表 GET /careers/favorites（userId 强隔离） ============

  async list(userId: string, params: { page?: number; pageSize?: number }) {
    const uid = BigInt(userId);
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20));

    const where = { userId: uid, targetType: TARGET_TYPE_CAREER, status: 1 };
    const [total, favorites] = await this.prisma.$transaction([
      this.prisma.userFavorite.count({ where }),
      this.prisma.userFavorite.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // 批量取职业信息（去重）
    const careerIds = favorites.map((f) => f.targetId);
    const careers = careerIds.length
      ? await this.prisma.career.findMany({
          where: { id: { in: careerIds } },
          select: {
            id: true,
            name: true,
            category: true,
            salaryMin: true,
            salaryMax: true,
            prospect: true,
          },
        })
      : [];
    const careerMap = new Map(careers.map((c) => [c.id.toString(), c]));

    const salaryRange = (min: number | null, max: number | null): string => {
      if (min != null && max != null) return `${min}-${max}`;
      if (min != null) return `${min}+`;
      if (max != null) return `0-${max}`;
      return '';
    };

    const list = favorites.map((f) => {
      const c = careerMap.get(f.targetId.toString());
      return {
        favoriteId: f.id.toString(),
        careerId: f.targetId.toString(),
        name: c?.name ?? '',
        category: c?.category ?? '',
        salaryRange: c ? salaryRange(c.salaryMin, c.salaryMax) : '',
        outlook: c?.prospect ?? '',
        createdAt: this.toBeijingString(f.createdAt),
      };
    });

    return { list, total, page, pageSize };
  }
}