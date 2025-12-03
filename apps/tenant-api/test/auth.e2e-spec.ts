/**
 * Auth 模块 API 契约测试
 * 验证认证端点的请求/响应格式
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MiddlewareProxyService } from '../src/middleware-proxy';
import { MockPrismaService } from './mocks/prisma.mock';
import { MockMiddlewareProxyService } from './mocks/middleware-proxy.mock';
import {
  TEST_CREDENTIALS,
  TEST_TOKENS,
  TEST_ADMIN,
  TEST_TENANT,
} from './fixtures/test-data';
import {
  expectSuccessResponse,
  expectErrorResponse,
  expectAuthError,
  expectLoginResponse,
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
      .overrideProvider(MiddlewareProxyService)
      .useClass(MockMiddlewareProxyService)
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    app.setGlobalPrefix('tenant');

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockPrismaService.resetMocks();
  });

  // ==================== POST /tenant/auth/login ====================

  describe('POST /tenant/auth/login', () => {
    it('应该成功登录并返回令牌', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/auth/login')
        .send(TEST_CREDENTIALS.valid)
        .expect(200);

      // 验证响应格式
      expectLoginResponse(response);

      // 验证令牌格式
      const { accessToken, refreshToken, expiresIn } = response.body.data;
      expect(accessToken).toMatch(/^eyJ/); // JWT 以 eyJ 开头
      expect(refreshToken).toMatch(/^eyJ/);
      expect(expiresIn).toBeGreaterThan(0);
    });

    it('密码错误应返回 AUTH_401_001', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/auth/login')
        .send(TEST_CREDENTIALS.invalidPassword)
        .expect(401);

      expectErrorResponse(response, 'AUTH_401_001');
    });

    it('邮箱不存在应返回 AUTH_401_001', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/auth/login')
        .send(TEST_CREDENTIALS.invalidEmail)
        .expect(401);

      expectErrorResponse(response, 'AUTH_401_001');
    });

    it('账号被禁用应返回 AUTH_403_001', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/auth/login')
        .send(TEST_CREDENTIALS.disabledAdmin)
        .expect(403);

      expectErrorResponse(response, 'AUTH_403_001');
    });

    it('租户暂停应返回 TENANT_403_001', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/auth/login')
        .send(TEST_CREDENTIALS.suspendedTenant)
        .expect(403);

      expectErrorResponse(response, 'TENANT_403_001');
    });

    it('缺少必要字段应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/auth/login')
        .send({ email: 'test@test.com' }) // 缺少 password
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('邮箱格式错误应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/auth/login')
        .send({
          email: 'invalid-email',
          password: 'password123',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== POST /tenant/auth/refresh ====================

  describe('POST /tenant/auth/refresh', () => {
    it('应该成功刷新令牌', async () => {
      // 先登录获取 refreshToken
      const loginResponse = await request(app.getHttpServer())
        .post('/tenant/auth/login')
        .send(TEST_CREDENTIALS.valid)
        .expect(200);

      const { refreshToken } = loginResponse.body.data;

      // 刷新令牌
      const response = await request(app.getHttpServer())
        .post('/tenant/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('expiresIn');
      expect(response.body.data.accessToken).toMatch(/^eyJ/);
    });

    it('无效的 refreshToken 应返回 AUTH_401_002', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expectErrorResponse(response, 'AUTH_401_002');
    });

    it('过期的 refreshToken 应返回 AUTH_401_002', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/auth/refresh')
        .send({ refreshToken: TEST_TOKENS.expired })
        .expect(401);

      expectErrorResponse(response, 'AUTH_401_002');
    });

    it('缺少 refreshToken 应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== GET /tenant/auth/me ====================

  describe('GET /tenant/auth/me', () => {
    it('应该返回当前用户信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/auth/me')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectProfileResponse(response);

      const data = response.body.data;
      expect(data.email).toBe(TEST_ADMIN.email);
      expect(data.role).toBeDefined();
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/auth/me')
        .expect(401);

      expectAuthError(response);
    });

    it('无效 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectAuthError(response);
    });

    it('过期 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/auth/me')
        .set('Authorization', `Bearer ${TEST_TOKENS.expired}`)
        .expect(401);

      expectAuthError(response);
    });

    it('OWNER 角色应能获取信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/auth/me')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expectProfileResponse(response);
      // API 返回小写角色
      expect(response.body.data.role.toUpperCase()).toBe('OWNER');
    });

    it('OPERATOR 角色应能获取信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/auth/me')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(200);

      expectProfileResponse(response);
      // API 返回小写角色
      expect(response.body.data.role.toUpperCase()).toBe('OPERATOR');
    });
  });

  // ==================== POST /tenant/auth/password ====================

  describe('POST /tenant/auth/password', () => {
    it('应该成功修改密码', async () => {
      await request(app.getHttpServer())
        .post('/tenant/auth/password')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'newPassword456',
        })
        .expect(204);
    });

    it('当前密码错误应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/auth/password')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({
          currentPassword: 'wrongPassword',
          newPassword: 'newPassword456',
        })
        .expect(400);

      expectErrorResponse(response);
    });

    it('密码太短应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/auth/password')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({
          currentPassword: 'password123',
          newPassword: '123',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .post('/tenant/auth/password')
        .send({
          currentPassword: 'password123',
          newPassword: 'newPassword456',
          confirmPassword: 'newPassword456',
        })
        .expect(401);
    });
  });

  // ==================== POST /tenant/auth/logout ====================

  describe('POST /tenant/auth/logout', () => {
    it('应该成功登出', async () => {
      await request(app.getHttpServer())
        .post('/tenant/auth/logout')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(204);
    });

    it('无 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .post('/tenant/auth/logout')
        .expect(401);
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('登录应在 500ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .post('/tenant/auth/login')
        .send(TEST_CREDENTIALS.valid);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });

    it('获取当前用户应在 200ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/auth/me')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(200);
    });
  });
});
