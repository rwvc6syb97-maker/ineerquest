import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse as ApiResp } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { AiResumeService } from './ai-resume.service';
import { ResumeGenerateDto, ResumeGenerateVo } from './ai-resume.dto';

/**
 * §3.2 AI 简历/求职信生成。
 * 路由：POST /api/v1/ai/resume/generate（全局前缀 /api/v1）。
 * 权限：已登录 + 会员/付费校验（非会员 4515）。
 */
@ApiTags('AI-简历生成')
@ApiBearerAuth('user-token')
@Controller('ai/resume')
export class AiResumeController {
  constructor(private readonly service: AiResumeService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.AI_UNAUTHORIZED, '未登录或登录已失效');
    }
    return user.userId;
  }

  /**
   * 生成简历/求职信。
   * 成功 code=200 data=ResumeGenerateVo；LLM 失败/超时走 degraded=true 回退规则版（仍 200）。
   * 错误码：4515 非会员；4516 敏感词；4004 职业不存在；4000 入参校验失败；5002/5003 上游异常（降级）。
   */
  @Post('generate')
  @ApiOperation({ summary: 'AI 简历/求职信生成', description: 'LLM 生成文档初稿，失败自动降级规则版' })
  @ApiResp({ status: 200, description: '成功或降级兜底', type: ResumeGenerateVo })
  async generate(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: ResumeGenerateDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    const data = await this.service.generate(uid, dto);
    return ok(data, getTraceId(req));
  }
}