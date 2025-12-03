/**
 * Quotes 模块 API 契约测试
 * 验证报价端点的请求/响应格式
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MiddlewareProxyService } from '../src/middleware-proxy';
import { MockPrismaService } from './mocks/prisma.mock';
import { MockMiddlewareProxyService } from './mocks/middleware-proxy.mock';
import { TEST_TOKENS, TEST_QUOTES } from './fixtures/test-data';
import {
  expectSuccessResponse,
  expectAuthError,
  expectNotFoundError,
  expectQuoteData,
} from './utils/validators';

describe('QuotesController (e2e)', () => {
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

  // ==================== GET /tenant/quotes ====================

  describe('GET /tenant/quotes', () => {
    it('应该返回报价列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toBeInstanceOf(Array);

      // 验证报价数据格式
      if (response.body.data.length > 0) {
        expectQuoteData(response.body.data[0]);
      }
    });

    it('支持搜索过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes')
        .query({ search: 'EUR' })
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes')
        .expect(401);

      expectAuthError(response);
    });

    it('所有角色应能访问', async () => {
      // OWNER
      await request(app.getHttpServer())
        .get('/tenant/quotes')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(200);

      // ADMIN
      await request(app.getHttpServer())
        .get('/tenant/quotes')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      // OPERATOR
      await request(app.getHttpServer())
        .get('/tenant/quotes')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(200);
    });
  });

  // ==================== GET /tenant/quotes/symbols ====================

  describe('GET /tenant/quotes/symbols', () => {
    it('应该返回品种列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes/symbols')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes/symbols')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== GET /tenant/quotes/favorites ====================

  describe('GET /tenant/quotes/favorites', () => {
    it('应该返回自选列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes/favorites')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      // API 返回 { favorites: [], total: number }
      expect(response.body.data).toHaveProperty('favorites');
      expect(response.body.data.favorites).toBeInstanceOf(Array);
      expect(response.body.data).toHaveProperty('total');
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes/favorites')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== POST /tenant/quotes/favorites ====================

  describe('POST /tenant/quotes/favorites', () => {
    it('应该成功添加自选品种', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/quotes/favorites')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({ symbol: 'EURUSD' })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('缺少 symbol 字段应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/quotes/favorites')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .post('/tenant/quotes/favorites')
        .send({ symbol: 'EURUSD' })
        .expect(401);
    });
  });

  // ==================== POST /tenant/quotes/favorites/batch ====================

  describe('POST /tenant/quotes/favorites/batch', () => {
    it('应该成功批量添加自选品种', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/quotes/favorites/batch')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({ symbols: ['EURUSD', 'GBPUSD', 'USDJPY'] })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('缺少 symbols 字段应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/quotes/favorites/batch')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('symbols 必须是数组', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/quotes/favorites/batch')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({ symbols: 'EURUSD' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== POST /tenant/quotes/favorites/remove ====================

  describe('POST /tenant/quotes/favorites/remove', () => {
    it('应该成功移除自选品种', async () => {
      // 先添加
      await request(app.getHttpServer())
        .post('/tenant/quotes/favorites')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({ symbol: 'EURUSD' });

      // 再移除
      const response = await request(app.getHttpServer())
        .post('/tenant/quotes/favorites/remove')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({ symbol: 'EURUSD' })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('缺少 symbol 字段应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/quotes/favorites/remove')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== GET /tenant/quotes/:symbol ====================

  describe('GET /tenant/quotes/:symbol', () => {
    it('应该返回单个品种报价', async () => {
      const testQuote = TEST_QUOTES[0];

      const response = await request(app.getHttpServer())
        .get(`/tenant/quotes/${testQuote.symbol}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      expectQuoteData(response.body.data);
      expect(response.body.data.symbol).toBe(testQuote.symbol);
    });

    it('品种不存在应返回 500', async () => {
      // Mock 抛出异常，服务返回 500
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes/INVALID_SYMBOL')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes/EURUSD')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== GET /tenant/quotes/:symbol/info ====================

  describe('GET /tenant/quotes/:symbol/info', () => {
    it('应该返回品种详细信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes/EURUSD/info')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(200);

      expectSuccessResponse(response);

      const data = response.body.data;
      expect(data).toHaveProperty('symbol');
      expect(data).toHaveProperty('description');
      expect(data).toHaveProperty('digits');
      expect(data).toHaveProperty('contractSize');
    });

    it('品种不存在应返回 500', async () => {
      // Mock 抛出异常，服务返回 500
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes/INVALID_SYMBOL/info')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes/EURUSD/info')
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

    it('获取报价列表应正常处理（服务降级）', async () => {
      // 服务降级可能返回 200（空数据）或 503（完全失败）
      const response = await request(app.getHttpServer())
        .get('/tenant/quotes')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      expect(response.status === 200 || response.status === 503).toBe(true);
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('报价列表应在 300ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/quotes')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(300);
    });

    it('单个报价应在 100ms 内完成', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/tenant/quotes/EURUSD')
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(100);
    });
  });
});
