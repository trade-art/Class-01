import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { MiddlewareAuthService } from '../middleware-proxy/services/middleware-auth.service';
import { WebsocketService } from './websocket.service';
import {
  WsEventType,
  PositionUpdateData,
  QuoteUpdateData,
  TradeNewData,
  ConnectionStatusData,
} from './dto';

/**
 * WebSocket 频道类型
 */
export enum WsChannelType {
  MARKET = 'market',
  TRADING = 'trading',
}

/**
 * 中间件 WebSocket 消息格式
 */
interface MiddlewareWsMessage {
  type: string;
  data: unknown;
  timestamp?: number;
}

/**
 * 连接状态
 */
interface ConnectionState {
  ws: WebSocket | null;
  connected: boolean;
  reconnectAttempts: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  subscriptions: Set<string>;
}

/**
 * 连接配置
 */
interface ConnectionConfig {
  instanceId: string;
  tenantId: string;
  channel: WsChannelType;
}

/**
 * WebSocket 桥接服务
 * 连接 MT5-middleware WebSocket 并转发消息到客户端
 */
@Injectable()
export class WebSocketBridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebSocketBridgeService.name);

  /**
   * 连接状态映射
   * Key: `${instanceId}:${channel}`
   */
  private connections = new Map<string, ConnectionState>();

  /**
   * 实例到租户的映射
   * Key: instanceId, Value: tenantId
   */
  private instanceTenantMap = new Map<string, string>();

  /**
   * 重连配置
   */
  private readonly reconnectConfig = {
    baseDelay: 5000, // 5 秒
    maxDelay: 60000, // 最大 60 秒
    maxAttempts: 10,
    backoffMultiplier: 2,
  };

  /**
   * 中间件 WebSocket 基础 URL
   */
  private readonly wsBaseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly middlewareAuth: MiddlewareAuthService,
    private readonly websocketService: WebsocketService,
  ) {
    // 从 HTTP URL 转换为 WebSocket URL
    const httpUrl = this.configService.get<string>('middleware.baseUrl')!;
    this.wsBaseUrl = httpUrl.replace(/^http/, 'ws');
  }

  onModuleInit() {
    this.logger.log('WebSocket 桥接服务已初始化');
  }

  onModuleDestroy() {
    this.disconnectAll();
  }

  /**
   * 连接到中间件 WebSocket
   *
   * @param config 连接配置
   */
  async connect(config: ConnectionConfig): Promise<void> {
    const { instanceId, tenantId, channel } = config;
    const key = this.getConnectionKey(instanceId, channel);

    // 检查是否已连接
    const existing = this.connections.get(key);
    if (existing?.connected) {
      this.logger.debug(`已存在连接: ${key}`);
      return;
    }

    // 保存实例-租户映射
    this.instanceTenantMap.set(instanceId, tenantId);

    // 初始化连接状态
    const state: ConnectionState = {
      ws: null,
      connected: false,
      reconnectAttempts: 0,
      subscriptions: existing?.subscriptions || new Set(),
    };
    this.connections.set(key, state);

    // 建立连接
    await this.createConnection(instanceId, channel, state);
  }

  /**
   * 断开指定连接
   *
   * @param instanceId 实例 ID
   * @param channel 频道类型
   */
  disconnect(instanceId: string, channel: WsChannelType): void {
    const key = this.getConnectionKey(instanceId, channel);
    const state = this.connections.get(key);

    if (state) {
      this.cleanupConnection(state);
      this.connections.delete(key);
      this.logger.log(`已断开连接: ${key}`);
    }
  }

  /**
   * 断开实例的所有连接
   *
   * @param instanceId 实例 ID
   */
  disconnectInstance(instanceId: string): void {
    for (const channel of Object.values(WsChannelType)) {
      this.disconnect(instanceId, channel);
    }
    this.instanceTenantMap.delete(instanceId);
  }

  /**
   * 断开所有连接
   */
  disconnectAll(): void {
    for (const [key, state] of this.connections.entries()) {
      this.cleanupConnection(state);
      this.logger.debug(`清理连接: ${key}`);
    }
    this.connections.clear();
    this.instanceTenantMap.clear();
    this.logger.log('所有 WebSocket 连接已断开');
  }

  /**
   * 订阅频道/品种
   *
   * @param instanceId 实例 ID
   * @param channel 频道类型
   * @param symbols 品种列表 (仅 market 频道需要)
   */
  async subscribe(
    instanceId: string,
    channel: WsChannelType,
    symbols?: string[],
  ): Promise<void> {
    const key = this.getConnectionKey(instanceId, channel);
    const state = this.connections.get(key);

    if (!state || !state.connected || !state.ws) {
      this.logger.warn(`无法订阅，连接不存在或未就绪: ${key}`);
      return;
    }

    // 构造订阅消息
    const subscribeMsg = {
      action: 'subscribe',
      channel,
      symbols: symbols || [],
    };

    // 发送订阅消息
    state.ws.send(JSON.stringify(subscribeMsg));

    // 记录订阅
    if (symbols) {
      symbols.forEach((s) => state.subscriptions.add(s));
    } else {
      state.subscriptions.add(channel);
    }

    this.logger.debug(
      `订阅: ${key}, symbols: ${symbols?.join(',') || 'all'}`,
    );
  }

  /**
   * 取消订阅
   *
   * @param instanceId 实例 ID
   * @param channel 频道类型
   * @param symbols 品种列表 (仅 market 频道需要)
   */
  async unsubscribe(
    instanceId: string,
    channel: WsChannelType,
    symbols?: string[],
  ): Promise<void> {
    const key = this.getConnectionKey(instanceId, channel);
    const state = this.connections.get(key);

    if (!state || !state.connected || !state.ws) {
      return;
    }

    // 构造取消订阅消息
    const unsubscribeMsg = {
      action: 'unsubscribe',
      channel,
      symbols: symbols || [],
    };

    // 发送取消订阅消息
    state.ws.send(JSON.stringify(unsubscribeMsg));

    // 移除订阅记录
    if (symbols) {
      symbols.forEach((s) => state.subscriptions.delete(s));
    } else {
      state.subscriptions.delete(channel);
    }

    this.logger.debug(
      `取消订阅: ${key}, symbols: ${symbols?.join(',') || 'all'}`,
    );
  }

  /**
   * 检查连接状态
   *
   * @param instanceId 实例 ID
   * @param channel 频道类型
   * @returns 是否已连接
   */
  isConnected(instanceId: string, channel: WsChannelType): boolean {
    const key = this.getConnectionKey(instanceId, channel);
    const state = this.connections.get(key);
    return state?.connected ?? false;
  }

  /**
   * 获取连接统计
   */
  getConnectionStats(): {
    total: number;
    connected: number;
    channels: { market: number; trading: number };
  } {
    let connected = 0;
    const channels = { market: 0, trading: 0 };

    for (const [key, state] of this.connections.entries()) {
      if (state.connected) {
        connected++;
        if (key.endsWith(`:${WsChannelType.MARKET}`)) {
          channels.market++;
        } else {
          channels.trading++;
        }
      }
    }

    return {
      total: this.connections.size,
      connected,
      channels,
    };
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 获取连接键
   */
  private getConnectionKey(
    instanceId: string,
    channel: WsChannelType,
  ): string {
    return `${instanceId}:${channel}`;
  }

  /**
   * 创建 WebSocket 连接
   */
  private async createConnection(
    instanceId: string,
    channel: WsChannelType,
    state: ConnectionState,
  ): Promise<void> {
    try {
      // 获取 JWT token
      const token = await this.middlewareAuth.getAccessToken(instanceId);

      // 构建 WebSocket URL
      const wsPath = channel === WsChannelType.MARKET ? '/ws/market' : '/ws/trading';
      const wsUrl = `${this.wsBaseUrl}${wsPath}?token=${encodeURIComponent(token)}`;

      // 创建 WebSocket 连接
      const ws = new WebSocket(wsUrl, {
        headers: {
          'X-Instance-ID': instanceId,
        },
      });

      state.ws = ws;

      // 设置事件处理器
      ws.on('open', () => this.handleOpen(instanceId, channel, state));
      ws.on('message', (data) => this.handleMessage(instanceId, channel, data));
      ws.on('close', (code, reason) =>
        this.handleClose(instanceId, channel, state, code, reason.toString()),
      );
      ws.on('error', (error) =>
        this.handleError(instanceId, channel, state, error),
      );
      ws.on('ping', () => ws.pong());

      this.logger.debug(`正在连接: ${instanceId}:${channel}`);
    } catch (error) {
      this.logger.error(
        `创建连接失败: ${instanceId}:${channel}`,
        error instanceof Error ? error.message : error,
      );
      this.scheduleReconnect(instanceId, channel, state);
    }
  }

  /**
   * 处理连接打开
   */
  private handleOpen(
    instanceId: string,
    channel: WsChannelType,
    state: ConnectionState,
  ): void {
    state.connected = true;
    state.reconnectAttempts = 0;

    this.logger.log(`WebSocket 已连接: ${instanceId}:${channel}`);

    // 通知客户端连接状态
    const tenantId = this.instanceTenantMap.get(instanceId);
    if (tenantId) {
      const statusData: ConnectionStatusData = {
        connected: true,
        serverName: `middleware-${channel}`,
        message: `已连接到中间件 ${channel} 频道`,
      };
      this.websocketService.broadcastConnectionStatus(tenantId, statusData);
    }

    // 重新订阅之前的订阅
    if (state.subscriptions.size > 0) {
      const symbols = Array.from(state.subscriptions);
      this.subscribe(instanceId, channel, symbols).catch((err) => {
        this.logger.warn(`重新订阅失败: ${err.message}`);
      });
    }
  }

  /**
   * 处理接收消息
   */
  private handleMessage(
    instanceId: string,
    channel: WsChannelType,
    data: WebSocket.Data,
  ): void {
    try {
      const message = JSON.parse(data.toString()) as MiddlewareWsMessage;
      const tenantId = this.instanceTenantMap.get(instanceId);

      if (!tenantId) {
        this.logger.warn(`未找到实例对应的租户: ${instanceId}`);
        return;
      }

      // 根据消息类型转发
      this.forwardMessage(tenantId, channel, message);
    } catch (error) {
      this.logger.error(
        `解析消息失败: ${instanceId}:${channel}`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * 转发消息到客户端
   */
  private forwardMessage(
    tenantId: string,
    channel: WsChannelType,
    message: MiddlewareWsMessage,
  ): void {
    const { type, data } = message;

    if (channel === WsChannelType.MARKET) {
      // 行情频道消息
      switch (type) {
        case 'quote':
        case 'tick':
          this.websocketService.broadcastQuoteUpdate(
            data as QuoteUpdateData,
          );
          break;
        default:
          this.logger.debug(`未处理的行情消息类型: ${type}`);
      }
    } else {
      // 交易频道消息
      switch (type) {
        case 'position_update':
        case 'position':
          this.websocketService.broadcastPositionUpdate(
            tenantId,
            data as PositionUpdateData,
          );
          break;
        case 'position_open':
          this.websocketService.broadcastPositionOpen(
            tenantId,
            data as PositionUpdateData,
          );
          break;
        case 'position_close':
          this.websocketService.broadcastPositionClose(
            tenantId,
            data as PositionUpdateData,
          );
          break;
        case 'trade':
        case 'deal':
          this.websocketService.broadcastTradeNew(
            tenantId,
            data as TradeNewData,
          );
          break;
        default:
          this.logger.debug(`未处理的交易消息类型: ${type}`);
      }
    }
  }

  /**
   * 处理连接关闭
   */
  private handleClose(
    instanceId: string,
    channel: WsChannelType,
    state: ConnectionState,
    code: number,
    reason: string,
  ): void {
    state.connected = false;
    this.logger.warn(
      `WebSocket 已关闭: ${instanceId}:${channel}, code=${code}, reason=${reason}`,
    );

    // 通知客户端连接状态
    const tenantId = this.instanceTenantMap.get(instanceId);
    if (tenantId) {
      const statusData: ConnectionStatusData = {
        connected: false,
        serverName: `middleware-${channel}`,
        message: `与中间件 ${channel} 频道断开连接`,
      };
      this.websocketService.broadcastConnectionStatus(tenantId, statusData);
    }

    // 如果不是正常关闭，尝试重连
    if (code !== 1000) {
      this.scheduleReconnect(instanceId, channel, state);
    }
  }

  /**
   * 处理连接错误
   */
  private handleError(
    instanceId: string,
    channel: WsChannelType,
    state: ConnectionState,
    error: Error,
  ): void {
    this.logger.error(
      `WebSocket 错误: ${instanceId}:${channel}`,
      error.message,
    );
    // 错误后会触发 close 事件，在 close 处理中进行重连
  }

  /**
   * 调度重连
   */
  private scheduleReconnect(
    instanceId: string,
    channel: WsChannelType,
    state: ConnectionState,
  ): void {
    // 清除现有的重连定时器
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
    }

    // 检查重连次数
    if (state.reconnectAttempts >= this.reconnectConfig.maxAttempts) {
      this.logger.error(
        `重连次数超过上限: ${instanceId}:${channel}, 放弃重连`,
      );

      // 通知客户端连接失败
      const tenantId = this.instanceTenantMap.get(instanceId);
      if (tenantId) {
        const statusData: ConnectionStatusData = {
          connected: false,
          serverName: `middleware-${channel}`,
          message: `与中间件 ${channel} 频道连接失败，已达最大重试次数`,
        };
        this.websocketService.broadcastConnectionStatus(tenantId, statusData);
      }
      return;
    }

    // 计算延迟时间 (指数退避)
    const delay = Math.min(
      this.reconnectConfig.baseDelay *
        Math.pow(this.reconnectConfig.backoffMultiplier, state.reconnectAttempts),
      this.reconnectConfig.maxDelay,
    );

    state.reconnectAttempts++;

    this.logger.log(
      `将在 ${delay / 1000} 秒后重连: ${instanceId}:${channel} (第 ${state.reconnectAttempts} 次)`,
    );

    // 设置重连定时器
    state.reconnectTimer = setTimeout(() => {
      this.createConnection(instanceId, channel, state).catch((err) => {
        this.logger.error(`重连失败: ${err.message}`);
      });
    }, delay);
  }

  /**
   * 清理连接
   */
  private cleanupConnection(state: ConnectionState): void {
    // 清除重连定时器
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = undefined;
    }

    // 关闭 WebSocket
    if (state.ws) {
      try {
        state.ws.removeAllListeners();
        if (
          state.ws.readyState === WebSocket.OPEN ||
          state.ws.readyState === WebSocket.CONNECTING
        ) {
          state.ws.close(1000, 'Service shutdown');
        }
      } catch {
        // 忽略关闭错误
      }
      state.ws = null;
    }

    state.connected = false;
    state.subscriptions.clear();
  }
}
