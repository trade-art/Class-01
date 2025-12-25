import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../common/common.module';
import { WsTicketController } from './ws-ticket.controller';
import { WsTicketService } from './ws-ticket.service';

/**
 * WebSocket Ticket 模块
 *
 * 提供 WS Ticket 签发功能，供第三方应用获取 WebSocket 连接凭证。
 *
 * 依赖:
 * - CommonModule: 提供 CacheService (Redis 操作)
 * - ConfigModule: 提供 ConfigService (读取环境变量)
 *
 * @requirements REQ-TA-2
 */
@Module({
  imports: [CommonModule, ConfigModule],
  controllers: [WsTicketController],
  providers: [WsTicketService],
  exports: [WsTicketService],
})
export class WsTicketModule {}
