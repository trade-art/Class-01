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

  constructor(
    private readonly websocketService: WebsocketService,
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
        `客户端已连接: ${client.id} (租户: ${payload.tenantId})`,
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
    this.websocketService.unregisterClient(client.id);
    this.logger.log(`客户端已断开: ${client.id}`);
  }

  /**
   * 处理订阅请求
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SubscribeRequest,
  ): void {
    const clientInfo = this.websocketService.getClientInfo(client.id);
    if (!clientInfo) {
      client.emit('error', { message: '未认证的连接' });
      return;
    }

    switch (data.channel) {
      case 'quotes':
        if (data.symbols && data.symbols.length > 0) {
          this.websocketService.subscribeSymbols(client.id, data.symbols);
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
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UnsubscribeRequest,
  ): void {
    const clientInfo = this.websocketService.getClientInfo(client.id);
    if (!clientInfo) {
      client.emit('error', { message: '未认证的连接' });
      return;
    }

    if (data.channel === 'quotes' && data.symbols && data.symbols.length > 0) {
      this.websocketService.unsubscribeSymbols(client.id, data.symbols);
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
}
