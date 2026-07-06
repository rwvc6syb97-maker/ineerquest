import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';

@ApiTags('LLM网关')
@Controller('llm-gateway')
export class LlmGatewayController {
  @Get('ping')
  ping() {
    return { code: 0, message: 'llm-gateway module ready', data: { module: 'llm-gateway' }, traceId: randomUUID() };
  }
}