import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { InstancesModule } from './modules/instances/instances.module';
import { PlatformAdminsModule } from './modules/platform-admins/platform-admins.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { TenantAdminsModule } from './modules/tenant-admins/tenant-admins.module';
import { TradingDataModule } from './modules/trading-data/trading-data.module';
import { MiddlewareIntegrationModule } from './modules/middleware-integration/middleware-integration.module';
import { MiddlewareModule } from './modules/middleware/middleware.module';
// TODO: 需要重构以适配 MtManager 分离后的新 schema
// import { MtServerConfigModule } from './modules/mt-server-config/mt-server-config.module';
import { MiddlewareAssignmentModule } from './modules/middleware-assignment/middleware-assignment.module';
import { BootstrapModule } from './modules/bootstrap/bootstrap.module';
// TODO: 需要重构以适配 MtManager 分离后的新 schema
// import { MiddlewareConfigModule } from './modules/middleware-config/middleware-config.module';

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

    // Health check (for Docker/K8s probes)
    HealthModule,

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

    // Phase 7: SaaS 中间件管理 (saas-middleware-management)
    MiddlewareModule,             // 中间件 CRUD、健康监控
    // MtServerConfigModule,      // TODO: 需要重构以适配 MtManager 分离后的新 schema
    MiddlewareAssignmentModule,   // 中间件分配管理
    // MiddlewareConfigModule,    // TODO: 需要重构以适配 MtManager 分离后的新 schema

    // Phase 8: 中间件引导 (无配置文件启动)
    BootstrapModule,              // 中间件注册、配置拉取、心跳
  ],
})
export class AppModule {}
