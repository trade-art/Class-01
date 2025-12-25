/**
 * MT Manager API Key 服务
 *
 * 为 MT 经理账号提供外部应用认证功能
 * 支持 API Key + Secret 认证机制，生成短期访问令牌
 *
 * 认证流程:
 * 1. 第三方应用使用 API Key + Secret 调用认证接口
 * 2. 返回 Access Token (15分钟) + Refresh Token (7天)
 * 3. Access Token 过期后使用 Refresh Token 刷新
 * 4. 两者都过期后，重新使用 API Key + Secret 认证
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../security/encryption.service';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

/**
 * API Key 前缀
 */
const API_KEY_PREFIX = 'mk_';

/**
 * Secret 前缀
 */
const SECRET_PREFIX = 'ms_';

/**
 * 生成 API Key 响应
 */
export interface GenerateApiKeyResponse {
  /** API Key ID (可公开展示，用于识别) */
  apiKeyId: string;
  /** API Secret (仅显示一次，用于认证) */
  apiSecret: string;
  /** MT Manager ID */
  managerId: string;
  /** 创建时间 */
  createdAt: string;
}

/**
 * API Key 认证响应
 */
export interface ApiKeyAuthResponse {
  /** Access Token (15分钟有效) */
  accessToken: string;
  /** Refresh Token (7天有效) */
  refreshToken: string;
  /** Access Token 过期时间 (秒) */
  expiresIn: number;
  /** Refresh Token 过期时间 (秒) */
  refreshExpiresIn: number;
  /** Token 类型 */
  tokenType: 'Bearer';
  /** MT Manager 信息 */
  manager: {
    id: string;
    managerLogin: string;
    displayName: string | null;
    serverId: string;
    serverName: string | null;
    platformType: string;
  };
}

/**
 * 刷新 Token 响应
 */
export interface RefreshTokenResponse {
  /** 新的 Access Token */
  accessToken: string;
  /** 新的 Refresh Token */
  refreshToken: string;
  /** 过期时间 (秒) */
  expiresIn: number;
  /** Refresh Token 过期时间 (秒) */
  refreshExpiresIn: number;
}

/**
 * API Key Token Payload (精简版)
 *
 * 安全改进: Token 只包含最小必要信息
 * - managerId: 用于标识经理账号
 * - tenantId: 用于租户隔离
 * - apiKeyId: 用于验证 API Key 状态
 *
 * 其他信息 (serverId, managerLogin, middlewareUrl 等) 在 Guard 验证时从数据库获取
 */
export interface ApiKeyTokenPayload {
  /** Token 类型 */
  type: 'access' | 'refresh';
  /** MT Manager ID (UUID) */
  managerId: string;
  /** 租户 ID */
  tenantId: string;
  /** API Key ID */
  apiKeyId: string;
  /** 签发时间 */
  iat?: number;
  /** 过期时间 */
  exp?: number;
}

/**
 * API Key 状态 DTO
 */
export interface ApiKeyStatusDto {
  /** 是否已配置 API Key */
  hasApiKey: boolean;
  /** API Key ID (掩码) */
  apiKeyId: string | null;
  /** 是否已启用 */
  apiKeyEnabled: boolean;
  /** IP 白名单 */
  apiKeyAllowedIps: string[];
  /** 权限作用域 */
  apiKeyScopes: string[];
  /** 创建时间 */
  apiKeyCreatedAt: string | null;
  /** 最后使用时间 */
  apiKeyLastUsedAt: string | null;
  /** 最后使用 IP */
  apiKeyLastUsedIp: string | null;
}

@Injectable()
export class MtManagerApiKeyService {
  private readonly logger = new Logger(MtManagerApiKeyService.name);

  /** JWT 签名密钥 */
  private readonly jwtSecret: string;

  /** Access Token 过期时间 (秒) - 15分钟 */
  private readonly accessTokenExpiresIn = 15 * 60;

  /** Refresh Token 过期时间 (秒) - 7天 */
  private readonly refreshTokenExpiresIn = 7 * 24 * 60 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
  ) {
    // 使用独立的 JWT 密钥用于 API Key 认证
    this.jwtSecret =
      this.configService.get<string>('managerApiKey.jwtSecret') ||
      this.configService.get<string>('jwt.secret') ||
      'mt5-api-key-jwt-secret-2024';
  }

  // ============================================
  // API Key 生成与管理
  // ============================================

  /**
   * 为 MT Manager 生成 API Key
   *
   * @param tenantId 租户 ID
   * @param managerId MT Manager ID
   * @param scopes 权限作用域列表 (默认 ["*"] 表示所有权限)
   * @param operatorId 操作者 ID
   * @returns 生成的 API Key 和 Secret (Secret 仅返回一次)
   */
  async generateApiKey(
    tenantId: string,
    managerId: string,
    scopes: string[] = ['*'],
    operatorId?: string,
  ): Promise<GenerateApiKeyResponse> {
    // 验证 Manager 存在且属于该租户
    const manager = await this.prisma.mtManager.findFirst({
      where: { id: managerId, tenantId },
    });

    if (!manager) {
      throw new NotFoundException('MT 经理账号不存在');
    }

    // 检查是否已有 API Key
    if (manager.apiKeyId) {
      throw new ConflictException(
        '该经理账号已有 API Key，请先撤销现有 Key 后再生成新的',
      );
    }

    // 验证作用域格式
    const validScopes = this.validateScopes(scopes);

    // 生成 API Key ID 和 Secret
    const apiKeyId = this.generateApiKeyId();
    const apiSecret = this.generateApiSecret();

    // 使用 AES 加密 Secret (可逆，允许后续查看)
    const encryptedSecret = this.encryptionService.encryptToString(apiSecret, {
      associatedData: `manager:${managerId}`,
    });

    // 更新数据库
    await this.prisma.mtManager.update({
      where: { id: managerId },
      data: {
        apiKeyId,
        apiKeySecretHash: encryptedSecret, // 存储加密后的 Secret
        apiKeyEnabled: true,
        apiKeyScopes: validScopes,
        apiKeyCreatedAt: new Date(),
        apiKeyLastUsedAt: null,
        apiKeyLastUsedIp: null,
      },
    });

    this.logger.log(
      `为 MT 经理账号生成 API Key: ${managerId} (租户: ${tenantId}, 作用域: [${validScopes.join(', ')}], 操作者: ${operatorId || 'system'})`,
    );

    return {
      apiKeyId,
      apiSecret,
      managerId,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * 撤销 MT Manager 的 API Key
   */
  async revokeApiKey(
    tenantId: string,
    managerId: string,
    operatorId?: string,
  ): Promise<void> {
    const manager = await this.prisma.mtManager.findFirst({
      where: { id: managerId, tenantId },
    });

    if (!manager) {
      throw new NotFoundException('MT 经理账号不存在');
    }

    if (!manager.apiKeyId) {
      throw new BadRequestException('该经理账号没有 API Key');
    }

    // 清除 API Key 相关字段
    await this.prisma.mtManager.update({
      where: { id: managerId },
      data: {
        apiKeyId: null,
        apiKeySecretHash: null,
        apiKeyEnabled: false,
        apiKeyCreatedAt: null,
        apiKeyLastUsedAt: null,
        apiKeyLastUsedIp: null,
      },
    });

    this.logger.log(
      `撤销 MT 经理账号 API Key: ${managerId} (租户: ${tenantId}, 操作者: ${operatorId || 'system'})`,
    );
  }

  /**
   * 启用/禁用 API Key
   */
  async toggleApiKey(
    tenantId: string,
    managerId: string,
    enabled: boolean,
    operatorId?: string,
  ): Promise<void> {
    const manager = await this.prisma.mtManager.findFirst({
      where: { id: managerId, tenantId },
    });

    if (!manager) {
      throw new NotFoundException('MT 经理账号不存在');
    }

    if (!manager.apiKeyId) {
      throw new BadRequestException('该经理账号没有 API Key');
    }

    await this.prisma.mtManager.update({
      where: { id: managerId },
      data: { apiKeyEnabled: enabled },
    });

    this.logger.log(
      `${enabled ? '启用' : '禁用'} MT 经理账号 API Key: ${managerId} (租户: ${tenantId}, 操作者: ${operatorId || 'system'})`,
    );
  }

  /**
   * 更新 API Key IP 白名单
   */
  async updateAllowedIps(
    tenantId: string,
    managerId: string,
    allowedIps: string[],
    operatorId?: string,
  ): Promise<void> {
    const manager = await this.prisma.mtManager.findFirst({
      where: { id: managerId, tenantId },
    });

    if (!manager) {
      throw new NotFoundException('MT 经理账号不存在');
    }

    if (!manager.apiKeyId) {
      throw new BadRequestException('该经理账号没有 API Key');
    }

    await this.prisma.mtManager.update({
      where: { id: managerId },
      data: { apiKeyAllowedIps: allowedIps },
    });

    this.logger.log(
      `更新 MT 经理账号 API Key IP 白名单: ${managerId} (租户: ${tenantId}, 操作者: ${operatorId || 'system'}, IPs: [${allowedIps.join(', ')}])`,
    );
  }

  /**
   * 获取 API Key 状态
   */
  async getApiKeyStatus(
    tenantId: string,
    managerId: string,
  ): Promise<ApiKeyStatusDto> {
    const manager = await this.prisma.mtManager.findFirst({
      where: { id: managerId, tenantId },
      select: {
        apiKeyId: true,
        apiKeyEnabled: true,
        apiKeyAllowedIps: true,
        apiKeyScopes: true,
        apiKeyCreatedAt: true,
        apiKeyLastUsedAt: true,
        apiKeyLastUsedIp: true,
      },
    });

    if (!manager) {
      throw new NotFoundException('MT 经理账号不存在');
    }

    return {
      hasApiKey: !!manager.apiKeyId,
      apiKeyId: manager.apiKeyId ? this.maskApiKeyId(manager.apiKeyId) : null,
      apiKeyEnabled: manager.apiKeyEnabled,
      apiKeyAllowedIps: manager.apiKeyAllowedIps || [],
      apiKeyScopes: manager.apiKeyScopes || ['*'],
      apiKeyCreatedAt: manager.apiKeyCreatedAt?.toISOString() || null,
      apiKeyLastUsedAt: manager.apiKeyLastUsedAt?.toISOString() || null,
      apiKeyLastUsedIp: manager.apiKeyLastUsedIp,
    };
  }

  /**
   * 更新 API Key 作用域
   */
  async updateScopes(
    tenantId: string,
    managerId: string,
    scopes: string[],
    operatorId?: string,
  ): Promise<void> {
    const manager = await this.prisma.mtManager.findFirst({
      where: { id: managerId, tenantId },
    });

    if (!manager) {
      throw new NotFoundException('MT 经理账号不存在');
    }

    if (!manager.apiKeyId) {
      throw new BadRequestException('该经理账号没有 API Key');
    }

    // 验证作用域格式
    const validScopes = this.validateScopes(scopes);

    await this.prisma.mtManager.update({
      where: { id: managerId },
      data: { apiKeyScopes: validScopes },
    });

    this.logger.log(
      `更新 MT 经理账号 API Key 作用域: ${managerId} (租户: ${tenantId}, 操作者: ${operatorId || 'system'}, 作用域: [${validScopes.join(', ')}])`,
    );
  }

  /**
   * 获取解密后的 API Secret
   * 用于管理界面显示（需要租户管理员权限）
   */
  async getApiSecret(
    tenantId: string,
    managerId: string,
  ): Promise<{ apiKeyId: string; apiSecret: string }> {
    const manager = await this.prisma.mtManager.findFirst({
      where: { id: managerId, tenantId },
      select: {
        apiKeyId: true,
        apiKeySecretHash: true,
      },
    });

    if (!manager) {
      throw new NotFoundException('MT 经理账号不存在');
    }

    if (!manager.apiKeyId || !manager.apiKeySecretHash) {
      throw new BadRequestException('该经理账号没有 API Key');
    }

    // 解密 Secret
    try {
      const apiSecret = this.encryptionService.decryptFromString(
        manager.apiKeySecretHash,
        { associatedData: `manager:${managerId}` },
      );

      return {
        apiKeyId: manager.apiKeyId,
        apiSecret,
      };
    } catch (error) {
      this.logger.error(`解密 API Secret 失败: ${error}`);
      throw new BadRequestException('无法获取 API Secret，请重新生成');
    }
  }

  // ============================================
  // 认证方法
  // ============================================

  /**
   * 使用 API Key + Secret 进行认证
   *
   * @param apiKeyId API Key ID
   * @param apiSecret API Secret
   * @param clientIp 客户端 IP
   * @returns 认证响应 (Access Token + Refresh Token)
   */
  async authenticate(
    apiKeyId: string,
    apiSecret: string,
    clientIp?: string,
  ): Promise<ApiKeyAuthResponse> {
    // 查找 Manager
    const manager = await this.prisma.mtManager.findFirst({
      where: { apiKeyId },
      select: {
        id: true,
        tenantId: true,
        managerLogin: true,
        displayName: true,
        isActive: true,
        apiKeyId: true,
        apiKeySecretHash: true,
        apiKeyEnabled: true,
        apiKeyAllowedIps: true,
        server: {
          select: {
            id: true,
            serverId: true,
            displayName: true,
            platformType: true,
            middlewareId: true,
            middlewareUrl: true,
          },
        },
      },
    });

    if (!manager) {
      throw new UnauthorizedException('无效的 API Key');
    }

    // 检查是否启用
    if (!manager.apiKeyEnabled) {
      throw new UnauthorizedException('API Key 已被禁用');
    }

    // 检查 Manager 是否激活
    if (!manager.isActive) {
      throw new UnauthorizedException('经理账号未激活');
    }

    // 验证 Secret
    if (!manager.apiKeySecretHash) {
      throw new UnauthorizedException('API Key 配置异常');
    }

    // 解密存储的 Secret 并比较
    try {
      const storedSecret = this.encryptionService.decryptFromString(
        manager.apiKeySecretHash,
        { associatedData: `manager:${manager.id}` },
      );
      if (storedSecret !== apiSecret) {
        throw new UnauthorizedException('无效的 API Secret');
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`解密 API Secret 失败: ${error}`);
      throw new UnauthorizedException('无效的 API Secret');
    }

    // 检查 IP 白名单
    if (manager.apiKeyAllowedIps && manager.apiKeyAllowedIps.length > 0) {
      if (!clientIp) {
        this.logger.warn(`API Key 认证被拒绝: 无法获取客户端 IP (Manager: ${manager.managerLogin})`);
        throw new UnauthorizedException('无法验证客户端 IP');
      }
      if (!this.checkIpAllowed(clientIp, manager.apiKeyAllowedIps)) {
        this.logger.warn(
          `API Key 认证被拒绝: IP ${clientIp} 不在白名单中 (Manager: ${manager.managerLogin})`,
        );
        throw new UnauthorizedException('IP 地址不在白名单中');
      }
    }

    // 检查服务器是否配置中间件
    if (!manager.server.middlewareUrl) {
      throw new BadRequestException('关联的 MT 服务器未配置中间件');
    }

    // 更新最后使用记录
    await this.prisma.mtManager.update({
      where: { id: manager.id },
      data: {
        apiKeyLastUsedAt: new Date(),
        apiKeyLastUsedIp: clientIp,
      },
    });

    // 生成 Token
    const accessToken = this.generateAccessToken(manager);
    const refreshToken = this.generateRefreshToken(manager);

    this.logger.log(
      `API Key 认证成功: ${manager.managerLogin} (租户: ${manager.tenantId}, IP: ${clientIp || 'unknown'})`,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpiresIn,
      refreshExpiresIn: this.refreshTokenExpiresIn,
      tokenType: 'Bearer',
      manager: {
        id: manager.id,
        managerLogin: manager.managerLogin.toString(),
        displayName: manager.displayName,
        serverId: manager.server.serverId,
        serverName: manager.server.displayName,
        platformType: manager.server.platformType,
      },
    };
  }

  /**
   * 使用 Refresh Token 刷新 Access Token
   */
  async refreshAccessToken(
    refreshToken: string,
    clientIp?: string,
  ): Promise<RefreshTokenResponse> {
    // 验证 Refresh Token
    let payload: ApiKeyTokenPayload;
    try {
      payload = jwt.verify(refreshToken, this.jwtSecret) as ApiKeyTokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Refresh Token 已过期，请重新使用 API Key 认证');
      }
      throw new UnauthorizedException('无效的 Refresh Token');
    }

    // 检查 Token 类型
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('无效的 Token 类型');
    }

    // 验证 Manager 仍然有效
    const manager = await this.prisma.mtManager.findFirst({
      where: {
        id: payload.managerId,
        apiKeyId: payload.apiKeyId,
        apiKeyEnabled: true,
        isActive: true,
      },
      select: {
        id: true,
        tenantId: true,
        managerLogin: true,
        apiKeyId: true,
        apiKeyAllowedIps: true,
        server: {
          select: {
            id: true,
            serverId: true,
            displayName: true,
            platformType: true,
            middlewareId: true,
            middlewareUrl: true,
          },
        },
      },
    });

    if (!manager) {
      throw new UnauthorizedException('API Key 已被撤销或经理账号已禁用');
    }

    // 检查 IP 白名单
    if (manager.apiKeyAllowedIps && manager.apiKeyAllowedIps.length > 0) {
      if (!clientIp) {
        this.logger.warn(`Token 刷新被拒绝: 无法获取客户端 IP (Manager: ${manager.managerLogin})`);
        throw new UnauthorizedException('无法验证客户端 IP');
      }
      if (!this.checkIpAllowed(clientIp, manager.apiKeyAllowedIps)) {
        this.logger.warn(
          `Token 刷新被拒绝: IP ${clientIp} 不在白名单中 (Manager: ${manager.managerLogin})`,
        );
        throw new UnauthorizedException('IP 地址不在白名单中');
      }
    }

    // 更新最后使用记录
    await this.prisma.mtManager.update({
      where: { id: manager.id },
      data: {
        apiKeyLastUsedAt: new Date(),
        apiKeyLastUsedIp: clientIp,
      },
    });

    // 生成新 Token
    const accessToken = this.generateAccessToken(manager);
    const newRefreshToken = this.generateRefreshToken(manager);

    this.logger.debug(
      `刷新 API Key Token: ${manager.managerLogin} (租户: ${manager.tenantId})`,
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.accessTokenExpiresIn,
      refreshExpiresIn: this.refreshTokenExpiresIn,
    };
  }

  /**
   * 验证 Access Token 并返回 Payload
   */
  validateAccessToken(accessToken: string): ApiKeyTokenPayload {
    try {
      const payload = jwt.verify(accessToken, this.jwtSecret) as ApiKeyTokenPayload;

      if (payload.type !== 'access') {
        throw new UnauthorizedException('无效的 Token 类型');
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Access Token 已过期');
      }
      throw new UnauthorizedException('无效的 Access Token');
    }
  }

  // ============================================
  // 私有辅助方法
  // ============================================

  /**
   * 生成 API Key ID
   * 格式: mk_<24位随机字符>
   */
  private generateApiKeyId(): string {
    const randomPart = crypto.randomBytes(12).toString('hex');
    return `${API_KEY_PREFIX}${randomPart}`;
  }

  /**
   * 生成 API Secret
   * 格式: ms_<48位随机字符>
   */
  private generateApiSecret(): string {
    const randomPart = crypto.randomBytes(24).toString('hex');
    return `${SECRET_PREFIX}${randomPart}`;
  }

  /**
   * 掩码 API Key ID (显示前8位)
   */
  private maskApiKeyId(apiKeyId: string): string {
    if (apiKeyId.length <= 12) {
      return apiKeyId.substring(0, 8) + '****';
    }
    return apiKeyId.substring(0, 12) + '****' + apiKeyId.slice(-4);
  }

  /**
   * 生成 Access Token (精简版)
   *
   * Token 只包含最小必要信息: type, managerId, tenantId, apiKeyId
   * 其他信息在 Guard 验证时从数据库获取，确保:
   * 1. 减小 Token 体积
   * 2. 避免敏感信息在 Token 中传输
   * 3. 使用最新的数据库配置
   */
  private generateAccessToken(manager: {
    id: string;
    tenantId: string;
    apiKeyId: string | null;
  }): string {
    const payload: Omit<ApiKeyTokenPayload, 'iat' | 'exp'> = {
      type: 'access',
      managerId: manager.id,
      tenantId: manager.tenantId,
      apiKeyId: manager.apiKeyId!,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.accessTokenExpiresIn,
      issuer: 'tenant-api',
      subject: manager.id,
    });
  }

  /**
   * 生成 Refresh Token (精简版)
   *
   * 与 Access Token 使用相同的精简结构
   */
  private generateRefreshToken(manager: {
    id: string;
    tenantId: string;
    apiKeyId: string | null;
  }): string {
    const payload: Omit<ApiKeyTokenPayload, 'iat' | 'exp'> = {
      type: 'refresh',
      managerId: manager.id,
      tenantId: manager.tenantId,
      apiKeyId: manager.apiKeyId!,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.refreshTokenExpiresIn,
      issuer: 'tenant-api',
      subject: manager.id,
    });
  }

  /**
   * 检查 IP 是否在白名单中
   * 支持精确匹配和 CIDR 格式 (/24 和 /16)
   */
  private checkIpAllowed(clientIp: string, allowedIps: string[]): boolean {
    for (const allowed of allowedIps) {
      // 精确匹配
      if (allowed === clientIp) {
        return true;
      }

      // CIDR 匹配 (简化实现，支持 /24 和 /16)
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
   * 可用的作用域列表
   */
  private readonly availableScopes = [
    '*',                  // 所有权限
    'users:read',         // 读取用户数据
    'users:write',        // 写入用户数据
    'positions:read',     // 读取持仓数据
    'history:read',       // 读取交易历史
    'quotes:read',        // 读取报价数据
    'trading:execute',    // 执行交易操作
    'reports:read',       // 读取报表数据
    'risk:read',          // 读取风控数据
    'settings:read',      // 读取设置
    'settings:write',     // 写入设置
  ];

  /**
   * 验证作用域格式
   * 返回有效的作用域列表，过滤无效的作用域
   */
  private validateScopes(scopes: string[]): string[] {
    if (!scopes || scopes.length === 0) {
      return ['*']; // 默认所有权限
    }

    // 如果包含通配符，直接返回 ['*']
    if (scopes.includes('*')) {
      return ['*'];
    }

    // 过滤有效的作用域
    const validScopes = scopes.filter((scope) => {
      // 检查是否是预定义的作用域
      if (this.availableScopes.includes(scope)) {
        return true;
      }

      // 检查是否是有效的通配符格式 (如 trading:*)
      if (scope.endsWith(':*')) {
        const prefix = scope.replace(':*', '');
        return this.availableScopes.some(
          (s) => s !== '*' && s.startsWith(prefix + ':'),
        );
      }

      return false;
    });

    // 如果没有有效作用域，返回默认值
    if (validScopes.length === 0) {
      this.logger.warn(`无效的作用域列表: [${scopes.join(', ')}]，使用默认值 ['*']`);
      return ['*'];
    }

    return validScopes;
  }

  /**
   * 获取可用的作用域列表（供前端使用）
   */
  getAvailableScopes(): { scopes: Array<{ value: string; label: string }> } {
    return {
      scopes: [
        { value: '*', label: '所有权限' },
        { value: 'users:read', label: '读取用户数据' },
        { value: 'users:write', label: '写入用户数据' },
        { value: 'positions:read', label: '读取持仓数据' },
        { value: 'history:read', label: '读取交易历史' },
        { value: 'quotes:read', label: '读取报价数据' },
        { value: 'trading:execute', label: '执行交易操作' },
        { value: 'reports:read', label: '读取报表数据' },
        { value: 'risk:read', label: '读取风控数据' },
        { value: 'settings:read', label: '读取设置' },
        { value: 'settings:write', label: '写入设置' },
      ],
    };
  }
}
