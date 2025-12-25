/**
 * 分布式追踪服务单元测试
 */

import { TracingService, TracingConfig, ActiveSpan, SpanContext } from '../tracing.service';

describe('TracingService', () => {
  let service: TracingService;
  const defaultConfig: TracingConfig = {
    serviceName: 'test-service',
    enabled: true,
    samplingRatio: 1.0,
    environment: 'test',
  };

  beforeEach(() => {
    service = new TracingService(defaultConfig);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('基础功能', () => {
    it('应该正确创建追踪服务', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(TracingService);
    });

    it('应该在模块初始化时正确设置', async () => {
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it('应该返回正确的服务名称', () => {
      expect(service.getServiceName()).toBe('test-service');
    });

    it('应该返回正确的环境', () => {
      expect(service.getEnvironment()).toBe('test');
    });

    it('应该正确检查启用状态', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('Span 操作', () => {
    it('应该能够创建和结束 span', () => {
      const span = service.startSpan('test-operation');
      expect(span).toBeDefined();
      expect(span.context.spanId).toBeDefined();
      expect(span.context.traceId).toBeDefined();
      expect(span.name).toBe('test-operation');

      expect(() => span.end()).not.toThrow();
    });

    it('应该能够创建带属性的 span', () => {
      const span = service.startSpan('test-with-attributes', {
        'custom.attribute': 'value',
        'http.method': 'GET',
      });

      expect(span).toBeDefined();
      expect(span.attributes).toBeDefined();
      expect(span.attributes['custom.attribute']).toBe('value');

      span.end();
    });

    it('应该能够创建子 span', () => {
      const parentSpan = service.startSpan('parent-operation');
      const childSpan = service.startChildSpan('child-operation', parentSpan);

      expect(childSpan).toBeDefined();
      expect(childSpan.attributes['parent.spanId']).toBe(parentSpan.context.spanId);
      expect(childSpan.context.traceId).toBe(parentSpan.context.traceId);

      childSpan.end();
      parentSpan.end();
    });

    it('应该能够添加事件到 span', () => {
      const span = service.startSpan('test-events');

      expect(() => span.addEvent('test-event', { key: 'value' })).not.toThrow();

      span.end();
    });

    it('应该能够设置 span 状态', () => {
      const span = service.startSpan('test-status');

      expect(() => span.setStatus('ok')).not.toThrow();
      expect(() => span.setStatus('error', 'test error')).not.toThrow();

      span.end();
    });

    it('应该能够设置 span 属性', () => {
      const span = service.startSpan('test-attribute');

      expect(() => span.setAttribute('key', 'value')).not.toThrow();
      expect(span.attributes['key']).toBe('value');

      span.end();
    });

    it('应该能够记录 span 错误', () => {
      const span = service.startSpan('test-error');
      const error = new Error('Test error message');

      expect(() => span.recordException(error)).not.toThrow();
      expect(span.attributes['exception.type']).toBe('Error');
      expect(span.attributes['exception.message']).toBe('Test error message');

      span.end();
    });
  });

  describe('withSpan 包装器', () => {
    it('应该正确包装异步函数', async () => {
      const result = await service.withSpan('async-operation', async () => {
        return Promise.resolve('async-result');
      });

      expect(result).toBe('async-result');
    });

    it('应该正确处理抛出的错误', async () => {
      await expect(
        service.withSpan('error-operation', async () => {
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');
    });

    it('应该正确处理异步错误', async () => {
      await expect(
        service.withSpan('async-error-operation', async () => {
          return Promise.reject(new Error('Async test error'));
        }),
      ).rejects.toThrow('Async test error');
    });

    it('应该允许在 span 回调中访问 span', async () => {
      await service.withSpan('access-span', async (span) => {
        span.setAttribute('custom.key', 'custom-value');
        expect(span.attributes['custom.key']).toBe('custom-value');
      });
    });
  });

  describe('withSpanSync 同步包装器', () => {
    it('应该正确包装同步函数', () => {
      const result = service.withSpanSync('sync-operation', () => {
        return 'sync-result';
      });

      expect(result).toBe('sync-result');
    });

    it('应该正确处理同步错误', () => {
      expect(() =>
        service.withSpanSync('sync-error', () => {
          throw new Error('Sync error');
        }),
      ).toThrow('Sync error');
    });
  });

  describe('上下文传播', () => {
    it('应该能够从 HTTP 头提取上下文', () => {
      const headers = {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      };

      const context = service.extractContext(headers);
      expect(context).toBeDefined();
      expect(context?.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      expect(context?.spanId).toBe('b7ad6b7169203331');
    });

    it('应该处理无效的 traceparent 头', () => {
      const headers = {
        traceparent: 'invalid-traceparent',
      };

      const context = service.extractContext(headers);
      expect(context).toBeNull();
    });

    it('应该处理缺失的 traceparent 头', () => {
      const headers = {};

      const context = service.extractContext(headers);
      expect(context).toBeNull();
    });

    it('应该能够注入上下文到 HTTP 头', () => {
      const span = service.startSpan('test-inject');
      const headers = service.injectContext(span);

      expect(headers).toBeDefined();
      expect(headers['traceparent']).toBeDefined();
      expect(headers['traceparent']).toContain(span.context.traceId);
      expect(headers['x-trace-id']).toBe(span.context.traceId);
      expect(headers['x-span-id']).toBe(span.context.spanId);

      span.end();
    });
  });

  describe('从远程上下文创建 Span', () => {
    it('应该能够从远程上下文创建 span', () => {
      const remoteContext: SpanContext = {
        traceId: '0af7651916cd43dd8448eb211c80319c',
        spanId: 'b7ad6b7169203331',
        traceFlags: 1,
        isRemote: true,
      };

      const span = service.startSpanFromRemoteContext('remote-span', remoteContext);

      expect(span).toBeDefined();
      expect(span.context.traceId).toBe(remoteContext.traceId);
      expect(span.attributes['parent.spanId']).toBe(remoteContext.spanId);
      expect(span.attributes['parent.isRemote']).toBe(true);

      span.end();
    });

    it('应该正确继承远程追踪 ID', () => {
      const remoteContext: SpanContext = {
        traceId: 'abcd1234567890abcdef1234567890ab',
        spanId: '1234567890abcdef',
        traceFlags: 1,
      };

      const span = service.startSpanFromRemoteContext('continue-trace', remoteContext, {
        'custom.key': 'value',
      });

      expect(span.context.traceId).toBe(remoteContext.traceId);
      expect(span.attributes['custom.key']).toBe('value');

      span.end();
    });
  });

  describe('禁用状态', () => {
    it('当禁用时应该仍然返回可用的 span', () => {
      const disabledService = new TracingService({
        serviceName: 'disabled-service',
        enabled: false,
      });

      const span = disabledService.startSpan('noop-operation');
      expect(span).toBeDefined();
      expect(span.context.spanId).toBeDefined();

      // 所有操作都不应该抛出错误
      expect(() => span.end()).not.toThrow();
      expect(() => span.addEvent('event')).not.toThrow();
      expect(() => span.setStatus('ok')).not.toThrow();
      expect(() => span.setAttribute('key', 'value')).not.toThrow();
      expect(() => span.recordException(new Error('test'))).not.toThrow();

      disabledService.onModuleDestroy();
    });

    it('禁用服务应该返回 false', () => {
      const disabledService = new TracingService({
        serviceName: 'disabled-service',
        enabled: false,
      });

      expect(disabledService.isEnabled()).toBe(false);

      disabledService.onModuleDestroy();
    });
  });

  describe('配置验证', () => {
    it('应该使用默认配置创建服务', () => {
      const defaultService = new TracingService();
      expect(defaultService).toBeDefined();
      expect(defaultService.getServiceName()).toBe('mt5-platform');
      defaultService.onModuleDestroy();
    });

    it('应该正确处理自定义配置', () => {
      const customService = new TracingService({
        serviceName: 'custom-service',
        serviceVersion: '2.0.0',
        environment: 'staging',
        samplingRatio: 0.5,
        consoleExport: false,
        enabled: true,
      });
      expect(customService).toBeDefined();
      expect(customService.getServiceName()).toBe('custom-service');
      expect(customService.getEnvironment()).toBe('staging');
      customService.onModuleDestroy();
    });

    it('应该正确处理带 OTLP 端点的配置', () => {
      const otlpService = new TracingService({
        serviceName: 'otlp-service',
        otlpEndpoint: 'http://localhost:4317',
      });
      expect(otlpService).toBeDefined();
      otlpService.onModuleDestroy();
    });
  });

  describe('Span 上下文', () => {
    it('span context 应该包含正确的属性', () => {
      const span = service.startSpan('context-test');

      expect(span.context).toBeDefined();
      expect(span.context.traceId).toBeDefined();
      expect(span.context.spanId).toBeDefined();
      expect(span.context.traceFlags).toBeDefined();
      expect(typeof span.context.traceId).toBe('string');
      expect(typeof span.context.spanId).toBe('string');

      span.end();
    });

    it('trace ID 应该是 32 个字符', () => {
      const span = service.startSpan('trace-id-test');
      expect(span.context.traceId.length).toBe(32);
      span.end();
    });

    it('span ID 应该是 16 个字符', () => {
      const span = service.startSpan('span-id-test');
      expect(span.context.spanId.length).toBe(16);
      span.end();
    });
  });
});
