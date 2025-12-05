import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth';
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
import { SettingsModule } from './settings';
import { TenantModule } from './tenant';
import { TradingModule } from './trading';
import { UsersModule } from './users';
import { WebsocketModule } from './websocket';

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

    // 公共模块 (全局异常过滤器和响应拦截器)
    CommonModule,

    // Prisma 数据库模块
    PrismaModule,

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

    // 统一交易 API 模块
    TradingModule,

    // WebSocket 实时通信模块
    WebsocketModule,

    // 健康监控模块
    HealthModule,
  ],
})
export class AppModule {}
