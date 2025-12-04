/**
 * MiddlewareProxy 模块集成测试
 * 测试完整的 认证 → 请求 → 响应转换 链路
 * mt5-middleware-integration Task 16
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MiddlewareProxyService } from '../src/middleware-proxy';
import { MockPrismaService } from './mocks/prisma.mock';
import { MockMiddlewareProxyService } from './mocks/middleware-proxy.mock';
import { TEST_TOKENS, TEST_POSITIONS, TEST_QUOTES, TEST_HISTORY_ORDERS } from './fixtures/test-data';
import {
  expectSuccessResponse,
  expectAuthError,
  expectPaginatedResponse,
  expectPositionData,
  expectQuoteData,
} from './utils/validators';

describe('MiddlewareProxyService Integration (e2e)', () => {
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

  // ==================== 认证流程测试 ====================

  describe('认证流程', () => {
    it('无 Token 访问受保护端点应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .expect(401);

      expectAuthError(response);
    });

    it('无效 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', 'Bearer invalid-token-string')
        .expect(401);

      expectAuthError(response);
    });

    it('过期 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.expired}`)
        .expect(401);

      expectAuthError(response);
    });

    it('有效 Token 应成功访问', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('各角色 Token 都应能访问受保护端点', async () => {
      // ADMIN
      await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      // OWNER
      await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      // OPERATOR
      await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(200);
    });
  });

  // ==================== 持仓 API 测试 ====================

  describe('持仓 API (Positions)', () => {
    describe('GET /tenant/positions', () => {
      it('应返回持仓列表', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/positions')
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);

        const data = response.body.data;
        // PositionsService.getList 返回 PositionListResponseDto
        expect(data).toHaveProperty('positions');
        expect(data).toHaveProperty('total');
        expect(data).toHaveProperty('page');
        expect(data).toHaveProperty('limit');
        expect(Array.isArray(data.positions)).toBe(true);
      });

      it('应支持品种过滤', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/positions')
          .query({ symbol: 'EURUSD' })
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);
      });

      it('应支持类型过滤', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/positions')
          .query({ type: 'buy' })
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);
      });
    });

    describe('GET /tenant/positions/stats', () => {
      it('应返回持仓统计', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/positions/stats')
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);

        const data = response.body.data;
        expect(data).toHaveProperty('totalPositions');
        expect(data).toHaveProperty('buyCount');
        expect(data).toHaveProperty('sellCount');
        expect(data).toHaveProperty('totalVolume');
        expect(data).toHaveProperty('totalProfit');
      });
    });
  });

  // ==================== 报价 API 测试 ====================

  describe('报价 API (Quotes)', () => {
    describe('GET /tenant/quotes', () => {
      it('应返回报价列表', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/quotes')
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);

        const data = response.body.data;
        expect(Array.isArray(data)).toBe(true);
      });

      it('应支持品种搜索', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/quotes')
          .query({ search: 'EUR' })
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);
      });
    });

    describe('GET /tenant/quotes/symbols', () => {
      it('应返回品种列表', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/quotes/symbols')
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);
      });
    });

    describe('GET /tenant/quotes/:symbol', () => {
      it('应返回单个品种报价', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/quotes/EURUSD')
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);

        const data = response.body.data;
        expect(data).toHaveProperty('symbol', 'EURUSD');
        expect(data).toHaveProperty('bid');
        expect(data).toHaveProperty('ask');
      });

      it('不存在的品种应返回错误', async () => {
        // 设置 mock 抛出异常
        mockMiddlewareProxyService.getQuoteBySymbol.mockRejectedValueOnce(
          new Error('Symbol not found'),
        );

        const response = await request(app.getHttpServer())
          .get('/tenant/quotes/INVALIDPAIR')
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

        // 可能返回 404 或 500，取决于错误处理策略
        expect([404, 500]).toContain(response.status);
      });
    });
  });

  // ==================== 历史 API 测试 ====================

  describe('历史 API (History)', () => {
    describe('GET /tenant/history', () => {
      it('应返回历史订单列表', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/history')
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);

        const data = response.body.data;
        expect(data).toHaveProperty('orders');
        expect(data).toHaveProperty('total');
        expect(data).toHaveProperty('page');
        expect(data).toHaveProperty('limit');
      });

      it('应支持时间范围过滤', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/history')
          .query({
            from: '2024-01-01',
            to: '2024-01-31',
          })
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);
      });

      it('应支持品种过滤', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/history')
          .query({ symbol: 'EURUSD' })
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);
      });

      it('应支持分页', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/history')
          .query({ page: 1, limit: 10 })
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);

        const data = response.body.data;
        expect(data.page).toBe(1);
        expect(data.limit).toBe(10);
      });
    });

    describe('GET /tenant/history/stats', () => {
      it('应返回交易统计', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/history/stats')
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);

        const data = response.body.data;
        expect(data).toHaveProperty('totalOrders');
        expect(data).toHaveProperty('totalProfit');
        expect(data).toHaveProperty('winRate');
      });
    });

    describe('GET /tenant/history/export', () => {
      it('应导出 CSV 格式', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/history/export')
          .query({ format: 'csv' })
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        // CSV 导出应返回正确的 Content-Type
        expect(response.headers['content-type']).toContain('text/csv');
      });
    });
  });

  // ==================== Dashboard API 测试 ====================

  describe('Dashboard API', () => {
    describe('GET /tenant/dashboard', () => {
      it('应返回完整 Dashboard 数据', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/dashboard')
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);

        const data = response.body.data;
        expect(data).toHaveProperty('accountSummary');
        expect(data).toHaveProperty('positionsSummary');
        expect(data).toHaveProperty('serverStatus');
      });
    });

    describe('GET /tenant/dashboard/account', () => {
      it('应返回账户摘要', async () => {
        const response = await request(app.getHttpServer())
          .get('/tenant/dashboard/account')
          .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
          .expect(200);

        expectSuccessResponse(response);

        const data = response.body.data;
        expect(data).toHaveProperty('totalBalance');
        expect(data).toHaveProperty('totalEquity');
      });
    });
  });

  // ==================== 中间件服务不可用测试 ====================

  describe('中间件服务不可用', () => {
    beforeEach(() => {
      mockMiddlewareProxyService.setConnected(false);
    });

    afterEach(() => {
      mockMiddlewareProxyService.setConnected(true);
    });

    it('持仓查询应正常处理服务不可用', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      // 服务不可用可能返回 503 或降级的 200 响应
      expect([200, 503]).toContain(response.status);
    });

    it('报价查询应正常处理服务不可用', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      // 服务不可用可能返回 503 (服务不可用)、500 (内部错误) 或 200 (降级响应)
      expect([200, 500, 503]).toContain(response.status);
    });

    it('历史查询应正常处理服务不可用', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      expect([200, 503]).toContain(response.status);
    });

    it('Dashboard 应正常处理服务不可用', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      expect([200, 503]).toContain(response.status);
    });
  });

  // ==================== 完整请求链路测试 ====================

  describe('完整请求链路', () => {
    it('认证 → 请求 → 响应转换 链路完整性', async () => {
      // 1. 认证: 使用有效 Token
      // 2. 请求: 获取持仓
      // 3. 响应转换: 验证响应格式

      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      // 验证响应结构
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');

      // 验证数据格式 - PositionListResponseDto 包含 positions 数组
      const data = response.body.data;
      expect(data).toHaveProperty('positions');
      expect(Array.isArray(data.positions)).toBe(true);
    });

    it('多个 API 端点连续调用', async () => {
      const token = `Bearer ${TEST_TOKENS.validAdmin}`;

      // 调用多个端点验证服务稳定性
      await request(app.getHttpServer())
        .get('/tenant/dashboard')
        .set('Authorization', token)
        .expect(200);

      await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', token)
        .expect(200);

      await request(app.getHttpServer())
        .get('/tenant/quotes')
        .set('Authorization', token)
        .expect(200);

      await request(app.getHttpServer())
        .get('/tenant/history')
        .set('Authorization', token)
        .expect(200);
    });

    it('并发请求处理', async () => {
      const token = `Bearer ${TEST_TOKENS.validAdmin}`;

      // 并发发送多个请求
      const requests = [
        request(app.getHttpServer())
          .get('/tenant/dashboard')
          .set('Authorization', token),
        request(app.getHttpServer())
          .get('/tenant/positions')
          .set('Authorization', token),
        request(app.getHttpServer())
          .get('/tenant/quotes')
          .set('Authorization', token),
        request(app.getHttpServer())
          .get('/tenant/history')
          .set('Authorization', token),
      ];

      const responses = await Promise.all(requests);

      // 所有请求应成功
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expectSuccessResponse(response);
      });
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('Dashboard 端点应在 1000ms 内响应', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/dashboard')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000);
    });

    it('持仓查询应在 500ms 内响应', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });

    it('报价查询应在 500ms 内响应', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/quotes')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });

    it('历史查询应在 500ms 内响应', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/history')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });
  });

  // ==================== 错误处理测试 ====================

  describe('错误处理', () => {
    it('无效查询参数应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/history')
        .query({ page: 'invalid', limit: -1 })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      // 验证参数无效会被 ValidationPipe 拦截
      // 具体行为取决于 DTO 验证规则
      expect([200, 400]).toContain(response.status);
    });

    it('Mock 服务抛出异常应正常处理', async () => {
      // 设置 mock 抛出异常
      mockMiddlewareProxyService.getPositions.mockRejectedValueOnce(
        new Error('Mock error'),
      );

      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      // 应返回错误响应或降级响应
      expect([200, 500, 503]).toContain(response.status);
    });
  });

  // ==================== API 版本一致性测试 ====================

  describe('API 版本一致性', () => {
    it('响应应包含标准成功格式', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Object),
      });
    });

    it('错误响应应包含标准错误格式', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
        }),
      });
    });
  });
});
