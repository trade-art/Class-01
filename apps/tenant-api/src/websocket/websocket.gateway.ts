import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WebsocketService } from './websocket.service';
import { WebSocketBridgeService, WsChannelType } from './websocket-bridge.service';
import { SubscribeRequest, UnsubscribeRequest, WsEventType } from './dto';

/**
 * JWT Payload 接口
 */
interface JwtPayload {
  sub: string;
  tenantId: string;
  instanceId: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * WebSocket 网关
 * 处理 WebSocket 连接和消息
 */
@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class TenantWebsocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TenantWebsocketGateway.name);

  /**
   * 实例连接计数
   * Key: instanceId, Value: 连接的客户端数量
   */
  private instanceClientCount = new Map<string, number>();

  /**
   * 客户端实例映射
   * Key: socketId, Value: { instanceId, tenantId }
   */
  private clientInstanceMap = new Map<string, { instanceId: string; tenantId: string }>();

  constructor(
    private readonly websocketService: WebsocketService,
    private readonly webSocketBridge: WebSocketBridgeService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 初始化时设置服务器实例
   */
  afterInit(server: Server): void {
    this.websocketService.setServer(server);
    this.logger.log('WebSocket Gateway 初始化完成');
  }

  /**
   * 处理客户端连接
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      // 从 handshake 获取 token
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`客户端 ${client.id} 未提供 token`);
        client.emit('error', { message: '未提供认证 token' });
        client.disconnect();
        return;
      }

      // 验证 JWT
      const payload = await this.verifyToken(token);
      if (!payload) {
        this.logger.warn(`客户端 ${client.id} token 验证失败`);
        client.emit('error', { message: 'token 验证失败' });
        client.disconnect();
        return;
      }

      // 注册客户端
      this.websocketService.registerClient(
        client,
        payload.tenantId,
        payload.sub,
        payload.instanceId,
      );

      // 保存客户端-实例映射
      this.clientInstanceMap.set(client.id, {
        instanceId: payload.instanceId,
        tenantId: payload.tenantId,
      });

      // 更新实例连接计数
      const currentCount = this.instanceClientCount.get(payload.instanceId) || 0;
      this.instanceClientCount.set(payload.instanceId, currentCount + 1);

      // 如果是该实例的第一个客户端，连接到中间件 WebSocket
      if (currentCount === 0) {
        await this.connectToMiddlewareWebSocket(
          payload.instanceId,
          payload.tenantId,
        );
      }

      // 发送连接成功消息
      client.emit(WsEventType.CONNECTION_STATUS, {
        event: WsEventType.CONNECTION_STATUS,
        data: {
          connected: true,
          message: '连接成功',
        },
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `客户端已连接: ${client.id} (租户: ${payload.tenantId}, 实例: ${payload.instanceId})`,
      );
    } catch (error) {
      this.logger.error(`连接处理失败: ${error}`);
      client.emit('error', { message: '连接失败' });
      client.disconnect();
    }
  }

  /**
   * 处理客户端断开连接
   */
  handleDisconnect(client: Socket): void {
    // 获取客户端的实例信息
    const clientInfo = this.clientInstanceMap.get(client.id);

    if (clientInfo) {
      const { instanceId } = clientInfo;

      // 更新实例连接计数
      const currentCount = this.instanceClientCount.get(instanceId) || 0;
      const newCount = Math.max(0, currentCount - 1);

      if (newCount === 0) {
        // 最后一个客户端断开，断开与中间件的连接
        this.instanceClientCount.delete(instanceId);
        this.webSocketBridge.disconnectInstance(instanceId);
        this.logger.log(`实例 ${instanceId} 的所有客户端已断开，关闭中间件连接`);
      } else {
        this.instanceClientCount.set(instanceId, newCount);
      }

      // 清理映射
      this.clientInstanceMap.delete(client.id);
    }

    this.websocketService.unregisterClient(client.id);
    this.logger.log(`客户端已断开: ${client.id}`);
  }

  /**
   * 处理订阅请求
   */
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SubscribeRequest,
  ): Promise<void> {
    const clientInfo = this.websocketService.getClientInfo(client.id);
    if (!clientInfo) {
      client.emit('error', { message: '未认证的连接' });
      return;
    }

    const instanceInfo = this.clientInstanceMap.get(client.id);

    switch (data.channel) {
      case 'quotes':
        if (data.symbols && data.symbols.length > 0) {
          this.websocketService.subscribeSymbols(client.id, data.symbols);

          // 同时订阅中间件行情频道
          if (instanceInfo) {
            await this.webSocketBridge.subscribe(
              instanceInfo.instanceId,
              WsChannelType.MARKET,
              data.symbols,
            );
          }

          client.emit('subscribed', {
            channel: 'quotes',
            symbols: data.symbols,
          });
        }
        break;

      case 'positions':
        // 持仓更新通过租户房间广播，无需额外订阅
        client.emit('subscribed', { channel: 'positions' });
        break;

      case 'trades':
        // 交易更新通过租户房间广播，无需额外订阅
        client.emit('subscribed', { channel: 'trades' });
        break;

      case 'alerts':
        // 风控预警通过租户房间广播，无需额外订阅
        client.emit('subscribed', { channel: 'alerts' });
        break;

      default:
        client.emit('error', { message: `未知频道: ${data.channel}` });
    }

    this.logger.debug(
      `客户端 ${client.id} 订阅: ${data.channel} ${data.symbols?.join(', ') ?? ''}`,
    );
  }

  /**
   * 处理取消订阅请求
   */
  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UnsubscribeRequest,
  ): Promise<void> {
    const clientInfo = this.websocketService.getClientInfo(client.id);
    if (!clientInfo) {
      client.emit('error', { message: '未认证的连接' });
      return;
    }

    const instanceInfo = this.clientInstanceMap.get(client.id);

    if (data.channel === 'quotes' && data.symbols && data.symbols.length > 0) {
      this.websocketService.unsubscribeSymbols(client.id, data.symbols);

      // 同时从中间件取消订阅 (注意：可能需要更复杂的逻辑来检查是否还有其他客户端订阅)
      if (instanceInfo) {
        await this.webSocketBridge.unsubscribe(
          instanceInfo.instanceId,
          WsChannelType.MARKET,
          data.symbols,
        );
      }

      client.emit('unsubscribed', {
        channel: 'quotes',
        symbols: data.symbols,
      });
    } else {
      client.emit('unsubscribed', { channel: data.channel });
    }

    this.logger.debug(
      `客户端 ${client.id} 取消订阅: ${data.channel} ${data.symbols?.join(', ') ?? ''}`,
    );
  }

  /**
   * 处理 ping 消息 (心跳检测)
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket): void {
    client.emit('pong', { timestamp: new Date().toISOString() });
  }

  // ============================================
  // 私有方法
  // ============================================

  /**
   * 从 handshake 提取 token
   */
  private extractToken(client: Socket): string | null {
    // 尝试从 auth 对象获取
    const authToken = client.handshake.auth?.token;
    if (authToken) {
      return authToken;
    }

    // 尝试从 query 获取
    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string') {
      return queryToken;
    }

    // 尝试从 headers 获取
    const authHeader = client.handshake.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  /**
   * 验证 JWT token
   */
  private async verifyToken(token: string): Promise<JwtPayload | null> {
    try {
      const secret = this.configService.get<string>('jwt.secret');
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });
      return payload;
    } catch (error) {
      this.logger.warn(`JWT 验证失败: ${error}`);
      return null;
    }
  }

  /**
   * 连接到中间件 WebSocket
   * 当第一个客户端连接时自动建立
   */
  private async connectToMiddlewareWebSocket(
    instanceId: string,
    tenantId: string,
  ): Promise<void> {
    try {
      // 连接到行情频道
      await this.webSocketBridge.connect({
        instanceId,
        tenantId,
        channel: WsChannelType.MARKET,
      });

      // 连接到交易频道
      await this.webSocketBridge.connect({
        instanceId,
        tenantId,
        channel: WsChannelType.TRADING,
      });

      this.logger.log(
        `已建立到实例 ${instanceId} 的中间件 WebSocket 连接`,
      );
    } catch (error) {
      this.logger.error(
        `连接中间件 WebSocket 失败: ${instanceId}`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
