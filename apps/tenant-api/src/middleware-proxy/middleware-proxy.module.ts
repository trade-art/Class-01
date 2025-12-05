import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MiddlewareProxyService } from './middleware-proxy.service';
import { ResponseTransformer } from './transformers';
import { MiddlewareAuthService, MtServerService, TradingService } from './services';
import { AdapterFactory } from './adapters';

/**
 * 中间件代理模块
 * 提供与 MT5/MT4 中间件服务通信的能力
 * 包含认证管理、响应转换和多平台适配功能
 */
@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<number>('middleware.timeout'),
        maxRedirects: 3,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    }),
  ],
  providers: [
    ResponseTransformer,
    MiddlewareAuthService,
    MtServerService,
    TradingService,
    MiddlewareProxyService,
    AdapterFactory,
  ],
  exports: [
    ResponseTransformer,
    MiddlewareAuthService,
    MtServerService,
    TradingService,
    MiddlewareProxyService,
    AdapterFactory,
  ],
})
export class MiddlewareProxyModule {}
