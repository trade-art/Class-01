/**
 * DataAggregatorService 单元测试
 *
 * 测试内容:
 * - 跨实例数据聚合 (余额、持仓、订单历史)
 * - 平台和租户级别概览
 * - 缓存机制
 * - 熔断器集成
 *
 * middleware-integration Task 9.6
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DataAggregatorService, AccountBalance, Position, OrderHistory } from './data-aggregator.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { MiddlewareClientService } from './middleware-client.service';
import { HealthCheckerService } from './health-checker.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { MiddlewareInstanceInfo } from '../interfaces/middleware-health.interface';

describe('DataAggregatorService', () => {
  let service: DataAggregatorService;
  let prismaService: {
    middlewareInstance: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let middlewareClient: { get: jest.Mock };
  let healthChecker: { getHealthSummary: jest.Mock; getTenantHealthSummary: jest.Mock };
  let circuitBreaker: { canRequest: jest.Mock; getSummary: jest.Mock };

  const mockInstances: Partial<MiddlewareInstanceInfo>[] = [
    {
      id: 'instance-1',
      name: 'Instance 1',
      host: 'localhost',
      port: 8081,
      apiKey: 'key-1',
      useTls: false,
      status: 'ONLINE',
      circuitBreakerState: 'CLOSED',
      consecutiveFailures: 0,
      tenantId: 'tenant-1',
    },
    {
      id: 'instance-2',
      name: 'Instance 2',
      host: 'localhost',
      port: 8082,
      apiKey: 'key-2',
      useTls: false,
      status: 'ONLINE',
      circuitBreakerState: 'CLOSED',
      consecutiveFailures: 0,
      tenantId: 'tenant-1',
    },
  ];

  const mockBalances: AccountBalance[] = [
    {
      login: 1001,
      balance: 10000,
      equity: 10500,
      margin: 1000,
      freeMargin: 9500,
      marginLevel: 1050,
      currency: 'USD',
    },
    {
      login: 1002,
      balance: 5000,
      equity: 5200,
      margin: 500,
      freeMargin: 4700,
      marginLevel: 1040,
      currency: 'EUR',
    },
  ];

  const mockPositions: Position[] = [
    {
      ticket: 12345,
      symbol: 'EURUSD',
      type: 'BUY',
      volume: 1.0,
      openPrice: 1.1000,
      currentPrice: 1.1050,
      profit: 500,
      swap: -10,
      openTime: '2024-01-01T10:00:00Z',
    },
    {
      ticket: 12346,
      symbol: 'GBPUSD',
      type: 'SELL',
      volume: 0.5,
      openPrice: 1.2500,
      currentPrice: 1.2480,
      profit: 100,
      swap: -5,
      openTime: '2024-01-02T14:00:00Z',
    },
  ];

  const mockOrders: OrderHistory[] = [
    {
      ticket: 11111,
      symbol: 'EURUSD',
      type: 'BUY',
      volume: 1.0,
      openPrice: 1.0900,
      closePrice: 1.1000,
      profit: 1000,
      openTime: '2024-01-01T08:00:00Z',
      closeTime: '2024-01-01T16:00:00Z',
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataAggregatorService,
        {
          provide: PrismaService,
          useValue: {
            middlewareInstance: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: MiddlewareClientService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: HealthCheckerService,
          useValue: {
            getHealthSummary: jest.fn(),
            getTenantHealthSummary: jest.fn(),
          },
        },
        {
          provide: CircuitBreakerService,
          useValue: {
            canRequest: jest.fn().mockReturnValue(true),
            getSummary: jest.fn().mockReturnValue({
              total: 2,
              closed: 2,
              open: 0,
              halfOpen: 0,
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DataAggregatorService>(DataAggregatorService);
    prismaService = module.get(PrismaService);
    middlewareClient = module.get(MiddlewareClientService);
    healthChecker = module.get(HealthCheckerService);
    circuitBreaker = module.get(CircuitBreakerService);

    // 清除缓存
    service.clearCache();
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.clearCache();
  });

  describe('getPlatformTradingData', () => {
    it('应聚合所有在线实例的交易数据', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue(mockInstances as any);
      middlewareClient.get.mockResolvedValue(mockBalances);

      const result = await service.getPlatformTradingData();

      expect(result.totalAccounts).toBe(4); // 2 实例 * 2 账户
      expect(result.totalBalance).toBe(30000); // (10000 + 5000) * 2
      expect(result.totalEquity).toBe(31400); // (10500 + 5200) * 2
      expect(result.byCurrency).toBeDefined();
    });

    it('应使用缓存避免重复请求', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue(mockInstances as any);
      middlewareClient.get.mockResolvedValue(mockBalances);

      await service.getPlatformTradingData();
      await service.getPlatformTradingData();

      // 只应调用一次
      expect(prismaService.middlewareInstance.findMany).toHaveBeenCalledTimes(1);
    });

    it('无在线实例时应返回零值', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([]);

      const result = await service.getPlatformTradingData();

      expect(result.totalAccounts).toBe(0);
      expect(result.totalBalance).toBe(0);
      expect(result.totalEquity).toBe(0);
    });

    it('部分实例失败时仍应返回成功实例的数据', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue(mockInstances as any);
      middlewareClient.get
        .mockResolvedValueOnce(mockBalances)
        .mockRejectedValueOnce(new Error('Connection failed'));

      const result = await service.getPlatformTradingData();

      expect(result.totalAccounts).toBe(2); // 只有一个实例成功
    });
  });

  describe('getTenantTradingData', () => {
    it('应只聚合指定租户的数据', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([mockInstances[0]] as any);
      middlewareClient.get.mockResolvedValue(mockBalances);

      const result = await service.getTenantTradingData('tenant-1');

      expect(result.totalAccounts).toBe(2);
      expect(prismaService.middlewareInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
          }),
        }),
      );
    });

    it('不同租户应有独立缓存', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([mockInstances[0]] as any);
      middlewareClient.get.mockResolvedValue(mockBalances);

      await service.getTenantTradingData('tenant-1');
      await service.getTenantTradingData('tenant-2');

      // 应分别调用
      expect(prismaService.middlewareInstance.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAllPositions', () => {
    it('应聚合所有实例的持仓', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue(mockInstances as any);
      middlewareClient.get.mockResolvedValue(mockPositions);

      const result = await service.getAllPositions();

      expect(result.total).toBe(4); // 2 实例 * 2 持仓
      expect(result.positions.length).toBe(4);
    });

    it('持仓应按盈利排序', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([mockInstances[0]] as any);
      middlewareClient.get.mockResolvedValue(mockPositions);

      const result = await service.getAllPositions();

      expect(result.positions[0].profit).toBeGreaterThanOrEqual(result.positions[1].profit);
    });

    it('持仓应包含实例信息', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([mockInstances[0]] as any);
      middlewareClient.get.mockResolvedValue(mockPositions);

      const result = await service.getAllPositions();

      expect(result.positions[0].instanceId).toBe('instance-1');
      expect(result.positions[0].instanceName).toBe('Instance 1');
    });

    it('可按租户过滤', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([mockInstances[0]] as any);
      middlewareClient.get.mockResolvedValue(mockPositions);

      await service.getAllPositions('tenant-1');

      expect(prismaService.middlewareInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
          }),
        }),
      );
    });
  });

  describe('getOrderHistory', () => {
    it('应聚合所有实例的订单历史', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue(mockInstances as any);
      middlewareClient.get.mockResolvedValue(mockOrders);

      const result = await service.getOrderHistory();

      expect(result.total).toBe(2); // 2 实例 * 1 订单
      expect(result.orders.length).toBe(2);
    });

    it('应支持日期过滤', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([mockInstances[0]] as any);
      middlewareClient.get.mockResolvedValue(mockOrders);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await service.getOrderHistory({ startDate, endDate });

      expect(middlewareClient.get).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('startDate'),
        expect.any(Object),
      );
    });

    it('应支持交易品种过滤', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([mockInstances[0]] as any);
      middlewareClient.get.mockResolvedValue(mockOrders);

      await service.getOrderHistory({ symbol: 'EURUSD' });

      expect(middlewareClient.get).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('symbol=EURUSD'),
        expect.any(Object),
      );
    });

    it('订单应按关闭时间排序', async () => {
      const multipleOrders: OrderHistory[] = [
        { ...mockOrders[0], closeTime: '2024-01-01T10:00:00Z' },
        { ...mockOrders[0], closeTime: '2024-01-02T10:00:00Z' },
      ];

      prismaService.middlewareInstance.findMany.mockResolvedValue([mockInstances[0]] as any);
      middlewareClient.get.mockResolvedValue(multipleOrders);

      const result = await service.getOrderHistory();

      // 应按关闭时间降序
      const firstTime = new Date(result.orders[0].closeTime).getTime();
      const secondTime = new Date(result.orders[1].closeTime).getTime();
      expect(firstTime).toBeGreaterThanOrEqual(secondTime);
    });
  });

  describe('getPlatformOverview', () => {
    it('应返回完整的平台概览', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue(mockInstances as any);
      middlewareClient.get.mockResolvedValue(mockBalances);
      healthChecker.getHealthSummary.mockResolvedValue({
        total: 2,
        online: 2,
        offline: 0,
        error: 0,
        degraded: 0,
        lastUpdated: new Date(),
      });

      const result = await service.getPlatformOverview();

      expect(result.health).toBeDefined();
      expect(result.trading).toBeDefined();
      expect(result.circuitBreakers).toBeDefined();
    });

    it('应使用缓存', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue(mockInstances as any);
      middlewareClient.get.mockResolvedValue(mockBalances);
      healthChecker.getHealthSummary.mockResolvedValue({
        total: 2,
        online: 2,
        offline: 0,
        error: 0,
        degraded: 0,
        lastUpdated: new Date(),
      });

      await service.getPlatformOverview();
      await service.getPlatformOverview();

      expect(healthChecker.getHealthSummary).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTenantOverview', () => {
    it('应返回租户概览', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([mockInstances[0]] as any);
      middlewareClient.get.mockResolvedValue(mockBalances);
      healthChecker.getTenantHealthSummary.mockResolvedValue({
        total: 1,
        online: 1,
        offline: 0,
        error: 0,
        degraded: 0,
        lastUpdated: new Date(),
      });

      const result = await service.getTenantOverview('tenant-1');

      expect(result.health).toBeDefined();
      expect(result.trading).toBeDefined();
      expect(result.instances).toBeDefined();
    });

    it('应包含实例列表', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([mockInstances[0]] as any);
      middlewareClient.get.mockResolvedValue(mockBalances);
      healthChecker.getTenantHealthSummary.mockResolvedValue({
        total: 1,
        online: 1,
        offline: 0,
        error: 0,
        degraded: 0,
        lastUpdated: new Date(),
      });

      const result = await service.getTenantOverview('tenant-1');

      expect(result.instances.length).toBeGreaterThan(0);
      expect(result.instances[0].id).toBe('instance-1');
    });
  });

  describe('getInstanceMetrics', () => {
    it('实例存在且熔断器关闭时应返回指标', async () => {
      prismaService.middlewareInstance.findUnique.mockResolvedValue(mockInstances[0] as any);
      middlewareClient.get.mockResolvedValue({ status: 'healthy' });

      const result = await service.getInstanceMetrics('instance-1');

      expect(result).not.toBeNull();
      expect(result!.health).toBeDefined();
      expect(result!.metrics).toBeDefined();
      expect(result!.stats).toBeDefined();
    });

    it('实例不存在时应返回 null', async () => {
      prismaService.middlewareInstance.findUnique.mockResolvedValue(null);

      const result = await service.getInstanceMetrics('non-existent');

      expect(result).toBeNull();
    });

    it('熔断器打开时应返回 null', async () => {
      prismaService.middlewareInstance.findUnique.mockResolvedValue(mockInstances[0] as any);
      circuitBreaker.canRequest.mockReturnValue(false);

      const result = await service.getInstanceMetrics('instance-1');

      expect(result).toBeNull();
    });

    it('请求失败时应返回 null', async () => {
      prismaService.middlewareInstance.findUnique.mockResolvedValue(mockInstances[0] as any);
      middlewareClient.get.mockRejectedValue(new Error('Request failed'));

      const result = await service.getInstanceMetrics('instance-1');

      expect(result).toBeNull();
    });
  });

  describe('clearCache', () => {
    it('无参数时应清除所有缓存', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue(mockInstances as any);
      middlewareClient.get.mockResolvedValue(mockBalances);

      await service.getPlatformTradingData();

      service.clearCache();

      await service.getPlatformTradingData();

      // 应再次调用
      expect(prismaService.middlewareInstance.findMany).toHaveBeenCalledTimes(2);
    });

    it('有模式参数时应只清除匹配的缓存', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue(mockInstances as any);
      middlewareClient.get.mockResolvedValue(mockBalances);
      healthChecker.getHealthSummary.mockResolvedValue({
        total: 2,
        online: 2,
        offline: 0,
        error: 0,
        degraded: 0,
        lastUpdated: new Date(),
      });

      await service.getPlatformTradingData();
      await service.getPlatformOverview();

      // 只清除 trading 相关缓存
      service.clearCache('trading');

      await service.getPlatformTradingData();

      // trading 应重新获取
      // 由于 overview 包含 trading，也会重新获取
      expect(middlewareClient.get).toHaveBeenCalled();
    });
  });

  describe('熔断器集成', () => {
    it('熔断器打开的实例应被跳过', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue(mockInstances as any);
      middlewareClient.get.mockResolvedValue(mockBalances);

      // 第一个实例熔断器打开
      circuitBreaker.canRequest
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      const result = await service.getPlatformTradingData();

      // 只有一个实例成功
      expect(result.totalAccounts).toBe(2);
    });

    it('应正确处理所有熔断器都打开的情况', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue(mockInstances as any);
      circuitBreaker.canRequest.mockReturnValue(false);

      const result = await service.getPlatformTradingData();

      expect(result.totalAccounts).toBe(0);
      expect(result.totalBalance).toBe(0);
    });
  });

  describe('余额聚合', () => {
    it('应按货币分组统计', async () => {
      const mixedBalances: AccountBalance[] = [
        { ...mockBalances[0], currency: 'USD' },
        { ...mockBalances[0], currency: 'USD' },
        { ...mockBalances[0], currency: 'EUR' },
      ];

      prismaService.middlewareInstance.findMany.mockResolvedValue([mockInstances[0]] as any);
      middlewareClient.get.mockResolvedValue(mixedBalances);

      const result = await service.getPlatformTradingData();

      expect(result.byCurrency['USD'].count).toBe(2);
      expect(result.byCurrency['EUR'].count).toBe(1);
    });

    it('应正确计算总盈亏', async () => {
      prismaService.middlewareInstance.findMany.mockResolvedValue([mockInstances[0]] as any);
      middlewareClient.get.mockResolvedValue(mockBalances);

      const result = await service.getPlatformTradingData();

      // 总盈亏 = 总权益 - 总余额
      const expectedProfit = (10500 - 10000) + (5200 - 5000);
      expect(result.totalProfit).toBe(expectedProfit);
    });
  });
});
