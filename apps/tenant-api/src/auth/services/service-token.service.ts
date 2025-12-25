/**
 * Service Token 服务
 *
 * 用于生成、验证和刷新 Service Token
 * Service Token 用于 Tenant API 与 MT5 中间件之间的安全通信
 *
 * Token 结构:
 * - tenantId: 租户 ID
 * - instanceId: 中间件实例 ID
 * - serverId: MT 服务器 ID
 * - managerLogin: Manager 账号
 * - encryptedPassword: AES-256-GCM 加密的 Manager 密码
 * - scopes: 权限范围
 *
 * Requirements: REQ-ST1.1, REQ-ST1.2
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

/**
 * Service Token Payload 结构 (传统模式，包含密码)
 */
export interface ServiceTokenPayload {
  /** 租户 ID */
  tenantId: string;
  /** 中间件实例 ID */
  instanceId: string;
  /** MT 服务器 ID */
  serverId: string;
  /** Manager 账号 */
  managerLogin: number;
  /** AES-256-GCM 加密后的 Manager 密码 (Base64) */
  encryptedPassword: string;
  /** 权限范围 */
  scopes: string[];
  /** Manager UUID - 用于连接池查找 (可选) */
  managerId?: string;
  /** 签发时间 */
  iat?: number;
  /** 过期时间 */
  exp?: number;
  /** 签发者 */
  iss?: string;
}

/**
 * 连接池模式 Service Token Payload (精简版)
 *
 * 安全改进: 不包含密码和敏感信息
 * C++ 中间件通过 managerId 从连接池获取已建立的连接
 */
export interface PoolModeServiceTokenPayload {
  /** Manager ID (UUID) - 用于从连接池获取连接 */
  managerId: string;
  /** 租户 ID */
  tenantId: string;
  /** API Key ID (可选，用于追踪) */
  apiKeyId?: string;
  /** 权限范围 */
  scopes: string[];
  /** Token 模式标识 */
  mode: 'pool';
  /** 签发时间 */
  iat?: number;
  /** 过期时间 */
  exp?: number;
  /** 签发者 */
  iss?: string;
}

/**
 * 生成 Token 的请求参数 (传统模式)
 */
export interface GenerateTokenRequest {
  /** 租户 ID */
  tenantId: string;
  /** 中间件实例 ID */
  instanceId: string;
  /** MT 服务器 ID */
  serverId: string;
  /** Manager 账号 */
  managerLogin: number;
  /** Manager 密码 (明文，将被加密) */
  managerPassword: string;
  /** 权限范围 (默认: ['*']) */
  scopes?: string[];
  /** 自定义过期时间 (秒) */
  expiresIn?: number;
  /** Manager UUID - 用于连接池查找 (可选) */
  managerId?: string;
}

/**
 * 连接池模式生成 Token 的请求参数 (精简版)
 */
export interface GeneratePoolModeTokenRequest {
  /** Manager ID (UUID) */
  managerId: string;
  /** 租户 ID */
  tenantId: string;
  /** API Key ID (可选) */
  apiKeyId?: string;
  /** 权限范围 (默认: ['*']) */
  scopes?: string[];
  /** 自定义过期时间 (秒) */
  expiresIn?: number;
}

/**
 * 生成 Token 的响应
 */
export interface GenerateTokenResponse {
  /** JWT Token */
  token: string;
  /** 过期时间 (Unix 时间戳) */
  expiresAt: number;
  /** Token 类型 */
  tokenType: 'Bearer';
}

/**
 * 验证 Token 的响应
 */
export interface ValidateTokenResponse {
  /** 是否有效 */
  valid: boolean;
  /** 解析后的 Payload (仅当 valid=true) */
  payload?: ServiceTokenPayload;
  /** 解密后的 Manager 密码 (仅当 valid=true) */
  decryptedPassword?: string;
  /** 错误信息 (仅当 valid=false) */
  error?: string;
}

@Injectable()
export class ServiceTokenService {
  private readonly logger = new Logger(ServiceTokenService.name);

  /** JWT 签名密钥 */
  private readonly jwtSecret: string;

  /** AES-256-GCM 加密密钥 (32 字节) */
  private readonly encryptionKey: Buffer;

  /** Token 默认过期时间 (秒) */
  private readonly defaultExpiresIn: number;

  /** Token 签发者 */
  private readonly issuer: string;

  constructor(private readonly configService: ConfigService) {
    this.jwtSecret = this.configService.get<string>('serviceToken.jwtSecret')!;
    this.defaultExpiresIn = this.configService.get<number>('serviceToken.expiresIn')!;
    this.issuer = this.configService.get<string>('serviceToken.issuer')!;

    // 将 hex 字符串转换为 32 字节 Buffer
    const encryptionKeyHex = this.configService.get<string>('serviceToken.encryptionKey')!;
    this.encryptionKey = Buffer.from(encryptionKeyHex, 'hex');

    if (this.encryptionKey.length !== 32) {
      throw new Error(
        `Service Token encryption key must be 32 bytes (64 hex characters), got ${this.encryptionKey.length} bytes`,
      );
    }

    this.logger.log('ServiceTokenService initialized');
  }

  /**
   * 生成 Service Token
   *
   * @param request 生成请求参数
   * @returns 生成的 Token 和过期时间
   *
   * Requirements: REQ-ST1.1
   */
  generateToken(request: GenerateTokenRequest): GenerateTokenResponse {
    const {
      tenantId,
      instanceId,
      serverId,
      managerLogin,
      managerPassword,
      scopes = ['*'],
      expiresIn = this.defaultExpiresIn,
      managerId,
    } = request;

    // 加密 Manager 密码
    const encryptedPassword = this.encryptPassword(managerPassword);

    // 构建 Token Payload
    const payload: Omit<ServiceTokenPayload, 'iat' | 'exp' | 'iss'> = {
      tenantId,
      instanceId,
      serverId,
      managerLogin,
      encryptedPassword,
      scopes,
      ...(managerId && { managerId }),
    };

    // 计算过期时间
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + expiresIn;

    // 签发 JWT (必须包含 typ: 'JWT' 头部，C++ 中间件验证需要)
    const token = jwt.sign(payload, this.jwtSecret, {
      algorithm: 'HS256',
      expiresIn,
      issuer: this.issuer,
      header: { alg: 'HS256', typ: 'JWT' },
    });

    this.logger.debug(
      `Generated Service Token: tenant=${tenantId}, server=${serverId}, login=${managerLogin}, expiresIn=${expiresIn}s`,
    );

    return {
      token,
      expiresAt,
      tokenType: 'Bearer',
    };
  }

  /**
   * 刷新 Service Token
   *
   * 使用现有 Token 中的信息生成新 Token
   * 需要提供原始密码，因为加密密码无法逆向获取原文后重新加密
   *
   * @param existingToken 现有的 Token
   * @param managerPassword Manager 密码 (明文)
   * @param newExpiresIn 新的过期时间 (秒)
   * @returns 新的 Token
   *
   * Requirements: REQ-ST1.2
   */
  refreshToken(
    existingToken: string,
    managerPassword: string,
    newExpiresIn?: number,
  ): GenerateTokenResponse {
    // 验证现有 Token (允许过期)
    const validation = this.validateToken(existingToken, { ignoreExpiration: true });
    if (!validation.valid || !validation.payload) {
      throw new Error(`Invalid token: ${validation.error}`);
    }

    const { tenantId, instanceId, serverId, managerLogin, scopes } = validation.payload;

    // 生成新 Token
    return this.generateToken({
      tenantId,
      instanceId,
      serverId,
      managerLogin,
      managerPassword,
      scopes,
      expiresIn: newExpiresIn,
    });
  }

  /**
   * 验证 Service Token
   *
   * @param token JWT Token
   * @param options 验证选项
   * @returns 验证结果
   *
   * Requirements: REQ-ST1.2
   */
  validateToken(
    token: string,
    options?: { ignoreExpiration?: boolean },
  ): ValidateTokenResponse {
    try {
      // 验证并解析 JWT
      const payload = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
        issuer: this.issuer,
        ignoreExpiration: options?.ignoreExpiration ?? false,
      }) as ServiceTokenPayload;

      // 解密密码
      let decryptedPassword: string | undefined;
      try {
        decryptedPassword = this.decryptPassword(payload.encryptedPassword);
      } catch (decryptError) {
        this.logger.warn(`Failed to decrypt password: ${decryptError}`);
        return {
          valid: false,
          error: 'Password decryption failed',
        };
      }

      return {
        valid: true,
        payload,
        decryptedPassword,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (error instanceof jwt.TokenExpiredError) {
        return {
          valid: false,
          error: 'Token expired',
        };
      }

      if (error instanceof jwt.JsonWebTokenError) {
        return {
          valid: false,
          error: `Invalid token: ${errorMessage}`,
        };
      }

      return {
        valid: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 使用 AES-256-GCM 加密密码
   *
   * 格式: base64(iv + authTag + ciphertext)
   * - iv: 12 字节
   * - authTag: 16 字节
   * - ciphertext: 变长
   *
   * @param password 明文密码
   * @returns Base64 编码的加密数据
   */
  encryptPassword(password: string): string {
    // 生成随机 IV (12 字节 for GCM)
    const iv = crypto.randomBytes(12);

    // 创建加密器
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    // 加密
    const encrypted = Buffer.concat([
      cipher.update(password, 'utf8'),
      cipher.final(),
    ]);

    // 获取认证标签 (16 字节)
    const authTag = cipher.getAuthTag();

    // 组合: iv + ciphertext + authTag (与 C++ 中间件格式一致)
    // C++ CredentialEncryption.cpp 期望: nonce(12) || ciphertext || tag(16)
    const combined = Buffer.concat([iv, encrypted, authTag]);

    return combined.toString('base64');
  }

  /**
   * 使用 AES-256-GCM 解密密码
   *
   * @param encryptedData Base64 编码的加密数据
   * @returns 明文密码
   */
  decryptPassword(encryptedData: string): string {
    // 解码 Base64
    const combined = Buffer.from(encryptedData, 'base64');

    // 提取各部分 (格式: iv(12) + ciphertext + authTag(16))
    // 与 C++ 中间件格式一致: nonce(12) || ciphertext || tag(16)
    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(combined.length - 16);
    const ciphertext = combined.subarray(12, combined.length - 16);

    // 创建解密器
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    // 解密
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * 获取 Token 的剩余有效时间 (秒)
   *
   * @param token JWT Token
   * @returns 剩余秒数，如果已过期返回 0，如果无效返回 -1
   */
  getTokenRemainingTime(token: string): number {
    try {
      const decoded = jwt.decode(token) as ServiceTokenPayload | null;
      if (!decoded?.exp) {
        return -1;
      }

      const now = Math.floor(Date.now() / 1000);
      const remaining = decoded.exp - now;
      return remaining > 0 ? remaining : 0;
    } catch {
      return -1;
    }
  }

  /**
   * 检查 Token 是否即将过期 (默认 5 分钟内)
   *
   * @param token JWT Token
   * @param threshold 阈值 (秒)，默认 300 秒 (5 分钟)
   * @returns 是否即将过期
   */
  isTokenExpiringSoon(token: string, threshold = 300): boolean {
    const remaining = this.getTokenRemainingTime(token);
    return remaining >= 0 && remaining <= threshold;
  }

  // ============================================
  // 连接池模式 Token 方法
  // ============================================

  /**
   * 生成连接池模式 Service Token (精简版)
   *
   * 此 Token 不包含密码，C++ 中间件通过 managerId 从连接池获取已建立的连接
   *
   * @param request 生成请求参数
   * @returns 生成的 Token 和过期时间
   *
   * Requirements: REQ-10
   */
  generatePoolModeToken(request: GeneratePoolModeTokenRequest): GenerateTokenResponse {
    const {
      managerId,
      tenantId,
      apiKeyId,
      scopes = ['*'],
      expiresIn = this.defaultExpiresIn,
    } = request;

    // 构建精简版 Token Payload
    const payload: Omit<PoolModeServiceTokenPayload, 'iat' | 'exp' | 'iss'> = {
      managerId,
      tenantId,
      apiKeyId,
      scopes,
      mode: 'pool',
    };

    // 计算过期时间
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + expiresIn;

    // 签发 JWT (必须包含 typ: 'JWT' 头部，C++ 中间件验证需要)
    const token = jwt.sign(payload, this.jwtSecret, {
      algorithm: 'HS256',
      expiresIn,
      issuer: this.issuer,
      header: { alg: 'HS256', typ: 'JWT' },
    });

    this.logger.debug(
      `Generated Pool Mode Service Token: managerId=${managerId}, tenant=${tenantId}, expiresIn=${expiresIn}s`,
    );

    return {
      token,
      expiresAt,
      tokenType: 'Bearer',
    };
  }

  /**
   * 验证连接池模式 Service Token
   *
   * @param token JWT Token
   * @param options 验证选项
   * @returns 验证结果
   */
  validatePoolModeToken(
    token: string,
    options?: { ignoreExpiration?: boolean },
  ): { valid: boolean; payload?: PoolModeServiceTokenPayload; error?: string } {
    try {
      // 验证并解析 JWT
      const payload = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
        issuer: this.issuer,
        ignoreExpiration: options?.ignoreExpiration ?? false,
      }) as PoolModeServiceTokenPayload;

      // 检查是否是连接池模式 Token
      if (payload.mode !== 'pool') {
        return {
          valid: false,
          error: 'Not a pool mode token',
        };
      }

      return {
        valid: true,
        payload,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (error instanceof jwt.TokenExpiredError) {
        return {
          valid: false,
          error: 'Token expired',
        };
      }

      if (error instanceof jwt.JsonWebTokenError) {
        return {
          valid: false,
          error: `Invalid token: ${errorMessage}`,
        };
      }

      return {
        valid: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 检测 Token 是否为连接池模式
   *
   * @param token JWT Token
   * @returns 是否为连接池模式 Token
   */
  isPoolModeToken(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as { mode?: string } | null;
      return decoded?.mode === 'pool';
    } catch {
      return false;
    }
  }
}
