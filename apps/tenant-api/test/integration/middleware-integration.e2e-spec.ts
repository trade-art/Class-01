/**
 * SaaS 平台与中间件集成 E2E 测试
 * 测试完整流程: 创建配置 → 认证 → 获取数据
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MtServerService } from '../../src/middleware-proxy/services/mt-server.service';
import { TradingService } from '../../src/middleware-proxy/services/trading.service';
import { AdapterFactory } from '../../src/middleware-proxy/adapters/adapter.factory';
import {
  MockMiddlewareServer,
  createMockMiddlewareServer,
  cleanupMockMiddleware,
} from '../mocks/mock-middleware';
import {
  TEST_TENANT,
  TEST_ADMIN,
  TEST_TRADING_USERS,
  TEST_POSITIONS,
  TEST_QUOTES,
} from '../fixtures/test-data';
import { AccountLockoutService } from '../../src/security/account-lockout.service';
import { RateLimiterService } from '../../src/security/rate-limiter.service';
import { MockAccountLockoutService } from '../mocks/account-lockout.mock';
import { MockRateLimiterService } from '../mocks/rate-limiter.mock';

// ==================== 测试数据 ====================

const INTEGRATION_TEST_TENANT = {
  ...TEST_TENANT,
  id: 'tenant-integration-001',
  code: 'INT_TEST',
  name: 'Integration Test Tenant',
  maxMtServers: 10, // 最大服务器数量
  supportedPlatforms: ['MT5', 'MT4'], // 支持的平台类型
};

const INTEGRATION_TEST_ADMIN = {
  ...TEST_ADMIN,
  id: 'admin-integration-001',
  email: 'admin@integration-test.com',
  tenantId: INTEGRATION_TEST_TENANT.id,
};

const TEST_MT_SERVER_CONFIG = {
  serverId: 'mt5-integration-test',
  displayName: 'Integration Test MT5 Server',
  platformType: 'MT5',
  middlewareId: 'middleware-integration-001', // 中间件实例 ID (必填)
  middlewareUrl: 'http://localhost:3001',
  serverAddress: 'mt5.integration-test.com:443',
  isDefault: true,
};

// ==================== Mock PrismaService ====================

class MockPrismaService {
  private mtServers: any[] = [];
  private serverIdCounter = 0;

  tenant = {
    findUnique: jest.fn().mockImplementation(({ where, select }) => {
      if (where.id === INTEGRATION_TEST_TENANT.id) {
        // 如果查询包含 _count，返回带有 _count 的对象
        if (select?._count) {
          return Promise.resolve({
            ...INTEGRATION_TEST_TENANT,
            _count: { mtServers: this.mtServers.length },
          });
        }
        return Promise.resolve(INTEGRATION_TEST_TENANT);
      }
      return Promise.resolve(null);
    }),
    findFirst: jest.fn().mockResolvedValue(INTEGRATION_TEST_TENANT),
  };

  tenantAdmin = {
    findUnique: jest.fn().mockImplementation(({ where, include }) => {
      if (where.id === INTEGRATION_TEST_ADMIN.id) {
        const admin = { ...INTEGRATION_TEST_ADMIN };
        if (include?.tenant) {
          return Promise.resolve({ ...admin, tenant: INTEGRATION_TEST_TENANT });
        }
        return Promise.resolve(admin);
      }
      return Promise.resolve(null);
    }),
    findFirst: jest.fn().mockImplementation(({ where, include }) => {
      if (where.email === INTEGRATION_TEST_ADMIN.email) {
        const admin = { ...INTEGRATION_TEST_ADMIN };
        if (include?.tenant) {
          return Promise.resolve({ ...admin, tenant: INTEGRATION_TEST_TENANT });
        }
        return Promise.resolve(admin);
      }
      return Promise.resolve(null);
    }),
    update: jest.fn().mockImplementation(({ where, data }) => {
      if (where.id === INTEGRATION_TEST_ADMIN.id) {
        return Promise.resolve({ ...INTEGRATION_TEST_ADMIN, ...data });
      }
      return Promise.reject(new Error('Admin not found'));
    }),
  };

  mtServer = {
    findMany: jest.fn().mockImplementation(({ where }) => {
      let result = [...this.mtServers];
      if (where?.tenantId) {
        result = result.filter(s => s.tenantId === where.tenantId);
      }
      if (where?.isActive !== undefined) {
        result = result.filter(s => s.isActive === where.isActive);
      }
      return Promise.resolve(result);
    }),
    findFirst: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        this.mtServers.find(s => {
          if (where.tenantId && s.tenantId !== where.tenantId) return false;
          if (where.serverId && s.serverId !== where.serverId) return false;
          if (where.isDefault !== undefined && s.isDefault !== where.isDefault) return false;
          if (where.isActive !== undefined && s.isActive !== where.isActive) return false;
          return true;
        }) || null
      );
    }),
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (where.tenantId_serverId) {
        return Promise.resolve(
          this.mtServers.find(
            s =>
              s.tenantId === where.tenantId_serverId.tenantId &&
              s.serverId === where.tenantId_serverId.serverId
          ) || null
        );
      }
      if (where.id) {
        return Promise.resolve(this.mtServers.find(s => s.id === where.id) || null);
      }
      return Promise.resolve(null);
    }),
    create: jest.fn().mockImplementation(({ data }) => {
      const newServer = {
        id: `server-integration-${++this.serverIdCounter}`,
        ...data,
        isActive: data.isActive ?? true,
        _count: { managers: 0 }, // 新创建的服务器没有关联的经理
        managers: [], // 经理列表为空
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.mtServers.push(newServer);
      return Promise.resolve(newServer);
    }),
    update: jest.fn().mockImplementation(({ where, data }) => {
      let server = null;
      if (where.id) {
        server = this.mtServers.find(s => s.id === where.id);
      } else if (where.tenantId_serverId) {
        server = this.mtServers.find(
          s =>
            s.tenantId === where.tenantId_serverId.tenantId &&
            s.serverId === where.tenantId_serverId.serverId
        );
      }
      if (server) {
        Object.assign(server, data, { updatedAt: new Date() });
        return Promise.resolve(server);
      }
      return Promise.reject(new Error('Server not found'));
    }),
    updateMany: jest.fn().mockImplementation(({ where, data }) => {
      let count = 0;
      this.mtServers.forEach(s => {
        if (where.tenantId && s.tenantId === where.tenantId) {
          if (!where.isDefault || s.isDefault === where.isDefault) {
            Object.assign(s, data);
            count++;
          }
        }
      });
      return Promise.resolve({ count });
    }),
    delete: jest.fn().mockImplementation(({ where }) => {
      let serverIndex = -1;
      if (where.id) {
        serverIndex = this.mtServers.findIndex(s => s.id === where.id);
      }
      if (serverIndex !== -1) {
        const deleted = this.mtServers.splice(serverIndex, 1)[0];
        return Promise.resolve(deleted);
      }
      return Promise.reject(new Error('Server not found'));
    }),
    count: jest.fn().mockImplementation(({ where }) => {
      let count = this.mtServers.filter(s => {
        if (where?.tenantId && s.tenantId !== where.tenantId) return false;
        return true;
      }).length;
      return Promise.resolve(count);
    }),
  };

  tenantDomain = {
    findUnique: jest.fn().mockResolvedValue(null),
  };

  middlewareInstance = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
  };

  ipBlacklist = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'blacklist-1', ...data })),
    update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
  };

  auditLog = {
    create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    findMany: jest.fn().mockResolvedValue([]),
  };

  $transaction = jest.fn().mockImplementation(async operations => {
    if (Array.isArray(operations)) {
      return Promise.all(operations);
    }
    return operations(this);
  });

  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);
  $queryRaw = jest.fn().mockResolvedValue([{ result: 1 }]);

  // 清理所有服务器
  resetServers() {
    this.mtServers = [];
    this.serverIdCounter = 0;
  }

  // 添加测试服务器
  addTestServer(server: any) {
    this.mtServers.push(server);
  }

  resetMocks() {
    this.resetServers();
    jest.clearAllMocks();
  }
}

// ==================== 测试套件 ====================

describe('SaaS Middleware Integration (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;
  let mockMiddleware: MockMiddlewareServer;
  let jwtService: JwtService;
  let adminToken: string;

  beforeAll(async () => {
    // 创建 Mock 中间件服务器
    mockMiddleware = createMockMiddlewareServer('http://localhost:3001');

    mockPrismaService = new MockPrismaService();
    const mockAccountLockoutService = new MockAccountLockoutService();
    const mockRateLimiterService = new MockRateLimiterService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(AccountLockoutService)
      .useValue(mockAccountLockoutService)
      .overrideProvider(RateLimiterService)
      .useValue(mockRateLimiterService)
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      })
    );

    app.setGlobalPrefix('tenant');

    await app.init();

    // 创建测试 Token
    jwtService = new JwtService({
      secret: process.env.JWT_SECRET || 'test-jwt-secret-key-for-e2e-testing',
    });

    adminToken = jwtService.sign({
      sub: INTEGRATION_TEST_ADMIN.id,
      email: INTEGRATION_TEST_ADMIN.email,
      tenantId: INTEGRATION_TEST_TENANT.id,
      role: 'admin',
    });
  });

  afterAll(async () => {
    cleanupMockMiddleware();
    await app.close();
  });

  beforeEach(() => {
    mockPrismaService.resetMocks();
    mockMiddleware.reset();
  });

  // ==================== 完整流程测试 ====================

  describe('完整集成流程', () => {
    it('应该能完成: 创建服务器配置 → 测试连接 → 设为默认', async () => {
      // 步骤 1: 创建 MT 服务器配置
      const createResponse = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(TEST_MT_SERVER_CONFIG)
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.serverId).toBe(TEST_MT_SERVER_CONFIG.serverId);
      expect(createResponse.body.data.displayName).toBe(TEST_MT_SERVER_CONFIG.displayName);
      expect(createResponse.body.data.platformType).toBe(TEST_MT_SERVER_CONFIG.platformType);

      const createdServerId = createResponse.body.data.serverId;

      // 步骤 2: 获取服务器列表验证创建成功
      const listResponse = await request(app.getHttpServer())
        .get('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listResponse.body.success).toBe(true);
      expect(listResponse.body.data.servers).toHaveLength(1);
      expect(listResponse.body.data.servers[0].serverId).toBe(createdServerId);

      // 步骤 3: 获取单个服务器详情
      const detailResponse = await request(app.getHttpServer())
        .get(`/tenant/mt-servers/${createdServerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(detailResponse.body.success).toBe(true);
      expect(detailResponse.body.data.serverId).toBe(createdServerId);
      expect(detailResponse.body.data.middlewareUrl).toBe(TEST_MT_SERVER_CONFIG.middlewareUrl);

      // 步骤 4: 测试服务器连接
      const testConnectionResponse = await request(app.getHttpServer())
        .post(`/tenant/mt-servers/${createdServerId}/test-connection`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(testConnectionResponse.body.success).toBe(true);
      // 连接测试结果在 data 中
      expect(testConnectionResponse.body.data).toBeDefined();
    });

    it('应该能处理创建重复服务器的错误', async () => {
      // 创建第一个服务器
      await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(TEST_MT_SERVER_CONFIG)
        .expect(201);

      // 尝试创建相同 serverId 的服务器
      const duplicateResponse = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(TEST_MT_SERVER_CONFIG)
        .expect(409);

      expect(duplicateResponse.body.success).toBe(false);
    });

    it('应该能更新服务器配置', async () => {
      // 创建服务器
      const createResponse = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(TEST_MT_SERVER_CONFIG)
        .expect(201);

      const serverId = createResponse.body.data.serverId;

      // 更新服务器配置
      const updateDto = {
        displayName: 'Updated Integration Test Server',
        middlewareUrl: 'http://updated-middleware:8080',
      };

      const updateResponse = await request(app.getHttpServer())
        .put(`/tenant/mt-servers/${serverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateDto)
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.data.displayName).toBe(updateDto.displayName);
    });

    it('应该能删除非默认服务器', async () => {
      // 创建两个服务器
      const server1Config = {
        ...TEST_MT_SERVER_CONFIG,
        serverId: 'mt5-server-1',
        isDefault: true,
      };

      const server2Config = {
        ...TEST_MT_SERVER_CONFIG,
        serverId: 'mt5-server-2',
        isDefault: false,
      };

      await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(server1Config)
        .expect(201);

      await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(server2Config)
        .expect(201);

      // 删除非默认服务器
      await request(app.getHttpServer())
        .delete(`/tenant/mt-servers/${server2Config.serverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // 验证服务器已删除
      const listResponse = await request(app.getHttpServer())
        .get('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listResponse.body.data.servers).toHaveLength(1);
      expect(listResponse.body.data.servers[0].serverId).toBe(server1Config.serverId);
    });
  });

  // ==================== 错误处理测试 ====================

  describe('错误处理', () => {
    it('访问不存在的服务器应该返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/mt-servers/non-existent-server')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('使用无效 URL 格式创建服务器应该返回 400', async () => {
      const invalidConfig = {
        ...TEST_MT_SERVER_CONFIG,
        serverId: 'mt5-invalid-url',
        middlewareUrl: ':::invalid:::url:::',
      };

      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidConfig)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('缺少必填字段应该返回 400', async () => {
      const incompleteConfig = {
        serverId: 'mt5-incomplete',
        // 缺少 middlewareId, middlewareUrl, serverAddress
      };

      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(incompleteConfig)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('未认证请求应该返回 401', async () => {
      await request(app.getHttpServer())
        .get('/tenant/mt-servers')
        .expect(401);
    });
  });

  // ==================== 输入验证测试 ====================

  describe('输入验证', () => {
    it('middlewareId 不能为空', async () => {
      const invalidConfig = {
        ...TEST_MT_SERVER_CONFIG,
        serverId: 'mt5-empty-middleware',
        middlewareId: '',
      };

      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidConfig)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('platformType 必须是 MT4 或 MT5', async () => {
      const invalidConfig = {
        ...TEST_MT_SERVER_CONFIG,
        serverId: 'mt5-invalid-platform',
        platformType: 'MT6',
      };

      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidConfig)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('serverId 不能为空', async () => {
      const invalidConfig = {
        ...TEST_MT_SERVER_CONFIG,
        serverId: '',
      };

      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidConfig)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== 多服务器管理测试 ====================

  describe('多服务器管理', () => {
    it('应该能管理多个 MT 服务器', async () => {
      // 创建多个服务器
      const servers = [
        { ...TEST_MT_SERVER_CONFIG, serverId: 'mt5-server-a', displayName: 'Server A', isDefault: true },
        { ...TEST_MT_SERVER_CONFIG, serverId: 'mt5-server-b', displayName: 'Server B', isDefault: false },
        { ...TEST_MT_SERVER_CONFIG, serverId: 'mt5-server-c', displayName: 'Server C', isDefault: false },
      ];

      for (const serverConfig of servers) {
        await request(app.getHttpServer())
          .post('/tenant/mt-servers')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(serverConfig)
          .expect(201);
      }

      // 获取服务器列表
      const listResponse = await request(app.getHttpServer())
        .get('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listResponse.body.success).toBe(true);
      expect(listResponse.body.data.servers).toHaveLength(3);
      expect(listResponse.body.data.total).toBe(3);
    });

    it('应该能切换默认服务器', async () => {
      // 创建两个服务器
      const server1Config = {
        ...TEST_MT_SERVER_CONFIG,
        serverId: 'mt5-default-test-1',
        isDefault: true,
      };

      const server2Config = {
        ...TEST_MT_SERVER_CONFIG,
        serverId: 'mt5-default-test-2',
        isDefault: false,
      };

      await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(server1Config)
        .expect(201);

      await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(server2Config)
        .expect(201);

      // 将 server2 设为默认
      const setDefaultResponse = await request(app.getHttpServer())
        .post(`/tenant/mt-servers/${server2Config.serverId}/set-default`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(setDefaultResponse.body.success).toBe(true);
      expect(setDefaultResponse.body.data.isDefault).toBe(true);
    });

    it('应该能禁用/启用服务器', async () => {
      // 创建服务器（非默认）
      const serverConfig = {
        ...TEST_MT_SERVER_CONFIG,
        serverId: 'mt5-toggle-test',
        isDefault: false,
      };

      await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(serverConfig)
        .expect(201);

      // 禁用服务器
      const disableResponse = await request(app.getHttpServer())
        .post(`/tenant/mt-servers/${serverConfig.serverId}/toggle-status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(201);

      expect(disableResponse.body.success).toBe(true);

      // 重新启用服务器
      const enableResponse = await request(app.getHttpServer())
        .post(`/tenant/mt-servers/${serverConfig.serverId}/toggle-status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true })
        .expect(201);

      expect(enableResponse.body.success).toBe(true);
    });
  });

  // ==================== 连接测试功能测试 ====================

  describe('连接测试功能', () => {
    beforeEach(async () => {
      // 为每个测试创建服务器
      await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(TEST_MT_SERVER_CONFIG)
        .expect(201);
    });

    it('应该能成功测试连接', async () => {
      // Mock 中间件返回成功
      mockMiddleware.setConnected(true);

      const response = await request(app.getHttpServer())
        .post(`/tenant/mt-servers/${TEST_MT_SERVER_CONFIG.serverId}/test-connection`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('测试不存在的服务器连接应该返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers/non-existent-server/test-connection')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== 数据一致性测试 ====================

  describe('数据一致性', () => {
    it('创建后立即获取应该返回相同数据', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(TEST_MT_SERVER_CONFIG)
        .expect(201);

      const createdData = createResponse.body.data;

      const getResponse = await request(app.getHttpServer())
        .get(`/tenant/mt-servers/${createdData.serverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const retrievedData = getResponse.body.data;

      // 验证关键字段一致
      expect(retrievedData.serverId).toBe(createdData.serverId);
      expect(retrievedData.displayName).toBe(createdData.displayName);
      expect(retrievedData.platformType).toBe(createdData.platformType);
      expect(retrievedData.middlewareUrl).toBe(createdData.middlewareUrl);
      expect(retrievedData.serverAddress).toBe(createdData.serverAddress);
    });

    it('更新后应该反映新值', async () => {
      // 创建
      const createResponse = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(TEST_MT_SERVER_CONFIG)
        .expect(201);

      const serverId = createResponse.body.data.serverId;

      // 更新
      const newDisplayName = 'Updated Server Name';
      await request(app.getHttpServer())
        .put(`/tenant/mt-servers/${serverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ displayName: newDisplayName })
        .expect(200);

      // 获取验证
      const getResponse = await request(app.getHttpServer())
        .get(`/tenant/mt-servers/${serverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(getResponse.body.data.displayName).toBe(newDisplayName);
    });

    it('删除后应该无法获取', async () => {
      // 创建两个服务器（需要非默认才能删除）
      const server1 = { ...TEST_MT_SERVER_CONFIG, serverId: 'mt5-delete-test-1', isDefault: true };
      const server2 = { ...TEST_MT_SERVER_CONFIG, serverId: 'mt5-delete-test-2', isDefault: false };

      await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(server1)
        .expect(201);

      await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(server2)
        .expect(201);

      // 删除非默认服务器
      await request(app.getHttpServer())
        .delete(`/tenant/mt-servers/${server2.serverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // 尝试获取已删除服务器
      const getResponse = await request(app.getHttpServer())
        .get(`/tenant/mt-servers/${server2.serverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(getResponse.body.success).toBe(false);
    });
  });
});
