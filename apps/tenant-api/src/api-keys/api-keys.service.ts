import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimiterService } from '../security/rate-limiter.service';
import * as crypto from 'crypto';
import {
  CreateApiKeyDto,
  CreateApiKeyResponseDto,
  UpdateApiKeyDto,
  ApiKeyQueryDto,
  ApiKeyListResponseDto,
  ApiKeyListItemDto,
  ApiKeyDetailDto,
  ValidateApiKeyDto,
  ValidateApiKeyResponseDto,
  RevokeApiKeyDto,
} from './dto';
import { WebhookService } from './services';

/**
 * API Key 服务
 * 提供 API Key 的 CRUD 操作、验证和使用统计功能
 */
@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  /** API Key 前缀 */
  private readonly KEY_PREFIX = 'mk_';

  /** Key 长度 (不含前缀) */
  private readonly KEY_LENGTH = 32;

  /** 显示的 Key 前缀长度 */
  private readonly DISPLAY_PREFIX_LENGTH = 8;

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookService: WebhookService,
    private readonly rateLimiterService: RateLimiterService,
  ) {}

  // ============================================
  // CRUD Operations
  // ============================================

  /**
   * 创建新的 API Key
   * @param tenantId 租户 ID
   * @param dto 创建参数
   * @param createdBy 创建者 ID
   * @returns 创建结果 (包含完整 Key，仅显示一次)
   */
  async create(
    tenantId: string,
    dto: CreateApiKeyDto,
    createdBy?: string,
  ): Promise<CreateApiKeyResponseDto> {
    // 生成随机 Key
    const rawKey = this.generateApiKey();
    const keyPrefix = rawKey.substring(0, this.DISPLAY_PREFIX_LENGTH);
    const hashedKey = this.hashApiKey(rawKey);

    // 创建记录
    const apiKey = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name: dto.name,
        keyPrefix,
        hashedKey,
        scopes: dto.scopes || ['*'],
        allowedIps: dto.allowedIps || [],
        serverId: dto.serverId,
        rateLimit: dto.rateLimit || 1000,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdBy,
        isActive: true,
      },
    });

    this.logger.log(
      `创建 API Key "${dto.name}" (ID: ${apiKey.id}, 租户: ${tenantId})`,
    );

    return {
      id: apiKey.id,
      name: apiKey.name,
      apiKey: rawKey, // 完整 Key，仅返回一次
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      allowedIps: apiKey.allowedIps,
      serverId: apiKey.serverId ?? undefined,
      rateLimit: apiKey.rateLimit,
      expiresAt: apiKey.expiresAt?.toISOString(),
      createdAt: apiKey.createdAt.toISOString(),
    };
  }

  /**
   * 获取 API Key 列表
   * @param tenantId 租户 ID
   * @param query 查询参数
   * @returns 分页列表
   */
  async findAll(
    tenantId: string,
    query: ApiKeyQueryDto,
  ): Promise<ApiKeyListResponseDto> {
    const {
      page = 1,
      pageSize = 20,
      status = 'active',
      serverId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    // 构建查询条件
    const where: any = { tenantId };

    // 状态过滤
    if (status === 'active') {
      where.isActive = true;
      where.revokedAt = null;
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ];
    } else if (status === 'revoked') {
      where.revokedAt = { not: null };
    } else if (status === 'expired') {
      where.expiresAt = { lt: new Date() };
      where.revokedAt = null;
    }
    // 'all' 不添加额外过滤

    // 服务器过滤
    if (serverId) {
      where.serverId = serverId;
    }

    // 搜索
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { keyPrefix: { contains: search, mode: 'insensitive' } },
      ];
    }

    // 查询总数和数据
    const [total, apiKeys] = await Promise.all([
      this.prisma.apiKey.count({ where }),
      this.prisma.apiKey.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: apiKeys.map((key) => this.mapToListItemDto(key)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 获取 API Key 详情
   * @param tenantId 租户 ID
   * @param id API Key ID
   * @returns API Key 详情
   */
  async findOne(tenantId: string, id: string): Promise<ApiKeyDetailDto> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id, tenantId },
    });

    if (!apiKey) {
      throw new NotFoundException('API Key 不存在');
    }

    return {
      ...this.mapToListItemDto(apiKey),
      tenantId: apiKey.tenantId,
    };
  }

  /**
   * 更新 API Key
   * @param tenantId 租户 ID
   * @param id API Key ID
   * @param dto 更新参数
   * @returns 更新后的 API Key
   */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateApiKeyDto,
  ): Promise<ApiKeyListItemDto> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id, tenantId },
    });

    if (!apiKey) {
      throw new NotFoundException('API Key 不存在');
    }

    if (apiKey.revokedAt) {
      throw new ConflictException('已撤销的 API Key 无法更新');
    }

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: {
        name: dto.name,
        allowedIps: dto.allowedIps,
        scopes: dto.scopes,
        rateLimit: dto.rateLimit,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`更新 API Key ${id}`);

    return this.mapToListItemDto(updated);
  }

  /**
   * 撤销 API Key
   * @param tenantId 租户 ID
   * @param id API Key ID
   * @param revokedBy 撤销者 ID
   * @param dto 撤销参数
   */
  async revoke(
    tenantId: string,
    id: string,
    revokedBy: string,
    dto?: RevokeApiKeyDto,
  ): Promise<ApiKeyListItemDto> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id, tenantId },
    });

    if (!apiKey) {
      throw new NotFoundException('API Key 不存在');
    }

    if (apiKey.revokedAt) {
      throw new ConflictException('API Key 已被撤销');
    }

    const revokedAt = new Date();
    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: {
        isActive: false,
        revokedAt,
        revokedBy,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `撤销 API Key ${id} (操作者: ${revokedBy}${dto?.reason ? `, 原因: ${dto.reason}` : ''})`,
    );

    // 发送 Webhook 通知中间件清除缓存 (非阻塞)
    this.sendRevocationWebhook(apiKey, revokedAt, revokedBy, dto?.reason);

    return this.mapToListItemDto(updated);
  }

  /**
   * 永久删除 API Key (仅限已吊销或已过期的)
   * @param tenantId 租户 ID
   * @param id API Key ID
   */
  async delete(tenantId: string, id: string): Promise<void> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id, tenantId },
    });

    if (!apiKey) {
      throw new NotFoundException('API Key 不存在');
    }

    // 只允许删除已吊销或已过期的 API Key
    const isRevoked = apiKey.revokedAt !== null;
    const isExpired = apiKey.expiresAt && apiKey.expiresAt < new Date();

    if (!isRevoked && !isExpired) {
      throw new ConflictException('只能删除已吊销或已过期的 API Key');
    }

    await this.prisma.apiKey.delete({
      where: { id },
    });

    this.logger.log(`永久删除 API Key ${id} (租户: ${tenantId})`);
  }

  /**
   * 发送撤销 Webhook 通知 (非阻塞)
   * 通知中间件清除已撤销的 API Key 缓存
   */
  private async sendRevocationWebhook(
    apiKey: { id: string; hashedKey: string; tenantId: string },
    revokedAt: Date,
    revokedBy: string,
    reason?: string,
  ): Promise<void> {
    try {
      // 使用 hashedKey 的前 16 位作为缓存查找标识
      const keyHashPrefix = apiKey.hashedKey.substring(0, 16);

      await this.webhookService.notifyApiKeyRevoked({
        keyId: apiKey.id,
        keyHashPrefix,
        tenantId: apiKey.tenantId,
        revokedAt: revokedAt.toISOString(),
        revokedBy,
        reason,
      });
    } catch (error) {
      // Webhook 失败不应影响撤销操作
      this.logger.warn(
        `发送撤销 Webhook 失败 (Key: ${apiKey.id}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ============================================
  // Validation (供中间件调用)
  // ============================================

  /**
   * 验证 API Key
   * 供中间件内部调用，验证 Key 的有效性
   * @param dto 验证参数
   * @returns 验证结果
   */
  async validate(dto: ValidateApiKeyDto): Promise<ValidateApiKeyResponseDto> {
    const { apiKey, requiredScopes, clientIp } = dto;

    // 哈希 API Key 进行查找
    const hashedKey = this.hashApiKey(apiKey);

    const key = await this.prisma.apiKey.findFirst({
      where: { hashedKey },
    });

    // Key 不存在
    if (!key) {
      return {
        valid: false,
        reason: 'Invalid API Key',
        errorCode: 'INVALID_KEY',
      };
    }

    // 检查是否已撤销
    if (key.revokedAt) {
      return {
        valid: false,
        reason: 'API Key has been revoked',
        errorCode: 'REVOKED',
      };
    }

    // 检查是否激活
    if (!key.isActive) {
      return {
        valid: false,
        reason: 'API Key is not active',
        errorCode: 'REVOKED',
      };
    }

    // 检查是否过期
    if (key.expiresAt && key.expiresAt < new Date()) {
      return {
        valid: false,
        reason: 'API Key has expired',
        errorCode: 'EXPIRED',
      };
    }

    // 检查 IP 白名单
    if (clientIp && key.allowedIps.length > 0) {
      const ipAllowed = this.checkIpAllowed(clientIp, key.allowedIps);
      if (!ipAllowed) {
        return {
          valid: false,
          reason: `IP ${clientIp} is not allowed`,
          errorCode: 'IP_NOT_ALLOWED',
        };
      }
    }

    // 检查作用域
    if (requiredScopes && requiredScopes.length > 0) {
      const scopeAllowed = this.checkScopesAllowed(requiredScopes, key.scopes);
      if (!scopeAllowed) {
        return {
          valid: false,
          reason: 'Insufficient scope permissions',
          errorCode: 'SCOPE_DENIED',
        };
      }
    }

    // 检查速率限制
    const rateLimitResult = await this.rateLimiterService.checkApiKeyLimit(
      key.id,
      key.rateLimit,
    );

    if (!rateLimitResult.allowed) {
      const retryAfterSeconds = Math.max(
        0,
        Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
      );
      this.logger.warn(
        `API Key ${key.id} 超出速率限制 (${key.rateLimit}/分钟)`,
      );
      return {
        valid: false,
        reason: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds`,
        errorCode: 'RATE_LIMITED',
        remainingRateLimit: 0,
      };
    }

    // 验证通过，记录使用
    await this.recordUsage(key.id, clientIp);

    return {
      valid: true,
      keyId: key.id,
      tenantId: key.tenantId,
      serverId: key.serverId ?? undefined,
      scopes: key.scopes,
      remainingRateLimit: rateLimitResult.remaining,
    };
  }

  /**
   * 记录 API Key 使用
   * @param keyId API Key ID
   * @param clientIp 客户端 IP
   */
  async recordUsage(keyId: string, clientIp?: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
        lastUsedIp: clientIp,
      },
    });
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * 生成 API Key
   * 格式: mk_<32位随机字符>
   */
  private generateApiKey(): string {
    const randomPart = crypto.randomBytes(this.KEY_LENGTH).toString('hex');
    return `${this.KEY_PREFIX}${randomPart}`;
  }

  /**
   * 哈希 API Key
   * 使用 SHA256 进行哈希
   */
  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * 检查 IP 是否在白名单中
   * 支持精确匹配和 CIDR 格式
   */
  private checkIpAllowed(clientIp: string, allowedIps: string[]): boolean {
    for (const allowed of allowedIps) {
      // 精确匹配
      if (allowed === clientIp) {
        return true;
      }

      // CIDR 匹配 (简化实现，仅支持 /24 和 /16)
      if (allowed.includes('/')) {
        const [network, mask] = allowed.split('/');
        const maskNum = parseInt(mask, 10);

        if (maskNum === 24) {
          const clientPrefix = clientIp.split('.').slice(0, 3).join('.');
          const networkPrefix = network.split('.').slice(0, 3).join('.');
          if (clientPrefix === networkPrefix) {
            return true;
          }
        } else if (maskNum === 16) {
          const clientPrefix = clientIp.split('.').slice(0, 2).join('.');
          const networkPrefix = network.split('.').slice(0, 2).join('.');
          if (clientPrefix === networkPrefix) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 检查作用域是否满足要求
   * 如果 Key 有 '*' 作用域，则允许所有操作
   */
  private checkScopesAllowed(
    requiredScopes: string[],
    keyScopes: string[],
  ): boolean {
    // 通配符作用域
    if (keyScopes.includes('*')) {
      return true;
    }

    // 检查每个必需作用域
    for (const required of requiredScopes) {
      const hasScope = keyScopes.some((scope) => {
        // 精确匹配
        if (scope === required) {
          return true;
        }

        // 前缀匹配 (如 users:* 匹配 users:read)
        if (scope.endsWith(':*')) {
          const prefix = scope.slice(0, -1); // 移除末尾的 *
          if (required.startsWith(prefix)) {
            return true;
          }
        }

        return false;
      });

      if (!hasScope) {
        return false;
      }
    }

    return true;
  }

  /**
   * 映射数据库记录到列表项 DTO
   */
  private mapToListItemDto(key: any): ApiKeyListItemDto {
    return {
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
      allowedIps: key.allowedIps,
      serverId: key.serverId ?? undefined,
      rateLimit: key.rateLimit,
      usageCount: key.usageCount,
      lastUsedAt: key.lastUsedAt?.toISOString(),
      lastUsedIp: key.lastUsedIp ?? undefined,
      isActive: key.isActive,
      revokedAt: key.revokedAt?.toISOString(),
      revokedBy: key.revokedBy ?? undefined,
      expiresAt: key.expiresAt?.toISOString(),
      createdBy: key.createdBy ?? undefined,
      createdAt: key.createdAt.toISOString(),
      updatedAt: key.updatedAt.toISOString(),
    };
  }
}
