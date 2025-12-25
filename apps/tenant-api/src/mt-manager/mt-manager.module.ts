import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { MtManagerController } from './mt-manager.controller';
import { MtManagerApiKeyAuthController } from './mt-manager-api-key-auth.controller';
import { InternalController } from './internal.controller';
import { MtManagerService } from './mt-manager.service';
import { MtManagerApiKeyService } from './mt-manager-api-key.service';
import { MtManagerAccessTokenService } from './mt-manager-access-token.service';
import { MiddlewareNotifierService } from './middleware-notifier.service';
import { MiddlewareProxyModule } from '../middleware-proxy';
import { PrismaModule } from '../prisma/prisma.module';
import { SecurityModule } from '../security/security.module';
import { AuthModule } from '../auth/auth.module';

/**
 * MT 经理账号管理模块
 * 提供 MT 经理账号配置的 CRUD 操作、连接测试、外部 API Key 认证功能
 * 以及供 C++ 中间件调用的内部接口
 */
@Module({
  imports: [MiddlewareProxyModule, PrismaModule, ConfigModule, SecurityModule, HttpModule, AuthModule],
  controllers: [MtManagerController, MtManagerApiKeyAuthController, InternalController],
  providers: [MtManagerService, MtManagerApiKeyService, MtManagerAccessTokenService, MiddlewareNotifierService],
  exports: [MtManagerService, MtManagerApiKeyService, MtManagerAccessTokenService, MiddlewareNotifierService],
})
export class MtManagerModule {}
