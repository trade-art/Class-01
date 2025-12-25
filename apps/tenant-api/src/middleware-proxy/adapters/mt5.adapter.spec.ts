import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders } from 'axios';
import { MT5Adapter } from './mt5.adapter';
import {
  PlatformType,
  AdapterConfig,
  PositionType,
  OrderType,
  OrderState,
  DealType,
  DealEntry,
} from './types';

describe('MT5Adapter', () => {
  let adapter: MT5Adapter;
  let mockHttpService: jest.Mocked<HttpService>;

  // 基础配置（不含 ServiceToken）- 用于测试弃用认证模式的错误
  const mockConfig: AdapterConfig = {
    baseUrl: 'http://localhost:8080',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
  };

  // ServiceToken 配置 - 用于正常功能测试
  const mockServiceTokenConfig: AdapterConfig = {
    baseUrl: 'http://localhost:8080',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    serviceToken: {
      token: 'test-service-token-jwt',
      tokenType: 'Bearer',
      expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1小时后过期
    },
    authHeaders: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-service-token-jwt',
      'X-Tenant-Id': 'test-tenant',
      'X-Server-Id': 'test-server',
      'X-Server-Address': 'localhost:443',
    },
  };

  // 辅助函数：创建 Axios 响应
  const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {
      headers: new AxiosHeaders(),
    },
  });

  beforeEach(() => {
    mockHttpService = {
      request: jest.fn(),
    } as unknown as jest.Mocked<HttpService>;

    // 默认使用 ServiceToken 配置
    adapter = new MT5Adapter(mockHttpService, mockServiceTokenConfig);
  });

  describe('基础属性', () => {
    it('应该正确设置平台类型为 MT5', () => {
      expect(adapter.platformType).toBe(PlatformType.MT5);
    });
  });

  describe('authenticate', () => {
    it('使用 ServiceToken 模式时应直接返回已配置的令牌', async () => {
      // adapter 已在 beforeEach 中使用 mockServiceTokenConfig 创建
      const token = await adapter.authenticate(12345, 'password123');

      // 应该返回 ServiceToken 而不是调用 HTTP 端点
      expect(token).toBe('test-service-token-jwt');
      // 不应该调用任何 HTTP 请求
      expect(mockHttpService.request).not.toHaveBeenCalled();
    });

    it('使用 authHeaders 模式时应返回固定令牌标识', async () => {
      // 创建只有 authHeaders 没有完整 serviceToken 的配置
      const authHeadersOnlyConfig: AdapterConfig = {
        baseUrl: 'http://localhost:8080',
        timeout: 30000,
        authHeaders: {
          Authorization: 'Bearer some-external-token',
          'X-Tenant-Id': 'test-tenant',
        },
      };
      const authHeadersAdapter = new MT5Adapter(
        mockHttpService,
        authHeadersOnlyConfig,
      );

      const token = await authHeadersAdapter.authenticate(12345, 'password');

      expect(token).toBe('service-token-auth');
      expect(mockHttpService.request).not.toHaveBeenCalled();
    });

    it('没有 ServiceToken 配置时应抛出弃用错误', async () => {
      // 使用不含 ServiceToken 的基础配置创建适配器
      const legacyAdapter = new MT5Adapter(mockHttpService, mockConfig);

      await expect(legacyAdapter.authenticate(12345, 'password')).rejects.toThrow(
        '传统登录认证模式已弃用',
      );
      // 不应该调用任何 HTTP 请求
      expect(mockHttpService.request).not.toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('使用 ServiceToken 模式时应返回当前令牌（不实际刷新）', async () => {
      // adapter 已使用 ServiceToken 配置，refreshToken 应该返回当前令牌
      const newToken = await adapter.refreshToken();

      // ServiceToken 模式下刷新令牌返回当前令牌
      expect(newToken).toBe('test-service-token-jwt');
      // 不应该调用任何 HTTP 请求
      expect(mockHttpService.request).not.toHaveBeenCalled();
    });
  });

  describe('getUsers', () => {
    // 适配器已通过 ServiceToken 配置自动认证，无需 beforeEach 中调用 authenticate

    it('应该返回用户列表并正确转换字段', async () => {
      const mockResponse = {
        code: 0,
        data: {
          users: [
            {
              login: 1001,
              name: 'Test User',
              group: 'demo',
              email: 'test@example.com',
              balance: 10000,
              equity: 10500,
              margin: 500,
              margin_free: 10000,
              margin_level: 2100,
              leverage: 100,
              credit: 0,
              registration: '2024-01-01T00:00:00Z',
              last_access: '2024-12-01T12:00:00Z',
              comment: 'Test account',
              status: 'active',
            },
          ],
          total: 1,
        },
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const result = await adapter.getUsers({ page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.hasMore).toBe(false);

      const user = result.items[0];
      expect(user.login).toBe(1001);
      expect(user.name).toBe('Test User');
      expect(user.marginFree).toBe(10000); // 字段转换: margin_free -> marginFree
      expect(user.marginLevel).toBe(2100); // 字段转换: margin_level -> marginLevel
      expect(user.registration).toBeInstanceOf(Date);
      expect(user.lastAccess).toBeInstanceOf(Date);
    });

    it('应该正确传递查询参数', async () => {
      const mockResponse = {
        code: 0,
        data: { users: [], total: 0 },
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      await adapter.getUsers({
        page: 2,
        pageSize: 50,
        search: 'test',
        group: 'demo',
      });

      expect(mockHttpService.request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          params: {
            page: 2,
            limit: 50,
            search: 'test',
            group: 'demo',
          },
        }),
      );
    });
  });

  describe('getUser', () => {
    // 适配器已通过 ServiceToken 配置自动认证

    it('应该返回单个用户', async () => {
      const mockResponse = {
        code: 0,
        data: {
          login: 1001,
          name: 'Test User',
          group: 'demo',
          balance: 10000,
          equity: 10000,
          margin: 0,
          margin_free: 10000,
          margin_level: 0,
          leverage: 100,
        },
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const user = await adapter.getUser(1001);

      expect(user).not.toBeNull();
      expect(user?.login).toBe(1001);
    });

    it('用户不存在时应返回 null', async () => {
      const mockResponse = {
        code: -1,
        data: null,
        message: 'User not found',
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const user = await adapter.getUser(9999);

      expect(user).toBeNull();
    });
  });

  describe('getPositions', () => {
    // 适配器已通过 ServiceToken 配置自动认证

    it('应该返回持仓列表并正确转换字段', async () => {
      const mockResponse = {
        code: 0,
        data: [
          {
            ticket: 123456,
            login: 1001,
            symbol: 'EURUSD',
            type: 0, // BUY
            volume: 1.0,
            open_price: 1.1,
            current_price: 1.105,
            open_time: '2024-12-01T10:00:00Z',
            profit: 50,
            swap: -1.5,
            commission: -2,
            sl: 1.09,
            tp: 1.12,
            comment: 'Test position',
            magic: 12345,
          },
        ],
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const positions = await adapter.getPositions();

      expect(positions).toHaveLength(1);
      const pos = positions[0];
      expect(pos.ticket).toBe(123456);
      expect(pos.type).toBe(PositionType.BUY);
      expect(pos.openPrice).toBe(1.1); // 字段转换: open_price -> openPrice
      expect(pos.currentPrice).toBe(1.105); // 字段转换: current_price -> currentPrice
      expect(pos.openTime).toBeInstanceOf(Date);
    });

    it('应该支持按品种筛选', async () => {
      const mockResponse = {
        code: 0,
        data: [
          {
            ticket: 1,
            login: 1001,
            symbol: 'EURUSD',
            type: 0,
            volume: 1,
            open_price: 1.1,
            current_price: 1.1,
            open_time: '2024-01-01T00:00:00Z',
            profit: 0,
            swap: 0,
          },
          {
            ticket: 2,
            login: 1001,
            symbol: 'GBPUSD',
            type: 0,
            volume: 1,
            open_price: 1.2,
            current_price: 1.2,
            open_time: '2024-01-01T00:00:00Z',
            profit: 0,
            swap: 0,
          },
        ],
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const positions = await adapter.getPositions({ symbol: 'EURUSD' });

      expect(positions).toHaveLength(1);
      expect(positions[0].symbol).toBe('EURUSD');
    });
  });

  describe('getOrders', () => {
    // 适配器已通过 ServiceToken 配置自动认证

    it('应该返回订单列表并正确转换字段', async () => {
      const mockResponse = {
        code: 0,
        data: [
          {
            ticket: 789,
            login: 1001,
            symbol: 'EURUSD',
            type: 2, // BUY_LIMIT
            volume: 0.5,
            price: 1.08,
            price_open: 1.1,
            price_current: 1.095,
            sl: 1.07,
            tp: 1.12,
            time_setup: '2024-12-01T09:00:00Z',
            time_done: null,
            state: 2, // PLACED
            comment: 'Pending order',
            magic: 0,
          },
        ],
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const orders = await adapter.getOrders();

      expect(orders).toHaveLength(1);
      const order = orders[0];
      expect(order.type).toBe(OrderType.BUY_LIMIT);
      expect(order.state).toBe(OrderState.PLACED);
      expect(order.priceOpen).toBe(1.1); // 字段转换
      expect(order.priceCurrent).toBe(1.095);
      expect(order.timeSetup).toBeInstanceOf(Date);
    });
  });

  describe('getDeals', () => {
    // 适配器已通过 ServiceToken 配置自动认证

    it('应该返回成交记录并正确转换字段', async () => {
      const mockResponse = {
        code: 0,
        data: {
          deals: [
            {
              ticket: 456,
              login: 1001,
              symbol: 'EURUSD',
              type: 0, // BUY
              entry: 0, // IN
              volume: 1.0,
              price: 1.1,
              profit: 0,
              swap: 0,
              commission: -2,
              time: '2024-12-01T10:00:00Z',
              order: 123,
              position_id: 456,
              comment: 'Entry deal',
              magic: 0,
            },
          ],
          total: 1,
        },
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const result = await adapter.getDeals();

      expect(result.items).toHaveLength(1);
      const deal = result.items[0];
      expect(deal.type).toBe(DealType.BUY);
      expect(deal.entry).toBe(DealEntry.IN);
      expect(deal.positionId).toBe(456); // 字段转换: position_id -> positionId
      expect(deal.time).toBeInstanceOf(Date);
    });
  });

  describe('getSymbols', () => {
    // 适配器已通过 ServiceToken 配置自动认证

    it('应该返回品种列表并正确转换字段', async () => {
      const mockResponse = {
        code: 0,
        data: [
          {
            symbol: 'EURUSD',
            description: 'Euro vs US Dollar',
            path: 'Forex\\EURUSD',
            digits: 5,
            contract_size: 100000,
            tick_size: 0.00001,
            tick_value: 1,
            spread: 10,
            bid: 1.1,
            ask: 1.1001,
            high: 1.105,
            low: 1.095,
            volume_min: 0.01,
            volume_max: 100,
            volume_step: 0.01,
            currency: 'EUR',
            profit_currency: 'USD',
            margin_currency: 'EUR',
            trade_mode: 4, // FULL
            enabled: true,
          },
        ],
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const symbols = await adapter.getSymbols();

      expect(symbols).toHaveLength(1);
      const symbol = symbols[0];
      expect(symbol.symbol).toBe('EURUSD');
      expect(symbol.contractSize).toBe(100000); // 字段转换: contract_size -> contractSize
      expect(symbol.tickSize).toBe(0.00001); // 字段转换: tick_size -> tickSize
      expect(symbol.volumeMin).toBe(0.01); // 字段转换: volume_min -> volumeMin
      expect(symbol.profitCurrency).toBe('USD'); // 字段转换: profit_currency -> profitCurrency
    });

    it('应该支持搜索筛选', async () => {
      const mockResponse = {
        code: 0,
        data: [
          {
            symbol: 'EURUSD',
            description: 'Euro vs US Dollar',
            digits: 5,
            contract_size: 100000,
            tick_size: 0.00001,
            spread: 10,
            bid: 1.1,
            ask: 1.1001,
            volume_min: 0.01,
            volume_max: 100,
            volume_step: 0.01,
          },
          {
            symbol: 'GBPUSD',
            description: 'British Pound vs US Dollar',
            digits: 5,
            contract_size: 100000,
            tick_size: 0.00001,
            spread: 15,
            bid: 1.25,
            ask: 1.2515,
            volume_min: 0.01,
            volume_max: 100,
            volume_step: 0.01,
          },
        ],
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const symbols = await adapter.getSymbols({ search: 'euro' });

      expect(symbols).toHaveLength(1);
      expect(symbols[0].symbol).toBe('EURUSD');
    });
  });

  describe('getQuote / getQuotes', () => {
    // 适配器已通过 ServiceToken 配置自动认证

    it('应该返回单个品种报价', async () => {
      const mockResponse = {
        code: 0,
        data: {
          symbol: 'EURUSD',
          bid: 1.1,
          ask: 1.1001,
          spread: 1,
          time: '2024-12-01T12:00:00Z',
          high: 1.105,
          low: 1.095,
          volume: 1000,
        },
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const quote = await adapter.getQuote('EURUSD');

      expect(quote).not.toBeNull();
      expect(quote?.symbol).toBe('EURUSD');
      expect(quote?.time).toBeInstanceOf(Date);
    });

    it('应该返回多个品种报价', async () => {
      const mockResponse = {
        code: 0,
        data: [
          {
            symbol: 'EURUSD',
            bid: 1.1,
            ask: 1.1001,
            spread: 1,
            time: '2024-12-01T12:00:00Z',
          },
          {
            symbol: 'GBPUSD',
            bid: 1.25,
            ask: 1.2515,
            spread: 15,
            time: '2024-12-01T12:00:00Z',
          },
        ],
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const quotes = await adapter.getQuotes(['EURUSD', 'GBPUSD']);

      expect(quotes).toHaveLength(2);
    });
  });

  describe('getServerStatus / testConnection', () => {
    it('应该返回服务器状态', async () => {
      const mockResponse = {
        code: 0,
        data: {
          status: 'healthy',
          server_time: '2024-12-01T12:00:00Z',
          version: '5.0.0',
          connected_users: 100,
          active_positions: 500,
        },
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const status = await adapter.getServerStatus();

      expect(status.online).toBe(true);
      expect(status.serverTime).toBeInstanceOf(Date);
      expect(status.version).toBe('5.0.0');
      expect(status.connectedUsers).toBe(100);
      expect(status.activePositions).toBe(500);
    });

    it('testConnection 应该返回 true 当 ServiceToken 模式下调用 authenticate 后', async () => {
      // ServiceToken 模式下，authenticate 会设置 serverConnected = true
      await adapter.authenticate(12345, 'password123');
      const result = await adapter.testConnection();
      expect(result).toBe(true);
    });

    it('testConnection 应该返回 false 当未调用 authenticate 时', async () => {
      // 创建新的适配器，但不调用 authenticate
      const newAdapter = new MT5Adapter(mockHttpService, mockServiceTokenConfig);
      const result = await newAdapter.testConnection();
      // serverConnected 默认为 false
      expect(result).toBe(false);
    });
  });

  describe('updateUserGroup', () => {
    // 适配器已通过 ServiceToken 配置自动认证

    it('应该成功更新用户组', async () => {
      const mockResponse = {
        code: 0,
        data: {},
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const result = await adapter.updateUserGroup(1001, 'real');

      expect(result).toBe(true);
      expect(mockHttpService.request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          method: 'put',
          url: 'http://localhost:8080/api/v1/account/users/1001/group',
          data: { group: 'real' },
        }),
      );
    });

    it('更新失败时应返回 false', async () => {
      const mockResponse = {
        code: -1,
        data: null,
        message: 'Update failed',
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const result = await adapter.updateUserGroup(1001, 'invalid');

      expect(result).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    it('使用 ServiceToken 配置时应返回 true（自动认证）', () => {
      // adapter 在 beforeEach 中使用 mockServiceTokenConfig 创建，已自动认证
      expect(adapter.isAuthenticated()).toBe(true);
    });

    it('没有 ServiceToken 配置时应返回 false', () => {
      // 使用不含 ServiceToken 的基础配置创建适配器
      const unauthenticatedAdapter = new MT5Adapter(mockHttpService, mockConfig);
      expect(unauthenticatedAdapter.isAuthenticated()).toBe(false);
    });

    it('ServiceToken 过期时应返回 false', () => {
      // 创建一个已过期的 ServiceToken 配置
      const expiredConfig: AdapterConfig = {
        baseUrl: 'http://localhost:8080',
        serviceToken: {
          token: 'expired-token',
          tokenType: 'Bearer',
          expiresAt: Math.floor(Date.now() / 1000) - 3600, // 1小时前已过期
        },
      };
      const expiredAdapter = new MT5Adapter(mockHttpService, expiredConfig);
      expect(expiredAdapter.isAuthenticated()).toBe(false);
    });
  });
});
