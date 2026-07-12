import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, BizException } from '../../common/response';
import {
  DailyBriefItemVo,
  DailyBriefQueryDto,
  DailyBriefVo,
  SubscriptionUpdateDto,
  SubscriptionVo,
} from './daily-brief.dto';

/**
 * §4.3 AI 职业热点日报（登录可见）。
 * 护城河/铁律：
 *  - 内容由 scheduler 后台批量生成（非请求触发），接口仅读 daily_brief（已发布 status=1）。
 *  - 数据隔离：仅读/写当前 userId 的日报与订阅（uk_user_date / uk_user_id）。
 *  - 无当日日报 → 4004；无任何写业务表操作（订阅落 daily_brief_subscription 分表）。
 *  - 内容源限权威数据 + AI 摘要，严禁爬取招聘平台（由 scheduler 生成侧保证）。
 */
@Injectable()
export class DailyBriefService {
  constructor(private readonly prisma: PrismaService) {}

  /** 获取我的日报：默认今日；无已发布日报 → 4004。 */
  async getMine(userId: string, query: DailyBriefQueryDto): Promise<DailyBriefVo> {
    const date = this.resolveDate(query.date);
    const brief = await this.prisma.dailyBrief.findFirst({
      where: { userId: BigInt(userId), briefDate: date, status: 1 },
      select: { id: true, briefDate: true, itemsData: true },
    });
    if (!brief) {
      throw new BizException(BizCode.AI_NOT_FOUND, '当日暂无日报');
    }
    return {
      briefId: brief.id.toString(),
      date: this.fmtDate(brief.briefDate),
      items: this.toItems(brief.itemsData),
    };
  }

  /** 订阅设置（幂等 upsert，一人一条）。 */
  async updateSubscription(userId: string, dto: SubscriptionUpdateDto): Promise<SubscriptionVo> {
    const uid = BigInt(userId);
    const enabled = dto.enabled ? 1 : 0;
    const categories = Array.isArray(dto.categories) ? dto.categories : [];
    const row = await this.prisma.dailyBriefSubscription.upsert({
      where: { userId: uid },
      create: { userId: uid, enabled, categoriesData: categories },
      update: { enabled, categoriesData: categories },
      select: { enabled: true, categoriesData: true },
    });
    return {
      enabled: row.enabled === 1,
      categories: this.toCategories(row.categoriesData),
    };
  }

  /** 解析日期参数（YYYY-MM-DD → UTC 零点 Date），缺省今日。 */
  private resolveDate(dateStr?: string): Date {
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return new Date(`${dateStr}T00:00:00.000Z`);
    }
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  /** 格式化 @db.Date 为 YYYY-MM-DD（UTC）。 */
  private fmtDate(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private toItems(data: unknown): DailyBriefItemVo[] {
    if (!Array.isArray(data)) return [];
    return data
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({
        title: typeof x.title === 'string' ? x.title : '',
        summary: typeof x.summary === 'string' ? x.summary : '',
        careerId:
          x.careerId != null && (typeof x.careerId === 'string' || typeof x.careerId === 'number')
            ? String(x.careerId)
            : undefined,
      }));
  }

  private toCategories(data: unknown): string[] {
    if (Array.isArray(data)) return data.filter((x): x is string => typeof x === 'string');
    return [];
  }
}