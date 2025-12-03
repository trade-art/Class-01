/**
 * Invoices 模块 E2E 契约测试
 *
 * 测试端点：
 * - POST /invoices - 创建发票
 * - GET /invoices - 获取发票列表
 * - GET /invoices/stats - 获取发票统计
 * - POST /invoices/check-overdue - 检查并更新逾期发票
 * - GET /invoices/:id - 获取发票详情
 * - GET /invoices/number/:invoiceNo - 按发票号查找
 * - GET /invoices/tenant/:tenantId - 获取租户的所有发票
 * - PATCH /invoices/:id/status - 更新发票状态
 * - POST /invoices/:id/pay - 标记发票为已支付
 * - POST /invoices/:id/cancel - 取消发票
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MockPrismaService } from './mocks/prisma.mock';
import {
  TEST_PLATFORM_ADMIN,
  TEST_TENANT,
  TEST_INVOICE,
  TEST_INVOICE_PENDING,
  TEST_INVOICE_OVERDUE,
} from './fixtures/test-data';
import { JwtService } from '@nestjs/jwt';
import {
  expectSuccessResponse,
  getSuccessData,
  expectAuthError,
  expectNotFoundError,
  expectBadRequestError,
  expectInvoiceResponse,
  expectInvoiceCreatedResponse,
} from './utils/validators';

describe('Invoices (E2E)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;
  let jwtService: JwtService;
  let platformAdminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useClass(MockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    mockPrismaService = moduleFixture.get<MockPrismaService>(PrismaService);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // 生成 Platform Admin 测试 Token
    platformAdminToken = jwtService.sign({
      sub: TEST_PLATFORM_ADMIN.id,
      email: TEST_PLATFORM_ADMIN.email,
      userType: 'platform_admin',
      role: TEST_PLATFORM_ADMIN.role,
    });
  });

  beforeEach(() => {
    mockPrismaService.resetMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== 创建发票测试 ====================

  describe('POST /invoices - 创建发票', () => {
    const validCreateDto = {
      tenantId: TEST_TENANT.id,
      items: [
        {
          description: 'Professional Plan - January 2024',
          quantity: 1,
          unitPrice: 299,
          amount: 299,
        },
      ],
      periodStart: '2024-01-01T00:00:00.000Z',
      periodEnd: '2024-01-31T23:59:59.999Z',
      dueDate: '2024-01-15T00:00:00.000Z',
      currency: 'USD',
      notes: 'Test invoice',
    };

    it('应能成功创建发票', async () => {
      const response = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(validCreateDto)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('invoiceNo');
      expect(data.tenantId).toBe(TEST_TENANT.id);
      expect(data.amount).toBe(299);
      expect(data.currency).toBe('USD');
      expect(data.status).toBe('PENDING');
    });

    it('应能创建包含多个明细项的发票', async () => {
      const dto = {
        ...validCreateDto,
        items: [
          { description: 'Base subscription', quantity: 1, unitPrice: 199, amount: 199 },
          { description: 'Extra instances (x3)', quantity: 3, unitPrice: 50, amount: 150 },
          { description: 'Support upgrade', quantity: 1, unitPrice: 99, amount: 99 },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(dto)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      // 总金额应该是所有项目的总和
      expect(data.amount).toBe(199 + 150 + 99);
    });

    it('租户不存在应返回 404', async () => {
      const dto = {
        ...validCreateDto,
        tenantId: '99999999-9999-4999-a999-999999999999', // 有效 UUID 格式但不存在
      };

      const response = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(dto)
        .expect(404);

      expectNotFoundError(response);
    });

    it('缺少 tenantId 应返回 400', async () => {
      const { tenantId, ...dto } = validCreateDto;

      const response = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(dto)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('缺少 items 应返回 400', async () => {
      const { items, ...dto } = validCreateDto;

      const response = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(dto)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/invoices')
        .send(validCreateDto)
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 获取发票列表测试 ====================

  describe('GET /invoices - 获取发票列表', () => {
    it('应返回分页的发票列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${platformAdminToken}`)
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

    it('应支持按租户过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices')
        .query({ tenantId: TEST_TENANT.id })
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      data.data.forEach((invoice: any) => {
        expect(invoice.tenantId).toBe(TEST_TENANT.id);
      });
    });

    it('应支持按状态过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices')
        .query({ status: 'PAID' })
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      data.data.forEach((invoice: any) => {
        expect(invoice.status).toBe('PAID');
      });
    });

    it('应支持分页参数', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.page).toBe(1);
      expect(data.limit).toBe(10);
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 获取发票统计测试 ====================

  describe('GET /invoices/stats - 获取发票统计', () => {
    it('应返回发票统计信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices/stats')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('pending');
      expect(data).toHaveProperty('paid');
      expect(data).toHaveProperty('overdue');
      expect(data).toHaveProperty('cancelled');
      expect(data).toHaveProperty('totalAmount');
      expect(data).toHaveProperty('paidAmount');
      expect(data).toHaveProperty('pendingAmount');
      expect(data).toHaveProperty('overdueAmount');

      // 验证数值类型
      expect(typeof data.total).toBe('number');
      expect(typeof data.totalAmount).toBe('number');
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices/stats')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 检查逾期发票测试 ====================

  describe('POST /invoices/check-overdue - 检查并更新逾期发票', () => {
    it('应返回更新的逾期发票数量', async () => {
      const response = await request(app.getHttpServer())
        .post('/invoices/check-overdue')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data).toHaveProperty('updatedCount');
      expect(typeof data.updatedCount).toBe('number');
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/invoices/check-overdue')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 获取发票详情测试 ====================

  describe('GET /invoices/:id - 获取发票详情', () => {
    it('应返回发票详情', async () => {
      const response = await request(app.getHttpServer())
        .get(`/invoices/${TEST_INVOICE.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectInvoiceResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.id).toBe(TEST_INVOICE.id);
      expect(data.tenantId).toBe(TEST_INVOICE.tenantId);
      expect(data.invoiceNo).toBe(TEST_INVOICE.invoiceNo);
    });

    it('应返回包含租户信息的发票详情', async () => {
      const response = await request(app.getHttpServer())
        .get(`/invoices/${TEST_INVOICE.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      const data = getSuccessData<any>(response);

      if (data.tenant) {
        expect(data.tenant).toHaveProperty('id');
        expect(data.tenant).toHaveProperty('name');
        expect(data.tenant).toHaveProperty('code');
        expect(data.tenant).toHaveProperty('email');
      }
    });

    it('发票不存在应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices/non-existent-invoice-id')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get(`/invoices/${TEST_INVOICE.id}`)
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 按发票号查找测试 ====================

  describe('GET /invoices/number/:invoiceNo - 按发票号查找', () => {
    it('应返回匹配发票号的发票', async () => {
      const response = await request(app.getHttpServer())
        .get(`/invoices/number/${TEST_INVOICE.invoiceNo}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectInvoiceResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.invoiceNo).toBe(TEST_INVOICE.invoiceNo);
    });

    it('发票号不存在应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices/number/NON-EXISTENT-001')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get(`/invoices/number/${TEST_INVOICE.invoiceNo}`)
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 获取租户发票测试 ====================

  describe('GET /invoices/tenant/:tenantId - 获取租户的所有发票', () => {
    it('应返回指定租户的所有发票', async () => {
      const response = await request(app.getHttpServer())
        .get(`/invoices/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any[]>(response);

      expect(Array.isArray(data)).toBe(true);
      data.forEach((invoice: any) => {
        expect(invoice.tenantId).toBe(TEST_TENANT.id);
      });
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get(`/invoices/tenant/${TEST_TENANT.id}`)
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 更新发票状态测试 ====================

  describe('PATCH /invoices/:id/status - 更新发票状态', () => {
    it('应能将 PENDING 发票标记为 PAID', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/invoices/${TEST_INVOICE_PENDING.id}/status`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ status: 'PAID', paidAt: new Date().toISOString() })
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.status).toBe('PAID');
      expect(data).toHaveProperty('paidAt');
    });

    it('应能将 PENDING 发票标记为 CANCELLED', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/invoices/${TEST_INVOICE_PENDING.id}/status`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ status: 'CANCELLED', notes: 'Customer requested cancellation' })
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.status).toBe('CANCELLED');
    });

    it('应能将 OVERDUE 发票标记为 PAID', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/invoices/${TEST_INVOICE_OVERDUE.id}/status`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ status: 'PAID' })
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.status).toBe('PAID');
    });

    it('缺少 status 参数应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/invoices/${TEST_INVOICE_PENDING.id}/status`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无效的 status 值应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/invoices/${TEST_INVOICE_PENDING.id}/status`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ status: 'INVALID_STATUS' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('发票不存在应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .patch('/invoices/non-existent-invoice-id/status')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ status: 'PAID' })
        .expect(404);

      expectNotFoundError(response);
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/invoices/${TEST_INVOICE_PENDING.id}/status`)
        .send({ status: 'PAID' })
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 标记发票为已支付测试 ====================

  describe('POST /invoices/:id/pay - 标记发票为已支付', () => {
    it('应能将 PENDING 发票标记为已支付', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${TEST_INVOICE_PENDING.id}/pay`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.status).toBe('PAID');
      expect(data).toHaveProperty('paidAt');
    });

    it('应能将 OVERDUE 发票标记为已支付', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${TEST_INVOICE_OVERDUE.id}/pay`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.status).toBe('PAID');
    });

    it('发票不存在应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/invoices/non-existent-invoice-id/pay')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${TEST_INVOICE_PENDING.id}/pay`)
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 取消发票测试 ====================

  describe('POST /invoices/:id/cancel - 取消发票', () => {
    it('应能取消 PENDING 发票', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${TEST_INVOICE_PENDING.id}/cancel`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ reason: 'Customer requested cancellation' })
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.status).toBe('CANCELLED');
    });

    it('应能取消 OVERDUE 发票', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${TEST_INVOICE_OVERDUE.id}/cancel`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ reason: 'Written off' })
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.status).toBe('CANCELLED');
    });

    it('无取消原因也应成功', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${TEST_INVOICE_PENDING.id}/cancel`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({})
        .expect(201);

      expectSuccessResponse(response);
    });

    it('发票不存在应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/invoices/non-existent-invoice-id/cancel')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({})
        .expect(404);

      expectNotFoundError(response);
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${TEST_INVOICE_PENDING.id}/cancel`)
        .send({})
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 状态转换规则测试 ====================

  describe('发票状态转换规则', () => {
    it('PAID 发票不能转为 PENDING', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/invoices/${TEST_INVOICE.id}/status`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ status: 'PENDING' })
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('PAID 发票可以转为 REFUNDED', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/invoices/${TEST_INVOICE.id}/status`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ status: 'REFUNDED' })
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.status).toBe('REFUNDED');
    });
  });

  // ==================== 边界情况测试 ====================

  describe('边界情况和数据验证', () => {
    it('发票响应应包含所有必要字段', async () => {
      const response = await request(app.getHttpServer())
        .get(`/invoices/${TEST_INVOICE.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      const data = getSuccessData<any>(response);

      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('tenantId');
      expect(data).toHaveProperty('invoiceNo');
      expect(data).toHaveProperty('amount');
      expect(data).toHaveProperty('currency');
      expect(data).toHaveProperty('periodStart');
      expect(data).toHaveProperty('periodEnd');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('dueDate');
      expect(data).toHaveProperty('createdAt');
      expect(data).toHaveProperty('updatedAt');
    });

    it('金额应为数值类型', async () => {
      const response = await request(app.getHttpServer())
        .get(`/invoices/${TEST_INVOICE.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      const data = getSuccessData<any>(response);

      expect(typeof data.amount).toBe('number');
    });

    it('统计数据应一致', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices/stats')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      const data = getSuccessData<any>(response);

      // total 应等于各状态数量之和
      const sumOfStatuses = data.pending + data.paid + data.overdue + data.cancelled;
      expect(data.total).toBe(sumOfStatuses);
    });
  });
});
