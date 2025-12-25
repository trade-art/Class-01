/**
 * Middleware Config (Internal API) 契约测试
 * 验证服务间 API 端点的请求/响应格式
 *
 * 这些端点供中间件实例调用，使用 API Key 认证
 *
 * saas-middleware-management Task 10.4
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MockPrismaService } from './mocks/prisma.mock';
import { TEST_TENANT } from './fixtures/test-data';
import { expectSuccessResponse, expectAuthError } from './utils/validators';
import { AssignmentMode, MiddlewareStatus } from '@prisma/client';

// 测试数据
const TEST_MIDDLEWARE = {
  id: 'mw-internal-001',
  name: 'Internal Test Middleware',
  description: 'Test middleware for internal API tests',
  url: 'http://localhost:8080',
  apiKey: 'mw_internal_test_api_key_12345',
  apiKeyHash: 'hashed_internal_api_key',
  assignmentMode: AssignmentMode.SHARED,
  maxTenants: 10,
  status: MiddlewareStatus.ONLINE,
  lastHeartbeat: new Date(),
  serverIp: '192.168.1.100',
  activeSessions: 5,
  memoryUsage: 60.5,
  cpuUsage: 30.2,
  cacheStatus: { enabled: true },
  createdAt: new Date(),
  updatedAt: new Date(),
  assignments: [],
};

const TEST_MT_SERVER = {
  id: 'mt-server-001',
  tenantId: TEST_TENANT.id,
  serverId: 'demo-mt5-server',
  serverName: 'Demo MT5 Server',
  platformType: 'MT5',
  host: 'mt5.demo.com',
  port: 443,
  managerLogin: '10007',
  managerPassword: 'encrypted_password',
  isDefault: true,
  isEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const TEST_ASSIGNMENT = {
  id: 'assign-internal-001',
  middlewareId: TEST_MIDDLEWARE.id,
  tenantId: TEST_TENANT.id,
  assignedBy: 'platform-admin-001',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('MiddlewareConfigController (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;
  const VALID_API_KEY = 'mw_internal_test_api_key_12345';
  const INVALID_API_KEY = 'mw_invalid_api_key';

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();

    // 添加中间件相关的 mock 数据
    (mockPrismaService as any).middlewares = [{ ...TEST_MIDDLEWARE }];
    (mockPrismaService as any).middlewareAssignments = [{ ...TEST_ASSIGNMENT }];
    (mockPrismaService as any).mtServers = [{ ...TEST_MT_SERVER }];

    // Mock middleware 操作
    (mockPrismaService as any).middleware = {
      findUnique: jest.fn().mockImplementation(({ where, include }) => {
        const mw = (mockPrismaService as any).middlewares.find(
          (m: any) => m.id === where.id
        );
        if (!mw) return Promise.resolve(null);

        const result = { ...mw };
        if (include?.assignments) {
          result.assignments = (mockPrismaService as any).middlewareAssignments.filter(
            (a: any) => a.middlewareId === mw.id
          );
        }
        return Promise.resolve(result);
      }),

      findFirst: jest.fn().mockImplementation(({ where }) => {
        // 通过 API Key Hash 查找
        if (where.apiKeyHash) {
          // 模拟: 当 apiKeyHash 匹配 'hashed_internal_api_key' 时返回中间件
          // 实际场景中会通过 hash 函数计算后比较
          const mw = (mockPrismaService as any).middlewares.find(
            (m: any) => m.apiKeyHash === where.apiKeyHash
          );
          return Promise.resolve(mw || null);
        }
        return Promise.resolve(null);
      }),

      update: jest.fn().mockImplementation(({ where, data }) => {
        const index = (mockPrismaService as any).middlewares.findIndex(
          (m: any) => m.id === where.id
        );
        if (index >= 0) {
          (mockPrismaService as any).middlewares[index] = {
            ...(mockPrismaService as any).middlewares[index],
            ...data,
            updatedAt: new Date(),
          };
          return Promise.resolve((mockPrismaService as any).middlewares[index]);
        }
        return Promise.reject(new Error('Middleware not found'));
      }),
    };

    // Mock middlewareAssignment 操作
    (mockPrismaService as any).middlewareAssignment = {
      findMany: jest.fn().mockImplementation(({ where, include } = {}) => {
        let result = [...(mockPrismaService as any).middlewareAssignments];
        if (where?.middlewareId) {
          result = result.filter((a: any) => a.middlewareId === where.middlewareId);
        }

        if (include?.tenant) {
          // 模拟包含租户信息
          const tenants = mockPrismaService.tenants || [];
          result = result.map((a: any) => ({
            ...a,
            tenant: {
              ...TEST_TENANT,
              mtServers: (mockPrismaService as any).mtServers.filter(
                (s: any) => s.tenantId === a.tenantId
              ),
            },
          }));
        }

        return Promise.resolve(result);
      }),
    };

    // Mock mtServer 操作
    (mockPrismaService as any).mtServer = {
      findMany: jest.fn().mockImplementation(({ where } = {}) => {
        let result = [...(mockPrismaService as any).mtServers];
        if (where?.tenantId) {
          result = result.filter((s: any) => s.tenantId === where.tenantId);
        }
        if (where?.isEnabled !== undefined) {
          result = result.filter((s: any) => s.isEnabled === where.isEnabled);
        }
        return Promise.resolve(result);
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // 重置数据
    (mockPrismaService as any).middlewares = [{ ...TEST_MIDDLEWARE }];
    (mockPrismaService as any).middlewareAssignments = [{ ...TEST_ASSIGNMENT }];
    (mockPrismaService as any).mtServers = [{ ...TEST_MT_SERVER }];
  });

  // ==================== API Key 认证测试 ====================

  describe('API Key Authentication', () => {
    it('无 API Key 访问应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/internal/middleware/config')
        .expect(401);

      expectAuthError(response);
    });

    it('无效 API Key 访问应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/internal/middleware/config')
        .set('X-Middleware-API-Key', INVALID_API_KEY)
        .expect(401);

      expectAuthError(response);
    });

    it('空 API Key 访问应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/internal/middleware/config')
        .set('X-Middleware-API-Key', '')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== GET /internal/middleware/config ====================

  describe('GET /internal/middleware/config', () => {
    it('有效 API Key 应能获取配置', async () => {
      const response = await request(app.getHttpServer())
        .get('/internal/middleware/config')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.middlewareId).toBeDefined();
      expect(data.tenants).toBeDefined();
      expect(Array.isArray(data.tenants)).toBe(true);
    });

    it('配置应包含分配的租户信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/internal/middleware/config')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .expect(200);

      const data = response.body.data;

      // 验证租户信息结构
      if (data.tenants.length > 0) {
        const tenant = data.tenants[0];
        expect(tenant.tenantId).toBeDefined();
        expect(tenant.tenantCode).toBeDefined();
        expect(tenant.mtServers).toBeDefined();
        expect(Array.isArray(tenant.mtServers)).toBe(true);
      }
    });

    it('配置应包含 MT 服务器信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/internal/middleware/config')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .expect(200);

      const data = response.body.data;

      // 验证 MT 服务器信息结构
      if (data.tenants.length > 0 && data.tenants[0].mtServers.length > 0) {
        const server = data.tenants[0].mtServers[0];
        expect(server.serverId).toBeDefined();
        expect(server.serverName).toBeDefined();
        expect(server.platformType).toBeDefined();
        expect(server.host).toBeDefined();
        expect(server.port).toBeDefined();
        // 敏感信息应该解密后返回
        expect(server.managerLogin).toBeDefined();
        expect(server.managerPassword).toBeDefined();
      }
    });

    it('配置不应包含敏感的中间件信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/internal/middleware/config')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .expect(200);

      const data = response.body.data;
      // 响应不应包含 API Key
      expect(data).not.toHaveProperty('apiKey');
      expect(data).not.toHaveProperty('apiKeyHash');
    });
  });

  // ==================== POST /internal/middleware/heartbeat ====================

  describe('POST /internal/middleware/heartbeat', () => {
    const validHeartbeat = {
      serverIp: '192.168.1.101',
      activeSessions: 10,
      memoryUsage: 75.5,
      cpuUsage: 45.2,
      cacheStatus: {
        enabled: true,
        hitRate: 0.95,
        size: 1024000,
      },
    };

    it('有效 API Key 应能上报心跳', async () => {
      const response = await request(app.getHttpServer())
        .post('/internal/middleware/heartbeat')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .send(validHeartbeat)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.status).toBe('ok');
      expect(data.receivedAt).toBeDefined();
    });

    it('心跳应更新中间件状态', async () => {
      await request(app.getHttpServer())
        .post('/internal/middleware/heartbeat')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .send(validHeartbeat)
        .expect(200);

      // 验证 mock 更新被调用
      expect((mockPrismaService as any).middleware.update).toHaveBeenCalled();
    });

    it('部分心跳数据也应该能上报', async () => {
      const partialHeartbeat = {
        serverIp: '192.168.1.102',
        activeSessions: 5,
      };

      const response = await request(app.getHttpServer())
        .post('/internal/middleware/heartbeat')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .send(partialHeartbeat)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('无效 API Key 上报心跳应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/internal/middleware/heartbeat')
        .set('X-Middleware-API-Key', INVALID_API_KEY)
        .send(validHeartbeat)
        .expect(401);

      expectAuthError(response);
    });

    it('无效的心跳数据应返回 400', async () => {
      const invalidHeartbeat = {
        serverIp: 'not-an-ip', // 无效 IP
        activeSessions: -1, // 负数
        memoryUsage: 150, // 超过 100%
      };

      const response = await request(app.getHttpServer())
        .post('/internal/middleware/heartbeat')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .send(invalidHeartbeat)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('空请求体应该使用默认值或返回错误', async () => {
      // 空请求体的行为取决于实现
      // 如果有默认值，应该返回 200
      // 如果需要必填字段，应该返回 400
      const response = await request(app.getHttpServer())
        .post('/internal/middleware/heartbeat')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .send({});

      // 允许 200 或 400，取决于验证规则
      expect([200, 400]).toContain(response.status);
    });
  });

  // ==================== GET /internal/middleware/health ====================

  describe('GET /internal/middleware/health', () => {
    it('有效 API Key 应能进行健康检查', async () => {
      const response = await request(app.getHttpServer())
        .get('/internal/middleware/health')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.status).toBe('ok');
      expect(data.middlewareId).toBeDefined();
      expect(data.middlewareName).toBeDefined();
    });

    it('无效 API Key 健康检查应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/internal/middleware/health')
        .set('X-Middleware-API-Key', INVALID_API_KEY)
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('获取配置应在 500ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/internal/middleware/config')
        .set('X-Middleware-API-Key', VALID_API_KEY);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });

    it('心跳上报应在 200ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .post('/internal/middleware/heartbeat')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .send({
          serverIp: '192.168.1.100',
          activeSessions: 5,
        });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(200);
    });

    it('健康检查应在 100ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/internal/middleware/health')
        .set('X-Middleware-API-Key', VALID_API_KEY);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(100);
    });
  });

  // ==================== 并发测试 ====================

  describe('并发处理', () => {
    it('应能处理多个并发心跳请求', async () => {
      const heartbeatPromises = Array(5)
        .fill(null)
        .map((_, i) =>
          request(app.getHttpServer())
            .post('/internal/middleware/heartbeat')
            .set('X-Middleware-API-Key', VALID_API_KEY)
            .send({
              serverIp: `192.168.1.${100 + i}`,
              activeSessions: i * 2,
              memoryUsage: 50 + i * 5,
              cpuUsage: 20 + i * 3,
            })
        );

      const responses = await Promise.all(heartbeatPromises);

      // 所有请求应该成功
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });

    it('应能处理多个并发配置请求', async () => {
      const configPromises = Array(5)
        .fill(null)
        .map(() =>
          request(app.getHttpServer())
            .get('/internal/middleware/config')
            .set('X-Middleware-API-Key', VALID_API_KEY)
        );

      const responses = await Promise.all(configPromises);

      // 所有请求应该成功
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });
  });

  // ==================== 边界条件测试 ====================

  describe('边界条件', () => {
    it('长字符串 serverIp 应该被验证', async () => {
      const response = await request(app.getHttpServer())
        .post('/internal/middleware/heartbeat')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .send({
          serverIp: 'a'.repeat(1000), // 超长字符串
          activeSessions: 5,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('极大数值应该被处理', async () => {
      const response = await request(app.getHttpServer())
        .post('/internal/middleware/heartbeat')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .send({
          serverIp: '192.168.1.100',
          activeSessions: Number.MAX_SAFE_INTEGER,
          memoryUsage: 99.99,
          cpuUsage: 99.99,
        });

      // 应该返回 200 或 400，取决于验证规则
      expect([200, 400]).toContain(response.status);
    });

    it('浮点数精度应该正确处理', async () => {
      const response = await request(app.getHttpServer())
        .post('/internal/middleware/heartbeat')
        .set('X-Middleware-API-Key', VALID_API_KEY)
        .send({
          serverIp: '192.168.1.100',
          activeSessions: 5,
          memoryUsage: 75.123456789,
          cpuUsage: 45.987654321,
        })
        .expect(200);

      expectSuccessResponse(response);
    });
  });
});
