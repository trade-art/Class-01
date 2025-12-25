/**
 * IP 黑名单服务
 * 管理 IP 地址黑名单，支持自动过期和统计
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

/**
 * IP 黑名单来源
 */
export enum IpBlacklistSource {
  MANUAL = 'MANUAL',
  RATE_LIMIT = 'RATE_LIMIT',
  BRUTE_FORCE = 'BRUTE_FORCE',
  SUSPICIOUS = 'SUSPICIOUS',
  EXTERNAL = 'EXTERNAL',
}

/**
 * 添加黑名单选项
 */
export interface AddToBlacklistOptions {
  ipAddress: string;
  tenantId?: string;
  reason?: string;
  source?: IpBlacklistSource;
  expiresInSeconds?: number;
  createdBy?: string;
}

/**
 * 黑名单条目
 */
export interface BlacklistEntry {
  id: string;
  ipAddress: string;
  tenantId?: string | null;
  reason?: string | null;
  source: IpBlacklistSource;
  expiresAt?: Date | null;
  hitCount: number;
  createdAt: Date;
}

@Injectable()
export class IpBlacklistService implements OnModuleInit {
  private readonly logger = new Logger(IpBlacklistService.name);
  private redis: Redis | null = null;
  private readonly cachePrefix = 'ip_blacklist:';
  private readonly cacheTtl = 300; // 5 分钟缓存

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.initRedis();
    await this.cleanupExpired();
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
        keyPrefix: this.cachePrefix,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn('Redis connection failed, IP blacklist cache disabled');
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
   * 检查 IP 是否在黑名单中
   * @param ipAddress IP 地址
   * @param tenantId 可选租户 ID
   */
  async isBlacklisted(ipAddress: string, tenantId?: string): Promise<boolean> {
    // 首先检查缓存
    if (this.redis) {
      const cacheKey = this.getCacheKey(ipAddress, tenantId);
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) {
        const isBlacklisted = cached === '1';
        if (isBlacklisted) {
          // 异步更新命中计数
          this.incrementHitCount(ipAddress, tenantId).catch(() => {});
        }
        return isBlacklisted;
      }
    }

    // 查询数据库
    const entry = await this.findEntry(ipAddress, tenantId);
    const isBlacklisted = entry !== null;

    // 更新缓存
    if (this.redis) {
      const cacheKey = this.getCacheKey(ipAddress, tenantId);
      await this.redis.set(cacheKey, isBlacklisted ? '1' : '0', 'EX', this.cacheTtl);
    }

    if (isBlacklisted) {
      await this.incrementHitCount(ipAddress, tenantId);
    }

    return isBlacklisted;
  }

  /**
   * 添加 IP 到黑名单
   */
  async addToBlacklist(options: AddToBlacklistOptions): Promise<BlacklistEntry> {
    const {
      ipAddress,
      tenantId,
      reason,
      source = IpBlacklistSource.MANUAL,
      expiresInSeconds,
      createdBy,
    } = options;

    const expiresAt = expiresInSeconds
      ? new Date(Date.now() + expiresInSeconds * 1000)
      : null;

    // 使用 upsert 避免重复
    const entry = await this.prisma.ipBlacklist.upsert({
      where: {
        ipAddress_tenantId: {
          ipAddress,
          tenantId: tenantId ?? '',
        },
      },
      create: {
        ipAddress,
        tenantId: tenantId || null,
        reason,
        source,
        expiresAt,
        createdBy,
      },
      update: {
        reason,
        source,
        expiresAt,
        createdBy,
        updatedAt: new Date(),
      },
    });

    // 清除缓存
    await this.invalidateCache(ipAddress, tenantId);

    this.logger.log(`IP ${ipAddress} added to blacklist: ${reason || 'No reason'}`);

    return this.toBlacklistEntry(entry);
  }

  /**
   * 从黑名单移除 IP
   */
  async removeFromBlacklist(ipAddress: string, tenantId?: string): Promise<boolean> {
    try {
      await this.prisma.ipBlacklist.delete({
        where: {
          ipAddress_tenantId: {
            ipAddress,
            tenantId: tenantId ?? '',
          },
        },
      });

      // 清除缓存
      await this.invalidateCache(ipAddress, tenantId);

      this.logger.log(`IP ${ipAddress} removed from blacklist`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取黑名单列表
   */
  async getBlacklist(options?: {
    tenantId?: string;
    source?: IpBlacklistSource;
    includeExpired?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: BlacklistEntry[]; total: number }> {
    const { tenantId, source, includeExpired = false, limit = 50, offset = 0 } = options || {};

    const where: any = {};

    if (tenantId !== undefined) {
      where.tenantId = tenantId;
    }

    if (source) {
      where.source = source;
    }

    if (!includeExpired) {
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ];
    }

    const [entries, total] = await Promise.all([
      this.prisma.ipBlacklist.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ipBlacklist.count({ where }),
    ]);

    return {
      entries: entries.map(this.toBlacklistEntry),
      total,
    };
  }

  /**
   * 因速率限制自动添加到黑名单
   */
  async autoBlacklistForRateLimit(
    ipAddress: string,
    tenantId?: string,
    lockoutMinutes = 30,
  ): Promise<void> {
    await this.addToBlacklist({
      ipAddress,
      tenantId,
      reason: 'Automatic blacklist due to rate limit violations',
      source: IpBlacklistSource.RATE_LIMIT,
      expiresInSeconds: lockoutMinutes * 60,
    });
  }

  /**
   * 因暴力破解自动添加到黑名单
   */
  async autoBlacklistForBruteForce(
    ipAddress: string,
    tenantId?: string,
    lockoutMinutes = 60,
  ): Promise<void> {
    await this.addToBlacklist({
      ipAddress,
      tenantId,
      reason: 'Automatic blacklist due to brute force attempts',
      source: IpBlacklistSource.BRUTE_FORCE,
      expiresInSeconds: lockoutMinutes * 60,
    });
  }

  /**
   * 清理过期的黑名单条目
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.ipBlacklist.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired blacklist entries`);
    }

    return result.count;
  }

  /**
   * 查找黑名单条目
   */
  private async findEntry(
    ipAddress: string,
    tenantId?: string,
  ): Promise<BlacklistEntry | null> {
    // 首先检查特定租户的黑名单
    if (tenantId) {
      const tenantEntry = await this.prisma.ipBlacklist.findFirst({
        where: {
          ipAddress,
          tenantId,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      });

      if (tenantEntry) {
        return this.toBlacklistEntry(tenantEntry);
      }
    }

    // 然后检查全局黑名单
    const globalEntry = await this.prisma.ipBlacklist.findFirst({
      where: {
        ipAddress,
        tenantId: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    return globalEntry ? this.toBlacklistEntry(globalEntry) : null;
  }

  /**
   * 增加命中计数
   */
  private async incrementHitCount(ipAddress: string, tenantId?: string): Promise<void> {
    try {
      await this.prisma.ipBlacklist.updateMany({
        where: {
          ipAddress,
          tenantId: tenantId || null,
        },
        data: {
          hitCount: { increment: 1 },
          lastHitAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to increment hit count: ${error}`);
    }
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(ipAddress: string, tenantId?: string): string {
    return tenantId ? `${tenantId}:${ipAddress}` : `global:${ipAddress}`;
  }

  /**
   * 清除缓存
   */
  private async invalidateCache(ipAddress: string, tenantId?: string): Promise<void> {
    if (!this.redis) return;

    const keys = [
      this.getCacheKey(ipAddress, tenantId),
      this.getCacheKey(ipAddress), // 也清除全局缓存
    ];

    await Promise.all(keys.map((key) => this.redis!.del(key)));
  }

  /**
   * 转换为黑名单条目
   */
  private toBlacklistEntry(entry: any): BlacklistEntry {
    return {
      id: entry.id,
      ipAddress: entry.ipAddress,
      tenantId: entry.tenantId,
      reason: entry.reason,
      source: entry.source as IpBlacklistSource,
      expiresAt: entry.expiresAt,
      hitCount: entry.hitCount,
      createdAt: entry.createdAt,
    };
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
