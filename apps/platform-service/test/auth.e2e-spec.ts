/**
 * Auth 模块 API 契约测试
 * 验证认证端点的请求/响应格式
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MockPrismaService } from './mocks/prisma.mock';
import {
  TEST_CREDENTIALS,
  TEST_TOKENS,
  TEST_PLATFORM_ADMIN,
  TEST_TENANT,
} from './fixtures/test-data';
import {
  expectSuccessResponse,
  expectErrorResponse,
  expectAuthError,
  expectLoginResponse,
  expectPlatformAdminLoginResponse,
  expectTenantAdminLoginResponse,
  expectProfileResponse,
} from './utils/validators';

describe('AuthController (e2e)', () => {
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

  // ==================== POST /auth/login ====================

  describe('POST /auth/login', () => {
    describe('Platform Admin Login', () => {
      it('应该成功登录 Platform Super Admin', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: TEST_CREDENTIALS.platformSuperAdmin.email,
            password: TEST_CREDENTIALS.platformSuperAdmin.password,
            userType: 'platform_admin',
          })
          .expect(200);

        expectPlatformAdminLoginResponse(response);

        const data = response.body.data;
        expect(data.user.email).toBe(TEST_PLATFORM_ADMIN.email);
        expect(data.user.role).toBe(TEST_PLATFORM_ADMIN.role);
        expect(data.user.userType).toBe('platform_admin');
      });

      it('应该成功登录 Platform Admin', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: TEST_CREDENTIALS.platformAdmin.email,
            password: TEST_CREDENTIALS.platformAdmin.password,
            userType: 'platform_admin',
          })
          .expect(200);

        expectPlatformAdminLoginResponse(response);
      });

      it('错误密码应返回 401', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: TEST_CREDENTIALS.invalidPassword.email,
            password: TEST_CREDENTIALS.invalidPassword.password,
            userType: 'platform_admin',
          })
          .expect(401);

        expectAuthError(response);
      });

      it('不存在的邮箱应返回 401', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: TEST_CREDENTIALS.invalidEmail.email,
            password: TEST_CREDENTIALS.invalidEmail.password,
            userType: 'platform_admin',
          })
          .expect(401);

        expectAuthError(response);
      });

      it('被禁用的账户应返回 401', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: TEST_CREDENTIALS.platformDisabled.email,
            password: TEST_CREDENTIALS.platformDisabled.password,
            userType: 'platform_admin',
          })
          .expect(401);

        expectAuthError(response);
      });
    });

    describe('Tenant Admin Login', () => {
      it('应该成功登录 Tenant Owner', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: TEST_CREDENTIALS.tenantOwner.email,
            password: TEST_CREDENTIALS.tenantOwner.password,
            userType: 'tenant_admin',
            tenantCode: TEST_CREDENTIALS.tenantOwner.tenantCode,
          })
          .expect(200);

        expectTenantAdminLoginResponse(response);

        const data = response.body.data;
        expect(data.user.tenantId).toBe(TEST_TENANT.id);
        expect(data.user.tenantCode).toBe(TEST_TENANT.code);
        expect(data.user.userType).toBe('tenant_admin');
      });

      it('应该成功登录 Tenant Admin', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: TEST_CREDENTIALS.tenantAdmin.email,
            password: TEST_CREDENTIALS.tenantAdmin.password,
            userType: 'tenant_admin',
            tenantCode: TEST_CREDENTIALS.tenantAdmin.tenantCode,
          })
          .expect(200);

        expectTenantAdminLoginResponse(response);
      });

      it('缺少 tenantCode 应返回 400', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: TEST_CREDENTIALS.tenantAdmin.email,
            password: TEST_CREDENTIALS.tenantAdmin.password,
            userType: 'tenant_admin',
            // 缺少 tenantCode
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      it('无效的 tenantCode 应返回 401', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: TEST_CREDENTIALS.invalidTenantCode.email,
            password: TEST_CREDENTIALS.invalidTenantCode.password,
            userType: 'tenant_admin',
            tenantCode: TEST_CREDENTIALS.invalidTenantCode.tenantCode,
          })
          .expect(401);

        expectAuthError(response);
      });

      it('被禁用的租户应返回 401', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: TEST_CREDENTIALS.tenantSuspended.email,
            password: TEST_CREDENTIALS.tenantSuspended.password,
            userType: 'tenant_admin',
            tenantCode: TEST_CREDENTIALS.tenantSuspended.tenantCode,
          })
          .expect(401);

        expectAuthError(response);
      });
    });

    describe('Validation', () => {
      it('缺少 email 应返回 400', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            password: 'password123',
            userType: 'platform_admin',
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      it('缺少 password 应返回 400', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: 'admin@platform.com',
            userType: 'platform_admin',
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      it('缺少 userType 应返回 400', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: 'admin@platform.com',
            password: 'password123',
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      it('无效的 email 格式应返回 400', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: 'invalid-email',
            password: 'password123',
            userType: 'platform_admin',
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      it('密码太短应返回 400', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: 'admin@platform.com',
            password: '123',
            userType: 'platform_admin',
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      it('无效的 userType 应返回 400', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: 'admin@platform.com',
            password: 'password123',
            userType: 'invalid_type',
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });
  });

  // ==================== POST /auth/refresh ====================

  describe('POST /auth/refresh', () => {
    it('应该成功刷新 Token', async () => {
      // 首先登录获取 refreshToken
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: TEST_CREDENTIALS.platformSuperAdmin.email,
          password: TEST_CREDENTIALS.platformSuperAdmin.password,
          userType: 'platform_admin',
        })
        .expect(200);

      const { refreshToken } = loginResponse.body.data;

      // 刷新 token
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expectLoginResponse(response);

      // 新 token 应该不同于旧 token
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('无效的 refreshToken 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' })
        .expect(401);

      expectAuthError(response);
    });

    it('缺少 refreshToken 应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('过期的 refreshToken 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: TEST_TOKENS.expired })
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== GET /auth/me ====================

  describe('GET /auth/me', () => {
    it('Platform Admin 应能获取个人信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data).toHaveProperty('sub');
      expect(data).toHaveProperty('email');
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('role');
      expect(data).toHaveProperty('userType');
      expect(data.userType).toBe('platform_admin');
    });

    it('Tenant Admin 应能获取个人信息（含租户信息）', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${TEST_TOKENS.tenantOwner}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data).toHaveProperty('sub');
      expect(data).toHaveProperty('email');
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('role');
      expect(data).toHaveProperty('userType');
      expect(data).toHaveProperty('tenantId');
      expect(data).toHaveProperty('tenantCode');
      expect(data.userType).toBe('tenant_admin');
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);

      expectAuthError(response);
    });

    it('无效的 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectAuthError(response);
    });

    it('过期的 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${TEST_TOKENS.expired}`)
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('登录应在 500ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: TEST_CREDENTIALS.platformSuperAdmin.email,
          password: TEST_CREDENTIALS.platformSuperAdmin.password,
          userType: 'platform_admin',
        });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });

    it('获取个人信息应在 200ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(200);
    });
  });
});
