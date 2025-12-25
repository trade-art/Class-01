import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { StructuredLoggerService, LogLevel } from '@mt5-platform/shared';
import { AppModule } from './app.module';
import { EnhancedValidationPipe, getEnvironmentHelmetConfig } from './security';

async function bootstrap() {
  // 创建应用级别日志记录器
  const appLogger = new StructuredLoggerService({
    serviceName: 'tenant-api',
    level: (process.env.LOG_LEVEL as LogLevel) || 'info',
    prettyPrint: process.env.NODE_ENV !== 'production',
  });

  const app = await NestFactory.create(AppModule, {
    logger: appLogger,
  });
  const configService = app.get(ConfigService);

  // 安全中间件（环境自适应配置）
  app.use(helmet(getEnvironmentHelmetConfig()));

  // Cookie 解析中间件
  app.use(cookieParser());

  // CORS 配置
  const corsOrigins = configService.get<string>('CORS_ORIGINS')?.split(',') || ['http://localhost:5174'];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // 全局前缀 - 使用 /tenant 前缀区分于 platform-service
  const apiPrefix = configService.get<string>('apiPrefix') || 'tenant';
  app.setGlobalPrefix(apiPrefix);

  // 全局验证管道（增强版）
  app.useGlobalPipes(new EnhancedValidationPipe());

  // Swagger API 文档
  const config = new DocumentBuilder()
    .setTitle('Tenant API')
    .setDescription('MT5 Tenant API Service - 租户管理控制台后端 API')
    .setVersion('1.0.0')
    .addBearerAuth()
    // 认证
    .addTag('auth', '认证接口 - 租户管理员登录/登出/密码管理')
    // 业务模块
    .addTag('dashboard', '仪表板 - 统计数据、趋势图')
    .addTag('users', '交易用户管理 - 查看/修改用户')
    .addTag('positions', '持仓监控 - 实时持仓数据')
    .addTag('quotes', '报价监控 - 实时行情/自选')
    .addTag('history', '交易历史 - 历史订单查询')
    .addTag('risk', '风控监控 - 预警/配置')
    .addTag('reports', '报表统计 - 交易/用户/财务报表')
    // 设置
    .addTag('settings-branding', '白标配置 - Logo/主题色')
    .addTag('settings-admins', '管理员管理 - CRUD')
    .addTag('settings-api-keys', 'API 密钥管理')
    .addTag('settings-notifications', '通知设置')
    .addTag('settings-mt5', 'MT5 服务器信息')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // 启动服务 - 使用配置文件中的 'port' 键或环境变量 PORT
  const port = configService.get<number>('port') || parseInt(process.env.PORT || '3200', 10);
  await app.listen(port);

  // 使用结构化日志记录启动信息
  appLogger.log(`Tenant API Service started`, {
    module: 'Bootstrap',
    port,
    environment: process.env.NODE_ENV || 'development',
    docsUrl: `http://localhost:${port}/docs`,
  });
}

bootstrap();
