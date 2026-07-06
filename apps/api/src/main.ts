import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';

/**
 * InnerQuest 后端入口
 * 全局前缀 /api/v1（对齐技术架构设计文档 §8 API 前缀）
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');

  // Swagger（OpenAPI）交互式文档，挂载在路由注册阶段，不依赖 DB 连接。
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
  Logger.log(`Swagger docs available at http://localhost:${port}/api/docs`, 'Bootstrap');
}

void bootstrap();