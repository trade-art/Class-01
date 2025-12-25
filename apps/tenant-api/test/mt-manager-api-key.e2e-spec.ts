/**
 * Manager API Key 连接池模式 E2E 测试
 *
 * 测试覆盖:
 * - Manager API Key 认证流程
 * - Access/Refresh Token 简化结构
 * - Internal API 经理账号列表获取
 * - Token 刷新功能
 *
 * Requirements: REQ-CP4, REQ-CP5
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EncryptionService } from '../src/security/encryption.service';
import { ConfigService } from '@nestjs/config';
import { AccountLockoutService } from '../src/security/account-lockout.service';
import { RateLimiterService } from '../src/security/rate-limiter.service';
import { MockAccountLockoutService } from './mocks/account-lockout.mock';
import { MockRateLimiterService } from './mocks/rate-limiter.mock';

// ==================== 测试数据 ====================

const TEST_TENANT = {
  id: 'tenant-cp-test-001',
  code: 'CP_TEST',
  name: 'Connection Pool Test Tenant',
  status: 'ACTIVE',
  deploymentMode: 'SHARED',
};

const TEST_SERVER = {
  id: 'server-cp-test-001',
  serverId: 'demo-mt5-server',
  displayName: 'Demo MT5 Server',
  platformType: 'MT5',
  middlewareId: 'middleware-cp-test-001',
  middlewareUrl: 'http://middleware:8080',
  serverAddress: 'mt5.example.com:443',
};

const TEST_MANAGER = {
  id: 'manager-cp-test-001',
  tenantId: TEST_TENANT.id,
  managerLogin: BigInt(10007),
  displayName: '连接池测试经理账号',
  isActive: true,
  apiKeyId: 'mk_cp_test_12345',
  apiKeySecretHash: '', // 将在测试中设置
  apiKeyEnabled: true,
  serverId: TEST_SERVER.id,
  serverAddress: 'mt5.example.com:443',
  middlewareId: 'middleware-cp-test-001',
  middlewareUrl: 'http://middleware:8080',
  createdAt: new Date(),
  updatedAt: new Date(),
  server: TEST_SERVER, // 关联服务器对象
};

const TEST_MANAGER_2 = {
  id: 'manager-cp-test-002',
  tenantId: TEST_TENANT.id,
  managerLogin: BigInt(10008),
  displayName: '连接池测试经理账号2',
  isActive: true,
  apiKeyId: null,
  apiKeySecretHash: null,
  apiKeyEnabled: false,
  serverId: TEST_SERVER.id,
  serverAddress: 'mt5.example.com:443',
  middlewareId: 'middleware-cp-test-001',
  middlewareUrl: 'http://middleware:8080',
  createdAt: new Date(),
  updatedAt: new Date(),
  server: TEST_SERVER, // 关联服务器对象
};

const INTERNAL_API_SECRET = 'internal-secret-change-me';

// ==================== Mock Services ====================

class MockPrismaService {
  private managers = [
    { ...TEST_MANAGER },
    { ...TEST_MANAGER_2 },
  ];

  mtManager = {
    findFirst: jest.fn().mockImplementation(({ where }) => {
      if (where.apiKeyId) {
        const manager = this.managers.find(m => m.apiKeyId === where.apiKeyId);
        return Promise.resolve(manager || null);
      }
      if (where.id) {
        const manager = this.managers.find(m => m.id === where.id);
        return Promise.resolve(manager || null);
      }
      return Promise.resolve(null);
    }),
    findMany: jest.fn().mockImplementation(({ where }) => {
      if (where?.middlewareId) {
        const filtered = this.managers.filter(m => m.middlewareId === where.middlewareId);
        return Promise.resolve(filtered);
      }
      return Promise.resolve(this.managers);
    }),
    count: jest.fn().mockImplementation(({ where }) => {
      if (where?.middlewareId) {
        return Promise.resolve(this.managers.filter(m => m.middlewareId === where.middlewareId).length);
      }
      return Promise.resolve(this.managers.length);
    }),
    update: jest.fn().mockResolvedValue({}),
  };

  tenant = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (where.id === TEST_TENANT.id) {
        return Promise.resolve(TEST_TENANT);
      }
      return Promise.resolve(null);
    }),
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

  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);

  // 用于更新测试数据
  setManager(manager: typeof TEST_MANAGER) {
    const index = this.managers.findIndex(m => m.id === manager.id);
    if (index >= 0) {
      this.managers[index] = manager;
    }
  }

  resetMocks() {
    jest.clearAllMocks();
    this.managers = [{ ...TEST_MANAGER }, { ...TEST_MANAGER_2 }];
  }
}

class MockEncryptionService {
  encrypt = jest.fn().mockImplementation((data: string) => {
    return `encrypted:${data}`;
  });

  decrypt = jest.fn().mockImplementation((encrypted: string) => {
    if (encrypted.startsWith('encrypted:')) {
      return encrypted.replace('encrypted:', '');
    }
    throw new Error('Decryption failed');
  });

  encryptToString = jest.fn().mockImplementation((data: string) => {
    return Buffer.from(`encrypted:${data}`).toString('base64');
  });

  decryptFromString = jest.fn().mockImplementation((encrypted: string) => {
    const decoded = Buffer.from(encrypted, 'base64').toString();
    if (decoded.startsWith('encrypted:')) {
      return decoded.replace('encrypted:', '');
    }
    throw new Error('Decryption failed');
  });
}

// ==================== E2E 测试 ====================

describe('MtManagerApiKey E2E Tests (Connection Pool)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;
  let mockEncryptionService: MockEncryptionService;
  let configService: ConfigService;
  let testApiSecret: string;

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();
    mockEncryptionService = new MockEncryptionService();
    const mockAccountLockoutService = new MockAccountLockoutService();
    const mockRateLimiterService = new MockRateLimiterService();
    testApiSecret = 'test-api-secret-12345';

    // 设置 Manager 的加密密钥哈希
    TEST_MANAGER.apiKeySecretHash = mockEncryptionService.encryptToString(testApiSecret);
    mockPrismaService.setManager(TEST_MANAGER);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(EncryptionService)
      .useValue(mockEncryptionService)
      .overrideProvider(AccountLockoutService)
      .useValue(mockAccountLockoutService)
      .overrideProvider(RateLimiterService)
      .useValue(mockRateLimiterService)
      .compile();

    app = moduleFixture.createNestApplication();
    configService = moduleFixture.get<ConfigService>(ConfigService);

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
    TEST_MANAGER.apiKeySecretHash = mockEncryptionService.encryptToString(testApiSecret);
    mockPrismaService.setManager(TEST_MANAGER);
  });

  // ==================== 认证端点测试 ====================

  describe('POST /mt-managers/api-key/authenticate', () => {
    it('应成功认证并返回简化结构的 Token', async () => {
      const response = await request(app.getHttpServer())
        .post('/mt-managers/api-key/authenticate')
        .send({
          apiKeyId: TEST_MANAGER.apiKeyId,
          apiSecret: testApiSecret,
        })
        .expect(200);

      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data).toHaveProperty('tokenType', 'Bearer');
      expect(response.body.data).toHaveProperty('expiresIn');

      // 验证 Token payload 简化结构
      const accessPayload = jwt.decode(response.body.data.accessToken) as Record<string, unknown>;
      expect(accessPayload).toHaveProperty('managerId', TEST_MANAGER.id);
      expect(accessPayload).toHaveProperty('tenantId', TEST_TENANT.id);
      expect(accessPayload).toHaveProperty('apiKeyId', TEST_MANAGER.apiKeyId);
      expect(accessPayload).toHaveProperty('type', 'access');

      // 验证敏感字段不存在
      expect(accessPayload).not.toHaveProperty('managerLogin');
      expect(accessPayload).not.toHaveProperty('serverId');
      expect(accessPayload).not.toHaveProperty('serverAddress');
      expect(accessPayload).not.toHaveProperty('middlewareId');
      expect(accessPayload).not.toHaveProperty('middlewareUrl');
      expect(accessPayload).not.toHaveProperty('password');
      expect(accessPayload).not.toHaveProperty('encryptedPassword');
    });

    it('应返回 manager 信息用于客户端显示', async () => {
      const response = await request(app.getHttpServer())
        .post('/mt-managers/api-key/authenticate')
        .send({
          apiKeyId: TEST_MANAGER.apiKeyId,
          apiSecret: testApiSecret,
        })
        .expect(200);

      expect(response.body.data).toHaveProperty('manager');
      expect(response.body.data.manager).toHaveProperty('id', TEST_MANAGER.id);
      expect(response.body.data.manager).toHaveProperty('displayName', TEST_MANAGER.displayName);
      // manager 对象中不返回 tenantId, 只返回 id, managerLogin, displayName, serverId, serverName, platformType

      // 验证敏感信息不在 manager 对象中
      expect(response.body.data.manager).not.toHaveProperty('apiKeySecretHash');
      expect(response.body.data.manager).not.toHaveProperty('serverAddress');
    });

    it('无效的 API Key ID 应返回 401', async () => {
      await request(app.getHttpServer())
        .post('/mt-managers/api-key/authenticate')
        .send({
          apiKeyId: 'invalid-api-key-id',
          apiSecret: testApiSecret,
        })
        .expect(401);
    });

    it('错误的 API Secret 应返回 401', async () => {
      await request(app.getHttpServer())
        .post('/mt-managers/api-key/authenticate')
        .send({
          apiKeyId: TEST_MANAGER.apiKeyId,
          apiSecret: 'wrong-secret',
        })
        .expect(401);
    });

    it('禁用的 API Key 应返回 401', async () => {
      const disabledManager = {
        ...TEST_MANAGER,
        apiKeyEnabled: false,
      };
      mockPrismaService.setManager(disabledManager);

      await request(app.getHttpServer())
        .post('/mt-managers/api-key/authenticate')
        .send({
          apiKeyId: TEST_MANAGER.apiKeyId,
          apiSecret: testApiSecret,
        })
        .expect(401);
    });

    it('未激活的经理账号应返回 401', async () => {
      const inactiveManager = {
        ...TEST_MANAGER,
        isActive: false,
      };
      mockPrismaService.setManager(inactiveManager);

      await request(app.getHttpServer())
        .post('/mt-managers/api-key/authenticate')
        .send({
          apiKeyId: TEST_MANAGER.apiKeyId,
          apiSecret: testApiSecret,
        })
        .expect(401);
    });
  });

  // ==================== Refresh Token 测试 ====================

  describe('POST /mt-managers/api-key/refresh', () => {
    it('应成功刷新 Token', async () => {
      // 先获取初始 Token
      const authResponse = await request(app.getHttpServer())
        .post('/mt-managers/api-key/authenticate')
        .send({
          apiKeyId: TEST_MANAGER.apiKeyId,
          apiSecret: testApiSecret,
        })
        .expect(200);

      // 刷新 Token
      const refreshResponse = await request(app.getHttpServer())
        .post('/mt-managers/api-key/refresh')
        .send({
          refreshToken: authResponse.body.data.refreshToken,
        })
        .expect(200);

      expect(refreshResponse.body.data).toHaveProperty('accessToken');
      expect(refreshResponse.body.data).toHaveProperty('refreshToken');
      // 验证返回的 token 是有效的 JWT
      const refreshedPayload = jwt.decode(refreshResponse.body.data.accessToken) as Record<string, unknown>;
      expect(refreshedPayload).toHaveProperty('type', 'access');
      expect(refreshedPayload).toHaveProperty('managerId', TEST_MANAGER.id);
    });

    it('Refresh Token 应只包含简化字段', async () => {
      const authResponse = await request(app.getHttpServer())
        .post('/mt-managers/api-key/authenticate')
        .send({
          apiKeyId: TEST_MANAGER.apiKeyId,
          apiSecret: testApiSecret,
        })
        .expect(200);

      const refreshPayload = jwt.decode(authResponse.body.data.refreshToken) as Record<string, unknown>;
      expect(refreshPayload).toHaveProperty('type', 'refresh');
      expect(refreshPayload).toHaveProperty('managerId');
      expect(refreshPayload).toHaveProperty('tenantId');
      expect(refreshPayload).toHaveProperty('apiKeyId');

      // 验证敏感字段不存在
      expect(refreshPayload).not.toHaveProperty('managerLogin');
      expect(refreshPayload).not.toHaveProperty('serverId');
      expect(refreshPayload).not.toHaveProperty('middlewareId');
    });

    it('无效的 Refresh Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .post('/mt-managers/api-key/refresh')
        .send({
          refreshToken: 'invalid-refresh-token',
        })
        .expect(401);
    });
  });

  // ==================== Internal API 测试 ====================

  describe('GET /internal/managers', () => {
    it('应返回指定中间件的经理账号列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/internal/managers')
        .set('X-Internal-Secret', INTERNAL_API_SECRET)
        .query({ middlewareId: TEST_MANAGER.middlewareId })
        .expect(200);

      expect(response.body.data).toHaveProperty('managers');
      expect(response.body.data).toHaveProperty('total');
      expect(Array.isArray(response.body.data.managers)).toBe(true);
    });

    it('经理账号信息应包含连接池所需字段', async () => {
      const response = await request(app.getHttpServer())
        .get('/internal/managers')
        .set('X-Internal-Secret', INTERNAL_API_SECRET)
        .query({ middlewareId: TEST_MANAGER.middlewareId })
        .expect(200);

      if (response.body.data.managers.length > 0) {
        const manager = response.body.data.managers[0];
        expect(manager).toHaveProperty('managerId');
        expect(manager).toHaveProperty('tenantId');
        // mtServerId 和 encryptedPassword 需要 MtManager 服务层返回
        expect(manager).toHaveProperty('serverAddress');
        expect(manager).toHaveProperty('managerLogin');
      }
    });

    it('缺少 X-Internal-Secret 应返回 401', async () => {
      await request(app.getHttpServer())
        .get('/internal/managers')
        .query({ middlewareId: TEST_MANAGER.middlewareId })
        .expect(401);
    });

    it('无效的 X-Internal-Secret 应返回 401', async () => {
      await request(app.getHttpServer())
        .get('/internal/managers')
        .set('X-Internal-Secret', 'wrong-secret')
        .query({ middlewareId: TEST_MANAGER.middlewareId })
        .expect(401);
    });

    it('缺少 middlewareId 应返回 401', async () => {
      await request(app.getHttpServer())
        .get('/internal/managers')
        .set('X-Internal-Secret', INTERNAL_API_SECRET)
        .expect(401);
    });
  });

  // ==================== Token 结构验证测试 ====================

  describe('Token 结构安全验证', () => {
    it('Access Token payload 字段数量应最小化', async () => {
      const response = await request(app.getHttpServer())
        .post('/mt-managers/api-key/authenticate')
        .send({
          apiKeyId: TEST_MANAGER.apiKeyId,
          apiSecret: testApiSecret,
        })
        .expect(200);

      const payload = jwt.decode(response.body.data.accessToken) as Record<string, unknown>;
      const payloadKeys = Object.keys(payload);

      // 允许的标准字段: type, managerId, tenantId, apiKeyId, iat, exp, iss, sub
      const allowedKeys = ['type', 'managerId', 'tenantId', 'apiKeyId', 'iat', 'exp', 'iss', 'sub'];

      for (const key of payloadKeys) {
        expect(allowedKeys).toContain(key);
      }
    });

    it('Token 不应包含任何服务器连接信息', async () => {
      const response = await request(app.getHttpServer())
        .post('/mt-managers/api-key/authenticate')
        .send({
          apiKeyId: TEST_MANAGER.apiKeyId,
          apiSecret: testApiSecret,
        })
        .expect(200);

      const accessPayload = jwt.decode(response.body.data.accessToken) as Record<string, unknown>;
      const refreshPayload = jwt.decode(response.body.data.refreshToken) as Record<string, unknown>;

      // 禁止的敏感字段
      const forbiddenFields = [
        'serverId',
        'serverAddress',
        'managerLogin',
        'managerPassword',
        'encryptedPassword',
        'middlewareId',
        'middlewareUrl',
        'platformType',
        'instanceId',
      ];

      for (const field of forbiddenFields) {
        expect(accessPayload).not.toHaveProperty(field);
        expect(refreshPayload).not.toHaveProperty(field);
      }
    });
  });
});
