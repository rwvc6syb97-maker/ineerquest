import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok } from '../../common/response';
import { RequirePerms } from '../../common/guards/permission.guard';
import { Audit } from '../../common/interceptors/audit.decorator';
import { ActivationCodeService } from '../membership/activation-code.service';
import { GenerateCodesDto, SendCodeDto } from '../membership/activation-code.dto';

/**
 * 后台激活码管理接口 `/api/v1/admin/activation-codes/*`。
 */
@ApiTags('后台-激活码')
@ApiBearerAuth('admin-token')
@Controller('admin/activation-codes')
export class AdminActivationCodeController {
  constructor(private readonly svc: ActivationCodeService) {}

  /** 批量生成激活码 */
  @Post('generate')
  @RequirePerms('payment:manage')
  @Audit('activation_code', 'generate')
  async generate(@Body() dto: GenerateCodesDto, @Req() req: Request) {
    return ok(await this.svc.generate(dto), getTraceId(req), '激活码已生成');
  }

  /** 激活码列表 */
  @Get()
  @RequirePerms('payment:manage')
  async list(
    @Query('planCode') planCode: string,
    @Query('status') status: string,
    @Query('batchNo') batchNo: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: Request,
  ) {
    const data = await this.svc.list({
      planCode: planCode || undefined,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
      batchNo: batchNo || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return ok(data, getTraceId(req), 'ok');
  }

  /** 向用户发送激活码（邮件/短信） */
  @Post(':id/send')
  @RequirePerms('payment:manage')
  @Audit('activation_code', 'send')
  async send(@Param('id') id: string, @Body() dto: SendCodeDto, @Req() req: Request) {
    if (dto?.channel === 1 && !dto?.email) {
      throw new BadRequestException('邮件发送请提供 email');
    }
    if (dto?.channel === 2 && !dto?.phone) {
      throw new BadRequestException('短信发送请提供 phone');
    }
    return ok(await this.svc.sendCode(id, { email: dto.email, phone: dto.phone, channel: dto.channel }), getTraceId(req), '已发送');
  }
}
