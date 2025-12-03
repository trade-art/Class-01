import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TenantWebsocketGateway } from './websocket.gateway';
import { WebsocketService } from './websocket.service';

/**
 * WebSocket 模块
 * 提供实时数据推送功能
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [TenantWebsocketGateway, WebsocketService],
  exports: [WebsocketService],
})
export class WebsocketModule {}
