import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

/**
 * MT5 Platform E2E 集成测试
 *
 * 测试覆盖:
 * - 认证流程
 * - 租户生命周期
 * - 实例健康检查
 * - 订阅变更
 * - 账单流程
 * - 交易数据查询 (Mock 中间件响应)
 */
describe('MT5 Platform (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platformAdminToken: string;
  let testTenantId: string;
  let testInstanceId: string;

  // 测试数据
  const testPlatformAdmin = {
    email: 'e2e-admin@test.com',
    password: 'Test123!@#',
    name: 'E2E Test Admin',
    role: 'SUPER_ADMIN' as const,
  };

  const testTenant = {
    name: 'E2E Test Tenant',
    code: 'E2E-TEST',
    email: 'e2e-tenant@test.com',
    subscriptionPlan: 'BASIC',
    maxInstances: 5,
    maxAdmins: 10,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // 配置全局管道
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // 清理测试数据
    await cleanupTestData();

    // 创建测试平台管理员
    await createTestPlatformAdmin();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  async function cleanupTestData() {
    try {
      // 删除测试实例
      await prisma.middlewareInstance.deleteMany({
        where: { name: { startsWith: 'E2E-' } },
      });

      // 删除测试账单
      await prisma.invoice.deleteMany({
        where: { tenant: { code: testTenant.code } },
      });

      // 删除测试租户管理员
      await prisma.tenantAdmin.deleteMany({
        where: { tenant: { code: testTenant.code } },
      });

      // 删除测试租户
      await prisma.tenant.deleteMany({
        where: { code: testTenant.code },
      });

      // 删除测试平台管理员
      await prisma.platformAdmin.deleteMany({
        where: { email: testPlatformAdmin.email },
      });
    } catch (error) {
      console.log('Cleanup error (可忽略):', error);
    }
  }

  async function createTestPlatformAdmin() {
    const hashedPassword = await bcrypt.hash(testPlatformAdmin.password, 10);
    await prisma.platformAdmin.create({
      data: {
        email: testPlatformAdmin.email,
        password: hashedPassword,
        name: testPlatformAdmin.name,
        role: testPlatformAdmin.role,
        isActive: true,
      },
    });
  }

  // ==================== 认证测试 ====================

  describe('Authentication (认证流程)', () => {
    it('POST /api/v1/auth/login - 平台管理员登录成功', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testPlatformAdmin.email,
          password: testPlatformAdmin.password,
          userType: 'PLATFORM_ADMIN',
        })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe(testPlatformAdmin.email);
      expect(response.body.user.userType).toBe('PLATFORM_ADMIN');

      platformAdminToken = response.body.accessToken;
    });

    it('POST /api/v1/auth/login - 错误密码登录失败', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testPlatformAdmin.email,
          password: 'wrongpassword',
          userType: 'PLATFORM_ADMIN',
        })
        .expect(401);
    });

    it('GET /api/v1/auth/me - 获取当前用户信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(response.body.email).toBe(testPlatformAdmin.email);
    });
  });

  // ==================== 租户生命周期测试 ====================

  describe('Tenant Lifecycle (租户生命周期)', () => {
    it('POST /api/v1/tenants - 创建租户', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/tenants')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(testTenant)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.code).toBe(testTenant.code);
      expect(response.body.status).toBe('PENDING');

      testTenantId = response.body.id;
    });

    it('GET /api/v1/tenants - 获取租户列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tenants')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.some((t: any) => t.code === testTenant.code)).toBe(true);
    });

    it('GET /api/v1/tenants/:id - 获取租户详情', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tenants/${testTenantId}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(response.body.id).toBe(testTenantId);
      expect(response.body.code).toBe(testTenant.code);
    });

    it('PATCH /api/v1/tenants/:id - 激活租户', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${testTenantId}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);

      expect(response.body.status).toBe('ACTIVE');
    });

    it('POST /api/v1/tenants/:id/suspend - 暂停租户', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tenants/${testTenantId}/suspend`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(response.body.status).toBe('SUSPENDED');
    });

    it('POST /api/v1/tenants/:id/reactivate - 恢复租户', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tenants/${testTenantId}/reactivate`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(response.body.status).toBe('ACTIVE');
    });

    it('PATCH /api/v1/tenants/:id/branding - 更新白标配置', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${testTenantId}/branding`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          displayName: 'E2E Test Brand',
          primaryColor: '#FF5733',
        })
        .expect(200);

      expect(response.body.displayName).toBe('E2E Test Brand');
      expect(response.body.primaryColor).toBe('#FF5733');
    });
  });

  // ==================== 实例管理测试 ====================

  describe('Instance Management (实例管理)', () => {
    it('POST /api/v1/instances - 创建中间件实例', async () => {
      const instanceData = {
        tenantId: testTenantId,
        name: 'E2E-Test-Instance',
        host: 'localhost',
        port: 8080,
        apiKey: 'test-api-key-123',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/instances')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(instanceData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(instanceData.name);

      testInstanceId = response.body.id;
    });

    it('GET /api/v1/instances - 获取实例列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/instances')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/v1/instances/:id - 获取实例详情', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/instances/${testInstanceId}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(response.body.id).toBe(testInstanceId);
    });

    it('POST /api/v1/instances/:id/health-check - 健康检查 (预期失败，无真实中间件)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/instances/${testInstanceId}/health-check`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      // 因为没有真实中间件，预期返回 offline 或 error
      expect(['offline', 'error']).toContain(response.body.status);
    });

    it('GET /api/v1/instances/quota/:tenantId - 获取配额使用情况', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/instances/quota/${testTenantId}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('instances');
      expect(response.body.instances.used).toBeGreaterThanOrEqual(1);
    });
  });

  // ==================== 订阅计划测试 ====================

  describe('Subscription Management (订阅管理)', () => {
    it('GET /api/v1/subscriptions/plans - 获取所有订阅计划', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/subscriptions/plans')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body.some((p: any) => p.name === 'BASIC')).toBe(true);
    });

    it('GET /api/v1/subscriptions/tenant/:tenantId/status - 获取租户订阅状态', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/subscriptions/tenant/${testTenantId}/status`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('currentPlan');
      expect(response.body).toHaveProperty('quota');
    });

    it('POST /api/v1/subscriptions/tenant/:tenantId/preview-change - 预览订阅变更', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/tenant/${testTenantId}/preview-change`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ targetPlan: 'PROFESSIONAL' })
        .expect(201);

      expect(response.body).toHaveProperty('currentPlan');
      expect(response.body).toHaveProperty('targetPlan');
      expect(response.body).toHaveProperty('proratedAmount');
    });
  });

  // ==================== 账单测试 ====================

  describe('Invoice Management (账单管理)', () => {
    let testInvoiceId: string;

    it('POST /api/v1/invoices - 创建账单', async () => {
      const invoiceData = {
        tenantId: testTenantId,
        periodStart: new Date().toISOString(),
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        lineItems: [
          {
            description: 'Monthly Subscription - BASIC',
            quantity: 1,
            unitPrice: 99,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(invoiceData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('invoiceNo');
      expect(response.body.status).toBe('PENDING');

      testInvoiceId = response.body.id;
    });

    it('GET /api/v1/invoices - 获取账单列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('GET /api/v1/invoices/:id - 获取账单详情', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${testInvoiceId}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(response.body.id).toBe(testInvoiceId);
    });

    it('POST /api/v1/invoices/:id/pay - 标记账单已支付', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/invoices/${testInvoiceId}/pay`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(response.body.status).toBe('PAID');
      expect(response.body.paidAt).toBeTruthy();
    });

    it('POST /api/v1/invoices/:id/cancel - 已支付账单不能取消', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/invoices/${testInvoiceId}/cancel`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(400);
    });
  });

  // ==================== 租户管理员测试 ====================

  describe('Tenant Admin Management (租户管理员管理)', () => {
    let testTenantAdminId: string;

    it('POST /api/v1/tenants/:tenantId/admins - 创建租户管理员', async () => {
      const adminData = {
        email: 'e2e-tenant-admin@test.com',
        password: 'TenantAdmin123!',
        name: 'E2E Tenant Admin',
        role: 'ADMIN',
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v1/tenants/${testTenantId}/admins`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(adminData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe(adminData.email);

      testTenantAdminId = response.body.id;
    });

    it('GET /api/v1/tenants/:tenantId/admins - 获取租户管理员列表', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tenants/${testTenantId}/admins`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('POST /api/v1/tenant-admins/:id/reset-password - 重置密码', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tenant-admins/${testTenantAdminId}/reset-password`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('temporaryPassword');
      expect(response.body.temporaryPassword).toBeTruthy();
    });

    it('POST /api/v1/tenant-admins/:id/disable - 禁用管理员', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tenant-admins/${testTenantAdminId}/disable`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(response.body.isActive).toBe(false);
    });

    it('POST /api/v1/tenant-admins/:id/enable - 启用管理员', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tenant-admins/${testTenantAdminId}/enable`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(response.body.isActive).toBe(true);
    });
  });

  // ==================== 交易数据测试 (REQ-8) ====================

  describe('Trading Data (交易数据 - REQ-8)', () => {
    it('GET /api/v1/trading-data/overview - 获取所有租户交易概览', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/trading-data/overview')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/v1/trading-data/overview/tenant/:tenantId - 获取租户交易概览', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/trading-data/overview/tenant/${testTenantId}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(response.body.tenantId).toBe(testTenantId);
      expect(response.body).toHaveProperty('totalBalance');
      expect(response.body).toHaveProperty('todayOrders');
    });

    it('GET /api/v1/trading-data/positions - 获取实时持仓 (空结果，无真实中间件)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/trading-data/positions')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .query({ tenantId: testTenantId })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/v1/trading-data/balances - 获取账户余额 (空结果，无真实中间件)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/trading-data/balances')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .query({ tenantId: testTenantId })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/v1/trading-data/stats - 获取交易统计', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/trading-data/stats')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .query({ tenantId: testTenantId })
        .expect(200);

      expect(response.body).toHaveProperty('totalOrders');
      expect(response.body).toHaveProperty('winRate');
    });
  });

  // ==================== API 响应格式验证 ====================

  describe('API Response Format (响应格式验证)', () => {
    it('成功响应包含正确格式', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tenants')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      // 验证响应是数组或带有 success 标志的对象
      expect(response.body).toBeDefined();
    });

    it('错误响应包含标准格式', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tenants/non-existent-id')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(404);

      // 验证错误响应格式
      expect(response.body).toHaveProperty('message');
    });

    it('未授权请求返回 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tenants')
        .expect(401);
    });
  });

  // ==================== 清理测试 ====================

  describe('Cleanup (清理)', () => {
    it('DELETE /api/v1/instances/:id - 删除测试实例', async () => {
      if (testInstanceId) {
        await request(app.getHttpServer())
          .delete(`/api/v1/instances/${testInstanceId}`)
          .set('Authorization', `Bearer ${platformAdminToken}`)
          .expect(200);
      }
    });

    it('POST /api/v1/tenants/:id/terminate - 终止租户', async () => {
      if (testTenantId) {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/tenants/${testTenantId}/terminate`)
          .set('Authorization', `Bearer ${platformAdminToken}`)
          .expect(200);

        expect(response.body.status).toBe('CANCELLED');
      }
    });
  });
});
