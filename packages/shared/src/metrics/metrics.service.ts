/**
 * 指标服务
 * 提供 Prometheus 指标收集功能
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  Summary,
  collectDefaultMetrics,
  register,
} from 'prom-client';

/**
 * 指标配置接口
 */
export interface MetricsConfig {
  /** 服务名称 */
  serviceName?: string;
  /** 是否收集默认指标 */
  collectDefaultMetrics?: boolean;
  /** 默认指标收集间隔（毫秒） */
  defaultMetricsInterval?: number;
  /** 自定义标签 */
  defaultLabels?: Record<string, string>;
  /** 指标前缀 */
  prefix?: string;
}

/**
 * HTTP 指标数据
 */
export interface HttpMetricData {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  tenantId?: string;
}

/**
 * 业务指标数据
 */
export interface BusinessMetricData {
  name: string;
  value: number;
  labels?: Record<string, string>;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: MetricsConfig = {
  serviceName: 'mt5-platform',
  collectDefaultMetrics: true,
  defaultMetricsInterval: 10000,
  prefix: 'mt5_',
};

/**
 * HTTP 请求持续时间分位数
 */
const HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * 数据库查询持续时间分位数
 */
const DB_DURATION_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5];

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly registry: Registry;
  private readonly config: MetricsConfig;
  private defaultMetricsInterval?: ReturnType<typeof setInterval>;

  // HTTP 指标
  private readonly httpRequestsTotal: Counter<string>;
  private readonly httpRequestDuration: Histogram<string>;
  private readonly httpRequestsInProgress: Gauge<string>;

  // 数据库指标
  private readonly dbQueriesTotal: Counter<string>;
  private readonly dbQueryDuration: Histogram<string>;
  private readonly dbConnectionPoolSize: Gauge<string>;

  // 业务指标
  private readonly businessEventsTotal: Counter<string>;
  private readonly businessGauges: Map<string, Gauge<string>> = new Map();

  // 安全指标
  private readonly authAttemptsTotal: Counter<string>;
  private readonly authFailuresTotal: Counter<string>;
  private readonly accountLockoutsTotal: Counter<string>;
  private readonly rateLimitHitsTotal: Counter<string>;

  // 系统指标
  private readonly activeConnections: Gauge<string>;
  private readonly websocketConnections: Gauge<string>;

  constructor(config: MetricsConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = new Registry();

    // 设置默认标签
    if (this.config.defaultLabels) {
      this.registry.setDefaultLabels(this.config.defaultLabels);
    }

    const prefix = this.config.prefix || '';

    // 初始化 HTTP 指标
    this.httpRequestsTotal = new Counter({
      name: `${prefix}http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status_code', 'tenant_id'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: `${prefix}http_request_duration_seconds`,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status_code', 'tenant_id'],
      buckets: HTTP_DURATION_BUCKETS,
      registers: [this.registry],
    });

    this.httpRequestsInProgress = new Gauge({
      name: `${prefix}http_requests_in_progress`,
      help: 'Number of HTTP requests currently in progress',
      labelNames: ['method', 'path'],
      registers: [this.registry],
    });

    // 初始化数据库指标
    this.dbQueriesTotal = new Counter({
      name: `${prefix}db_queries_total`,
      help: 'Total number of database queries',
      labelNames: ['operation', 'table', 'status'],
      registers: [this.registry],
    });

    this.dbQueryDuration = new Histogram({
      name: `${prefix}db_query_duration_seconds`,
      help: 'Database query duration in seconds',
      labelNames: ['operation', 'table'],
      buckets: DB_DURATION_BUCKETS,
      registers: [this.registry],
    });

    this.dbConnectionPoolSize = new Gauge({
      name: `${prefix}db_connection_pool_size`,
      help: 'Database connection pool size',
      labelNames: ['state'],
      registers: [this.registry],
    });

    // 初始化业务指标
    this.businessEventsTotal = new Counter({
      name: `${prefix}business_events_total`,
      help: 'Total number of business events',
      labelNames: ['event_type', 'status', 'tenant_id'],
      registers: [this.registry],
    });

    // 初始化安全指标
    this.authAttemptsTotal = new Counter({
      name: `${prefix}auth_attempts_total`,
      help: 'Total number of authentication attempts',
      labelNames: ['method', 'status', 'tenant_id'],
      registers: [this.registry],
    });

    this.authFailuresTotal = new Counter({
      name: `${prefix}auth_failures_total`,
      help: 'Total number of authentication failures',
      labelNames: ['reason', 'tenant_id'],
      registers: [this.registry],
    });

    this.accountLockoutsTotal = new Counter({
      name: `${prefix}account_lockouts_total`,
      help: 'Total number of account lockouts',
      labelNames: ['tenant_id'],
      registers: [this.registry],
    });

    this.rateLimitHitsTotal = new Counter({
      name: `${prefix}rate_limit_hits_total`,
      help: 'Total number of rate limit hits',
      labelNames: ['endpoint', 'tenant_id'],
      registers: [this.registry],
    });

    // 初始化系统指标
    this.activeConnections = new Gauge({
      name: `${prefix}active_connections`,
      help: 'Number of active connections',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.websocketConnections = new Gauge({
      name: `${prefix}websocket_connections`,
      help: 'Number of active WebSocket connections',
      labelNames: ['tenant_id'],
      registers: [this.registry],
    });
  }

  /**
   * 模块初始化
   */
  onModuleInit(): void {
    if (this.config.collectDefaultMetrics) {
      collectDefaultMetrics({
        register: this.registry,
        prefix: this.config.prefix,
      });
    }
  }

  /**
   * 模块销毁
   */
  onModuleDestroy(): void {
    if (this.defaultMetricsInterval) {
      clearInterval(this.defaultMetricsInterval);
    }
    this.registry.clear();
  }

  /**
   * 获取指标注册表
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * 获取所有指标
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * 获取指标内容类型
   */
  getContentType(): string {
    return this.registry.contentType;
  }

  // ===========================================
  // HTTP 指标方法
  // ===========================================

  /**
   * 记录 HTTP 请求开始
   */
  httpRequestStart(method: string, path: string): void {
    this.httpRequestsInProgress.labels(method, this.normalizePath(path)).inc();
  }

  /**
   * 记录 HTTP 请求完成
   */
  httpRequestEnd(data: HttpMetricData): void {
    const normalizedPath = this.normalizePath(data.path);
    const labels = {
      method: data.method,
      path: normalizedPath,
      status_code: String(data.statusCode),
      tenant_id: data.tenantId || 'unknown',
    };

    this.httpRequestsTotal.labels(labels).inc();
    this.httpRequestDuration.labels(labels).observe(data.duration / 1000);
    this.httpRequestsInProgress.labels(data.method, normalizedPath).dec();
  }

  // ===========================================
  // 数据库指标方法
  // ===========================================

  /**
   * 记录数据库查询
   */
  recordDbQuery(operation: string, table: string, duration: number, success: boolean): void {
    this.dbQueriesTotal.labels(operation, table, success ? 'success' : 'error').inc();
    this.dbQueryDuration.labels(operation, table).observe(duration / 1000);
  }

  /**
   * 更新数据库连接池大小
   */
  updateDbPoolSize(active: number, idle: number, waiting: number): void {
    this.dbConnectionPoolSize.labels('active').set(active);
    this.dbConnectionPoolSize.labels('idle').set(idle);
    this.dbConnectionPoolSize.labels('waiting').set(waiting);
  }

  // ===========================================
  // 业务指标方法
  // ===========================================

  /**
   * 记录业务事件
   */
  recordBusinessEvent(eventType: string, status: string, tenantId?: string): void {
    this.businessEventsTotal
      .labels(eventType, status, tenantId || 'unknown')
      .inc();
  }

  /**
   * 设置业务指标值
   */
  setBusinessMetric(name: string, value: number, labels?: Record<string, string>): void {
    let gauge = this.businessGauges.get(name);
    if (!gauge) {
      gauge = new Gauge({
        name: `${this.config.prefix}business_${name}`,
        help: `Business metric: ${name}`,
        labelNames: labels ? Object.keys(labels) : [],
        registers: [this.registry],
      });
      this.businessGauges.set(name, gauge);
    }

    if (labels) {
      gauge.labels(labels).set(value);
    } else {
      gauge.set(value);
    }
  }

  /**
   * 增加业务指标计数
   */
  incBusinessMetric(name: string, labels?: Record<string, string>, value: number = 1): void {
    let gauge = this.businessGauges.get(name);
    if (!gauge) {
      gauge = new Gauge({
        name: `${this.config.prefix}business_${name}`,
        help: `Business metric: ${name}`,
        labelNames: labels ? Object.keys(labels) : [],
        registers: [this.registry],
      });
      this.businessGauges.set(name, gauge);
    }

    if (labels) {
      gauge.labels(labels).inc(value);
    } else {
      gauge.inc(value);
    }
  }

  // ===========================================
  // 安全指标方法
  // ===========================================

  /**
   * 记录认证尝试
   */
  recordAuthAttempt(method: string, success: boolean, tenantId?: string): void {
    this.authAttemptsTotal
      .labels(method, success ? 'success' : 'failure', tenantId || 'unknown')
      .inc();

    if (!success) {
      this.authFailuresTotal.labels('invalid_credentials', tenantId || 'unknown').inc();
    }
  }

  /**
   * 记录认证失败
   */
  recordAuthFailure(reason: string, tenantId?: string): void {
    this.authFailuresTotal.labels(reason, tenantId || 'unknown').inc();
  }

  /**
   * 记录账户锁定
   */
  recordAccountLockout(tenantId?: string): void {
    this.accountLockoutsTotal.labels(tenantId || 'unknown').inc();
  }

  /**
   * 记录速率限制命中
   */
  recordRateLimitHit(endpoint: string, tenantId?: string): void {
    this.rateLimitHitsTotal.labels(endpoint, tenantId || 'unknown').inc();
  }

  // ===========================================
  // 系统指标方法
  // ===========================================

  /**
   * 更新活跃连接数
   */
  updateActiveConnections(type: string, count: number): void {
    this.activeConnections.labels(type).set(count);
  }

  /**
   * 更新 WebSocket 连接数
   */
  updateWebsocketConnections(tenantId: string, count: number): void {
    this.websocketConnections.labels(tenantId).set(count);
  }

  // ===========================================
  // 工具方法
  // ===========================================

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
   * 创建自定义计数器
   */
  createCounter(name: string, help: string, labelNames: string[] = []): Counter<string> {
    return new Counter({
      name: `${this.config.prefix}${name}`,
      help,
      labelNames,
      registers: [this.registry],
    });
  }

  /**
   * 创建自定义直方图
   */
  createHistogram(
    name: string,
    help: string,
    labelNames: string[] = [],
    buckets?: number[],
  ): Histogram<string> {
    return new Histogram({
      name: `${this.config.prefix}${name}`,
      help,
      labelNames,
      buckets: buckets || HTTP_DURATION_BUCKETS,
      registers: [this.registry],
    });
  }

  /**
   * 创建自定义仪表
   */
  createGauge(name: string, help: string, labelNames: string[] = []): Gauge<string> {
    return new Gauge({
      name: `${this.config.prefix}${name}`,
      help,
      labelNames,
      registers: [this.registry],
    });
  }

  /**
   * 创建自定义摘要
   */
  createSummary(
    name: string,
    help: string,
    labelNames: string[] = [],
    percentiles?: number[],
  ): Summary<string> {
    return new Summary({
      name: `${this.config.prefix}${name}`,
      help,
      labelNames,
      percentiles: percentiles || [0.5, 0.9, 0.95, 0.99],
      registers: [this.registry],
    });
  }
}
