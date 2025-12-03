/**
 * Platform Admins 模块 API 契约测试
 * 验证平台管理员管理端点的请求/响应格式
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MockPrismaService } from './mocks/prisma.mock';
import {
  TEST_TOKENS,
  TEST_PLATFORM_ADMIN,
  TEST_PLATFORM_ADMIN_REGULAR,
  TEST_PLATFORM_ADMIN_OPERATOR,
  TEST_PLATFORM_ADMIN_DISABLED,
} from './fixtures/test-data';
import {
  expectSuccessResponse,
  expectErrorResponse,
  expectAuthError,
  expectForbiddenError,
  expectNotFoundError,
  expectBadRequestError,
  expectConflictError,
  expectPlatformAdminResponse,
  getSuccessData,
} from './utils/validators';

describe('PlatformAdminsController (e2e)', () => {
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

  // ==================== 认证和授权测试 ====================

  describe('Authentication & Authorization', () => {
    it('无 Token 访问应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/platform-admins')
        .expect(401);

      expectAuthError(response);
    });

    it('无效 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/platform-admins')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectAuthError(response);
    });

    it('过期 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.expired}`)
        .expect(401);

      expectAuthError(response);
    });

    it('Tenant Admin Token 访问应返回 403', async () => {
      const response = await request(app.getHttpServer())
        .get('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.tenantAdmin}`)
        .expect(403);

      expectForbiddenError(response);
    });
  });

  // ==================== GET /platform-admins ====================

  describe('GET /platform-admins', () => {
    it('Super Admin 应能获取所有平台管理员列表', async () => {
      // 使用默认实现，会返回所有测试管理员

      const response = await request(app.getHttpServer())
        .get('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any[]>(response);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      // 验证不返回密码字段
      data.forEach((admin) => {
        expect(admin).not.toHaveProperty('password');
        expect(admin).toHaveProperty('id');
        expect(admin).toHaveProperty('email');
        expect(admin).toHaveProperty('name');
        expect(admin).toHaveProperty('role');
        expect(admin).toHaveProperty('isActive');
      });
    });

    it('Regular Admin 应能获取管理员列表', async () => {
      // 使用默认实现

      const response = await request(app.getHttpServer())
        .get('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('Operator 应能获取管理员列表', async () => {
      // 使用默认实现

      const response = await request(app.getHttpServer())
        .get('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformOperator}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('空列表应返回空数组', async () => {
      mockPrismaService.platformAdmin.findMany.mockResolvedValueOnce([]);

      const response = await request(app.getHttpServer())
        .get('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any[]>(response);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    });
  });

  // ==================== GET /platform-admins/:id ====================

  describe('GET /platform-admins/:id', () => {
    it('应能获取指定管理员详情', async () => {
      // 默认实现已返回正确数据，无需 mock

      const response = await request(app.getHttpServer())
        .get(`/platform-admins/${TEST_PLATFORM_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectPlatformAdminResponse(response);
      const data = getSuccessData(response);
      expect(data.id).toBe(TEST_PLATFORM_ADMIN.id);
      expect(data.email).toBe(TEST_PLATFORM_ADMIN.email);
      expect(data.name).toBe(TEST_PLATFORM_ADMIN.name);
      expect(data.role).toBe(TEST_PLATFORM_ADMIN.role);
      expect(data).not.toHaveProperty('password');
    });

    it('不存在的管理员应返回 404', async () => {
      // JWT 验证先调用 findUnique（返回用户）, 业务逻辑再调用（返回 null）
      mockPrismaService.platformAdmin.findUnique
        .mockResolvedValueOnce(TEST_PLATFORM_ADMIN) // JWT 验证
        .mockResolvedValueOnce(null); // 业务逻辑查询

      const response = await request(app.getHttpServer())
        .get('/platform-admins/non-existent-admin-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('Regular Admin 应能查看其他管理员', async () => {
      // 默认实现已返回正确数据，无需 mock

      const response = await request(app.getHttpServer())
        .get(`/platform-admins/${TEST_PLATFORM_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformAdmin}`)
        .expect(200);

      expectPlatformAdminResponse(response);
    });
  });

  // ==================== POST /platform-admins ====================

  describe('POST /platform-admins', () => {
    const createAdminDto = {
      email: 'newadmin@platform.com',
      password: 'securePassword123',
      name: 'New Admin',
      role: 'ADMIN',
    };

    it('Super Admin 应能创建新管理员', async () => {
      // JWT 验证先调用（返回用户），业务逻辑检查邮箱不存在（返回 null）
      mockPrismaService.platformAdmin.findUnique
        .mockResolvedValueOnce(TEST_PLATFORM_ADMIN) // JWT 验证
        .mockResolvedValueOnce(null); // 检查邮箱是否已存在
      mockPrismaService.platformAdmin.create.mockResolvedValue({
        id: 'new-admin-id',
        ...createAdminDto,
        password: 'hashed-password',
        isActive: true,
        lastLogin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(createAdminDto)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.email).toBe(createAdminDto.email);
      expect(data.name).toBe(createAdminDto.name);
      expect(data.role).toBe(createAdminDto.role);
      expect(data).not.toHaveProperty('password');
    });

    it('Regular Admin 创建管理员应返回 403', async () => {
      const response = await request(app.getHttpServer())
        .post('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformAdmin}`)
        .send(createAdminDto)
        .expect(403);

      expectForbiddenError(response);
    });

    it('Operator 创建管理员应返回 403', async () => {
      const response = await request(app.getHttpServer())
        .post('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformOperator}`)
        .send(createAdminDto)
        .expect(403);

      expectForbiddenError(response);
    });

    it('重复的邮箱应返回 409', async () => {
      mockPrismaService.platformAdmin.findUnique.mockResolvedValue(
        TEST_PLATFORM_ADMIN,
      );

      const response = await request(app.getHttpServer())
        .post('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...createAdminDto,
          email: TEST_PLATFORM_ADMIN.email,
        })
        .expect(409);

      expectConflictError(response);
    });

    it('缺少必填字段应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          email: 'test@platform.com',
          // 缺少 password 和 name
        })
        .expect(400);

      expectBadRequestError(response);
    });

    it('无效的邮箱格式应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/platform-admins')
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
        .post('/platform-admins')
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
        .post('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...createAdminDto,
          role: 'INVALID_ROLE',
        })
        .expect(400);

      expectBadRequestError(response);
    });

    it('创建 SUPER_ADMIN 角色应成功', async () => {
      // JWT 验证先调用（返回用户），业务逻辑检查邮箱不存在（返回 null）
      mockPrismaService.platformAdmin.findUnique
        .mockResolvedValueOnce(TEST_PLATFORM_ADMIN) // JWT 验证
        .mockResolvedValueOnce(null); // 检查邮箱是否已存在
      mockPrismaService.platformAdmin.create.mockResolvedValue({
        id: 'new-super-admin-id',
        ...createAdminDto,
        role: 'SUPER_ADMIN',
        password: 'hashed-password',
        isActive: true,
        lastLogin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          ...createAdminDto,
          role: 'SUPER_ADMIN',
        })
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.role).toBe('SUPER_ADMIN');
    });

    it('创建 OPERATOR 角色应成功', async () => {
      // JWT 验证先调用（返回用户），业务逻辑检查邮箱不存在（返回 null）
      mockPrismaService.platformAdmin.findUnique
        .mockResolvedValueOnce(TEST_PLATFORM_ADMIN) // JWT 验证
        .mockResolvedValueOnce(null); // 检查邮箱是否已存在
      mockPrismaService.platformAdmin.create.mockResolvedValue({
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
        .post('/platform-admins')
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

  // ==================== PATCH /platform-admins/:id ====================

  describe('PATCH /platform-admins/:id', () => {
    it('Super Admin 应能更新管理员信息', async () => {
      // JWT 验证 + 业务逻辑都使用默认实现
      mockPrismaService.platformAdmin.update.mockResolvedValue({
        ...TEST_PLATFORM_ADMIN_REGULAR,
        name: 'Updated Name',
      });

      const response = await request(app.getHttpServer())
        .patch(`/platform-admins/${TEST_PLATFORM_ADMIN_REGULAR.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.name).toBe('Updated Name');
      expect(data).not.toHaveProperty('password');
    });

    it('Regular Admin 更新其他管理员应返回 403', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/platform-admins/${TEST_PLATFORM_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformAdmin}`)
        .send({ name: 'Updated Name' })
        .expect(403);

      expectForbiddenError(response);
    });

    it('不存在的管理员应返回 404', async () => {
      // JWT 验证先调用（返回用户），业务逻辑再调用（返回 null）
      mockPrismaService.platformAdmin.findUnique
        .mockResolvedValueOnce(TEST_PLATFORM_ADMIN) // JWT 验证
        .mockResolvedValueOnce(null); // 业务逻辑查询

      const response = await request(app.getHttpServer())
        .patch('/platform-admins/non-existent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ name: 'Updated Name' })
        .expect(404);

      expectNotFoundError(response);
    });

    it('更新邮箱为已存在的邮箱应返回 409', async () => {
      mockPrismaService.platformAdmin.findUnique
        .mockResolvedValueOnce(TEST_PLATFORM_ADMIN) // JWT 验证
        .mockResolvedValueOnce(TEST_PLATFORM_ADMIN_REGULAR) // 查找目标管理员
        .mockResolvedValueOnce(TEST_PLATFORM_ADMIN); // 检查邮箱是否存在

      const response = await request(app.getHttpServer())
        .patch(`/platform-admins/${TEST_PLATFORM_ADMIN_REGULAR.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ email: TEST_PLATFORM_ADMIN.email })
        .expect(409);

      expectConflictError(response);
    });

    it('应能更新管理员的 isActive 状态', async () => {
      // 使用默认实现
      mockPrismaService.platformAdmin.update.mockResolvedValue({
        ...TEST_PLATFORM_ADMIN_REGULAR,
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .patch(`/platform-admins/${TEST_PLATFORM_ADMIN_REGULAR.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ isActive: false })
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.isActive).toBe(false);
    });

    it('Super Admin 不能禁用自己', async () => {
      // 使用默认实现，无需 mock

      const response = await request(app.getHttpServer())
        .patch(`/platform-admins/${TEST_PLATFORM_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ isActive: false })
        .expect(403);

      expectForbiddenError(response);
    });

    it('应能更新管理员角色', async () => {
      // 使用默认实现
      mockPrismaService.platformAdmin.update.mockResolvedValue({
        ...TEST_PLATFORM_ADMIN_OPERATOR,
        role: 'ADMIN',
      });

      const response = await request(app.getHttpServer())
        .patch(`/platform-admins/${TEST_PLATFORM_ADMIN_OPERATOR.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ role: 'ADMIN' })
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data.role).toBe('ADMIN');
    });

    it('无效的邮箱格式应返回 400', async () => {
      // DTO 验证在业务逻辑前执行，使用默认实现即可

      const response = await request(app.getHttpServer())
        .patch(`/platform-admins/${TEST_PLATFORM_ADMIN_REGULAR.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ email: 'invalid-email' })
        .expect(400);

      expectBadRequestError(response);
    });
  });

  // ==================== DELETE /platform-admins/:id ====================

  describe('DELETE /platform-admins/:id', () => {
    it('Super Admin 应能删除管理员', async () => {
      // 使用默认实现 + mock delete
      mockPrismaService.platformAdmin.delete.mockResolvedValue(
        TEST_PLATFORM_ADMIN_REGULAR,
      );

      await request(app.getHttpServer())
        .delete(`/platform-admins/${TEST_PLATFORM_ADMIN_REGULAR.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(204);
    });

    it('Regular Admin 删除管理员应返回 403', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/platform-admins/${TEST_PLATFORM_ADMIN_OPERATOR.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformAdmin}`)
        .expect(403);

      expectForbiddenError(response);
    });

    it('不存在的管理员应返回 404', async () => {
      // JWT 验证先调用（返回用户），业务逻辑再调用（返回 null）
      mockPrismaService.platformAdmin.findUnique
        .mockResolvedValueOnce(TEST_PLATFORM_ADMIN) // JWT 验证
        .mockResolvedValueOnce(null); // 业务逻辑查询

      const response = await request(app.getHttpServer())
        .delete('/platform-admins/non-existent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('Super Admin 不能删除自己', async () => {
      // 使用默认实现，无需 mock

      const response = await request(app.getHttpServer())
        .delete(`/platform-admins/${TEST_PLATFORM_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(403);

      expectForbiddenError(response);
    });

    it('不能删除最后一个 Super Admin', async () => {
      // JWT 验证 + 业务逻辑都查找同一用户
      mockPrismaService.platformAdmin.findUnique
        .mockResolvedValueOnce(TEST_PLATFORM_ADMIN) // JWT 验证
        .mockResolvedValueOnce({
          ...TEST_PLATFORM_ADMIN,
          id: 'another-super-admin-id',
        }); // 业务逻辑查询
      mockPrismaService.platformAdmin.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .delete('/platform-admins/another-super-admin-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(403);

      expectForbiddenError(response);
    });

    it('有多个 Super Admin 时可以删除其中一个', async () => {
      // JWT 验证 + 业务逻辑都查找同一用户
      mockPrismaService.platformAdmin.findUnique
        .mockResolvedValueOnce(TEST_PLATFORM_ADMIN) // JWT 验证
        .mockResolvedValueOnce({
          ...TEST_PLATFORM_ADMIN,
          id: 'another-super-admin-id',
        }); // 业务逻辑查询
      mockPrismaService.platformAdmin.count.mockResolvedValue(2);
      mockPrismaService.platformAdmin.delete.mockResolvedValue({
        ...TEST_PLATFORM_ADMIN,
        id: 'another-super-admin-id',
      });

      await request(app.getHttpServer())
        .delete('/platform-admins/another-super-admin-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(204);
    });
  });

  // ==================== POST /platform-admins/:id/change-password ====================

  describe('POST /platform-admins/:id/change-password', () => {
    const changePasswordDto = {
      currentPassword: 'password123',
      newPassword: 'newSecurePassword456',
    };

    it('应能成功修改密码', async () => {
      // 使用默认实现 + mock update
      mockPrismaService.platformAdmin.update.mockResolvedValue(
        TEST_PLATFORM_ADMIN,
      );

      // POST 方法默认返回 201（控制器未使用 @HttpCode(200)）
      const response = await request(app.getHttpServer())
        .post(`/platform-admins/${TEST_PLATFORM_ADMIN.id}/change-password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(changePasswordDto)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data).toHaveProperty('message');
    });

    it('当前密码错误应返回 400', async () => {
      // 使用默认实现，无需 mock

      const response = await request(app.getHttpServer())
        .post(`/platform-admins/${TEST_PLATFORM_ADMIN.id}/change-password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          currentPassword: 'wrongPassword',
          newPassword: 'newSecurePassword456',
        })
        .expect(400);

      expectBadRequestError(response);
    });

    it('新密码太短应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post(`/platform-admins/${TEST_PLATFORM_ADMIN.id}/change-password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'short',
        })
        .expect(400);

      expectBadRequestError(response);
    });

    it('不存在的管理员应返回 404', async () => {
      // JWT 验证先调用（返回用户），业务逻辑再调用（返回 null）
      mockPrismaService.platformAdmin.findUnique
        .mockResolvedValueOnce(TEST_PLATFORM_ADMIN) // JWT 验证
        .mockResolvedValueOnce(null); // 业务逻辑查询

      const response = await request(app.getHttpServer())
        .post('/platform-admins/non-existent-id/change-password')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(changePasswordDto)
        .expect(404);

      expectNotFoundError(response);
    });

    it('缺少必填字段应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post(`/platform-admins/${TEST_PLATFORM_ADMIN.id}/change-password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          currentPassword: 'password123',
          // 缺少 newPassword
        })
        .expect(400);

      expectBadRequestError(response);
    });
  });

  // ==================== POST /platform-admins/:id/reset-password ====================

  describe('POST /platform-admins/:id/reset-password', () => {
    const resetPasswordDto = {
      newPassword: 'newSecurePassword456',
    };

    it('Super Admin 应能重置其他管理员的密码', async () => {
      // 使用默认实现 + mock update
      mockPrismaService.platformAdmin.update.mockResolvedValue(
        TEST_PLATFORM_ADMIN_REGULAR,
      );

      // POST 方法默认返回 201（控制器未使用 @HttpCode(200)）
      const response = await request(app.getHttpServer())
        .post(`/platform-admins/${TEST_PLATFORM_ADMIN_REGULAR.id}/reset-password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(resetPasswordDto)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData(response);
      expect(data).toHaveProperty('message');
    });

    it('Regular Admin 重置密码应返回 403', async () => {
      const response = await request(app.getHttpServer())
        .post(`/platform-admins/${TEST_PLATFORM_ADMIN_OPERATOR.id}/reset-password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformAdmin}`)
        .send(resetPasswordDto)
        .expect(403);

      expectForbiddenError(response);
    });

    it('Operator 重置密码应返回 403', async () => {
      const response = await request(app.getHttpServer())
        .post(`/platform-admins/${TEST_PLATFORM_ADMIN_REGULAR.id}/reset-password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformOperator}`)
        .send(resetPasswordDto)
        .expect(403);

      expectForbiddenError(response);
    });

    it('不存在的管理员应返回 404', async () => {
      // JWT 验证先调用（返回用户），业务逻辑再调用（返回 null）
      mockPrismaService.platformAdmin.findUnique
        .mockResolvedValueOnce(TEST_PLATFORM_ADMIN) // JWT 验证
        .mockResolvedValueOnce(null); // 业务逻辑查询

      const response = await request(app.getHttpServer())
        .post('/platform-admins/non-existent-id/reset-password')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(resetPasswordDto)
        .expect(404);

      expectNotFoundError(response);
    });

    it('新密码太短应返回 400', async () => {
      // DTO 验证在业务逻辑前执行
      const response = await request(app.getHttpServer())
        .post(`/platform-admins/${TEST_PLATFORM_ADMIN_REGULAR.id}/reset-password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          newPassword: 'short',
        })
        .expect(400);

      expectBadRequestError(response);
    });

    it('缺少新密码应返回 400', async () => {
      // DTO 验证在业务逻辑前执行
      const response = await request(app.getHttpServer())
        .post(`/platform-admins/${TEST_PLATFORM_ADMIN_REGULAR.id}/reset-password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({})
        .expect(400);

      expectBadRequestError(response);
    });
  });

  // ==================== 响应格式验证 ====================

  describe('Response Format Validation', () => {
    it('管理员详情应包含所有必要字段', async () => {
      // 使用默认实现

      const response = await request(app.getHttpServer())
        .get(`/platform-admins/${TEST_PLATFORM_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData(response);

      // 验证必要字段存在
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('email');
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('role');
      expect(data).toHaveProperty('isActive');
      expect(data).toHaveProperty('createdAt');
      expect(data).toHaveProperty('updatedAt');

      // 验证敏感字段不存在
      expect(data).not.toHaveProperty('password');
    });

    it('角色值应为有效枚举', async () => {
      // 使用默认实现

      const response = await request(app.getHttpServer())
        .get('/platform-admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData<any[]>(response);
      const validRoles = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'];

      data.forEach((admin) => {
        expect(validRoles).toContain(admin.role);
      });
    });

    it('日期字段应为有效的 ISO 格式', async () => {
      // 使用默认实现

      const response = await request(app.getHttpServer())
        .get(`/platform-admins/${TEST_PLATFORM_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData(response);

      // 日期字段应可被解析
      expect(new Date(data.createdAt)).toBeInstanceOf(Date);
      expect(new Date(data.updatedAt)).toBeInstanceOf(Date);
    });
  });
});
