import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * 标准化错误响应格式
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
    traceId: string;
    path: string;
  };
}

/**
 * 全局 HTTP 异常过滤器
 * 捕获所有 HttpException 并返回统一的错误响应格式
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // 生成追踪 ID
    const traceId = (request.headers['x-trace-id'] as string) || uuidv4();

    // 解析异常响应
    let code = `HTTP_${status}`;
    let message = exception.message;
    let details: Record<string, any> | undefined;

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resp = exceptionResponse as Record<string, any>;

      // 支持自定义错误码
      if (resp.code) {
        code = resp.code;
      }

      // 获取消息
      if (resp.message) {
        message = Array.isArray(resp.message)
          ? resp.message.join('; ')
          : resp.message;
      }

      // 获取详情 (如验证错误详情)
      if (resp.details) {
        details = resp.details;
      } else if (Array.isArray(resp.message) && resp.message.length > 1) {
        // class-validator 验证错误
        details = { validationErrors: resp.message };
      }
    }

    // 构建错误响应
    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
        traceId,
        path: request.url,
      },
    };

    // 记录错误日志
    this.logger.error(
      `[${traceId}] ${request.method} ${request.url} - ${status} ${code}: ${message}`,
      status >= 500 ? exception.stack : undefined,
    );

    response.status(status).json(errorResponse);
  }
}

/**
 * 捕获所有未处理异常 (非 HttpException)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const traceId = (request.headers['x-trace-id'] as string) || uuidv4();
    const status = HttpStatus.INTERNAL_SERVER_ERROR;

    // 获取错误信息
    const message = exception instanceof Error
      ? exception.message
      : 'Internal server error';

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: process.env.NODE_ENV !== 'production'
          ? { originalMessage: message }
          : undefined,
        timestamp: new Date().toISOString(),
        traceId,
        path: request.url,
      },
    };

    // 记录完整错误堆栈
    this.logger.error(
      `[${traceId}] ${request.method} ${request.url} - Unhandled exception`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json(errorResponse);
  }
}
