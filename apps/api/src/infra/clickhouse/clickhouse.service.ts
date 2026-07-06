import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClickHouseClient, createClient } from '@clickhouse/client';

/**
 * ClickHouseService — 埋点事件日志的 OLAP 分析存储。
 * 依据《数据库设计文档.md》event_log 建议落 ClickHouse。
 * 阶段 0：无真实实例时不阻断启动，实连标记 blocked。
 */
@Injectable()
export class ClickHouseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClickHouseService.name);
  private client: ClickHouseClient | null = null;

  async onModuleInit(): Promise<void> {
    try {
      this.client = createClient({
        host: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
        username: process.env.CLICKHOUSE_USER ?? 'default',
        password: process.env.CLICKHOUSE_PASSWORD ?? '',
        database: process.env.CLICKHOUSE_DB ?? 'innerquest_ops',
      });
      this.logger.log('ClickHouse client initialized');
    } catch (err) {
      this.logger.warn(`ClickHouse init skipped: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
  }

  getClient(): ClickHouseClient {
    if (!this.client) {
      throw new Error('ClickHouse not initialized');
    }
    return this.client;
  }

  /** 健康探针：SELECT 1 */
  async ping(): Promise<boolean> {
    try {
      const res = await this.client?.ping();
      return res?.success === true;
    } catch {
      return false;
    }
  }
}