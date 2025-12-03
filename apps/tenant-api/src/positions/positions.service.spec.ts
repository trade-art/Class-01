import { Test, TestingModule } from '@nestjs/testing';
import { PositionsService } from './positions.service';
import { MiddlewareProxyService } from '../middleware-proxy';

describe('PositionsService', () => {
  let service: PositionsService;

  const mockMiddlewareProxyService = {
    getPositions: jest.fn(),
  };

  const mockInstanceId = 'instance-1';

  const mockPositions = [
    {
      ticket: 12345,
      symbol: 'EURUSD',
      type: 'buy',
      volume: 1.0,
      openPrice: 1.085,
      currentPrice: 1.0875,
      stopLoss: 1.08,
      takeProfit: 1.095,
      profit: 250,
      openTime: '2024-01-15T10:30:00Z',
      comment: 'Test position',
    },
    {
      ticket: 12346,
      symbol: 'GBPUSD',
      type: 'sell',
      volume: 0.5,
      openPrice: 1.265,
      currentPrice: 1.2625,
      stopLoss: 1.27,
      takeProfit: 1.255,
      profit: 125,
      openTime: '2024-01-15T11:00:00Z',
      comment: '',
    },
    {
      ticket: 12347,
      symbol: 'EURUSD',
      type: 'buy',
      volume: 0.5,
      openPrice: 1.086,
      currentPrice: 1.0875,
      stopLoss: 1.082,
      takeProfit: 1.092,
      profit: -50,
      openTime: '2024-01-15T11:30:00Z',
      comment: '',
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PositionsService,
        {
          provide: MiddlewareProxyService,
          useValue: mockMiddlewareProxyService,
        },
      ],
    }).compile();

    service = module.get<PositionsService>(PositionsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getList', () => {
    it('应该返回持仓列表', async () => {
      mockMiddlewareProxyService.getPositions.mockResolvedValue(mockPositions);

      const result = await service.getList(mockInstanceId, {});

      expect(result).toHaveProperty('positions');
      expect(result).toHaveProperty('total', 3);
      expect(result).toHaveProperty('page', 1);
      expect(result.positions).toHaveLength(3);
    });

    it('应该支持分页', async () => {
      mockMiddlewareProxyService.getPositions.mockResolvedValue(mockPositions);

      const result = await service.getList(mockInstanceId, { page: 1, limit: 2 });

      expect(result.positions).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.totalPages).toBe(2);
    });

    it('应该支持按品种过滤', async () => {
      mockMiddlewareProxyService.getPositions.mockResolvedValue(mockPositions);

      const result = await service.getList(mockInstanceId, { symbol: 'EURUSD' });

      expect(result.positions).toHaveLength(2);
      expect(result.positions.every((p) => p.symbol === 'EURUSD')).toBe(true);
    });

    it('应该支持按类型过滤', async () => {
      mockMiddlewareProxyService.getPositions.mockResolvedValue(mockPositions);
      const { PositionType } = await import('./dto');

      const result = await service.getList(mockInstanceId, { type: PositionType.BUY });

      expect(result.positions).toHaveLength(2);
      expect(result.positions.every((p) => p.type === 'buy')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('应该返回持仓统计', async () => {
      mockMiddlewareProxyService.getPositions.mockResolvedValue(mockPositions);

      const result = await service.getStats(mockInstanceId);

      expect(result.totalPositions).toBe(3);
      expect(result.buyCount).toBe(2);
      expect(result.sellCount).toBe(1);
      expect(result.totalVolume).toBe(2.0);
      expect(result.totalProfit).toBe(325);
    });

    it('空持仓时应返回零值', async () => {
      mockMiddlewareProxyService.getPositions.mockResolvedValue([]);

      const result = await service.getStats(mockInstanceId);

      expect(result.totalPositions).toBe(0);
      expect(result.totalVolume).toBe(0);
      expect(result.totalProfit).toBe(0);
    });
  });

  describe('getStatsBySymbol', () => {
    it('应该按品种统计持仓', async () => {
      mockMiddlewareProxyService.getPositions.mockResolvedValue(mockPositions);

      const result = await service.getStatsBySymbol(mockInstanceId);

      expect(result).toHaveLength(2);

      const eurusdStats = result.find((s) => s.symbol === 'EURUSD');
      expect(eurusdStats).toBeDefined();
      expect(eurusdStats?.count).toBe(2);
      expect(eurusdStats?.buyCount).toBe(2);
      expect(eurusdStats?.sellCount).toBe(0);

      const gbpusdStats = result.find((s) => s.symbol === 'GBPUSD');
      expect(gbpusdStats).toBeDefined();
      expect(gbpusdStats?.count).toBe(1);
    });
  });
});
