import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { MiddlewareProxyService } from './middleware-proxy.service';
import { BusinessException } from '../common';

describe('MiddlewareProxyService', () => {
  let service: MiddlewareProxyService;

  const mockHttpService = {
    request: jest.fn(),
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

  const mockInstanceId = 'instance-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MiddlewareProxyService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
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
      const mockStatus = {
        connected: true,
        serverTime: '2024-01-15T10:00:00Z',
        ping: 50,
      };
      const mockResponse: AxiosResponse = {
        data: { success: true, data: mockStatus },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.request.mockReturnValue(of(mockResponse));

      const result = await service.getServerStatus(mockInstanceId);

      expect(result).toEqual(mockStatus);
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
        data: { success: true, data: mockQuotes },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.request.mockReturnValue(of(mockResponse));

      const result = await service.getQuotes(mockInstanceId);

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
      const mockResponse: AxiosResponse = {
        data: { success: true, data: { connected: true } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.request.mockReturnValue(of(mockResponse));

      const result = await service.testConnection(mockInstanceId);

      expect(result).toBe(true);
    });

    it('连接失败应返回 false', async () => {
      mockHttpService.request.mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );

      const result = await service.testConnection(mockInstanceId);

      expect(result).toBe(false);
    });
  });
});
