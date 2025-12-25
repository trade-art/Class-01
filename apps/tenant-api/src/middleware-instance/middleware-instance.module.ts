import { Module } from '@nestjs/common';
import { MiddlewareInstanceController } from './middleware-instance.controller';
import { MiddlewareInstanceService } from './middleware-instance.service';
import { MiddlewareProxyModule } from '../middleware-proxy';

/**
 * 中间件实例模块
 * 提供分配给当前租户的中间件实例查询功能
 */
@Module({
  imports: [MiddlewareProxyModule],
  controllers: [MiddlewareInstanceController],
  providers: [MiddlewareInstanceService],
  exports: [MiddlewareInstanceService],
})
export class MiddlewareInstanceModule {}
