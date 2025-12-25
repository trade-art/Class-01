import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * 加密服务 - 用于加密/解密敏感数据
 * 使用 AES-256-GCM 算法
 */
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly authTagLength = 16; // 128 bits
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const encryptionKey = this.configService.get<string>('MT_PASSWORD_ENCRYPTION_KEY');

    if (!encryptionKey) {
      // 使用默认密钥 (仅用于开发环境)
      console.warn(
        'WARNING: MT_PASSWORD_ENCRYPTION_KEY not set, using default key. DO NOT use in production!',
      );
      this.key = crypto.scryptSync('default-dev-key-change-in-production', 'salt', this.keyLength);
    } else {
      // 使用环境变量中的密钥
      this.key = crypto.scryptSync(encryptionKey, 'mt5-platform-salt', this.keyLength);
    }
  }

  /**
   * 加密字符串
   * @param plaintext 明文
   * @returns 加密后的字符串 (格式: iv:authTag:ciphertext, Base64 编码)
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv, {
      authTagLength: this.authTagLength,
    });

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // 格式: iv:authTag:ciphertext (都是 Base64 编码)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
  }

  /**
   * 解密字符串
   * @param encryptedText 加密后的字符串 (格式: iv:authTag:ciphertext)
   * @returns 解密后的明文
   */
  decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format');
    }

    const [ivBase64, authTagBase64, ciphertext] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv, {
      authTagLength: this.authTagLength,
    });
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }

  /**
   * 生成安全的随机 API Key
   * @param prefix 前缀 (如 'mw_' 表示中间件)
   * @returns API Key 字符串
   */
  generateApiKey(prefix: string = 'mw_'): string {
    const randomBytes = crypto.randomBytes(24);
    return `${prefix}${randomBytes.toString('base64url')}`;
  }

  /**
   * 计算字符串的 SHA-256 哈希
   * @param input 输入字符串
   * @returns 哈希值 (十六进制)
   */
  hash(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  /**
   * 时间安全的字符串比较 (防止时序攻击)
   * @param a 字符串 a
   * @param b 字符串 b
   * @returns 是否相等
   */
  timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}
