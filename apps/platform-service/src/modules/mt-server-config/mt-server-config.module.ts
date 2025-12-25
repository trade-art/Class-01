import { Module } from '@nestjs/common';
import { MtServerConfigController } from './mt-server-config.controller';
import { MtServerConfigService } from './mt-server-config.service';

/**
 * MT 服务器配置模块
 * 由 SaaS 管理员管理租户的 MT5/MT4 服务器配置
 */
@Module({
  controllers: [MtServerConfigController],
  providers: [MtServerConfigService],
  exports: [MtServerConfigService],
})
export class MtServerConfigModule {}
