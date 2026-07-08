import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';
import { ClickHouseService } from './clickhouse/clickhouse.service';
import { OssService } from './oss/oss.service';
import { EmailService } from './email/email.service';

@Global()
@Module({
  providers: [
    PrismaService,
    RedisService,
    ClickHouseService,
    OssService,
    EmailService,
  ],
  exports: [PrismaService, RedisService, ClickHouseService, OssService, EmailService],
})
export class InfraModule {}