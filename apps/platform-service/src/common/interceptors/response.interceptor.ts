import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';

/**
 * 标准化成功响应格式
 */
export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

/**
 * 分页元数据
 */
export interface ResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

/**
 * 分页响应数据结构
 */
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * 跳过响应包装的装饰器 key
 */
export const SKIP_RESPONSE_TRANSFORM = 'skipResponseTransform';

/**
 * 装饰器: 跳过响应包装 (用于文件下载等特殊场景)
 */
import { SetMetadata } from '@nestjs/common';
export const SkipResponseTransform = () =>
  SetMetadata(SKIP_RESPONSE_TRANSFORM, true);

/**
 * 全局响应拦截器
 * 将所有成功响应包装为统一格式: { success: true, data: T, meta?: {...} }
 */
@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<T>>
{
  constructor(private reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse<T>> {
    // 检查是否跳过响应包装
    const skipTransform = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_TRANSFORM,
      [context.getHandler(), context.getClass()],
    );

    if (skipTransform) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        // 处理空响应
        if (data === undefined || data === null) {
          return {
            success: true as const,
            data: null as T,
          };
        }

        // 检查是否为分页响应
        if (this.isPaginatedResponse(data)) {
          const paginatedData = data as PaginatedData<any>;
          return {
            success: true as const,
            data: paginatedData.items as T,
            meta: {
              page: paginatedData.page,
              limit: paginatedData.limit,
              total: paginatedData.total,
              totalPages: Math.ceil(paginatedData.total / paginatedData.limit),
            },
          };
        }

        // 标准响应
        return {
          success: true as const,
          data,
        };
      }),
    );
  }

  /**
   * 检查是否为分页响应格式
   */
  private isPaginatedResponse(data: any): boolean {
    return (
      data &&
      typeof data === 'object' &&
      Array.isArray(data.items) &&
      typeof data.total === 'number' &&
      typeof data.page === 'number' &&
      typeof data.limit === 'number'
    );
  }
}
