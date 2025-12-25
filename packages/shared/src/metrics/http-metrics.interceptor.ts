/**
 * HTTP 指标拦截器
 * 自动收集所有 HTTP 请求的指标
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
import { MetricsService } from './metrics.service';

/**
 * HTTP 指标拦截器配置
 */
export interface HttpMetricsConfig {
  /** 排除的路径 */
  excludePaths?: string[];
  /** 排除的方法 */
  excludeMethods?: string[];
  /** 是否记录路径参数 */
  includePathParams?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: HttpMetricsConfig = {
  excludePaths: ['/health', '/metrics', '/favicon.ico'],
  excludeMethods: [],
  includePathParams: false,
};

/**
 * HTTP 指标配置 token
 */
export const HTTP_METRICS_CONFIG = 'HTTP_METRICS_CONFIG';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  private readonly config: HttpMetricsConfig;

  constructor(
    private readonly metricsService: MetricsService,
    @Optional() @Inject(HTTP_METRICS_CONFIG) config?: HttpMetricsConfig,
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
    const { method, path } = request;

    // 记录请求开始
    this.metricsService.httpRequestStart(method, path);

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        this.recordMetrics(request, response, duration);
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.recordMetrics(request, response, duration);
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
   * 记录指标
   */
  private recordMetrics(request: Request, response: Response, duration: number): void {
    const tenantId = this.getTenantId(request);

    this.metricsService.httpRequestEnd({
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      duration,
      tenantId,
    });
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
}
