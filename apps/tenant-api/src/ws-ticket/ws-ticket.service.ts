import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { RequestContext } from '../auth/interfaces/request-context.interface';
import { WsTicketResponseDto, WsTicketData } from './dto/ws-ticket.dto';

/**
 * WebSocket Ticket 服务
 *
 * 负责生成一次性 WS Ticket 并存储到 Redis，供 C++ 中间件验证使用。
 * Ticket 只能使用一次，有效期 30 秒。
 *
 * 注意：此服务使用独立的 Redis 连接（db 0，无前缀），
 * 以便与 C++ 中间件共享 Ticket 数据。
 *
 * @requirements REQ-TA-2, REQ-TA-4
 */
@Injectable()
export class WsTicketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WsTicketService.name);
  private redis: Redis | null = null;
  private connected = false;

  /** Ticket TTL (秒) */
  private readonly TICKET_TTL = 30;

  /** Redis Key 前缀 */
  private readonly TICKET_KEY_PREFIX = 'ws:ticket:';

  /** Scope 到 Channel 的映射 */
  private readonly SCOPE_CHANNEL_MAP: Record<string, string> = {
    'quotes:read': 'quotes',
    'positions:read': 'positions',
    'orders:read': 'orders',
  };

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.initRedis();
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  /**
   * 初始化 Redis 连接
   * 使用独立连接，db 0，无前缀，与 C++ 中间件共享
   */
  private async initRedis(): Promise<void> {
    try {
      const redisHost =
        this.configService.get<string>('redis.host') || 'localhost';
      const redisPort = this.configService.get<number>('redis.port') || 6379;
      const redisPassword = this.configService.get<string>('redis.password');

      this.redis = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword || undefined,
        db: 0, // 使用 db 0，与中间件一致
        // 无 keyPrefix，直接使用 ws:ticket: 前缀
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn(
              'WS Ticket Redis connection failed after 3 attempts',
            );
            this.connected = false;
            return null;
          }
          return Math.min(times * 100, 3000);
        },
        lazyConnect: false,
      });

      this.redis.on('connect', () => {
        this.connected = true;
        this.logger.log(
          `WS Ticket Redis connected: ${redisHost}:${redisPort} db=0`,
        );
      });

      this.redis.on('error', (error) => {
        this.connected = false;
        this.logger.warn(`WS Ticket Redis error: ${error.message}`);
      });

      this.redis.on('close', () => {
        this.connected = false;
        this.logger.warn('WS Ticket Redis connection closed');
      });

      // 测试连接
      await this.redis.ping();
      this.connected = true;
    } catch (error) {
      this.logger.warn(`Failed to initialize WS Ticket Redis: ${error}`);
      this.redis = null;
      this.connected = false;
    }
  }

  /**
   * 检查 Redis 是否可用
   */
  isRedisAvailable(): boolean {
    return this.connected && this.redis !== null;
  }

  /**
   * 生成 WebSocket Ticket
   *
   * @param context 请求上下文 (包含 tenantId, managerId, apiKeyId, serverId, scopes)
   * @returns WS Ticket 响应
   * @throws ServiceUnavailableException 当 Redis 不可用时
   *
   * @requirements REQ-TA-1, REQ-TA-2
   */
  async generateTicket(
    context: RequestContext,
    scopes: string[],
  ): Promise<WsTicketResponseDto> {
    // 1. 生成安全的随机 Ticket (32 bytes → 64 hex)
    const ticket = this.generateSecureTicket();

    // 2. 计算可用频道
    const channels = this.calculateChannels(scopes);

    // 3. 准备存储数据
    const ticketData: WsTicketData = {
      tenantId: context.tenantId,
      managerId: context.managerId || '',
      apiKeyId: context.apiKeyId || '',
      serverId: context.serverId,
      scopes,
      channels,
      createdAt: Date.now(),
    };

    // 4. 存储到 Redis
    const stored = await this.storeTicket(ticket, ticketData);
    if (!stored) {
      this.logger.error('Failed to store WS Ticket to Redis');
      throw new ServiceUnavailableException(
        'Unable to generate WebSocket ticket. Please try again later.',
      );
    }

    // 5. 获取 WebSocket 端点
    const endpoint = this.getWebSocketEndpoint();

    this.logger.log(
      `Generated WS Ticket: tenant=${context.tenantId}, manager=${context.managerId}, channels=${channels.join(',')}`,
    );

    return {
      ticket,
      endpoint,
      expiresIn: this.TICKET_TTL,
      channels,
    };
  }

  /**
   * 生成安全的随机 Ticket
   *
   * 使用 crypto.randomBytes 生成 32 字节随机数，转换为 64 字符 hex 字符串。
   *
   * @returns 64 字符 hex 字符串
   *
   * @requirements NFR-SEC-1
   */
  private generateSecureTicket(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * 根据 scopes 计算可用频道
   *
   * 映射规则:
   * - `quotes:read` → `quotes` 频道
   * - `positions:read` → `positions` 频道
   * - `orders:read` → `orders` 频道
   * - `*` → 所有频道
   *
   * @param scopes API Key 的权限范围
   * @returns 可订阅的频道列表
   *
   * @requirements REQ-TA-2
   */
  calculateChannels(scopes: string[]): string[] {
    const channels: Set<string> = new Set();

    // 检查是否有通配符权限
    if (scopes.includes('*')) {
      return Object.values(this.SCOPE_CHANNEL_MAP);
    }

    // 遍历 scopes，添加对应的频道
    for (const scope of scopes) {
      // 直接匹配
      if (this.SCOPE_CHANNEL_MAP[scope]) {
        channels.add(this.SCOPE_CHANNEL_MAP[scope]);
        continue;
      }

      // 检查 :write 权限是否包含 :read 权限
      // 例如 positions:write 也应该能订阅 positions 频道
      const writeScope = scope.replace(':write', ':read');
      if (this.SCOPE_CHANNEL_MAP[writeScope]) {
        channels.add(this.SCOPE_CHANNEL_MAP[writeScope]);
      }
    }

    return Array.from(channels);
  }

  /**
   * 存储 Ticket 到 Redis
   *
   * 使用独立 Redis 连接，直接存储到 db 0，无前缀。
   * 与 C++ 中间件共享同一个 Redis 数据库和 key 格式。
   *
   * @param ticket Ticket ID
   * @param data Ticket 数据
   * @returns 是否存储成功
   *
   * @requirements REQ-TA-4
   */
  private async storeTicket(
    ticket: string,
    data: WsTicketData,
  ): Promise<boolean> {
    const key = `${this.TICKET_KEY_PREFIX}${ticket}`;

    try {
      // 检查 Redis 是否可用
      if (!this.isRedisAvailable()) {
        this.logger.warn('Redis is not available for WS Ticket storage');
        return false;
      }

      // 存储 Ticket 数据，设置 TTL (使用 EX 选项设置秒级过期时间)
      const result = await this.redis!.set(
        key,
        JSON.stringify(data),
        'EX',
        this.TICKET_TTL,
      );

      const success = result === 'OK';

      if (success) {
        this.logger.debug(
          `Stored WS Ticket: ${ticket.substring(0, 8)}..., TTL=${this.TICKET_TTL}s, key=${key}`,
        );
      }

      return success;
    } catch (error) {
      this.logger.error(`Failed to store WS Ticket: ${error}`);
      return false;
    }
  }

  /**
   * 获取 WebSocket 端点地址
   *
   * 从环境变量 MIDDLEWARE_WS_ENDPOINT 读取，默认为 wss://localhost:8443
   *
   * @returns WebSocket 端点 URL
   *
   * @requirements REQ-TA-3
   */
  private getWebSocketEndpoint(): string {
    return (
      this.configService.get<string>('middleware.wsEndpoint') ||
      this.configService.get<string>('MIDDLEWARE_WS_ENDPOINT') ||
      'wss://localhost:8443'
    );
  }
}
