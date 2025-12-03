/**
 * Positions 模块 API 契约测试
 * 验证持仓管理端点的请求/响应格式
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
  expectPaginatedResponse,
  expectPositionStatsResponse,
  expectPositionData,
} from './utils/validators';

describe('PositionsController (e2e)', () => {
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

  // ==================== GET /tenant/positions ====================

  describe('GET /tenant/positions', () => {
    it('应该返回持仓列表（分页）', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'positions');

      const data = response.body.data;
      expect(data.positions).toBeInstanceOf(Array);

      // 验证持仓数据格式
      if (data.positions.length > 0) {
        expectPositionData(data.positions[0]);
      }
    });

    it('支持分页参数', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .query({ page: 1, limit: 20 })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'positions');
    });

    it('支持品种过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .query({ symbol: 'EURUSD' })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'positions');
    });

    it('支持方向过滤 (buy/sell)', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .query({ type: 'buy' })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'positions');
    });

    it('支持用户过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .query({ login: 1001 })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectPaginatedResponse(response, 'positions');
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .expect(401);

      expectAuthError(response);
    });

    it('OPERATOR 角色应能访问', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(200);

      expectPaginatedResponse(response, 'positions');
    });
  });

  // ==================== GET /tenant/positions/stats ====================

  describe('GET /tenant/positions/stats', () => {
    it('应该返回持仓统计', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions/stats')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expectPositionStatsResponse(response);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions/stats')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== GET /tenant/positions/stats/by-symbol ====================

  describe('GET /tenant/positions/stats/by-symbol', () => {
    it('应该返回按品种统计', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions/stats/by-symbol')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toBeInstanceOf(Array);

      // 验证每个品种统计的格式
      if (response.body.data.length > 0) {
        const symbolStats = response.body.data[0];
        expect(symbolStats).toHaveProperty('symbol');
        // API 返回 volume/profit (非 totalVolume/totalProfit)
        expect(symbolStats).toHaveProperty('volume');
        expect(symbolStats).toHaveProperty('profit');
      }
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/positions/stats/by-symbol')
        .expect(401);

      expectAuthError(response);
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

    it('获取持仓列表应正常处理（服务降级）', async () => {
      // 服务降级可能返回 200（空数据）或 503（完全失败）
      const response = await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      expect(response.status === 200 || response.status === 503).toBe(true);
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('持仓列表应在 500ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });

    it('持仓统计应在 300ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/positions/stats')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(300);
    });
  });
});
