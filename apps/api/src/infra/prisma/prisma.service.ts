import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — Prisma Client 生命周期托管
 * 依据《技术架构设计文档.md》：MySQL 8.0 主存储，通过 Prisma ORM 访问。
 * 连接失败不阻断进程启动（阶段 0 无真实 DB 时降级为 warn），
 * 真实迁移/连库属外部实连，标记 blocked。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to database');
    } catch (err) {
      // 阶段 0：无真实 DATABASE_URL 时不阻断启动，仅告警
      this.logger.warn(
        `Prisma connect skipped (no reachable DB): ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** 健康探针：DB 可达返回 true，否则 false（不抛异常） */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}