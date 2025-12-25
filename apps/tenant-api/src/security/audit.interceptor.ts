/**
 * 审计拦截器
 * 自动记录带有 @Audit 装饰器的方法调用
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap, catchError } from 'rxjs';
import { Request } from 'express';
import { AuditLoggerService, AuditStatus } from './audit-logger.service';
import { AUDIT_METADATA_KEY, AuditOptions, SKIP_AUDIT_KEY } from './audit.decorator';
import { JwtPayload } from '../auth/decorators/current-user.decorator';

/**
 * 敏感字段默认列表
 */
const DEFAULT_SENSITIVE_FIELDS = [
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'privateKey',
];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // 检查是否跳过审计
    const skipAudit = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipAudit) {
      return next.handle();
    }

    // 获取审计元数据
    const auditOptions = this.reflector.getAllAndOverride<AuditOptions>(
      AUDIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!auditOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user as JwtPayload | undefined;
    const startTime = Date.now();

    // 提取请求信息
    const requestInfo = this.extractRequestInfo(context, auditOptions);

    return next.handle().pipe(
      tap(async (result) => {
        // 成功时记录审计日志
        await this.logAudit(
          auditOptions,
          user,
          request,
          requestInfo,
          result,
          AuditStatus.SUCCESS,
          null,
          Date.now() - startTime,
        );
      }),
      catchError(async (error) => {
        // 失败时也记录审计日志
        await this.logAudit(
          auditOptions,
          user,
          request,
          requestInfo,
          null,
          AuditStatus.FAILURE,
          error.message || String(error),
          Date.now() - startTime,
        );
        throw error;
      }),
    );
  }

  /**
   * 提取请求信息
   */
  private extractRequestInfo(
    context: ExecutionContext,
    options: AuditOptions,
  ): {
    params: Record<string, any>;
    body: Record<string, any>;
    query: Record<string, any>;
  } {
    const request = context.switchToHttp().getRequest<Request>();

    return {
      params: request.params || {},
      body: this.sanitizeData(request.body || {}, options.sensitiveFields),
      query: request.query || {},
    };
  }

  /**
   * 记录审计日志
   */
  private async logAudit(
    options: AuditOptions,
    user: JwtPayload | undefined,
    request: Request,
    requestInfo: {
      params: Record<string, any>;
      body: Record<string, any>;
      query: Record<string, any>;
    },
    result: any,
    status: AuditStatus,
    errorMsg: string | null,
    durationMs: number,
  ): Promise<void> {
    try {
      // 构建描述
      const description = this.buildDescription(options.description, {
        param: requestInfo.params,
        body: requestInfo.body,
        query: requestInfo.query,
        result: result ? this.sanitizeData(result, options.sensitiveFields) : null,
      });

      // 提取资源 ID
      const resourceId = this.extractResourceId(requestInfo, result);

      // 构建新值
      let newValue: Record<string, any> | null = null;
      if (options.captureNewValue && status === AuditStatus.SUCCESS) {
        if (result && typeof result === 'object') {
          newValue = this.sanitizeData(result, options.sensitiveFields);
        } else if (requestInfo.body && Object.keys(requestInfo.body).length > 0) {
          newValue = requestInfo.body;
        }
      }

      // 提取额外元数据
      const extraMetadata = options.metadataExtractor
        ? options.metadataExtractor({ request, requestInfo, result })
        : {};

      await this.auditLogger.log({
        tenantId: user?.tenantId,
        userId: user?.sub,
        userEmail: user?.email,
        userRole: user?.role,
        action: options.action,
        resource: options.resource,
        resourceId,
        description,
        ipAddress: this.getClientIp(request),
        userAgent: request.headers['user-agent'],
        requestId: request.headers['x-request-id'] as string,
        oldValue: null, // 旧值需要在实际使用时通过服务获取
        newValue,
        status,
        errorMsg,
        metadata: {
          method: request.method,
          path: request.path,
          durationMs,
          ...extraMetadata,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log audit: ${error}`);
    }
  }

  /**
   * 构建描述（替换占位符）
   */
  private buildDescription(
    template: string | undefined,
    context: {
      param: Record<string, any>;
      body: Record<string, any>;
      query: Record<string, any>;
      result: any;
    },
  ): string {
    if (!template) {
      return '';
    }

    return template.replace(/\{(\w+)\.(\w+)\}/g, (_, type, key) => {
      const source = context[type as keyof typeof context];
      if (source && typeof source === 'object' && key in source) {
        return String(source[key]);
      }
      return `{${type}.${key}}`;
    });
  }

  /**
   * 提取资源 ID
   */
  private extractResourceId(
    requestInfo: {
      params: Record<string, any>;
      body: Record<string, any>;
      query: Record<string, any>;
    },
    result: any,
  ): string | null {
    // 优先从 params 中获取 id
    if (requestInfo.params.id) {
      return String(requestInfo.params.id);
    }

    // 其次从 body 中获取 id
    if (requestInfo.body.id) {
      return String(requestInfo.body.id);
    }

    // 最后从结果中获取 id
    if (result && typeof result === 'object' && result.id) {
      return String(result.id);
    }

    return null;
  }

  /**
   * 脱敏数据
   */
  private sanitizeData(
    data: Record<string, any>,
    additionalSensitiveFields: string[] = [],
  ): Record<string, any> {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveFields = new Set([
      ...DEFAULT_SENSITIVE_FIELDS,
      ...additionalSensitiveFields,
    ]);

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      if (sensitiveFields.has(key) || sensitiveFields.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeData(value, additionalSensitiveFields);
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map((item) =>
          typeof item === 'object'
            ? this.sanitizeData(item, additionalSensitiveFields)
            : item,
        );
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * 获取客户端 IP 地址
   */
  private getClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return request.ip || request.socket.remoteAddress || '0.0.0.0';
  }
}
