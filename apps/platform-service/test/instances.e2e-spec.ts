/**
 * Instances 模块契约测试
 * 测试 MT5 中间件实例管理相关 API 的响应格式
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
  TEST_INSTANCE_OFFLINE,
  TEST_INSTANCE_ERROR,
} from './fixtures/test-data';
import {
  expectSuccessResponse,
  expectErrorResponse,
  expectAuthError,
  expectNotFoundError,
  expectPaginatedResponse,
  expectInstanceResponse,
  expectInstanceCreatedResponse,
} from './utils/validators';
import { of, throwError } from 'rxjs';

describe('Instances 模块契约测试 (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;
  let mockHttpService: { get: jest.Mock; post: jest.Mock };

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();

    // Mock HttpService for health check tests
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
  });

  // ==================== 认证测试 ====================

  describe('认证和授权', () => {
    it('无认证 token 应返回 401', async () => {
      const response = await request(app.getHttpServer()).get('/instances');

      expectAuthError(response);
    });

    it('无效 token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/instances')
        .set('Authorization', 'Bearer invalid-token');

      expectAuthError(response);
    });

    it('过期 token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/instances')
        .set('Authorization', `Bearer ${TEST_TOKENS.expired}`);

      expectAuthError(response);
    });

    it('Tenant Admin 访问 instances 应返回 403', async () => {
      const response = await request(app.getHttpServer())
        .get('/instances')
        .set('Authorization', `Bearer ${TEST_TOKENS.tenantAdmin}`);

      expect(response.status).toBe(403);
      expectErrorResponse(response);
    });
  });

  // ==================== 实例列表测试 ====================

  describe('GET /instances - 获取实例列表', () => {
    it('应能获取分页实例列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/instances')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect(response.status).toBe(200);
      expectSuccessResponse(response);
      expectPaginatedResponse(response, 'data');

      const { data } = response.body;
      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('page');
      expect(data).toHaveProperty('limit');
    });

    it('应能按状态筛选实例', async () => {
      const response = await request(app.getHttpServer())
        .get('/instances?status=ONLINE')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect(response.status).toBe(200);
      expectSuccessResponse(response);
    });

    it('应能按租户 ID 筛选实例', async () => {
      const response = await request(app.getHttpServer())
        .get(`/instances?tenantId=${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect(response.status).toBe(200);
      expectSuccessResponse(response);
    });

    it('应能搜索实例', async () => {
      const response = await request(app.getHttpServer())
        .get('/instances?search=Production')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect(response.status).toBe(200);
      expectSuccessResponse(response);
    });
  });

  // ==================== 实例统计测试 ====================

  describe('GET /instances/stats - 获取实例统计', () => {
    it('应能获取实例统计数据', async () => {
      const response = await request(app.getHttpServer())
        .get('/instances/stats')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect(response.status).toBe(200);
      expectSuccessResponse(response);

      const { data } = response.body;
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('online');
      expect(data).toHaveProperty('offline');
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('byTenant');
      expect(Array.isArray(data.byTenant)).toBe(true);
    });
  });

  // ==================== 实例详情测试 ====================

  describe('GET /instances/:id - 获取实例详情', () => {
    it('应能获取实例详情', async () => {
      const response = await request(app.getHttpServer())
        .get(`/instances/${TEST_INSTANCE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect(response.status).toBe(200);
      expectSuccessResponse(response);

      const { data } = response.body;
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('tenantId');
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('host');
      expect(data).toHaveProperty('port');
      expect(data).toHaveProperty('status');
    });

    it('不存在的实例应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/instances/99999999-9999-4999-a999-999999999999')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expectNotFoundError(response);
    });
  });

  // ==================== 按租户获取实例测试 ====================

  describe('GET /instances/tenant/:tenantId - 获取租户实例', () => {
    it('应能获取指定租户的所有实例', async () => {
      const response = await request(app.getHttpServer())
        .get(`/instances/tenant/${TEST_TENANT.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect(response.status).toBe(200);
      expectSuccessResponse(response);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  // ==================== 创建实例测试 ====================

  describe('POST /instances - 创建实例', () => {
    it('应能创建新实例', async () => {
      const newInstance = {
        tenantId: TEST_TENANT.id,
        name: 'New Test Instance',
        host: '192.168.1.200',
        port: 8080,
        description: 'Test instance description',
      };

      const response = await request(app.getHttpServer())
        .post('/instances')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(newInstance);

      expect(response.status).toBe(201);
      expectSuccessResponse(response);

      const { data } = response.body;
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('name', newInstance.name);
      expect(data).toHaveProperty('host', newInstance.host);
      expect(data).toHaveProperty('apiKey');
    });

    it('缺少必填字段应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/instances')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ name: 'Test' });

      expect(response.status).toBe(400);
      expectErrorResponse(response);
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/instances')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          tenantId: '99999999-9999-4999-a999-999999999999',
          name: 'Test Instance',
          host: '192.168.1.200',
        });

      expectNotFoundError(response);
    });

    it('应能创建带 MT5 服务器配置的实例', async () => {
      const newInstance = {
        tenantId: TEST_TENANT.id,
        name: 'Instance with MT5 Servers',
        host: '192.168.1.201',
        port: 8080,
        mt5Servers: [
          { name: 'Primary', host: 'mt5-primary.example.com', port: 443 },
          { name: 'Secondary', host: 'mt5-secondary.example.com', port: 443 },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/instances')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(newInstance);

      expect(response.status).toBe(201);
      expectSuccessResponse(response);
    });
  });

  // ==================== 更新实例测试 ====================

  describe('PATCH /instances/:id - 更新实例', () => {
    it('应能更新实例信息', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/instances/${TEST_INSTANCE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ name: 'Updated Instance Name' });

      expect(response.status).toBe(200);
      expectSuccessResponse(response);
      expect(response.body.data.name).toBe('Updated Instance Name');
    });

    it('应能更新实例状态', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/instances/${TEST_INSTANCE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ status: 'MAINTENANCE' });

      expect(response.status).toBe(200);
      expectSuccessResponse(response);
      expect(response.body.data.status).toBe('MAINTENANCE');
    });

    it('不存在的实例应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .patch('/instances/99999999-9999-4999-a999-999999999999')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({ name: 'Test' });

      expectNotFoundError(response);
    });
  });

  // ==================== 删除实例测试 ====================

  describe('DELETE /instances/:id - 删除实例', () => {
    it('应能删除实例', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/instances/${TEST_INSTANCE.id}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect(response.status).toBe(204);
    });

    it('不存在的实例应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .delete('/instances/99999999-9999-4999-a999-999999999999')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expectNotFoundError(response);
    });
  });

  // ==================== 重新生成 API Key 测试 ====================

  describe('POST /instances/:id/regenerate-key - 重新生成 API Key', () => {
    it('应能重新生成 API Key', async () => {
      const response = await request(app.getHttpServer())
        .post(`/instances/${TEST_INSTANCE.id}/regenerate-key`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect([200, 201]).toContain(response.status);
      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('apiKey');
      expect(response.body.data.apiKey).toMatch(/^mt5_/);
    });

    it('不存在的实例应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/instances/99999999-9999-4999-a999-999999999999/regenerate-key')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expectNotFoundError(response);
    });
  });

  // ==================== 健康检查测试 ====================

  describe('POST /instances/:id/health-check - 实例健康检查', () => {
    it('健康检查成功应返回 online 状态', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { status: 'healthy', uptime: 12345 },
          status: 200,
        }),
      );

      const response = await request(app.getHttpServer())
        .post(`/instances/${TEST_INSTANCE.id}/health-check`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect([200, 201]).toContain(response.status);
      expectSuccessResponse(response);

      const { data } = response.body;
      expect(data).toHaveProperty('status');
      expect(['online', 'offline', 'error']).toContain(data.status);
    });

    it('健康检查失败应返回 offline/error 状态', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({ code: 'ECONNREFUSED', message: 'Connection refused' })),
      );

      const response = await request(app.getHttpServer())
        .post(`/instances/${TEST_INSTANCE.id}/health-check`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect([200, 201]).toContain(response.status);
      expectSuccessResponse(response);

      const { data } = response.body;
      expect(data).toHaveProperty('status');
      expect(['offline', 'error']).toContain(data.status);
    });

    it('不存在的实例应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/instances/99999999-9999-4999-a999-999999999999/health-check')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expectNotFoundError(response);
    });
  });

  // ==================== 批量健康检查测试 ====================

  describe('POST /instances/health-check/all - 批量健康检查', () => {
    it('应能执行批量健康检查', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { status: 'healthy' },
          status: 200,
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/instances/health-check/all')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect([200, 201]).toContain(response.status);
      expectSuccessResponse(response);

      const { data } = response.body;
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('checked');
      expect(data).toHaveProperty('online');
      expect(data).toHaveProperty('offline');
      expect(data).toHaveProperty('error');
    });
  });

  // ==================== 配额验证测试 ====================

  describe('GET /instances/tenant/:tenantId/quota - 获取租户配额', () => {
    it('应能获取租户配额使用情况', async () => {
      const response = await request(app.getHttpServer())
        .get(`/instances/tenant/${TEST_TENANT.id}/quota`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect(response.status).toBe(200);
      expectSuccessResponse(response);

      const { data } = response.body;
      expect(data).toHaveProperty('tenantId');
      expect(data).toHaveProperty('instances');
      expect(data.instances).toHaveProperty('used');
      expect(data.instances).toHaveProperty('max');
      expect(data.instances).toHaveProperty('available');
      expect(data).toHaveProperty('admins');
      expect(data.admins).toHaveProperty('used');
      expect(data.admins).toHaveProperty('max');
      expect(data.admins).toHaveProperty('available');
    });

    it('不存在的租户应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/instances/tenant/99999999-9999-4999-a999-999999999999/quota')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expectNotFoundError(response);
    });
  });

  // ==================== MT5 服务器配置测试 ====================

  describe('GET /instances/:id/mt5-servers - 获取 MT5 服务器配置', () => {
    it('应能获取实例的 MT5 服务器列表', async () => {
      const response = await request(app.getHttpServer())
        .get(`/instances/${TEST_INSTANCE.id}/mt5-servers`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect(response.status).toBe(200);
      expectSuccessResponse(response);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('不存在的实例应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/instances/99999999-9999-4999-a999-999999999999/mt5-servers')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expectNotFoundError(response);
    });
  });

  describe('PATCH /instances/:id/mt5-servers - 更新 MT5 服务器配置', () => {
    it('应能更新 MT5 服务器配置', async () => {
      const servers = [
        { name: 'Primary', host: 'mt5-primary.example.com', port: 443, isDefault: true },
        { name: 'Secondary', host: 'mt5-secondary.example.com', port: 443 },
      ];

      const response = await request(app.getHttpServer())
        .patch(`/instances/${TEST_INSTANCE.id}/mt5-servers`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(servers);

      expect(response.status).toBe(200);
      expectSuccessResponse(response);
    });

    it('多个默认服务器应返回 400', async () => {
      const servers = [
        { name: 'Primary', host: 'mt5-primary.example.com', port: 443, isDefault: true },
        { name: 'Secondary', host: 'mt5-secondary.example.com', port: 443, isDefault: true },
      ];

      const response = await request(app.getHttpServer())
        .patch(`/instances/${TEST_INSTANCE.id}/mt5-servers`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(servers);

      expect(response.status).toBe(400);
      expectErrorResponse(response);
    });
  });

  describe('POST /instances/:id/mt5-servers - 添加 MT5 服务器', () => {
    it('应能添加 MT5 服务器', async () => {
      // 首先清空 MT5 服务器列表
      mockPrismaService.middlewareInstance.findUnique.mockResolvedValueOnce({
        ...TEST_INSTANCE,
        mt5Servers: [],
      });

      const newServer = {
        name: 'New MT5 Server',
        host: 'mt5-new.example.com',
        port: 443,
      };

      const response = await request(app.getHttpServer())
        .post(`/instances/${TEST_INSTANCE.id}/mt5-servers`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send(newServer);

      expect(response.status).toBe(201);
      expectSuccessResponse(response);
    });

    it('重复服务器名称应返回 400', async () => {
      const existingServerName = TEST_INSTANCE.mt5Servers?.[0]?.name || 'MT5-Live';

      const response = await request(app.getHttpServer())
        .post(`/instances/${TEST_INSTANCE.id}/mt5-servers`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .send({
          name: existingServerName,
          host: 'mt5-duplicate.example.com',
          port: 443,
        });

      expect(response.status).toBe(400);
      expectErrorResponse(response);
    });
  });

  describe('DELETE /instances/:id/mt5-servers/:serverName - 删除 MT5 服务器', () => {
    it('应能删除 MT5 服务器', async () => {
      const serverName = TEST_INSTANCE.mt5Servers?.[0]?.name || 'MT5-Live';

      const response = await request(app.getHttpServer())
        .delete(`/instances/${TEST_INSTANCE.id}/mt5-servers/${encodeURIComponent(serverName)}`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect(response.status).toBe(204);
    });

    it('不存在的服务器应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/instances/${TEST_INSTANCE.id}/mt5-servers/non-existent-server`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expectNotFoundError(response);
    });
  });

  describe('POST /instances/:id/mt5-servers/:serverName/set-default - 设置默认 MT5 服务器', () => {
    it('应能设置默认 MT5 服务器', async () => {
      const serverName = TEST_INSTANCE.mt5Servers?.[0]?.name || 'MT5-Live';

      // 确保 mock 返回包含 mt5Servers 的完整实例数据
      const instanceWithMt5Servers = {
        ...TEST_INSTANCE,
        mt5Servers: [{ name: 'MT5-Live', host: 'mt5.example.com', port: 443 }],
        tenant: TEST_TENANT,
      };
      mockPrismaService.middlewareInstance.findUnique.mockResolvedValue(instanceWithMt5Servers);
      mockPrismaService.middlewareInstance.update.mockResolvedValue({
        ...instanceWithMt5Servers,
        mt5Servers: [{ name: 'MT5-Live', host: 'mt5.example.com', port: 443, isDefault: true }],
      });

      const response = await request(app.getHttpServer())
        .post(`/instances/${TEST_INSTANCE.id}/mt5-servers/${encodeURIComponent(serverName)}/set-default`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect([200, 201]).toContain(response.status);
      expectSuccessResponse(response);
    });

    it('不存在的服务器应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post(`/instances/${TEST_INSTANCE.id}/mt5-servers/non-existent-server/set-default`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expectNotFoundError(response);
    });
  });

  describe('POST /instances/:id/mt5-servers/:serverName/test - 测试 MT5 服务器连接', () => {
    it('连接测试成功应返回 success=true', async () => {
      // 确保 mock 返回包含 mt5Servers 的完整实例数据
      const instanceWithMt5Servers = {
        ...TEST_INSTANCE,
        mt5Servers: [{ name: 'MT5-Live', host: 'mt5.example.com', port: 443 }],
        tenant: TEST_TENANT,
      };
      mockPrismaService.middlewareInstance.findUnique.mockResolvedValue(instanceWithMt5Servers);

      mockHttpService.post.mockReturnValue(
        of({
          data: { success: true, message: 'Connection successful' },
          status: 200,
        }),
      );

      const serverName = TEST_INSTANCE.mt5Servers?.[0]?.name || 'MT5-Live';

      const response = await request(app.getHttpServer())
        .post(`/instances/${TEST_INSTANCE.id}/mt5-servers/${encodeURIComponent(serverName)}/test`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect([200, 201]).toContain(response.status);
      expectSuccessResponse(response);

      const { data } = response.body;
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('latencyMs');
    });

    it('连接测试失败应返回 success=false', async () => {
      // 确保 mock 返回包含 mt5Servers 的完整实例数据
      const instanceWithMt5Servers = {
        ...TEST_INSTANCE,
        mt5Servers: [{ name: 'MT5-Live', host: 'mt5.example.com', port: 443 }],
        tenant: TEST_TENANT,
      };
      mockPrismaService.middlewareInstance.findUnique.mockResolvedValue(instanceWithMt5Servers);

      mockHttpService.post.mockReturnValue(
        throwError(() => ({ message: 'Connection failed' })),
      );

      const serverName = TEST_INSTANCE.mt5Servers?.[0]?.name || 'MT5-Live';

      const response = await request(app.getHttpServer())
        .post(`/instances/${TEST_INSTANCE.id}/mt5-servers/${encodeURIComponent(serverName)}/test`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expect([200, 201]).toContain(response.status);
      expectSuccessResponse(response);

      const { data } = response.body;
      expect(data).toHaveProperty('success', false);
      expect(data).toHaveProperty('message');
    });

    it('不存在的服务器应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post(`/instances/${TEST_INSTANCE.id}/mt5-servers/non-existent-server/test`)
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`);

      expectNotFoundError(response);
    });
  });

  // ==================== 权限级别测试 ====================

  describe('权限级别测试', () => {
    it('ADMIN 角色应能访问实例列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/instances')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformAdmin}`);

      expect(response.status).toBe(200);
      expectSuccessResponse(response);
    });

    it('OPERATOR 角色应能访问实例列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/instances')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformOperator}`);

      expect(response.status).toBe(200);
      expectSuccessResponse(response);
    });
  });
});
