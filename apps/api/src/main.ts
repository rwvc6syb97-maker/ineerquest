import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';
import { CORS_ALLOWED_ORIGINS, CORS_ALLOWED_METHODS } from './config/cors.constants';

/**
 * InnerQuest 后端入口
 * 全局前缀 /api/v1（对齐技术架构设计文档 §8 API 前缀）
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: [...CORS_ALLOWED_ORIGINS],
    methods: [...CORS_ALLOWED_METHODS],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // iframe 嵌入适配：ALLOW_IFRAME=true 时用 SAMEORIGIN 支持同源 iframe 登录态同步，
  // 否则默认 DENY 防点击劫持。（对齐后端安全规范：按环境变量动态设置 X-Frame-Options）
  const allowIframe = process.env.ALLOW_IFRAME === 'true';
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Frame-Options', allowIframe ? 'SAMEORIGIN' : 'DENY');
    next();
  });

  // Swagger（OpenAPI）交互式文档，仅在非生产环境挂载，避免生产暴露接口结构与鉴权方式。
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('InnerQuest API')
      .setDescription('MBTI 职业规划平台后端接口文档')
      .setVersion('1.0')
      // 普通用户 JWT
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'user-token',
      )
      // 后台管理 admin JWT（scope=admin）
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'admin-token',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    Logger.log(
      `Swagger docs available at http://localhost:${process.env.PORT ?? 3000}/api/docs`,
      'Bootstrap',
    );
  }

  // 第6层 Valid：全局参数校验管线（对齐 9 层中间件链）
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 剔除 DTO 未声明字段
      transform: true, // 按类型自动转换
      forbidNonWhitelisted: false,
    }),
  );

  // 实时通信：接入 Redis Adapter（缺 Redis 时优雅降级为单实例内存广播）
  const wsAdapter = new RedisIoAdapter(app);
  await wsAdapter.connectToRedis();
  app.useWebSocketAdapter(wsAdapter);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  Logger.log(`InnerQuest API is running on http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();