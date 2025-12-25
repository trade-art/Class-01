import { Module } from '@nestjs/common';
import { MiddlewareConfigController } from './middleware-config.controller';
import { MiddlewareConfigService } from './middleware-config.service';

/**
 * 中间件配置模块
 * 提供中间件拉取配置和上报心跳的内部 API
 */
@Module({
  controllers: [MiddlewareConfigController],
  providers: [MiddlewareConfigService],
  exports: [MiddlewareConfigService],
})
export class MiddlewareConfigModule {}
