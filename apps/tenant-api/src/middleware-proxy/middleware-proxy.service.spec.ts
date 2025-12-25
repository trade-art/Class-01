import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { MiddlewareProxyService } from './middleware-proxy.service';
import { ResponseTransformer } from './transformers';
import { MiddlewareAuthService } from './services';
import { BusinessException, ErrorCodes } from '../common';

describe('MiddlewareProxyService', () => {
  let service: MiddlewareProxyService;

  const mockHttpService = {
    request: jest.fn(),
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'middleware.baseUrl': 'http://localhost:3001',
        'middleware.timeout': 30000,
        'middleware.retryAttempts': 3,
        'middleware.retryDelay': 1000,
      };
      return config[key];
    }),
  };

  const mockResponseTransformer = {
    transform: jest.fn((response) => {
      // 模拟转换逻辑
      if (response.code === 1000 || response.success) {
        return response.data;
      }
      throw new BusinessException({ code: 'MIDDLEWARE_500_001', message: '转换失败' });
    }),
    transformError: jest.fn((error) => {
      throw new BusinessException({ code: 'MIDDLEWARE_500_001', message: error.message || '请求失败' });
    }),
  };

  const mockMiddlewareAuthService = {
    getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
    login: jest.fn().mockResolvedValue({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
    }),
    getSession: jest.fn().mockResolvedValue({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
    }),
    clearSession: jest.fn(),
  };

  const mockInstanceId = 'instance-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MiddlewareProxyService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ResponseTransformer, useValue: mockResponseTransformer },
        { provide: MiddlewareAuthService, useValue: mockMiddlewareAuthService },
      ],
    }).compile();

    service = module.get<MiddlewareProxyService>(MiddlewareProxyService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('request', () => {
    it('应该成功发送请求', async () => {
      const mockResponse: AxiosResponse = {
        data: { success: true, data: { result: 'success' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.request.mockReturnValue(of(mockResponse));

      const result = await service.request('get', '/test', mockInstanceId);

      expect(result).toEqual({ result: 'success' });
      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'get',
          url: 'http://localhost:3001/test',
          headers: expect.objectContaining({
            'X-Instance-ID': mockInstanceId,
          }),
        }),
      );
    });

    it('中间件返回失败应抛出异常', async () => {
      const mockResponse: AxiosResponse = {
        data: { success: false, message: 'Error' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.request.mockReturnValue(of(mockResponse));

      await expect(
        service.request('get', '/test', mockInstanceId),
      ).rejects.toThrow();
    });

    it('请求失败应抛出 BusinessException', async () => {
      mockHttpService.request.mockReturnValue(
        throwError(() => new Error('Network Error')),
      );

      await expect(
        service.request('get', '/test', mockInstanceId),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('getServerStatus', () => {
    it('应该返回服务器状态', async () => {
      // 当前实现使用 httpService.get 直接请求 /health 端点
      const mockTimestamp = Date.now();
      const mockHealthResponse: AxiosResponse = {
        data: {
          service: 'mt5-middleware',
          status: 'healthy',
          timestamp: mockTimestamp,
          version: '1.0.0',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.get.mockReturnValue(of(mockHealthResponse));

      const result = await service.getServerStatus(mockInstanceId);

      expect(result.serverName).toBe('mt5-middleware');
      expect(result.connected).toBe(true);
      expect(result.tradeSession).toBe('open');
    });

    it('请求失败时应返回默认离线状态', async () => {
      // 模拟网络错误 - 使用 pipe 友好的方式
      const error$ = new (require('rxjs').Observable)((subscriber: any) => {
        subscriber.error(new Error('Connection refused'));
      });
      mockHttpService.get.mockReturnValue(error$);

      const result = await service.getServerStatus(mockInstanceId);

      expect(result.connected).toBe(false);
      expect(result.serverName).toBe('mt5-middleware');
      expect(result.tradeSession).toBe('closed');
    });
  });

  describe('getAccountInfo', () => {
    it('应该返回账户信息', async () => {
      const mockAccountInfo = {
        balance: 100000,
        equity: 105000,
        margin: 20000,
        freeMargin: 85000,
        marginLevel: 525,
      };
      const mockResponse: AxiosResponse = {
        data: { success: true, data: mockAccountInfo },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.request.mockReturnValue(of(mockResponse));

      const result = await service.getAccountInfo(mockInstanceId);

      expect(result).toEqual(mockAccountInfo);
    });
  });

  describe('getPositions', () => {
    it('应该返回持仓列表', async () => {
      const mockPositions = [
        { ticket: 12345, symbol: 'EURUSD', profit: 250 },
        { ticket: 12346, symbol: 'GBPUSD', profit: 125 },
      ];
      const mockResponse: AxiosResponse = {
        data: { success: true, data: mockPositions },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.request.mockReturnValue(of(mockResponse));

      const result = await service.getPositions(mockInstanceId);

      expect(result).toEqual(mockPositions);
      expect(result).toHaveLength(2);
    });
  });

  describe('getQuotes', () => {
    it('应该返回报价列表', async () => {
      const mockQuotes = [
        { symbol: 'EURUSD', bid: 1.085, ask: 1.0852 },
        { symbol: 'GBPUSD', bid: 1.265, ask: 1.2652 },
      ];
      const mockResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockQuotes, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.request.mockReturnValue(of(mockResponse));

      const symbols = ['EURUSD', 'GBPUSD'];
      const result = await service.getQuotes(mockInstanceId, symbols);

      expect(result).toEqual(mockQuotes);
    });
  });

  describe('getDeals', () => {
    it('应该返回交易历史', async () => {
      const mockDeals = {
        deals: [
          { ticket: 1, symbol: 'EURUSD', profit: 100 },
          { ticket: 2, symbol: 'GBPUSD', profit: 200 },
        ],
        total: 2,
      };
      const mockResponse: AxiosResponse = {
        data: { success: true, data: mockDeals },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.request.mockReturnValue(of(mockResponse));

      const result = await service.getDeals(mockInstanceId, {
        from: '2024-01-01',
        to: '2024-01-15',
      });

      expect(result.deals).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('testConnection', () => {
    it('连接成功应返回 true', async () => {
      // 直接 spy getServerStatus 方法
      jest.spyOn(service, 'getServerStatus').mockResolvedValue({
        serverName: 'mt5-middleware',
        connected: true,
        ping: 50,
        serverTime: new Date().toISOString(),
        tradeSession: 'open',
      });

      const result = await service.testConnection(mockInstanceId);

      expect(result).toBe(true);
    });

    it('连接失败应返回 false', async () => {
      // 当连接失败时，getServerStatus 返回 connected: false
      jest.spyOn(service, 'getServerStatus').mockResolvedValue({
        serverName: 'mt5-middleware',
        connected: false,
        ping: -1,
        serverTime: new Date().toISOString(),
        tradeSession: 'closed',
      });

      const result = await service.testConnection(mockInstanceId);

      expect(result).toBe(false);
    });
  });
});
