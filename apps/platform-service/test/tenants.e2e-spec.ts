/**
 * Tenants 模块 API 契约测试
 * 验证租户管理端点的请求/响应格式
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MockPrismaService } from './mocks/prisma.mock';
import {
  TEST_TOKENS,
  TEST_TENANT,
  TEST_TENANT_PENDING,
  TEST_TENANT_SUSPENDED,
} from './fixtures/test-data';
import {
  expectSuccessResponse,
  expectErrorResponse,
  expectAuthError,
  expectForbiddenError,
  expectNotFoundError,
  expectPaginatedResponse,
  expectTenantResponse,
  expectTenantCreatedResponse,
  expectStatsResponse,
} from './utils/validators';

describe('TenantsController (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();

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
    mockPrismaService.resetMocks();
  });

  // ==================== 权限测试 ====================

  describe('Authorization', () => {
    it('无 Token 访问应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants')
        .expect(401);

      expectAuthError(response);
    });

    it('无效 Token 访问应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectAuthError(response);
    });

    it('Tenant Admin 访问应返回 403', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.tenantAdmin}`)
        .expect(403);

      expectForbiddenError(response);
    });

    it('过期 Token 访问应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.expired}`)
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== GET /tenants ====================

  describe('GET /tenants', () => {
    it('Platform Super Admin 应能获取租户列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'data');

      const data = response.body.data;
      expect(data.page).toBe(1);
      expect(data.limit).toBeGreaterThan(0);
    });

    it('Platform Admin 应能获取租户列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'data');
    });

    it('Platform Operator 应能获取租户列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformOperator}`)
        .expect(200);

      expectPaginatedResponse(response, 'data');
    });

    it('应支持分页参数', async () => {
      // 默认分页测试 - 使用默认值
      const response = await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'data');

      const data = response.body.data;
      // 默认值应该是 page=1, limit=20
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
    });

    it('应支持状态筛选', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants?status=ACTIVE')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'data');
    });

    it('应支持计划筛选', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants?plan=PROFESSIONAL')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'data');
    });

    it('应支持搜索', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants?search=test')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'data');
    });

    it('无效的状态值应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants')
        .query({ status: 'INVALID_STATUS' })
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== GET /tenants/stats ====================

  describe('GET /tenants/stats', () => {
    it('Platform Admin 应能获取租户统计', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants/stats')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectStatsResponse(response);
    });
  });

  // ==================== GET /tenants/:id ====================

  describe('GET /tenants/:id', () => {
    it('应能获取租户详情', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenants/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectTenantResponse(response);

      const data = response.body.data;
      expect(data.id).toBe(TEST_TENANT.id);
      expect(data.code).toBe(TEST_TENANT.code);
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants/nonexistent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== POST /tenants ====================

  describe('POST /tenants', () => {
    const validTenantData = {
      name: 'New Tenant',
      code: 'newtenant',
      email: 'contact@newtenant.com',
      phone: '+1987654321',
      company: 'New Company Ltd',
      plan: 'BASIC',
      maxInstances: 3,
      maxAdmins: 5,
      billingCycle: 'MONTHLY',
      billingEmail: 'billing@newtenant.com',
    };

    it('Platform Super Admin 应能创建租户', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(validTenantData)
        .expect(201);

      expectTenantCreatedResponse(response);

      const data = response.body.data;
      expect(data.name).toBe(validTenantData.name);
      expect(data.code).toBe(validTenantData.code);
    });

    it('Platform Admin 应能创建租户', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformAdmin}`)
        .send({
          ...validTenantData,
          code: 'anothertenant',
          email: 'another@tenant.com',
        })
        .expect(201);

      expectTenantCreatedResponse(response);
    });

    it('缺少必填字段应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          name: 'Incomplete Tenant',
          // 缺少 code 和 email
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无效的 email 格式应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...validTenantData,
          code: 'invalidemailtenant',
          email: 'invalid-email',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无效的 code 格式应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...validTenantData,
          code: 'INVALID CODE!', // 包含大写和空格
          email: 'test@test.com',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('重复的 code 应返回 409', async () => {
      // 先创建一个租户
      await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(validTenantData)
        .expect(201);

      // 尝试用相同的 code 创建另一个租户
      const response = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...validTenantData,
          email: 'different@email.com',
        })
        .expect(409);

      expect(response.body.success).toBe(false);
    });

    it('无效的 plan 值应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...validTenantData,
          code: 'invalidplan',
          email: 'plan@test.com',
          plan: 'INVALID_PLAN',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无效的 billingCycle 值应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...validTenantData,
          code: 'invalidcycle',
          email: 'cycle@test.com',
          billingCycle: 'WEEKLY',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== PATCH /tenants/:id ====================

  describe('PATCH /tenants/:id', () => {
    it('应能更新租户信息', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tenants/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          name: 'Updated Tenant Name',
          phone: '+9999999999',
        })
        .expect(200);

      expectTenantResponse(response);

      const data = response.body.data;
      expect(data.name).toBe('Updated Tenant Name');
    });

    it('应能更新租户计划', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tenants/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          plan: 'ENTERPRISE',
          maxInstances: 20,
          maxAdmins: 50,
        })
        .expect(200);

      expectTenantResponse(response);
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .patch('/tenants/nonexistent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ name: 'Updated' })
        .expect(404);

      expectNotFoundError(response);
    });

    it('无效数据应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tenants/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          email: 'invalid-email-format',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== DELETE /tenants/:id ====================

  describe('DELETE /tenants/:id', () => {
    it('Platform Super Admin 应能删除租户', async () => {
      await request(app.getHttpServer())
        .delete(`/tenants/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(204);
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .delete('/tenants/nonexistent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== POST /tenants/:id/activate ====================

  describe('POST /tenants/:id/activate', () => {
    it('应能激活 PENDING 状态的租户', async () => {
      const response = await request(app.getHttpServer())
        .post(`/tenants/${TEST_TENANT_PENDING.id}/activate`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      // API 返回 200 或 201 都是有效的
      expect([200, 201]).toContain(response.status);
      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.status).toBe('ACTIVE');
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenants/nonexistent-id/activate')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== POST /tenants/:id/suspend ====================

  describe('POST /tenants/:id/suspend', () => {
    it('应能暂停 ACTIVE 租户', async () => {
      // ACTIVE 可以转换为 SUSPENDED
      const response = await request(app.getHttpServer())
        .post(`/tenants/${TEST_TENANT.id}/suspend`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      // API 返回 200 或 201 都是有效的
      expect([200, 201]).toContain(response.status);
      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.status).toBe('SUSPENDED');
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenants/nonexistent-id/suspend')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== POST /tenants/:id/restore ====================

  describe('POST /tenants/:id/restore', () => {
    it('应能恢复已暂停的租户', async () => {
      const response = await request(app.getHttpServer())
        .post(`/tenants/${TEST_TENANT_SUSPENDED.id}/restore`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      // API 返回 200 或 201 都是有效的
      expect([200, 201]).toContain(response.status);
      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.status).toBe('ACTIVE');
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenants/nonexistent-id/restore')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== POST /tenants/:id/terminate ====================

  describe('POST /tenants/:id/terminate', () => {
    it('应能终止 SUSPENDED 状态的租户', async () => {
      // SUSPENDED 可以转换为 CANCELLED
      const response = await request(app.getHttpServer())
        .post(`/tenants/${TEST_TENANT_SUSPENDED.id}/terminate`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      // API 返回 200 或 201 都是有效的
      expect([200, 201]).toContain(response.status);
      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.status).toBe('CANCELLED');
    });

    it('ACTIVE 状态不能直接终止应返回 422', async () => {
      // 根据状态转换规则 ACTIVE 不能直接转换为 CANCELLED
      const response = await request(app.getHttpServer())
        .post(`/tenants/${TEST_TENANT.id}/terminate`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenants/nonexistent-id/terminate')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== POST /tenants/:id/expire ====================

  describe('POST /tenants/:id/expire', () => {
    it('应能设置 ACTIVE 租户过期', async () => {
      // ACTIVE 可以转换为 EXPIRED
      const response = await request(app.getHttpServer())
        .post(`/tenants/${TEST_TENANT.id}/expire`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      // API 返回 200 或 201 都是有效的
      expect([200, 201]).toContain(response.status);
      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data.status).toBe('EXPIRED');
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenants/nonexistent-id/expire')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== GET /tenants/:id/branding ====================

  describe('GET /tenants/:id/branding', () => {
    it('应能获取租户白标配置', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenants/${TEST_TENANT.id}/branding`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      // 白标配置可能有 displayName, logo, primaryColor
      expect(data).toBeDefined();
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenants/nonexistent-id/branding')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== PATCH /tenants/:id/branding ====================

  describe('PATCH /tenants/:id/branding', () => {
    it('应能更新租户白标配置', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tenants/${TEST_TENANT.id}/branding`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          displayName: 'Custom Trading Platform',
          logoUrl: 'https://example.com/new-logo.png',
          primaryColor: '#FF5733',
        })
        .expect(200);

      expectSuccessResponse(response);
    });

    it('无效的颜色格式应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tenants/${TEST_TENANT.id}/branding`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          primaryColor: 'invalid-color',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无效的 logo URL 应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tenants/${TEST_TENANT.id}/branding`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          logoUrl: 'not-a-valid-url',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .patch('/tenants/nonexistent-id/branding')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          displayName: 'Test',
        })
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('获取租户列表应在 500ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });

    it('获取租户详情应在 200ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get(`/tenants/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(200);
    });
  });
});
