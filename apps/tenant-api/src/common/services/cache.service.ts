/**
 * Redis 缓存服务
 * 提供通用的缓存功能，用于优化 API 响应速度
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * 缓存配置接口
 */
export interface CacheConfig {
  /** 缓存 TTL（秒） */
  ttl: number;
  /** 键前缀 */
  prefix?: string;
}

/**
 * 缓存 TTL 常量（秒）
 */
export const CacheTTL = {
  /** 报价数据 - 5秒 */
  QUOTES: 5,
  /** 持仓数据 - 10秒 */
  POSITIONS: 10,
  /** Dashboard 数据 - 60秒 */
  DASHBOARD: 60,
  /** 报表数据 - 60秒 */
  REPORTS: 60,
  /** 账户数据 - 60秒 */
  ACCOUNTS: 60,
  /** 品种列表 - 5分钟 */
  SYMBOLS: 300,
  /** 系统状态 - 10秒 */
  SYSTEM_STATUS: 10,
  /** 用户列表 - 30秒 */
  USERS: 30,
  /** 交易历史 - 60秒 */
  HISTORY: 60,
} as const;

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private readonly keyPrefix: string = 'tenant_cache:';
  private connected = false;

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
   */
  private async initRedis(): Promise<void> {
    try {
      const redisHost = this.configService.get<string>('redis.host') || 'localhost';
      const redisPort = this.configService.get<number>('redis.port') || 6379;
      const redisPassword = this.configService.get<string>('redis.password');
      const redisDb = this.configService.get<number>('redis.db') || 1;

      this.redis = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword || undefined,
        db: redisDb,
        keyPrefix: this.keyPrefix,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn('Redis connection failed after 3 attempts, cache disabled');
            this.connected = false;
            return null;
          }
          return Math.min(times * 100, 3000);
        },
        lazyConnect: false,
      });

      this.redis.on('connect', () => {
        this.connected = true;
        this.logger.log(`Redis connected: ${redisHost}:${redisPort} db=${redisDb}`);
      });

      this.redis.on('error', (error) => {
        this.connected = false;
        this.logger.warn(`Redis error: ${error.message}`);
      });

      this.redis.on('close', () => {
        this.connected = false;
        this.logger.warn('Redis connection closed');
      });

      // 测试连接
      await this.redis.ping();
      this.connected = true;
    } catch (error) {
      this.logger.warn(`Failed to initialize Redis: ${error}`);
      this.redis = null;
      this.connected = false;
    }
  }

  /**
   * 检查缓存是否可用
   */
  isAvailable(): boolean {
    return this.connected && this.redis !== null;
  }

  /**
   * 获取缓存数据
   * @param key 缓存键
   * @returns 缓存的数据或 null
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const data = await this.redis!.get(key);
      if (data) {
        return JSON.parse(data) as T;
      }
      return null;
    } catch (error) {
      this.logger.warn(`Cache get error for key ${key}: ${error}`);
      return null;
    }
  }

  /**
   * 设置缓存数据
   * @param key 缓存键
   * @param value 要缓存的数据
   * @param ttl TTL（秒）
   */
  async set<T>(key: string, value: T, ttl: number): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const data = JSON.stringify(value);
      await this.redis!.set(key, data, 'EX', ttl);
      return true;
    } catch (error) {
      this.logger.warn(`Cache set error for key ${key}: ${error}`);
      return false;
    }
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  async del(key: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.redis!.del(key);
      return true;
    } catch (error) {
      this.logger.warn(`Cache delete error for key ${key}: ${error}`);
      return false;
    }
  }

  /**
   * 删除匹配模式的所有缓存
   * @param pattern 模式（如 "dashboard:*"）
   */
  async delByPattern(pattern: string): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      const keys = await this.redis!.keys(pattern);
      if (keys.length > 0) {
        // 移除前缀再删除（因为 keys 返回的是带前缀的）
        const keysWithoutPrefix = keys.map((k) => k.replace(this.keyPrefix, ''));
        await this.redis!.del(...keysWithoutPrefix);
        return keys.length;
      }
      return 0;
    } catch (error) {
      this.logger.warn(`Cache delete by pattern error for ${pattern}: ${error}`);
      return 0;
    }
  }

  /**
   * 获取或设置缓存（缓存穿透保护）
   * @param key 缓存键
   * @param fetcher 数据获取函数
   * @param ttl TTL（秒）
   * @returns 数据
   */
  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
    // 尝试从缓存获取
    const cached = await this.get<T>(key);
    if (cached !== null) {
      this.logger.debug(`Cache hit: ${key}`);
      return cached;
    }

    // 缓存未命中，从源获取
    this.logger.debug(`Cache miss: ${key}, fetching from source`);
    const data = await fetcher();

    // 存入缓存
    await this.set(key, data, ttl);

    return data;
  }

  /**
   * 生成租户相关的缓存键
   * @param category 分类（如 "dashboard", "reports"）
   * @param tenantId 租户 ID
   * @param suffix 后缀
   */
  buildKey(category: string, tenantId: string, suffix?: string): string {
    const parts = [category, tenantId];
    if (suffix) {
      parts.push(suffix);
    }
    return parts.join(':');
  }

  /**
   * 刷新（删除）租户的所有缓存
   * @param tenantId 租户 ID
   */
  async flushTenantCache(tenantId: string): Promise<number> {
    return this.delByPattern(`*:${tenantId}:*`);
  }

  /**
   * 刷新特定分类的缓存
   * @param category 分类
   * @param tenantId 租户 ID（可选）
   */
  async flushCategoryCache(category: string, tenantId?: string): Promise<number> {
    const pattern = tenantId ? `${category}:${tenantId}:*` : `${category}:*`;
    return this.delByPattern(pattern);
  }
}
