import { HttpService } from '@nestjs/axios';
import { AdapterFactory } from './adapter.factory';
import { PlatformType, MtServerConfig } from './types';
import { MT5Adapter } from './mt5.adapter';
import { MT4Adapter } from './mt4.adapter';

describe('AdapterFactory', () => {
  let factory: AdapterFactory;
  let mockHttpService: jest.Mocked<HttpService>;

  const createMockServerConfig = (
    overrides?: Partial<MtServerConfig>,
  ): MtServerConfig => ({
    tenantId: 'tenant-1',
    serverId: 'server-1',
    platformType: PlatformType.MT5,
    middlewareUrl: 'http://localhost:8080',
    serverAddress: 'demo.mt5server.com:443',
    managerLogin: 12345,
    managerPassword: 'password123',
    ...overrides,
  });

  beforeEach(() => {
    mockHttpService = {
      request: jest.fn(),
    } as unknown as jest.Mocked<HttpService>;

    factory = new AdapterFactory(mockHttpService);
  });

  afterEach(() => {
    factory.stopCleanupTimer();
  });

  describe('getAdapter', () => {
    it('应该创建 MT5 适配器', async () => {
      const config = createMockServerConfig();

      const adapter = await factory.getAdapter(config);

      expect(adapter).toBeInstanceOf(MT5Adapter);
      expect(adapter.platformType).toBe(PlatformType.MT5);
    });

    it('应该缓存适配器实例', async () => {
      const config = createMockServerConfig();

      const adapter1 = await factory.getAdapter(config);
      const adapter2 = await factory.getAdapter(config);

      expect(adapter1).toBe(adapter2);
    });

    it('不同租户应该获得不同的适配器实例', async () => {
      const config1 = createMockServerConfig({ tenantId: 'tenant-1' });
      const config2 = createMockServerConfig({ tenantId: 'tenant-2' });

      const adapter1 = await factory.getAdapter(config1);
      const adapter2 = await factory.getAdapter(config2);

      expect(adapter1).not.toBe(adapter2);
    });

    it('不同服务器应该获得不同的适配器实例', async () => {
      const config1 = createMockServerConfig({ serverId: 'server-1' });
      const config2 = createMockServerConfig({ serverId: 'server-2' });

      const adapter1 = await factory.getAdapter(config1);
      const adapter2 = await factory.getAdapter(config2);

      expect(adapter1).not.toBe(adapter2);
    });

    it('配置变化时应该重新创建适配器', async () => {
      const config1 = createMockServerConfig({
        middlewareUrl: 'http://localhost:8080',
      });

      const adapter1 = await factory.getAdapter(config1);

      const config2 = createMockServerConfig({
        middlewareUrl: 'http://localhost:9090',
      });

      const adapter2 = await factory.getAdapter(config2);

      expect(adapter1).not.toBe(adapter2);
    });

    it('应该创建 MT4 适配器', async () => {
      const config = createMockServerConfig({
        platformType: PlatformType.MT4,
      });

      const adapter = await factory.getAdapter(config);

      expect(adapter).toBeInstanceOf(MT4Adapter);
      expect(adapter.platformType).toBe(PlatformType.MT4);
    });

    it('不支持的平台类型应该抛出异常', async () => {
      const config = createMockServerConfig({
        platformType: 'UNKNOWN' as PlatformType,
      });

      await expect(factory.getAdapter(config)).rejects.toThrow(
        'Unsupported platform type: UNKNOWN',
      );
    });
  });

  describe('混合平台测试', () => {
    it('应该同时管理 MT5 和 MT4 适配器', async () => {
      const mt5Config = createMockServerConfig({
        tenantId: 'tenant-1',
        serverId: 'mt5-server',
        platformType: PlatformType.MT5,
      });

      const mt4Config = createMockServerConfig({
        tenantId: 'tenant-1',
        serverId: 'mt4-server',
        platformType: PlatformType.MT4,
      });

      const mt5Adapter = await factory.getAdapter(mt5Config);
      const mt4Adapter = await factory.getAdapter(mt4Config);

      expect(mt5Adapter).toBeInstanceOf(MT5Adapter);
      expect(mt4Adapter).toBeInstanceOf(MT4Adapter);
      expect(mt5Adapter).not.toBe(mt4Adapter);

      const stats = factory.getStats();
      expect(stats.totalAdapters).toBe(2);
      expect(stats.byPlatform[PlatformType.MT5]).toBe(1);
      expect(stats.byPlatform[PlatformType.MT4]).toBe(1);
    });

    it('同一租户可以同时拥有 MT5 和 MT4 服务器', async () => {
      const configs = [
        createMockServerConfig({
          tenantId: 'tenant-multi',
          serverId: 'mt5-demo',
          platformType: PlatformType.MT5,
        }),
        createMockServerConfig({
          tenantId: 'tenant-multi',
          serverId: 'mt5-real',
          platformType: PlatformType.MT5,
        }),
        createMockServerConfig({
          tenantId: 'tenant-multi',
          serverId: 'mt4-demo',
          platformType: PlatformType.MT4,
        }),
        createMockServerConfig({
          tenantId: 'tenant-multi',
          serverId: 'mt4-real',
          platformType: PlatformType.MT4,
        }),
      ];

      const adapters = await Promise.all(
        configs.map((config) => factory.getAdapter(config)),
      );

      expect(adapters).toHaveLength(4);
      expect(adapters.filter((a) => a instanceof MT5Adapter)).toHaveLength(2);
      expect(adapters.filter((a) => a instanceof MT4Adapter)).toHaveLength(2);

      const stats = factory.getStats();
      expect(stats.totalAdapters).toBe(4);
      expect(stats.byTenant['tenant-multi']).toBe(4);
      expect(stats.byPlatform[PlatformType.MT5]).toBe(2);
      expect(stats.byPlatform[PlatformType.MT4]).toBe(2);
    });

    it('移除租户时应该同时移除所有平台的适配器', async () => {
      await factory.getAdapter(
        createMockServerConfig({
          tenantId: 'tenant-remove',
          serverId: 'mt5-server',
          platformType: PlatformType.MT5,
        }),
      );

      await factory.getAdapter(
        createMockServerConfig({
          tenantId: 'tenant-remove',
          serverId: 'mt4-server',
          platformType: PlatformType.MT4,
        }),
      );

      await factory.getAdapter(
        createMockServerConfig({
          tenantId: 'tenant-keep',
          serverId: 'mt5-server',
          platformType: PlatformType.MT5,
        }),
      );

      expect(factory.getStats().totalAdapters).toBe(3);

      const removedCount = await factory.removeAdaptersByTenant('tenant-remove');

      expect(removedCount).toBe(2);
      expect(factory.getStats().totalAdapters).toBe(1);
      expect(factory.getStats().byTenant['tenant-keep']).toBe(1);
    });

    it('每个平台的适配器应该独立缓存', async () => {
      // 注意：每个 serverId 对应一个唯一的服务器实例
      // 实际场景中，MT5 和 MT4 服务器是不同的服务器，应该有不同的 serverId
      const mt5Config = createMockServerConfig({
        tenantId: 'tenant-1',
        serverId: 'mt5-server-1',
        platformType: PlatformType.MT5,
        middlewareUrl: 'http://mt5-middleware:8080',
      });

      const mt4Config = createMockServerConfig({
        tenantId: 'tenant-1',
        serverId: 'mt4-server-1',
        platformType: PlatformType.MT4,
        middlewareUrl: 'http://mt4-middleware:8080',
      });

      const mt5Adapter1 = await factory.getAdapter(mt5Config);
      const mt4Adapter1 = await factory.getAdapter(mt4Config);
      const mt5Adapter2 = await factory.getAdapter(mt5Config);
      const mt4Adapter2 = await factory.getAdapter(mt4Config);

      // 相同配置应该返回相同实例
      expect(mt5Adapter1).toBe(mt5Adapter2);
      expect(mt4Adapter1).toBe(mt4Adapter2);

      // 不同平台应该返回不同实例
      expect(mt5Adapter1).not.toBe(mt4Adapter1);
    });
  });

  describe('removeAdapter', () => {
    it('应该成功移除存在的适配器', async () => {
      const config = createMockServerConfig();
      await factory.getAdapter(config);

      const result = await factory.removeAdapter('tenant-1', 'server-1');

      expect(result).toBe(true);
    });

    it('移除不存在的适配器应返回 false', async () => {
      const result = await factory.removeAdapter('non-existent', 'server');

      expect(result).toBe(false);
    });
  });

  describe('removeAdaptersByTenant', () => {
    it('应该移除租户的所有适配器', async () => {
      await factory.getAdapter(
        createMockServerConfig({
          tenantId: 'tenant-1',
          serverId: 'server-1',
        }),
      );
      await factory.getAdapter(
        createMockServerConfig({
          tenantId: 'tenant-1',
          serverId: 'server-2',
        }),
      );
      await factory.getAdapter(
        createMockServerConfig({
          tenantId: 'tenant-2',
          serverId: 'server-1',
        }),
      );

      const count = await factory.removeAdaptersByTenant('tenant-1');

      expect(count).toBe(2);

      const stats = factory.getStats();
      expect(stats.totalAdapters).toBe(1);
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', async () => {
      await factory.getAdapter(
        createMockServerConfig({
          tenantId: 'tenant-1',
          serverId: 'server-1',
        }),
      );
      await factory.getAdapter(
        createMockServerConfig({
          tenantId: 'tenant-1',
          serverId: 'server-2',
        }),
      );
      await factory.getAdapter(
        createMockServerConfig({
          tenantId: 'tenant-2',
          serverId: 'server-1',
        }),
      );

      const stats = factory.getStats();

      expect(stats.totalAdapters).toBe(3);
      expect(stats.byPlatform[PlatformType.MT5]).toBe(3);
      expect(stats.byTenant['tenant-1']).toBe(2);
      expect(stats.byTenant['tenant-2']).toBe(1);
    });

    it('空工厂应返回零统计', () => {
      const stats = factory.getStats();

      expect(stats.totalAdapters).toBe(0);
    });
  });

  describe('cleanupIdleAdapters', () => {
    it('应该清理空闲适配器', async () => {
      await factory.getAdapter(createMockServerConfig());

      // 模拟适配器空闲超时
      const privateFactory = factory as unknown as {
        adapters: Map<string, { lastUsed: Date }>;
        maxIdleTime: number;
      };

      const adapter = privateFactory.adapters.get('tenant-1:server-1');
      if (adapter) {
        adapter.lastUsed = new Date(
          Date.now() - privateFactory.maxIdleTime - 1000,
        );
      }

      const count = factory.cleanupIdleAdapters();

      expect(count).toBe(1);
      expect(factory.getStats().totalAdapters).toBe(0);
    });

    it('不应该清理活跃的适配器', async () => {
      await factory.getAdapter(createMockServerConfig());

      const count = factory.cleanupIdleAdapters();

      expect(count).toBe(0);
      expect(factory.getStats().totalAdapters).toBe(1);
    });
  });

  describe('熔断器管理', () => {
    describe('getCircuitBreakerStatus', () => {
      it('未初始化时应返回 null', () => {
        const status = factory.getCircuitBreakerStatus('tenant-1', 'server-1');

        expect(status).toBeNull();
      });

      it('重置后应返回 closed 状态', () => {
        factory.resetCircuitBreaker('tenant-1', 'server-1');

        const status = factory.getCircuitBreakerStatus('tenant-1', 'server-1');

        expect(status).not.toBeNull();
        expect(status?.state).toBe('closed');
        expect(status?.failureCount).toBe(0);
      });
    });

    describe('recordSuccess', () => {
      it('应该记录成功并重置失败计数', () => {
        factory.recordFailure('tenant-1', 'server-1');
        factory.recordFailure('tenant-1', 'server-1');

        factory.recordSuccess('tenant-1', 'server-1');

        const status = factory.getCircuitBreakerStatus('tenant-1', 'server-1');
        expect(status?.failureCount).toBe(0);
        expect(status?.state).toBe('closed');
      });
    });

    describe('recordFailure', () => {
      it('应该累计失败次数', () => {
        factory.recordFailure('tenant-1', 'server-1');
        factory.recordFailure('tenant-1', 'server-1');
        factory.recordFailure('tenant-1', 'server-1');

        const status = factory.getCircuitBreakerStatus('tenant-1', 'server-1');
        expect(status?.failureCount).toBe(3);
      });

      it('达到阈值后应该打开熔断器', () => {
        // 默认阈值是 5
        for (let i = 0; i < 5; i++) {
          factory.recordFailure('tenant-1', 'server-1');
        }

        const status = factory.getCircuitBreakerStatus('tenant-1', 'server-1');
        expect(status?.state).toBe('open');
      });
    });

    describe('isCircuitBreakerOpen', () => {
      it('closed 状态应返回 false', () => {
        factory.resetCircuitBreaker('tenant-1', 'server-1');

        const isOpen = factory.isCircuitBreakerOpen('tenant-1', 'server-1');

        expect(isOpen).toBe(false);
      });

      it('open 状态应返回 true', () => {
        for (let i = 0; i < 5; i++) {
          factory.recordFailure('tenant-1', 'server-1');
        }

        const isOpen = factory.isCircuitBreakerOpen('tenant-1', 'server-1');

        expect(isOpen).toBe(true);
      });

      it('超时后应该进入 half-open 状态', () => {
        // 打开熔断器
        for (let i = 0; i < 5; i++) {
          factory.recordFailure('tenant-1', 'server-1');
        }

        // 模拟超时
        const privateFactory = factory as unknown as {
          circuitBreakers: Map<string, { lastFailure: Date; state: string }>;
          circuitBreakerTimeout: number;
        };

        const breaker = privateFactory.circuitBreakers.get('tenant-1:server-1');
        if (breaker) {
          breaker.lastFailure = new Date(
            Date.now() - privateFactory.circuitBreakerTimeout - 1000,
          );
        }

        const isOpen = factory.isCircuitBreakerOpen('tenant-1', 'server-1');

        expect(isOpen).toBe(false);

        const status = factory.getCircuitBreakerStatus('tenant-1', 'server-1');
        expect(status?.state).toBe('half-open');
      });
    });

    describe('getAllCircuitBreakerStatus', () => {
      it('应该返回所有熔断器状态', () => {
        factory.resetCircuitBreaker('tenant-1', 'server-1');
        factory.resetCircuitBreaker('tenant-2', 'server-1');

        const all = factory.getAllCircuitBreakerStatus();

        expect(all.size).toBe(2);
        expect(all.has('tenant-1:server-1')).toBe(true);
        expect(all.has('tenant-2:server-1')).toBe(true);
      });
    });
  });

  describe('destroy', () => {
    it('应该清理所有资源', async () => {
      await factory.getAdapter(createMockServerConfig());
      factory.resetCircuitBreaker('tenant-1', 'server-1');

      await factory.destroy();

      expect(factory.getStats().totalAdapters).toBe(0);
      expect(factory.getAllCircuitBreakerStatus().size).toBe(0);
    });
  });
});
