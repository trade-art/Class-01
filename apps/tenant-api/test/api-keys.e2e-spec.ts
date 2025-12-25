/**
 * API Keys 模块 E2E 测试
 * 验证 API Key CRUD 操作和验证端点
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MiddlewareProxyService } from '../src/middleware-proxy';
import { MockPrismaService } from './mocks/prisma.mock';
import { MockMiddlewareProxyService } from './mocks/middleware-proxy.mock';
import { AccountLockoutService } from '../src/security/account-lockout.service';
import { RateLimiterService } from '../src/security/rate-limiter.service';
import { MockAccountLockoutService } from './mocks/account-lockout.mock';
import { MockRateLimiterService } from './mocks/rate-limiter.mock';
import {
  TEST_TOKENS,
  TEST_TENANT,
  TEST_API_KEYS,
} from './fixtures/test-data';
import {
  expectSuccessResponse,
  expectAuthError,
  expectForbiddenError,
  expectNotFoundError,
} from './utils/validators';
import * as crypto from 'crypto';

describe('ApiKeysController (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();
    const mockAccountLockoutService = new MockAccountLockoutService();
    const mockRateLimiterService = new MockRateLimiterService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(MiddlewareProxyService)
      .useClass(MockMiddlewareProxyService)
      .overrideProvider(AccountLockoutService)
      .useValue(mockAccountLockoutService)
      .overrideProvider(RateLimiterService)
      .useValue(mockRateLimiterService)
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

  // ==================== GET /tenant/api-keys ====================

  describe('GET /tenant/api-keys', () => {
    it('OWNER 应能获取 API Key 列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/api-keys')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expectSuccessResponse(response);
      // ResponseInterceptor 将分页响应转换为 { data: items[], meta: { page, pageSize, total, totalPages } }
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toHaveProperty('total');
      expect(response.body.meta).toHaveProperty('page');
      expect(response.body.meta).toHaveProperty('pageSize');
    });

    it('ADMIN 应能获取 API Key 列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/api-keys')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('OPERATOR 无权获取 API Key 列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/api-keys')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(403);

      expectForbiddenError(response);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/api-keys')
        .expect(401);

      expectAuthError(response);
    });

    it('应支持分页参数', async () => {
      await request(app.getHttpServer())
        .get('/tenant/api-keys?page=1&pageSize=10')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalled();
    });

    it('应支持状态过滤', async () => {
      await request(app.getHttpServer())
        .get('/tenant/api-keys?status=active')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalled();
    });
  });

  // ==================== POST /tenant/api-keys ====================

  describe('POST /tenant/api-keys', () => {
    const createDto = {
      name: 'New API Key',
      scopes: ['users:read', 'positions:read'],
      allowedIps: ['192.168.1.0/24'],
      rateLimit: 500,
    };

    it('OWNER 应能创建 API Key', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/api-keys')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send(createDto)
        .expect(201);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('apiKey');
      expect(response.body.data).toHaveProperty('keyPrefix');
      expect(response.body.data.name).toBe(createDto.name);
    });

    it('ADMIN 应能创建 API Key', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/api-keys')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send(createDto)
        .expect(201);

      expectSuccessResponse(response);
    });

    it('OPERATOR 无权创建 API Key', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/api-keys')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .send(createDto)
        .expect(403);

      expectForbiddenError(response);
    });

    it('应拒绝无名称的请求', async () => {
      await request(app.getHttpServer())
        .post('/tenant/api-keys')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({ scopes: ['*'] })
        .expect(400);
    });

    it('应拒绝名称过短的请求', async () => {
      await request(app.getHttpServer())
        .post('/tenant/api-keys')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({ name: 'A' })
        .expect(400);
    });
  });

  // ==================== GET /tenant/api-keys/:id ====================

  describe('GET /tenant/api-keys/:id', () => {
    it('应返回 API Key 详情', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenant/api-keys/${TEST_API_KEYS[0].id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('keyPrefix');
      expect(response.body.data).toHaveProperty('scopes');
    });

    it('不存在的 Key 应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/api-keys/non-existent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== PATCH /tenant/api-keys/:id ====================

  describe('PATCH /tenant/api-keys/:id', () => {
    const updateDto = {
      name: 'Updated Name',
      allowedIps: ['10.0.0.0/8'],
    };

    it('OWNER 应能更新 API Key', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tenant/api-keys/${TEST_API_KEYS[0].id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send(updateDto)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('不存在的 Key 应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .patch('/tenant/api-keys/non-existent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send(updateDto)
        .expect(404);

      expectNotFoundError(response);
    });

    it('已撤销的 Key 应返回 409', async () => {
      // key-003 is the revoked key
      await request(app.getHttpServer())
        .patch(`/tenant/api-keys/${TEST_API_KEYS[2].id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send(updateDto)
        .expect(409);
    });
  });

  // ==================== DELETE /tenant/api-keys/:id ====================

  describe('DELETE /tenant/api-keys/:id', () => {
    it('OWNER 应能撤销 API Key', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/tenant/api-keys/${TEST_API_KEYS[0].id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data.isActive).toBe(false);
    });

    it('不存在的 Key 应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .delete('/tenant/api-keys/non-existent-id')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('已撤销的 Key 应返回 409', async () => {
      // key-003 is the revoked key
      await request(app.getHttpServer())
        .delete(`/tenant/api-keys/${TEST_API_KEYS[2].id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(409);
    });
  });

  // ==================== POST /internal/api-keys/validate ====================

  describe('POST /internal/api-keys/validate', () => {
    const internalSecret = 'internal-secret-change-me'; // 默认测试密钥

    it('应验证有效的 API Key', async () => {
      // 使用已知的 hashedKey 设置 mock (API Key 需要至少 32 个字符)
      const rawApiKey = 'mk_test_valid_key_1234567890abcdef12345';
      const hashedKey = crypto.createHash('sha256').update(rawApiKey).digest('hex');

      // 直接设置 mock 返回值
      mockPrismaService.apiKey.findFirst = jest.fn().mockResolvedValue({
        ...TEST_API_KEYS[0],
        hashedKey,
      });

      const response = await request(app.getHttpServer())
        .post('/internal/api-keys/validate')
        .set('X-Internal-Secret', internalSecret)
        .send({
          apiKey: rawApiKey,
        })
        .expect(200);

      // 响应被 ResponseInterceptor 包装在 { success: true, data: {...} } 结构中
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.keyId).toBeDefined();
      expect(response.body.data.tenantId).toBeDefined();
    });

    it('无效的内部密钥应返回 401', async () => {
      await request(app.getHttpServer())
        .post('/internal/api-keys/validate')
        .set('X-Internal-Secret', 'wrong-secret')
        .send({
          apiKey: 'mk_test_key_1234567890abcdef12345678',
        })
        .expect(401);
    });

    it('缺少内部密钥应返回 401', async () => {
      await request(app.getHttpServer())
        .post('/internal/api-keys/validate')
        .send({
          apiKey: 'mk_test_key_1234567890abcdef12345678',
        })
        .expect(401);
    });

    it('无效的 API Key 应返回验证失败', async () => {
      mockPrismaService.apiKey.findFirst = jest.fn().mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .post('/internal/api-keys/validate')
        .set('X-Internal-Secret', internalSecret)
        .send({
          apiKey: 'mk_invalid_key_value_1234567890abcdef',
        })
        .expect(200);

      expect(response.body.data.valid).toBe(false);
      expect(response.body.data.errorCode).toBe('INVALID_KEY');
    });

    it('已撤销的 Key 应返回验证失败', async () => {
      const rawApiKey = 'mk_revoked_key_1234567890abcdef12345';
      const hashedKey = crypto.createHash('sha256').update(rawApiKey).digest('hex');

      mockPrismaService.apiKey.findFirst = jest.fn().mockResolvedValue({
        ...TEST_API_KEYS[2], // 已撤销的 key
        hashedKey,
      });

      const response = await request(app.getHttpServer())
        .post('/internal/api-keys/validate')
        .set('X-Internal-Secret', internalSecret)
        .send({
          apiKey: rawApiKey,
        })
        .expect(200);

      expect(response.body.data.valid).toBe(false);
      expect(response.body.data.errorCode).toBe('REVOKED');
    });

    it('应支持作用域验证', async () => {
      const rawApiKey = 'mk_scope_test_key_1234567890abcdef12';
      const hashedKey = crypto.createHash('sha256').update(rawApiKey).digest('hex');

      mockPrismaService.apiKey.findFirst = jest.fn().mockResolvedValue({
        ...TEST_API_KEYS[1], // 只有 users:read, positions:read 权限
        hashedKey,
      });

      const response = await request(app.getHttpServer())
        .post('/internal/api-keys/validate')
        .set('X-Internal-Secret', internalSecret)
        .send({
          apiKey: rawApiKey,
          requiredScopes: ['trading:execute'],
        })
        .expect(200);

      expect(response.body.data.valid).toBe(false);
      expect(response.body.data.errorCode).toBe('SCOPE_DENIED');
    });

    it('应支持 IP 白名单验证', async () => {
      const rawApiKey = 'mk_ip_test_key_1234567890abcdef12345';
      const hashedKey = crypto.createHash('sha256').update(rawApiKey).digest('hex');

      mockPrismaService.apiKey.findFirst = jest.fn().mockResolvedValue({
        ...TEST_API_KEYS[1], // 有 IP 白名单 192.168.1.0/24
        hashedKey,
      });

      const response = await request(app.getHttpServer())
        .post('/internal/api-keys/validate')
        .set('X-Internal-Secret', internalSecret)
        .send({
          apiKey: rawApiKey,
          clientIp: '10.0.0.1', // 不在白名单中
        })
        .expect(200);

      expect(response.body.data.valid).toBe(false);
      expect(response.body.data.errorCode).toBe('IP_NOT_ALLOWED');
    });

    it('通配符 scope 应允许所有操作', async () => {
      const rawApiKey = 'mk_wildcard_scope_key_12345678901234';
      const hashedKey = crypto.createHash('sha256').update(rawApiKey).digest('hex');

      mockPrismaService.apiKey.findFirst = jest.fn().mockResolvedValue({
        ...TEST_API_KEYS[0], // 有通配符 scope ['*']
        hashedKey,
      });
      mockPrismaService.apiKey.update = jest.fn().mockResolvedValue(TEST_API_KEYS[0]);

      const response = await request(app.getHttpServer())
        .post('/internal/api-keys/validate')
        .set('X-Internal-Secret', internalSecret)
        .send({
          apiKey: rawApiKey,
          requiredScopes: ['trading:execute', 'admin:write'],
        })
        .expect(200);

      expect(response.body.data.valid).toBe(true);
    });
  });
});
