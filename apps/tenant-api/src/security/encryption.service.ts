/**
 * 加密服务
 * 提供 AES-256-GCM 加密、密钥管理和密钥轮换功能
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * 加密算法
 */
export const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/**
 * 密钥配置
 */
export interface EncryptionKeyConfig {
  /** 密钥 ID */
  keyId: string;
  /** 密钥（32 字节 = 256 位） */
  key: Buffer;
  /** 创建时间 */
  createdAt: Date;
  /** 过期时间 */
  expiresAt?: Date;
  /** 是否是主密钥 */
  isPrimary: boolean;
}

/**
 * 加密结果
 */
export interface EncryptedData {
  /** 密文（Base64） */
  ciphertext: string;
  /** IV（Base64） */
  iv: string;
  /** 认证标签（Base64） */
  authTag: string;
  /** 密钥 ID */
  keyId: string;
  /** 算法 */
  algorithm: string;
  /** 版本 */
  version: number;
}

/**
 * 加密选项
 */
export interface EncryptOptions {
  /** 关联数据（AAD）- 用于认证但不加密 */
  associatedData?: string;
  /** 密钥 ID（使用特定密钥） */
  keyId?: string;
}

/**
 * 解密选项
 */
export interface DecryptOptions {
  /** 关联数据（AAD）- 必须与加密时相同 */
  associatedData?: string;
}

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);

  /** 密钥存储 */
  private keys: Map<string, EncryptionKeyConfig> = new Map();

  /** 主密钥 ID */
  private primaryKeyId: string = '';

  /** 当前版本 */
  private readonly version = 1;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.initializeKeys();
  }

  /**
   * 初始化密钥
   */
  private async initializeKeys(): Promise<void> {
    // 从环境变量获取主密钥
    const masterKey = this.configService.get<string>('ENCRYPTION_MASTER_KEY');

    if (masterKey) {
      // 使用提供的主密钥
      const keyBuffer = this.deriveKey(masterKey);
      this.addKey({
        keyId: 'master-v1',
        key: keyBuffer,
        createdAt: new Date(),
        isPrimary: true,
      });
    } else {
      // 生成临时密钥（仅用于开发环境）
      this.logger.warn(
        'ENCRYPTION_MASTER_KEY not set. Generating temporary key. DO NOT use in production!',
      );
      const tempKey = crypto.randomBytes(32);
      this.addKey({
        keyId: 'temp-dev-key',
        key: tempKey,
        createdAt: new Date(),
        isPrimary: true,
      });
    }
  }

  /**
   * 从密码派生密钥
   */
  private deriveKey(password: string): Buffer {
    // 使用 PBKDF2 派生密钥
    const salt = this.configService.get<string>('ENCRYPTION_KEY_SALT') || 'mt5-platform-salt';
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  }

  /**
   * 添加密钥
   */
  addKey(config: EncryptionKeyConfig): void {
    this.keys.set(config.keyId, config);
    if (config.isPrimary) {
      this.primaryKeyId = config.keyId;
    }
    this.logger.log(`Encryption key added: ${config.keyId} (primary: ${config.isPrimary})`);
  }

  /**
   * 轮换密钥
   * @param newKeyId 新密钥 ID
   * @param newKey 新密钥
   */
  rotateKey(newKeyId: string, newKey: Buffer): void {
    // 将当前主密钥标记为非主密钥
    const currentPrimary = this.keys.get(this.primaryKeyId);
    if (currentPrimary) {
      currentPrimary.isPrimary = false;
    }

    // 添加新的主密钥
    this.addKey({
      keyId: newKeyId,
      key: newKey,
      createdAt: new Date(),
      isPrimary: true,
    });

    this.logger.log(`Key rotated. New primary: ${newKeyId}, Previous: ${this.primaryKeyId}`);
  }

  /**
   * 生成新密钥
   */
  generateKey(): { keyId: string; key: Buffer } {
    const keyId = `key-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const key = crypto.randomBytes(32);
    return { keyId, key };
  }

  /**
   * 加密数据
   * @param plaintext 明文
   * @param options 加密选项
   */
  encrypt(plaintext: string | Buffer, options: EncryptOptions = {}): EncryptedData {
    const keyId = options.keyId || this.primaryKeyId;
    const keyConfig = this.keys.get(keyId);

    if (!keyConfig) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }

    // 检查密钥是否过期
    if (keyConfig.expiresAt && keyConfig.expiresAt < new Date()) {
      throw new Error(`Encryption key expired: ${keyId}`);
    }

    // 生成随机 IV（12 字节是 GCM 推荐的长度）
    const iv = crypto.randomBytes(12);

    // 创建加密器
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, keyConfig.key, iv);

    // 设置关联数据（如果提供）
    if (options.associatedData) {
      cipher.setAAD(Buffer.from(options.associatedData, 'utf8'));
    }

    // 加密
    const plaintextBuffer = Buffer.isBuffer(plaintext)
      ? plaintext
      : Buffer.from(plaintext, 'utf8');

    const encrypted = Buffer.concat([
      cipher.update(plaintextBuffer),
      cipher.final(),
    ]);

    // 获取认证标签
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      keyId,
      algorithm: ENCRYPTION_ALGORITHM,
      version: this.version,
    };
  }

  /**
   * 解密数据
   * @param encryptedData 加密数据
   * @param options 解密选项
   */
  decrypt(encryptedData: EncryptedData, options: DecryptOptions = {}): Buffer {
    const keyConfig = this.keys.get(encryptedData.keyId);

    if (!keyConfig) {
      throw new Error(`Decryption key not found: ${encryptedData.keyId}`);
    }

    // 解码 Base64
    const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');

    // 创建解密器
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, keyConfig.key, iv);
    decipher.setAuthTag(authTag);

    // 设置关联数据（如果提供）
    if (options.associatedData) {
      decipher.setAAD(Buffer.from(options.associatedData, 'utf8'));
    }

    // 解密
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted;
  }

  /**
   * 解密为字符串
   */
  decryptToString(encryptedData: EncryptedData, options: DecryptOptions = {}): string {
    return this.decrypt(encryptedData, options).toString('utf8');
  }

  /**
   * 加密为字符串（序列化）
   */
  encryptToString(plaintext: string | Buffer, options: EncryptOptions = {}): string {
    const encrypted = this.encrypt(plaintext, options);
    return JSON.stringify(encrypted);
  }

  /**
   * 从字符串解密（反序列化）
   */
  decryptFromString(encryptedString: string, options: DecryptOptions = {}): string {
    const encryptedData = JSON.parse(encryptedString) as EncryptedData;
    return this.decryptToString(encryptedData, options);
  }

  /**
   * 重新加密（使用当前主密钥）
   * 用于密钥轮换后的数据迁移
   */
  reEncrypt(encryptedData: EncryptedData, options: DecryptOptions = {}): EncryptedData {
    // 解密
    const plaintext = this.decrypt(encryptedData, options);

    // 使用新密钥重新加密
    return this.encrypt(plaintext, {
      associatedData: options.associatedData,
    });
  }

  /**
   * 生成安全随机字符串
   */
  generateRandomString(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url').slice(0, length);
  }

  /**
   * 生成安全随机字节
   */
  generateRandomBytes(length: number = 32): Buffer {
    return crypto.randomBytes(length);
  }

  /**
   * 计算 HMAC
   */
  hmac(data: string | Buffer, key?: Buffer): string {
    const hmacKey = key || this.keys.get(this.primaryKeyId)?.key;
    if (!hmacKey) {
      throw new Error('No HMAC key available');
    }

    return crypto
      .createHmac('sha256', hmacKey)
      .update(data)
      .digest('base64');
  }

  /**
   * 验证 HMAC
   */
  verifyHmac(data: string | Buffer, expectedHmac: string, key?: Buffer): boolean {
    const actualHmac = this.hmac(data, key);
    return crypto.timingSafeEqual(
      Buffer.from(actualHmac),
      Buffer.from(expectedHmac),
    );
  }

  /**
   * 哈希数据（单向）
   */
  hash(data: string | Buffer, algorithm: string = 'sha256'): string {
    return crypto
      .createHash(algorithm)
      .update(data)
      .digest('hex');
  }

  /**
   * 获取当前主密钥 ID
   */
  getPrimaryKeyId(): string {
    return this.primaryKeyId;
  }

  /**
   * 获取所有密钥 ID
   */
  getKeyIds(): string[] {
    return Array.from(this.keys.keys());
  }

  /**
   * 检查密钥是否存在
   */
  hasKey(keyId: string): boolean {
    return this.keys.has(keyId);
  }

  /**
   * 移除过期密钥
   */
  removeExpiredKeys(): number {
    let removed = 0;
    const now = new Date();

    for (const [keyId, config] of this.keys.entries()) {
      if (config.expiresAt && config.expiresAt < now && !config.isPrimary) {
        this.keys.delete(keyId);
        removed++;
        this.logger.log(`Expired encryption key removed: ${keyId}`);
      }
    }

    return removed;
  }
}
