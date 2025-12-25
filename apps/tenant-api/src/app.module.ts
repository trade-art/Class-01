import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  LoggerModule,
  HttpLoggingInterceptor,
  MetricsModule,
  MetricsController,
  HttpMetricsInterceptor,
  TracingModule,
  HttpTracingInterceptor,
} from '@mt5-platform/shared';
import { AuditModule } from './audit';
import { AuthModule } from './auth';
import { ExportModule } from './export';
import { CommonModule } from './common';
import { configuration, validationSchema, validationOptions } from './config';
import { DashboardModule } from './dashboard';
import { HealthModule } from './health';
import { HistoryModule } from './history';
import { MiddlewareProxyModule } from './middleware-proxy';
import { PositionsModule } from './positions';
import { PrismaModule } from './prisma/prisma.module';
import { QuotesModule } from './quotes';
import { ReportsModule } from './reports';
import { RiskModule } from './risk';
import { SecurityModule } from './security';
import { SettingsModule } from './settings';
import { TenantModule } from './tenant';
import { TradingModule } from './trading';
import { MtServerModule } from './mt-server';
import { MtManagerModule } from './mt-manager';
import { MiddlewareInstanceModule } from './middleware-instance';
import { UsersModule } from './users';
import { WebsocketModule } from './websocket';
import { ApiKeysModule } from './api-keys';
import { ExternalAuthModule } from './external-auth';
import { WsTicketModule } from './ws-ticket';

@Module({
  imports: [
    // 配置模块 (全局)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [configuration],
      validationSchema,
      validationOptions,
    }),

    // 日志模块 (全局)
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        serviceName: 'tenant-api',
        environment: configService.get('NODE_ENV') || 'development',
        level: configService.get('LOG_LEVEL') || 'info',
        prettyPrint: configService.get('NODE_ENV') !== 'production',
        redactPaths: ['password', 'token', 'authorization', 'cookie', 'apiKey'],
      }),
    }),

    // 指标模块 (全局)
    MetricsModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        serviceName: 'tenant-api',
        collectDefaultMetrics: true,
        defaultMetricsInterval: 10000,
        prefix: 'mt5_tenant_',
        defaultLabels: {
          service: 'tenant-api',
          environment: configService.get('NODE_ENV') || 'development',
        },
      }),
    }),

    // 追踪模块 (全局)
    TracingModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        serviceName: 'tenant-api',
        serviceVersion: '1.0.0',
        environment: configService.get('NODE_ENV') || 'development',
        otlpEndpoint: configService.get('OTLP_ENDPOINT') || 'http://localhost:4318',
        samplingRatio: configService.get('NODE_ENV') === 'production' ? 0.1 : 1.0,
        consoleExport: configService.get('NODE_ENV') !== 'production',
        enabled: configService.get('TRACING_ENABLED') !== 'false',
      }),
    }),

    // 公共模块 (全局异常过滤器和响应拦截器)
    CommonModule,

    // Prisma 数据库模块
    PrismaModule,

    // 安全模块 (Cookie、加密等)
    SecurityModule,

    // 中间件代理模块 (全局)
    MiddlewareProxyModule,

    // 认证模块 (包含全局 Guards)
    AuthModule,

    // Dashboard 模块
    DashboardModule,

    // 用户管理模块
    UsersModule,

    // 持仓监控模块
    PositionsModule,

    // 报价监控模块
    QuotesModule,

    // 交易历史模块
    HistoryModule,

    // 风控监控模块
    RiskModule,

    // 报表模块
    ReportsModule,

    // 设置模块
    SettingsModule,

    // 租户识别模块
    TenantModule,

    // MT 服务器管理模块
    MtServerModule,

    // MT 经理账号管理模块
    MtManagerModule,

    // 中间件实例查询模块
    MiddlewareInstanceModule,

    // 统一交易 API 模块
    TradingModule,

    // WebSocket 实时通信模块
    WebsocketModule,

    // 健康监控模块
    HealthModule,

    // 审计日志模块
    AuditModule,

    // 数据导出模块
    ExportModule,

    // API Key 管理模块
    ApiKeysModule,

    // 外部应用认证模块
    ExternalAuthModule,

    // WebSocket Ticket 签发模块
    WsTicketModule,
  ],
  controllers: [
    // 指标端点控制器
    MetricsController,
  ],
  providers: [
    // 全局 HTTP 追踪拦截器（最先执行）
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpTracingInterceptor,
    },
    // 全局 HTTP 日志拦截器
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    // 全局 HTTP 指标拦截器
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class AppModule {}
