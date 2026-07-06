import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';

@ApiTags('实时通信')
@Controller('realtime')
export class RealtimeController {
  @Get('ping')
  ping() {
    return { code: 0, message: 'realtime module ready', data: { module: 'realtime' }, traceId: randomUUID() };
  }
}