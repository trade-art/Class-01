import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Webhook 验证结果
 */
export interface WebhookValidationResult {
  isValid: boolean;
  instanceId?: string;
  error?: string;
}

/**
 * Webhook 签名验证服务
 * 验证中间件发送的 Webhook 请求签名
 * middleware-integration Task 8
 */
@Injectable()
export class WebhookValidatorService {
  private readonly logger = new Logger(WebhookValidatorService.name);

  // 签名有效期 (5 分钟)
  private readonly SIGNATURE_VALIDITY_MS = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 验证 Webhook 请求
   */
  async validateWebhook(
    instanceId: string,
    signature: string,
    timestamp: string,
    body: string,
  ): Promise<WebhookValidationResult> {
    try {
      // 1. 验证时间戳有效性 (防止重放攻击)
      const timestampValid = this.validateTimestamp(timestamp);
      if (!timestampValid) {
        return {
          isValid: false,
          error: 'Timestamp expired or invalid',
        };
      }

      // 2. 获取实例的 Webhook Secret
      const instance = await this.prisma.middlewareInstance.findUnique({
        where: { id: instanceId },
        select: { id: true, webhookSecret: true },
      });

      if (!instance) {
        return {
          isValid: false,
          error: 'Instance not found',
        };
      }

      if (!instance.webhookSecret) {
        return {
          isValid: false,
          error: 'Webhook secret not configured for this instance',
        };
      }

      // 3. 计算期望的签名
      const expectedSignature = this.computeSignature(
        instance.webhookSecret,
        timestamp,
        body,
      );

      // 4. 使用时间安全比较验证签名
      const isValid = this.safeCompare(signature, expectedSignature);

      if (!isValid) {
        this.logger.warn(`Invalid webhook signature for instance ${instanceId}`);
        return {
          isValid: false,
          error: 'Invalid signature',
        };
      }

      return {
        isValid: true,
        instanceId,
      };
    } catch (error: any) {
      this.logger.error(`Webhook validation error: ${error.message}`, error.stack);
      return {
        isValid: false,
        error: error.message,
      };
    }
  }

  /**
   * 验证时间戳是否在有效期内
   */
  private validateTimestamp(timestamp: string): boolean {
    try {
      const webhookTime = parseInt(timestamp, 10);
      const now = Date.now();
      const diff = Math.abs(now - webhookTime);

      return diff <= this.SIGNATURE_VALIDITY_MS;
    } catch {
      return false;
    }
  }

  /**
   * 计算 HMAC-SHA256 签名
   * 签名格式: HMAC-SHA256(secret, timestamp + '.' + body)
   */
  private computeSignature(secret: string, timestamp: string, body: string): string {
    const payload = `${timestamp}.${body}`;
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * 时间安全的字符串比较
   */
  private safeCompare(a: string, b: string): boolean {
    try {
      const bufferA = Buffer.from(a);
      const bufferB = Buffer.from(b);

      if (bufferA.length !== bufferB.length) {
        return false;
      }

      return timingSafeEqual(bufferA, bufferB);
    } catch {
      return false;
    }
  }

  /**
   * 为实例生成新的 Webhook Secret
   */
  async generateWebhookSecret(instanceId: string): Promise<string> {
    const secret = this.generateRandomSecret();

    await this.prisma.middlewareInstance.update({
      where: { id: instanceId },
      data: { webhookSecret: secret },
    });

    this.logger.log(`Generated new webhook secret for instance ${instanceId}`);
    return secret;
  }

  /**
   * 生成随机 Secret
   */
  private generateRandomSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = 32;
    let result = 'whsec_';

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }
}
