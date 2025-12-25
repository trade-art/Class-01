/**
 * WS Ticket 模块 E2E 测试
 *
 * 验证 WebSocket Ticket 签发端点的请求/响应格式
 *
 * Requirements: REQ-TA-1, REQ-TA-2
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/common/services/cache.service';
import { MiddlewareProxyService } from '../src/middleware-proxy';
import { AccountLockoutService } from '../src/security/account-lockout.service';
import { RateLimiterService } from '../src/security/rate-limiter.service';
import { EncryptionService } from '../src/security/encryption.service';
import { MockMiddlewareProxyService } from './mocks/middleware-proxy.mock';
import { MockAccountLockoutService } from './mocks/account-lockout.mock';
import { MockRateLimiterService } from './mocks/rate-limiter.mock';
import {
  expectSuccessResponse,
  expectAuthError,
  expectErrorResponse,
} from './utils/validators';

// ==================== 测试数据 ====================

const TEST_TENANT = {
  id: 'tenant-ws-test-001',
  code: 'WS_TEST',
  name: 'WS Ticket Test Tenant',
  status: 'ACTIVE',
};

const TEST_SERVER = {
  id: 'server-ws-test-001',
  serverId: 'demo-ws-server',
  displayName: 'Demo WS Server',
  platformType: 'MT5',
  middlewareId: 'middleware-ws-test-001',
  middlewareUrl: 'http://middleware:8080',
};

const TEST_MANAGER = {
  id: 'manager-ws-test-001',
  tenantId: TEST_TENANT.id,
  managerLogin: BigInt(10007),
  displayName: 'WS Test Manager',
  isActive: true,
  apiKeyId: 'api-key-ws-test-001',
  apiKeySecretHash: '', // 将在测试中设置
  apiKeyEnabled: true,
  mtServerId: TEST_SERVER.id,
  serverId: TEST_SERVER.id,
  serverAddress: 'mt5.example.com:443',
  middlewareId: TEST_SERVER.middlewareId,
  middlewareUrl: TEST_SERVER.middlewareUrl,
  createdAt: new Date(),
  updatedAt: new Date(),
  server: {
    serverId: TEST_SERVER.serverId,
    platformType: TEST_SERVER.platformType,
    middlewareId: TEST_SERVER.middlewareId,
    middlewareUrl: TEST_SERVER.middlewareUrl,
  },
};

const TEST_API_KEY = {
  id: 'api-key-ws-test-001',
  name: 'WS Test API Key',
  keyPrefix: 'mk_ws_test',
  hashedKey: 'hashed-key-ws',
  scopes: ['quotes:read', 'positions:read', 'orders:read'],
  allowedIps: [],
  tenantId: TEST_TENANT.id,
  isActive: true,
  revokedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const TEST_API_KEY_REVOKED = {
  ...TEST_API_KEY,
  id: 'api-key-ws-revoked-001',
  name: 'Revoked API Key',
  isActive: false,
  revokedAt: new Date(),
};

// 测试用的 API Secret
const TEST_API_SECRET = 'test-api-secret-ws-12345';

// ==================== Mock Services ====================

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

class MockPrismaService {
  private managers = [{ ...TEST_MANAGER }];

  mtManager = {
    findFirst: jest.fn().mockImplementation(({ where }) => {
      // 通过 apiKeyId 查找 (用于认证)
      if (where?.apiKeyId) {
        const manager = this.managers.find(m => m.apiKeyId === where.apiKeyId);
        return Promise.resolve(manager || null);
      }
      // 通过 id 和 apiKeyId 查找 (用于 Guard 验证)
      if (where?.id && where?.apiKeyId) {
        const manager = this.managers.find(m => m.id === where.id && m.apiKeyId === where.apiKeyId);
        return Promise.resolve(manager || null);
      }
      // 通过 id 查找
      if (where?.id) {
        const manager = this.managers.find(m => m.id === where.id);
        return Promise.resolve(manager || null);
      }
      return Promise.resolve(null);
    }),
    findMany: jest.fn().mockImplementation(() => {
      return Promise.resolve(this.managers);
    }),
    update: jest.fn().mockResolvedValue({}),
  };

  apiKey = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (where?.id === TEST_API_KEY.id) {
        return Promise.resolve(TEST_API_KEY);
      }
      if (where?.id === TEST_API_KEY_REVOKED.id) {
        return Promise.resolve(TEST_API_KEY_REVOKED);
      }
      return Promise.resolve(null);
    }),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(TEST_API_KEY),
  };

  tenant = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (where?.id === TEST_TENANT.id) {
        return Promise.resolve(TEST_TENANT);
      }
      return Promise.resolve(null);
    }),
  };

  ipBlacklist = {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn().mockResolvedValue({ id: 'blacklist-1' }),
  };

  auditLog = {
    create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };

  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);

  // 用于更新测试数据
  setManager(manager: typeof TEST_MANAGER) {
    const index = this.managers.findIndex(m => m.id === manager.id);
    if (index >= 0) {
      this.managers[index] = manager;
    } else {
      this.managers.push(manager);
    }
  }

  resetMocks() {
    jest.clearAllMocks();
    this.managers = [{ ...TEST_MANAGER }];
  }
}

class MockCacheService {
  private available = true;
  private setSuccess = true;

  isAvailable = jest.fn().mockImplementation(() => this.available);
  set = jest.fn().mockImplementation(() => Promise.resolve(this.setSuccess));
  get = jest.fn().mockResolvedValue(null);
  del = jest.fn().mockResolvedValue(true);

  // 辅助方法用于控制测试行为
  setAvailability(available: boolean) {
    this.available = available;
  }

  setSetSuccess(success: boolean) {
    this.setSuccess = success;
  }

  resetMocks() {
    this.available = true;
    this.setSuccess = true;
    jest.clearAllMocks();
  }
}

// ==================== 测试套件 ====================

describe('WsTicketController (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;
  let mockCacheService: MockCacheService;
  let mockEncryptionService: MockEncryptionService;

  // 辅助函数：通过认证端点获取有效的 Access Token
  async function getValidAccessToken(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/mt-managers/api-key/authenticate')
      .send({
        apiKeyId: TEST_MANAGER.apiKeyId,
        apiSecret: TEST_API_SECRET,
      })
      .expect(200);

    return response.body.data.accessToken;
  }

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();
    mockCacheService = new MockCacheService();
    mockEncryptionService = new MockEncryptionService();
    const mockAccountLockoutService = new MockAccountLockoutService();
    const mockRateLimiterService = new MockRateLimiterService();

    // 设置 Manager 的加密密钥哈希
    TEST_MANAGER.apiKeySecretHash = mockEncryptionService.encryptToString(TEST_API_SECRET);
    mockPrismaService.setManager(TEST_MANAGER);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(CacheService)
      .useValue(mockCacheService)
      .overrideProvider(MiddlewareProxyService)
      .useClass(MockMiddlewareProxyService)
      .overrideProvider(AccountLockoutService)
      .useValue(mockAccountLockoutService)
      .overrideProvider(RateLimiterService)
      .useValue(mockRateLimiterService)
      .overrideProvider(EncryptionService)
      .useValue(mockEncryptionService)
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
    mockCacheService.resetMocks();
    // 重新设置 Manager 的加密密钥哈希
    TEST_MANAGER.apiKeySecretHash = mockEncryptionService.encryptToString(TEST_API_SECRET);
    mockPrismaService.setManager(TEST_MANAGER);
  });

  // ==================== POST /external/trading/ws-ticket ====================

  describe('POST /external/trading/ws-ticket', () => {
    it('应成功生成 WS Ticket', async () => {
      const validToken = await getValidAccessToken();

      const response = await request(app.getHttpServer())
        .post('/external/trading/ws-ticket')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(201);

      expectSuccessResponse(response);

      const data = response.body.data;
      // 验证响应格式
      expect(data).toHaveProperty('ticket');
      expect(data).toHaveProperty('endpoint');
      expect(data).toHaveProperty('expiresIn');
      expect(data).toHaveProperty('channels');

      // 验证 Ticket 格式 (64 字符 hex)
      expect(data.ticket).toMatch(/^[0-9a-f]{64}$/);

      // 验证端点
      expect(data.endpoint).toContain('wss://');

      // 验证过期时间
      expect(data.expiresIn).toBe(30);

      // 验证频道 (基于 TEST_API_KEY 的 scopes)
      expect(data.channels).toEqual(
        expect.arrayContaining(['quotes', 'positions', 'orders']),
      );
    });

    it('Ticket 应该是有效的 64 字符 hex 字符串', async () => {
      const validToken = await getValidAccessToken();

      const response = await request(app.getHttpServer())
        .post('/external/trading/ws-ticket')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(201);

      const data = response.body.data;
      // 验证 Ticket 格式
      expect(data.ticket).toHaveLength(64);
      expect(data.ticket).toMatch(/^[0-9a-f]+$/);
    });

    it('应正确存储 Ticket 到 Redis', async () => {
      const validToken = await getValidAccessToken();

      await request(app.getHttpServer())
        .post('/external/trading/ws-ticket')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(201);

      // 验证 CacheService.set 被调用
      expect(mockCacheService.set).toHaveBeenCalledTimes(1);

      // 验证存储参数
      const [key, data, ttl] = mockCacheService.set.mock.calls[0];
      expect(key).toMatch(/^ws:ticket:[0-9a-f]{64}$/);
      expect(data.tenantId).toBe(TEST_TENANT.id);
      expect(data.managerId).toBe(TEST_MANAGER.id);
      expect(data.apiKeyId).toBe(TEST_API_KEY.id);
      expect(data.channels).toEqual(
        expect.arrayContaining(['quotes', 'positions', 'orders']),
      );
      expect(ttl).toBe(30);
    });

    it('无 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/external/trading/ws-ticket')
        .expect(401);

      expectAuthError(response);
    });

    it('无效 Token 应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/external/trading/ws-ticket')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectAuthError(response);
    });

    it('Redis 不可用时应返回 503', async () => {
      const validToken = await getValidAccessToken();
      mockCacheService.setAvailability(false);

      const response = await request(app.getHttpServer())
        .post('/external/trading/ws-ticket')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(503);

      expectErrorResponse(response);
      expect(response.body.error.message).toContain('WebSocket ticket');
    });

    it('Redis 存储失败时应返回 503', async () => {
      const validToken = await getValidAccessToken();
      mockCacheService.setSetSuccess(false);

      const response = await request(app.getHttpServer())
        .post('/external/trading/ws-ticket')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(503);

      expectErrorResponse(response);
    });
  });

  // ==================== 响应时间测试 ====================

  describe('响应时间', () => {
    it('生成 WS Ticket 应在 500ms 内完成', async () => {
      const validToken = await getValidAccessToken();
      const startTime = Date.now();

      await request(app.getHttpServer())
        .post('/external/trading/ws-ticket')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(201);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });
  });

  // ==================== 频道权限测试 ====================

  describe('频道权限', () => {
    it('通配符 scope (*) 应返回所有频道', async () => {
      const validToken = await getValidAccessToken();
      // 修改 mock 返回通配符 scope
      mockPrismaService.apiKey.findUnique = jest.fn().mockResolvedValue({
        ...TEST_API_KEY,
        scopes: ['*'],
      });

      const response = await request(app.getHttpServer())
        .post('/external/trading/ws-ticket')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(201);

      const data = response.body.data;
      expect(data.channels).toEqual(
        expect.arrayContaining(['quotes', 'positions', 'orders']),
      );
      expect(data.channels).toHaveLength(3);
    });

    it('单个 scope 应返回对应频道', async () => {
      const validToken = await getValidAccessToken();
      mockPrismaService.apiKey.findUnique = jest.fn().mockResolvedValue({
        ...TEST_API_KEY,
        scopes: ['quotes:read'],
      });

      const response = await request(app.getHttpServer())
        .post('/external/trading/ws-ticket')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(201);

      const data = response.body.data;
      expect(data.channels).toEqual(['quotes']);
    });

    it(':write scope 应包含对应频道', async () => {
      const validToken = await getValidAccessToken();
      mockPrismaService.apiKey.findUnique = jest.fn().mockResolvedValue({
        ...TEST_API_KEY,
        scopes: ['positions:write'],
      });

      const response = await request(app.getHttpServer())
        .post('/external/trading/ws-ticket')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(201);

      const data = response.body.data;
      expect(data.channels).toContain('positions');
    });

    it('未知 scope 应返回空频道列表', async () => {
      const validToken = await getValidAccessToken();
      mockPrismaService.apiKey.findUnique = jest.fn().mockResolvedValue({
        ...TEST_API_KEY,
        scopes: ['unknown:read', 'another:scope'],
      });

      const response = await request(app.getHttpServer())
        .post('/external/trading/ws-ticket')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(201);

      const data = response.body.data;
      expect(data.channels).toEqual([]);
    });
  });
});
