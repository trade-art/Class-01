/**
 * Trading Data 模块 E2E 契约测试
 *
 * 测试端点：
 * - GET /trading-data/overview - 获取所有租户的交易概览
 * - GET /trading-data/overview/tenant/:tenantId - 获取指定租户的交易概览
 * - GET /trading-data/history - 查询交易历史
 * - GET /trading-data/positions - 获取实时持仓
 * - GET /trading-data/balances - 获取账户余额
 * - GET /trading-data/stats - 获取交易统计
 * - GET /trading-data/aggregated/:tenantId - 获取聚合交易数据
 * - GET /trading-data/tenant/:tenantId/history - 获取租户的交易历史
 * - GET /trading-data/instance/:instanceId/history - 获取实例的交易历史
 * - GET /trading-data/instance/:instanceId/positions - 获取实例的实时持仓
 * - GET /trading-data/instance/:instanceId/balances - 获取实例的账户余额
 *
 * 访问控制: 仅 PLATFORM_ADMIN 可访问
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MockPrismaService } from './mocks/prisma.mock';
import { HttpService } from '@nestjs/axios';
import {
  TEST_TOKENS,
  TEST_TENANT,
  TEST_INSTANCE,
} from './fixtures/test-data';
import {
  expectSuccessResponse,
  getSuccessData,
  expectAuthError,
  expectForbiddenError,
  expectNotFoundError,
} from './utils/validators';
import { of } from 'rxjs';

describe('Trading Data 模块契约测试 (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;
  let mockHttpService: { get: jest.Mock; post: jest.Mock };

  // 模拟交易数据
  const mockTradingOrders = [
    {
      ticket: 12345678,
      login: 1001,
      symbol: 'EURUSD',
      type: 'BUY',
      volume: 1.0,
      openPrice: 1.0850,
      openTime: '2024-01-15T10:00:00Z',
      closePrice: 1.0880,
      closeTime: '2024-01-15T14:00:00Z',
      profit: 300,
      swap: -5,
      commission: -10,
      stopLoss: 1.0800,
      takeProfit: 1.0900,
      comment: 'Test order',
      status: 'FILLED',
    },
    {
      ticket: 12345679,
      login: 1001,
      symbol: 'GBPUSD',
      type: 'SELL',
      volume: 0.5,
      openPrice: 1.2650,
      openTime: '2024-01-15T11:00:00Z',
      closePrice: 1.2620,
      closeTime: '2024-01-15T15:00:00Z',
      profit: 150,
      swap: -3,
      commission: -5,
      stopLoss: 1.2700,
      takeProfit: 1.2600,
      comment: 'Test order 2',
      status: 'FILLED',
    },
  ];

  const mockOpenPositions = [
    {
      ticket: 12345680,
      login: 1001,
      symbol: 'USDJPY',
      type: 'BUY',
      volume: 2.0,
      openPrice: 148.50,
      openTime: '2024-01-15T09:00:00Z',
      currentPrice: 148.80,
      profit: 600,
      swap: -10,
      commission: -20,
      stopLoss: 148.00,
      takeProfit: 149.50,
    },
  ];

  const mockAccountBalances = [
    {
      login: 1001,
      name: 'Test Account 1',
      group: 'Standard',
      currency: 'USD',
      balance: 10000,
      equity: 10600,
      margin: 2000,
      freeMargin: 8600,
      marginLevel: 530,
      leverage: 100,
    },
    {
      login: 1002,
      name: 'Test Account 2',
      group: 'Premium',
      currency: 'USD',
      balance: 50000,
      equity: 52000,
      margin: 10000,
      freeMargin: 42000,
      marginLevel: 520,
      leverage: 200,
    },
  ];

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();

    // Mock HttpService for middleware API calls
    mockHttpService = {
      get: jest.fn(),
      post: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(HttpService)
      .useValue(mockHttpService)
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
    jest.clearAllMocks();

    // 设置默认的 HTTP mock 响应
    mockHttpService.get.mockImplementation((url: string) => {
      if (url.includes('/api/trading/history')) {
        return of({ data: { orders: mockTradingOrders } });
      }
      if (url.includes('/api/trading/positions')) {
        return of({ data: { positions: mockOpenPositions } });
      }
      if (url.includes('/api/accounts/balances')) {
        return of({ data: { accounts: mockAccountBalances } });
      }
      return of({ data: {} });
    });
  });

  // ==================== 认证和授权测试 ====================

  describe('认证和授权', () => {
    it('无认证 token 应返回 401', async () => {
      const response = await request(app.getHttpServer()).get('/trading-data/overview');

      expectAuthError(response);
    });

    it('无效 token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/overview')
        .set('Authorization', 'Bearer invalid-token');

      expectAuthError(response);
    });

    it('过期 token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/overview')
        .set('Authorization', `Bearer ${TEST_TOKENS.expired}`);

      expectAuthError(response);
    });

    it('Tenant Admin 访问应返回 403', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/overview')
        .set('Authorization', `Bearer ${TEST_TOKENS.tenantAdmin}`);

      expectForbiddenError(response);
    });

    it('Tenant Owner 访问应返回 403', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/overview')
        .set('Authorization', `Bearer ${TEST_TOKENS.tenantOwner}`);

      expectForbiddenError(response);
    });
  });

  // ==================== GET /trading-data/overview ====================

  describe('GET /trading-data/overview - 获取所有租户的交易概览', () => {
    it('Platform Admin 应能获取所有租户概览', async () => {
      // Mock 租户和实例数据
      mockPrismaService.tenant.findMany.mockResolvedValue([
        {
          ...TEST_TENANT,
          instances: [TEST_INSTANCE],
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/trading-data/overview')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any[]>(response);

      expect(Array.isArray(data)).toBe(true);
    });

    it('没有活跃租户时应返回空数组', async () => {
      mockPrismaService.tenant.findMany.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get('/trading-data/overview')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any[]>(response);

      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });
  });

  // ==================== GET /trading-data/overview/tenant/:tenantId ====================

  describe('GET /trading-data/overview/tenant/:tenantId - 获取指定租户概览', () => {
    it('应能获取指定租户的交易概览', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        ...TEST_TENANT,
        instances: [TEST_INSTANCE],
      });

      const response = await request(app.getHttpServer())
        .get(`/trading-data/overview/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data).toHaveProperty('tenantId');
      expect(data).toHaveProperty('tenantName');
      expect(data).toHaveProperty('totalAccounts');
      expect(data).toHaveProperty('activeAccounts');
      expect(data).toHaveProperty('totalBalance');
      expect(data).toHaveProperty('totalEquity');
      expect(data).toHaveProperty('todayOrders');
      expect(data).toHaveProperty('todayVolume');
      expect(data).toHaveProperty('todayProfit');
      expect(data).toHaveProperty('instances');
    });

    it('租户概览应包含实例信息', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        ...TEST_TENANT,
        instances: [TEST_INSTANCE],
      });

      const response = await request(app.getHttpServer())
        .get(`/trading-data/overview/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData<any>(response);
      expect(Array.isArray(data.instances)).toBe(true);

      if (data.instances.length > 0) {
        const instance = data.instances[0];
        expect(instance).toHaveProperty('id');
        expect(instance).toHaveProperty('name');
        expect(instance).toHaveProperty('status');
      }
    });

    it('租户不存在应返回 404', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get('/trading-data/overview/tenant/99999999-9999-4999-a999-999999999999')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(404);

      expectNotFoundError(response);
    });
  });

  // ==================== GET /trading-data/history ====================

  // 测试用默认日期范围
  const defaultFromDate = '2024-01-01T00:00:00.000Z';
  const defaultToDate = '2024-01-31T23:59:59.999Z';

  describe('GET /trading-data/history - 查询交易历史', () => {
    beforeEach(() => {
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([TEST_INSTANCE]);
    });

    it('应能获取交易历史列表', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/history?fromDate=${defaultFromDate}&toDate=${defaultToDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('page');
      expect(data).toHaveProperty('limit');
      expect(data).toHaveProperty('totalPages');
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('应支持按租户筛选', async () => {
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([TEST_INSTANCE]);

      const response = await request(app.getHttpServer())
        .get(`/trading-data/history?tenantId=${TEST_TENANT.id}&fromDate=${defaultFromDate}&toDate=${defaultToDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('应支持按交易品种筛选', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/history?symbol=EURUSD&fromDate=${defaultFromDate}&toDate=${defaultToDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('应支持日期范围筛选', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/history?fromDate=2024-01-01T00:00:00Z&toDate=2024-01-31T23:59:59Z')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('应支持分页参数', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/history?page=1&limit=10&fromDate=${defaultFromDate}&toDate=${defaultToDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.page).toBe(1);
      expect(data.limit).toBe(10);
    });

    it('没有在线实例时应返回空数据', async () => {
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get(`/trading-data/history?fromDate=${defaultFromDate}&toDate=${defaultToDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.data).toHaveLength(0);
      expect(data.total).toBe(0);
    });

    it('缺少 fromDate 应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/history?toDate=${defaultToDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('缺少 toDate 应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/history?fromDate=${defaultFromDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== GET /trading-data/positions ====================

  describe('GET /trading-data/positions - 获取实时持仓', () => {
    beforeEach(() => {
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([TEST_INSTANCE]);
    });

    it('应能获取持仓列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any[]>(response);

      expect(Array.isArray(data)).toBe(true);
    });

    it('持仓数据应包含必要字段', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/positions')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData<any[]>(response);

      if (data.length > 0) {
        const position = data[0];
        expect(position).toHaveProperty('ticket');
        expect(position).toHaveProperty('login');
        expect(position).toHaveProperty('symbol');
        expect(position).toHaveProperty('type');
        expect(position).toHaveProperty('volume');
        expect(position).toHaveProperty('openPrice');
        expect(position).toHaveProperty('currentPrice');
        expect(position).toHaveProperty('profit');
      }
    });

    it('应支持按租户筛选', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/positions?tenantId=${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('应支持按实例筛选', async () => {
      mockPrismaService.middlewareInstance.findUnique.mockResolvedValue(TEST_INSTANCE);

      const response = await request(app.getHttpServer())
        .get(`/trading-data/positions?instanceId=${TEST_INSTANCE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('应支持按账号筛选', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/positions?login=1001')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });
  });

  // ==================== GET /trading-data/balances ====================

  describe('GET /trading-data/balances - 获取账户余额', () => {
    beforeEach(() => {
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([TEST_INSTANCE]);
    });

    it('应能获取账户余额列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/balances')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any[]>(response);

      expect(Array.isArray(data)).toBe(true);
    });

    it('账户余额应包含必要字段', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/balances')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData<any[]>(response);

      if (data.length > 0) {
        const balance = data[0];
        expect(balance).toHaveProperty('login');
        expect(balance).toHaveProperty('balance');
        expect(balance).toHaveProperty('equity');
        expect(balance).toHaveProperty('margin');
        expect(balance).toHaveProperty('freeMargin');
      }
    });

    it('应支持按租户筛选', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/balances?tenantId=${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('应支持按实例筛选', async () => {
      mockPrismaService.middlewareInstance.findUnique.mockResolvedValue(TEST_INSTANCE);

      const response = await request(app.getHttpServer())
        .get(`/trading-data/balances?instanceId=${TEST_INSTANCE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });
  });

  // ==================== GET /trading-data/stats ====================

  describe('GET /trading-data/stats - 获取交易统计', () => {
    beforeEach(() => {
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([TEST_INSTANCE]);
    });

    it('应能获取交易统计', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/stats')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data).toHaveProperty('totalOrders');
      expect(data).toHaveProperty('openOrders');
      expect(data).toHaveProperty('closedOrders');
      expect(data).toHaveProperty('totalVolume');
      expect(data).toHaveProperty('totalProfit');
      expect(data).toHaveProperty('totalCommission');
      expect(data).toHaveProperty('totalSwap');
      expect(data).toHaveProperty('winRate');
      expect(data).toHaveProperty('profitFactor');
    });

    it('统计应包含按品种分类', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/stats')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData<any>(response);
      expect(data).toHaveProperty('bySymbol');
      expect(Array.isArray(data.bySymbol)).toBe(true);
    });

    it('统计应包含按类型分类', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/stats')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData<any>(response);
      expect(data).toHaveProperty('byType');
      expect(Array.isArray(data.byType)).toBe(true);
    });

    it('应支持日期范围筛选', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/stats?fromDate=2024-01-01T00:00:00Z&toDate=2024-01-31T23:59:59Z')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('应支持按租户筛选', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/stats?tenantId=${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });
  });

  // ==================== GET /trading-data/aggregated/:tenantId ====================

  describe('GET /trading-data/aggregated/:tenantId - 获取聚合交易数据', () => {
    beforeEach(() => {
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([TEST_INSTANCE]);
    });

    it('应能获取每日聚合数据', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/aggregated/${TEST_TENANT.id}?period=daily&fromDate=2024-01-01&toDate=2024-01-31`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any[]>(response);

      expect(Array.isArray(data)).toBe(true);
    });

    it('应能获取每周聚合数据', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/aggregated/${TEST_TENANT.id}?period=weekly&fromDate=2024-01-01&toDate=2024-01-31`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('应能获取每月聚合数据', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/aggregated/${TEST_TENANT.id}?period=monthly&fromDate=2024-01-01&toDate=2024-12-31`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });

    it('聚合数据应包含必要字段', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/aggregated/${TEST_TENANT.id}?period=daily&fromDate=2024-01-01&toDate=2024-01-31`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData<any[]>(response);

      if (data.length > 0) {
        const item = data[0];
        expect(item).toHaveProperty('period');
        expect(item).toHaveProperty('orders');
        expect(item).toHaveProperty('volume');
        expect(item).toHaveProperty('profit');
        expect(item).toHaveProperty('commission');
      }
    });
  });

  // ==================== GET /trading-data/tenant/:tenantId/history ====================

  describe('GET /trading-data/tenant/:tenantId/history - 获取租户交易历史', () => {
    beforeEach(() => {
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([TEST_INSTANCE]);
    });

    it('应能获取指定租户的交易历史', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/tenant/${TEST_TENANT.id}/history?fromDate=${defaultFromDate}&toDate=${defaultToDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('page');
      expect(data).toHaveProperty('limit');
    });

    it('应支持分页参数', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/tenant/${TEST_TENANT.id}/history?page=2&limit=5&fromDate=${defaultFromDate}&toDate=${defaultToDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      // 分页参数可能返回字符串或数字，使用宽松比较
      expect(Number(data.page)).toBe(2);
      expect(Number(data.limit)).toBe(5);
    });
  });

  // ==================== GET /trading-data/instance/:instanceId/history ====================

  describe('GET /trading-data/instance/:instanceId/history - 获取实例交易历史', () => {
    beforeEach(() => {
      mockPrismaService.middlewareInstance.findUnique.mockResolvedValue(TEST_INSTANCE);
    });

    it('应能获取指定实例的交易历史', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/instance/${TEST_INSTANCE.id}/history?fromDate=${defaultFromDate}&toDate=${defaultToDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('total');
    });

    it('实例不存在时应返回空数据', async () => {
      mockPrismaService.middlewareInstance.findUnique.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get(`/trading-data/instance/99999999-9999-4999-a999-999999999999/history?fromDate=${defaultFromDate}&toDate=${defaultToDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.data).toHaveLength(0);
      expect(data.total).toBe(0);
    });
  });

  // ==================== GET /trading-data/instance/:instanceId/positions ====================

  describe('GET /trading-data/instance/:instanceId/positions - 获取实例持仓', () => {
    beforeEach(() => {
      mockPrismaService.middlewareInstance.findUnique.mockResolvedValue(TEST_INSTANCE);
    });

    it('应能获取指定实例的持仓', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/instance/${TEST_INSTANCE.id}/positions`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any[]>(response);

      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ==================== GET /trading-data/instance/:instanceId/balances ====================

  describe('GET /trading-data/instance/:instanceId/balances - 获取实例账户余额', () => {
    beforeEach(() => {
      mockPrismaService.middlewareInstance.findUnique.mockResolvedValue(TEST_INSTANCE);
    });

    it('应能获取指定实例的账户余额', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/instance/${TEST_INSTANCE.id}/balances`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any[]>(response);

      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ==================== 错误处理测试 ====================

  describe('错误处理', () => {
    it('中间件不可用时应优雅处理', async () => {
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([TEST_INSTANCE]);
      mockHttpService.get.mockImplementation(() => {
        throw new Error('Connection refused');
      });

      const response = await request(app.getHttpServer())
        .get(`/trading-data/history?fromDate=${defaultFromDate}&toDate=${defaultToDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      // 服务应该优雅地返回空数据而不是抛出错误
      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.data).toHaveLength(0);
    });

    it('部分实例不可用时应返回可用实例的数据', async () => {
      const onlineInstance = { ...TEST_INSTANCE, id: 'online-instance' };
      const offlineInstance = { ...TEST_INSTANCE, id: 'offline-instance' };

      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([
        onlineInstance,
        offlineInstance,
      ]);

      // 第一个实例正常响应，第二个实例抛出错误
      let callCount = 0;
      mockHttpService.get.mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          throw new Error('Connection refused');
        }
        return of({ data: { orders: mockTradingOrders } });
      });

      const response = await request(app.getHttpServer())
        .get(`/trading-data/history?fromDate=${defaultFromDate}&toDate=${defaultToDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });
  });

  // ==================== 数据类型验证 ====================

  describe('响应数据类型验证', () => {
    beforeEach(() => {
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([TEST_INSTANCE]);
    });

    it('交易历史数值字段应为数字类型', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trading-data/history?fromDate=${defaultFromDate}&toDate=${defaultToDate}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData<any>(response);

      if (data.data.length > 0) {
        const order = data.data[0];
        expect(typeof order.volume).toBe('number');
        expect(typeof order.openPrice).toBe('number');
        expect(typeof order.profit).toBe('number');
      }
    });

    it('统计数值应为数字类型', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/stats')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData<any>(response);

      expect(typeof data.totalOrders).toBe('number');
      expect(typeof data.totalVolume).toBe('number');
      expect(typeof data.totalProfit).toBe('number');
      expect(typeof data.winRate).toBe('number');
    });

    it('账户余额数值应为数字类型', async () => {
      const response = await request(app.getHttpServer())
        .get('/trading-data/balances')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      const data = getSuccessData<any[]>(response);

      if (data.length > 0) {
        const balance = data[0];
        expect(typeof balance.balance).toBe('number');
        expect(typeof balance.equity).toBe('number');
        expect(typeof balance.margin).toBe('number');
      }
    });
  });
});
