import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Db, MongoClient } from 'mongodb';

/**
 * MongoService — 文档存储（AI 消息、辅导消息、报告大文本）。
 * 优先连接真实 MongoDB 实例；不可用时尝试 mongodb-memory-server 嵌入式数据库。
 * 两者都不可用时不阻断启动，消息走进程内存兜底。
 */
@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private memoryServer: unknown = null;

  async onModuleInit(): Promise<void> {
    const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017';
    const dbName = process.env.MONGODB_DB ?? 'innerquest';

    // 1. 尝试连接真实 MongoDB
    try {
      this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
      await this.client.connect();
      this.db = this.client.db(dbName);
      this.logger.log('MongoDB connected');
      return;
    } catch (err) {
      this.logger.warn(`MongoDB not available: ${(err as Error).message}, trying embedded...`);
    }

    // 2. 尝试 mongodb-memory-server 嵌入式数据库
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      this.memoryServer = await MongoMemoryServer.create({
        instance: { dbName },
      });
      const memUri = (this.memoryServer as { getUri(): string }).getUri();
      this.client = new MongoClient(memUri);
      await this.client.connect();
      this.db = this.client.db(dbName);
      this.logger.log(`MongoDB embedded started at ${memUri}`);
    } catch (err2) {
      this.logger.warn(`MongoDB embedded also failed: ${(err2 as Error).message}. Chat messages use in-memory fallback.`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
    if (this.memoryServer) {
      await (this.memoryServer as { stop(): Promise<void> }).stop().catch(() => {});
    }
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('MongoDB not connected');
    }
    return this.db;
  }

  /** 健康探针 */
  async ping(): Promise<boolean> {
    try {
      if (!this.client) return false;
      await this.client.db().admin().ping();
      return true;
    } catch {
      return false;
    }
  }
}