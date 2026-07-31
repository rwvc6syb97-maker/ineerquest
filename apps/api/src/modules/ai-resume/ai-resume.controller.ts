import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiResponse as ApiResp,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { AiResumeService } from './ai-resume.service';
import {
  ResumeGenerateDto,
  ResumeGenerateVo,
  ResumeOptimizeFormDto,
  ResumeOptimizeVo,
  ResumeOptimizeListItemVo,
} from './ai-resume.dto';

/** §6 简历上传优化 —— 单文件上传大小上限 10MB（与 service 4622 阈值对齐，multer 层先兜底）。 */
const RESUME_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

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

  // ===================== M4 简历上传优化（§6） =====================

  /**
   * 上传 PDF 简历 + 目标岗位，AI 输出结构化优化建议。
   * multipart/form-data：file（PDF ≤10MB）+ targetCareerId（必填）+ note（可选 ≤500）。
   * 校验次序（LLM 前）：4620 无文件 → 4621 非 PDF → 4622 >10MB → 4624 岗位缺失/不存在
   *   → 4623 提取空/加密/扫描件 → 4625 >20000 字 → 4516 敏感词 → 4090 同哈希严格防重 → 4501 配额。
   * 隐私：不落 PDF 二进制，仅存 extractedText + suggestions + 文件名，expireAt 默认 30 天 Cron 清理。
   * LLM 失败/超时 → degraded=true 结构化兜底（仍 200）。
   * 越权/鉴权：4001 未登录；用户仅可优化自身记录。
   */
  @Post('optimize')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: RESUME_UPLOAD_MAX_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'AI 简历上传优化',
    description: '上传 PDF + 目标岗位，输出结构化优化建议；失败自动降级兜底',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'targetCareerId'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF 简历文件，≤10MB' },
        targetCareerId: { type: 'string', description: '目标岗位 ID', maxLength: 32 },
        note: { type: 'string', description: '补充说明（可选）', maxLength: 500 },
      },
    },
  })
  @ApiResp({ status: 200, description: '成功或降级兜底', type: ResumeOptimizeVo })
  async optimize(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() form: ResumeOptimizeFormDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    const data = await this.service.optimize(uid, file, form);
    return ok(data, getTraceId(req));
  }

  /**
   * 历史优化记录列表（当前用户，最多 100 条，按创建时间倒序）。
   * 注意：静态段 optimize 列表路由必须声明在 optimize/:docId 之前，避免被参数路由吞掉。
   */
  @Get('optimize')
  @ApiOperation({ summary: '简历优化历史列表', description: '返回当前用户的优化记录列表' })
  @ApiResp({ status: 200, description: '列表', type: ResumeOptimizeListItemVo, isArray: true })
  async listOptimize(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    const data = await this.service.listOptimizeDocs(uid);
    return ok(data, getTraceId(req));
  }

  /**
   * 优化记录详情（含 suggestions）。
   * 越权：非本人记录抛 4003；不存在抛 4004。
   */
  @Get('optimize/:docId')
  @ApiOperation({ summary: '简历优化详情', description: '按 docId 获取优化建议，越权 4003' })
  @ApiParam({ name: 'docId', description: '优化记录 ID' })
  @ApiResp({ status: 200, description: '详情', type: ResumeOptimizeVo })
  async getOptimize(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('docId') docId: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    const data = await this.service.getOptimizeDoc(uid, docId);
    return ok(data, getTraceId(req));
  }
}