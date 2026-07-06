import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/guards/auth.guard';
import { PrismaService } from './infra/prisma/prisma.service';
import { RedisService } from './infra/redis/redis.service';
import { MongoService } from './infra/mongo/mongo.service';
import { ClickHouseService } from './infra/clickhouse/clickhouse.service';
import { OssService } from './infra/oss/oss.service';

/** 服务模块基线（10 个），用于健康检查回显挂载情况 */
const MOUNTED_MODULES = [
  'user',
  'assessment',
  'report',
  'career',
  'ai-chat',
  'coaching',
  'payment',
  'ops',
  'llm-gateway',
  'realtime',
];

@ApiTags('系统')
@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mongo: MongoService,
    private readonly clickhouse: ClickHouseService,
    private readonly oss: OssService,
  ) {}

  /**
   * 健康检查 GET /api/v1/health
   * 返回值由 ResponseInterceptor 统一包装为 {code,message,data,traceId}。
   * 基础设施探针失败不影响进程存活，仅回显各连接状态。
   */
  @Public()
  @Get('health')
  async health(): Promise<Record<string, unknown>> {
    const [mysql, redis, mongo, clickhouse] = await Promise.all([
      this.prisma.ping().catch(() => false),
      this.redis.ping().catch(() => false),
      this.mongo.ping().catch(() => false),
      this.clickhouse.ping().catch(() => false),
    ]);
    return {
      status: 'up',
      modules: MOUNTED_MODULES,
      moduleCount: MOUNTED_MODULES.length,
      infra: {
        mysql, // 由 PrismaService.ping() 探针返回（DATABASE_URL 未就绪时降级 false）
        redis,
        mongo,
        clickhouse,
        oss: this.oss.isReady(),
      },
    };
  }
}