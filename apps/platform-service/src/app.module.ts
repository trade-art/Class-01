import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { InstancesModule } from './modules/instances/instances.module';
import { PlatformAdminsModule } from './modules/platform-admins/platform-admins.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { TenantAdminsModule } from './modules/tenant-admins/tenant-admins.module';
import { TradingDataModule } from './modules/trading-data/trading-data.module';
import { MiddlewareIntegrationModule } from './modules/middleware-integration/middleware-integration.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Common module (global filters, interceptors)
    CommonModule,

    // Database
    PrismaModule,

    // Feature modules
    AuthModule,
    TenantsModule,
    InstancesModule,
    PlatformAdminsModule,

    // Phase 5: 新模块 (REQ-5 ~ REQ-8)
    SubscriptionsModule,    // 订阅计划管理
    InvoicesModule,         // 账单管理
    TenantAdminsModule,     // 租户管理员管理
    TradingDataModule,      // 交易数据聚合 (REQ-8)

    // Phase 6: 中间件集成 (middleware-integration Tasks 5-9)
    MiddlewareIntegrationModule,  // 健康检查、熔断器、Webhook、数据聚合
  ],
})
export class AppModule {}
