import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { CareerService } from './career.service';
import { ListCareerQueryDto, RecommendQueryDto, SearchCareerQueryDto } from './career.dto';

/**
 * CareerController — 职业库列表/详情/推荐/检索（T1-16）。
 * 注意由声明顺序：recommend / search 必须在 :id 之前，避免被动态段捕获。
 */
@ApiTags('职业')
@Controller('careers')
export class CareerController {
  constructor(private readonly career: CareerService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.TOKEN_INVALID, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** T1-16 职业列表 GET /api/v1/careers */
  @Get()
  async list(@Query() query: ListCareerQueryDto, @Req() req: Request) {
    return ok(
      await this.career.list({
        category: query.category,
        page: query.page,
        pageSize: query.pageSize,
      }),
      getTraceId(req),
    );
  }

  /** T1-16 MBTI 推荐 TOP10 GET /api/v1/careers/recommend */
  @Get('recommend')
  async recommend(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Query() query: RecommendQueryDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.career.recommend(uid, query.reportId), getTraceId(req));
  }

  /** T1-16 职业检索 GET /api/v1/careers/search */
  @Get('search')
  async search(@Query() query: SearchCareerQueryDto, @Req() req: Request) {
    return ok(await this.career.search(query.keyword, query.limit), getTraceId(req));
  }

  /** T1-16 职业详情 GET /api/v1/careers/:id */
  @Get(':id')
  async detail(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.career.detail(id), getTraceId(req));
  }
}