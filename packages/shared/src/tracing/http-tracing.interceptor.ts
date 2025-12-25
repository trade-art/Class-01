/**
 * HTTP 追踪拦截器
 * 自动为 HTTP 请求创建追踪 Span
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
import { TracingService, ActiveSpan, SpanContext } from './tracing.service';

/**
 * HTTP 追踪拦截器配置
 */
export interface HttpTracingConfig {
  /** 排除的路径 */
  excludePaths?: string[];
  /** 排除的方法 */
  excludeMethods?: string[];
  /** 是否记录请求体 */
  recordRequestBody?: boolean;
  /** 是否记录响应体 */
  recordResponseBody?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: HttpTracingConfig = {
  excludePaths: ['/health', '/metrics', '/favicon.ico'],
  excludeMethods: [],
  recordRequestBody: false,
  recordResponseBody: false,
};

/**
 * HTTP 追踪配置 token
 */
export const HTTP_TRACING_CONFIG = 'HTTP_TRACING_CONFIG';

/**
 * 请求上下文中的 Span 键
 */
export const REQUEST_SPAN_KEY = 'REQUEST_SPAN';

@Injectable()
export class HttpTracingInterceptor implements NestInterceptor {
  private readonly config: HttpTracingConfig;

  constructor(
    private readonly tracingService: TracingService,
    @Optional() @Inject(HTTP_TRACING_CONFIG) config?: HttpTracingConfig,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.tracingService.isEnabled()) {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    // 检查是否排除
    if (this.shouldExclude(request)) {
      return next.handle();
    }

    // 尝试从请求头提取远程追踪上下文
    const remoteContext = this.tracingService.extractContext(
      request.headers as Record<string, string | string[] | undefined>,
    );

    // 创建 HTTP 请求 Span
    const span = this.createHttpSpan(request, remoteContext);

    // 将 Span 存储到请求对象中，供后续使用
    (request as any)[REQUEST_SPAN_KEY] = span;

    return next.handle().pipe(
      tap((responseBody) => {
        this.finishSpan(span, request, response, responseBody);
      }),
      catchError((error) => {
        this.finishSpanWithError(span, request, response, error);
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
   * 创建 HTTP 请求 Span
   */
  private createHttpSpan(request: Request, remoteContext: SpanContext | null): ActiveSpan {
    const spanName = `${request.method} ${this.normalizePath(request.path)}`;

    const attributes: Record<string, string | number | boolean> = {
      'http.method': request.method,
      'http.url': request.url,
      'http.path': request.path,
      'http.host': request.hostname,
      'http.user_agent': request.headers['user-agent'] || 'unknown',
      'http.client_ip': this.getClientIp(request),
      'tenant.id': this.getTenantId(request) || 'unknown',
      'user.id': this.getUserId(request) || 'anonymous',
    };

    if (this.config.recordRequestBody && request.body) {
      attributes['http.request_body'] = this.truncateBody(request.body);
    }

    if (remoteContext) {
      return this.tracingService.startSpanFromRemoteContext(spanName, remoteContext, attributes);
    }

    return this.tracingService.startSpan(spanName, attributes);
  }

  /**
   * 完成 Span（成功情况）
   */
  private finishSpan(
    span: ActiveSpan,
    request: Request,
    response: Response,
    responseBody?: unknown,
  ): void {
    const statusCode = response.statusCode;

    span.setAttribute('http.status_code', statusCode);
    span.setAttribute('http.response_content_length', response.get('content-length') || 0);

    if (this.config.recordResponseBody && responseBody) {
      span.setAttribute('http.response_body', this.truncateBody(responseBody));
    }

    if (statusCode >= 400) {
      span.setStatus('error', `HTTP ${statusCode}`);
    } else {
      span.setStatus('ok');
    }

    span.end();
  }

  /**
   * 完成 Span（错误情况）
   */
  private finishSpanWithError(
    span: ActiveSpan,
    request: Request,
    response: Response,
    error: Error,
  ): void {
    const statusCode = response.statusCode || 500;

    span.setAttribute('http.status_code', statusCode);
    span.setStatus('error', error.message);
    span.recordException(error);
    span.end();
  }

  /**
   * 标准化路径（去除动态参数）
   */
  private normalizePath(path: string): string {
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id')
      .replace(/\?.*$/, '');
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
   * 截断请求/响应体
   */
  private truncateBody(body: unknown, maxLength: number = 1000): string {
    try {
      const json = JSON.stringify(body);
      if (json.length > maxLength) {
        return json.substring(0, maxLength) + '...[truncated]';
      }
      return json;
    } catch {
      return '[Unable to serialize body]';
    }
  }
}

/**
 * 从请求中获取当前 Span
 */
export function getRequestSpan(request: Request): ActiveSpan | undefined {
  return (request as any)[REQUEST_SPAN_KEY];
}
