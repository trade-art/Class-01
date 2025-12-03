import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Services
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { MiddlewareClientService } from './services/middleware-client.service';
import { EventEmitterService } from './services/event-emitter.service';
import { HealthCheckerService } from './services/health-checker.service';
import { WebhookValidatorService } from './services/webhook-validator.service';
import { DataAggregatorService } from './services/data-aggregator.service';

// Controllers
import { WebhookController } from './controllers/webhook.controller';

// Prisma
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * 中间件集成模块
 * 提供与 MT5-Middleware 的集成功能
 *
 * 功能包括:
 * - 健康检查和监控
 * - 熔断器保护
 * - Webhook 事件处理
 * - 跨实例数据聚合
 *
 * middleware-integration Tasks 5-9
 */
@Module({
  imports: [
    PrismaModule,
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),
  ],
  controllers: [WebhookController],
  providers: [
    // 核心服务
    CircuitBreakerService,
    MiddlewareClientService,

    // 事件服务
    EventEmitterService,

    // 健康检查
    HealthCheckerService,

    // Webhook 处理
    WebhookValidatorService,

    // 数据聚合
    DataAggregatorService,
  ],
  exports: [
    CircuitBreakerService,
    MiddlewareClientService,
    EventEmitterService,
    HealthCheckerService,
    WebhookValidatorService,
    DataAggregatorService,
  ],
})
export class MiddlewareIntegrationModule {}
