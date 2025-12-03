/**
 * HealthCheckerService 单元测试
 *
 * 测试内容:
 * - 定时健康检查任务
 * - 单实例/批量健康检查
 * - 失败计数和告警触发
 * - 缓存机制
 * - 状态映射逻辑
 * - 数据库更新
 *
 * middleware-integration Task 7.7
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckerService } from './health-checker.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { MiddlewareClientService } from './middleware-client.service';
import { CircuitBreakerService, CircuitState } from './circuit-breaker.service';
import { EventEmitterService } from './event-emitter.service';
import { MiddlewareInstanceInfo, MiddlewareHealth } from '../interfaces/middleware-health.interface';

describe('HealthCheckerService', () => {
  let service: HealthCheckerService;
  let prismaService: {
    middlewareInstance: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      groupBy: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let middlewareClient: { get: jest.Mock };
  let circuitBreaker: { getState: jest.Mock };
  let eventEmitter: { emitStatusChange: jest.Mock; emitHealthCheckAlert: jest.Mock };

  const mockInstance: MiddlewareInstanceInfo = {
    id: 'instance-1',
    name: 'Test Instance',
    host: 'localhost',
    port: 8080,
    apiKey: 'test-key',
    useTls: false,
    status: 'ONLINE',
    circuitBreakerState: 'CLOSED',
    consecutiveFailures: 0,
    tenantId: 'tenant-1',
  };

  const mockHealthyResponse: MiddlewareHealth = {
    status: 'healthy',
    service: 'mt5-middleware',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    components: [
      { name: 'MT5', status: 'up', details: { message: 'Connected' } },
      { name: 'Redis', status: 'up', details: { message: 'OK' } },
    ],
  };

  beforeEach(async () => {
    // 创建 mock 对象
    prismaService = {
      middlewareInstance: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    middlewareClient = {
      get: jest.fn(),
    };

    circuitBreaker = {
      getState: jest.fn().mockReturnValue({
        state: CircuitState.CLOSED,
        failures: 0,
        successes: 0,
        lastFailure: null,
        lastSuccess: null,
        lastStateChange: new Date(),
        totalRequests: 0,
        totalFailures: 0,
      }),
    };

    eventEmitter = {
      emitStatusChange: jest.fn(),
      emitHealthCheckAlert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthCheckerService,
        { provide: PrismaService, useValue: prismaService },
        { provide: MiddlewareClientService, useValue: middlewareClient },
        { provide: CircuitBreakerService, useValue: circuitBreaker },
        { provide: EventEmitterService, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<HealthCheckerService>(HealthCheckerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.clearCache();
  });

  describe('初始化', () => {
    it('应该正确创建服务实例', () => {
      expect(service).toBeDefined();
    });
  });

  describe('checkInstanceHealth', () => {
    it('健康检查成功应返回 ONLINE 状态', async () => {
      middlewareClient.get.mockResolvedValue(mockHealthyResponse);

      const result = await service.checkInstanceHealth(mockInstance);

      expect(result.instanceId).toBe('instance-1');
      expect(result.status).toBe('ONLINE');
      expect(result.data).toEqual(mockHealthyResponse);
      expect(result.errorMessage).toBeUndefined();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('健康检查失败应返回 ERROR 状态', async () => {
      middlewareClient.get.mockRejectedValue(new Error('Connection refused'));

      const result = await service.checkInstanceHealth(mockInstance);

      expect(result.instanceId).toBe('instance-1');
      expect(result.status).toBe('ERROR');
      expect(result.data).toBeNull();
      expect(result.errorMessage).toBe('Connection refused');
    });

    it('达到失败阈值应返回 OFFLINE 状态并发送告警', async () => {
      middlewareClient.get.mockRejectedValue(new Error('Connection refused'));

      // 连续失败 3 次 (ALERT_THRESHOLD = 3)
      await service.checkInstanceHealth(mockInstance);
      await service.checkInstanceHealth(mockInstance);
      const result = await service.checkInstanceHealth(mockInstance);

      expect(result.status).toBe('OFFLINE');
      expect(eventEmitter.emitHealthCheckAlert).toHaveBeenCalledWith(
        'instance-1',
        3,
        'Connection refused',
      );
    });

    it('成功后应重置失败计数', async () => {
      middlewareClient.get
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce(mockHealthyResponse)
        .mockRejectedValueOnce(new Error('Error 3'));

      await service.checkInstanceHealth(mockInstance);
      await service.checkInstanceHealth(mockInstance);
      await service.checkInstanceHealth(mockInstance); // 成功，重置计数

      // 再失败一次，计数应该是 1，不是 3
      const result = await service.checkInstanceHealth(mockInstance);
      expect(result.status).toBe('ERROR'); // 不是 OFFLINE
    });

    it('状态变更时应发送事件', async () => {
      const offlineInstance = { ...mockInstance, status: 'OFFLINE' as const };
      middlewareClient.get.mockResolvedValue(mockHealthyResponse);

      await service.checkInstanceHealth(offlineInstance);

      expect(eventEmitter.emitStatusChange).toHaveBeenCalledWith(
        'instance-1',
        'OFFLINE',
        'ONLINE',
        'Health check succeeded',
      );
    });
  });

  describe('runHealthChecks', () => {
    it('没有活跃实例时应返回空数组', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([]);

      const results = await service.runHealthChecks();

      expect(results).toEqual([]);
      expect(middlewareClient.get).not.toHaveBeenCalled();
    });

    it('应并行检查所有实例', async () => {
      const instances = [
        { ...mockInstance, id: 'instance-1', name: 'Instance 1' },
        { ...mockInstance, id: 'instance-2', name: 'Instance 2' },
        { ...mockInstance, id: 'instance-3', name: 'Instance 3' },
      ];

      prismaService.middlewareInstance.findMany.mockResolvedValue(instances);
      middlewareClient.get.mockResolvedValue(mockHealthyResponse);
      prismaService.$transaction.mockResolvedValue([]);

      const results = await service.runHealthChecks();

      expect(results.length).toBe(3);
      expect(middlewareClient.get).toHaveBeenCalledTimes(3);
    });

    it('应更新数据库中的实例状态', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([mockInstance]);
      middlewareClient.get.mockResolvedValue(mockHealthyResponse);
      prismaService.$transaction.mockResolvedValue([]);

      await service.runHealthChecks();

      expect(prismaService.$transaction).toHaveBeenCalled();
    });

    it('健康检查过程中出错不应影响其他实例', async () => {
      const instances = [
        { ...mockInstance, id: 'instance-1' },
        { ...mockInstance, id: 'instance-2' },
      ];

      prismaService.middlewareInstance.findMany.mockResolvedValue(instances);
      middlewareClient.get
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(mockHealthyResponse);
      prismaService.$transaction.mockResolvedValue([]);

      const results = await service.runHealthChecks();

      expect(results.length).toBe(2);
      expect(results[0].status).toBe('ERROR');
      expect(results[1].status).toBe('ONLINE');
    });
  });

  describe('scheduledHealthCheck', () => {
    it('当检查正在运行时应跳过', async () => {
      prismaService.middlewareInstance.findMany.mockImplementation(async () => {
        // 模拟长时间运行
        await new Promise(resolve => setTimeout(resolve, 100));
        return [];
      });

      // 启动第一次检查
      const firstCheck = service.runHealthChecks();

      // 立即尝试第二次检查
      await service.scheduledHealthCheck();

      await firstCheck;

      // findMany 只应被调用一次
      expect(prismaService.middlewareInstance.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCachedHealth', () => {
    it('没有缓存时应返回 null', () => {
      const result = service.getCachedHealth('non-existent');
      expect(result).toBeNull();
    });

    it('有缓存时应返回缓存的结果', async () => {
      middlewareClient.get.mockResolvedValue(mockHealthyResponse);

      await service.checkInstanceHealth(mockInstance);

      const cached = service.getCachedHealth('instance-1');

      expect(cached).not.toBeNull();
      expect(cached!.instanceId).toBe('instance-1');
      expect(cached!.status).toBe('ONLINE');
    });

    it('缓存过期后应返回 null', async () => {
      middlewareClient.get.mockResolvedValue(mockHealthyResponse);

      await service.checkInstanceHealth(mockInstance);

      // 使用 jest.useFakeTimers 模拟时间流逝
      jest.useFakeTimers();
      jest.advanceTimersByTime(31000); // 超过 30 秒缓存 TTL

      const cached = service.getCachedHealth('instance-1');

      expect(cached).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('clearCache', () => {
    it('应清除指定实例的缓存', async () => {
      middlewareClient.get.mockResolvedValue(mockHealthyResponse);

      await service.checkInstanceHealth(mockInstance);
      expect(service.getCachedHealth('instance-1')).not.toBeNull();

      service.clearCache('instance-1');
      expect(service.getCachedHealth('instance-1')).toBeNull();
    });

    it('不指定 ID 时应清除所有缓存', async () => {
      const instance2 = { ...mockInstance, id: 'instance-2' };
      middlewareClient.get.mockResolvedValue(mockHealthyResponse);

      await service.checkInstanceHealth(mockInstance);
      await service.checkInstanceHealth(instance2);

      expect(service.getCachedHealth('instance-1')).not.toBeNull();
      expect(service.getCachedHealth('instance-2')).not.toBeNull();

      service.clearCache();

      expect(service.getCachedHealth('instance-1')).toBeNull();
      expect(service.getCachedHealth('instance-2')).toBeNull();
    });
  });

  describe('checkSingleInstance', () => {
    it('实例存在时应执行健康检查', async () => {
      prismaService.middlewareInstance.findUnique.mockResolvedValue(mockInstance);
      middlewareClient.get.mockResolvedValue(mockHealthyResponse);

      const result = await service.checkSingleInstance('instance-1');

      expect(result.instanceId).toBe('instance-1');
      expect(result.status).toBe('ONLINE');
    });

    it('实例不存在时应抛出错误', async () => {
      prismaService.middlewareInstance.findUnique.mockResolvedValue(null);

      await expect(service.checkSingleInstance('non-existent')).rejects.toThrow(
        'Instance non-existent not found',
      );
    });
  });

  describe('getHealthSummary', () => {
    it('应返回正确的健康摘要', async () => {
      prismaService.middlewareInstance.groupBy.mockResolvedValue([
        { status: 'ONLINE', _count: { status: 5 } },
        { status: 'OFFLINE', _count: { status: 2 } },
        { status: 'ERROR', _count: { status: 1 } },
        { status: 'DEGRADED', _count: { status: 1 } },
      ]);

      const summary = await service.getHealthSummary();

      expect(summary.total).toBe(9);
      expect(summary.online).toBe(5);
      expect(summary.offline).toBe(2);
      expect(summary.error).toBe(1);
      expect(summary.degraded).toBe(1);
      expect(summary.lastUpdated).toBeDefined();
    });

    it('没有实例时应返回全零摘要', async () => {
      prismaService.middlewareInstance.groupBy.mockResolvedValue([]);

      const summary = await service.getHealthSummary();

      expect(summary.total).toBe(0);
      expect(summary.online).toBe(0);
      expect(summary.offline).toBe(0);
      expect(summary.error).toBe(0);
      expect(summary.degraded).toBe(0);
    });
  });

  describe('getTenantHealthSummary', () => {
    it('应返回指定租户的健康摘要', async () => {
      prismaService.middlewareInstance.groupBy.mockResolvedValue([
        { status: 'ONLINE', _count: { status: 3 } },
        { status: 'OFFLINE', _count: { status: 1 } },
      ]);

      const summary = await service.getTenantHealthSummary('tenant-1');

      expect(summary.total).toBe(4);
      expect(summary.online).toBe(3);
      expect(summary.offline).toBe(1);
    });

    it('应按租户 ID 过滤', async () => {
      prismaService.middlewareInstance.groupBy.mockResolvedValue([]);

      await service.getTenantHealthSummary('tenant-123');

      expect(prismaService.middlewareInstance.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-123' },
        }),
      );
    });
  });

  describe('状态映射', () => {
    it('healthy 应映射为 ONLINE', async () => {
      middlewareClient.get.mockResolvedValue({ ...mockHealthyResponse, status: 'healthy' });

      const result = await service.checkInstanceHealth(mockInstance);

      expect(result.status).toBe('ONLINE');
    });

    it('degraded 应映射为 DEGRADED', async () => {
      middlewareClient.get.mockResolvedValue({ ...mockHealthyResponse, status: 'degraded' });

      const result = await service.checkInstanceHealth(mockInstance);

      expect(result.status).toBe('DEGRADED');
    });

    it('unhealthy 应映射为 ERROR', async () => {
      middlewareClient.get.mockResolvedValue({ ...mockHealthyResponse, status: 'unhealthy' });

      const result = await service.checkInstanceHealth(mockInstance);

      expect(result.status).toBe('ERROR');
    });

    it('未知状态应映射为 ERROR', async () => {
      middlewareClient.get.mockResolvedValue({ ...mockHealthyResponse, status: 'unknown' });

      const result = await service.checkInstanceHealth(mockInstance);

      expect(result.status).toBe('ERROR');
    });
  });

  describe('onModuleInit', () => {
    it('初始化时应执行健康检查', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([]);

      await service.onModuleInit();

      expect(prismaService.middlewareInstance.findMany).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('销毁时应清除所有缓存', async () => {
      middlewareClient.get.mockResolvedValue(mockHealthyResponse);
      await service.checkInstanceHealth(mockInstance);

      expect(service.getCachedHealth('instance-1')).not.toBeNull();

      service.onModuleDestroy();

      expect(service.getCachedHealth('instance-1')).toBeNull();
    });
  });
});
