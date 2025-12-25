import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse, InternalAxiosRequestConfig, AxiosError } from 'axios';
import { MiddlewareAuthService, MiddlewareSession } from './middleware-auth.service';
import { ResponseTransformer } from '../transformers/response.transformer';
import { MtServerService } from './mt-server.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ServiceTokenService } from '../../auth/services/service-token.service';
import { BusinessException, ErrorCodes } from '../../common';

describe('MiddlewareAuthService', () => {
  let service: MiddlewareAuthService;
  let httpService: HttpService;
  let responseTransformer: ResponseTransformer;
  let mtServerService: MtServerService;

  const mockHttpService = {
    post: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'middleware.baseUrl': 'http://localhost:3001',
        'middleware.timeout': 30000,
        'middleware.adminLogin': '10007',
        'middleware.adminPassword': '-2TqZnTl',
      };
      return config[key];
    }),
  };

  const mockResponseTransformer = {
    transform: jest.fn((response) => response.data),
  };

  const mockMtServerService = {
    getDefaultServerConfig: jest.fn(),
  };

  const mockPrismaService = {
    middlewareInstance: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };

  const mockServiceTokenService = {
    generateToken: jest.fn().mockReturnValue({
      token: 'mock-service-token-jwt',
      tokenType: 'Bearer',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }),
    validateToken: jest.fn().mockReturnValue({
      valid: true,
      payload: {
        tenantId: 'tenant-test-1',
        instanceId: 'instance-test-1',
        serverId: 'mt5-server-1',
        managerLogin: 10007,
        scopes: ['*'],
      },
      decryptedPassword: 'test-password',
    }),
    encryptPassword: jest.fn().mockReturnValue('encrypted-password'),
    decryptPassword: jest.fn().mockReturnValue('test-password'),
  };

  const mockInstanceId = 'instance-test-1';
  const mockTenantId = 'tenant-test-1';
  const mockServerId = 'mt5-server-1';

  const mockLoginResponse = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600, // 1 小时
    token_type: 'Bearer',
    session_id: 'session-123',
  };

  const mockServerConfig = {
    serverId: mockServerId,
    serverAddress: '192.168.1.100:443',
    middlewareUrl: 'http://localhost:3001',
    managerLogin: 10007,
    managerPassword: 'test-password',
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MiddlewareAuthService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ResponseTransformer, useValue: mockResponseTransformer },
        { provide: MtServerService, useValue: mockMtServerService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ServiceTokenService, useValue: mockServiceTokenService },
      ],
    }).compile();

    service = module.get<MiddlewareAuthService>(MiddlewareAuthService);
    httpService = module.get<HttpService>(HttpService);
    responseTransformer = module.get<ResponseTransformer>(ResponseTransformer);
    mtServerService = module.get<MtServerService>(MtServerService);

    jest.clearAllMocks();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // 测试用凭证
  const mockCredentials = { login: 10007, password: 'test-pass' };

  describe('login', () => {
    it('登录成功应返回会话信息', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      const result = await service.login(mockInstanceId, mockCredentials);

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.instanceId).toBe(mockInstanceId);
      expect(result.sessionId).toBe('session-123');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('登录成功应缓存会话', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId, mockCredentials);

      expect(service.hasSession(mockInstanceId)).toBe(true);
      expect(service.getCacheSize()).toBe(1);
    });

    it('使用自定义凭证登录', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId, {
        login: 10007,
        password: 'custom-pass',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/admin/login'),
        { login: 10007, password: 'custom-pass' },
        expect.any(Object),
      );
    });

    it('登录失败应抛出 BusinessException', async () => {
      const axiosError = new Error('Connection failed') as AxiosError;
      axiosError.code = 'ECONNREFUSED';
      mockHttpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(service.login(mockInstanceId, mockCredentials)).rejects.toThrow(BusinessException);
    });

    it('认证失败 (401) 应抛出正确错误', async () => {
      const axiosError = {
        response: {
          status: 401,
          data: { message: '用户名或密码错误' },
        },
      } as AxiosError;
      mockHttpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(service.login(mockInstanceId, mockCredentials)).rejects.toThrow(BusinessException);
    });

    it('请求超时应抛出 MIDDLEWARE_504_001', async () => {
      const axiosError = new Error('Timeout') as AxiosError;
      axiosError.code = 'ETIMEDOUT';
      mockHttpService.post.mockReturnValue(throwError(() => axiosError));

      try {
        await service.login(mockInstanceId, mockCredentials);
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
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId, mockCredentials);
      mockHttpService.post.mockClear();

      // 再次获取会话（提供凭证以跳过 serverId 解析）
      const session = await service.getSession(mockInstanceId, mockCredentials);

      expect(session.accessToken).toBe('mock-access-token');
      expect(mockHttpService.post).not.toHaveBeenCalled(); // 不应再次调用 HTTP
    });

    it('无缓存应自动登录', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      const session = await service.getSession(mockInstanceId, mockCredentials);

      expect(session.accessToken).toBe('mock-access-token');
      expect(mockHttpService.post).toHaveBeenCalled();
    });

    it('多租户模式下应解析 serverId 确保缓存键一致', async () => {
      // 模拟从数据库获取服务器配置
      mockMtServerService.getDefaultServerConfig.mockResolvedValue(mockServerConfig);

      const mockResponse: AxiosResponse = {
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      // 第一次调用 getSession（不传 serverId）
      await service.getSession(mockInstanceId, undefined, mockTenantId);
      expect(mockHttpService.post).toHaveBeenCalledTimes(1);

      // 验证 getDefaultServerConfig 被调用以解析 serverId
      expect(mockMtServerService.getDefaultServerConfig).toHaveBeenCalledWith(mockTenantId);

      // 清除调用记录
      mockHttpService.post.mockClear();
      mockMtServerService.getDefaultServerConfig.mockClear();

      // 第二次调用 getSession（同样不传 serverId）
      // 应该命中缓存，不再调用登录
      const session = await service.getSession(mockInstanceId, undefined, mockTenantId);

      expect(session.accessToken).toBe('mock-access-token');
      expect(mockHttpService.post).not.toHaveBeenCalled(); // 缓存命中，不应再次登录
      // getDefaultServerConfig 会被调用以解析 serverId 用于缓存键查找
      expect(mockMtServerService.getDefaultServerConfig).toHaveBeenCalledWith(mockTenantId);
    });

    it('提供凭证时不应解析 serverId', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      // 提供凭证时，不需要从数据库解析 serverId
      const credentials = { login: 10007, password: 'test-pass' };
      await service.getSession(mockInstanceId, credentials, mockTenantId);

      // 不应调用 getDefaultServerConfig
      expect(mockMtServerService.getDefaultServerConfig).not.toHaveBeenCalled();
    });
  });

  describe('getAccessToken', () => {
    it('应返回访问令牌', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      const token = await service.getAccessToken(mockInstanceId, mockCredentials);

      expect(token).toBe('mock-access-token');
    });
  });

  describe('getAuthHeaders', () => {
    beforeEach(() => {
      // 模拟服务器配置
      mockMtServerService.getDefaultServerConfig.mockResolvedValue(mockServerConfig);
    });

    it('应返回包含 Service Token 的认证头', async () => {
      const headers = await service.getAuthHeaders(mockTenantId);

      expect(headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-service-token-jwt',
          'X-Tenant-Id': mockTenantId,
        }),
      );
    });

    it('应调用 ServiceTokenService.generateToken', async () => {
      await service.getAuthHeaders(mockTenantId);

      expect(mockServiceTokenService.generateToken).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
          instanceId: `inst_${mockTenantId}_${mockServerId}`,
          serverId: mockServerId,
          managerLogin: mockServerConfig.managerLogin,
          managerPassword: mockServerConfig.managerPassword,
          scopes: ['*'],
        }),
      );
    });

    it('应使用自定义 scopes', async () => {
      const customScopes = ['trade:read', 'account:read'];
      await service.getAuthHeaders(mockTenantId, undefined, customScopes);

      expect(mockServiceTokenService.generateToken).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: customScopes,
        }),
      );
    });

    it('应使用指定的 serverId', async () => {
      const customServerId = 'custom-server-id';
      await service.getAuthHeaders(mockTenantId, customServerId);

      expect(mockServiceTokenService.generateToken).toHaveBeenCalledWith(
        expect.objectContaining({
          serverId: customServerId,
        }),
      );
    });

    it('应包含服务器地址头', async () => {
      const headers = await service.getAuthHeaders(mockTenantId);

      expect(headers['X-Server-Address']).toBe(mockServerConfig.serverAddress);
      expect(headers['X-Server-Id']).toBe(mockServerConfig.serverId);
    });

    it('无服务器配置时应抛出异常', async () => {
      mockMtServerService.getDefaultServerConfig.mockRejectedValue(
        new Error('Server config not found'),
      );

      await expect(service.getAuthHeaders(mockTenantId)).rejects.toThrow();
    });

    it('租户有 maxSessions 配置时应包含 X-Max-Sessions 头', async () => {
      // 模拟租户有 maxSessions 配置
      mockPrismaService.middlewareInstance.findFirst.mockResolvedValue({
        maxSessions: 100,
      });

      const headers = await service.getAuthHeaders(mockTenantId);

      expect(headers['X-Max-Sessions']).toBe('100');

      // 清理 mock
      mockPrismaService.middlewareInstance.findFirst.mockResolvedValue(null);
    });

    it('租户无 maxSessions 配置时不应包含 X-Max-Sessions 头', async () => {
      // 确保没有 maxSessions 配置
      mockPrismaService.middlewareInstance.findFirst.mockResolvedValue(null);
      mockPrismaService.tenant.findUnique.mockResolvedValue({ maxSessions: 0 });

      const headers = await service.getAuthHeaders(mockTenantId);

      expect(headers['X-Max-Sessions']).toBeUndefined();
    });
  });

  describe('refreshToken', () => {
    it('刷新成功应更新会话', async () => {
      // 先登录
      const mockLoginResponseData: AxiosResponse = {
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockLoginResponseData));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId, mockCredentials);

      // 刷新 Token
      const newTokenResponse = {
        ...mockLoginResponse,
        access_token: 'new-access-token',
      };
      const mockRefreshResponse: AxiosResponse = {
        data: { code: 0, message: 'success', data: newTokenResponse, timestamp: Date.now() },
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
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId, mockCredentials);
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
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId, mockCredentials);
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
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login('instance-1', mockCredentials);
      await service.login('instance-2', mockCredentials);
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
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId, mockCredentials);

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
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login('instance-1', mockCredentials);
      expect(service.getCacheSize()).toBe(1);

      await service.login('instance-2', mockCredentials);
      expect(service.getCacheSize()).toBe(2);
    });
  });

  describe('onModuleDestroy', () => {
    it('应清除所有会话和定时器', async () => {
      const mockResponse: AxiosResponse = {
        data: { code: 0, message: 'success', data: mockLoginResponse, timestamp: Date.now() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockResponseTransformer.transform.mockReturnValue(mockLoginResponse);

      await service.login(mockInstanceId, mockCredentials);
      expect(service.getCacheSize()).toBe(1);

      service.onModuleDestroy();

      expect(service.getCacheSize()).toBe(0);
    });
  });
});
