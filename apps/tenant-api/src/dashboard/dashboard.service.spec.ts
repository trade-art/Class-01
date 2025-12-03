import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { MiddlewareProxyService } from '../middleware-proxy';

describe('DashboardService', () => {
  let service: DashboardService;

  const mockMiddlewareProxyService = {
    getAccountInfo: jest.fn(),
    getPositions: jest.fn(),
    getServerStatus: jest.fn(),
    getDeals: jest.fn(),
    getOrders: jest.fn(),
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
      const mockAccountInfo = {
        balance: 100000,
        equity: 105000,
        margin: 20000,
        freeMargin: 85000,
        marginLevel: 525,
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
      };

      mockMiddlewareProxyService.getAccountInfo.mockResolvedValue(mockAccountInfo);
      mockMiddlewareProxyService.getPositions.mockResolvedValue(mockPositions);
      mockMiddlewareProxyService.getServerStatus.mockResolvedValue(mockServerStatus);
      mockMiddlewareProxyService.getDeals.mockResolvedValue(mockDeals);

      const result = await service.getDashboardData(mockInstanceId);

      expect(result).toHaveProperty('accountSummary');
      expect(result).toHaveProperty('positionsSummary');
      expect(result).toHaveProperty('bySymbol');
      expect(result).toHaveProperty('recentDeals');
      expect(result).toHaveProperty('serverStatus');

      expect(result.accountSummary.totalBalance).toBe(100000);
      expect(result.positionsSummary.totalPositions).toBe(2);
    });

    it('中间件不可用时应返回默认值', async () => {
      mockMiddlewareProxyService.getAccountInfo.mockRejectedValue(
        new Error('Service unavailable'),
      );
      mockMiddlewareProxyService.getPositions.mockRejectedValue(
        new Error('Service unavailable'),
      );
      mockMiddlewareProxyService.getServerStatus.mockRejectedValue(
        new Error('Service unavailable'),
      );
      mockMiddlewareProxyService.getDeals.mockRejectedValue(
        new Error('Service unavailable'),
      );

      const result = await service.getDashboardData(mockInstanceId);

      expect(result.accountSummary.totalBalance).toBe(0);
      expect(result.positionsSummary.totalPositions).toBe(0);
      expect(result.serverStatus.connected).toBe(false);
    });
  });

  describe('getAccountSummary', () => {
    it('应该返回账户摘要数据', async () => {
      const mockAccountInfo = {
        balance: 100000,
        equity: 105000,
        margin: 20000,
        freeMargin: 85000,
        marginLevel: 525,
      };
      mockMiddlewareProxyService.getAccountInfo.mockResolvedValue(mockAccountInfo);

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
      mockMiddlewareProxyService.getPositions.mockResolvedValue(mockPositions);

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

      mockMiddlewareProxyService.getPositions.mockResolvedValue(mockPositions);
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
