import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import { CircuitBreakerService } from './circuit-breaker.service';
import { MiddlewareInstanceInfo } from '../interfaces/middleware-health.interface';
import { HTTP_CLIENT_CONFIG } from '../constants/middleware.constants';

/**
 * 请求配置
 */
export interface RequestConfig {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  skipCircuitBreaker?: boolean;
}

/**
 * 中间件客户端服务
 * 封装对中间件实例的 HTTP 请求，提供重试和熔断功能
 * middleware-integration Task 6
 */
@Injectable()
export class MiddlewareClientService {
  private readonly logger = new Logger(MiddlewareClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  /**
   * 发送 GET 请求到中间件实例
   */
  async get<T>(
    instance: MiddlewareInstanceInfo,
    path: string,
    config?: RequestConfig,
  ): Promise<T> {
    return this.request<T>('GET', instance, path, undefined, config);
  }

  /**
   * 发送 POST 请求到中间件实例
   */
  async post<T>(
    instance: MiddlewareInstanceInfo,
    path: string,
    data?: any,
    config?: RequestConfig,
  ): Promise<T> {
    return this.request<T>('POST', instance, path, data, config);
  }

  /**
   * 发送 PUT 请求到中间件实例
   */
  async put<T>(
    instance: MiddlewareInstanceInfo,
    path: string,
    data?: any,
    config?: RequestConfig,
  ): Promise<T> {
    return this.request<T>('PUT', instance, path, data, config);
  }

  /**
   * 发送 DELETE 请求到中间件实例
   */
  async delete<T>(
    instance: MiddlewareInstanceInfo,
    path: string,
    config?: RequestConfig,
  ): Promise<T> {
    return this.request<T>('DELETE', instance, path, undefined, config);
  }

  /**
   * 通用请求方法
   */
  private async request<T>(
    method: string,
    instance: MiddlewareInstanceInfo,
    path: string,
    data?: any,
    config?: RequestConfig,
  ): Promise<T> {
    const instanceId = instance.id;

    // 检查熔断器状态
    if (!config?.skipCircuitBreaker && this.circuitBreaker.isOpen(instanceId)) {
      this.logger.warn(`Circuit breaker is OPEN for instance ${instanceId}, rejecting request`);
      throw new Error(`Circuit breaker is open for instance ${instanceId}`);
    }

    const url = this.getBaseUrl(instance) + path;
    const timeoutMs = config?.timeout ?? HTTP_CLIENT_CONFIG.DEFAULT_TIMEOUT_MS;
    const maxRetries = config?.retries ?? HTTP_CLIENT_CONFIG.MAX_RETRIES;
    const initialRetryDelay = config?.retryDelay ?? HTTP_CLIENT_CONFIG.INITIAL_RETRY_DELAY_MS;

    let lastError: Error = new Error('Unknown error');
    let currentDelay = initialRetryDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const startTime = Date.now();

        const response: AxiosResponse<T> = await firstValueFrom(
          this.httpService.request({
            method,
            url,
            data,
            timeout: timeoutMs,
            headers: {
              'X-API-Key': this.decryptApiKey(instance.apiKey),
              'Content-Type': 'application/json',
              'X-Instance-Id': instanceId,
            },
          }).pipe(
            timeout(timeoutMs),
            catchError((error: AxiosError) => {
              throw error;
            }),
          ),
        );

        const latency = Date.now() - startTime;
        this.logger.debug(`${method} ${url} completed in ${latency}ms`);

        // 成功，记录到熔断器
        this.circuitBreaker.recordSuccess(instanceId);

        return response.data;
      } catch (error: any) {
        lastError = error;

        const isRetryable = this.isRetryableError(error);
        const attemptsLeft = maxRetries - attempt;

        this.logger.warn(
          `${method} ${url} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}. Retryable: ${isRetryable}, Attempts left: ${attemptsLeft}`,
        );

        // 记录失败到熔断器
        this.circuitBreaker.recordFailure(instanceId, error.message);

        // 如果错误不可重试，立即抛出
        if (!isRetryable) {
          throw lastError;
        }

        // 如果还有重试次数，等待后重试
        if (attempt < maxRetries) {
          await this.sleep(currentDelay);
          // 指数退避
          currentDelay = Math.min(
            currentDelay * HTTP_CLIENT_CONFIG.RETRY_MULTIPLIER,
            HTTP_CLIENT_CONFIG.MAX_RETRY_DELAY_MS,
          );
        }
      }
    }

    throw lastError;
  }

  /**
   * 构建中间件基础 URL
   */
  private getBaseUrl(instance: MiddlewareInstanceInfo): string {
    const protocol = instance.useTls ? 'https' : 'http';
    return `${protocol}://${instance.host}:${instance.port}`;
  }

  /**
   * 解密 API Key
   * TODO: 实现真正的解密逻辑，目前直接返回
   */
  private decryptApiKey(encryptedKey: string): string {
    // TODO: 使用 ConfigService 获取加密密钥并解密
    // 目前 API Key 是明文存储的
    return encryptedKey;
  }

  /**
   * 判断是否是可重试的错误
   */
  private isRetryableError(error: any): boolean {
    // 网络错误
    if (error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNRESET' ||
        error.code === 'EPIPE') {
      return true;
    }

    // HTTP 5xx 错误
    if (error.response?.status >= 500) {
      return true;
    }

    // 超时错误
    if (error.message?.includes('timeout')) {
      return true;
    }

    // 429 Too Many Requests
    if (error.response?.status === 429) {
      return true;
    }

    return false;
  }

  /**
   * 休眠指定毫秒数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 测试中间件连接
   */
  async testConnection(instance: MiddlewareInstanceInfo): Promise<{
    success: boolean;
    latencyMs: number;
    message?: string;
  }> {
    const startTime = Date.now();

    try {
      await this.get(instance, '/health', {
        timeout: 5000,
        retries: 0,
        skipCircuitBreaker: true,
      });

      return {
        success: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: error.message,
      };
    }
  }
}
