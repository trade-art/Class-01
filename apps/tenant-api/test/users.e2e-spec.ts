/**
 * Users 模块 API 契约测试
 * 验证用户管理端点的请求/响应格式
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MiddlewareProxyService } from '../src/middleware-proxy';
import { MockPrismaService } from './mocks/prisma.mock';
import { MockMiddlewareProxyService } from './mocks/middleware-proxy.mock';
import { TEST_TOKENS, TEST_TRADING_USERS } from './fixtures/test-data';
import {
  expectSuccessResponse,
  expectErrorResponse,
  expectAuthError,
  expectForbiddenError,
  expectPaginatedResponse,
  expectNotFoundError,
} from './utils/validators';

describe('UsersController (e2e)', () => {
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

  // ==================== GET /tenant/users ====================

  describe('GET /tenant/users', () => {
    it('应该返回用户列表（分页）', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'users');

      const data = response.body.data;
      expect(data.users).toBeInstanceOf(Array);
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.page).toBeGreaterThanOrEqual(1);
      expect(data.limit).toBeGreaterThan(0);
    });

    it('支持分页参数', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users')
        .query({ page: 2, limit: 10 })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'users');
      expect(response.body.data.page).toBe(2);
      expect(response.body.data.limit).toBe(10);
    });

    it('支持搜索过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users')
        .query({ search: 'Trader' })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'users');
    });

    it('支持组别过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users')
        .query({ group: 'demo' })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'users');
    });

    it('支持状态过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users')
        .query({ status: 'active' })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'users');
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users')
        .expect(401);

      expectAuthError(response);
    });

    it('OPERATOR 角色应能访问', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(200);

      expectPaginatedResponse(response, 'users');
    });
  });

  // ==================== GET /tenant/users/groups ====================

  describe('GET /tenant/users/groups', () => {
    it('应该返回组别列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users/groups')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users/groups')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== GET /tenant/users/:login ====================

  describe('GET /tenant/users/:login', () => {
    it('应该返回用户详情', async () => {
      const testUser = TEST_TRADING_USERS[0];

      const response = await request(app.getHttpServer())
        .get(`/tenant/users/${testUser.login}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data).toHaveProperty('login');
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('email');
      expect(data).toHaveProperty('group');
      expect(data).toHaveProperty('leverage');
      expect(data).toHaveProperty('balance');
      expect(data).toHaveProperty('equity');
    });

    it('login 参数必须是数字', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users/invalid')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('用户不存在应返回 500', async () => {
      // 服务层抛出异常，全局过滤器返回 500
      const response = await request(app.getHttpServer())
        .get('/tenant/users/999999')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users/1001')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== PUT /tenant/users/:login/group ====================

  describe('PUT /tenant/users/:login/group', () => {
    it('OWNER 应能修改用户组别', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/users/1001/group')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({ group: 'real' })
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('group');
    });

    it('ADMIN 应能修改用户组别', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/users/1001/group')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({ group: 'demo' })
        .expect(200);

      expectSuccessResponse(response);
    });

    it('OPERATOR 无权修改用户组别', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/users/1001/group')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .send({ group: 'real' })
        .expect(403);

      expectForbiddenError(response);
    });

    it('缺少 group 字段应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/users/1001/group')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .put('/tenant/users/1001/group')
        .send({ group: 'demo' })
        .expect(401);
    });
  });

  // ==================== PUT /tenant/users/:login/leverage ====================

  describe('PUT /tenant/users/:login/leverage', () => {
    it('OWNER 应能修改用户杠杆', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/users/1001/leverage')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({ leverage: 200 })
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('leverage');
    });

    it('ADMIN 应能修改用户杠杆', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/users/1001/leverage')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({ leverage: 100 })
        .expect(200);

      expectSuccessResponse(response);
    });

    it('OPERATOR 无权修改用户杠杆', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/users/1001/leverage')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .send({ leverage: 200 })
        .expect(403);

      expectForbiddenError(response);
    });

    it('杠杆值必须是正数', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/users/1001/leverage')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({ leverage: -1 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== PUT /tenant/users/:login/status ====================

  describe('PUT /tenant/users/:login/status', () => {
    it('OWNER 应能修改用户状态', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/users/1001/status')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({ status: 'disabled' })
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('status');
    });

    it('OPERATOR 无权修改用户状态', async () => {
      const response = await request(app.getHttpServer())
        .put('/tenant/users/1001/status')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .send({ status: 'disabled' })
        .expect(403);

      expectForbiddenError(response);
    });
  });

  // ==================== GET /tenant/users/:login/transactions ====================

  describe('GET /tenant/users/:login/transactions', () => {
    it('应该返回用户交易记录', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users/1001/transactions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('transactions');
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data.transactions).toBeInstanceOf(Array);
    });

    it('支持时间范围过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users/1001/transactions')
        .query({
          from: '2024-01-01',
          to: '2024-01-31',
        })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('无 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .get('/tenant/users/1001/transactions')
        .expect(401);
    });
  });

  // ==================== GET /tenant/users/:login/logs ====================

  describe('GET /tenant/users/:login/logs', () => {
    it('应该返回用户操作日志', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/users/1001/logs')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('logs');
      expect(response.body.data).toHaveProperty('total');
    });

    it('无 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .get('/tenant/users/1001/logs')
        .expect(401);
    });
  });

  // ==================== POST /tenant/users/export ====================

  describe('POST /tenant/users/export', () => {
    it('OWNER 应能导出用户数据 (CSV)', async () => {
      // POST 返回 201 Created，但实际返回 CSV 文件内容
      const response = await request(app.getHttpServer())
        .post('/tenant/users/export')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({ format: 'csv' });

      // NestJS POST 默认返回 201，但控制器使用 res.send() 直接发送文件
      // 状态码取决于控制器实现，实际是 200
      expect([200, 201]).toContain(response.status);
      expect(response.header['content-type']).toContain('text/csv');
      expect(response.header['content-disposition']).toContain('attachment');
    });

    it('ADMIN 应能导出用户数据', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/users/export')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({ format: 'csv' });

      expect([200, 201]).toContain(response.status);
      expect(response.header['content-type']).toContain('text/csv');
    });

    it('OPERATOR 无权导出用户数据', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/users/export')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .send({ format: 'csv' })
        .expect(403);

      expectForbiddenError(response);
    });

    it('Excel 格式暂未实现应返回 501', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/users/export')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .send({ format: 'xlsx' })
        .expect(501);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('用户列表应在 500ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/users')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });

    it('用户详情应在 300ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/users/1001')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(300);
    });
  });
});
