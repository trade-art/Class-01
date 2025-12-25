/**
 * 账户锁定服务
 * 防止暴力破解攻击，实现失败计数和自动锁定
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { IpBlacklistService, IpBlacklistSource } from './ip-blacklist.service';

/**
 * 账户锁定配置
 */
export interface AccountLockoutConfig {
  /** 最大失败次数 */
  maxAttempts: number;
  /** 锁定时长（秒） */
  lockoutDurationSeconds: number;
  /** 失败计数窗口（秒） */
  attemptWindowSeconds: number;
  /** 渐进式锁定：每次锁定时间倍增 */
  progressiveLockout: boolean;
  /** 最大锁定时长（秒） */
  maxLockoutDurationSeconds: number;
}

/**
 * 锁定状态
 */
export interface LockoutStatus {
  /** 是否锁定 */
  isLocked: boolean;
  /** 剩余锁定时间（秒） */
  remainingSeconds: number;
  /** 失败次数 */
  failedAttempts: number;
  /** 锁定到期时间 */
  lockedUntil?: Date;
  /** 锁定次数 */
  lockoutCount: number;
}

/**
 * 失败记录
 */
export interface FailedAttempt {
  timestamp: number;
  ipAddress?: string;
  reason?: string;
}

/**
 * 默认锁定配置
 */
export const DEFAULT_LOCKOUT_CONFIG: AccountLockoutConfig = {
  maxAttempts: 5,
  lockoutDurationSeconds: 15 * 60, // 15 分钟
  attemptWindowSeconds: 15 * 60, // 15 分钟窗口
  progressiveLockout: true,
  maxLockoutDurationSeconds: 24 * 60 * 60, // 最大 24 小时
};

@Injectable()
export class AccountLockoutService implements OnModuleInit {
  private readonly logger = new Logger(AccountLockoutService.name);
  private redis: Redis | null = null;
  private readonly keyPrefix = 'account_lockout:';
  private config: AccountLockoutConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly ipBlacklistService: IpBlacklistService,
  ) {
    this.config = {
      ...DEFAULT_LOCKOUT_CONFIG,
      maxAttempts: this.configService.get<number>('security.lockout.maxAttempts', 5),
      lockoutDurationSeconds: this.configService.get<number>('security.lockout.durationSeconds', 15 * 60),
      attemptWindowSeconds: this.configService.get<number>('security.lockout.windowSeconds', 15 * 60),
      progressiveLockout: this.configService.get<boolean>('security.lockout.progressive', true),
    };
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
      const redisDb = this.configService.get<number>('redis.db') || 2;

      this.redis = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword || undefined,
        db: redisDb,
        keyPrefix: this.keyPrefix,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn('Redis connection failed, account lockout disabled');
            return null;
          }
          return Math.min(times * 100, 3000);
        },
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
   * 记录登录失败
   * @param identifier 账户标识（邮箱或用户ID）
   * @param ipAddress 客户端 IP
   * @param reason 失败原因
   */
  async recordFailedAttempt(
    identifier: string,
    ipAddress?: string,
    reason?: string,
  ): Promise<LockoutStatus> {
    if (!this.redis) {
      return this.getDefaultStatus();
    }

    const attemptsKey = this.getAttemptsKey(identifier);
    const lockoutKey = this.getLockoutKey(identifier);
    const lockoutCountKey = this.getLockoutCountKey(identifier);

    // 检查是否已锁定
    const currentStatus = await this.getLockoutStatus(identifier);
    if (currentStatus.isLocked) {
      return currentStatus;
    }

    // 记录失败尝试
    const attempt: FailedAttempt = {
      timestamp: Date.now(),
      ipAddress,
      reason,
    };

    await this.redis.rpush(attemptsKey, JSON.stringify(attempt));
    await this.redis.expire(attemptsKey, this.config.attemptWindowSeconds);

    // 获取当前失败次数
    const attempts = await this.redis.llen(attemptsKey);

    // 检查是否需要锁定
    if (attempts >= this.config.maxAttempts) {
      return this.lockAccount(identifier, ipAddress);
    }

    return {
      isLocked: false,
      remainingSeconds: 0,
      failedAttempts: attempts,
      lockoutCount: currentStatus.lockoutCount,
    };
  }

  /**
   * 锁定账户
   */
  private async lockAccount(
    identifier: string,
    ipAddress?: string,
  ): Promise<LockoutStatus> {
    if (!this.redis) {
      return this.getDefaultStatus();
    }

    const lockoutKey = this.getLockoutKey(identifier);
    const lockoutCountKey = this.getLockoutCountKey(identifier);

    // 增加锁定次数
    const lockoutCount = await this.redis.incr(lockoutCountKey);
    // 锁定次数永不过期，用于渐进式锁定计算
    await this.redis.persist(lockoutCountKey);

    // 计算锁定时长（渐进式）
    let lockoutDuration = this.config.lockoutDurationSeconds;
    if (this.config.progressiveLockout && lockoutCount > 1) {
      // 每次锁定时间翻倍，但不超过最大值
      lockoutDuration = Math.min(
        this.config.lockoutDurationSeconds * Math.pow(2, lockoutCount - 1),
        this.config.maxLockoutDurationSeconds,
      );
    }

    const lockedUntil = new Date(Date.now() + lockoutDuration * 1000);

    // 设置锁定状态
    await this.redis.set(lockoutKey, lockedUntil.toISOString(), 'EX', lockoutDuration);

    // 清除失败尝试记录
    await this.redis.del(this.getAttemptsKey(identifier));

    this.logger.warn(
      `Account locked: ${identifier}, duration: ${lockoutDuration}s, count: ${lockoutCount}`,
    );

    // 如果锁定次数过多，考虑将 IP 加入黑名单
    if (lockoutCount >= 3 && ipAddress) {
      await this.considerIpBlacklist(identifier, ipAddress, lockoutCount);
    }

    return {
      isLocked: true,
      remainingSeconds: lockoutDuration,
      failedAttempts: this.config.maxAttempts,
      lockedUntil,
      lockoutCount,
    };
  }

  /**
   * 考虑将 IP 加入黑名单
   */
  private async considerIpBlacklist(
    identifier: string,
    ipAddress: string,
    lockoutCount: number,
  ): Promise<void> {
    try {
      // 锁定 3 次后，将 IP 临时加入黑名单
      const blacklistDuration = Math.min(lockoutCount * 60 * 60, 24 * 60 * 60); // 最多 24 小时
      await this.ipBlacklistService.addToBlacklist({
        ipAddress,
        reason: `Multiple account lockouts for ${identifier} (count: ${lockoutCount})`,
        source: IpBlacklistSource.BRUTE_FORCE,
        expiresInSeconds: blacklistDuration,
      });
      this.logger.warn(
        `IP ${ipAddress} added to blacklist due to brute force on ${identifier}`,
      );
    } catch (error) {
      this.logger.error(`Failed to add IP to blacklist: ${error}`);
    }
  }

  /**
   * 获取锁定状态
   */
  async getLockoutStatus(identifier: string): Promise<LockoutStatus> {
    if (!this.redis) {
      return this.getDefaultStatus();
    }

    const lockoutKey = this.getLockoutKey(identifier);
    const attemptsKey = this.getAttemptsKey(identifier);
    const lockoutCountKey = this.getLockoutCountKey(identifier);

    const [lockedUntilStr, attempts, lockoutCountStr] = await Promise.all([
      this.redis.get(lockoutKey),
      this.redis.llen(attemptsKey),
      this.redis.get(lockoutCountKey),
    ]);

    const lockoutCount = parseInt(lockoutCountStr || '0', 10);

    if (lockedUntilStr) {
      const lockedUntil = new Date(lockedUntilStr);
      const remainingMs = lockedUntil.getTime() - Date.now();

      if (remainingMs > 0) {
        return {
          isLocked: true,
          remainingSeconds: Math.ceil(remainingMs / 1000),
          failedAttempts: this.config.maxAttempts,
          lockedUntil,
          lockoutCount,
        };
      }
    }

    return {
      isLocked: false,
      remainingSeconds: 0,
      failedAttempts: attempts,
      lockoutCount,
    };
  }

  /**
   * 检查账户是否锁定
   */
  async isLocked(identifier: string): Promise<boolean> {
    const status = await this.getLockoutStatus(identifier);
    return status.isLocked;
  }

  /**
   * 重置失败计数（登录成功时调用）
   */
  async resetFailedAttempts(identifier: string): Promise<void> {
    if (!this.redis) {
      return;
    }

    const attemptsKey = this.getAttemptsKey(identifier);
    const lockoutKey = this.getLockoutKey(identifier);

    await Promise.all([
      this.redis.del(attemptsKey),
      this.redis.del(lockoutKey),
    ]);

    this.logger.debug(`Reset failed attempts for: ${identifier}`);
  }

  /**
   * 完全重置锁定状态（管理员操作）
   */
  async fullyResetLockout(identifier: string): Promise<void> {
    if (!this.redis) {
      return;
    }

    const attemptsKey = this.getAttemptsKey(identifier);
    const lockoutKey = this.getLockoutKey(identifier);
    const lockoutCountKey = this.getLockoutCountKey(identifier);

    await Promise.all([
      this.redis.del(attemptsKey),
      this.redis.del(lockoutKey),
      this.redis.del(lockoutCountKey),
    ]);

    this.logger.log(`Fully reset lockout for: ${identifier}`);
  }

  /**
   * 获取失败尝试历史
   */
  async getFailedAttempts(identifier: string): Promise<FailedAttempt[]> {
    if (!this.redis) {
      return [];
    }

    const attemptsKey = this.getAttemptsKey(identifier);
    const attempts = await this.redis.lrange(attemptsKey, 0, -1);

    return attempts.map((a) => JSON.parse(a) as FailedAttempt);
  }

  /**
   * 获取锁定配置
   */
  getConfig(): AccountLockoutConfig {
    return { ...this.config };
  }

  /**
   * 获取默认状态
   */
  private getDefaultStatus(): LockoutStatus {
    return {
      isLocked: false,
      remainingSeconds: 0,
      failedAttempts: 0,
      lockoutCount: 0,
    };
  }

  /**
   * 获取失败尝试键
   */
  private getAttemptsKey(identifier: string): string {
    return `attempts:${identifier}`;
  }

  /**
   * 获取锁定键
   */
  private getLockoutKey(identifier: string): string {
    return `lockout:${identifier}`;
  }

  /**
   * 获取锁定次数键
   */
  private getLockoutCountKey(identifier: string): string {
    return `lockout_count:${identifier}`;
  }

  /**
   * 关闭连接
   */
  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
