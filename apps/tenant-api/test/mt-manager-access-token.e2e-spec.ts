/**
 * Manager Access Token E2E 测试
 *
 * 测试覆盖:
 * - 获取 Manager Access Token API
 * - 认证和授权验证
 * - 响应格式验证
 *
 * Requirements: REQ-4 (新增内部 Access Token 端点)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EncryptionService } from '../src/security/encryption.service';
import { ServiceTokenService } from '../src/auth/services/service-token.service';
import { TEST_TENANT, TEST_TOKENS, TEST_ADMIN, TEST_INSTANCE } from './fixtures/test-data';

// ==================== 测试数据 ====================

const TEST_MIDDLEWARE = {
  id: 'middleware-test-001',
  name: 'Test Middleware',
  url: 'http://localhost:3001',
  status: 'ONLINE',
};

const TEST_SERVER: {
  id: string;
  serverId: string;
  displayName: string;
  platformType: string;
  middlewareId: string | null;
  middlewareUrl: string | null;
  isActive: boolean;
} = {
  id: 'server-test-001',
  serverId: 'demo-mt5-server',
  displayName: 'Demo MT5 Server',
  platformType: 'MT5',
  middlewareId: TEST_MIDDLEWARE.id,
  middlewareUrl: TEST_MIDDLEWARE.url,
  isActive: true,
};

const TEST_MANAGER = {
  id: 'manager-access-token-test-001',
  tenantId: TEST_TENANT.id,
  managerLogin: BigInt(10007),
  displayName: '测试经理账号',
  isActive: true,
  serverId: TEST_SERVER.id,
  server: TEST_SERVER,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const TEST_MIDDLEWARE_ASSIGNMENT = {
  id: 'assignment-test-001',
  middlewareId: TEST_MIDDLEWARE.id,
  tenantId: TEST_TENANT.id,
  assignedAt: new Date(),
  assignedBy: 'admin-1',
};

// ==================== Mock Services ====================

class MockPrismaService {
  private managers: Array<typeof TEST_MANAGER & { server?: typeof TEST_SERVER }> = [
    { ...TEST_MANAGER },
  ];
  private middlewareAssignmentData: typeof TEST_MIDDLEWARE_ASSIGNMENT | null = {
    ...TEST_MIDDLEWARE_ASSIGNMENT,
  };
  private tenants = [{ ...TEST_TENANT }];

  mtManager = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (where.id) {
        const manager = this.managers.find((m) => m.id === where.id);
        if (manager) {
          return Promise.resolve({
            ...manager,
            server: manager.server || { ...TEST_SERVER },
          });
        }
      }
      return Promise.resolve(null);
    }),
    findFirst: jest.fn().mockImplementation(({ where }) => {
      if (where.id) {
        const manager = this.managers.find((m) => m.id === where.id);
        if (manager) {
          return Promise.resolve({
            ...manager,
            server: manager.server || { ...TEST_SERVER },
          });
        }
      }
      return Promise.resolve(null);
    }),
    findMany: jest.fn().mockImplementation(() => Promise.resolve(this.managers)),
    count: jest.fn().mockImplementation(() => Promise.resolve(this.managers.length)),
    update: jest.fn().mockResolvedValue({}),
  };

  middlewareAssignment = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (this.middlewareAssignmentData === null) {
        return Promise.resolve(null);
      }
      if (
        where.middlewareId_tenantId &&
        where.middlewareId_tenantId.middlewareId ===
          this.middlewareAssignmentData.middlewareId &&
        where.middlewareId_tenantId.tenantId ===
          this.middlewareAssignmentData.tenantId
      ) {
        return Promise.resolve(this.middlewareAssignmentData);
      }
      return Promise.resolve(null);
    }),
  };

  tenant = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (where.id) {
        const tenant = this.tenants.find((t) => t.id === where.id);
        return Promise.resolve(tenant || null);
      }
      return Promise.resolve(null);
    }),
  };

  // 所有测试管理员数据
  private admins = [
    { ...TEST_ADMIN },
    { id: 'admin-owner-001', email: 'owner@test.com', name: 'Test Owner', role: 'OWNER', isActive: true, tenantId: TEST_TENANT.id },
    { id: 'admin-operator-001', email: 'operator@test.com', name: 'Test Operator', role: 'OPERATOR', isActive: true, tenantId: TEST_TENANT.id },
  ];

  tenantAdmin = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (where.id) {
        const admin = this.admins.find((a) => a.id === where.id);
        return Promise.resolve(admin || null);
      }
      return Promise.resolve(null);
    }),
  };

  // 为 TenantGuard 提供 middlewareInstance mock
  middlewareInstance = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (where.id === TEST_INSTANCE.id) {
        return Promise.resolve({ id: TEST_INSTANCE.id, status: 'ONLINE' });
      }
      return Promise.resolve(null);
    }),
  };

  // 为 IpBlacklistService 提供 mock
  ipBlacklist = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  };

  // 为 FailedLoginAttempt 提供 mock
  failedLoginAttempt = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  };

  // 为 AuditLog 提供 mock
  auditLog = {
    create: jest.fn().mockResolvedValue({}),
  };

  // 用于修改测试数据
  setManager(manager: Record<string, unknown>) {
    const id = manager.id as string;
    const index = this.managers.findIndex((m) => m.id === id);
    if (index >= 0) {
      this.managers[index] = { ...this.managers[index], ...manager } as typeof TEST_MANAGER;
    } else {
      this.managers.push({ ...TEST_MANAGER, ...manager } as typeof TEST_MANAGER);
    }
  }

  setMiddlewareAssignment(
    assignment: Partial<typeof TEST_MIDDLEWARE_ASSIGNMENT> | null,
  ) {
    if (assignment === null) {
      this.middlewareAssignmentData = null;
    } else {
      this.middlewareAssignmentData = {
        ...TEST_MIDDLEWARE_ASSIGNMENT,
        ...assignment,
      };
    }
  }

  resetMocks() {
    jest.clearAllMocks();
    this.managers = [{ ...TEST_MANAGER }];
    this.middlewareAssignmentData = { ...TEST_MIDDLEWARE_ASSIGNMENT };
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

/**
 * Mock ServiceTokenService
 * 为 Pool Mode Token 生成提供 mock 实现
 */
class MockServiceTokenService {
  private readonly jwtSecret = 'test-service-token-secret';

  generatePoolModeToken = jest.fn().mockImplementation((request: {
    managerId: string;
    tenantId: string;
    apiKeyId: string;
    scopes?: string[];
    expiresIn?: number;
  }) => {
    const expiresIn = request.expiresIn || 900;
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + expiresIn;

    // 生成真实的 JWT token
    const payload = {
      managerId: request.managerId,
      tenantId: request.tenantId,
      apiKeyId: request.apiKeyId,
      scopes: request.scopes || ['*'],
      mode: 'pool',
    };

    const token = jwt.sign(payload, this.jwtSecret, {
      algorithm: 'HS256',
      expiresIn,
      issuer: 'mt5-tenant-api',
    });

    return {
      token,
      expiresAt,
      tokenType: 'Bearer',
    };
  });

  validatePoolModeToken = jest.fn().mockImplementation((token: string) => {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as Record<string, unknown>;
      return { valid: true, payload };
    } catch {
      return { valid: false, error: 'Invalid token' };
    }
  });
}

// ==================== E2E 测试 ====================

describe('MtManagerAccessToken E2E Tests', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;
  let mockEncryptionService: MockEncryptionService;
  let mockServiceTokenService: MockServiceTokenService;

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();
    mockEncryptionService = new MockEncryptionService();
    mockServiceTokenService = new MockServiceTokenService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(EncryptionService)
      .useValue(mockEncryptionService)
      .overrideProvider(ServiceTokenService)
      .useValue(mockServiceTokenService)
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
  });

  // ==================== 认证测试 ====================

  describe('认证要求', () => {
    it('未认证请求应返回 401', async () => {
      await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .expect(401);
    });

    it('过期 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .set('Authorization', `Bearer ${TEST_TOKENS.expired}`)
        .expect(401);
    });

    it('无效类型 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .set('Authorization', `Bearer ${TEST_TOKENS.invalidType}`)
        .expect(401);
    });
  });

  // ==================== 角色授权测试 ====================

  describe('角色授权', () => {
    it('Owner 角色应可获取 Access Token', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(201);

      // ResponseInterceptor 将响应包装为 {success: true, data: {...}}
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('tokenType', 'Bearer');
    });

    it('Admin 角色应可获取 Access Token', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validAdmin}`)
        .expect(201);

      expect(response.body.data).toHaveProperty('accessToken');
    });

    it('Operator 角色应可获取 Access Token', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOperator}`)
        .expect(201);

      expect(response.body.data).toHaveProperty('accessToken');
    });
  });

  // ==================== 成功场景测试 ====================

  describe('成功获取 Access Token', () => {
    it('应返回正确的响应结构', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(201);

      // ResponseInterceptor 将响应包装为 {success: true, data: {...}}
      const data = response.body.data;
      expect(data).toHaveProperty('accessToken');
      expect(data).toHaveProperty('expiresIn');
      expect(data).toHaveProperty('expiresAt');
      expect(data).toHaveProperty('tokenType', 'Bearer');
      expect(data).toHaveProperty('middlewareUrl', TEST_MIDDLEWARE.url);
      expect(data).toHaveProperty('manager');
    });

    it('manager 信息应包含必要字段', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(201);

      const { manager } = response.body.data;
      expect(manager).toHaveProperty('id', TEST_MANAGER.id);
      expect(manager).toHaveProperty('managerLogin', '10007');
      expect(manager).toHaveProperty('displayName', TEST_MANAGER.displayName);
      expect(manager).toHaveProperty('platformType', 'MT5');
    });

    it('Access Token 应为有效 JWT', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(201);

      const payload = jwt.decode(response.body.data.accessToken) as Record<
        string,
        unknown
      >;
      expect(payload).toBeDefined();
      expect(payload).toHaveProperty('managerId', TEST_MANAGER.id);
      expect(payload).toHaveProperty('tenantId', TEST_TENANT.id);
    });

    it('Access Token 应包含 Pool Mode 标识', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(201);

      const payload = jwt.decode(response.body.data.accessToken) as Record<
        string,
        unknown
      >;
      expect(payload).toHaveProperty('mode', 'pool');
    });
  });

  // ==================== 错误场景测试 ====================

  describe('Manager 不存在', () => {
    it('应返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/mt-managers/non-existent-manager-id/access-token')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(404);

      // 错误响应格式: {success: false, error: {code, message, ...}}
      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('Manager 不属于当前租户', () => {
    it('应返回 403', async () => {
      mockPrismaService.setManager({
        ...TEST_MANAGER,
        id: 'other-tenant-manager',
        tenantId: 'other-tenant-id',
      });

      const response = await request(app.getHttpServer())
        .post('/mt-managers/other-tenant-manager/access-token')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(403);

      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('Manager 未激活', () => {
    it('应返回 403', async () => {
      mockPrismaService.setManager({
        ...TEST_MANAGER,
        id: 'inactive-manager',
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .post('/mt-managers/inactive-manager/access-token')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(403);

      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('服务器未激活', () => {
    it('应返回 403', async () => {
      mockPrismaService.setManager({
        ...TEST_MANAGER,
        id: 'inactive-server-manager',
        server: {
          ...TEST_SERVER,
          isActive: false,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/mt-managers/inactive-server-manager/access-token')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(403);

      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('中间件未配置', () => {
    it('应返回 400', async () => {
      mockPrismaService.setManager({
        ...TEST_MANAGER,
        id: 'no-middleware-manager',
        server: {
          ...TEST_SERVER,
          middlewareId: null,
          middlewareUrl: null,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/mt-managers/no-middleware-manager/access-token')
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(400);

      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('中间件未分配给租户', () => {
    it('应返回 403', async () => {
      mockPrismaService.setMiddlewareAssignment(null);

      const response = await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(403);

      expect(response.body.error).toHaveProperty('message');
    });
  });

  // ==================== Token 安全验证 ====================

  describe('Token 安全验证', () => {
    it('Token 不应包含敏感信息', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(201);

      // ResponseInterceptor 将响应包装为 {success: true, data: {...}}
      const payload = jwt.decode(response.body.data.accessToken) as Record<
        string,
        unknown
      >;

      // 验证敏感字段不存在
      expect(payload).not.toHaveProperty('password');
      expect(payload).not.toHaveProperty('encryptedPassword');
      expect(payload).not.toHaveProperty('managerPassword');
      expect(payload).not.toHaveProperty('serverAddress');
      expect(payload).not.toHaveProperty('apiKeySecretHash');
    });

    it('expiresIn 应为 900 秒 (15 分钟)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(201);

      expect(response.body.data.expiresIn).toBe(900);
    });

    it('expiresAt 应为合理的时间戳', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mt-managers/${TEST_MANAGER.id}/access-token`)
        .set('Authorization', `Bearer ${TEST_TOKENS.validOwner}`)
        .expect(201);

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = response.body.data.expiresAt;

      // expiresAt 应该在 now + 890 到 now + 910 之间 (允许 10 秒误差)
      expect(expiresAt).toBeGreaterThan(now + 890);
      expect(expiresAt).toBeLessThan(now + 910);
    });
  });
});
