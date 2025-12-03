/**
 * Subscriptions 模块 E2E 契约测试
 *
 * 测试端点：
 * - GET /subscriptions/plans - 获取所有订阅计划配置
 * - GET /subscriptions/plans/:plan - 获取指定计划配置
 * - GET /subscriptions - 获取所有租户订阅列表
 * - GET /subscriptions/stats - 获取订阅统计数据
 * - GET /subscriptions/tenant/:tenantId - 获取租户订阅状态
 * - GET /subscriptions/tenant/:tenantId/preview/:targetPlan - 预览订阅变更
 * - POST /subscriptions/tenant/:tenantId - 更新租户订阅
 * - POST /subscriptions/tenant/:tenantId/renew - 续订租户订阅
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MockPrismaService } from './mocks/prisma.mock';
import { TEST_PLATFORM_ADMIN, TEST_TENANT } from './fixtures/test-data';
import { JwtService } from '@nestjs/jwt';
import {
  expectSuccessResponse,
  getSuccessData,
  expectAuthError,
  expectNotFoundError,
  expectPaginatedResponse,
} from './utils/validators';

describe('Subscriptions (E2E)', () => {
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

  // ==================== 计划配置测试 ====================

  describe('GET /subscriptions/plans - 获取所有订阅计划配置', () => {
    it('应返回所有订阅计划配置列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/plans')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any[]>(response);

      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(4); // TRIAL, BASIC, PROFESSIONAL, ENTERPRISE

      // 验证计划配置结构
      const plans = ['TRIAL', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE'];
      plans.forEach((planName) => {
        const plan = data.find((p: any) => p.plan === planName);
        expect(plan).toBeDefined();
        expect(plan).toHaveProperty('monthlyPrice');
        expect(plan).toHaveProperty('quarterlyPrice');
        expect(plan).toHaveProperty('yearlyPrice');
        expect(plan).toHaveProperty('maxInstances');
        expect(plan).toHaveProperty('maxAdmins');
        expect(plan).toHaveProperty('features');
        expect(Array.isArray(plan.features)).toBe(true);
      });
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/plans')
        .expect(401);

      expectAuthError(response);
    });
  });

  describe('GET /subscriptions/plans/:plan - 获取指定计划配置', () => {
    it('应返回 TRIAL 计划配置', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/plans/TRIAL')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.plan).toBe('TRIAL');
      expect(data.monthlyPrice).toBe(0);
      expect(data.maxInstances).toBe(1);
      expect(data.maxAdmins).toBe(1);
    });

    it('应返回 BASIC 计划配置', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/plans/BASIC')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.plan).toBe('BASIC');
      expect(data.monthlyPrice).toBe(99);
      expect(data.maxInstances).toBe(2);
      expect(data.maxAdmins).toBe(3);
    });

    it('应返回 PROFESSIONAL 计划配置', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/plans/PROFESSIONAL')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.plan).toBe('PROFESSIONAL');
      expect(data.monthlyPrice).toBe(299);
      expect(data.maxInstances).toBe(5);
      expect(data.maxAdmins).toBe(10);
    });

    it('应返回 ENTERPRISE 计划配置', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/plans/ENTERPRISE')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.plan).toBe('ENTERPRISE');
      expect(data.monthlyPrice).toBe(999);
      expect(data.maxInstances).toBe(50);
      expect(data.maxAdmins).toBe(100);
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/plans/BASIC')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 订阅列表测试 ====================

  describe('GET /subscriptions - 获取所有租户订阅列表', () => {
    it('应返回分页的订阅列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions')
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

    it('应支持按计划过滤', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions')
        .query({ plan: 'PROFESSIONAL' })
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      // 所有返回的订阅应该是 PROFESSIONAL 计划
      data.data.forEach((subscription: any) => {
        expect(subscription.currentPlan).toBe('PROFESSIONAL');
      });
    });

    it('应支持分页参数', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions')
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
        .get('/subscriptions')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 订阅统计测试 ====================

  describe('GET /subscriptions/stats - 获取订阅统计数据', () => {
    it('应返回订阅统计信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/stats')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data).toHaveProperty('byPlan');
      expect(data).toHaveProperty('expiringSoon');
      expect(data).toHaveProperty('expired');
      expect(data).toHaveProperty('totalRevenue');

      // 验证 byPlan 包含所有计划类型
      expect(data.byPlan).toHaveProperty('TRIAL');
      expect(data.byPlan).toHaveProperty('BASIC');
      expect(data.byPlan).toHaveProperty('PROFESSIONAL');
      expect(data.byPlan).toHaveProperty('ENTERPRISE');

      // 验证数值类型
      expect(typeof data.expiringSoon).toBe('number');
      expect(typeof data.expired).toBe('number');
      expect(typeof data.totalRevenue).toBe('number');
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/stats')
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 租户订阅状态测试 ====================

  describe('GET /subscriptions/tenant/:tenantId - 获取租户订阅状态', () => {
    it('应返回租户订阅状态详情', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.tenantId).toBe(TEST_TENANT.id);
      expect(data.tenantName).toBe(TEST_TENANT.name);
      expect(data.currentPlan).toBe(TEST_TENANT.plan);
      expect(data.billingCycle).toBe(TEST_TENANT.billingCycle);

      // 验证配额信息
      expect(data).toHaveProperty('instanceQuota');
      expect(data.instanceQuota).toHaveProperty('used');
      expect(data.instanceQuota).toHaveProperty('max');
      expect(data.instanceQuota).toHaveProperty('available');

      expect(data).toHaveProperty('adminQuota');
      expect(data.adminQuota).toHaveProperty('used');
      expect(data.adminQuota).toHaveProperty('max');
      expect(data.adminQuota).toHaveProperty('available');

      // 验证到期信息
      expect(data).toHaveProperty('isExpiringSoon');
      expect(typeof data.isExpiringSoon).toBe('boolean');
    });

    it('租户不存在应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/tenant/non-existent-tenant-id')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 订阅变更预览测试 ====================

  describe('GET /subscriptions/tenant/:tenantId/preview/:targetPlan - 预览订阅变更', () => {
    it('预览升级到 ENTERPRISE 应显示升级信息', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscriptions/tenant/${TEST_TENANT.id}/preview/ENTERPRISE`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.tenantId).toBe(TEST_TENANT.id);
      expect(data.currentPlan).toBe('PROFESSIONAL');
      expect(data.targetPlan).toBe('ENTERPRISE');
      expect(data.isUpgrade).toBe(true);
      expect(data.priceDifference).toBeGreaterThan(0);
      expect(data.requiresImmediatePayment).toBe(true);

      // 验证配额变更
      expect(data.quotaChanges).toHaveProperty('instances');
      expect(data.quotaChanges).toHaveProperty('admins');
      expect(data.quotaChanges.instances.from).toBe(5); // PROFESSIONAL
      expect(data.quotaChanges.instances.to).toBe(50); // ENTERPRISE
    });

    it('预览降级到 BASIC 应显示降级信息和警告', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscriptions/tenant/${TEST_TENANT.id}/preview/BASIC`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.tenantId).toBe(TEST_TENANT.id);
      expect(data.currentPlan).toBe('PROFESSIONAL');
      expect(data.targetPlan).toBe('BASIC');
      expect(data.isUpgrade).toBe(false);
      expect(data.priceDifference).toBeLessThan(0);
      expect(data.requiresImmediatePayment).toBe(false);

      // 验证配额变更
      expect(data.quotaChanges.instances.from).toBe(5); // PROFESSIONAL
      expect(data.quotaChanges.instances.to).toBe(2); // BASIC
    });

    it('预览降级到 TRIAL 应返回降级信息', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscriptions/tenant/${TEST_TENANT.id}/preview/TRIAL`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.isUpgrade).toBe(false);
      expect(data.targetPlan).toBe('TRIAL');
    });

    it('租户不存在应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/tenant/non-existent-tenant-id/preview/ENTERPRISE')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscriptions/tenant/${TEST_TENANT.id}/preview/ENTERPRISE`)
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 更新订阅测试 ====================

  describe('POST /subscriptions/tenant/:tenantId - 更新租户订阅', () => {
    it('应能成功升级订阅到 ENTERPRISE', async () => {
      const updateDto = {
        plan: 'ENTERPRISE',
        billingCycle: 'MONTHLY',
      };

      const response = await request(app.getHttpServer())
        .post(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(updateDto)
        .expect(201); // POST 默认返回 201

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.tenantId).toBe(TEST_TENANT.id);
      expect(data.currentPlan).toBe('ENTERPRISE');
      expect(data.billingCycle).toBe('MONTHLY');
    });

    it('应能更改计费周期', async () => {
      const updateDto = {
        plan: 'PROFESSIONAL',
        billingCycle: 'YEARLY',
      };

      const response = await request(app.getHttpServer())
        .post(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(updateDto)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.billingCycle).toBe('YEARLY');
    });

    it('应能设置自定义配额上限', async () => {
      const updateDto = {
        plan: 'ENTERPRISE',
        billingCycle: 'MONTHLY',
        maxInstances: 100,
        maxAdmins: 200,
      };

      const response = await request(app.getHttpServer())
        .post(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(updateDto)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.instanceQuota.max).toBe(100);
      expect(data.adminQuota.max).toBe(200);
    });

    it('缺少 plan 参数应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ billingCycle: 'MONTHLY' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('缺少 billingCycle 参数应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ plan: 'ENTERPRISE' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无效的 plan 值应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ plan: 'INVALID_PLAN', billingCycle: 'MONTHLY' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('无效的 billingCycle 值应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ plan: 'ENTERPRISE', billingCycle: 'INVALID_CYCLE' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('租户不存在应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/subscriptions/tenant/non-existent-tenant-id')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ plan: 'ENTERPRISE', billingCycle: 'MONTHLY' })
        .expect(404);

      expectNotFoundError(response);
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .send({ plan: 'ENTERPRISE', billingCycle: 'MONTHLY' })
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 续订测试 ====================

  describe('POST /subscriptions/tenant/:tenantId/renew - 续订租户订阅', () => {
    it('应能成功续订', async () => {
      const response = await request(app.getHttpServer())
        .post(`/subscriptions/tenant/${TEST_TENANT.id}/renew`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(201);

      expectSuccessResponse(response);
      const data = getSuccessData<any>(response);

      expect(data.tenantId).toBe(TEST_TENANT.id);
      expect(data).toHaveProperty('expiresAt');
    });

    it('租户不存在应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/subscriptions/tenant/non-existent-tenant-id/renew')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(404);

      expectNotFoundError(response);
    });

    it('无认证应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post(`/subscriptions/tenant/${TEST_TENANT.id}/renew`)
        .expect(401);

      expectAuthError(response);
    });
  });

  // ==================== 边界情况测试 ====================

  describe('边界情况和数据验证', () => {
    it('订阅状态响应应包含正确的配额计算', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      const data = getSuccessData<any>(response);

      // 验证配额计算：available = max - used
      expect(data.instanceQuota.available).toBe(
        data.instanceQuota.max - data.instanceQuota.used,
      );
      expect(data.adminQuota.available).toBe(
        data.adminQuota.max - data.adminQuota.used,
      );
    });

    it('各计划配置应有合理的价格递增', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/plans')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      const data = getSuccessData<any[]>(response);

      const trial = data.find((p: any) => p.plan === 'TRIAL');
      const basic = data.find((p: any) => p.plan === 'BASIC');
      const professional = data.find((p: any) => p.plan === 'PROFESSIONAL');
      const enterprise = data.find((p: any) => p.plan === 'ENTERPRISE');

      // 价格应递增
      expect(trial.monthlyPrice).toBeLessThanOrEqual(basic.monthlyPrice);
      expect(basic.monthlyPrice).toBeLessThan(professional.monthlyPrice);
      expect(professional.monthlyPrice).toBeLessThan(enterprise.monthlyPrice);

      // 配额应递增
      expect(trial.maxInstances).toBeLessThanOrEqual(basic.maxInstances);
      expect(basic.maxInstances).toBeLessThan(professional.maxInstances);
      expect(professional.maxInstances).toBeLessThan(enterprise.maxInstances);
    });

    it('各计划的季度和年度价格应有折扣', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/plans')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      const data = getSuccessData<any[]>(response);

      data.forEach((plan: any) => {
        if (plan.monthlyPrice > 0) {
          // 季度价格应低于 3 个月价格
          expect(plan.quarterlyPrice).toBeLessThan(plan.monthlyPrice * 3);
          // 年度价格应低于 12 个月价格
          expect(plan.yearlyPrice).toBeLessThan(plan.monthlyPrice * 12);
        }
      });
    });

    it('预览相同计划应返回相同计划信息', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscriptions/tenant/${TEST_TENANT.id}/preview/PROFESSIONAL`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      const data = getSuccessData<any>(response);

      // 当前计划和目标计划相同
      expect(data.currentPlan).toBe('PROFESSIONAL');
      expect(data.targetPlan).toBe('PROFESSIONAL');
      expect(data.isUpgrade).toBe(false);
      expect(data.priceDifference).toBe(0);
    });
  });

  // ==================== 计费周期测试 ====================

  describe('计费周期变更', () => {
    it('应支持 MONTHLY 计费周期', async () => {
      const response = await request(app.getHttpServer())
        .post(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ plan: 'PROFESSIONAL', billingCycle: 'MONTHLY' })
        .expect(201);

      const data = getSuccessData<any>(response);
      expect(data.billingCycle).toBe('MONTHLY');
    });

    it('应支持 QUARTERLY 计费周期', async () => {
      const response = await request(app.getHttpServer())
        .post(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ plan: 'PROFESSIONAL', billingCycle: 'QUARTERLY' })
        .expect(201);

      const data = getSuccessData<any>(response);
      expect(data.billingCycle).toBe('QUARTERLY');
    });

    it('应支持 YEARLY 计费周期', async () => {
      const response = await request(app.getHttpServer())
        .post(`/subscriptions/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ plan: 'PROFESSIONAL', billingCycle: 'YEARLY' })
        .expect(201);

      const data = getSuccessData<any>(response);
      expect(data.billingCycle).toBe('YEARLY');
    });
  });
});
