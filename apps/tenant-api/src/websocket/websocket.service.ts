import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  WsEventType,
  WsMessage,
  PositionUpdateData,
  QuoteUpdateData,
  TradeNewData,
  RiskAlertData,
  ConnectionStatusData,
} from './dto';

/**
 * 客户端连接信息
 */
interface ClientInfo {
  socket: Socket;
  tenantId: string;
  adminId: string;
  instanceId: string;
  subscribedSymbols: Set<string>;
  connectedAt: Date;
}

/**
 * WebSocket 服务
 * 管理客户端连接和消息广播
 */
@Injectable()
export class WebsocketService {
  private readonly logger = new Logger(WebsocketService.name);
  private server: Server | null = null;

  /**
   * 客户端连接映射
   * key: socket.id, value: ClientInfo
   */
  private clients = new Map<string, ClientInfo>();

  /**
   * 租户房间映射
   * key: tenantId, value: Set<socket.id>
   */
  private tenantRooms = new Map<string, Set<string>>();

  /**
   * 设置 Socket.IO 服务器实例
   */
  setServer(server: Server): void {
    this.server = server;
    this.logger.log('WebSocket 服务器已设置');
  }

  /**
   * 注册客户端连接
   */
  registerClient(
    socket: Socket,
    tenantId: string,
    adminId: string,
    instanceId: string,
  ): void {
    // 保存客户端信息
    this.clients.set(socket.id, {
      socket,
      tenantId,
      adminId,
      instanceId,
      subscribedSymbols: new Set(),
      connectedAt: new Date(),
    });

    // 加入租户房间
    socket.join(`tenant:${tenantId}`);

    // 维护租户房间映射
    if (!this.tenantRooms.has(tenantId)) {
      this.tenantRooms.set(tenantId, new Set());
    }
    this.tenantRooms.get(tenantId)!.add(socket.id);

    this.logger.log(
      `客户端已注册: ${socket.id} (租户: ${tenantId}, 管理员: ${adminId})`,
    );
  }

  /**
   * 注销客户端连接
   */
  unregisterClient(socketId: string): void {
    const client = this.clients.get(socketId);
    if (client) {
      // 从租户房间移除
      const tenantClients = this.tenantRooms.get(client.tenantId);
      if (tenantClients) {
        tenantClients.delete(socketId);
        if (tenantClients.size === 0) {
          this.tenantRooms.delete(client.tenantId);
        }
      }

      // 离开所有房间
      client.socket.leave(`tenant:${client.tenantId}`);
      client.subscribedSymbols.forEach((symbol) => {
        client.socket.leave(`symbol:${symbol}`);
      });

      // 删除客户端信息
      this.clients.delete(socketId);

      this.logger.log(`客户端已注销: ${socketId}`);
    }
  }

  /**
   * 订阅品种报价
   */
  subscribeSymbols(socketId: string, symbols: string[]): void {
    const client = this.clients.get(socketId);
    if (client) {
      symbols.forEach((symbol) => {
        client.socket.join(`symbol:${symbol}`);
        client.subscribedSymbols.add(symbol);
      });

      this.logger.debug(
        `客户端 ${socketId} 订阅品种: ${symbols.join(', ')}`,
      );
    }
  }

  /**
   * 取消订阅品种报价
   */
  unsubscribeSymbols(socketId: string, symbols: string[]): void {
    const client = this.clients.get(socketId);
    if (client) {
      symbols.forEach((symbol) => {
        client.socket.leave(`symbol:${symbol}`);
        client.subscribedSymbols.delete(symbol);
      });

      this.logger.debug(
        `客户端 ${socketId} 取消订阅品种: ${symbols.join(', ')}`,
      );
    }
  }

  /**
   * 获取客户端信息
   */
  getClientInfo(socketId: string): ClientInfo | undefined {
    return this.clients.get(socketId);
  }

  /**
   * 获取租户的所有连接客户端数
   */
  getTenantClientCount(tenantId: string): number {
    return this.tenantRooms.get(tenantId)?.size ?? 0;
  }

  /**
   * 获取总连接数
   */
  getTotalClientCount(): number {
    return this.clients.size;
  }

  // ============================================
  // 广播方法
  // ============================================

  /**
   * 向租户广播持仓更新
   */
  broadcastPositionUpdate(
    tenantId: string,
    data: PositionUpdateData,
  ): void {
    this.broadcastToTenant(tenantId, WsEventType.POSITION_UPDATE, data);
  }

  /**
   * 向租户广播新开仓
   */
  broadcastPositionOpen(
    tenantId: string,
    data: PositionUpdateData,
  ): void {
    this.broadcastToTenant(tenantId, WsEventType.POSITION_OPEN, data);
  }

  /**
   * 向租户广播平仓
   */
  broadcastPositionClose(
    tenantId: string,
    data: PositionUpdateData,
  ): void {
    this.broadcastToTenant(tenantId, WsEventType.POSITION_CLOSE, data);
  }

  /**
   * 向订阅者广播报价更新
   */
  broadcastQuoteUpdate(data: QuoteUpdateData): void {
    if (!this.server) return;

    const message = this.wrapMessage(WsEventType.QUOTE_UPDATE, data);
    this.server.to(`symbol:${data.symbol}`).emit(WsEventType.QUOTE_UPDATE, message);

    this.logger.debug(`广播报价更新: ${data.symbol}`);
  }

  /**
   * 向租户广播新成交
   */
  broadcastTradeNew(tenantId: string, data: TradeNewData): void {
    this.broadcastToTenant(tenantId, WsEventType.TRADE_NEW, data);
  }

  /**
   * 向租户广播风控预警
   */
  broadcastRiskAlert(tenantId: string, data: RiskAlertData): void {
    this.broadcastToTenant(tenantId, WsEventType.RISK_ALERT, data);
  }

  /**
   * 向租户广播系统通知
   */
  broadcastSystemNotification(
    tenantId: string,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    this.broadcastToTenant(tenantId, WsEventType.SYSTEM_NOTIFICATION, {
      message,
      ...data,
    });
  }

  /**
   * 向租户广播连接状态
   */
  broadcastConnectionStatus(
    tenantId: string,
    data: ConnectionStatusData,
  ): void {
    this.broadcastToTenant(tenantId, WsEventType.CONNECTION_STATUS, data);
  }

  /**
   * 向单个客户端发送消息
   */
  sendToClient<T>(socketId: string, event: WsEventType, data: T): void {
    const client = this.clients.get(socketId);
    if (client) {
      const message = this.wrapMessage(event, data);
      client.socket.emit(event, message);
    }
  }

  // ============================================
  // 私有方法
  // ============================================

  /**
   * 向租户广播消息
   */
  private broadcastToTenant<T>(
    tenantId: string,
    event: WsEventType,
    data: T,
  ): void {
    if (!this.server) return;

    const message = this.wrapMessage(event, data);
    this.server.to(`tenant:${tenantId}`).emit(event, message);

    this.logger.debug(`广播到租户 ${tenantId}: ${event}`);
  }

  /**
   * 包装消息
   */
  private wrapMessage<T>(event: WsEventType, data: T): WsMessage<T> {
    return {
      event,
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
