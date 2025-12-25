import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import * as crypto from 'crypto';

/**
 * Webhook 事件类型
 */
export enum WebhookEventType {
  API_KEY_REVOKED = 'api_key_revoked',
  API_KEY_EXPIRED = 'api_key_expired',
  API_KEY_UPDATED = 'api_key_updated',
}

/**
 * API Key 撤销 Webhook 数据
 */
export interface ApiKeyRevokedPayload {
  /** API Key ID */
  keyId: string;
  /** Key 前缀 (用于缓存查找) */
  keyHashPrefix: string;
  /** 租户 ID */
  tenantId: string;
  /** 撤销时间 */
  revokedAt: string;
  /** 撤销者 ID */
  revokedBy?: string;
  /** 撤销原因 */
  reason?: string;
}

/**
 * Webhook 请求体
 */
export interface WebhookRequest {
  /** 事件类型 */
  event: WebhookEventType;
  /** 事件时间戳 */
  timestamp: string;
  /** 事件数据 */
  data: ApiKeyRevokedPayload;
}

/**
 * Webhook 服务
 * 负责向中间件发送事件通知，用于缓存失效等操作
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly middlewareBaseUrl: string;
  private readonly webhookSecret: string;
  private readonly webhookTimeout: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.middlewareBaseUrl = this.configService.get<string>('middleware.baseUrl')!;
    this.webhookSecret = this.configService.get<string>('middleware.webhookSecret')!;
    this.webhookTimeout = this.configService.get<number>('middleware.webhookTimeout') || 5000;
  }

  /**
   * 发送 API Key 撤销通知
   * 通知中间件清除缓存的 API Key
   *
   * @param payload 撤销数据
   * @returns 是否发送成功
   */
  async notifyApiKeyRevoked(payload: ApiKeyRevokedPayload): Promise<boolean> {
    const request: WebhookRequest = {
      event: WebhookEventType.API_KEY_REVOKED,
      timestamp: new Date().toISOString(),
      data: payload,
    };

    return this.sendWebhook('/webhooks/api-keys', request);
  }

  /**
   * 发送 Webhook 请求
   * 使用 HMAC-SHA256 签名验证请求来源
   *
   * @param path Webhook 路径
   * @param data 请求数据
   * @returns 是否发送成功
   */
  private async sendWebhook(path: string, data: WebhookRequest): Promise<boolean> {
    const url = `${this.middlewareBaseUrl}${path}`;
    const payload = JSON.stringify(data);

    // 生成 HMAC-SHA256 签名
    const signature = this.generateSignature(payload);

    try {
      this.logger.debug(`发送 Webhook: ${data.event} -> ${url}`);

      const response$ = this.httpService.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': data.timestamp,
        },
      }).pipe(
        timeout(this.webhookTimeout),
        catchError((error) => {
          // 非阻塞处理错误
          this.logger.warn(
            `Webhook 发送失败: ${error.message} (事件: ${data.event}, URL: ${url})`,
          );
          return of(null);
        }),
      );

      const response = await firstValueFrom(response$);

      if (response && response.status >= 200 && response.status < 300) {
        this.logger.log(`Webhook 发送成功: ${data.event} (Key: ${data.data.keyId})`);
        return true;
      }

      return false;
    } catch (error) {
      // 捕获任何未处理的错误，确保不会中断主流程
      this.logger.error(
        `Webhook 发送异常: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * 生成 HMAC-SHA256 签名
   * 用于验证 Webhook 请求的来源
   *
   * @param payload 请求体字符串
   * @returns 十六进制签名
   */
  private generateSignature(payload: string): string {
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
  }
}
