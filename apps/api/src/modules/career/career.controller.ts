import { Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { Public } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { CareerService } from './career.service';
import { CareerFavoriteService } from './career-favorite.service';
import { CareerPlanService } from './career-plan.service';
import {
  FavoriteListQueryDto,
  ListCareerQueryDto,
  RecommendQueryDto,
  SearchCareerQueryDto,
} from './career.dto';

/**
 * CareerController — 职业库（§9.1）。
 *
 * 路由声明顺序：recommendations / search 必须在 :careerId 动态段之前，避免字面量被当 id。
 * - GET /careers                          列表（游客可访 C1）
 * - GET /careers/recommendations          MBTI 推荐 TOP10（需登录，A1 复数）
 * - GET /careers/search                   检索
 * - GET /careers/:careerId                详情（游客可访 C1，非数字/不存在 4402）
 * - GET /careers/:careerId/roadmap        发展路线图（需登录，A4）
 * - GET /careers/:careerId/skill-gap      技能差距（需登录，A2 迁移自 skills-gap）
 * - GET /careers/:careerId/resources      关联学习资源（游客可访，A3 迁移自 learning/resources + C1）
 */
@ApiTags('职业')
@ApiBearerAuth('user-token')
@Controller('careers')
export class CareerController {
  constructor(
    private readonly career: CareerService,
    private readonly favorite: CareerFavoriteService,
    private readonly plan: CareerPlanService,
  ) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.TOKEN_INVALID, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** 职业列表 GET /api/v1/careers（C1 游客可访） */
  @Public()
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

  /** MBTI 推荐 TOP10 GET /api/v1/careers/recommendations（A1 复数，须在 :careerId 前） */
  @Get('recommendations')
  async recommendations(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Query() query: RecommendQueryDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.career.recommend(uid, query.reportId), getTraceId(req));
  }

  /** 职业检索 GET /api/v1/careers/search（须在 :careerId 前） */
  @Public()
  @Get('search')
  async search(@Query() query: SearchCareerQueryDto, @Req() req: Request) {
    return ok(await this.career.search(query.keyword, query.limit), getTraceId(req));
  }

  /** 我的收藏列表 GET /api/v1/careers/favorites（L4，需登录；字面量须在 :careerId 前） */
  @Get('favorites')
  async favorites(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Query() query: FavoriteListQueryDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(
      await this.favorite.list(uid, { page: query.page, pageSize: query.pageSize }),
      getTraceId(req),
    );
  }

  /** 职业详情 GET /api/v1/careers/:careerId（C1 游客可访） */
  @Public()
  @Get(':careerId')
  async detail(@Param('careerId') careerId: string, @Req() req: Request) {
    return ok(await this.career.detail(careerId), getTraceId(req));
  }

  /** 发展路线图 GET /api/v1/careers/:careerId/roadmap（A4，需登录） */
  @Get(':careerId/roadmap')
  async roadmap(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('careerId') careerId: string,
    @Req() req: Request,
  ) {
    this.requireUser(user);
    return ok(await this.career.roadmap(careerId), getTraceId(req));
  }

  /** 技能差距分析 GET /api/v1/careers/:careerId/skill-gap（A2，需登录） */
  @Get(':careerId/skill-gap')
  async skillGap(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('careerId') careerId: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.plan.skillGap(uid, careerId), getTraceId(req));
  }

  /** 关联学习资源 GET /api/v1/careers/:careerId/resources（A3 + C1 游客可访） */
  @Public()
  @Get(':careerId/resources')
  async resources(
    @Param('careerId') careerId: string,
    @Query('skill') skill: string | undefined,
    @Query('type') type: string | undefined,
    @Req() req: Request,
  ) {
    return ok(await this.plan.learningResources({ careerId, skill, type }), getTraceId(req));
  }

  /** 收藏职业 POST /api/v1/careers/:careerId/favorite（L4，需登录） */
  @Post(':careerId/favorite')
  async addFavorite(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('careerId') careerId: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.favorite.favorite(uid, careerId), getTraceId(req));
  }

  /** 取消收藏 DELETE /api/v1/careers/:careerId/favorite（L4，需登录，幂等软删除） */
  @Delete(':careerId/favorite')
  async removeFavorite(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('careerId') careerId: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.favorite.unfavorite(uid, careerId), getTraceId(req));
  }
}