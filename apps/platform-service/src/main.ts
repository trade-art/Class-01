import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Security
  app.use(helmet());

  // CORS
  const corsOrigins = configService.get<string>('CORS_ORIGINS')?.split(',') || ['http://localhost:5173'];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Global prefix
  const apiPrefix = configService.get<string>('API_PREFIX') || 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('MT5 Platform API')
    .setDescription('API documentation for MT5 SaaS Platform - Multi-tenant management system')
    .setVersion('1.0')
    .addBearerAuth()
    // 核心模块
    .addTag('auth', '认证接口 - 平台/租户管理员登录')
    .addTag('tenants', '租户管理 - CRUD、状态管理、白标配置')
    .addTag('instances', '中间件实例管理 - 创建、健康检查、配额')
    .addTag('platform-admins', '平台管理员管理')
    // Phase 5 新模块
    .addTag('subscriptions', '订阅计划管理 - 计划配置、升降级')
    .addTag('invoices', '账单管理 - 创建、支付、统计')
    .addTag('tenant-admins', '租户管理员管理 - CRUD、密码管理')
    .addTag('trading-data', '交易数据聚合 - REQ-8 平台级交易视图')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Start server
  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port);

  console.log(`🚀 MT5 Platform Service is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/docs`);
}

bootstrap();
