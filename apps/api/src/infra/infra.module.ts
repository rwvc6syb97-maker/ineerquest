import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';
import { MongoService } from './mongo/mongo.service';
import { ClickHouseService } from './clickhouse/clickhouse.service';
import { OssService } from './oss/oss.service';
import { EmailService } from './email/email.service';

/**
 * InfraModule — 基础设施层聚合（全局）。
 * 统一提供 MySQL(Prisma) / Redis / MongoDB / ClickHouse / OSS / Email 服务。
 */
@Global()
@Module({
  providers: [PrismaService, RedisService, MongoService, ClickHouseService, OssService, EmailService],
  exports: [PrismaService, RedisService, MongoService, ClickHouseService, OssService, EmailService],
})
export class InfraModule {}