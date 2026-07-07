import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';
import { MockRedisService } from './redis/mock-redis.service';
import { MongoService } from './mongo/mongo.service';
import { ClickHouseService } from './clickhouse/clickhouse.service';
import { OssService } from './oss/oss.service';
import { EmailService } from './email/email.service';

const useMockRedis = (process.env.USE_MOCK_REDIS ?? 'false').toLowerCase() === 'true';

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: RedisService, useClass: useMockRedis ? MockRedisService : RedisService },
    MongoService,
    ClickHouseService,
    OssService,
    EmailService,
  ],
  exports: [PrismaService, RedisService, MongoService, ClickHouseService, OssService, EmailService],
})
export class InfraModule {}