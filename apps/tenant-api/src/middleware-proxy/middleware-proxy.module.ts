import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MiddlewareProxyService } from './middleware-proxy.service';

/**
 * 中间件代理模块
 * 提供与 MT5 中间件服务通信的能力
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
  providers: [MiddlewareProxyService],
  exports: [MiddlewareProxyService],
})
export class MiddlewareProxyModule {}
