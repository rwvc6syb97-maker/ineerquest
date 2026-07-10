import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizException, BizCode } from '../../common/response';
import { Public } from '../../common/guards/auth.guard';
import { MembershipService } from './membership.service';
import { ActivationCodeService } from './activation-code.service';
import { RedeemCodeDto } from './activation-code.dto';

/**
 * MembershipController — 会员套餐与激活码兑换公开接口。
 *
 * - GET /api/v1/membership/plans        列出上架套餐
 * - GET /api/v1/membership/plans/:code  按编码查上架套餐
 * - POST /api/v1/membership/redeem      兑换激活码（需登录）
 * - GET /api/v1/membership/status       查当前会员状态（需登录）
 */
@ApiTags('会员')
@Controller(['membership', 'memberships'])
export class MembershipController {
  constructor(
    private readonly membership: MembershipService,
    private readonly activationCode: ActivationCodeService,
  ) {}

  /** GET /api/v1/membership/plans（游客可访问，仅上架） */
  @Public()
  @Get('plans')
  async listPlans(@Req() req: Request) {
    // C3：套餐列表统一包裹为 { list: [...] }，与契约 §11 出参对齐
    return ok({ list: await this.membership.listPublicPlans() }, getTraceId(req), 'ok');
  }

  /** GET /api/v1/membership/plans/:code（游客可访问，仅上架） */
  @Public()
  @Get('plans/:code')
  async getPlan(@Param('code') code: string, @Req() req: Request) {
    return ok(await this.membership.getPublicPlanByCode(code), getTraceId(req), 'ok');
  }

  /** POST /api/v1/membership/redeem 兑换激活码（需登录） */
  @Post('redeem')
  async redeem(@Body() dto: RedeemCodeDto, @Req() req: Request) {
    const userId = (req as any).user?.userId;
    if (!userId) throw new BizException(BizCode.UNAUTHORIZED, '请先登录');
    return ok(await this.activationCode.redeem(userId, dto.code), getTraceId(req), '兑换成功');
  }

  /** GET /api/v1/membership/status | /api/v1/memberships/me 查当前会员状态（需登录） */
  @Get(['status', 'me'])
  async status(@Req() req: Request) {
    const userId = (req as any).user?.userId;
    if (!userId) throw new BizException(BizCode.UNAUTHORIZED, '请先登录');
    const result = await this.activationCode.getUserMembership(userId);
    // 对齐契约 v2.0 /memberships/me：{ level, expireAt, isActive }
    return ok(
      {
        level: result.membershipLevel,
        expireAt: result.membershipExpireAt,
        isActive: !result.expired,
      },
      getTraceId(req),
      'ok',
    );
  }

  /** GET /api/v1/memberships/records 我的兑换记录（需登录） */
  @Get('records')
  async records(@Req() req: Request) {
    const userId = (req as any).user?.userId;
    if (!userId) throw new BizException(BizCode.UNAUTHORIZED, '请先登录');
    return ok(await this.activationCode.getUserRedeemRecords(userId), getTraceId(req), 'ok');
  }
}