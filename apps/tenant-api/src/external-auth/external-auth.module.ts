import { Module } from '@nestjs/common';
import { ExternalAuthController } from './external-auth.controller';
import { ExternalTradingController } from './external-trading.controller';
import { ApiKeyAuthGuard } from './guards';
import { ApiKeyAuthGuard as FullApiKeyAuthGuard, ScopesGuard } from '../auth/guards';
import { MtManagerModule } from '../mt-manager';
import { SecurityModule } from '../security';
import { MiddlewareProxyModule } from '../middleware-proxy';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * 外部应用认证模块
 * 提供 API Key + Secret 认证机制供第三方应用使用
 *
 * 包含:
 * - 认证控制器: API Key 认证和 Token 刷新
 * - 交易控制器: 用户、持仓、订单、成交、报价等查询
 */
@Module({
  imports: [
    MtManagerModule,
    SecurityModule,
    MiddlewareProxyModule, // 提供 TradingService
    PrismaModule, // FullApiKeyAuthGuard 需要
  ],
  controllers: [ExternalAuthController, ExternalTradingController],
  providers: [
    ApiKeyAuthGuard,
    FullApiKeyAuthGuard, // 完整版 Guard，从数据库获取完整上下文
    ScopesGuard, // 作用域权限守卫
  ],
  exports: [ApiKeyAuthGuard, FullApiKeyAuthGuard, ScopesGuard],
})
export class ExternalAuthModule {}
