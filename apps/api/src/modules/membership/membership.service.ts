import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, CommonCode, BizException } from '../../common/response';
import { PlanStatus } from './membership.constants';
import { CreatePlanDto, UpdatePlanDto } from './membership.dto';

/**
 * T2-10 会员套餐商品服务。
 *
 * - 游客可访问：GET /membership/plans（仅上架 status=1）、GET /membership/plans/:code。
 * - 后台 CRUD：/admin/membership-plans 增删改查（含已下架/已删除的完整管理视图）。
 * - PATCH /admin/membership-plans/:id/status 上下架切换。
 *
 * 下单上架校验位于 PaymentService.resolveBiz（bizType=3），下架下单返回 70004，
 * 本服务与其共享 membership_plan 表与 PlanStatus 语义。
 */
@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============ 游客可访问 ============

  /** GET /membership/plans：仅返回上架套餐，按 sort_order 升序。 */
  async listPublicPlans() {
    const plans = await this.prisma.membershipPlan.findMany({
      where: { status: PlanStatus.ONLINE, isDeleted: 0 },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return plans.map((p) => this.toPublicVo(p));
  }

  /** GET /membership/plans/:code：按编码查上架套餐，未上架/不存在 → 40400。 */
  async getPublicPlanByCode(code: string) {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { code, status: PlanStatus.ONLINE, isDeleted: 0 },
    });
    if (!plan) {
      throw new BizException(CommonCode.NOT_FOUND, '套餐不存在或未上架');
    }
    return this.toPublicVo(plan);
  }

  // ============ 后台 CRUD ============

  /** GET /admin/membership-plans：后台完整列表（含下架，排除软删）。 */
  async listAdminPlans() {
    const plans = await this.prisma.membershipPlan.findMany({
      where: { isDeleted: 0 },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return plans.map((p) => this.toAdminVo(p));
  }

  /** GET /admin/membership-plans/:id：后台详情。 */
  async getAdminPlan(id: string) {
    const plan = await this.findAdminPlanOrThrow(id);
    return this.toAdminVo(plan);
  }

  /** POST /admin/membership-plans：创建套餐（code 唯一，冲突 → 40000）。 */
  async createPlan(dto: CreatePlanDto) {
    const dup = await this.prisma.membershipPlan.findFirst({
      where: { code: dto.code },
    });
    if (dup) {
      throw new BizException(CommonCode.BAD_REQUEST, `套餐编码已存在: ${dto.code}`);
    }
    const plan = await this.prisma.membershipPlan.create({
      data: {
        code: dto.code,
        name: dto.name,
        subtitle: dto.subtitle ?? null,
        price: BigInt(dto.price),
        originalPrice: dto.originalPrice != null ? BigInt(dto.originalPrice) : null,
        durationDays: dto.durationDays ?? null,
        planType: dto.planType ?? 2,
        benefits: (dto.benefits ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        sortOrder: dto.sortOrder ?? 0,
        isRecommended: dto.isRecommended ?? 0,
        // 新建默认下架，需显式上架后游客方可见
        status: PlanStatus.OFFLINE,
      },
    });
    return this.toAdminVo(plan);
  }

  /** PUT /admin/membership-plans/:id：更新套餐（仅覆盖传入字段）。 */
  async updatePlan(id: string, dto: UpdatePlanDto) {
    await this.findAdminPlanOrThrow(id);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.subtitle !== undefined) data.subtitle = dto.subtitle ?? null;
    if (dto.price !== undefined) data.price = BigInt(dto.price);
    if (dto.originalPrice !== undefined)
      data.originalPrice = dto.originalPrice != null ? BigInt(dto.originalPrice) : null;
    if (dto.durationDays !== undefined) data.durationDays = dto.durationDays ?? null;
    if (dto.planType !== undefined) data.planType = dto.planType;
    if (dto.benefits !== undefined) data.benefits = (dto.benefits ?? null) as object | null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isRecommended !== undefined) data.isRecommended = dto.isRecommended;

    const plan = await this.prisma.membershipPlan.update({
      where: { id: BigInt(id) },
      data,
    });
    return this.toAdminVo(plan);
  }

  /** DELETE /admin/membership-plans/:id：软删除（is_deleted=1）。 */
  async deletePlan(id: string) {
    await this.findAdminPlanOrThrow(id);
    await this.prisma.membershipPlan.update({
      where: { id: BigInt(id) },
      data: { isDeleted: 1, deletedAt: new Date(), status: PlanStatus.OFFLINE },
    });
    return { id, deleted: true };
  }

  /** PATCH /admin/membership-plans/:id/status：上下架。 */
  async updateStatus(id: string, status: number) {
    await this.findAdminPlanOrThrow(id);
    const plan = await this.prisma.membershipPlan.update({
      where: { id: BigInt(id) },
      data: { status },
    });
    this.logger.log(`plan ${id} status → ${status}`);
    return this.toAdminVo(plan);
  }

  // ============ 内部工具 ============

  private async findAdminPlanOrThrow(id: string) {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: BigInt(id), isDeleted: 0 },
    });
    if (!plan) {
      throw new BizException(BizCode.ORDER_NOT_FOUND, '套餐不存在');
    }
    return plan;
  }

  private toPublicVo(p: MembershipPlanRow) {
    return {
      id: p.id.toString(),
      code: p.code,
      name: p.name,
      subtitle: p.subtitle,
      price: Number(p.price),
      originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
      durationDays: p.durationDays,
      planType: p.planType,
      benefits: p.benefits ?? null,
      sortOrder: p.sortOrder,
      isRecommended: p.isRecommended,
    };
  }

  private toAdminVo(p: MembershipPlanRow) {
    return {
      ...this.toPublicVo(p),
      status: p.status,
      statusLabel: p.status === PlanStatus.ONLINE ? 'online' : 'offline',
      isDeleted: p.isDeleted,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}

/** 与 Prisma MembershipPlan 一致的行结构（避免直接耦合生成类型）。 */
interface MembershipPlanRow {
  id: bigint;
  code: string;
  name: string;
  subtitle: string | null;
  price: bigint;
  originalPrice: bigint | null;
  durationDays: number | null;
  planType: number;
  benefits: unknown;
  sortOrder: number;
  status: number;
  isRecommended: number;
  isDeleted: number;
  createdAt: Date;
  updatedAt: Date;
}