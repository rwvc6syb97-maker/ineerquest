import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse as ApiResp } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok } from '../../common/response';
import { Public } from '../../common/guards/auth.guard';
import { TokenService } from '../user/auth/token.service';
import { AiCollabService } from './ai-collab.service';
import { CollabAnalyzeDto, CollabAnalyzeVo } from './ai-collab.dto';

/**
 * §3.1 AI 双人/团队协作分析。
 * 路由：POST /api/v1/ai/collab/analyze（全局前缀 /api/v1）。
 * 权限：@Public 游客可试用（1 次/日/IP，超限 9001）；登录用户日配额（9002），可保存结果。
 * 说明：@Public 跳过 AuthGuard 不注入 req.user，故在 controller 内手动解析可选 token 取 userId。
 */
@ApiTags('AI-协作分析')
@Controller('ai/collab')
export class AiCollabController {
  constructor(
    private readonly service: AiCollabService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * 协作分析。成功 code=200 data=CollabAnalyzeVo；LLM 失败/超时 degraded=true 回退规则版（仍 200）。
   * 错误码：4000 members 非法（2~6 人/mbti 非法，ValidationPipe 映射）；9001 游客试用超限；9002 登录用户日配额耗尽；5002/5003 上游异常（降级）。
   */
  @Post('analyze')
  @Public()
  @ApiOperation({ summary: 'AI 协作分析', description: '游客可试用，登录可保存；LLM 失败自动降级规则版' })
  @ApiResp({ status: 200, description: '成功或降级兜底', type: CollabAnalyzeVo })
  async analyze(@Body() dto: CollabAnalyzeDto, @Req() req: Request) {
    const userId = await this.resolveOptionalUserId(req);
    const clientIp = this.resolveClientIp(req);
    const data = await this.service.analyze(userId, clientIp, dto);
    return ok(data, getTraceId(req));
  }

  /** 可选鉴权：有合法 access token 则返回 userId，否则视为游客返回 undefined。 */
  private async resolveOptionalUserId(req: Request): Promise<string | undefined> {
    const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    if (!token) return undefined;
    try {
      const payload = await this.tokenService.verifyActive(token);
      if (payload && payload.typ === 'access') return payload.sub;
    } catch {
      // 游客试用：token 非法不报错，降级为游客
    }
    return undefined;
  }

  /** 取客户端真实 IP（优先 X-Forwarded-For 首个），用于游客限流。 */
  private resolveClientIp(req: Request): string {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
    if (Array.isArray(xff) && xff.length > 0) return xff[0].split(',')[0].trim();
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }
}