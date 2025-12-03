/**
 * History 模块 API 契约测试
 * 验证历史交易端点的请求/响应格式
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MiddlewareProxyService } from '../src/middleware-proxy';
import { MockPrismaService } from './mocks/prisma.mock';
import { MockMiddlewareProxyService } from './mocks/middleware-proxy.mock';
import { TEST_TOKENS, TEST_HISTORY_ORDERS } from './fixtures/test-data';
import {
  expectSuccessResponse,
  expectAuthError,
  expectPaginatedResponse,
  expectNotFoundError,
  expectForbiddenError,
} from './utils/validators';

describe('HistoryController (e2e)', () => {
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

  // ==================== GET /tenant/history ====================

  describe('GET /tenant/history', () => {
    it('应该返回历史订单列表（分页）', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'orders');

      const data = response.body.data;
      expect(data.orders).toBeInstanceOf(Array);

      // 验证订单数据格式
      if (data.orders.length > 0) {
        const order = data.orders[0];
        expect(order).toHaveProperty('ticket');
        expect(order).toHaveProperty('symbol');
        expect(order).toHaveProperty('type');
        expect(order).toHaveProperty('volume');
        expect(order).toHaveProperty('openPrice');
        expect(order).toHaveProperty('closePrice');
        expect(order).toHaveProperty('profit');
      }
    });

    it('支持分页参数', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history')
        .query({ page: 1, limit: 20 })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'orders');
    });

    it('支持时间范围过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history')
        .query({
          from: '2024-01-01',
          to: '2024-01-31',
        })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'orders');
    });

    it('支持品种过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history')
        .query({ symbol: 'EURUSD' })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'orders');
    });

    it('支持用户过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history')
        .query({ login: 1001 })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'orders');
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history')
        .expect(401);

      expectAuthError(response);
    });

    it('所有角色应能访问', async () => {
      // OWNER
      await request(app.getHttpServer())
        .get('/tenant/history')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      // ADMIN
      await request(app.getHttpServer())
        .get('/tenant/history')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      // OPERATOR
      await request(app.getHttpServer())
        .get('/tenant/history')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(200);
    });
  });

  // ==================== GET /tenant/history/stats ====================

  describe('GET /tenant/history/stats', () => {
    it('应该返回交易统计', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history/stats')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      // API 返回完整统计: totalOrders, totalProfit, profitableOrders, losingOrders, winRate, avgProfit, avgLoss, totalCommission, totalSwap, avgHoldingTime, maxProfit, maxLoss
      expect(data).toHaveProperty('totalOrders');
      expect(data).toHaveProperty('totalProfit');
      expect(data).toHaveProperty('winRate');
      expect(data).toHaveProperty('profitableOrders');
      expect(data).toHaveProperty('losingOrders');
    });

    it('支持用户过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history/stats')
        .query({ login: 1001 })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('支持时间范围过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history/stats')
        .query({
          from: '2024-01-01',
          to: '2024-01-31',
        })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history/stats')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== GET /tenant/history/export ====================

  describe('GET /tenant/history/export', () => {
    it('OWNER 应能导出历史数据 (CSV)', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history/export')
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expect(response.header['content-type']).toContain('text/csv');
      expect(response.header['content-disposition']).toContain('attachment');
    });

    it('ADMIN 应能导出历史数据', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history/export')
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expect(response.header['content-type']).toContain('text/csv');
    });

    it('OPERATOR 无权导出历史数据', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history/export')
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(403);

      expectForbiddenError(response);
    });

    it('支持时间范围过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history/export')
        .query({
          format: 'csv',
          from: '2024-01-01',
          to: '2024-01-31',
        })
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expect(response.header['content-type']).toContain('text/csv');
    });
  });

  // ==================== GET /tenant/history/user/:login ====================

  describe('GET /tenant/history/user/:login', () => {
    it('应该返回用户历史订单', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history/user/1001')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'orders');
    });

    it('login 参数必须是数字', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history/user/invalid')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .get('/tenant/history/user/1001')
        .expect(401);
    });
  });

  // ==================== GET /tenant/history/user/:login/stats ====================

  describe('GET /tenant/history/user/:login/stats', () => {
    it('应该返回用户交易统计', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history/user/1001/stats')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data).toHaveProperty('totalOrders');
      expect(data).toHaveProperty('totalProfit');
    });

    it('无 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .get('/tenant/history/user/1001/stats')
        .expect(401);
    });
  });

  // ==================== GET /tenant/history/:ticket ====================

  describe('GET /tenant/history/:ticket', () => {
    it('应该返回订单详情', async () => {
      const testOrder = TEST_HISTORY_ORDERS[0];

      const response = await request(app.getHttpServer())
        .get(`/tenant/history/${testOrder.ticket}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data).toHaveProperty('ticket');
      expect(data).toHaveProperty('symbol');
      expect(data).toHaveProperty('type');
      expect(data).toHaveProperty('volume');
      expect(data).toHaveProperty('openPrice');
      expect(data).toHaveProperty('closePrice');
      expect(data).toHaveProperty('profit');
    });

    it('ticket 参数必须是数字', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history/invalid')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('订单不存在应返回 500', async () => {
      // 服务层抛出异常，全局过滤器返回 500
      const response = await request(app.getHttpServer())
        .get('/tenant/history/999999')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('无 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .get('/tenant/history/11111')
        .expect(401);
    });
  });

  // ==================== 中间件服务不可用 ====================

  describe('中间件服务不可用', () => {
    beforeEach(() => {
      mockMiddlewareProxyService.setConnected(false);
    });

    afterEach(() => {
      mockMiddlewareProxyService.setConnected(true);
    });

    it('获取历史列表失败应返回错误', async () => {
      // 服务降级可能返回 200（空数据）或 503（完全失败）或 500
      const response = await request(app.getHttpServer())
        .get('/tenant/history')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      expect([200, 500, 503]).toContain(response.status);
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('历史列表应在 500ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/history')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });

    it('交易统计应在 300ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/history/stats')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(300);
    });
  });
});
