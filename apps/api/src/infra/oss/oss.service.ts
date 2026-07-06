import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import OSS from 'ali-oss';

/**
 * OssService — 阿里云 OSS 文件上传（头像、报告导出、资质证件等）。
 * 依据《技术架构设计文档.md》：OSS 作为对象存储。
 * 阶段 0：无真实凭证时仅初始化占位客户端，实连/签名上传标记 blocked。
 */
@Injectable()
export class OssService implements OnModuleInit {
  private readonly logger = new Logger(OssService.name);
  private client: OSS | null = null;

  onModuleInit(): void {
    const accessKeyId = process.env.OSS_ACCESS_KEY_ID ?? '';
    const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET ?? '';
    if (!accessKeyId || !accessKeySecret) {
      this.logger.warn('OSS credentials not set; client init skipped (blocked)');
      return;
    }
    try {
      this.client = new OSS({
        region: process.env.OSS_REGION ?? 'oss-cn-hangzhou',
        accessKeyId,
        accessKeySecret,
        bucket: process.env.OSS_BUCKET ?? 'innerquest',
      });
      this.logger.log('OSS client initialized');
    } catch (err) {
      this.logger.warn(`OSS init skipped: ${(err as Error).message}`);
    }
  }

  getClient(): OSS {
    if (!this.client) {
      throw new Error('OSS not initialized (missing credentials)');
    }
    return this.client;
  }

  /** 健康探针：客户端是否已初始化（无凭证视为未就绪但不报错） */
  isReady(): boolean {
    return this.client !== null;
  }
}