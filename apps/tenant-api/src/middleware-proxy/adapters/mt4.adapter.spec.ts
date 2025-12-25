import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders } from 'axios';
import { MT4Adapter } from './mt4.adapter';
import {
  PlatformType,
  AdapterConfig,
  PositionType,
  OrderType,
  OrderState,
  DealType,
  DealEntry,
} from './types';

describe('MT4Adapter', () => {
  let adapter: MT4Adapter;
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
    adapter = new MT4Adapter(mockHttpService, mockServiceTokenConfig);
  });

  describe('基础属性', () => {
    it('应该正确设置平台类型为 MT4', () => {
      expect(adapter.platformType).toBe(PlatformType.MT4);
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
      const authHeadersAdapter = new MT4Adapter(
        mockHttpService,
        authHeadersOnlyConfig,
      );

      const token = await authHeadersAdapter.authenticate(12345, 'password');

      expect(token).toBe('service-token-auth');
      expect(mockHttpService.request).not.toHaveBeenCalled();
    });

    it('没有 ServiceToken 配置时应抛出弃用错误', async () => {
      // 使用不含 ServiceToken 的基础配置创建适配器
      const legacyAdapter = new MT4Adapter(mockHttpService, mockConfig);

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
    // 适配器已通过 ServiceToken 配置自动认证

    it('应该返回用户列表并正确转换 MT4 特有字段', async () => {
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
              regdate: '2024-01-01T00:00:00Z', // MT4 特有字段
              lastdate: '2024-12-01T12:00:00Z', // MT4 特有字段
              comment: 'Test account',
              enable: 1, // MT4 使用数字表示状态
              readonly: 0,
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

      const user = result.items[0];
      expect(user.login).toBe(1001);
      expect(user.name).toBe('Test User');
      expect(user.marginFree).toBe(10000);
      expect(user.registration).toBeInstanceOf(Date); // MT4: regdate -> registration
      expect(user.lastAccess).toBeInstanceOf(Date); // MT4: lastdate -> lastAccess
      expect(user.status).toBe('active'); // MT4: enable=1 -> 'active'
    });

    it('禁用用户应该正确转换状态', async () => {
      const mockResponse = {
        code: 0,
        data: {
          users: [
            {
              login: 1001,
              name: 'Disabled User',
              group: 'demo',
              balance: 0,
              equity: 0,
              margin: 0,
              margin_free: 0,
              margin_level: 0,
              leverage: 100,
              enable: 0, // 禁用状态
            },
          ],
          total: 1,
        },
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const result = await adapter.getUsers();
      expect(result.items[0].status).toBe('disabled');
    });

    it('只读用户应该正确转换状态', async () => {
      const mockResponse = {
        code: 0,
        data: {
          users: [
            {
              login: 1001,
              name: 'Readonly User',
              group: 'demo',
              balance: 0,
              equity: 0,
              margin: 0,
              margin_free: 0,
              margin_level: 0,
              leverage: 100,
              enable: 1,
              readonly: 1, // 只读状态
            },
          ],
          total: 1,
        },
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const result = await adapter.getUsers();
      expect(result.items[0].status).toBe('readonly');
    });
  });

  describe('getPositions (MT4 trades)', () => {
    // 适配器已通过 ServiceToken 配置自动认证

    it('应该只返回市场订单 (cmd 0-1) 作为持仓', async () => {
      const mockResponse = {
        code: 0,
        data: [
          {
            ticket: 123456,
            login: 1001,
            symbol: 'EURUSD',
            cmd: 0, // BUY - 市场订单
            volume: 1.0,
            open_price: 1.1,
            close_price: 1.105,
            open_time: '2024-12-01T10:00:00Z',
            profit: 50,
            swap: -1.5,
            commission: -2,
          },
          {
            ticket: 123457,
            login: 1001,
            symbol: 'EURUSD',
            cmd: 1, // SELL - 市场订单
            volume: 0.5,
            open_price: 1.12,
            close_price: 1.105,
            open_time: '2024-12-01T11:00:00Z',
            profit: 75,
            swap: -1,
            commission: -1,
          },
          {
            ticket: 123458,
            login: 1001,
            symbol: 'EURUSD',
            cmd: 2, // BUY_LIMIT - 挂单，不应该出现在持仓中
            volume: 1.0,
            open_price: 1.08,
            open_time: '2024-12-01T09:00:00Z',
            profit: 0,
            swap: 0,
            commission: 0,
          },
        ],
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const positions = await adapter.getPositions();

      // 应该只有 2 个持仓（cmd 0 和 cmd 1），排除挂单（cmd 2）
      expect(positions).toHaveLength(2);
      expect(positions[0].type).toBe(PositionType.BUY);
      expect(positions[1].type).toBe(PositionType.SELL);
    });

    it('应该正确转换 MT4 订单字段到持仓', async () => {
      const mockResponse = {
        code: 0,
        data: [
          {
            ticket: 123456,
            login: 1001,
            symbol: 'EURUSD',
            cmd: 0, // BUY
            volume: 1.0,
            open_price: 1.1,
            close_price: 1.105, // MT4 当前价格
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
      expect(pos.openPrice).toBe(1.1);
      expect(pos.currentPrice).toBe(1.105);
      expect(pos.openTime).toBeInstanceOf(Date);
    });
  });

  describe('getOrders (MT4 挂单)', () => {
    // 适配器已通过 ServiceToken 配置自动认证

    it('应该只返回挂单 (cmd 2-5)', async () => {
      const mockResponse = {
        code: 0,
        data: [
          {
            ticket: 1,
            login: 1001,
            symbol: 'EURUSD',
            cmd: 0, // BUY - 市场订单，不应该出现
            volume: 1.0,
            open_price: 1.1,
            open_time: '2024-12-01T10:00:00Z',
            profit: 50,
            swap: 0,
            commission: 0,
          },
          {
            ticket: 2,
            login: 1001,
            symbol: 'EURUSD',
            cmd: 2, // BUY_LIMIT
            volume: 1.0,
            open_price: 1.08,
            open_time: '2024-12-01T09:00:00Z',
            profit: 0,
            swap: 0,
            commission: 0,
          },
          {
            ticket: 3,
            login: 1001,
            symbol: 'EURUSD',
            cmd: 3, // SELL_LIMIT
            volume: 0.5,
            open_price: 1.12,
            open_time: '2024-12-01T09:00:00Z',
            profit: 0,
            swap: 0,
            commission: 0,
          },
          {
            ticket: 4,
            login: 1001,
            symbol: 'GBPUSD',
            cmd: 4, // BUY_STOP
            volume: 1.0,
            open_price: 1.26,
            open_time: '2024-12-01T09:00:00Z',
            profit: 0,
            swap: 0,
            commission: 0,
          },
          {
            ticket: 5,
            login: 1001,
            symbol: 'GBPUSD',
            cmd: 5, // SELL_STOP
            volume: 0.5,
            open_price: 1.24,
            open_time: '2024-12-01T09:00:00Z',
            profit: 0,
            swap: 0,
            commission: 0,
          },
        ],
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const orders = await adapter.getOrders();

      // 应该有 4 个挂单（cmd 2-5），排除市场订单（cmd 0）
      expect(orders).toHaveLength(4);
      expect(orders[0].type).toBe(OrderType.BUY_LIMIT);
      expect(orders[1].type).toBe(OrderType.SELL_LIMIT);
      expect(orders[2].type).toBe(OrderType.BUY_STOP);
      expect(orders[3].type).toBe(OrderType.SELL_STOP);
    });

    it('应该正确映射 MT4 cmd 到 OrderType', async () => {
      const mockResponse = {
        code: 0,
        data: [
          { ticket: 1, login: 1001, symbol: 'EURUSD', cmd: 2, volume: 1, open_price: 1.08, open_time: '2024-01-01T00:00:00Z', profit: 0, swap: 0, commission: 0 },
          { ticket: 2, login: 1001, symbol: 'EURUSD', cmd: 3, volume: 1, open_price: 1.12, open_time: '2024-01-01T00:00:00Z', profit: 0, swap: 0, commission: 0 },
          { ticket: 3, login: 1001, symbol: 'EURUSD', cmd: 4, volume: 1, open_price: 1.15, open_time: '2024-01-01T00:00:00Z', profit: 0, swap: 0, commission: 0 },
          { ticket: 4, login: 1001, symbol: 'EURUSD', cmd: 5, volume: 1, open_price: 1.05, open_time: '2024-01-01T00:00:00Z', profit: 0, swap: 0, commission: 0 },
        ],
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const orders = await adapter.getOrders();

      expect(orders[0].type).toBe(OrderType.BUY_LIMIT);
      expect(orders[1].type).toBe(OrderType.SELL_LIMIT);
      expect(orders[2].type).toBe(OrderType.BUY_STOP);
      expect(orders[3].type).toBe(OrderType.SELL_STOP);
    });
  });

  describe('getDeals (MT4 历史订单)', () => {
    // 适配器已通过 ServiceToken 配置自动认证

    it('应该返回历史成交记录', async () => {
      const mockResponse = {
        code: 0,
        data: {
          history: [
            {
              ticket: 456,
              login: 1001,
              symbol: 'EURUSD',
              cmd: 0, // BUY
              volume: 1.0,
              open_price: 1.1,
              close_price: 1.12,
              open_time: '2024-12-01T10:00:00Z',
              close_time: '2024-12-01T14:00:00Z',
              profit: 200,
              swap: -1.5,
              commission: -2,
              comment: 'Closed trade',
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
      expect(deal.entry).toBe(DealEntry.OUT); // MT4 历史订单都是关闭的
      expect(deal.price).toBe(1.12); // close_price
      expect(deal.time).toBeInstanceOf(Date);
    });

    it('应该正确处理余额操作 (cmd=6)', async () => {
      const mockResponse = {
        code: 0,
        data: {
          history: [
            {
              ticket: 789,
              login: 1001,
              symbol: '',
              cmd: 6, // BALANCE
              volume: 0,
              open_price: 0,
              close_price: 1000, // 存款金额
              open_time: '2024-12-01T10:00:00Z',
              close_time: '2024-12-01T10:00:00Z',
              profit: 1000,
              swap: 0,
              commission: 0,
              comment: 'Deposit',
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
      expect(deal.type).toBe(DealType.BALANCE);
      expect(deal.entry).toBe(DealEntry.IN); // 余额操作是 IN
    });
  });

  describe('getSymbols', () => {
    // 适配器已通过 ServiceToken 配置自动认证

    it('应该返回品种列表并正确转换 MT4 特有字段', async () => {
      const mockResponse = {
        code: 0,
        data: [
          {
            symbol: 'EURUSD',
            description: 'Euro vs US Dollar',
            digits: 5,
            contract_size: 100000,
            point: 0.00001, // MT4 使用 point 而非 tick_size
            spread: 10,
            bid: 1.1,
            ask: 1.1001,
            high: 1.105,
            low: 1.095,
            lot_min: 0.01, // MT4 使用 lot_min 而非 volume_min
            lot_max: 100,
            lot_step: 0.01,
            currency: 'EUR',
            margin_currency: 'EUR',
            trade_mode: 4,
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
      expect(symbol.contractSize).toBe(100000);
      expect(symbol.tickSize).toBe(0.00001); // point -> tickSize
      expect(symbol.volumeMin).toBe(0.01); // lot_min -> volumeMin
      expect(symbol.volumeMax).toBe(100);
      expect(symbol.volumeStep).toBe(0.01);
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
          time: '2024-12-01T12:00:00Z',
          high: 1.105,
          low: 1.095,
        },
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const quote = await adapter.getQuote('EURUSD');

      expect(quote).not.toBeNull();
      expect(quote?.symbol).toBe('EURUSD');
      expect(quote?.time).toBeInstanceOf(Date);
      // spread 应该被计算出来
      expect(quote?.spread).toBeDefined();
    });

    it('没有 spread 字段时应该计算 spread', async () => {
      const mockResponse = {
        code: 0,
        data: {
          symbol: 'EURUSD',
          bid: 1.10000,
          ask: 1.10010,
          time: '2024-12-01T12:00:00Z',
          // 没有 spread 字段
        },
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const quote = await adapter.getQuote('EURUSD');

      expect(quote).not.toBeNull();
      // spread = (ask - bid) * 10^5 = 0.0001 * 100000 = 10
      expect(quote?.spread).toBeCloseTo(10, 0);
    });
  });

  describe('getServerStatus / testConnection', () => {
    it('应该返回服务器状态', async () => {
      const mockResponse = {
        code: 0,
        data: {
          status: 'healthy',
          server_time: '2024-12-01T12:00:00Z',
          build: 1220, // MT4 使用 build 版本号
          users_total: 100,
          trades_total: 500,
        },
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const status = await adapter.getServerStatus();

      expect(status.online).toBe(true);
      expect(status.serverTime).toBeInstanceOf(Date);
      expect(status.version).toBe('1220'); // build -> version
      expect(status.connectedUsers).toBe(100);
      expect(status.activePositions).toBe(500);
    });

    it('status 为 ok 时也应该返回在线状态', async () => {
      const mockResponse = {
        code: 0,
        data: {
          status: 'ok', // MT4 可能返回 'ok' 而非 'healthy'
          server_time: '2024-12-01T12:00:00Z',
        },
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const status = await adapter.getServerStatus();

      expect(status.online).toBe(true);
    });

    it('testConnection 应该返回 true 当服务器健康时', async () => {
      const mockResponse = {
        code: 0,
        data: {
          status: 'healthy',
          server_time: '2024-12-01T12:00:00Z',
        },
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const result = await adapter.testConnection();

      expect(result).toBe(true);
    });

    it('testConnection 应该返回 false 当连接失败时', async () => {
      mockHttpService.request.mockReturnValueOnce(
        throwError(() => new Error('Connection refused')),
      );

      const result = await adapter.testConnection();

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
    });
  });

  describe('isAuthenticated', () => {
    it('使用 ServiceToken 配置时应返回 true（自动认证）', () => {
      // adapter 在 beforeEach 中使用 mockServiceTokenConfig 创建，已自动认证
      expect(adapter.isAuthenticated()).toBe(true);
    });

    it('没有 ServiceToken 配置时应返回 false', () => {
      // 使用不含 ServiceToken 的基础配置创建适配器
      const unauthenticatedAdapter = new MT4Adapter(mockHttpService, mockConfig);
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
      const expiredAdapter = new MT4Adapter(mockHttpService, expiredConfig);
      expect(expiredAdapter.isAuthenticated()).toBe(false);
    });
  });

  describe('MT4 特有方法', () => {
    // 适配器已通过 ServiceToken 配置自动认证

    it('getAllTrades 应该返回所有交易', async () => {
      const mockResponse = {
        code: 0,
        data: [
          { ticket: 1, login: 1001, symbol: 'EURUSD', cmd: 0, volume: 1, open_price: 1.1, open_time: '2024-01-01', profit: 0, swap: 0, commission: 0 },
          { ticket: 2, login: 1001, symbol: 'EURUSD', cmd: 2, volume: 1, open_price: 1.08, open_time: '2024-01-01', profit: 0, swap: 0, commission: 0 },
        ],
      };

      mockHttpService.request.mockReturnValueOnce(
        of(createAxiosResponse(mockResponse)),
      );

      const trades = await adapter.getAllTrades();

      expect(trades).toHaveLength(2);
    });
  });
});
