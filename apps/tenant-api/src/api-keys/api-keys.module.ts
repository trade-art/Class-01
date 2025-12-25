import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { WebhookService } from './services';

/**
 * API Key 管理模块
 * 提供 API Key 的 CRUD 操作和验证功能
 * 支持作用域限制、IP 白名单和使用统计
 */
@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<number>('middleware.webhookTimeout') || 5000,
        maxRedirects: 0, // Webhook 不跟随重定向
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    }),
  ],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, WebhookService],
  exports: [ApiKeysService, WebhookService],
})
export class ApiKeysModule {}
