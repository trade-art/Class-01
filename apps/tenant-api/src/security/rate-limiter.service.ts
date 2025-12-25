/**
 * 限流服务
 * 使用滑动窗口算法实现 API 限流
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * 限流策略配置
 */
export interface RateLimitConfig {
  /** 策略名称 */
  name: string;
  /** 时间窗口 (秒) */
  windowSizeSeconds: number;
  /** 窗口内最大请求数 */
  maxRequests: number;
  /** 可选: 基于用户级别的限流 */
  perUser?: boolean;
  /** 可选: 基于租户级别的限流 */
  perTenant?: boolean;
}

/**
 * 限流检查结果
 */
export interface RateLimitResult {
  /** 是否允许请求 */
  allowed: boolean;
  /** 当前窗口内的请求数 */
  current: number;
  /** 最大允许请求数 */
  limit: number;
  /** 剩余请求数 */
  remaining: number;
  /** 重置时间 (Unix 时间戳) */
  resetAt: number;
  /** 距离重置的秒数 */
  retryAfter: number;
}

/**
 * 预定义限流策略 (默认值)
 * 注意: 实际值会被 RateLimiterService 从配置中覆盖
 */
export const RATE_LIMIT_STRATEGIES: Record<string, RateLimitConfig> = {
  // 通用 API 限流: 100次/分钟/IP
  general: {
    name: 'general',
    windowSizeSeconds: 60,
    maxRequests: 100,
  },

  // 登录限流: 开发环境 100次/15分钟/IP, 生产环境 5次/15分钟/IP
  // 默认使用宽松限制 (100次)，生产环境通过配置覆盖
  login: {
    name: 'login',
    windowSizeSeconds: 900,
    maxRequests: process.env.NODE_ENV === 'production' ? 5 : 100,
  },

  // 注册限流: 开发环境 30次/小时/IP, 生产环境 3次/小时/IP
  register: {
    name: 'register',
    windowSizeSeconds: 3600,
    maxRequests: process.env.NODE_ENV === 'production' ? 3 : 30,
  },

  // 敏感操作限流: 10次/分钟/用户
  sensitive: {
    name: 'sensitive',
    windowSizeSeconds: 60,
    maxRequests: 10,
    perUser: true,
  },

  // 密码重置限流: 开发环境 30次/小时/IP, 生产环境 3次/小时/IP
  passwordReset: {
    name: 'passwordReset',
    windowSizeSeconds: 3600,
    maxRequests: process.env.NODE_ENV === 'production' ? 3 : 30,
  },

  // 高频 API 限流: 1000次/分钟/租户
  highFrequency: {
    name: 'highFrequency',
    windowSizeSeconds: 60,
    maxRequests: 1000,
    perTenant: true,
  },

  // 导出限流: 5次/小时/用户
  export: {
    name: 'export',
    windowSizeSeconds: 3600,
    maxRequests: 5,
    perUser: true,
  },
};

@Injectable()
export class RateLimiterService implements OnModuleInit {
  private readonly logger = new Logger(RateLimiterService.name);
  private redis: Redis | null = null;
  private readonly keyPrefix = 'rate_limit:';
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    // 从配置中读取是否启用频率限制
    this.isEnabled = this.configService.get<boolean>('rateLimit.enabled', true);

    // 从配置中覆盖策略值
    this.overrideStrategiesFromConfig();

    if (!this.isEnabled) {
      this.logger.warn('Rate limiting is DISABLED - all requests will be allowed');
    }
  }

  /**
   * 从配置中覆盖策略值
   */
  private overrideStrategiesFromConfig(): void {
    // 登录策略
    const loginMax = this.configService.get<number>('rateLimit.login.maxRequests');
    const loginWindow = this.configService.get<number>('rateLimit.login.windowSeconds');
    if (loginMax !== undefined) {
      RATE_LIMIT_STRATEGIES.login.maxRequests = loginMax;
    }
    if (loginWindow !== undefined) {
      RATE_LIMIT_STRATEGIES.login.windowSizeSeconds = loginWindow;
    }

    // 通用策略
    const generalMax = this.configService.get<number>('rateLimit.general.maxRequests');
    const generalWindow = this.configService.get<number>('rateLimit.general.windowSeconds');
    if (generalMax !== undefined) {
      RATE_LIMIT_STRATEGIES.general.maxRequests = generalMax;
    }
    if (generalWindow !== undefined) {
      RATE_LIMIT_STRATEGIES.general.windowSizeSeconds = generalWindow;
    }

    // 敏感操作策略
    const sensitiveMax = this.configService.get<number>('rateLimit.sensitive.maxRequests');
    const sensitiveWindow = this.configService.get<number>('rateLimit.sensitive.windowSeconds');
    if (sensitiveMax !== undefined) {
      RATE_LIMIT_STRATEGIES.sensitive.maxRequests = sensitiveMax;
    }
    if (sensitiveWindow !== undefined) {
      RATE_LIMIT_STRATEGIES.sensitive.windowSizeSeconds = sensitiveWindow;
    }

    this.logger.log(
      `Rate limit strategies initialized: login=${RATE_LIMIT_STRATEGIES.login.maxRequests}/${RATE_LIMIT_STRATEGIES.login.windowSizeSeconds}s, ` +
      `general=${RATE_LIMIT_STRATEGIES.general.maxRequests}/${RATE_LIMIT_STRATEGIES.general.windowSizeSeconds}s`,
    );
  }

  async onModuleInit() {
    await this.initRedis();
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
            this.logger.warn('Redis connection failed, rate limiting will be disabled');
            return null;
          }
          return Math.min(times * 100, 3000);
        },
      });

      this.redis.on('connect', () => {
        this.logger.log('Redis connected for rate limiting');
      });

      this.redis.on('error', (error) => {
        this.logger.warn(`Redis error: ${error.message}`);
      });
    } catch (error) {
      this.logger.warn(`Failed to initialize Redis: ${error}`);
      this.redis = null;
    }
  }

  /**
   * 检查是否允许请求 (滑动窗口算法)
   * @param key 限流键 (通常是 IP 或用户 ID)
   * @param config 限流配置
   */
  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    // 如果频率限制被禁用，直接允许所有请求
    if (!this.isEnabled) {
      return this.createAllowedResult(config);
    }

    // 如果 Redis 不可用，默认允许请求
    if (!this.redis) {
      return this.createAllowedResult(config);
    }

    const now = Date.now();
    const windowStart = now - config.windowSizeSeconds * 1000;
    const redisKey = `${config.name}:${key}`;

    try {
      // 使用 Redis 事务执行滑动窗口算法
      const result = await this.redis
        .multi()
        // 移除窗口外的请求
        .zremrangebyscore(redisKey, 0, windowStart)
        // 获取当前窗口内的请求数
        .zcard(redisKey)
        // 添加当前请求
        .zadd(redisKey, now, `${now}-${Math.random()}`)
        // 设置过期时间
        .expire(redisKey, config.windowSizeSeconds)
        .exec();

      if (!result) {
        return this.createAllowedResult(config);
      }

      // result[1] 是 zcard 的结果
      const currentCount = (result[1][1] as number) + 1;
      const resetAt = Math.floor(now / 1000) + config.windowSizeSeconds;
      const retryAfter = config.windowSizeSeconds;

      if (currentCount > config.maxRequests) {
        // 超出限制，回滚添加的请求
        await this.redis.zremrangebyscore(redisKey, now, now);

        this.logger.debug(
          `Rate limit exceeded for ${redisKey}: ${currentCount}/${config.maxRequests}`,
        );

        return {
          allowed: false,
          current: currentCount,
          limit: config.maxRequests,
          remaining: 0,
          resetAt,
          retryAfter,
        };
      }

      return {
        allowed: true,
        current: currentCount,
        limit: config.maxRequests,
        remaining: config.maxRequests - currentCount,
        resetAt,
        retryAfter: 0,
      };
    } catch (error) {
      this.logger.warn(`Rate limit check failed: ${error}`);
      // 出错时默认允许请求
      return this.createAllowedResult(config);
    }
  }

  /**
   * 使用预定义策略检查限流
   * @param strategyName 策略名称
   * @param identifier 标识符 (IP、用户 ID 等)
   */
  async checkStrategyLimit(
    strategyName: keyof typeof RATE_LIMIT_STRATEGIES,
    identifier: string,
  ): Promise<RateLimitResult> {
    const config = RATE_LIMIT_STRATEGIES[strategyName];
    if (!config) {
      this.logger.warn(`Unknown rate limit strategy: ${strategyName}`);
      return this.createAllowedResult({
        name: 'unknown',
        windowSizeSeconds: 60,
        maxRequests: 100,
      });
    }

    return this.checkLimit(identifier, config);
  }

  /**
   * 重置特定键的限流计数
   * @param key 限流键
   * @param strategyName 策略名称
   */
  async resetLimit(
    key: string,
    strategyName: keyof typeof RATE_LIMIT_STRATEGIES,
  ): Promise<boolean> {
    if (!this.redis) {
      return true;
    }

    try {
      const redisKey = `${strategyName}:${key}`;
      await this.redis.del(redisKey);
      this.logger.debug(`Rate limit reset for ${redisKey}`);
      return true;
    } catch (error) {
      this.logger.warn(`Failed to reset rate limit: ${error}`);
      return false;
    }
  }

  /**
   * 获取当前限流状态
   * @param key 限流键
   * @param strategyName 策略名称
   */
  async getStatus(
    key: string,
    strategyName: keyof typeof RATE_LIMIT_STRATEGIES,
  ): Promise<RateLimitResult> {
    const config = RATE_LIMIT_STRATEGIES[strategyName];
    if (!config || !this.redis) {
      return this.createAllowedResult(config || RATE_LIMIT_STRATEGIES.general);
    }

    const now = Date.now();
    const windowStart = now - config.windowSizeSeconds * 1000;
    const redisKey = `${config.name}:${key}`;

    try {
      await this.redis.zremrangebyscore(redisKey, 0, windowStart);
      const currentCount = await this.redis.zcard(redisKey);
      const resetAt = Math.floor(now / 1000) + config.windowSizeSeconds;

      return {
        allowed: currentCount < config.maxRequests,
        current: currentCount,
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - currentCount),
        resetAt,
        retryAfter: currentCount >= config.maxRequests ? config.windowSizeSeconds : 0,
      };
    } catch (error) {
      this.logger.warn(`Failed to get rate limit status: ${error}`);
      return this.createAllowedResult(config);
    }
  }

  /**
   * 生成限流键
   * @param options 键选项
   */
  generateKey(options: {
    ip?: string;
    userId?: string;
    tenantId?: string;
    endpoint?: string;
  }): string {
    const parts: string[] = [];

    if (options.tenantId) {
      parts.push(`tenant:${options.tenantId}`);
    }
    if (options.userId) {
      parts.push(`user:${options.userId}`);
    }
    if (options.ip) {
      parts.push(`ip:${options.ip}`);
    }
    if (options.endpoint) {
      parts.push(`endpoint:${options.endpoint}`);
    }

    return parts.join(':') || 'global';
  }

  /**
   * 创建允许请求的结果
   */
  private createAllowedResult(config: RateLimitConfig): RateLimitResult {
    return {
      allowed: true,
      current: 0,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetAt: Math.floor(Date.now() / 1000) + config.windowSizeSeconds,
      retryAfter: 0,
    };
  }

  /**
   * 检查频率限制是否启用
   */
  isRateLimitEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * 清除所有频率限制 (仅用于开发和测试)
   * @param pattern 键模式 (默认清除所有)
   */
  async clearAllLimits(pattern: string = '*'): Promise<number> {
    if (!this.redis) {
      return 0;
    }

    try {
      // 获取所有匹配的键 (注意: keyPrefix 已经在 Redis 客户端配置中)
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) {
        this.logger.debug('No rate limit keys to clear');
        return 0;
      }

      // 删除所有匹配的键
      const deleted = await this.redis.del(...keys);
      this.logger.log(`Cleared ${deleted} rate limit keys matching pattern: ${pattern}`);
      return deleted;
    } catch (error) {
      this.logger.error(`Failed to clear rate limits: ${error}`);
      return 0;
    }
  }

  /**
   * 获取当前配置的策略值
   */
  getStrategyConfig(strategyName: string): RateLimitConfig | undefined {
    return RATE_LIMIT_STRATEGIES[strategyName];
  }

  /**
   * 检查 API Key 速率限制
   * 使用 API Key 配置的动态速率限制值
   *
   * @param apiKeyId API Key ID
   * @param rateLimit 每分钟最大请求数 (从 API Key 配置读取)
   * @returns 限流检查结果
   */
  async checkApiKeyLimit(
    apiKeyId: string,
    rateLimit: number,
  ): Promise<RateLimitResult> {
    const config: RateLimitConfig = {
      name: 'apikey',
      windowSizeSeconds: 60, // 固定 1 分钟窗口
      maxRequests: rateLimit,
    };

    return this.checkLimit(`apikey:${apiKeyId}`, config);
  }

  /**
   * 获取 API Key 当前速率限制状态
   *
   * @param apiKeyId API Key ID
   * @param rateLimit 每分钟最大请求数
   * @returns 当前限流状态
   */
  async getApiKeyLimitStatus(
    apiKeyId: string,
    rateLimit: number,
  ): Promise<RateLimitResult> {
    if (!this.redis) {
      return this.createAllowedResult({
        name: 'apikey',
        windowSizeSeconds: 60,
        maxRequests: rateLimit,
      });
    }

    const now = Date.now();
    const windowSizeSeconds = 60;
    const windowStart = now - windowSizeSeconds * 1000;
    const redisKey = `apikey:apikey:${apiKeyId}`;

    try {
      await this.redis.zremrangebyscore(redisKey, 0, windowStart);
      const currentCount = await this.redis.zcard(redisKey);
      const resetAt = Math.floor(now / 1000) + windowSizeSeconds;

      return {
        allowed: currentCount < rateLimit,
        current: currentCount,
        limit: rateLimit,
        remaining: Math.max(0, rateLimit - currentCount),
        resetAt,
        retryAfter: currentCount >= rateLimit ? windowSizeSeconds : 0,
      };
    } catch (error) {
      this.logger.warn(`Failed to get API Key rate limit status: ${error}`);
      return this.createAllowedResult({
        name: 'apikey',
        windowSizeSeconds: 60,
        maxRequests: rateLimit,
      });
    }
  }

  /**
   * 关闭 Redis 连接
   */
  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
