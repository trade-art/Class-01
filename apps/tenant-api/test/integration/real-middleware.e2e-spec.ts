/**
 * 真实中间件集成测试
 *
 * 此测试套件直接连接到 C++ MT5 中间件，不使用 mock
 *
 * 前置条件：
 * - C++ 中间件运行在 http://localhost:8083
 * - PostgreSQL 数据库运行在 localhost:5433
 * - Redis 运行在 localhost:6380
 *
 * 运行方式：
 * npm run test:e2e -- --testPathPattern=real-middleware
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// 中间件配置
const MIDDLEWARE_BASE_URL = 'http://localhost:8083';

// 中间件响应类型
interface MiddlewareResponse<T = unknown> {
  code: number;
  data?: T;
  message?: string;
  error?: {
    type: string;
    detail: string;
  };
  timestamp: number;
}

interface HealthResponse {
  service: string;
  status: string;
  timestamp: number;
  version: string;
}

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface SymbolInfo {
  symbol: string;
  description: string;
  digits: number;
  bid: number;
  ask: number;
  spread: number;
}

interface UserInfo {
  login: number;
  name: string;
  group: string;
  balance: number;
  equity: number;
}

describe('真实中间件集成测试 (Real Middleware E2E)', () => {
  let httpClient: AxiosInstance;
  let accessToken: string | null = null;

  beforeAll(() => {
    // 创建 axios 实例直接连接到中间件
    httpClient = axios.create({
      baseURL: MIDDLEWARE_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  // ==================== 健康检查测试 ====================

  describe('健康检查端点 (/health)', () => {
    it('根路径健康检查应返回 healthy 状态', async () => {
      const response = await httpClient.get<HealthResponse>('/health');

      expect(response.status).toBe(200);
      expect(response.data.service).toBe('mt5-middleware');
      expect(response.data.status).toBe('healthy');
      expect(response.data.version).toBeDefined();
      expect(response.data.timestamp).toBeDefined();
    });

    it('/api/v1/health 端点应返回 healthy 状态', async () => {
      const response = await httpClient.get<HealthResponse>('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.data.service).toBe('mt5-middleware');
      expect(response.data.status).toBe('healthy');
    });

    it('健康检查不需要认证', async () => {
      // 不带 Authorization header
      const response = await httpClient.get('/health');
      expect(response.status).toBe(200);
    });
  });

  // ==================== 认证端点测试 ====================

  describe('认证端点 (/api/v1/auth)', () => {
    it('登录请求缺少必要参数应返回 400 或速率限制', async () => {
      try {
        await httpClient.post('/api/v1/auth/login', {});
        fail('应该抛出错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        // 中间件可能返回 400 (缺少参数) 或 429 (速率限制)
        expect([400, 429]).toContain(axiosError.response?.status);
      }
    });

    it('登录请求使用无效服务器应返回连接失败错误或超时', async () => {
      try {
        await httpClient.post('/api/v1/auth/login', {
          server: 'invalid-server:443',
          login: 1,
          password: 'test-password',
        });
        fail('应该抛出错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        const response = axiosError.response;

        // 可能是超时（无 response）或中间件返回错误
        if (response) {
          // 中间件返回 500 (服务器内部错误) 或特定错误码
          expect(response.status).toBeGreaterThanOrEqual(400);
          expect(response.data?.code).toBeDefined();
          expect(response.data?.message).toBeDefined();

          // 应该是连接失败、速率限制或其他错误
          const errorType = response.data?.error?.type;
          expect(['MT5_CONNECTION_FAILED', 'INTERNAL_ERROR', 'VALIDATION_ERROR', 'RATE_LIMIT_EXCEEDED']).toContain(errorType);
        } else {
          // axios 超时错误
          expect(['ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED']).toContain(axiosError.code);
        }
      }
    });

    it('使用本地测试服务器参数应返回适当错误或超时', async () => {
      try {
        await httpClient.post('/api/v1/auth/login', {
          server: 'localhost:443',
          login: 1,
          password: 'test-password',
        });
        fail('应该抛出错误（没有真实的 MT5 服务器）');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        const response = axiosError.response;

        // 可能是超时（无 response）或中间件返回错误
        if (response) {
          expect(response.data?.code).toBeDefined();

          // 连接失败、认证失败或速率限制都是预期行为
          const errorType = response.data?.error?.type;
          expect(['MT5_CONNECTION_FAILED', 'AUTH_FAILED', 'INTERNAL_ERROR', 'RATE_LIMIT_EXCEEDED']).toContain(errorType);
        } else {
          // axios 超时错误
          expect(['ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED']).toContain(axiosError.code);
        }
      }
    });
  });

  // ==================== 未认证访问测试 ====================

  describe('未认证访问控制', () => {
    it('访问 /api/v1/symbols 无 token 应返回 401', async () => {
      try {
        await httpClient.get('/api/v1/symbols');
        fail('应该抛出 401 错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response?.status).toBe(401);
        expect(axiosError.response?.data?.code).toBe(1401);
        expect(axiosError.response?.data?.error?.type).toBe('AUTH_TOKEN_MISSING');
      }
    });

    it('访问 /api/v1/account/users 无 token 应返回 401', async () => {
      try {
        await httpClient.get('/api/v1/account/users');
        fail('应该抛出 401 错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response?.status).toBe(401);
        expect(axiosError.response?.data?.error?.type).toBe('AUTH_TOKEN_MISSING');
      }
    });

    it('访问 /api/v1/account/positions 无 token 应返回 401', async () => {
      try {
        await httpClient.get('/api/v1/account/positions');
        fail('应该抛出 401 错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response?.status).toBe(401);
      }
    });

    it('访问 /api/v1/trading/history/deals 无 token 应返回 401', async () => {
      try {
        await httpClient.get('/api/v1/trading/history/deals');
        fail('应该抛出 401 错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response?.status).toBe(401);
      }
    });

    it('使用无效 token 应返回 401', async () => {
      try {
        await httpClient.get('/api/v1/symbols', {
          headers: {
            Authorization: 'Bearer invalid-token-12345',
          },
        });
        fail('应该抛出 401 错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response?.status).toBe(401);
        expect(axiosError.response?.data?.error?.type).toBe('AUTH_TOKEN_INVALID');
      }
    });

    it('使用格式错误的 Authorization header 应返回 401', async () => {
      try {
        await httpClient.get('/api/v1/symbols', {
          headers: {
            Authorization: 'InvalidFormat token123',
          },
        });
        fail('应该抛出 401 错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response?.status).toBe(401);
      }
    });
  });

  // ==================== 中间件错误响应格式测试 ====================

  describe('中间件错误响应格式', () => {
    it('错误响应应包含标准格式', async () => {
      try {
        await httpClient.get('/api/v1/symbols');
        fail('应该抛出错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        const response = axiosError.response?.data;

        // 验证错误响应格式
        expect(response).toHaveProperty('code');
        expect(response).toHaveProperty('message');
        expect(response).toHaveProperty('timestamp');
        expect(response).toHaveProperty('error');
        expect(response?.error).toHaveProperty('type');
        expect(response?.error).toHaveProperty('detail');

        // 时间戳应该是合理的值
        expect(response?.timestamp).toBeGreaterThan(0);
      }
    });

    it('404 端点应返回 Not Found', async () => {
      try {
        await httpClient.get('/api/v1/non-existent-endpoint');
        fail('应该抛出 404 错误');
      } catch (error) {
        const axiosError = error as AxiosError;
        expect(axiosError.response?.status).toBe(404);
      }
    });
  });

  // ==================== 中间件连接性测试 ====================

  describe('中间件服务可用性', () => {
    it('中间件应能快速响应健康检查', async () => {
      const startTime = Date.now();
      await httpClient.get('/health');
      const responseTime = Date.now() - startTime;

      // 健康检查应在 100ms 内响应
      expect(responseTime).toBeLessThan(100);
    });

    it('连续多次健康检查应全部成功', async () => {
      const requests = Array(10).fill(null).map(() => httpClient.get('/health'));
      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.data.status).toBe('healthy');
      });
    });

    it('中间件版本信息应符合语义化版本格式', async () => {
      const response = await httpClient.get<HealthResponse>('/health');
      const version = response.data.version;

      // 验证语义化版本格式 (x.y.z)
      const semverRegex = /^\d+\.\d+\.\d+$/;
      expect(version).toMatch(semverRegex);
    });
  });

  // ==================== Token 刷新端点测试 ====================

  describe('Token 刷新端点 (/api/v1/auth/refresh)', () => {
    it('无 token 刷新应返回错误', async () => {
      try {
        await httpClient.post('/api/v1/auth/refresh');
        fail('应该抛出错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        // 中间件可能返回 400 (缺少参数) 或 401 (未认证)
        expect([400, 401]).toContain(axiosError.response?.status);
      }
    });

    it('使用无效 refresh token 应返回错误', async () => {
      try {
        await httpClient.post('/api/v1/auth/refresh', {
          refresh_token: 'invalid-refresh-token',
        }, {
          headers: {
            Authorization: 'Bearer invalid-access-token',
          },
        });
        fail('应该抛出错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response?.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  // ==================== 中间件超时处理测试 ====================

  describe('超时和错误处理', () => {
    it('应能处理连接超时', async () => {
      const shortTimeoutClient = axios.create({
        baseURL: MIDDLEWARE_BASE_URL,
        timeout: 1, // 1ms 超时
      });

      try {
        await shortTimeoutClient.get('/health');
        // 如果请求成功（非常快），跳过此测试
      } catch (error) {
        const axiosError = error as AxiosError;
        // 可能是超时或连接错误
        expect(['ECONNABORTED', 'ETIMEDOUT', undefined]).toContain(axiosError.code);
      }
    });
  });

  // ==================== Content-Type 处理测试 ====================

  describe('Content-Type 处理', () => {
    it('POST 请求应接受 application/json', async () => {
      try {
        await httpClient.post('/api/v1/auth/login',
          { server: 'test', login: 1, password: 'test' },
          { headers: { 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        // 应该得到业务错误，而不是 Content-Type 错误
        expect(axiosError.response?.status).not.toBe(415);
      }
    });

    it('健康检查应返回 JSON 格式', async () => {
      const response = await httpClient.get('/health');
      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  // ==================== CORS 和安全头测试 ====================

  describe('HTTP 头部和安全性', () => {
    it('响应应包含适当的 Content-Type', async () => {
      const response = await httpClient.get('/health');
      expect(response.headers['content-type']).toBeDefined();
    });

    it('OPTIONS 预检请求应能正确响应', async () => {
      try {
        const response = await httpClient.options('/health');
        // OPTIONS 请求应返回成功
        expect([200, 204]).toContain(response.status);
      } catch (error) {
        // 某些配置可能不支持 OPTIONS
        const axiosError = error as AxiosError;
        expect(axiosError.response?.status).not.toBe(500);
      }
    });
  });
});

// ==================== 辅助函数 ====================

/**
 * 检查中间件是否可用
 */
async function isMiddlewareAvailable(): Promise<boolean> {
  try {
    const response = await axios.get(`${MIDDLEWARE_BASE_URL}/health`, { timeout: 5000 });
    return response.data?.status === 'healthy';
  } catch {
    return false;
  }
}

// 在所有测试开始前检查中间件可用性
beforeAll(async () => {
  const available = await isMiddlewareAvailable();
  if (!available) {
    console.warn('\n⚠️  警告: C++ 中间件不可用。请确保中间件运行在 http://localhost:8083');
    console.warn('   运行命令: cd ../MT5-middleware && ./build/bin/MT5_Middleware\n');
  }
});
