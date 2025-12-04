import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse, InternalAxiosRequestConfig, AxiosError } from 'axios';
import { MiddlewareAuthService, MiddlewareSession } from './middleware-auth.service';
import { ResponseTransformer } from '../transformers/response.transformer';
import { BusinessException, ErrorCodes } from '../../common';

describe('MiddlewareAuthService', () => {
  let service: MiddlewareAuthService;
  let httpService: HttpService;
  let responseTransformer: ResponseTransformer;

  const mockHttpService = {
    post: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'middleware.baseUrl': 'http://localhost:3001',
        'middleware.timeout': 30000,
        'middleware.adminUsername': 'admin',
        'middleware.adminPassword': 'password123',
      };
      return config[key];
    }),
  };

  const mockResponseTransformer = {
    transform: jest.fn((response) => response.data),
  };

  const mockInstanceId = 'instance-test-1';

  const mockLoginResponse = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600, // 1 小时
    token_type: 'Bearer',
    session_id: 'session-123',
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MiddlewareAuthService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ResponseTransformer, useValue: mockResponseTransformer },
      ],
    }).compile();

    service = module.get<MiddlewareAuthService>(MiddlewareAuthService);
    httpService = module.get<HttpService>(HttpService);
    responseTransformer = module.get<ResponseTransformer>(ResponseTransformer);

    jest.clearAllMocks();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('登录成功应返回会话信息', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      const result = await service.login(mockInstanceId);

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.instanceId).toBe(mockInstanceId);
      expect(result.sessionId).toBe('session-123');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('登录成功应缓存会话', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId);

      expect(service.hasSession(mockInstanceId)).toBe(true);
      expect(service.getCacheSize()).toBe(1);
    });

    it('使用自定义凭证登录', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId, {
        username: 'custom-user',
        password: 'custom-pass',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/admin/login'),
        { username: 'custom-user', password: 'custom-pass' },
        expect.any(Object),
      );
    });

    it('登录失败应抛出 BusinessException', async () => {
      const axiosError = new Error('Connection failed') as AxiosError;
      axiosError.code = 'ECONNREFUSED';
      mockHttpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(service.login(mockInstanceId)).rejects.toThrow(BusinessException);
    });

    it('认证失败 (401) 应抛出正确错误', async () => {
      const axiosError = {
        response: {
          status: 401,
          data: { message: '用户名或密码错误' },
        },
      } as AxiosError;
      mockHttpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(service.login(mockInstanceId)).rejects.toThrow(BusinessException);
    });

    it('请求超时应抛出 MIDDLEWARE_504_001', async () => {
      const axiosError = new Error('Timeout') as AxiosError;
      axiosError.code = 'ETIMEDOUT';
      mockHttpService.post.mockReturnValue(throwError(() => axiosError));

      try {
        await service.login(mockInstanceId);
        fail('应抛出异常');
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessException);
        const businessError = error as BusinessException;
        const errorResponse = businessError.getResponse() as { code: string };
        expect(errorResponse.code).toBe(ErrorCodes.MIDDLEWARE_504_001);
      }
    });
  });

  describe('getSession', () => {
    it('有效缓存应直接返回', async () => {
      // 先登录
      const mockResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId);
      mockHttpService.post.mockClear();

      // 再次获取会话
      const session = await service.getSession(mockInstanceId);

      expect(session.accessToken).toBe('mock-access-token');
      expect(mockHttpService.post).not.toHaveBeenCalled(); // 不应再次调用 HTTP
    });

    it('无缓存应自动登录', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      const session = await service.getSession(mockInstanceId);

      expect(session.accessToken).toBe('mock-access-token');
      expect(mockHttpService.post).toHaveBeenCalled();
    });
  });

  describe('getAccessToken', () => {
    it('应返回访问令牌', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      const token = await service.getAccessToken(mockInstanceId);

      expect(token).toBe('mock-access-token');
    });
  });

  describe('refreshToken', () => {
    it('刷新成功应更新会话', async () => {
      // 先登录
      const mockLoginResponseData: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockLoginResponseData));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId);

      // 刷新 Token
      const newTokenResponse = {
        ...mockLoginResponse,
        access_token: 'new-access-token',
      };
      const mockRefreshResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: newTokenResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockRefreshResponse));
      mockResponseTransformer.transform.mockReturnValue(newTokenResponse);

      const refreshedSession = await service.refreshToken(mockInstanceId);

      expect(refreshedSession.accessToken).toBe('new-access-token');
    });

    it('无会话时刷新应抛出异常', async () => {
      await expect(service.refreshToken('non-existent')).rejects.toThrow(BusinessException);
    });

    it('刷新失败应清除会话', async () => {
      // 先登录
      const mockResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId);
      expect(service.hasSession(mockInstanceId)).toBe(true);

      // 刷新失败
      mockHttpService.post.mockReturnValue(throwError(() => new Error('Refresh failed')));

      await expect(service.refreshToken(mockInstanceId)).rejects.toThrow();
      expect(service.hasSession(mockInstanceId)).toBe(false);
    });
  });

  describe('clearSession', () => {
    it('应清除指定实例的会话', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId);
      expect(service.hasSession(mockInstanceId)).toBe(true);

      service.clearSession(mockInstanceId);

      expect(service.hasSession(mockInstanceId)).toBe(false);
      expect(service.getCacheSize()).toBe(0);
    });

    it('清除不存在的会话不应报错', () => {
      expect(() => service.clearSession('non-existent')).not.toThrow();
    });
  });

  describe('clearAllSessions', () => {
    it('应清除所有会话', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login('instance-1');
      await service.login('instance-2');
      expect(service.getCacheSize()).toBe(2);

      service.clearAllSessions();

      expect(service.getCacheSize()).toBe(0);
    });
  });

  describe('isSessionValid', () => {
    it('未过期会话应返回 true', () => {
      const session: MiddlewareSession = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 小时后
        sessionId: 'session-1',
        instanceId: mockInstanceId,
      };

      expect(service.isSessionValid(session)).toBe(true);
    });

    it('已过期会话应返回 false', () => {
      const session: MiddlewareSession = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() - 1000), // 1 秒前
        sessionId: 'session-1',
        instanceId: mockInstanceId,
      };

      expect(service.isSessionValid(session)).toBe(false);
    });

    it('即将过期会话 (30秒内) 应返回 false', () => {
      const session: MiddlewareSession = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 20 * 1000), // 20 秒后
        sessionId: 'session-1',
        instanceId: mockInstanceId,
      };

      expect(service.isSessionValid(session)).toBe(false);
    });
  });

  describe('hasSession', () => {
    it('有有效缓存应返回 true', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId);

      expect(service.hasSession(mockInstanceId)).toBe(true);
    });

    it('无缓存应返回 false', () => {
      expect(service.hasSession('non-existent')).toBe(false);
    });
  });

  describe('getCacheSize', () => {
    it('应返回正确的缓存数量', async () => {
      expect(service.getCacheSize()).toBe(0);

      const mockResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login('instance-1');
      expect(service.getCacheSize()).toBe(1);

      await service.login('instance-2');
      expect(service.getCacheSize()).toBe(2);
    });
  });

  describe('onModuleDestroy', () => {
    it('应清除所有会话和定时器', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 1000, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId);
      expect(service.getCacheSize()).toBe(1);

      service.onModuleDestroy();

      expect(service.getCacheSize()).toBe(0);
    });
  });
});
