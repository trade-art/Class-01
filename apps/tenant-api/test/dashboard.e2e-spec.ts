/**
 * Dashboard 模块 API 契约测试
 * 验证 Dashboard 端点的请求/响应格式
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
  expectDashboardStatsResponse,
  expectPositionStatsResponse,
} from './utils/validators';

describe('DashboardController (e2e)', () => {
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

  // ==================== GET /tenant/dashboard ====================

  describe('GET /tenant/dashboard', () => {
    it('应该返回完整的 Dashboard 数据', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      // 验证必要字段存在 (实际 API 返回格式)
      expect(data).toHaveProperty('accountSummary');
      expect(data).toHaveProperty('positionsSummary');
      expect(data).toHaveProperty('serverStatus');
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard')
        .expect(401);

      expectAuthError(response);
    });

    it('无效 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectAuthError(response);
    });

    it('OWNER 角色应能访问', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('OPERATOR 角色应能访问', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(200);

      expectSuccessResponse(response);
    });
  });

  // ==================== GET /tenant/dashboard/account ====================

  describe('GET /tenant/dashboard/account', () => {
    it('应该返回账户摘要', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard/account')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      // 验证账户摘要必要字段 (实际 API 返回格式)
      expect(data).toHaveProperty('totalBalance');
      expect(data).toHaveProperty('totalEquity');
      expect(typeof data.totalBalance).toBe('number');
      expect(typeof data.totalEquity).toBe('number');
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard/account')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== GET /tenant/dashboard/positions ====================

  describe('GET /tenant/dashboard/positions', () => {
    it('应该返回持仓统计', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expectPositionStatsResponse(response);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard/positions')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== GET /tenant/dashboard/quick-stats ====================

  describe('GET /tenant/dashboard/quick-stats', () => {
    it('应该返回快速统计数据', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard/quick-stats')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      // 验证快速统计必要字段 (实际 API 返回格式)
      expect(data).toHaveProperty('todayProfit');
      expect(data).toHaveProperty('weekProfit');
      expect(data).toHaveProperty('monthProfit');
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard/quick-stats')
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

    it('Dashboard 数据获取失败应正常处理', async () => {
      // 服务降级可能返回 200（部分数据）或 503（完全失败）
      // 这取决于服务层的错误处理策略
      const response = await request(app.getHttpServer())
        .get('/tenant/dashboard')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      // 验证至少返回了有效响应结构
      expect(response.status === 200 || response.status === 503).toBe(true);
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('Dashboard 数据应在 1000ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/dashboard')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000);
    });

    it('账户摘要应在 500ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/dashboard/account')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });
  });
});
