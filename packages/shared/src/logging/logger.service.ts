/**
 * 结构化日志服务
 * 使用 pino 日志库，支持 JSON 格式输出、日志级别配置、敏感字段脱敏
 */

import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';
import pino, { Logger, LoggerOptions } from 'pino';

/**
 * 日志级别
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * 日志上下文
 */
export interface LogContext {
  /** 请求 ID */
  requestId?: string;
  /** 追踪 ID */
  traceId?: string;
  /** 租户 ID */
  tenantId?: string;
  /** 用户 ID */
  userId?: string;
  /** 服务名称 */
  service?: string;
  /** 模块名称 */
  module?: string;
  /** 操作名称 */
  operation?: string;
  /** 额外数据 */
  [key: string]: unknown;
}

/**
 * 日志配置
 */
export interface LoggerConfig {
  /** 日志级别 */
  level?: LogLevel;
  /** 服务名称 */
  serviceName?: string;
  /** 是否美化输出（开发环境） */
  prettyPrint?: boolean;
  /** 敏感字段列表 */
  redactFields?: string[];
  /** 是否启用时间戳 */
  timestamp?: boolean;
}

/**
 * 默认敏感字段
 */
const DEFAULT_REDACT_FIELDS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'authorization',
  'cookie',
  'creditCard',
  'cardNumber',
  'cvv',
  'ssn',
  'privateKey',
  '*.password',
  '*.token',
  '*.apiKey',
  '*.secret',
  'req.headers.authorization',
  'req.headers.cookie',
];

/**
 * 创建 pino 日志器配置
 */
function createPinoConfig(config: LoggerConfig): LoggerOptions {
  const redactPaths = [...DEFAULT_REDACT_FIELDS, ...(config.redactFields || [])];

  const baseConfig: LoggerOptions = {
    level: config.level || (process.env.LOG_LEVEL as LogLevel) || 'info',
    redact: {
      paths: redactPaths,
      censor: '[REDACTED]',
    },
    base: {
      service: config.serviceName || process.env.SERVICE_NAME || 'mt5-platform',
      env: process.env.NODE_ENV || 'development',
      pid: process.pid,
    },
    timestamp: config.timestamp !== false ? pino.stdTimeFunctions.isoTime : false,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        service: bindings.service,
        env: bindings.env,
        pid: bindings.pid,
        hostname: bindings.hostname,
      }),
    },
    messageKey: 'message',
    errorKey: 'error',
    nestedKey: 'payload',
  };

  // 开发环境美化输出
  if (config.prettyPrint || process.env.NODE_ENV === 'development') {
    return {
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: false,
          messageFormat: '{module} - {message}',
        },
      },
    };
  }

  return baseConfig;
}

/**
 * 结构化日志服务
 * 实现 NestJS LoggerService 接口，可作为全局 logger 使用
 */
@Injectable({ scope: Scope.TRANSIENT })
export class StructuredLoggerService implements NestLoggerService {
  private readonly logger: Logger;
  private context: LogContext = {};

  constructor(config: LoggerConfig = {}) {
    this.logger = pino(createPinoConfig(config));
  }

  /**
   * 设置日志上下文
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * 获取带上下文的 child logger
   */
  child(context: LogContext): Logger {
    return this.logger.child({ ...this.context, ...context });
  }

  /**
   * 清除上下文
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * 记录日志
   */
  log(message: string, context?: string | LogContext): void {
    const ctx = typeof context === 'string' ? { module: context } : context;
    this.logger.info({ ...this.context, ...ctx }, message);
  }

  /**
   * 记录错误日志
   */
  error(message: string, trace?: string, context?: string | LogContext): void {
    const ctx = typeof context === 'string' ? { module: context } : context;
    this.logger.error(
      {
        ...this.context,
        ...ctx,
        error: trace ? { stack: trace } : undefined,
      },
      message,
    );
  }

  /**
   * 记录警告日志
   */
  warn(message: string, context?: string | LogContext): void {
    const ctx = typeof context === 'string' ? { module: context } : context;
    this.logger.warn({ ...this.context, ...ctx }, message);
  }

  /**
   * 记录调试日志
   */
  debug(message: string, context?: string | LogContext): void {
    const ctx = typeof context === 'string' ? { module: context } : context;
    this.logger.debug({ ...this.context, ...ctx }, message);
  }

  /**
   * 记录详细日志
   */
  verbose(message: string, context?: string | LogContext): void {
    const ctx = typeof context === 'string' ? { module: context } : context;
    this.logger.trace({ ...this.context, ...ctx }, message);
  }

  /**
   * 记录致命错误
   */
  fatal(message: string, context?: LogContext): void {
    this.logger.fatal({ ...this.context, ...context }, message);
  }

  /**
   * 记录 HTTP 请求日志
   */
  logHttpRequest(data: {
    method: string;
    path: string;
    statusCode: number;
    duration: number;
    userAgent?: string;
    ip?: string;
    tenantId?: string;
    userId?: string;
    traceId?: string;
    requestId?: string;
    error?: Error;
  }): void {
    const { method, path, statusCode, duration, error, ...meta } = data;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    const logData = {
      ...this.context,
      ...meta,
      http: {
        method,
        path,
        statusCode,
        duration,
      },
      ...(error && { error: { message: error.message, stack: error.stack } }),
    };

    this.logger[level](logData, `${method} ${path} ${statusCode} - ${duration}ms`);
  }

  /**
   * 记录数据库查询日志
   */
  logDbQuery(data: {
    query: string;
    duration: number;
    params?: unknown[];
    error?: Error;
  }): void {
    const { query, duration, params, error } = data;

    if (error) {
      this.logger.error(
        {
          ...this.context,
          db: { query, duration, params },
          error: { message: error.message, stack: error.stack },
        },
        `DB Query Error - ${duration}ms`,
      );
    } else if (duration > 1000) {
      // 慢查询警告
      this.logger.warn(
        { ...this.context, db: { query, duration, params } },
        `Slow DB Query - ${duration}ms`,
      );
    } else {
      this.logger.debug(
        { ...this.context, db: { query, duration } },
        `DB Query - ${duration}ms`,
      );
    }
  }

  /**
   * 记录业务事件日志
   */
  logBusinessEvent(event: {
    type: string;
    action: string;
    entityType?: string;
    entityId?: string;
    data?: unknown;
    tenantId?: string;
    userId?: string;
  }): void {
    this.logger.info(
      {
        ...this.context,
        event,
      },
      `Business Event: ${event.type}.${event.action}`,
    );
  }

  /**
   * 记录安全事件日志
   */
  logSecurityEvent(event: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    ip?: string;
    userId?: string;
    tenantId?: string;
    data?: unknown;
  }): void {
    const level = event.severity === 'critical' || event.severity === 'high' ? 'error' : 'warn';

    this.logger[level](
      {
        ...this.context,
        security: event,
      },
      `Security Event [${event.severity.toUpperCase()}]: ${event.type} - ${event.description}`,
    );
  }

  /**
   * 获取原始 pino logger
   */
  getPinoLogger(): Logger {
    return this.logger;
  }
}

/**
 * 创建 logger 实例
 */
export function createLogger(config: LoggerConfig = {}): StructuredLoggerService {
  return new StructuredLoggerService(config);
}

/**
 * 默认 logger 实例
 */
export const defaultLogger = createLogger();
