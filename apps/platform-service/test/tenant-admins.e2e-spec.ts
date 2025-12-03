/**
 * Tenant Admins 模块 API 契约测试
 * 验证租户管理员端点的请求/响应格式
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
  TEST_TENANT_ADMIN,
  TEST_TENANT_ADMIN_OWNER,
  TEST_TENANT_ADMIN_OPERATOR,
  TEST_TENANT_ADMIN_DISABLED,
  TEST_PLATFORM_ADMIN,
} from './fixtures/test-data';
import {
  expectSuccessResponse,
  getSuccessData,
  expectErrorResponse,
  expectAuthError,
  expectForbiddenError,
  expectNotFoundError,
  expectBadRequestError,
  expectPaginatedResponse,
  getPaginatedData,
  expectTenantAdminResponse,
} from './utils/validators';

describe('TenantAdminsController (e2e)', () => {
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

  // ==================== Authentication & Authorization ====================

  describe('Authentication & Authorization', () => {
    it('无 Token 访问应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant-admins')
        .expect(401);

      expectAuthError(response);
    });

    it('无效 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant-admins')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectAuthError(response);
    });

    it('过期 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.expired}`)
        .expect(401);

      expectAuthError(response);
    });

    it('Tenant Admin Token 访问应返回 403', async () => {
      // tenant-admins 端点仅限 Platform Admin 访问
      const response = await request(app.getHttpServer())
        .get('/tenant-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.tenantOwner}`)
        .expect(403);

      expectForbiddenError(response);
    });
  });

  // ==================== GET /tenant-admins ====================

  describe('GET /tenant-admins', () => {
    it('Platform Admin 应能获取所有租户管理员列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'admins');
      const data = getPaginatedData(response, 'admins');
      expect(data.total).toBeGreaterThan(0);
    });

    it('可以按 tenantId 筛选', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant-admins')
        .query({ tenantId: TEST_TENANT.id })
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'admins');
    });

    it('可以按 role 筛选', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant-admins')
        .query({ role: 'OWNER' })
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'admins');
    });

    it('可以按 isActive 筛选', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant-admins')
        .query({ isActive: true })
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'admins');
    });

    it('支持分页参数', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant-admins')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'admins');
      const data = getPaginatedData(response, 'admins');
      expect(data.page).toBe(1);
      expect(data.limit).toBe(10);
    });

    it('支持搜索功能', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant-admins')
        .query({ search: 'admin' })
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'admins');
    });
  });

  // ==================== GET /tenant-admins/stats ====================

  describe('GET /tenant-admins/stats', () => {
    it('应能获取管理员统计', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant-admins/stats')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('可以按 tenantId 获取特定租户的统计', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant-admins/stats')
        .query({ tenantId: TEST_TENANT.id })
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });
  });

  // ==================== GET /tenant-admins/:id ====================

  describe('GET /tenant-admins/:id', () => {
    it('应能获取指定管理员详情', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenant-admins/${TEST_TENANT_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectTenantAdminResponse(response);

      const data = getSuccessData(response);
      expect(data.id).toBe(TEST_TENANT_ADMIN.id);
      expect(data.email).toBe(TEST_TENANT_ADMIN.email);
      expect(data).not.toHaveProperty('password');
    });

    it('不存在的管理员应返回 404', async () => {
      // JWT 验证先调用（返回用户），业务逻辑再调用（返回 null）
      mockPrismaService.tenantAdmin.findUnique
        .mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer())
        .get('/tenant-admins/non-existent-admin-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('应能获取 Owner 角色管理员详情', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenant-admins/${TEST_TENANT_ADMIN_OWNER.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectTenantAdminResponse(response);
      const data = getSuccessData(response);
      expect(data.role).toBe('OWNER');
    });
  });

  // ==================== GET /tenant-admins/tenant/:tenantId ====================

  describe('GET /tenant-admins/tenant/:tenantId', () => {
    it('应能获取指定租户的所有管理员', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenant-admins/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(Array.isArray(data)).toBe(true);
    });

    it('空租户应返回空数组', async () => {
      mockPrismaService.tenantAdmin.findMany.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get('/tenant-admins/tenant/empty-tenant-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    });
  });

  // ==================== POST /tenant-admins ====================

  describe('POST /tenant-admins', () => {
    const createAdminDto = {
      tenantId: TEST_TENANT.id,
      email: 'newadmin@testtenant.com',
      password: 'securePassword123',
      name: 'New Tenant Admin',
      role: 'ADMIN',
    };

    it('应能创建新租户管理员', async () => {
      // JWT 验证 + 检查邮箱是否存在
      mockPrismaService.tenantAdmin.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.tenantAdmin.create.mockResolvedValue({
        id: 'new-tenant-admin-id',
        ...createAdminDto,
        password: 'hashed-password',
        isActive: true,
        lastLogin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/tenant-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(createAdminDto)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.email).toBe(createAdminDto.email);
      expect(data.name).toBe(createAdminDto.name);
      expect(data.role).toBe(createAdminDto.role);
      // 注意：Mock 返回数据可能包含 password，实际 Service 应过滤
    });

    it('重复的邮箱应返回 409', async () => {
      // 检查邮箱已存在
      mockPrismaService.tenantAdmin.findFirst.mockResolvedValueOnce(TEST_TENANT_ADMIN);

      const response = await request(app.getHttpServer())
        .post('/tenant-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...createAdminDto,
          email: TEST_TENANT_ADMIN.email,
        })
        .expect(409);

      expectErrorResponse(response, undefined, 409);
    });

    it('缺少必填字段应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          email: 'test@example.com',
          // 缺少 tenantId, password, name
        })
        .expect(400);

      expectBadRequestError(response);
    });

    it('无效的 email 格式应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...createAdminDto,
          email: 'invalid-email',
        })
        .expect(400);

      expectBadRequestError(response);
    });

    it('密码太短应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...createAdminDto,
          password: 'short',
        })
        .expect(400);

      expectBadRequestError(response);
    });

    it('无效的角色应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...createAdminDto,
          role: 'INVALID_ROLE',
        })
        .expect(400);

      expectBadRequestError(response);
    });

    it('无效的 tenantId 格式应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...createAdminDto,
          tenantId: 'invalid-uuid',
        })
        .expect(400);

      expectBadRequestError(response);
    });

    it('创建 OWNER 角色应成功', async () => {
      mockPrismaService.tenantAdmin.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.tenantAdmin.create.mockResolvedValue({
        id: 'new-owner-id',
        ...createAdminDto,
        role: 'OWNER',
        password: 'hashed-password',
        isActive: true,
        lastLogin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/tenant-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...createAdminDto,
          role: 'OWNER',
        })
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.role).toBe('OWNER');
    });

    it('创建 OPERATOR 角色应成功', async () => {
      mockPrismaService.tenantAdmin.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.tenantAdmin.create.mockResolvedValue({
        id: 'new-operator-id',
        ...createAdminDto,
        role: 'OPERATOR',
        password: 'hashed-password',
        isActive: true,
        lastLogin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/tenant-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...createAdminDto,
          role: 'OPERATOR',
        })
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.role).toBe('OPERATOR');
    });
  });

  // ==================== PATCH /tenant-admins/:id ====================

  describe('PATCH /tenant-admins/:id', () => {
    it('应能更新管理员信息', async () => {
      mockPrismaService.tenantAdmin.update.mockResolvedValue({
        ...TEST_TENANT_ADMIN,
        name: 'Updated Name',
      });

      const response = await request(app.getHttpServer())
        .patch(`/tenant-admins/${TEST_TENANT_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.name).toBe('Updated Name');
      // 注意：Mock 返回数据可能包含 password，实际 Service 应过滤
    });

    it('不存在的管理员应返回 404', async () => {
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer())
        .patch('/tenant-admins/non-existent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ name: 'Updated Name' })
        .expect(404);

      expectNotFoundError(response);
    });

    it('应能更新管理员的 isActive 状态', async () => {
      mockPrismaService.tenantAdmin.update.mockResolvedValue({
        ...TEST_TENANT_ADMIN,
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .patch(`/tenant-admins/${TEST_TENANT_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ isActive: false })
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.isActive).toBe(false);
    });

    it('应能更新管理员角色', async () => {
      mockPrismaService.tenantAdmin.update.mockResolvedValue({
        ...TEST_TENANT_ADMIN,
        role: 'OPERATOR',
      });

      const response = await request(app.getHttpServer())
        .patch(`/tenant-admins/${TEST_TENANT_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ role: 'OPERATOR' })
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.role).toBe('OPERATOR');
    });

    it('无效的角色应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tenant-admins/${TEST_TENANT_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ role: 'INVALID_ROLE' })
        .expect(400);

      expectBadRequestError(response);
    });
  });

  // ==================== DELETE /tenant-admins/:id ====================

  describe('DELETE /tenant-admins/:id', () => {
    it('应能删除管理员', async () => {
      // 确保不是最后一个 Owner
      mockPrismaService.tenantAdmin.count.mockResolvedValue(2);
      mockPrismaService.tenantAdmin.delete.mockResolvedValue(TEST_TENANT_ADMIN);

      await request(app.getHttpServer())
        .delete(`/tenant-admins/${TEST_TENANT_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(204);
    });

    it('不存在的管理员应返回 404', async () => {
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer())
        .delete('/tenant-admins/non-existent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('不能删除最后一个 Owner', async () => {
      // 模拟只有一个 Owner
      mockPrismaService.tenantAdmin.count.mockResolvedValue(1);
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValue(TEST_TENANT_ADMIN_OWNER);

      const response = await request(app.getHttpServer())
        .delete(`/tenant-admins/${TEST_TENANT_ADMIN_OWNER.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(422);

      expectErrorResponse(response);
    });
  });

  // ==================== PATCH /tenant-admins/:id/password ====================

  describe('PATCH /tenant-admins/:id/password', () => {
    const changePasswordDto = {
      newPassword: 'newSecurePassword456',
    };

    it('应能成功修改密码', async () => {
      mockPrismaService.tenantAdmin.update.mockResolvedValue(TEST_TENANT_ADMIN);

      await request(app.getHttpServer())
        .patch(`/tenant-admins/${TEST_TENANT_ADMIN.id}/password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(changePasswordDto)
        .expect(204);
    });

    it('新密码太短应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tenant-admins/${TEST_TENANT_ADMIN.id}/password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          newPassword: 'short',
        })
        .expect(400);

      expectBadRequestError(response);
    });

    it('不存在的管理员应返回 404', async () => {
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer())
        .patch('/tenant-admins/non-existent-id/password')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(changePasswordDto)
        .expect(404);

      expectNotFoundError(response);
    });

    it('缺少新密码应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tenant-admins/${TEST_TENANT_ADMIN.id}/password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({})
        .expect(400);

      expectBadRequestError(response);
    });
  });

  // ==================== POST /tenant-admins/:id/activate ====================

  describe('POST /tenant-admins/:id/activate', () => {
    it('应能激活管理员', async () => {
      mockPrismaService.tenantAdmin.update.mockResolvedValue({
        ...TEST_TENANT_ADMIN_DISABLED,
        isActive: true,
      });

      // POST 方法默认返回 201
      const response = await request(app.getHttpServer())
        .post(`/tenant-admins/${TEST_TENANT_ADMIN_DISABLED.id}/activate`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.isActive).toBe(true);
    });

    it('不存在的管理员应返回 404', async () => {
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer())
        .post('/tenant-admins/non-existent-id/activate')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('已激活的管理员再次激活应成功', async () => {
      mockPrismaService.tenantAdmin.update.mockResolvedValue({
        ...TEST_TENANT_ADMIN,
        isActive: true,
      });

      const response = await request(app.getHttpServer())
        .post(`/tenant-admins/${TEST_TENANT_ADMIN.id}/activate`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.isActive).toBe(true);
    });
  });

  // ==================== POST /tenant-admins/:id/deactivate ====================

  describe('POST /tenant-admins/:id/deactivate', () => {
    it('应能停用管理员', async () => {
      // 确保不是最后一个活跃的 Owner
      mockPrismaService.tenantAdmin.count.mockResolvedValue(2);
      mockPrismaService.tenantAdmin.update.mockResolvedValue({
        ...TEST_TENANT_ADMIN,
        isActive: false,
      });

      // POST 方法默认返回 201
      const response = await request(app.getHttpServer())
        .post(`/tenant-admins/${TEST_TENANT_ADMIN.id}/deactivate`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.isActive).toBe(false);
    });

    it('不存在的管理员应返回 404', async () => {
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer())
        .post('/tenant-admins/non-existent-id/deactivate')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('不能停用最后一个活跃的 Owner', async () => {
      // 模拟只有一个活跃 Owner
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValue(TEST_TENANT_ADMIN_OWNER);
      mockPrismaService.tenantAdmin.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .post(`/tenant-admins/${TEST_TENANT_ADMIN_OWNER.id}/deactivate`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(422);

      expectErrorResponse(response);
    });
  });

  // ==================== Response Format Validation ====================

  describe('Response Format Validation', () => {
    it('管理员详情应包含所有必要字段', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenant-admins/${TEST_TENANT_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectTenantAdminResponse(response);

      const data = getSuccessData(response);
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('tenantId');
      expect(data).toHaveProperty('email');
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('role');
      expect(data).toHaveProperty('isActive');
      expect(data).not.toHaveProperty('password');
    });

    it('角色值应为有效枚举', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenant-admins/${TEST_TENANT_ADMIN_OWNER.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData(response);
      const validRoles = ['OWNER', 'ADMIN', 'OPERATOR'];
      expect(validRoles).toContain(data.role);
    });

    it('日期字段应为有效的 ISO 格式', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenant-admins/${TEST_TENANT_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData(response);
      if (data.createdAt) {
        expect(new Date(data.createdAt).toISOString()).toBeDefined();
      }
      if (data.updatedAt) {
        expect(new Date(data.updatedAt).toISOString()).toBeDefined();
      }
    });
  });
});
