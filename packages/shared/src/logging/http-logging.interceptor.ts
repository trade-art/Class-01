/**
 * HTTP 日志拦截器
 * 自动记录所有 HTTP 请求的详细信息
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { StructuredLoggerService, LogContext } from './logger.service';

/**
 * HTTP 日志拦截器配置
 */
export interface HttpLoggingConfig {
  /** 是否记录请求体 */
  logRequestBody?: boolean;
  /** 是否记录响应体 */
  logResponseBody?: boolean;
  /** 请求体最大长度 */
  maxBodyLength?: number;
  /** 排除的路径 */
  excludePaths?: string[];
  /** 排除的方法 */
  excludeMethods?: string[];
  /** 慢请求阈值（毫秒） */
  slowRequestThreshold?: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: HttpLoggingConfig = {
  logRequestBody: false,
  logResponseBody: false,
  maxBodyLength: 1000,
  excludePaths: ['/health', '/metrics', '/favicon.ico'],
  excludeMethods: [],
  slowRequestThreshold: 3000,
};

/**
 * HTTP 日志配置 token
 */
export const HTTP_LOGGING_CONFIG = 'HTTP_LOGGING_CONFIG';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly config: HttpLoggingConfig;

  constructor(
    private readonly logger: StructuredLoggerService,
    @Optional() @Inject(HTTP_LOGGING_CONFIG) config?: HttpLoggingConfig,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    // 检查是否排除
    if (this.shouldExclude(request)) {
      return next.handle();
    }

    const startTime = Date.now();
    const requestId = this.getRequestId(request);
    const traceId = this.getTraceId(request);

    // 设置请求上下文
    const logContext: LogContext = {
      requestId,
      traceId,
      tenantId: this.getTenantId(request),
      userId: this.getUserId(request),
      module: 'HTTP',
      operation: `${request.method} ${request.path}`,
    };

    // 记录请求开始
    this.logRequestStart(request, logContext);

    return next.handle().pipe(
      tap((responseBody) => {
        const duration = Date.now() - startTime;
        this.logRequestEnd(request, response, duration, logContext, responseBody);
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.logRequestError(request, response, duration, logContext, error);
        return throwError(() => error);
      }),
    );
  }

  /**
   * 检查是否应该排除
   */
  private shouldExclude(request: Request): boolean {
    const { excludePaths, excludeMethods } = this.config;

    if (excludeMethods?.includes(request.method)) {
      return true;
    }

    if (excludePaths?.some((path) => request.path.startsWith(path))) {
      return true;
    }

    return false;
  }

  /**
   * 获取请求 ID
   */
  private getRequestId(request: Request): string {
    return (
      (request.headers['x-request-id'] as string) ||
      (request.headers['x-correlation-id'] as string) ||
      this.generateId()
    );
  }

  /**
   * 获取追踪 ID
   */
  private getTraceId(request: Request): string | undefined {
    const traceparent = request.headers['traceparent'] as string;
    if (traceparent) {
      // W3C Trace Context: 00-<trace-id>-<parent-id>-<flags>
      const parts = traceparent.split('-');
      return parts[1];
    }
    return request.headers['x-trace-id'] as string;
  }

  /**
   * 获取租户 ID
   */
  private getTenantId(request: Request): string | undefined {
    return (
      (request.headers['x-tenant-id'] as string) ||
      (request as any).tenantId ||
      (request as any).user?.tenantId
    );
  }

  /**
   * 获取用户 ID
   */
  private getUserId(request: Request): string | undefined {
    return (request as any).user?.id || (request as any).user?.sub;
  }

  /**
   * 记录请求开始
   */
  private logRequestStart(request: Request, context: LogContext): void {
    const logData: Record<string, unknown> = {
      ...context,
      http: {
        method: request.method,
        path: request.path,
        url: request.url,
        query: Object.keys(request.query).length > 0 ? request.query : undefined,
        userAgent: request.headers['user-agent'],
        ip: this.getClientIp(request),
        contentLength: request.headers['content-length'],
      },
    };

    // 可选记录请求体
    if (this.config.logRequestBody && request.body) {
      logData.requestBody = this.truncateBody(request.body);
    }

    this.logger.debug(`→ ${request.method} ${request.path}`, logData);
  }

  /**
   * 记录请求结束
   */
  private logRequestEnd(
    request: Request,
    response: Response,
    duration: number,
    context: LogContext,
    responseBody?: unknown,
  ): void {
    const statusCode = response.statusCode;
    const isSlowRequest = duration > (this.config.slowRequestThreshold || 3000);

    const logData: Record<string, unknown> = {
      ...context,
      http: {
        method: request.method,
        path: request.path,
        statusCode,
        duration,
        userAgent: request.headers['user-agent'],
        ip: this.getClientIp(request),
      },
    };

    // 可选记录响应体
    if (this.config.logResponseBody && responseBody) {
      logData.responseBody = this.truncateBody(responseBody);
    }

    const message = `← ${request.method} ${request.path} ${statusCode} - ${duration}ms`;

    if (statusCode >= 500) {
      this.logger.error(message, undefined, logData);
    } else if (statusCode >= 400) {
      this.logger.warn(message, logData);
    } else if (isSlowRequest) {
      this.logger.warn(`[SLOW] ${message}`, logData);
    } else {
      this.logger.log(message, logData);
    }
  }

  /**
   * 记录请求错误
   */
  private logRequestError(
    request: Request,
    response: Response,
    duration: number,
    context: LogContext,
    error: Error,
  ): void {
    const statusCode = response.statusCode || 500;

    this.logger.error(
      `✕ ${request.method} ${request.path} ${statusCode} - ${duration}ms`,
      error.stack,
      {
        ...context,
        http: {
          method: request.method,
          path: request.path,
          statusCode,
          duration,
          ip: this.getClientIp(request),
        },
        error: {
          name: error.name,
          message: error.message,
        },
      },
    );
  }

  /**
   * 获取客户端 IP
   */
  private getClientIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (request.headers['x-real-ip'] as string) ||
      request.socket?.remoteAddress ||
      'unknown'
    );
  }

  /**
   * 截断请求/响应体
   */
  private truncateBody(body: unknown): unknown {
    const maxLength = this.config.maxBodyLength || 1000;

    if (typeof body === 'string') {
      return body.length > maxLength ? body.substring(0, maxLength) + '...[truncated]' : body;
    }

    try {
      const json = JSON.stringify(body);
      if (json.length > maxLength) {
        return JSON.parse(json.substring(0, maxLength) + '"}') + '...[truncated]';
      }
      return body;
    } catch {
      return '[Unable to serialize body]';
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
