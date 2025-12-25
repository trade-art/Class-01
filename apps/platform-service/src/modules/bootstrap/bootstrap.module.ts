import { Module } from '@nestjs/common';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommonModule } from '../../common/common.module';

/**
 * 中间件引导模块
 *
 * 提供中间件无配置文件启动所需的 API:
 * - 注册接口: 获取 API Key
 * - 配置接口: 获取完整启动配置
 * - 心跳接口: 状态上报和配置更新检测
 */
@Module({
  imports: [
    PrismaModule,
    CommonModule, // 提供 EncryptionService
  ],
  controllers: [BootstrapController],
  providers: [BootstrapService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
