import { Test, TestingModule } from '@nestjs/testing';
import { TradingService, TenantContext } from './trading.service';
import { MtServerService } from './mt-server.service';
import { AdapterFactory } from '../adapters/adapter.factory';
import { TradingPlatformAdapter } from '../adapters/trading-platform.adapter';
import {
  PlatformType,
  MtServerConfig,
  TradingUser,
  TradingPosition,
  ServerStatus,
  PositionType,
} from '../adapters/types';

describe('TradingService', () => {
  let service: TradingService;
  let mockMtServerService: jest.Mocked<MtServerService>;
  let mockAdapterFactory: jest.Mocked<AdapterFactory>;
  let mockAdapter: jest.Mocked<TradingPlatformAdapter>;

  const mockServerConfig: MtServerConfig = {
    tenantId: 'tenant-1',
    serverId: 'server-1',
    platformType: PlatformType.MT5,
    middlewareUrl: 'http://localhost:8080',
    serverAddress: 'demo.mt5server.com:443',
    managerLogin: 12345,
    managerPassword: 'password123',
  };

  const mockTenantContext: TenantContext = {
    tenantId: 'tenant-1',
    serverId: 'server-1',
  };

  beforeEach(async () => {
    mockAdapter = {
      platformType: PlatformType.MT5,
      isAuthenticated: jest.fn().mockReturnValue(true),
      authenticate: jest.fn().mockResolvedValue('token'),
      refreshToken: jest.fn().mockResolvedValue('new-token'),
      getUsers: jest.fn(),
      getUser: jest.fn(),
      updateUserGroup: jest.fn(),
      getPositions: jest.fn(),
      getUserPositions: jest.fn(),
      getOrders: jest.fn(),
      getUserOrders: jest.fn(),
      getDeals: jest.fn(),
      getUserDeals: jest.fn(),
      getSymbols: jest.fn(),
      getSymbol: jest.fn(),
      getQuote: jest.fn(),
      getQuotes: jest.fn(),
      getServerStatus: jest.fn(),
      testConnection: jest.fn(),
    } as unknown as jest.Mocked<TradingPlatformAdapter>;

    mockMtServerService = {
      getServerConfig: jest.fn().mockResolvedValue(mockServerConfig),
      getDefaultServerConfig: jest.fn().mockResolvedValue(mockServerConfig),
      getServers: jest.fn(),
      getActiveServers: jest.fn(),
      getServer: jest.fn(),
      getDefaultServer: jest.fn(),
    } as unknown as jest.Mocked<MtServerService>;

    mockAdapterFactory = {
      getAdapter: jest.fn().mockResolvedValue(mockAdapter),
      removeAdapter: jest.fn(),
      removeAdaptersByTenant: jest.fn(),
      getStats: jest.fn(),
    } as unknown as jest.Mocked<AdapterFactory>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradingService,
        { provide: MtServerService, useValue: mockMtServerService },
        { provide: AdapterFactory, useValue: mockAdapterFactory },
      ],
    }).compile();

    service = module.get<TradingService>(TradingService);
  });

  describe('getAdapter', () => {
    it('应该使用指定的 serverId 获取适配器', async () => {
      const ctx: TenantContext = { tenantId: 'tenant-1', serverId: 'server-1' };

      await service.getAdapter(ctx);

      expect(mockMtServerService.getServerConfig).toHaveBeenCalledWith(
        'tenant-1',
        'server-1',
      );
      expect(mockAdapterFactory.getAdapter).toHaveBeenCalledWith(mockServerConfig);
    });

    it('未指定 serverId 时应使用默认服务器', async () => {
      const ctx: TenantContext = { tenantId: 'tenant-1' };

      await service.getAdapter(ctx);

      expect(mockMtServerService.getDefaultServerConfig).toHaveBeenCalledWith(
        'tenant-1',
      );
    });
  });

  describe('authenticate', () => {
    it('应该使用服务器配置进行认证', async () => {
      const result = await service.authenticate(mockTenantContext);

      expect(result).toBe('token');
      expect(mockAdapter.authenticate).toHaveBeenCalledWith(
        mockServerConfig.managerLogin,
        mockServerConfig.managerPassword,
      );
    });
  });

  describe('getUsers', () => {
    it('应该返回用户列表', async () => {
      const mockUsers: TradingUser[] = [
        {
          login: 1001,
          name: 'Test User',
          group: 'demo',
          balance: 10000,
          equity: 10000,
          margin: 0,
          marginFree: 10000,
          marginLevel: 0,
          leverage: 100,
        },
      ];

      mockAdapter.getUsers.mockResolvedValue({
        items: mockUsers,
        total: 1,
        page: 1,
        pageSize: 20,
        hasMore: false,
      });

      const result = await service.getUsers(mockTenantContext);

      expect(result.items).toEqual(mockUsers);
      expect(result.total).toBe(1);
    });

    it('未认证时应自动认证', async () => {
      mockAdapter.isAuthenticated.mockReturnValue(false);
      mockAdapter.getUsers.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      });

      await service.getUsers(mockTenantContext);

      expect(mockAdapter.authenticate).toHaveBeenCalled();
    });
  });

  describe('getUser', () => {
    it('应该返回单个用户', async () => {
      const mockUser: TradingUser = {
        login: 1001,
        name: 'Test User',
        group: 'demo',
        balance: 10000,
        equity: 10000,
        margin: 0,
        marginFree: 10000,
        marginLevel: 0,
        leverage: 100,
      };

      mockAdapter.getUser.mockResolvedValue(mockUser);

      const result = await service.getUser(mockTenantContext, 1001);

      expect(result).toEqual(mockUser);
      expect(mockAdapter.getUser).toHaveBeenCalledWith(1001);
    });
  });

  describe('updateUserGroup', () => {
    it('应该更新用户组', async () => {
      mockAdapter.updateUserGroup.mockResolvedValue(true);

      const result = await service.updateUserGroup(
        mockTenantContext,
        1001,
        'real',
      );

      expect(result).toBe(true);
      expect(mockAdapter.updateUserGroup).toHaveBeenCalledWith(1001, 'real');
    });
  });

  describe('getPositions', () => {
    it('应该返回持仓列表', async () => {
      const mockPositions: TradingPosition[] = [
        {
          ticket: 123456,
          login: 1001,
          symbol: 'EURUSD',
          type: PositionType.BUY,
          volume: 1.0,
          openPrice: 1.1,
          currentPrice: 1.105,
          openTime: new Date(),
          profit: 50,
          swap: -1.5,
        },
      ];

      mockAdapter.getPositions.mockResolvedValue(mockPositions);

      const result = await service.getPositions(mockTenantContext);

      expect(result).toEqual(mockPositions);
    });
  });

  describe('getUserPositions', () => {
    it('应该返回用户持仓', async () => {
      const mockPositions: TradingPosition[] = [
        {
          ticket: 123456,
          login: 1001,
          symbol: 'EURUSD',
          type: PositionType.BUY,
          volume: 1.0,
          openPrice: 1.1,
          currentPrice: 1.105,
          openTime: new Date(),
          profit: 50,
          swap: -1.5,
        },
      ];

      mockAdapter.getUserPositions.mockResolvedValue(mockPositions);

      const result = await service.getUserPositions(mockTenantContext, 1001);

      expect(result).toEqual(mockPositions);
      expect(mockAdapter.getUserPositions).toHaveBeenCalledWith(1001);
    });
  });

  describe('getServerStatus', () => {
    it('应该返回服务器状态', async () => {
      const mockStatus: ServerStatus = {
        online: true,
        serverTime: new Date(),
        version: '5.0.0',
        connectedUsers: 100,
        activePositions: 500,
      };

      mockAdapter.getServerStatus.mockResolvedValue(mockStatus);

      const result = await service.getServerStatus(mockTenantContext);

      expect(result).toEqual(mockStatus);
    });
  });

  describe('testConnection', () => {
    it('应该测试连接状态', async () => {
      mockAdapter.testConnection.mockResolvedValue(true);

      const result = await service.testConnection(mockTenantContext);

      expect(result).toBe(true);
    });
  });

  describe('getAccountSummary', () => {
    it('应该返回账户摘要', async () => {
      const mockUser: TradingUser = {
        login: 1001,
        name: 'Test User',
        group: 'demo',
        balance: 10000,
        equity: 10500,
        margin: 500,
        marginFree: 10000,
        marginLevel: 2100,
        leverage: 100,
      };

      const mockPositions: TradingPosition[] = [
        {
          ticket: 1,
          login: 1001,
          symbol: 'EURUSD',
          type: PositionType.BUY,
          volume: 1.0,
          openPrice: 1.1,
          currentPrice: 1.105,
          openTime: new Date(),
          profit: 50,
          swap: 0,
        },
        {
          ticket: 2,
          login: 1001,
          symbol: 'GBPUSD',
          type: PositionType.SELL,
          volume: 0.5,
          openPrice: 1.25,
          currentPrice: 1.24,
          openTime: new Date(),
          profit: 50,
          swap: 0,
        },
      ];

      mockAdapter.getUser.mockResolvedValue(mockUser);
      mockAdapter.getUserPositions.mockResolvedValue(mockPositions);

      const result = await service.getAccountSummary(mockTenantContext, 1001);

      expect(result.user).toEqual(mockUser);
      expect(result.positionsCount).toBe(2);
      expect(result.totalProfit).toBe(100);
      expect(result.totalVolume).toBe(1.5);
    });
  });

  describe('getPositionsSummary', () => {
    it('应该返回持仓统计（按品种分组）', async () => {
      const mockPositions: TradingPosition[] = [
        {
          ticket: 1,
          login: 1001,
          symbol: 'EURUSD',
          type: PositionType.BUY,
          volume: 1.0,
          openPrice: 1.1,
          currentPrice: 1.105,
          openTime: new Date(),
          profit: 50,
          swap: 0,
        },
        {
          ticket: 2,
          login: 1001,
          symbol: 'EURUSD',
          type: PositionType.BUY,
          volume: 0.5,
          openPrice: 1.1,
          currentPrice: 1.105,
          openTime: new Date(),
          profit: 25,
          swap: 0,
        },
        {
          ticket: 3,
          login: 1001,
          symbol: 'GBPUSD',
          type: PositionType.SELL,
          volume: 1.0,
          openPrice: 1.25,
          currentPrice: 1.24,
          openTime: new Date(),
          profit: 100,
          swap: 0,
        },
      ];

      mockAdapter.getPositions.mockResolvedValue(mockPositions);

      const result = await service.getPositionsSummary(mockTenantContext);

      expect(result.totalPositions).toBe(3);
      expect(result.totalVolume).toBe(2.5);
      expect(result.totalProfit).toBe(175);
      expect(result.bySymbol).toHaveLength(2);

      const eurusdStats = result.bySymbol.find((s) => s.symbol === 'EURUSD');
      expect(eurusdStats?.count).toBe(2);
      expect(eurusdStats?.profit).toBe(75);
      expect(eurusdStats?.volume).toBe(1.5);
    });

    it('指定用户时应返回该用户的持仓统计', async () => {
      const mockPositions: TradingPosition[] = [
        {
          ticket: 1,
          login: 1001,
          symbol: 'EURUSD',
          type: PositionType.BUY,
          volume: 1.0,
          openPrice: 1.1,
          currentPrice: 1.105,
          openTime: new Date(),
          profit: 50,
          swap: 0,
        },
      ];

      mockAdapter.getUserPositions.mockResolvedValue(mockPositions);

      const result = await service.getPositionsSummary(mockTenantContext, 1001);

      expect(mockAdapter.getUserPositions).toHaveBeenCalledWith(1001);
      expect(result.totalPositions).toBe(1);
    });
  });

  describe('getBatchUserPositions', () => {
    it('应该批量获取用户持仓', async () => {
      const mockPositions1: TradingPosition[] = [
        {
          ticket: 1,
          login: 1001,
          symbol: 'EURUSD',
          type: PositionType.BUY,
          volume: 1.0,
          openPrice: 1.1,
          currentPrice: 1.105,
          openTime: new Date(),
          profit: 50,
          swap: 0,
        },
      ];

      const mockPositions2: TradingPosition[] = [
        {
          ticket: 2,
          login: 1002,
          symbol: 'GBPUSD',
          type: PositionType.SELL,
          volume: 0.5,
          openPrice: 1.25,
          currentPrice: 1.24,
          openTime: new Date(),
          profit: 50,
          swap: 0,
        },
      ];

      mockAdapter.getUserPositions
        .mockResolvedValueOnce(mockPositions1)
        .mockResolvedValueOnce(mockPositions2);

      const result = await service.getBatchUserPositions(mockTenantContext, [
        1001, 1002,
      ]);

      expect(result.size).toBe(2);
      expect(result.get(1001)).toEqual(mockPositions1);
      expect(result.get(1002)).toEqual(mockPositions2);
    });

    it('获取失败时应返回空数组', async () => {
      mockAdapter.getUserPositions
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('Failed'));

      const result = await service.getBatchUserPositions(mockTenantContext, [
        1001, 1002,
      ]);

      expect(result.size).toBe(2);
      expect(result.get(1001)).toEqual([]);
      expect(result.get(1002)).toEqual([]);
    });
  });

  describe('多租户路由', () => {
    it('应该为不同租户使用不同的适配器配置', async () => {
      const tenant1Context: TenantContext = {
        tenantId: 'tenant-1',
        serverId: 'server-1',
      };

      const tenant2Context: TenantContext = {
        tenantId: 'tenant-2',
        serverId: 'server-2',
      };

      await service.getAdapter(tenant1Context);
      await service.getAdapter(tenant2Context);

      expect(mockMtServerService.getServerConfig).toHaveBeenCalledWith(
        'tenant-1',
        'server-1',
      );
      expect(mockMtServerService.getServerConfig).toHaveBeenCalledWith(
        'tenant-2',
        'server-2',
      );
    });
  });
});
