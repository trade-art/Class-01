/**
 * Settings 模块 API 契约测试
 * 验证设置端点的请求/响应格式
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
  TEST_TOKENS,
  TEST_TENANT,
  TEST_ADMIN,
  TEST_API_KEYS,
} from './fixtures/test-data';
import {
  expectSuccessResponse,
  expectAuthError,
  expectForbiddenError,
  expectNotFoundError,
  expectApiKeyCreatedResponse,
} from './utils/validators';

describe('SettingsController (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;
  let mockMiddlewareProxyService: MockMiddlewareProxyService;

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();
    mockMiddlewareProxyService = new MockMiddlewareProxyService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(MiddlewareProxyService)
      .useValue(mockMiddlewareProxyService)
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
    mockMiddlewareProxyService.resetMocks();
  });

  // ==================== GET /tenant/settings/branding ====================

  describe('GET /tenant/settings/branding', () => {
    it('应该返回白标配置', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/branding')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      // API 返回 displayName、logo、primaryColor (不返回 name)
      expect(data).toHaveProperty('displayName');
      expect(data).toHaveProperty('logo');
      expect(data).toHaveProperty('primaryColor');
    });

    it('所有角色应能访问', async () => {
      // OWNER
      await request(app.getHttpServer())
        .get('/tenant/settings/branding')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      // ADMIN
      await request(app.getHttpServer())
        .get('/tenant/settings/branding')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      // OPERATOR
      await request(app.getHttpServer())
        .get('/tenant/settings/branding')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(200);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/branding')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== PUT /tenant/settings/branding ====================

  describe('PUT /tenant/settings/branding', () => {
    it('OWNER 应能更新白标配置', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/settings/branding')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({
          displayName: 'Updated Name',
          primaryColor: '#ff0000',
        })
        .expect(200);

      expectSuccessResponse(response);
    });

    it('ADMIN 无权更新白标配置', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/settings/branding')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({
          displayName: 'Updated Name',
        })
        .expect(403);

      expectForbiddenError(response);
    });

    it('OPERATOR 无权更新白标配置', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/settings/branding')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .send({
          displayName: 'Updated Name',
        })
        .expect(403);

      expectForbiddenError(response);
    });

    it('无 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .put('/tenant/settings/branding')
        .send({ displayName: 'Test' })
        .expect(401);
    });
  });

  // ==================== GET /tenant/settings/admins ====================

  describe('GET /tenant/settings/admins', () => {
    it('OWNER 应能获取管理员列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('admins');
      expect(response.body.data.admins).toBeInstanceOf(Array);
    });

    it('ADMIN 无权获取管理员列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(403);

      expectForbiddenError(response);
    });

    it('OPERATOR 无权获取管理员列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(403);

      expectForbiddenError(response);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/admins')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== POST /tenant/settings/admins ====================

  describe('POST /tenant/settings/admins', () => {
    it('OWNER 应能创建管理员', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/settings/admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({
          email: 'newadmin@test.com',
          password: 'password123',
          name: 'New Admin',
          role: 'ADMIN',
        })
        .expect(201);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('email');
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('role');
    });

    it('ADMIN 无权创建管理员', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/settings/admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({
          email: 'newadmin@test.com',
          password: 'password123',
          name: 'New Admin',
          role: 'ADMIN',
        })
        .expect(403);

      expectForbiddenError(response);
    });

    it('缺少必要字段应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/settings/admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({
          email: 'test@test.com',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无效邮箱格式应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/settings/admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({
          email: 'invalid-email',
          password: 'password123',
          name: 'Test',
          role: 'ADMIN',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== PUT /tenant/settings/admins/:id ====================

  describe('PUT /tenant/settings/admins/:id', () => {
    it('OWNER 应能更新管理员', async () => {
      const response = await request(app.getHttpServer())
        .put(`/tenant/settings/admins/${TEST_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({
          name: 'Updated Admin Name',
        })
        .expect(200);

      expectSuccessResponse(response);
    });

    it('管理员不存在应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/settings/admins/non-existent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({
          name: 'Updated Name',
        })
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== POST /tenant/settings/admins/:id/reset-password ====================

  describe('POST /tenant/settings/admins/:id/reset-password', () => {
    it('OWNER 应能重置管理员密码', async () => {
      const response = await request(app.getHttpServer())
        .post(`/tenant/settings/admins/${TEST_ADMIN.id}/reset-password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({
          newPassword: 'newPassword123',
        })
        .expect(201);

      expect(response.status).toBe(201);
    });

    it('缺少新密码应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post(`/tenant/settings/admins/${TEST_ADMIN.id}/reset-password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('密码太短应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post(`/tenant/settings/admins/${TEST_ADMIN.id}/reset-password`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({
          newPassword: '123',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== DELETE /tenant/settings/admins/:id ====================

  describe('DELETE /tenant/settings/admins/:id', () => {
    it('OWNER 应能删除管理员', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/tenant/settings/admins/${TEST_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expect(response.status).toBe(200);
    });

    it('ADMIN 无权删除管理员', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/tenant/settings/admins/${TEST_ADMIN.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(403);

      expectForbiddenError(response);
    });
  });

  // ==================== GET /tenant/settings/api-keys ====================

  describe('GET /tenant/settings/api-keys', () => {
    it('OWNER 应能获取 API 密钥列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/api-keys')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('apiKeys');
      expect(response.body.data.apiKeys).toBeInstanceOf(Array);
    });

    it('ADMIN 应能获取 API 密钥列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/api-keys')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('OPERATOR 无权获取 API 密钥列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/api-keys')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(403);

      expectForbiddenError(response);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/api-keys')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== POST /tenant/settings/api-keys ====================

  describe('POST /tenant/settings/api-keys', () => {
    it('应该成功创建 API 密钥', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/settings/api-keys')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({
          name: 'Test API Key',
          permissions: ['read', 'write'],
        })
        .expect(201);

      expectApiKeyCreatedResponse(response);
    });

    it('缺少 name 字段应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/settings/api-keys')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({
          permissions: ['read'],
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== DELETE /tenant/settings/api-keys/:id ====================

  describe('DELETE /tenant/settings/api-keys/:id', () => {
    it('应该成功删除 API 密钥', async () => {
      const testKey = TEST_API_KEYS[0];

      const response = await request(app.getHttpServer())
        .delete(`/tenant/settings/api-keys/${testKey.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expect(response.status).toBe(200);
    });

    it('API 密钥不存在应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .delete('/tenant/settings/api-keys/non-existent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== GET /tenant/settings/notifications ====================

  describe('GET /tenant/settings/notifications', () => {
    it('OWNER 应能获取通知设置', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/notifications')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data).toHaveProperty('riskAlertEmail');
      expect(data).toHaveProperty('webhookEnabled');
    });

    it('ADMIN 应能获取通知设置', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/notifications')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('OPERATOR 无权获取通知设置', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/notifications')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(403);

      expectForbiddenError(response);
    });
  });

  // ==================== PUT /tenant/settings/notifications ====================

  describe('PUT /tenant/settings/notifications', () => {
    it('应该成功更新通知设置', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/settings/notifications')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({
          riskAlertEmail: false,
          webhookEnabled: true,
          webhookUrl: 'https://new-webhook.example.com',
        })
        .expect(200);

      expectSuccessResponse(response);
    });

    it('无效的 webhook URL 应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/settings/notifications')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({
          webhookEnabled: true,
          webhookUrl: 'invalid-url',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== GET /tenant/settings/mt5-server ====================

  describe('GET /tenant/settings/mt5-server', () => {
    it('应该返回 MT5 服务器信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/mt5-server')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data).toHaveProperty('connected');
      expect(data).toHaveProperty('serverName');
    });

    it('所有角色应能访问', async () => {
      // OWNER
      await request(app.getHttpServer())
        .get('/tenant/settings/mt5-server')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      // ADMIN
      await request(app.getHttpServer())
        .get('/tenant/settings/mt5-server')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      // OPERATOR
      await request(app.getHttpServer())
        .get('/tenant/settings/mt5-server')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(200);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/settings/mt5-server')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('白标配置应在 200ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/settings/branding')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(200);
    });

    it('管理员列表应在 300ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/settings/admins')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(300);
    });
  });
});
