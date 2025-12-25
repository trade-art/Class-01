/**
 * 分布式追踪服务
 * 提供 OpenTelemetry 追踪功能
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

/**
 * 追踪配置接口
 */
export interface TracingConfig {
  /** 服务名称 */
  serviceName?: string;
  /** 服务版本 */
  serviceVersion?: string;
  /** 环境 */
  environment?: string;
  /** OTLP 导出器端点 */
  otlpEndpoint?: string;
  /** 采样率 (0-1) */
  samplingRatio?: number;
  /** 是否启用控制台导出 */
  consoleExport?: boolean;
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * Span 属性
 */
export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Span 上下文
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  isRemote?: boolean;
}

/**
 * 活跃 Span 信息
 */
export interface ActiveSpan {
  name: string;
  context: SpanContext;
  startTime: number;
  attributes: SpanAttributes;
  end: () => void;
  setAttribute: (key: string, value: string | number | boolean) => void;
  setStatus: (status: 'ok' | 'error', message?: string) => void;
  recordException: (error: Error) => void;
  addEvent: (name: string, attributes?: SpanAttributes) => void;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: TracingConfig = {
  serviceName: 'mt5-platform',
  serviceVersion: '1.0.0',
  environment: 'development',
  samplingRatio: 1.0,
  consoleExport: false,
  enabled: true,
};

@Injectable()
export class TracingService implements OnModuleInit, OnModuleDestroy {
  private readonly config: TracingConfig;
  private readonly spans: Map<string, ActiveSpan> = new Map();
  private spanIdCounter = 0;

  constructor(config: TracingConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 模块初始化
   */
  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // 初始化追踪器
    // 注意：实际的 OpenTelemetry 初始化需要在应用启动前完成
    // 这里提供一个轻量级的实现，可以在需要时替换为完整的 OTEL SDK
  }

  /**
   * 模块销毁
   */
  async onModuleDestroy(): Promise<void> {
    // 结束所有活跃的 span
    for (const span of this.spans.values()) {
      span.end();
    }
    this.spans.clear();
  }

  /**
   * 创建新的 Span
   */
  startSpan(name: string, attributes?: SpanAttributes): ActiveSpan {
    const spanId = this.generateSpanId();
    const traceId = this.generateTraceId();
    const startTime = Date.now();

    const span: ActiveSpan = {
      name,
      context: {
        traceId,
        spanId,
        traceFlags: 1,
        isRemote: false,
      },
      startTime,
      attributes: { ...attributes },
      end: () => {
        const duration = Date.now() - startTime;
        this.endSpan(spanId, duration);
      },
      setAttribute: (key: string, value: string | number | boolean) => {
        span.attributes[key] = value;
      },
      setStatus: (status: 'ok' | 'error', message?: string) => {
        span.attributes['otel.status_code'] = status.toUpperCase();
        if (message) {
          span.attributes['otel.status_description'] = message;
        }
      },
      recordException: (error: Error) => {
        span.attributes['exception.type'] = error.name;
        span.attributes['exception.message'] = error.message;
        if (error.stack) {
          span.attributes['exception.stacktrace'] = error.stack;
        }
      },
      addEvent: (eventName: string, eventAttributes?: SpanAttributes) => {
        // 记录事件
        if (this.config.consoleExport) {
          console.log(`[SPAN EVENT] ${name}/${eventName}`, eventAttributes);
        }
      },
    };

    this.spans.set(spanId, span);

    if (this.config.consoleExport) {
      console.log(`[SPAN START] ${name}`, {
        traceId,
        spanId,
        attributes,
      });
    }

    return span;
  }

  /**
   * 创建子 Span
   */
  startChildSpan(name: string, parentSpan: ActiveSpan, attributes?: SpanAttributes): ActiveSpan {
    const spanId = this.generateSpanId();
    const startTime = Date.now();

    const childSpan: ActiveSpan = {
      name,
      context: {
        traceId: parentSpan.context.traceId,
        spanId,
        traceFlags: 1,
        isRemote: false,
      },
      startTime,
      attributes: {
        'parent.spanId': parentSpan.context.spanId,
        ...attributes,
      },
      end: () => {
        const duration = Date.now() - startTime;
        this.endSpan(spanId, duration);
      },
      setAttribute: (key: string, value: string | number | boolean) => {
        childSpan.attributes[key] = value;
      },
      setStatus: (status: 'ok' | 'error', message?: string) => {
        childSpan.attributes['otel.status_code'] = status.toUpperCase();
        if (message) {
          childSpan.attributes['otel.status_description'] = message;
        }
      },
      recordException: (error: Error) => {
        childSpan.attributes['exception.type'] = error.name;
        childSpan.attributes['exception.message'] = error.message;
        if (error.stack) {
          childSpan.attributes['exception.stacktrace'] = error.stack;
        }
      },
      addEvent: (eventName: string, eventAttributes?: SpanAttributes) => {
        if (this.config.consoleExport) {
          console.log(`[SPAN EVENT] ${name}/${eventName}`, eventAttributes);
        }
      },
    };

    this.spans.set(spanId, childSpan);

    if (this.config.consoleExport) {
      console.log(`[CHILD SPAN START] ${name}`, {
        traceId: parentSpan.context.traceId,
        spanId,
        parentSpanId: parentSpan.context.spanId,
        attributes,
      });
    }

    return childSpan;
  }

  /**
   * 结束 Span
   */
  private endSpan(spanId: string, duration: number): void {
    const span = this.spans.get(spanId);
    if (!span) {
      return;
    }

    if (this.config.consoleExport) {
      console.log(`[SPAN END] ${span.name}`, {
        traceId: span.context.traceId,
        spanId: span.context.spanId,
        duration: `${duration}ms`,
        attributes: span.attributes,
      });
    }

    this.spans.delete(spanId);
  }

  /**
   * 使用 Span 包装异步函数
   */
  async withSpan<T>(
    name: string,
    fn: (span: ActiveSpan) => Promise<T>,
    attributes?: SpanAttributes,
  ): Promise<T> {
    const span = this.startSpan(name, attributes);

    try {
      const result = await fn(span);
      span.setStatus('ok');
      return result;
    } catch (error) {
      span.setStatus('error', (error as Error).message);
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * 使用 Span 包装同步函数
   */
  withSpanSync<T>(
    name: string,
    fn: (span: ActiveSpan) => T,
    attributes?: SpanAttributes,
  ): T {
    const span = this.startSpan(name, attributes);

    try {
      const result = fn(span);
      span.setStatus('ok');
      return result;
    } catch (error) {
      span.setStatus('error', (error as Error).message);
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * 从 HTTP 头提取追踪上下文
   */
  extractContext(headers: Record<string, string | string[] | undefined>): SpanContext | null {
    const traceparent = headers['traceparent'] as string;
    if (!traceparent) {
      return null;
    }

    // W3C Trace Context: 00-<trace-id>-<parent-id>-<flags>
    const parts = traceparent.split('-');
    if (parts.length !== 4) {
      return null;
    }

    return {
      traceId: parts[1],
      spanId: parts[2],
      traceFlags: parseInt(parts[3], 16),
      isRemote: true,
    };
  }

  /**
   * 注入追踪上下文到 HTTP 头
   */
  injectContext(span: ActiveSpan): Record<string, string> {
    const { traceId, spanId, traceFlags } = span.context;
    const traceparent = `00-${traceId}-${spanId}-${traceFlags.toString(16).padStart(2, '0')}`;

    return {
      traceparent,
      'x-trace-id': traceId,
      'x-span-id': spanId,
    };
  }

  /**
   * 从远程上下文创建 Span
   */
  startSpanFromRemoteContext(
    name: string,
    remoteContext: SpanContext,
    attributes?: SpanAttributes,
  ): ActiveSpan {
    const spanId = this.generateSpanId();
    const startTime = Date.now();

    const span: ActiveSpan = {
      name,
      context: {
        traceId: remoteContext.traceId,
        spanId,
        traceFlags: remoteContext.traceFlags,
        isRemote: false,
      },
      startTime,
      attributes: {
        'parent.spanId': remoteContext.spanId,
        'parent.isRemote': true,
        ...attributes,
      },
      end: () => {
        const duration = Date.now() - startTime;
        this.endSpan(spanId, duration);
      },
      setAttribute: (key: string, value: string | number | boolean) => {
        span.attributes[key] = value;
      },
      setStatus: (status: 'ok' | 'error', message?: string) => {
        span.attributes['otel.status_code'] = status.toUpperCase();
        if (message) {
          span.attributes['otel.status_description'] = message;
        }
      },
      recordException: (error: Error) => {
        span.attributes['exception.type'] = error.name;
        span.attributes['exception.message'] = error.message;
        if (error.stack) {
          span.attributes['exception.stacktrace'] = error.stack;
        }
      },
      addEvent: (eventName: string, eventAttributes?: SpanAttributes) => {
        if (this.config.consoleExport) {
          console.log(`[SPAN EVENT] ${name}/${eventName}`, eventAttributes);
        }
      },
    };

    this.spans.set(spanId, span);

    if (this.config.consoleExport) {
      console.log(`[SPAN FROM REMOTE] ${name}`, {
        traceId: remoteContext.traceId,
        spanId,
        remoteSpanId: remoteContext.spanId,
        attributes,
      });
    }

    return span;
  }

  /**
   * 生成 Span ID
   */
  private generateSpanId(): string {
    this.spanIdCounter++;
    const timestamp = Date.now().toString(16);
    const random = Math.random().toString(16).substring(2, 10);
    const counter = this.spanIdCounter.toString(16).padStart(4, '0');
    return `${timestamp}${random}${counter}`.substring(0, 16);
  }

  /**
   * 生成 Trace ID
   */
  private generateTraceId(): string {
    const timestamp = Date.now().toString(16);
    const random1 = Math.random().toString(16).substring(2, 10);
    const random2 = Math.random().toString(16).substring(2, 10);
    const random3 = Math.random().toString(16).substring(2, 10);
    return `${timestamp}${random1}${random2}${random3}`.substring(0, 32);
  }

  /**
   * 获取服务名称
   */
  getServiceName(): string {
    return this.config.serviceName || 'unknown';
  }

  /**
   * 获取环境
   */
  getEnvironment(): string {
    return this.config.environment || 'unknown';
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.config.enabled === true;
  }
}
