import { Module } from '@nestjs/common';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
import { AiResumeController } from './ai-resume.controller';
import { AiResumeService } from './ai-resume.service';

/**
 * §3.2 AI 简历/求职信生成 + §6 简历上传优化（M4）模块。
 * 依赖 LlmGatewayModule（统一 LLM 出口，含降级）。
 * Cron 清理 ai_resume_doc 过期 extractedText（隐私 TTL）：
 *   ScheduleModule.forRoot() 已由 SchedulerModule 全局注册一次，
 *   此处不再重复 forRoot（重复会导致 SchedulerRegistry 冲突）。
 *   本模块的 AiResumeService 作为 provider 存在于 DI 容器中，
 *   其 @Cron 方法会被全局 DiscoveryService 自动扫描注册。
 * multipart 由 @nestjs/platform-express 内置 multer + FileInterceptor 处理（controller 层）。
 * 护城河：落 ai_resume_doc 分表，禁写报告本体表；不落 PDF 二进制。
 * PrismaService 全局注入，无需显式 import PrismaModule。
 */
@Module({
  imports: [LlmGatewayModule],
  controllers: [AiResumeController],
  providers: [AiResumeService],
})
export class AiResumeModule {}