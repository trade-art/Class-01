/**
 * Reports 模块 API 契约测试
 * 验证报表端点的请求/响应格式
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MiddlewareProxyService } from '../src/middleware-proxy';
import { MockPrismaService } from './mocks/prisma.mock';
import { MockMiddlewareProxyService } from './mocks/middleware-proxy.mock';
import { TEST_TOKENS } from './fixtures/test-data';
import {
  expectSuccessResponse,
  expectAuthError,
  expectForbiddenError,
} from './utils/validators';

describe('ReportsController (e2e)', () => {
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

  // ==================== GET /tenant/reports/trading ====================

  describe('GET /tenant/reports/trading', () => {
    it('应该返回交易报表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/reports/trading')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      // 实际 API 返回格式
      expect(data).toHaveProperty('period');
      expect(data).toHaveProperty('totalVolume');
      expect(data).toHaveProperty('volumeTrend');
    });

    it('支持时间范围过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/reports/trading')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('支持周期类型 (day/week/month)', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/reports/trading')
        .query({
          period: 'week',
        })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('所有角色应能访问', async () => {
      // OWNER
      await request(app.getHttpServer())
        .get('/tenant/reports/trading')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      // ADMIN
      await request(app.getHttpServer())
        .get('/tenant/reports/trading')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      // OPERATOR
      await request(app.getHttpServer())
        .get('/tenant/reports/trading')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(200);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/reports/trading')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== GET /tenant/reports/users ====================

  describe('GET /tenant/reports/users', () => {
    it('应该返回用户报表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/reports/users')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      // 实际 API 返回格式
      expect(data).toHaveProperty('totalUsers');
      expect(data).toHaveProperty('activeUsers');
      expect(data).toHaveProperty('userValueRanking');
    });

    it('支持时间范围过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/reports/users')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/reports/users')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== GET /tenant/reports/finance ====================

  describe('GET /tenant/reports/finance', () => {
    it('应该返回财务报表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/reports/finance')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      // 实际 API 返回格式
      expect(data).toHaveProperty('totalDeposit');
      expect(data).toHaveProperty('totalCommission');
      expect(data).toHaveProperty('monthlyComparison');
    });

    it('支持时间范围过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/reports/finance')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/reports/finance')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== POST /tenant/reports/:type/export ====================

  describe('POST /tenant/reports/:type/export', () => {
    describe('交易报表导出', () => {
      it('OWNER 应能导出交易报表 (CSV)', async () => {
        const response = await request(app.getHttpServer())
          .post('/tenant/reports/trading/export')
          .query({ format: 'csv' })
          .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
          .expect(201);

        expect(response.header['content-type']).toContain('text/csv');
        expect(response.header['content-disposition']).toContain('attachment');
      });

      it('ADMIN 应能导出交易报表', async () => {
        const response = await request(app.getHttpServer())
          .post('/tenant/reports/trading/export')
          .query({ format: 'csv' })
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(201);

        expect(response.header['content-type']).toContain('text/csv');
      });

      it('OPERATOR 无权导出报表', async () => {
        const response = await request(app.getHttpServer())
          .post('/tenant/reports/trading/export')
          .query({ format: 'csv' })
          .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
          .expect(403);

        expectForbiddenError(response);
      });
    });

    describe('用户报表导出', () => {
      it('应该成功导出用户报表', async () => {
        const response = await request(app.getHttpServer())
          .post('/tenant/reports/users/export')
          .query({ format: 'csv' })
          .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
          .expect(201);

        expect(response.header['content-type']).toContain('text/csv');
      });
    });

    describe('财务报表导出', () => {
      it('应该成功导出财务报表', async () => {
        const response = await request(app.getHttpServer())
          .post('/tenant/reports/finance/export')
          .query({ format: 'csv' })
          .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
          .expect(201);

        expect(response.header['content-type']).toContain('text/csv');
      });
    });

    it('支持时间范围过滤', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/reports/trading/export')
        .query({
          format: 'csv',
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        })
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(201);

      expect(response.header['content-type']).toContain('text/csv');
    });

    it('无效报表类型应返回 500', async () => {
      // 服务层抛出异常，全局过滤器返回 500
      const response = await request(app.getHttpServer())
        .post('/tenant/reports/invalid-type/export')
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('无 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .post('/tenant/reports/trading/export')
        .query({ format: 'csv' })
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

    it('获取交易报表应正常处理（服务降级）', async () => {
      // 服务降级可能返回 200（部分数据）或 503（完全失败）
      const response = await request(app.getHttpServer())
        .get('/tenant/reports/trading')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      expect(response.status === 200 || response.status === 503).toBe(true);
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('交易报表应在 1000ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/reports/trading')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000);
    });

    it('用户报表应在 1000ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/reports/users')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000);
    });

    it('财务报表应在 1000ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/reports/finance')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
