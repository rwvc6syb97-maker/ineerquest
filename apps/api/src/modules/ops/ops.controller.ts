import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';

@ApiTags('后台-运营')
@Controller('admin')
export class OpsController {
  @Get('ping')
  ping() {
    return { code: 0, message: 'ops module ready', data: { module: 'ops' }, traceId: randomUUID() };
  }
}