import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { Logger } from '@nestjs/common';
import { Public } from '../../common/guards/auth.guard';

@ApiTags('后台-运营')
@Controller('admin')
export class OpsController {
  private readonly logger = new Logger(OpsController.name);

  @Get('ping')
  ping() {
    return { code: 0, message: 'ops module ready', data: { module: 'ops' }, traceId: randomUUID() };
  }

  /** POST /admin/seed 触发数据库种子填充（仅生产环境应急使用，无需认证） */
  @Public()
  @Post('seed')
  async runSeed() {
    try {
      this.logger.log('[seed] 开始执行数据库种子脚本...');
      const output = execSync('npx prisma db seed', {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 120_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.logger.log(`[seed] 执行完成:\n${output}`);
      return { code: 0, message: '种子数据已刷新', data: { output: output.slice(0, 500) }, traceId: randomUUID() };
    } catch (err: any) {
      this.logger.error(`[seed] 执行失败: ${err.message}`, err.stderr);
      return { code: 50000, message: '种子执行失败', data: { error: err.message.slice(0, 200) }, traceId: randomUUID() };
    }
  }
}