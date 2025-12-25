import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { MiddlewareProxyService } from '../middleware-proxy';
import { CacheService } from '../common';

describe('DashboardService', () => {
  let service: DashboardService;

  const mockMiddlewareProxyService = {
    getAccountInfo: jest.fn(),
    getPositions: jest.fn(),
    getServerStatus: jest.fn(),
    getDeals: jest.fn(),
    getOrders: jest.fn(),
    getUsers: jest.fn(),
    getAllPositionsForDashboard: jest.fn(),
    getRecentDealsForDashboard: jest.fn(),
    testAuthentication: jest.fn(),
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    buildKey: jest.fn().mockImplementation((...args: string[]) => args.join(':')),
  };

  const mockInstanceId = 'instance-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: MiddlewareProxyService,
          useValue: mockMiddlewareProxyService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboardData', () => {
    it('应该返回完整的 Dashboard 数据', async () => {
      // 模拟缓存未命中
      mockCacheService.get.mockResolvedValue(null);

      // SaaS 模式: 使用 getUsers 聚合所有交易者数据
      const mockUsers = {
        users: [
          { balance: 50000, equity: 52000, credit: 0, margin: 10000, margin_free: 42000, margin_level: 520 },
          { balance: 50000, equity: 53000, credit: 0, margin: 10000, margin_free: 43000, margin_level: 530 },
        ],
        pagination: { total: 2, page: 1, pages: 1, limit: 1000 },
      };

      const mockPositions = [
        { symbol: 'EURUSD', type: 'buy', volume: 1.0, profit: 500 },
        { symbol: 'GBPUSD', type: 'sell', volume: 0.5, profit: -100 },
      ];

      const mockServerStatus = {
        connected: true,
        serverTime: '2024-01-15T10:00:00Z',
        ping: 50,
      };

      const mockDeals = {
        deals: [
          {
            ticket: 12345,
            symbol: 'EURUSD',
            type: 'buy',
            volume: 1.0,
            profit: 250,
            time: '2024-01-15T09:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
      };

      mockMiddlewareProxyService.getUsers.mockResolvedValue(mockUsers);
      mockMiddlewareProxyService.getAllPositionsForDashboard.mockResolvedValue(mockPositions);
      mockMiddlewareProxyService.getServerStatus.mockResolvedValue(mockServerStatus);
      mockMiddlewareProxyService.getRecentDealsForDashboard.mockResolvedValue(mockDeals);
      mockMiddlewareProxyService.testAuthentication.mockResolvedValue(true);

      const result = await service.getDashboardData(mockInstanceId);

      expect(result).toHaveProperty('accountSummary');
      expect(result).toHaveProperty('positionsSummary');
      expect(result).toHaveProperty('bySymbol');
      expect(result).toHaveProperty('recentDeals');
      expect(result).toHaveProperty('serverStatus');

      expect(result.accountSummary.totalBalance).toBe(100000);
      expect(result.positionsSummary.totalPositions).toBe(2);
      // 验证 MT5 连接状态：数据获取成功应该返回 authenticated: true
      expect(result.serverStatus.authenticated).toBe(true);
    });

    it('中间件不可用时应返回默认值并显示 MT5 未连接', async () => {
      // 模拟缓存未命中
      mockCacheService.get.mockResolvedValue(null);

      mockMiddlewareProxyService.getUsers.mockRejectedValue(
        new Error('Service unavailable'),
      );
      mockMiddlewareProxyService.getAllPositionsForDashboard.mockRejectedValue(
        new Error('Service unavailable'),
      );
      mockMiddlewareProxyService.getServerStatus.mockRejectedValue(
        new Error('Service unavailable'),
      );
      mockMiddlewareProxyService.getRecentDealsForDashboard.mockRejectedValue(
        new Error('Service unavailable'),
      );
      mockMiddlewareProxyService.testAuthentication.mockResolvedValue(false);

      const result = await service.getDashboardData(mockInstanceId);

      expect(result.accountSummary.totalBalance).toBe(0);
      expect(result.positionsSummary.totalPositions).toBe(0);
      expect(result.serverStatus.connected).toBe(false);
      // 数据获取失败时，authenticated 应该为 false
      expect(result.serverStatus.authenticated).toBe(false);
    });

    it('中间件在线但 MT5 未连接时应显示正确状态', async () => {
      // 模拟缓存未命中
      mockCacheService.get.mockResolvedValue(null);

      // 中间件健康检查通过（HTTP 服务在线）
      mockMiddlewareProxyService.getServerStatus.mockResolvedValue({
        connected: true, // 中间件在线
        serverTime: '2024-01-15T10:00:00Z',
        ping: 50,
      });

      // 认证可能成功（缓存的会话），但实际数据获取会失败
      mockMiddlewareProxyService.testAuthentication.mockResolvedValue(true);

      // MT5 数据调用失败（MT5 未连接）
      mockMiddlewareProxyService.getUsers.mockRejectedValue(
        new Error('MT5 server not connected'),
      );
      mockMiddlewareProxyService.getAllPositionsForDashboard.mockRejectedValue(
        new Error('MT5 server not connected'),
      );
      mockMiddlewareProxyService.getRecentDealsForDashboard.mockRejectedValue(
        new Error('MT5 server not connected'),
      );

      const result = await service.getDashboardData(mockInstanceId);

      // 中间件在线
      expect(result.serverStatus.connected).toBe(true);
      // 但 MT5 数据获取失败，所以 authenticated 应该为 false
      expect(result.serverStatus.authenticated).toBe(false);
      // 数据应为空
      expect(result.accountSummary.totalBalance).toBe(0);
      expect(result.positionsSummary.totalPositions).toBe(0);
    });

    it('应该使用缓存数据', async () => {
      const cachedData = {
        accountSummary: { totalBalance: 50000, totalEquity: 52000, totalProfit: 2000, totalMargin: 5000, totalFreeMargin: 47000, marginLevel: 1040 },
        positionsSummary: { totalPositions: 5, totalVolume: 3.5, totalProfit: 500, buyCount: 3, sellCount: 2, buyProfit: 400, sellProfit: 100 },
        usersSummary: { totalUsers: 10, activeUsers: 5 },
        bySymbol: [],
        recentDeals: [],
        tradingTrend: [],
      };

      mockCacheService.get.mockResolvedValue(cachedData);
      mockMiddlewareProxyService.getServerStatus.mockResolvedValue({
        connected: true,
        serverTime: '2024-01-15T10:00:00Z',
        ping: 50,
      });
      mockMiddlewareProxyService.testAuthentication.mockResolvedValue(true);

      const result = await service.getDashboardData(mockInstanceId);

      // 应该使用缓存数据
      expect(result.accountSummary.totalBalance).toBe(50000);
      expect(result.positionsSummary.totalPositions).toBe(5);
      // 不应该调用数据获取方法
      expect(mockMiddlewareProxyService.getUsers).not.toHaveBeenCalled();
    });
  });

  describe('getAccountSummary', () => {
    it('应该返回账户摘要数据', async () => {
      // SaaS 模式: 使用 getUsers 聚合所有交易者数据
      const mockUsers = {
        users: [
          { balance: 50000, equity: 52500, credit: 0, margin: 10000, margin_free: 42500, margin_level: 525 },
          { balance: 50000, equity: 52500, credit: 0, margin: 10000, margin_free: 42500, margin_level: 525 },
        ],
        pagination: { total: 2, page: 1, pages: 1, limit: 1000 },
      };
      mockMiddlewareProxyService.getUsers.mockResolvedValue(mockUsers);

      const result = await service.getAccountSummary(mockInstanceId);

      expect(result.totalBalance).toBe(100000);
      expect(result.totalEquity).toBe(105000);
      expect(result.totalProfit).toBe(5000);
      expect(result.totalMargin).toBe(20000);
    });
  });

  describe('getPositionsSummary', () => {
    it('应该返回持仓统计数据', async () => {
      const mockPositions = [
        { symbol: 'EURUSD', type: 'buy', volume: 1.0, profit: 500 },
        { symbol: 'EURUSD', type: 'buy', volume: 0.5, profit: 200 },
        { symbol: 'GBPUSD', type: 'sell', volume: 1.0, profit: -100 },
      ];
      mockMiddlewareProxyService.getAllPositionsForDashboard.mockResolvedValue(mockPositions);

      const result = await service.getPositionsSummary(mockInstanceId);

      expect(result.totalPositions).toBe(3);
      expect(result.buyCount).toBe(2);
      expect(result.sellCount).toBe(1);
      expect(result.totalVolume).toBe(2.5);
      expect(result.totalProfit).toBe(600);
    });
  });

  describe('getQuickStats', () => {
    it('应该返回快速统计数据', async () => {
      const mockPositions = [
        { symbol: 'EURUSD', type: 'buy', volume: 1.0, profit: 500 },
      ];
      const mockDeals = {
        deals: [{ profit: 100 }, { profit: 200 }],
        total: 2,
      };
      const mockOrders = { orders: [], total: 3 };

      mockMiddlewareProxyService.getAllPositionsForDashboard.mockResolvedValue(mockPositions);
      mockMiddlewareProxyService.getDeals.mockResolvedValue(mockDeals);
      mockMiddlewareProxyService.getOrders.mockResolvedValue(mockOrders);

      const result = await service.getQuickStats(mockInstanceId);

      expect(result).toHaveProperty('todayProfit');
      expect(result).toHaveProperty('weekProfit');
      expect(result).toHaveProperty('monthProfit');
      expect(result).toHaveProperty('todayTrades');
      expect(result).toHaveProperty('activePositions');
      expect(result).toHaveProperty('pendingOrders');
    });
  });
});
