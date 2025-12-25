import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MiddlewareController } from './middleware.controller';
import { MiddlewareService } from './middleware.service';
import { HealthCheckService } from './services/health-check.service';
import { MiddlewareRuntimeConfigService } from './services/middleware-config.service';

/**
 * 中间件管理模块
 * 提供中间件的 CRUD 操作、健康监控、运行时配置和分配管理功能
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 3,
    }),
  ],
  controllers: [MiddlewareController],
  providers: [MiddlewareService, HealthCheckService, MiddlewareRuntimeConfigService],
  exports: [MiddlewareService, HealthCheckService, MiddlewareRuntimeConfigService],
})
export class MiddlewareModule {}
