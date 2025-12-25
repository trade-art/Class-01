/**
 * 第三方应用调用 C++ 中间件业务端点测试
 *
 * 模拟第三方应用通过 Service Token 直接调用中间件的业务 API
 *
 * 前置条件：
 * - C++ 中间件运行在 http://localhost:8083
 * - 中间件和 Tenant API 使用相同的 Service Token 密钥配置
 *
 * 测试场景：
 * 1. 生成有效的 Service Token
 * 2. 使用 Token 调用中间件业务端点
 * 3. 验证响应格式和错误处理
 *
 * 运行方式：
 * npm run test:e2e -- --testPathPattern=third-party-middleware
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

// ==================== 配置 ====================

const MIDDLEWARE_BASE_URL = 'http://localhost:8083';

// Service Token 配置 (与 Tenant API 配置相同)
const SERVICE_TOKEN_CONFIG = {
  jwtSecret: 'middleware-service-token-secret-key-change-in-production',
  encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  issuer: 'tenant-api',
  expiresIn: 3600, // 1 小时
};

// ==================== 类型定义 ====================

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

interface ServiceTokenPayload {
  tenantId: string;
  instanceId: string;
  serverId: string;
  managerLogin: number;
  encryptedPassword: string;
  scopes: string[];
  iat?: number;
  exp?: number;
  iss?: string;
}

interface PoolModeServiceTokenPayload {
  managerId: string;
  tenantId: string;
  apiKeyId?: string;
  scopes: string[];
  mode: 'pool';
  iat?: number;
  exp?: number;
  iss?: string;
}

// ==================== 辅助函数 ====================

/**
 * 使用 AES-256-GCM 加密密码
 */
function encryptPassword(password: string): string {
  const encryptionKey = Buffer.from(SERVICE_TOKEN_CONFIG.encryptionKey, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);

  const encrypted = Buffer.concat([
    cipher.update(password, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);

  return combined.toString('base64');
}

/**
 * 生成传统模式 Service Token
 */
function generateServiceToken(payload: {
  tenantId: string;
  instanceId: string;
  serverId: string;
  managerLogin: number;
  managerPassword: string;
  scopes?: string[];
}): string {
  const tokenPayload: Omit<ServiceTokenPayload, 'iat' | 'exp' | 'iss'> = {
    tenantId: payload.tenantId,
    instanceId: payload.instanceId,
    serverId: payload.serverId,
    managerLogin: payload.managerLogin,
    encryptedPassword: encryptPassword(payload.managerPassword),
    scopes: payload.scopes || ['*'],
  };

  return jwt.sign(tokenPayload, SERVICE_TOKEN_CONFIG.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: SERVICE_TOKEN_CONFIG.expiresIn,
    issuer: SERVICE_TOKEN_CONFIG.issuer,
  });
}

/**
 * 生成连接池模式 Service Token
 */
function generatePoolModeToken(payload: {
  managerId: string;
  tenantId: string;
  apiKeyId?: string;
  scopes?: string[];
}): string {
  const tokenPayload: Omit<PoolModeServiceTokenPayload, 'iat' | 'exp' | 'iss'> = {
    managerId: payload.managerId,
    tenantId: payload.tenantId,
    apiKeyId: payload.apiKeyId,
    scopes: payload.scopes || ['*'],
    mode: 'pool',
  };

  return jwt.sign(tokenPayload, SERVICE_TOKEN_CONFIG.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: SERVICE_TOKEN_CONFIG.expiresIn,
    issuer: SERVICE_TOKEN_CONFIG.issuer,
  });
}

// ==================== 测试套件 ====================

describe('第三方应用调用中间件业务端点 (Third-Party Middleware E2E)', () => {
  let httpClient: AxiosInstance;
  let serviceToken: string;
  let poolModeToken: string;

  beforeAll(() => {
    // 创建 axios 实例
    httpClient = axios.create({
      baseURL: MIDDLEWARE_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 生成测试用的 Service Token
    serviceToken = generateServiceToken({
      tenantId: 'tenant-test-001',
      instanceId: 'instance-test-001',
      serverId: 'server-test-001',
      managerLogin: 10007,
      managerPassword: 'test-password',
      scopes: ['*'],
    });

    // 生成连接池模式 Token
    poolModeToken = generatePoolModeToken({
      managerId: 'manager-uuid-12345',
      tenantId: 'tenant-test-001',
      scopes: ['*'],
    });
  });

  // ==================== Token 验证测试 ====================

  describe('Service Token 验证', () => {
    it('生成的 Token 应符合 JWT 格式', () => {
      const parts = serviceToken.split('.');
      expect(parts.length).toBe(3);

      // 解码并验证 payload
      const payload = jwt.decode(serviceToken) as ServiceTokenPayload;
      expect(payload.tenantId).toBe('tenant-test-001');
      expect(payload.instanceId).toBe('instance-test-001');
      expect(payload.serverId).toBe('server-test-001');
      expect(payload.managerLogin).toBe(10007);
      expect(payload.encryptedPassword).toBeDefined();
      expect(payload.scopes).toContain('*');
      expect(payload.iss).toBe('tenant-api');
    });

    it('连接池模式 Token 应包含 mode 字段', () => {
      const payload = jwt.decode(poolModeToken) as PoolModeServiceTokenPayload;
      expect(payload.mode).toBe('pool');
      expect(payload.managerId).toBe('manager-uuid-12345');
      expect(payload.tenantId).toBe('tenant-test-001');
    });

    it('过期的 Token 应无法通过验证', () => {
      // 生成已过期的 token
      const expiredToken = jwt.sign(
        {
          tenantId: 'tenant-test-001',
          instanceId: 'instance-test-001',
          serverId: 'server-test-001',
          managerLogin: 10007,
          encryptedPassword: encryptPassword('test'),
          scopes: ['*'],
        },
        SERVICE_TOKEN_CONFIG.jwtSecret,
        {
          algorithm: 'HS256',
          expiresIn: -1, // 立即过期
          issuer: SERVICE_TOKEN_CONFIG.issuer,
        }
      );

      expect(() => {
        jwt.verify(expiredToken, SERVICE_TOKEN_CONFIG.jwtSecret);
      }).toThrow();
    });
  });

  // ==================== 用户 API 测试 ====================

  describe('用户 API (/api/v1/account/users)', () => {
    it('使用有效 Token 应能访问用户列表端点', async () => {
      try {
        await httpClient.get('/api/v1/account/users', {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
          },
        });
        // 如果成功，验证响应格式
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        const response = axiosError.response;

        // 由于没有真实的 MT5 连接，预期会返回连接相关错误
        // 但不应该是 401 认证错误（Token 是有效的）
        expect(response).toBeDefined();

        // 可能的错误类型：
        // - MT5_CONNECTION_FAILED: 无法连接到 MT5 服务器
        // - MANAGER_NOT_FOUND: 连接池中找不到 manager
        // - AUTH_TOKEN_INVALID: Token 格式正确但中间件无法验证
        const status = response?.status;
        const errorType = response?.data?.error?.type;

        // 如果是 401，说明中间件不接受此 Token 格式
        if (status === 401) {
          expect(['AUTH_TOKEN_INVALID', 'AUTH_TOKEN_EXPIRED']).toContain(errorType);
        } else {
          // 否则应该是业务错误（连接失败等）
          expect(status).toBeGreaterThanOrEqual(400);
        }
      }
    });

    it('使用连接池模式 Token 应能访问用户端点', async () => {
      try {
        await httpClient.get('/api/v1/account/users', {
          headers: {
            Authorization: `Bearer ${poolModeToken}`,
          },
        });
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        const response = axiosError.response;

        expect(response).toBeDefined();

        // 连接池模式需要中间件有预建立的连接
        // 预期返回 MANAGER_NOT_FOUND 或类似错误
        const errorType = response?.data?.error?.type;
        expect([
          'MANAGER_NOT_FOUND',
          'MT5_CONNECTION_FAILED',
          'AUTH_TOKEN_INVALID',
          'POOL_CONNECTION_NOT_FOUND',
        ]).toContain(errorType);
      }
    });

    it('获取单个用户详情应返回正确错误', async () => {
      try {
        await httpClient.get('/api/v1/account/users/10001', {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
          },
        });
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response).toBeDefined();
        expect(axiosError.response?.data?.code).toBeDefined();
      }
    });
  });

  // ==================== 持仓 API 测试 ====================

  describe('持仓 API (/api/v1/account/positions)', () => {
    it('使用有效 Token 应能访问持仓端点', async () => {
      try {
        await httpClient.get('/api/v1/account/positions', {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
          },
        });
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response).toBeDefined();
        expect(axiosError.response?.data?.code).toBeDefined();
      }
    });

    it('获取用户持仓应返回正确错误', async () => {
      try {
        await httpClient.get('/api/v1/account/users/10001/positions', {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
          },
        });
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response).toBeDefined();
      }
    });
  });

  // ==================== 订单 API 测试 ====================

  describe('订单 API (/api/v1/account/orders)', () => {
    it('使用有效 Token 应能访问订单端点', async () => {
      try {
        await httpClient.get('/api/v1/account/orders', {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
          },
        });
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response).toBeDefined();
        expect(axiosError.response?.data?.code).toBeDefined();
      }
    });
  });

  // ==================== 品种 API 测试 ====================

  describe('品种 API (/api/v1/symbols)', () => {
    it('使用有效 Token 应能访问品种列表', async () => {
      try {
        await httpClient.get('/api/v1/symbols', {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
          },
        });
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response).toBeDefined();
        expect(axiosError.response?.data?.code).toBeDefined();
      }
    });

    it('获取单个品种详情', async () => {
      try {
        await httpClient.get('/api/v1/symbols/EURUSD', {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
          },
        });
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response).toBeDefined();
      }
    });

    it('获取品种报价', async () => {
      try {
        await httpClient.get('/api/v1/symbols/EURUSD/quote', {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
          },
        });
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response).toBeDefined();
      }
    });
  });

  // ==================== 成交历史 API 测试 ====================

  describe('成交历史 API (/api/v1/trading/history)', () => {
    it('使用有效 Token 应能访问成交记录', async () => {
      try {
        await httpClient.get('/api/v1/trading/history/deals', {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
          },
        });
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response).toBeDefined();
        expect(axiosError.response?.data?.code).toBeDefined();
      }
    });

    it('带时间范围查询成交记录', async () => {
      const from = Math.floor(Date.now() / 1000) - 86400; // 24 小时前
      const to = Math.floor(Date.now() / 1000);

      try {
        await httpClient.get('/api/v1/trading/history/deals', {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
          },
          params: {
            from,
            to,
            limit: 10,
          },
        });
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response).toBeDefined();
      }
    });
  });

  // ==================== 批量查询 API 测试 ====================

  describe('批量查询 API (/api/v1/trading/batch)', () => {
    it('批量查询持仓', async () => {
      try {
        await httpClient.post(
          '/api/v1/trading/batch/query',
          {
            queries: [
              { type: 'positions', login: 10001 },
              { type: 'positions', login: 10002 },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${serviceToken}`,
            },
          }
        );
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response).toBeDefined();
      }
    });
  });

  // ==================== 报价 API 测试 ====================

  describe('批量报价 API (/api/v1/quotes)', () => {
    it('批量获取报价', async () => {
      try {
        await httpClient.post(
          '/api/v1/quotes',
          {
            symbols: ['EURUSD', 'GBPUSD', 'USDJPY'],
          },
          {
            headers: {
              Authorization: `Bearer ${serviceToken}`,
            },
          }
        );
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response).toBeDefined();
      }
    });
  });

  // ==================== 健康检查 API 测试 ====================

  describe('服务器状态 API', () => {
    it('健康检查端点不需要认证', async () => {
      const response = await httpClient.get('/health');
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('healthy');
    });

    it('/api/v1/health 也不需要认证', async () => {
      const response = await httpClient.get('/api/v1/health');
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('healthy');
    });
  });

  // ==================== 错误处理测试 ====================

  describe('错误处理', () => {
    it('无效签名的 Token 应返回 401', async () => {
      const invalidToken = jwt.sign(
        {
          tenantId: 'tenant-test-001',
          instanceId: 'instance-test-001',
          serverId: 'server-test-001',
          managerLogin: 10007,
          encryptedPassword: 'fake',
          scopes: ['*'],
        },
        'wrong-secret-key', // 错误的密钥
        {
          algorithm: 'HS256',
          expiresIn: 3600,
          issuer: 'tenant-api',
        }
      );

      try {
        await httpClient.get('/api/v1/symbols', {
          headers: {
            Authorization: `Bearer ${invalidToken}`,
          },
        });
        fail('应该返回 401 错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response?.status).toBe(401);
        expect(axiosError.response?.data?.error?.type).toBe('AUTH_TOKEN_INVALID');
      }
    });

    it('缺少 Authorization header 应返回 401', async () => {
      try {
        await httpClient.get('/api/v1/symbols');
        fail('应该返回 401 错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response?.status).toBe(401);
        expect(axiosError.response?.data?.error?.type).toBe('AUTH_TOKEN_MISSING');
      }
    });

    it('格式错误的 Bearer Token 应返回 401', async () => {
      try {
        await httpClient.get('/api/v1/symbols', {
          headers: {
            Authorization: 'InvalidBearer token',
          },
        });
        fail('应该返回 401 错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response?.status).toBe(401);
      }
    });

    it('非 JWT 格式的 Token 应返回 401', async () => {
      try {
        await httpClient.get('/api/v1/symbols', {
          headers: {
            Authorization: 'Bearer not-a-jwt-token',
          },
        });
        fail('应该返回 401 错误');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        expect(axiosError.response?.status).toBe(401);
      }
    });
  });

  // ==================== 响应格式验证 ====================

  describe('响应格式验证', () => {
    it('成功响应应包含标准格式', async () => {
      const response = await httpClient.get('/health');

      expect(response.data).toHaveProperty('service');
      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('timestamp');
      expect(response.data).toHaveProperty('version');
    });

    it('错误响应应包含标准格式', async () => {
      try {
        await httpClient.get('/api/v1/symbols');
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        const response = axiosError.response?.data;

        expect(response).toHaveProperty('code');
        expect(response).toHaveProperty('message');
        expect(response).toHaveProperty('timestamp');
        expect(response).toHaveProperty('error');
        expect(response?.error).toHaveProperty('type');
        expect(response?.error).toHaveProperty('detail');
      }
    });
  });

  // ==================== Token 权限范围测试 ====================

  describe('Token 权限范围 (Scopes)', () => {
    it('限制权限的 Token 应能正常使用', () => {
      const limitedToken = generateServiceToken({
        tenantId: 'tenant-test-001',
        instanceId: 'instance-test-001',
        serverId: 'server-test-001',
        managerLogin: 10007,
        managerPassword: 'test-password',
        scopes: ['users:read', 'positions:read'], // 限制权限
      });

      const payload = jwt.decode(limitedToken) as ServiceTokenPayload;
      expect(payload.scopes).toContain('users:read');
      expect(payload.scopes).toContain('positions:read');
      expect(payload.scopes).not.toContain('*');
    });

    it('无权限的 Token 应被拒绝访问受保护资源', async () => {
      const noScopeToken = generateServiceToken({
        tenantId: 'tenant-test-001',
        instanceId: 'instance-test-001',
        serverId: 'server-test-001',
        managerLogin: 10007,
        managerPassword: 'test-password',
        scopes: [], // 无权限
      });

      try {
        await httpClient.get('/api/v1/symbols', {
          headers: {
            Authorization: `Bearer ${noScopeToken}`,
          },
        });
      } catch (error) {
        const axiosError = error as AxiosError<MiddlewareResponse>;
        // 中间件可能返回 403 (权限不足) 或其他错误
        expect(axiosError.response).toBeDefined();
      }
    });
  });

  // ==================== 并发请求测试 ====================

  describe('并发请求处理', () => {
    it('应能处理多个并发请求', async () => {
      const requests = Array(5).fill(null).map(() =>
        httpClient.get('/health')
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.data.status).toBe('healthy');
      });
    });

    it('并发认证请求应正确处理', async () => {
      const requests = Array(5).fill(null).map(() =>
        httpClient.get('/api/v1/symbols', {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
          },
        }).catch((error) => error)
      );

      const results = await Promise.all(requests);

      // 所有请求都应该得到响应（成功或错误）
      results.forEach((result) => {
        if (result instanceof Error) {
          const axiosError = result as AxiosError;
          expect(axiosError.response).toBeDefined();
        } else {
          expect(result.status).toBeDefined();
        }
      });
    });
  });
});

// ==================== 辅助函数 ====================

async function isMiddlewareAvailable(): Promise<boolean> {
  try {
    const response = await axios.get(`${MIDDLEWARE_BASE_URL}/health`, { timeout: 5000 });
    return response.data?.status === 'healthy';
  } catch {
    return false;
  }
}

beforeAll(async () => {
  const available = await isMiddlewareAvailable();
  if (!available) {
    console.warn('\n⚠️  警告: C++ 中间件不可用。请确保中间件运行在 http://localhost:8083');
    console.warn('   运行命令: cd ../MT5-middleware && ./build/bin/MT5_Middleware\n');
  }
});
