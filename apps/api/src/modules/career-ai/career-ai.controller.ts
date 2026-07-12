import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { BizCode, BizException, ok } from '../../common/response';
import { RequirePerms } from '../../common/guards/permission.guard';
import { CareerAiService } from './career-ai.service';
import { CareerGenerateDto, DraftListQueryDto, ReviewDto } from './career-ai.dto';

/**
 * §4.4 AI 辅助职业库生产接口 `/api/v1/admin/ai/career/*`（仅管理员）。
 * 鉴权：@RequirePerms('career:manage') → PermissionGuard 校验 scope=admin，
 *       非管理员/ C 端 token 统一抛 ADMIN_SCOPE_INVALID(4030)。
 * 红线：S-04 草稿先审后同步；S-05 招聘源拒绝（service 内 4005）。
 */
@ApiTags('后台-AI职业库生产')
@ApiBearerAuth('admin-token')
@Controller('admin/ai/career')
@RequirePerms('career:manage')
export class CareerAiController {
  constructor(private readonly service: CareerAiService) {}

  /** 生成职业草稿（仅入 career_ai_draft）。错误码：4005 参数/招聘源；4461 重复职业名。 */
  @Post('generate')
  @ApiOperation({ summary: 'AI 生成职业草稿（仅入草稿表，需审核）' })
  async generate(@Body() dto: CareerGenerateDto, @Req() req: Request) {
    const adminId = this.requireAdminId(req);
    const data = await this.service.generate(adminId, dto);
    return ok(data, getTraceId(req), '草稿已生成，待审核');
  }

  /** 草稿列表（分页）。 */
  @Get('drafts')
  @ApiOperation({ summary: '职业草稿列表' })
  async listDrafts(@Query() query: DraftListQueryDto, @Req() req: Request) {
    const data = await this.service.listDrafts(query);
    return ok(data, getTraceId(req), 'ok');
  }

  /** 审核草稿：approve 同步正式表 / reject 仅置状态。错误码：4460 不存在；4462 已审核。 */
  @Post('drafts/:draftId/review')
  @ApiOperation({ summary: '审核职业草稿（approve 才同步正式职业库）' })
  async review(
    @Param('draftId') draftId: string,
    @Body() dto: ReviewDto,
    @Req() req: Request,
  ) {
    this.requireAdminId(req);
    const data = await this.service.review(draftId, dto);
    return ok(data, getTraceId(req), '审核完成');
  }

  /** 从 admin token 解析操作者 id（PermissionGuard 已保证 scope=admin）。 */
  private requireAdminId(req: Request): string {
    const userId = (req as unknown as { user?: { userId?: string } }).user?.userId;
    if (!userId) {
      throw new BizException(BizCode.ADMIN_SCOPE_INVALID, '无权访问运营后台', 403);
    }
    return String(userId);
  }
}