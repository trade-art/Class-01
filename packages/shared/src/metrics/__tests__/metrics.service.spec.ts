/**
 * 指标服务单元测试
 */

import { MetricsService, MetricsConfig, HttpMetricData } from '../metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService({
      serviceName: 'test-service',
      collectDefaultMetrics: false,
      prefix: 'test_',
    });
  });

  afterEach(() => {
    // 清理注册表
    service.onModuleDestroy();
  });

  describe('初始化', () => {
    it('应该正确创建服务', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(MetricsService);
    });

    it('应该使用默认配置创建服务', () => {
      const defaultService = new MetricsService();
      expect(defaultService).toBeDefined();
      defaultService.onModuleDestroy();
    });

    it('应该获取注册表', () => {
      const registry = service.getRegistry();
      expect(registry).toBeDefined();
    });

    it('应该获取指标内容类型', () => {
      const contentType = service.getContentType();
      expect(contentType).toBeDefined();
      expect(contentType).toContain('text/plain');
    });
  });

  describe('HTTP 指标', () => {
    it('应该记录 HTTP 请求开始', () => {
      expect(() => service.httpRequestStart('GET', '/api/users')).not.toThrow();
    });

    it('应该记录 HTTP 请求完成', () => {
      const data: HttpMetricData = {
        method: 'GET',
        path: '/api/users',
        statusCode: 200,
        duration: 150,
        tenantId: 'tenant-123',
      };

      service.httpRequestStart('GET', '/api/users');
      expect(() => service.httpRequestEnd(data)).not.toThrow();
    });

    it('应该处理不带租户 ID 的请求', () => {
      const data: HttpMetricData = {
        method: 'POST',
        path: '/api/orders',
        statusCode: 201,
        duration: 300,
      };

      expect(() => service.httpRequestEnd(data)).not.toThrow();
    });

    it('应该规范化带 UUID 的路径', async () => {
      const data: HttpMetricData = {
        method: 'GET',
        path: '/api/users/123e4567-e89b-12d3-a456-426614174000',
        statusCode: 200,
        duration: 100,
      };

      service.httpRequestEnd(data);
      const metrics = await service.getMetrics();
      expect(metrics).toContain('test_http_requests_total');
    });

    it('应该规范化带数字 ID 的路径', async () => {
      const data: HttpMetricData = {
        method: 'GET',
        path: '/api/orders/12345',
        statusCode: 200,
        duration: 100,
      };

      service.httpRequestEnd(data);
      const metrics = await service.getMetrics();
      expect(metrics).toContain('test_http_requests_total');
    });
  });

  describe('数据库指标', () => {
    it('应该记录成功的数据库查询', () => {
      expect(() => service.recordDbQuery('SELECT', 'users', 50, true)).not.toThrow();
    });

    it('应该记录失败的数据库查询', () => {
      expect(() => service.recordDbQuery('UPDATE', 'accounts', 75, false)).not.toThrow();
    });

    it('应该更新数据库连接池大小', () => {
      expect(() => service.updateDbPoolSize(5, 10, 2)).not.toThrow();
    });
  });

  describe('业务指标', () => {
    it('应该记录业务事件', () => {
      expect(() => service.recordBusinessEvent('trade', 'success')).not.toThrow();
    });

    it('应该记录带租户 ID 的业务事件', () => {
      expect(() => service.recordBusinessEvent('order', 'created', 'tenant-123')).not.toThrow();
    });

    it('应该设置业务指标值', () => {
      expect(() => service.setBusinessMetric('active_users', 100)).not.toThrow();
    });

    it('应该设置带标签的业务指标', () => {
      expect(() =>
        service.setBusinessMetric('orders_pending', 50, { tenant_id: 'tenant-123' }),
      ).not.toThrow();
    });

    it('应该增加业务指标计数', () => {
      expect(() => service.incBusinessMetric('login_count')).not.toThrow();
    });

    it('应该增加带值的业务指标计数', () => {
      expect(() => service.incBusinessMetric('page_views', undefined, 5)).not.toThrow();
    });
  });

  describe('安全指标', () => {
    it('应该记录成功的认证尝试', () => {
      expect(() => service.recordAuthAttempt('password', true, 'tenant-123')).not.toThrow();
    });

    it('应该记录失败的认证尝试', () => {
      expect(() => service.recordAuthAttempt('password', false, 'tenant-456')).not.toThrow();
    });

    it('应该记录认证失败原因', () => {
      expect(() => service.recordAuthFailure('invalid_token', 'tenant-789')).not.toThrow();
    });

    it('应该记录账户锁定', () => {
      expect(() => service.recordAccountLockout('tenant-123')).not.toThrow();
    });

    it('应该记录速率限制命中', () => {
      expect(() => service.recordRateLimitHit('/api/login', 'tenant-456')).not.toThrow();
    });
  });

  describe('系统指标', () => {
    it('应该更新活跃连接数', () => {
      expect(() => service.updateActiveConnections('http', 100)).not.toThrow();
    });

    it('应该更新 WebSocket 连接数', () => {
      expect(() => service.updateWebsocketConnections('tenant-123', 50)).not.toThrow();
    });
  });

  describe('自定义指标', () => {
    it('应该创建自定义计数器', () => {
      const counter = service.createCounter('custom_counter', 'A custom counter', ['label1']);
      expect(counter).toBeDefined();
      expect(() => counter.labels('value1').inc()).not.toThrow();
    });

    it('应该创建自定义直方图', () => {
      const histogram = service.createHistogram('custom_histogram', 'A custom histogram', [
        'label1',
      ]);
      expect(histogram).toBeDefined();
      expect(() => histogram.labels('value1').observe(0.5)).not.toThrow();
    });

    it('应该创建带自定义分位数的直方图', () => {
      const histogram = service.createHistogram(
        'custom_histogram_buckets',
        'A custom histogram with buckets',
        ['label1'],
        [0.1, 0.5, 1, 5],
      );
      expect(histogram).toBeDefined();
    });

    it('应该创建自定义仪表', () => {
      const gauge = service.createGauge('custom_gauge', 'A custom gauge', ['label1']);
      expect(gauge).toBeDefined();
      expect(() => gauge.labels('value1').set(42)).not.toThrow();
    });

    it('应该创建自定义摘要', () => {
      const summary = service.createSummary('custom_summary', 'A custom summary', ['label1']);
      expect(summary).toBeDefined();
      expect(() => summary.labels('value1').observe(0.5)).not.toThrow();
    });

    it('应该创建带自定义百分位数的摘要', () => {
      const summary = service.createSummary(
        'custom_summary_percentiles',
        'A custom summary with percentiles',
        ['label1'],
        [0.5, 0.75, 0.9, 0.99],
      );
      expect(summary).toBeDefined();
    });
  });

  describe('指标导出', () => {
    it('应该导出所有指标', async () => {
      // 添加一些指标
      service.recordBusinessEvent('test', 'success');
      service.updateActiveConnections('http', 10);

      const metrics = await service.getMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('test_business_events_total');
      expect(metrics).toContain('test_active_connections');
    });
  });

  describe('生命周期', () => {
    it('应该在模块初始化时启动', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });

    it('应该在模块销毁时清理', () => {
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });
});
