import { Module } from '@nestjs/common';
import { MtServerController } from './mt-server.controller';
import { MiddlewareProxyModule } from '../middleware-proxy';

/**
 * MT 服务器管理模块
 * 提供 MT 服务器配置的 CRUD 操作和连接测试功能
 */
@Module({
  imports: [MiddlewareProxyModule],
  controllers: [MtServerController],
})
export class MtServerModule {}
