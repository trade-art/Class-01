/**
 * Middleware 模块 API 契约测试
 * 验证中间件管理端点的请求/响应格式
 *
 * saas-middleware-management Task 10.3
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MockPrismaService } from './mocks/prisma.mock';
import { TEST_TOKENS, TEST_TENANT } from './fixtures/test-data';
import {
  expectSuccessResponse,
  expectErrorResponse,
  expectAuthError,
  expectForbiddenError,
  expectNotFoundError,
  expectConflictError,
} from './utils/validators';
import { AssignmentMode, MiddlewareStatus } from '@prisma/client';

// 测试数据
const TEST_MIDDLEWARE = {
  id: 'mw-test-001',
  name: 'Test Middleware',
  description: 'Test middleware for E2E tests',
  url: 'http://localhost:8080',
  apiKey: 'mw_test_api_key_12345',
  apiKeyHash: 'hashed_api_key',
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

const TEST_MIDDLEWARE_DEDICATED = {
  ...TEST_MIDDLEWARE,
  id: 'mw-test-002',
  name: 'Dedicated Middleware',
  url: 'http://localhost:8081',
  assignmentMode: AssignmentMode.DEDICATED,
  maxTenants: 1,
};

const TEST_MIDDLEWARE_OFFLINE = {
  ...TEST_MIDDLEWARE,
  id: 'mw-test-003',
  name: 'Offline Middleware',
  url: 'http://localhost:8082',
  status: MiddlewareStatus.OFFLINE,
};

describe('MiddlewareController (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();

    // 添加中间件相关的 mock
    (mockPrismaService as any).middlewares = [
      TEST_MIDDLEWARE,
      TEST_MIDDLEWARE_DEDICATED,
      TEST_MIDDLEWARE_OFFLINE,
    ];

    (mockPrismaService as any).middlewareAssignments = [];

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
        if (where.url) {
          return Promise.resolve(
            (mockPrismaService as any).middlewares.find(
              (m: any) => m.url === where.url
            ) || null
          );
        }
        if (where.apiKeyHash) {
          return Promise.resolve(
            (mockPrismaService as any).middlewares.find(
              (m: any) => m.apiKeyHash === where.apiKeyHash
            ) || null
          );
        }
        return Promise.resolve(null);
      }),

      findMany: jest.fn().mockImplementation(({ where, include } = {}) => {
        let result = [...(mockPrismaService as any).middlewares];

        if (where?.status) {
          result = result.filter((m: any) => m.status === where.status);
        }
        if (where?.assignmentMode) {
          result = result.filter(
            (m: any) => m.assignmentMode === where.assignmentMode
          );
        }
        if (where?.OR) {
          result = result.filter((m: any) =>
            where.OR.some((condition: any) => {
              if (condition.name?.contains) {
                return m.name
                  .toLowerCase()
                  .includes(condition.name.contains.toLowerCase());
              }
              if (condition.url?.contains) {
                return m.url
                  .toLowerCase()
                  .includes(condition.url.contains.toLowerCase());
              }
              return false;
            })
          );
        }

        if (include?.assignments) {
          result = result.map((mw: any) => ({
            ...mw,
            assignments: (mockPrismaService as any).middlewareAssignments.filter(
              (a: any) => a.middlewareId === mw.id
            ),
          }));
        }

        return Promise.resolve(result);
      }),

      create: jest.fn().mockImplementation(({ data }) => {
        const newMw = {
          id: `mw-${Date.now()}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          assignments: [],
        };
        (mockPrismaService as any).middlewares.push(newMw);
        return Promise.resolve(newMw);
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

      delete: jest.fn().mockImplementation(({ where }) => {
        const index = (mockPrismaService as any).middlewares.findIndex(
          (m: any) => m.id === where.id
        );
        if (index >= 0) {
          const deleted = (mockPrismaService as any).middlewares.splice(index, 1)[0];
          return Promise.resolve(deleted);
        }
        return Promise.reject(new Error('Middleware not found'));
      }),
    };

    // Mock middlewareAssignment 操作
    (mockPrismaService as any).middlewareAssignment = {
      count: jest.fn().mockImplementation(({ where } = {}) => {
        let result = (mockPrismaService as any).middlewareAssignments;
        if (where?.middlewareId) {
          result = result.filter((a: any) => a.middlewareId === where.middlewareId);
        }
        return Promise.resolve(result.length);
      }),

      findMany: jest.fn().mockImplementation(({ where, include } = {}) => {
        let result = [...(mockPrismaService as any).middlewareAssignments];
        if (where?.middlewareId) {
          result = result.filter((a: any) => a.middlewareId === where.middlewareId);
        }
        if (where?.tenantId) {
          result = result.filter((a: any) => a.tenantId === where.tenantId);
        }
        return Promise.resolve(result);
      }),

      findFirst: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          (mockPrismaService as any).middlewareAssignments.find((a: any) => {
            if (where.middlewareId && where.tenantId) {
              return (
                a.middlewareId === where.middlewareId &&
                a.tenantId === where.tenantId
              );
            }
            if (where.tenantId) {
              return a.tenantId === where.tenantId;
            }
            return false;
          }) || null
        );
      }),

      create: jest.fn().mockImplementation(({ data }) => {
        const newAssignment = {
          id: `assign-${Date.now()}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        (mockPrismaService as any).middlewareAssignments.push(newAssignment);
        return Promise.resolve(newAssignment);
      }),

      delete: jest.fn().mockImplementation(({ where }) => {
        const index = (mockPrismaService as any).middlewareAssignments.findIndex(
          (a: any) =>
            a.middlewareId === where.middlewareId_tenantId?.middlewareId &&
            a.tenantId === where.middlewareId_tenantId?.tenantId
        );
        if (index >= 0) {
          const deleted = (mockPrismaService as any).middlewareAssignments.splice(
            index,
            1
          )[0];
          return Promise.resolve(deleted);
        }
        return Promise.reject(new Error('Assignment not found'));
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
    // 重置中间件数据
    (mockPrismaService as any).middlewares = [
      { ...TEST_MIDDLEWARE },
      { ...TEST_MIDDLEWARE_DEDICATED },
      { ...TEST_MIDDLEWARE_OFFLINE },
    ];
    (mockPrismaService as any).middlewareAssignments = [];
    mockPrismaService.resetMocks();
  });

  // ==================== 权限测试 ====================

  describe('Authorization', () => {
    it('无 Token 访问应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/middlewares')
        .expect(401);

      expectAuthError(response);
    });

    it('无效 Token 访问应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/middlewares')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectAuthError(response);
    });

    it('Tenant Admin 访问应返回 403', async () => {
      const response = await request(app.getHttpServer())
        .get('/middlewares')
        .set('Authorization', `Bearer ${TEST_TOKENS.tenantAdmin}`)
        .expect(403);

      expectForbiddenError(response);
    });

    it('过期 Token 访问应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/middlewares')
        .set('Authorization', `Bearer ${TEST_TOKENS.expired}`)
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== GET /middlewares ====================

  describe('GET /middlewares', () => {
    it('Platform Super Admin 应能获取中间件列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/middlewares')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('Platform Admin 应能获取中间件列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/middlewares')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('应支持按状态筛选', async () => {
      const response = await request(app.getHttpServer())
        .get('/middlewares?status=ONLINE')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('应支持按分配模式筛选', async () => {
      const response = await request(app.getHttpServer())
        .get('/middlewares?assignmentMode=SHARED')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('应支持搜索功能', async () => {
      const response = await request(app.getHttpServer())
        .get('/middlewares?search=test')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });
  });

  // ==================== GET /middlewares/:id ====================

  describe('GET /middlewares/:id', () => {
    it('应能获取中间件详情', async () => {
      const response = await request(app.getHttpServer())
        .get(`/middlewares/${TEST_MIDDLEWARE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.id).toBe(TEST_MIDDLEWARE.id);
      expect(data.name).toBe(TEST_MIDDLEWARE.name);
      expect(data.url).toBe(TEST_MIDDLEWARE.url);
      expect(data.status).toBe(TEST_MIDDLEWARE.status);
    });

    it('不存在的中间件应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/middlewares/nonexistent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('响应不应包含 apiKey 和 apiKeyHash', async () => {
      const response = await request(app.getHttpServer())
        .get(`/middlewares/${TEST_MIDDLEWARE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = response.body.data;
      expect(data).not.toHaveProperty('apiKey');
      expect(data).not.toHaveProperty('apiKeyHash');
    });
  });

  // ==================== POST /middlewares ====================

  describe('POST /middlewares', () => {
    const validMiddlewareData = {
      name: 'New Middleware',
      description: 'New middleware description',
      url: 'http://localhost:9090',
      assignmentMode: 'SHARED',
      maxTenants: 5,
    };

    it('Platform Super Admin 应能创建中间件', async () => {
      const response = await request(app.getHttpServer())
        .post('/middlewares')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(validMiddlewareData)
        .expect(201);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.name).toBe(validMiddlewareData.name);
      expect(data.url).toBe(validMiddlewareData.url);
      // 创建时应返回 apiKey
      expect(data.apiKey).toBeDefined();
      expect(data.apiKey).toMatch(/^mw_/);
    });

    it('缺少必填字段应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/middlewares')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          name: 'Incomplete Middleware',
          // 缺少 url
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无效的 URL 格式应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/middlewares')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...validMiddlewareData,
          url: 'invalid-url',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('重复的 URL 应返回 409', async () => {
      const response = await request(app.getHttpServer())
        .post('/middlewares')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...validMiddlewareData,
          url: TEST_MIDDLEWARE.url, // 已存在的 URL
        })
        .expect(409);

      expectConflictError(response);
    });

    it('无效的分配模式应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/middlewares')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...validMiddlewareData,
          assignmentMode: 'INVALID_MODE',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('DEDICATED 模式 maxTenants 必须为 1', async () => {
      const response = await request(app.getHttpServer())
        .post('/middlewares')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...validMiddlewareData,
          assignmentMode: 'DEDICATED',
          maxTenants: 5, // DEDICATED 模式下应该是 1
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== PUT /middlewares/:id ====================

  describe('PUT /middlewares/:id', () => {
    const updateData = {
      name: 'Updated Middleware',
      description: 'Updated description',
    };

    it('应能更新中间件信息', async () => {
      const response = await request(app.getHttpServer())
        .put(`/middlewares/${TEST_MIDDLEWARE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(updateData)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.name).toBe(updateData.name);
      expect(data.description).toBe(updateData.description);
    });

    it('不存在的中间件应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .put('/middlewares/nonexistent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(updateData)
        .expect(404);

      expectNotFoundError(response);
    });

    it('更新 URL 为已存在的值应返回 409', async () => {
      const response = await request(app.getHttpServer())
        .put(`/middlewares/${TEST_MIDDLEWARE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          url: TEST_MIDDLEWARE_DEDICATED.url, // 另一个中间件的 URL
        })
        .expect(409);

      expectConflictError(response);
    });
  });

  // ==================== DELETE /middlewares/:id ====================

  describe('DELETE /middlewares/:id', () => {
    it('应能删除无分配的中间件', async () => {
      await request(app.getHttpServer())
        .delete(`/middlewares/${TEST_MIDDLEWARE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(204);
    });

    it('不存在的中间件应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .delete('/middlewares/nonexistent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('有关联租户的中间件应返回 409', async () => {
      // 先创建分配关系
      (mockPrismaService as any).middlewareAssignments.push({
        id: 'assign-1',
        middlewareId: TEST_MIDDLEWARE.id,
        tenantId: TEST_TENANT.id,
        createdAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .delete(`/middlewares/${TEST_MIDDLEWARE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(409);

      expectConflictError(response);
    });
  });

  // ==================== POST /middlewares/:id/regenerate-api-key ====================

  describe('POST /middlewares/:id/regenerate-api-key', () => {
    it('应能重新生成 API Key', async () => {
      const response = await request(app.getHttpServer())
        .post(`/middlewares/${TEST_MIDDLEWARE.id}/regenerate-api-key`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.apiKey).toBeDefined();
      expect(data.apiKey).toMatch(/^mw_/);
      expect(data.message).toBeDefined();
    });

    it('不存在的中间件应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/middlewares/nonexistent-id/regenerate-api-key')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== POST /middlewares/:id/health-check ====================

  describe('POST /middlewares/:id/health-check', () => {
    it('应能触发健康检查', async () => {
      const response = await request(app.getHttpServer())
        .post(`/middlewares/${TEST_MIDDLEWARE.id}/health-check`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.status).toBeDefined();
      expect(data.message).toBeDefined();
    });

    it('不存在的中间件应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/middlewares/nonexistent-id/health-check')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== GET /middlewares/health/summary ====================

  describe('GET /middlewares/health/summary', () => {
    it('应能获取健康状态摘要', async () => {
      const response = await request(app.getHttpServer())
        .get('/middlewares/health/summary')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.total).toBeDefined();
      expect(typeof data.total).toBe('number');
      expect(data.online).toBeDefined();
      expect(data.offline).toBeDefined();
      expect(data.degraded).toBeDefined();
      expect(data.error).toBeDefined();
      expect(data.unknown).toBeDefined();
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('获取中间件列表应在 500ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/middlewares')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });

    it('获取中间件详情应在 200ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get(`/middlewares/${TEST_MIDDLEWARE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(200);
    });
  });
});

describe('MiddlewareAssignmentController (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();

    // 添加中间件相关的 mock
    (mockPrismaService as any).middlewares = [
      { ...TEST_MIDDLEWARE },
      { ...TEST_MIDDLEWARE_DEDICATED },
      { ...TEST_MIDDLEWARE_OFFLINE },
    ];

    (mockPrismaService as any).middlewareAssignments = [];

    // 设置 mock 方法 (与上面类似)
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

      findMany: jest.fn().mockImplementation(({ where, include } = {}) => {
        let result = [...(mockPrismaService as any).middlewares];

        if (include?.assignments) {
          result = result.map((mw: any) => ({
            ...mw,
            assignments: (mockPrismaService as any).middlewareAssignments.filter(
              (a: any) => a.middlewareId === mw.id
            ),
          }));
        }

        return Promise.resolve(result);
      }),
    };

    (mockPrismaService as any).middlewareAssignment = {
      count: jest.fn().mockImplementation(({ where } = {}) => {
        let result = (mockPrismaService as any).middlewareAssignments;
        if (where?.middlewareId) {
          result = result.filter((a: any) => a.middlewareId === where.middlewareId);
        }
        return Promise.resolve(result.length);
      }),

      findMany: jest.fn().mockImplementation(({ where, include } = {}) => {
        let result = [...(mockPrismaService as any).middlewareAssignments];
        if (where?.middlewareId) {
          result = result.filter((a: any) => a.middlewareId === where.middlewareId);
        }
        if (where?.tenantId) {
          result = result.filter((a: any) => a.tenantId === where.tenantId);
        }

        if (include?.tenant) {
          const tenants = (mockPrismaService as any).tenants || [];
          result = result.map((a: any) => ({
            ...a,
            tenant: tenants.find((t: any) => t.id === a.tenantId) || null,
          }));
        }
        if (include?.middleware) {
          result = result.map((a: any) => ({
            ...a,
            middleware: (mockPrismaService as any).middlewares.find(
              (m: any) => m.id === a.middlewareId
            ) || null,
          }));
        }

        return Promise.resolve(result);
      }),

      findFirst: jest.fn().mockImplementation(({ where, include }) => {
        const assignment = (mockPrismaService as any).middlewareAssignments.find(
          (a: any) => {
            if (where.middlewareId && where.tenantId) {
              return (
                a.middlewareId === where.middlewareId &&
                a.tenantId === where.tenantId
              );
            }
            if (where.tenantId) {
              return a.tenantId === where.tenantId;
            }
            return false;
          }
        );

        if (!assignment) return Promise.resolve(null);

        const result = { ...assignment };
        if (include?.middleware) {
          result.middleware = (mockPrismaService as any).middlewares.find(
            (m: any) => m.id === assignment.middlewareId
          ) || null;
        }
        if (include?.tenant) {
          const tenants = (mockPrismaService as any).tenants || [];
          result.tenant = tenants.find((t: any) => t.id === assignment.tenantId) || null;
        }

        return Promise.resolve(result);
      }),

      create: jest.fn().mockImplementation(({ data, include }) => {
        const newAssignment = {
          id: `assign-${Date.now()}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        (mockPrismaService as any).middlewareAssignments.push(newAssignment);

        const result: any = { ...newAssignment };
        if (include?.middleware) {
          result.middleware = (mockPrismaService as any).middlewares.find(
            (m: any) => m.id === data.middlewareId
          ) || null;
        }
        if (include?.tenant) {
          const tenants = (mockPrismaService as any).tenants || [];
          result.tenant = tenants.find((t: any) => t.id === data.tenantId) || null;
        }

        return Promise.resolve(result);
      }),

      delete: jest.fn().mockImplementation(({ where }) => {
        const uniqueWhere = where.middlewareId_tenantId;
        const index = (mockPrismaService as any).middlewareAssignments.findIndex(
          (a: any) =>
            a.middlewareId === uniqueWhere?.middlewareId &&
            a.tenantId === uniqueWhere?.tenantId
        );
        if (index >= 0) {
          const deleted = (mockPrismaService as any).middlewareAssignments.splice(
            index,
            1
          )[0];
          return Promise.resolve(deleted);
        }
        return Promise.reject(new Error('Assignment not found'));
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
    (mockPrismaService as any).middlewares = [
      { ...TEST_MIDDLEWARE },
      { ...TEST_MIDDLEWARE_DEDICATED },
      { ...TEST_MIDDLEWARE_OFFLINE },
    ];
    (mockPrismaService as any).middlewareAssignments = [];
    mockPrismaService.resetMocks();
  });

  // ==================== 权限测试 ====================

  describe('Authorization', () => {
    it('无 Token 访问应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/middleware-assignments/capacity')
        .expect(401);

      expectAuthError(response);
    });

    it('Tenant Admin 访问应返回 403', async () => {
      const response = await request(app.getHttpServer())
        .get('/middleware-assignments/capacity')
        .set('Authorization', `Bearer ${TEST_TOKENS.tenantAdmin}`)
        .expect(403);

      expectForbiddenError(response);
    });
  });

  // ==================== GET /middleware-assignments/capacity ====================

  describe('GET /middleware-assignments/capacity', () => {
    it('应能获取所有中间件容量信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/middleware-assignments/capacity')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  // ==================== GET /middleware-assignments/available ====================

  describe('GET /middleware-assignments/available', () => {
    it('应能获取可分配的中间件列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/middleware-assignments/available')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  // ==================== GET /middleware-assignments/middleware/:middlewareId ====================

  describe('GET /middleware-assignments/middleware/:middlewareId', () => {
    it('应能获取中间件的所有分配租户', async () => {
      const response = await request(app.getHttpServer())
        .get(`/middleware-assignments/middleware/${TEST_MIDDLEWARE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('不存在的中间件应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/middleware-assignments/middleware/nonexistent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== GET /middleware-assignments/tenant/:tenantId ====================

  describe('GET /middleware-assignments/tenant/:tenantId', () => {
    it('应能获取租户的中间件分配信息', async () => {
      const response = await request(app.getHttpServer())
        .get(`/middleware-assignments/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/middleware-assignments/tenant/nonexistent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== POST /middleware-assignments/middleware/:middlewareId/assign ====================

  describe('POST /middleware-assignments/middleware/:middlewareId/assign', () => {
    it('应能分配租户到 SHARED 中间件', async () => {
      const response = await request(app.getHttpServer())
        .post(`/middleware-assignments/middleware/${TEST_MIDDLEWARE.id}/assign`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ tenantId: TEST_TENANT.id })
        .expect(201);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.middlewareId).toBe(TEST_MIDDLEWARE.id);
      expect(data.tenantId).toBe(TEST_TENANT.id);
    });

    it('不存在的中间件应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/middleware-assignments/middleware/nonexistent-id/assign')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ tenantId: TEST_TENANT.id })
        .expect(404);

      expectNotFoundError(response);
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post(`/middleware-assignments/middleware/${TEST_MIDDLEWARE.id}/assign`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ tenantId: 'nonexistent-tenant-id' })
        .expect(404);

      expectNotFoundError(response);
    });

    it('重复分配应返回 409', async () => {
      // 先创建一个分配
      (mockPrismaService as any).middlewareAssignments.push({
        id: 'assign-1',
        middlewareId: TEST_MIDDLEWARE.id,
        tenantId: TEST_TENANT.id,
        createdAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post(`/middleware-assignments/middleware/${TEST_MIDDLEWARE.id}/assign`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ tenantId: TEST_TENANT.id })
        .expect(409);

      expectConflictError(response);
    });

    it('DEDICATED 模式容量已满应返回 409', async () => {
      // DEDICATED 模式已有分配
      (mockPrismaService as any).middlewareAssignments.push({
        id: 'assign-1',
        middlewareId: TEST_MIDDLEWARE_DEDICATED.id,
        tenantId: 'other-tenant-id',
        createdAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post(`/middleware-assignments/middleware/${TEST_MIDDLEWARE_DEDICATED.id}/assign`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ tenantId: TEST_TENANT.id })
        .expect(409);

      expectConflictError(response);
    });
  });

  // ==================== DELETE /middleware-assignments/middleware/:middlewareId/tenant/:tenantId ====================

  describe('DELETE /middleware-assignments/middleware/:middlewareId/tenant/:tenantId', () => {
    it('应能取消租户的中间件分配', async () => {
      // 先创建分配
      (mockPrismaService as any).middlewareAssignments.push({
        id: 'assign-1',
        middlewareId: TEST_MIDDLEWARE.id,
        tenantId: TEST_TENANT.id,
        createdAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .delete(`/middleware-assignments/middleware/${TEST_MIDDLEWARE.id}/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data.message).toBeDefined();
    });

    it('不存在的分配关系应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/middleware-assignments/middleware/${TEST_MIDDLEWARE.id}/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== POST /middleware-assignments/middleware/:middlewareId/batch-assign ====================

  describe('POST /middleware-assignments/middleware/:middlewareId/batch-assign', () => {
    it('应能批量分配租户', async () => {
      const tenantIds = [TEST_TENANT.id];

      const response = await request(app.getHttpServer())
        .post(`/middleware-assignments/middleware/${TEST_MIDDLEWARE.id}/batch-assign`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ tenantIds })
        .expect(201);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.success).toBeDefined();
      expect(data.failed).toBeDefined();
      expect(Array.isArray(data.success)).toBe(true);
      expect(Array.isArray(data.failed)).toBe(true);
    });

    it('不存在的中间件应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/middleware-assignments/middleware/nonexistent-id/batch-assign')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ tenantIds: [TEST_TENANT.id] })
        .expect(404);

      expectNotFoundError(response);
    });
  });
});
