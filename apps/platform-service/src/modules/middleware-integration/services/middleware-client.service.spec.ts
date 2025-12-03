/**
 * MiddlewareClientService 单元测试
 *
 * 测试内容:
 * - HTTP 请求方法 (GET, POST, PUT, DELETE)
 * - 熔断器集成
 * - 指数退避重试逻辑
 * - 可重试错误判断
 * - 连接测试功能
 *
 * middleware-integration Task 6.7
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { MiddlewareClientService } from './middleware-client.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosError } from 'axios';

describe('MiddlewareClientService', () => {
  let service: MiddlewareClientService;
  let httpService: { request: jest.Mock };
  let circuitBreaker: { isOpen: jest.Mock; canRequest: jest.Mock; recordSuccess: jest.Mock; recordFailure: jest.Mock };
  let configService: { get: jest.Mock };

  const mockInstance = {
    id: 'test-instance-id',
    name: 'Test Instance',
    host: 'localhost',
    port: 8080,
    useTls: false,
    apiKey: 'test-api-key',
    status: 'ONLINE' as const,
    circuitBreakerState: 'CLOSED' as const,
    consecutiveFailures: 0,
    tenantId: 'test-tenant-id',
  };

  const mockSuccessResponse: AxiosResponse = {
    data: { success: true, message: 'OK' },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MiddlewareClientService,
        {
          provide: HttpService,
          useValue: {
            request: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: CircuitBreakerService,
          useValue: {
            isOpen: jest.fn().mockReturnValue(false),
            canRequest: jest.fn().mockReturnValue(true),
            recordSuccess: jest.fn(),
            recordFailure: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MiddlewareClientService>(MiddlewareClientService);
    httpService = module.get(HttpService);
    circuitBreaker = module.get(CircuitBreakerService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确注入依赖', () => {
      expect(service).toBeDefined();
    });
  });

  describe('get 方法', () => {
    it('成功请求应返回响应数据', async () => {
      httpService.request.mockReturnValue(of(mockSuccessResponse));

      const result = await service.get(mockInstance, '/api/test');

      expect(result).toEqual({ success: true, message: 'OK' });
      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: 'http://localhost:8080/api/test',
        }),
      );
    });

    it('应该在请求头中包含 API Key', async () => {
      httpService.request.mockReturnValue(of(mockSuccessResponse));

      await service.get(mockInstance, '/api/test');

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key',
          }),
        }),
      );
    });

    it('应该在请求头中包含 Instance ID', async () => {
      httpService.request.mockReturnValue(of(mockSuccessResponse));

      await service.get(mockInstance, '/api/test');

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Instance-Id': 'test-instance-id',
          }),
        }),
      );
    });
  });

  describe('post 方法', () => {
    it('应该发送 POST 请求并包含请求体', async () => {
      httpService.request.mockReturnValue(of(mockSuccessResponse));
      const postData = { foo: 'bar' };

      await service.post(mockInstance, '/api/test', postData);

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://localhost:8080/api/test',
          data: postData,
        }),
      );
    });
  });

  describe('put 方法', () => {
    it('应该发送 PUT 请求', async () => {
      httpService.request.mockReturnValue(of(mockSuccessResponse));
      const putData = { update: 'value' };

      await service.put(mockInstance, '/api/test', putData);

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          data: putData,
        }),
      );
    });
  });

  describe('delete 方法', () => {
    it('应该发送 DELETE 请求', async () => {
      httpService.request.mockReturnValue(of(mockSuccessResponse));

      await service.delete(mockInstance, '/api/test');

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });
  });

  describe('熔断器集成', () => {
    it('熔断器打开时应拒绝请求', async () => {
      circuitBreaker.isOpen.mockReturnValue(true);

      await expect(service.get(mockInstance, '/api/test')).rejects.toThrow(
        'Circuit breaker is open for instance test-instance-id',
      );

      expect(httpService.request).not.toHaveBeenCalled();
    });

    it('成功请求后应记录成功', async () => {
      httpService.request.mockReturnValue(of(mockSuccessResponse));

      await service.get(mockInstance, '/api/test');

      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith('test-instance-id');
    });

    it('失败请求后应记录失败', async () => {
      const error = new Error('Connection failed');
      httpService.request.mockReturnValue(throwError(() => error));

      await expect(
        service.get(mockInstance, '/api/test', { retries: 0 }),
      ).rejects.toThrow();

      expect(circuitBreaker.recordFailure).toHaveBeenCalledWith(
        'test-instance-id',
        'Connection failed',
      );
    });

    it('skipCircuitBreaker 选项应跳过熔断器检查', async () => {
      circuitBreaker.isOpen.mockReturnValue(true);
      httpService.request.mockReturnValue(of(mockSuccessResponse));

      const result = await service.get(mockInstance, '/api/test', {
        skipCircuitBreaker: true,
      });

      expect(result).toEqual({ success: true, message: 'OK' });
    });
  });

  describe('重试逻辑', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('网络错误应触发重试', async () => {
      const networkError = { code: 'ECONNREFUSED', message: 'Connection refused' };
      httpService.request
        .mockReturnValueOnce(throwError(() => networkError))
        .mockReturnValueOnce(of(mockSuccessResponse));

      const promise = service.get(mockInstance, '/api/test', { retries: 1 });

      // 快进等待重试延迟
      await jest.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toEqual({ success: true, message: 'OK' });
      expect(httpService.request).toHaveBeenCalledTimes(2);
    });

    it('5xx 错误应触发重试', async () => {
      const serverError = {
        response: { status: 500 },
        message: 'Internal Server Error',
      };
      httpService.request
        .mockReturnValueOnce(throwError(() => serverError))
        .mockReturnValueOnce(of(mockSuccessResponse));

      const promise = service.get(mockInstance, '/api/test', { retries: 1 });

      await jest.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toEqual({ success: true, message: 'OK' });
    });

    it('超时错误应触发重试', async () => {
      const timeoutError = { message: 'Request timeout exceeded' };
      httpService.request
        .mockReturnValueOnce(throwError(() => timeoutError))
        .mockReturnValueOnce(of(mockSuccessResponse));

      const promise = service.get(mockInstance, '/api/test', { retries: 1 });

      await jest.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toEqual({ success: true, message: 'OK' });
    });

    it('429 错误应触发重试', async () => {
      const rateLimitError = {
        response: { status: 429 },
        message: 'Too Many Requests',
      };
      httpService.request
        .mockReturnValueOnce(throwError(() => rateLimitError))
        .mockReturnValueOnce(of(mockSuccessResponse));

      const promise = service.get(mockInstance, '/api/test', { retries: 1 });

      await jest.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toEqual({ success: true, message: 'OK' });
    });

    it('4xx 错误 (非429) 不应重试', async () => {
      const clientError = {
        response: { status: 404 },
        message: 'Not Found',
      };
      httpService.request.mockReturnValue(throwError(() => clientError));

      await expect(
        service.get(mockInstance, '/api/test', { retries: 3 }),
      ).rejects.toBeDefined();

      // 4xx 错误不可重试，即使设置 retries: 3 也只请求一次
      expect(httpService.request).toHaveBeenCalledTimes(1);
    });

    it('达到最大重试次数后应抛出错误', async () => {
      jest.useRealTimers(); // 使用真实计时器以避免复杂的 fake timer 交互

      const networkError = { code: 'ECONNREFUSED', message: 'Connection refused' };
      httpService.request.mockReturnValue(throwError(() => networkError));

      // 使用 retryDelay: 1 减少等待时间
      await expect(
        service.get(mockInstance, '/api/test', { retries: 2, retryDelay: 1 }),
      ).rejects.toMatchObject({ code: 'ECONNREFUSED' });

      // 1 initial + 2 retries = 3 calls
      expect(httpService.request).toHaveBeenCalledTimes(3);

      jest.useFakeTimers(); // 恢复 fake timers 以保持其他测试一致
    });
  });

  describe('URL 构建', () => {
    it('应正确构建 HTTP URL', async () => {
      const httpInstance = { ...mockInstance, useTls: false };
      httpService.request.mockReturnValue(of(mockSuccessResponse));

      await service.get(httpInstance, '/api/test');

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://localhost:8080/api/test',
        }),
      );
    });

    it('应正确构建 HTTPS URL', async () => {
      const httpsInstance = { ...mockInstance, useTls: true };
      httpService.request.mockReturnValue(of(mockSuccessResponse));

      await service.get(httpsInstance, '/api/test');

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://localhost:8080/api/test',
        }),
      );
    });
  });

  describe('testConnection', () => {
    it('连接成功应返回成功状态和延迟', async () => {
      httpService.request.mockReturnValue(of(mockSuccessResponse));

      const result = await service.testConnection(mockInstance);

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.message).toBeUndefined();
    });

    it('连接失败应返回失败状态和错误消息', async () => {
      const error = new Error('Connection refused');
      httpService.request.mockReturnValue(throwError(() => error));

      const result = await service.testConnection(mockInstance);

      expect(result.success).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.message).toBe('Connection refused');
    });

    it('测试连接应跳过熔断器', async () => {
      circuitBreaker.isOpen.mockReturnValue(true);
      httpService.request.mockReturnValue(of(mockSuccessResponse));

      const result = await service.testConnection(mockInstance);

      expect(result.success).toBe(true);
      // 即使熔断器打开，testConnection 也应成功
    });

    it('测试连接不应重试', async () => {
      const error = new Error('Connection failed');
      httpService.request.mockReturnValue(throwError(() => error));

      await service.testConnection(mockInstance);

      // testConnection 使用 retries: 0，只请求一次
      expect(httpService.request).toHaveBeenCalledTimes(1);
    });
  });

  describe('请求配置', () => {
    it('应使用自定义超时', async () => {
      httpService.request.mockReturnValue(of(mockSuccessResponse));

      await service.get(mockInstance, '/api/test', { timeout: 10000 });

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10000,
        }),
      );
    });

    it('应使用默认超时', async () => {
      httpService.request.mockReturnValue(of(mockSuccessResponse));

      await service.get(mockInstance, '/api/test');

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000, // HTTP_CLIENT_CONFIG.DEFAULT_TIMEOUT_MS
        }),
      );
    });
  });
});
