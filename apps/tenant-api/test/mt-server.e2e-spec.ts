/**
 * MT 服务器 API E2E 测试
 * 测试完整的服务器配置流程和连接测试功能
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  MtServerService,
  ConnectionTestResult,
} from '../src/middleware-proxy/services/mt-server.service';
import { AccountLockoutService } from '../src/security/account-lockout.service';
import { RateLimiterService } from '../src/security/rate-limiter.service';
import { MockAccountLockoutService } from './mocks/account-lockout.mock';
import { MockRateLimiterService } from './mocks/rate-limiter.mock';

// ==================== 测试数据 ====================

const TEST_TENANT = {
  id: 'tenant-mt-test-001',
  code: 'MT_TEST',
  name: 'MT Server Test Tenant',
  status: 'ACTIVE',
  deploymentMode: 'SHARED',
};

const TEST_ADMIN = {
  id: 'admin-mt-test-001',
  email: 'admin@mt-test.com',
  password: '$2b$10$iugYzlUY.fLiYWqowAft/.xXev5kZjE0qr9brvBmcQYNq3S8JDsD.',
  name: 'MT Test Admin',
  role: 'ADMIN',
  isActive: true,
  tenantId: TEST_TENANT.id,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const TEST_OWNER = {
  id: 'owner-mt-test-001',
  email: 'owner@mt-test.com',
  password: '$2b$10$iugYzlUY.fLiYWqowAft/.xXev5kZjE0qr9brvBmcQYNq3S8JDsD.',
  name: 'MT Test Owner',
  role: 'OWNER',
  isActive: true,
  tenantId: TEST_TENANT.id,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const TEST_OPERATOR = {
  id: 'operator-mt-test-001',
  email: 'operator@mt-test.com',
  password: '$2b$10$iugYzlUY.fLiYWqowAft/.xXev5kZjE0qr9brvBmcQYNq3S8JDsD.',
  name: 'MT Test Operator',
  role: 'OPERATOR',
  isActive: true,
  tenantId: TEST_TENANT.id,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const EXISTING_MT_SERVER = {
  id: 'server-existing-001',
  tenantId: TEST_TENANT.id,
  serverId: 'mt5-existing',
  displayName: 'Existing MT5 Server',
  platformType: 'MT5',
  middlewareId: 'middleware-instance-existing',
  middlewareUrl: 'http://existing-middleware:8080',
  serverAddress: 'mt5-existing.example.com:443',
  isActive: true,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SECOND_MT_SERVER = {
  id: 'server-second-001',
  tenantId: TEST_TENANT.id,
  serverId: 'mt5-second',
  displayName: 'Second MT5 Server',
  platformType: 'MT5',
  middlewareId: 'middleware-instance-second',
  middlewareUrl: 'http://second-middleware:8080',
  serverAddress: 'mt5-second.example.com:443',
  isActive: true,
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ==================== Mock Services ====================

class MockPrismaService {
  private servers = [{ ...EXISTING_MT_SERVER }, { ...SECOND_MT_SERVER }];
  private serverIdCounter = 100;

  tenant = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (where.id === TEST_TENANT.id) {
        return Promise.resolve(TEST_TENANT);
      }
      return Promise.resolve(null);
    }),
    findFirst: jest.fn().mockImplementation(({ where }) => {
      if (where.status === 'ACTIVE') {
        return Promise.resolve(TEST_TENANT);
      }
      return Promise.resolve(null);
    }),
  };

  tenantAdmin = {
    findUnique: jest.fn().mockImplementation(({ where, include }) => {
      const admins = [TEST_ADMIN, TEST_OWNER, TEST_OPERATOR];
      const admin = admins.find((a) => a.id === where.id);
      if (admin && include?.tenant) {
        return Promise.resolve({ ...admin, tenant: TEST_TENANT });
      }
      return Promise.resolve(admin || null);
    }),
    findFirst: jest.fn().mockImplementation(({ where, include }) => {
      const admins = [TEST_ADMIN, TEST_OWNER, TEST_OPERATOR];
      const admin = admins.find((a) => a.email === where.email);
      if (admin && include?.tenant) {
        return Promise.resolve({ ...admin, tenant: TEST_TENANT });
      }
      return Promise.resolve(admin || null);
    }),
    update: jest.fn().mockImplementation(({ where, data }) => {
      const admins = [TEST_ADMIN, TEST_OWNER, TEST_OPERATOR];
      const admin = admins.find((a) => a.id === where.id);
      if (admin) {
        Object.assign(admin, data);
        return Promise.resolve(admin);
      }
      return Promise.reject(new Error('Admin not found'));
    }),
  };

  mtServer = {
    findMany: jest.fn().mockImplementation(({ where }) => {
      let result = [...this.servers];
      if (where?.tenantId) {
        result = result.filter((s) => s.tenantId === where.tenantId);
      }
      if (where?.isActive !== undefined) {
        result = result.filter((s) => s.isActive === where.isActive);
      }
      return Promise.resolve(result);
    }),
    findFirst: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        this.servers.find((s) => {
          if (where.tenantId && s.tenantId !== where.tenantId) return false;
          if (where.serverId && s.serverId !== where.serverId) return false;
          if (where.isDefault !== undefined && s.isDefault !== where.isDefault) return false;
          if (where.id && s.id !== where.id) return false;
          return true;
        }) || null,
      );
    }),
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (where.tenantId_serverId) {
        return Promise.resolve(
          this.servers.find(
            (s) =>
              s.tenantId === where.tenantId_serverId.tenantId &&
              s.serverId === where.tenantId_serverId.serverId,
          ) || null,
        );
      }
      if (where.id) {
        return Promise.resolve(this.servers.find((s) => s.id === where.id) || null);
      }
      return Promise.resolve(null);
    }),
    create: jest.fn().mockImplementation(({ data }) => {
      const newServer = {
        id: `server-new-${++this.serverIdCounter}`,
        ...data,
        managerLogin: BigInt(data.managerLogin || 0),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.servers.push(newServer);
      return Promise.resolve(newServer);
    }),
    update: jest.fn().mockImplementation(({ where, data }) => {
      let server = null;
      if (where.tenantId_serverId) {
        server = this.servers.find(
          (s) =>
            s.tenantId === where.tenantId_serverId.tenantId &&
            s.serverId === where.tenantId_serverId.serverId,
        );
      } else if (where.id) {
        server = this.servers.find((s) => s.id === where.id);
      }

      if (server) {
        Object.assign(server, data, { updatedAt: new Date() });
        return Promise.resolve(server);
      }
      return Promise.reject(new Error('Server not found'));
    }),
    updateMany: jest.fn().mockImplementation(({ where, data }) => {
      let count = 0;
      this.servers.forEach((s) => {
        if (where.tenantId && s.tenantId === where.tenantId) {
          if (where.serverId?.not && s.serverId !== where.serverId.not) {
            Object.assign(s, data);
            count++;
          } else if (!where.serverId) {
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
        serverIndex = this.servers.findIndex((s) => s.id === where.id);
      } else if (where.tenantId_serverId) {
        serverIndex = this.servers.findIndex(
          (s) =>
            s.tenantId === where.tenantId_serverId.tenantId &&
            s.serverId === where.tenantId_serverId.serverId,
        );
      }

      if (serverIndex !== -1) {
        const deleted = this.servers.splice(serverIndex, 1)[0];
        return Promise.resolve(deleted);
      }
      return Promise.reject(new Error('Server not found'));
    }),
    count: jest.fn().mockImplementation(({ where }) => {
      let count = this.servers.filter((s) => {
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

  $transaction = jest.fn().mockImplementation(async (operations) => {
    if (Array.isArray(operations)) {
      return Promise.all(operations);
    }
    return operations(this);
  });

  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);
  $queryRaw = jest.fn().mockResolvedValue([{ result: 1 }]);

  // 重置服务器列表（用于测试清理）
  resetServers() {
    this.servers = [{ ...EXISTING_MT_SERVER }, { ...SECOND_MT_SERVER }];
  }

  resetMocks() {
    this.resetServers();
    jest.clearAllMocks();
  }
}

class MockMtServerService {
  private connectionTestResults: Map<string, boolean> = new Map();
  private mockPrisma: MockPrismaService;

  constructor(mockPrisma: MockPrismaService) {
    this.mockPrisma = mockPrisma;
  }

  // 获取服务器列表 - 返回原始数据，ResponseInterceptor 会包装
  getServers = jest.fn().mockImplementation(async (tenantId: string) => {
    const servers = await this.mockPrisma.mtServer.findMany({
      where: { tenantId },
    });
    return {
      servers: servers.map((s: any) => this.mapToDto(s)),
      total: servers.length,
    };
  });

  // 获取单个服务器 - 返回原始 MtServerDto
  getServer = jest.fn().mockImplementation(async (tenantId: string, serverId: string) => {
    const server = await this.mockPrisma.mtServer.findFirst({
      where: { tenantId, serverId },
    });
    if (!server) {
      throw new NotFoundException(`MT 服务器 ${serverId} 不存在`);
    }
    return this.mapToDto(server);
  });

  // 创建服务器 - 返回原始 MtServerDto
  createServer = jest.fn().mockImplementation(async (tenantId: string, dto: any) => {
    // 检查 serverId 是否已存在
    const existing = await this.mockPrisma.mtServer.findFirst({
      where: { tenantId, serverId: dto.serverId },
    });
    if (existing) {
      throw new ConflictException(`服务器 ID ${dto.serverId} 已存在`);
    }

    const newServer = await this.mockPrisma.mtServer.create({
      data: {
        tenantId,
        serverId: dto.serverId,
        displayName: dto.displayName || null,
        platformType: dto.platformType || 'MT5',
        middlewareId: dto.middlewareId,
        middlewareUrl: dto.middlewareUrl,
        serverAddress: dto.serverAddress,
        isActive: true,
        isDefault: dto.isDefault || false,
      },
    });
    return this.mapToDto(newServer);
  });

  // 更新服务器 - 返回原始 MtServerDto
  updateServer = jest.fn().mockImplementation(async (tenantId: string, serverId: string, dto: any) => {
    const server = await this.mockPrisma.mtServer.findFirst({
      where: { tenantId, serverId },
    });
    if (!server) {
      throw new NotFoundException(`MT 服务器 ${serverId} 不存在`);
    }

    const updated = await this.mockPrisma.mtServer.update({
      where: { tenantId_serverId: { tenantId, serverId } },
      data: dto,
    });
    return this.mapToDto(updated);
  });

  // 删除服务器 - 返回 void
  deleteServer = jest.fn().mockImplementation(async (tenantId: string, serverId: string) => {
    const server = await this.mockPrisma.mtServer.findFirst({
      where: { tenantId, serverId },
    });
    if (!server) {
      throw new NotFoundException(`MT 服务器 ${serverId} 不存在`);
    }

    // 如果删除默认服务器，需要返回错误
    if (server.isDefault) {
      throw new BadRequestException('不能删除默认服务器');
    }

    await this.mockPrisma.mtServer.delete({
      where: { tenantId_serverId: { tenantId, serverId } },
    });
  });

  // 测试连接 - 返回原始 ConnectionTestResult
  testConnection = jest.fn().mockImplementation(
    async (tenantId: string, serverId: string): Promise<ConnectionTestResult> => {
      const server = await this.mockPrisma.mtServer.findFirst({
        where: { tenantId, serverId },
      });
      if (!server) {
        throw new NotFoundException(`MT 服务器 ${serverId} 不存在`);
      }

      const shouldFail = this.connectionTestResults.get(serverId) === false;

      if (shouldFail) {
        return {
          success: false,
          latency: 0,
          error: 'Connection failed: Server unreachable',
        };
      }

      return {
        success: true,
        latency: 45,
        serverVersion: '5.0.0',
        serverTime: new Date().toISOString(),
      };
    },
  );

  // 设置默认服务器 - 返回原始 MtServerDto
  setDefaultServer = jest.fn().mockImplementation(async (tenantId: string, serverId: string) => {
    const server = await this.mockPrisma.mtServer.findFirst({
      where: { tenantId, serverId },
    });
    if (!server) {
      throw new NotFoundException(`MT 服务器 ${serverId} 不存在或未激活`);
    }
    if (!server.isActive) {
      throw new BadRequestException('非活跃服务器不能设置为默认');
    }

    // 取消其他服务器的默认状态
    await this.mockPrisma.mtServer.updateMany({
      where: { tenantId, serverId: { not: serverId } },
      data: { isDefault: false },
    });

    // 设置当前服务器为默认
    const updated = await this.mockPrisma.mtServer.update({
      where: { tenantId_serverId: { tenantId, serverId } },
      data: { isDefault: true },
    });

    return this.mapToDto(updated);
  });

  // 切换服务器状态 - 返回原始 MtServerDto
  toggleServerStatus = jest.fn().mockImplementation(
    async (tenantId: string, serverId: string, isActive: boolean) => {
      const server = await this.mockPrisma.mtServer.findFirst({
        where: { tenantId, serverId },
      });
      if (!server) {
        throw new NotFoundException(`MT 服务器 ${serverId} 不存在`);
      }

      // 默认服务器不能禁用
      if (server.isDefault && !isActive) {
        throw new BadRequestException('默认服务器不能禁用');
      }

      const updated = await this.mockPrisma.mtServer.update({
        where: { tenantId_serverId: { tenantId, serverId } },
        data: { isActive },
      });

      return this.mapToDto(updated);
    },
  );

  // 获取默认服务器 - 返回原始 MtServerDto 或 null
  getDefaultServer = jest.fn().mockImplementation(async (tenantId: string) => {
    const server = await this.mockPrisma.mtServer.findFirst({
      where: { tenantId, isDefault: true },
    });
    if (!server) {
      return null;
    }
    return this.mapToDto(server);
  });

  private mapToDto(server: any) {
    return {
      id: server.id,
      serverId: server.serverId,
      displayName: server.displayName,
      platformType: server.platformType,
      middlewareId: server.middlewareId,
      middlewareUrl: server.middlewareUrl,
      serverAddress: server.serverAddress,
      managerCount: 0,
      isActive: server.isActive,
      isDefault: server.isDefault,
      createdAt: server.createdAt instanceof Date ? server.createdAt.toISOString() : server.createdAt,
      updatedAt: server.updatedAt instanceof Date ? server.updatedAt.toISOString() : server.updatedAt,
    };
  }

  setConnectionTestResult(serverId: string, success: boolean) {
    this.connectionTestResults.set(serverId, success);
  }

  resetMocks() {
    this.connectionTestResults.clear();
    jest.clearAllMocks();
  }
}

// ==================== 测试套件 ====================

describe('MT Server API (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;
  let mockMtServerService: MockMtServerService;
  let jwtService: JwtService;
  let adminToken: string;
  let ownerToken: string;
  let operatorToken: string;

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();
    mockMtServerService = new MockMtServerService(mockPrismaService);
    const mockAccountLockoutService = new MockAccountLockoutService();
    const mockRateLimiterService = new MockRateLimiterService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(MtServerService)
      .useValue(mockMtServerService)
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
      }),
    );

    app.setGlobalPrefix('tenant');

    await app.init();

    // 创建测试 Token
    jwtService = new JwtService({
      secret: process.env.JWT_SECRET || 'test-jwt-secret-key-for-e2e-testing',
    });

    adminToken = jwtService.sign({
      sub: TEST_ADMIN.id,
      email: TEST_ADMIN.email,
      tenantId: TEST_TENANT.id,
      role: 'admin',
    });

    ownerToken = jwtService.sign({
      sub: TEST_OWNER.id,
      email: TEST_OWNER.email,
      tenantId: TEST_TENANT.id,
      role: 'owner',
    });

    operatorToken = jwtService.sign({
      sub: TEST_OPERATOR.id,
      email: TEST_OPERATOR.email,
      tenantId: TEST_TENANT.id,
      role: 'operator',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockPrismaService.resetMocks();
    mockMtServerService.resetMocks();
  });

  // ==================== 获取服务器列表测试 ====================

  describe('GET /mt-servers - 获取服务器列表', () => {
    it('管理员应该能获取服务器列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data.servers)).toBe(true);
      expect(response.body.data.total).toBeGreaterThanOrEqual(0);
    });

    it('Owner 应该能获取服务器列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/mt-servers')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('未认证请求应该返回 401', async () => {
      await request(app.getHttpServer())
        .get('/tenant/mt-servers')
        .expect(401);
    });
  });

  // ==================== 获取单个服务器测试 ====================

  describe('GET /mt-servers/:serverId - 获取单个服务器', () => {
    it('应该能获取存在的服务器', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenant/mt-servers/${EXISTING_MT_SERVER.serverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.serverId).toBe(EXISTING_MT_SERVER.serverId);
      expect(response.body.data.displayName).toBe(EXISTING_MT_SERVER.displayName);
    });

    it('获取不存在的服务器应该返回 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/mt-servers/non-existent-server')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== 创建服务器测试 ====================

  describe('POST /mt-servers - 创建服务器', () => {
    const validCreateDto = {
      serverId: 'mt5-new-server',
      displayName: 'New MT5 Server',
      platformType: 'MT5',
      middlewareId: 'middleware-instance-001',
      middlewareUrl: 'http://new-middleware:8080',
      serverAddress: 'mt5-new.example.com:443',
    };

    it('管理员应该能创建服务器', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreateDto)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.serverId).toBe(validCreateDto.serverId);
      expect(response.body.data.displayName).toBe(validCreateDto.displayName);
      // 密码不应该返回
      expect(response.body.data.managerPassword).toBeUndefined();
      expect(response.body.data.managerPasswordEncrypted).toBeUndefined();
    });

    it('创建服务器时缺少必填字段应该返回 400', async () => {
      const invalidDto = {
        serverId: 'mt5-invalid',
        // 缺少其他必填字段
      };

      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidDto)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('创建服务器时 URL 格式无效应该返回 400', async () => {
      const invalidUrlDto = {
        ...validCreateDto,
        serverId: 'mt5-invalid-url',
        middlewareUrl: ':::invalid:::url:::',  // 明显无效的 URL 格式
      };

      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidUrlDto)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('创建重复 serverId 的服务器应该返回 409', async () => {
      const duplicateDto = {
        ...validCreateDto,
        serverId: EXISTING_MT_SERVER.serverId, // 使用已存在的 serverId
      };

      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(duplicateDto)
        .expect(409);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== 更新服务器测试 ====================

  describe('PUT /mt-servers/:serverId - 更新服务器', () => {
    it('应该能更新服务器配置', async () => {
      const updateDto = {
        displayName: 'Updated Server Name',
        middlewareUrl: 'http://updated-middleware:9090',
      };

      const response = await request(app.getHttpServer())
        .put(`/tenant/mt-servers/${EXISTING_MT_SERVER.serverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.displayName).toBe(updateDto.displayName);
    });

    it('更新不存在的服务器应该返回 404', async () => {
      const updateDto = {
        displayName: 'New Name',
      };

      const response = await request(app.getHttpServer())
        .put('/tenant/mt-servers/non-existent-server')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateDto)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('应该能更新中间件 URL', async () => {
      const updateDto = {
        middlewareUrl: 'http://updated-url:9999',
      };

      const response = await request(app.getHttpServer())
        .put(`/tenant/mt-servers/${EXISTING_MT_SERVER.serverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // ==================== 删除服务器测试 ====================

  describe('DELETE /mt-servers/:serverId - 删除服务器', () => {
    it('应该能删除非默认服务器', async () => {
      // 返回 204 No Content
      await request(app.getHttpServer())
        .delete(`/tenant/mt-servers/${SECOND_MT_SERVER.serverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('删除默认服务器应该返回 400', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/tenant/mt-servers/${EXISTING_MT_SERVER.serverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('删除不存在的服务器应该返回 404', async () => {
      const response = await request(app.getHttpServer())
        .delete('/tenant/mt-servers/non-existent-server')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== 连接测试功能测试 ====================

  describe('POST /mt-servers/:serverId/test-connection - 测试连接', () => {
    it('应该能测试成功的连接', async () => {
      // POST 端点默认返回 201
      const response = await request(app.getHttpServer())
        .post(`/tenant/mt-servers/${EXISTING_MT_SERVER.serverId}/test-connection`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      // ResponseInterceptor 包装: { success: true, data: ConnectionTestResult }
      expect(response.body.success).toBe(true);
      expect(response.body.data.success).toBe(true); // 连接测试成功
      expect(response.body.data.latency).toBeDefined();
      expect(response.body.data.serverVersion).toBeDefined();
    });

    it('应该能返回失败的连接测试结果', async () => {
      mockMtServerService.setConnectionTestResult(SECOND_MT_SERVER.serverId, false);

      // POST 端点默认返回 201
      const response = await request(app.getHttpServer())
        .post(`/tenant/mt-servers/${SECOND_MT_SERVER.serverId}/test-connection`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      // ResponseInterceptor 包装: { success: true, data: ConnectionTestResult }
      // 注意: HTTP 请求成功 (success: true)，但连接测试失败 (data.success: false)
      expect(response.body.success).toBe(true);
      expect(response.body.data.success).toBe(false); // 连接测试失败
      expect(response.body.data.error).toBeDefined();
    });

    it('测试不存在的服务器连接应该返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers/non-existent-server/test-connection')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      // 404 错误由 HttpExceptionFilter 处理，success 为 false
      expect(response.body.success).toBe(false);
    });
  });

  // ==================== 设置默认服务器测试 ====================

  describe('POST /mt-servers/:serverId/set-default - 设置默认服务器', () => {
    it('应该能设置默认服务器', async () => {
      // POST 端点默认返回 201
      const response = await request(app.getHttpServer())
        .post(`/tenant/mt-servers/${SECOND_MT_SERVER.serverId}/set-default`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isDefault).toBe(true);
    });

    it('设置不存在的服务器为默认应该返回 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers/non-existent-server/set-default')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('设置非活跃服务器为默认应该返回 400', async () => {
      // 创建一个非活跃服务器用于测试
      mockPrismaService.mtServer.create({
        data: {
          ...SECOND_MT_SERVER,
          serverId: 'inactive-server',
          isActive: false,
          isDefault: false,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers/inactive-server/set-default')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== 获取默认服务器测试 ====================

  describe('GET /mt-servers/default/server - 获取默认服务器', () => {
    it('应该能获取默认服务器', async () => {
      const response = await request(app.getHttpServer())
        .get('/tenant/mt-servers/default/server')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isDefault).toBe(true);
    });
  });

  // ==================== 切换服务器状态测试 ====================

  describe('POST /mt-servers/:serverId/toggle-status - 切换服务器状态', () => {
    it('应该能禁用服务器', async () => {
      // POST 端点默认返回 201
      const response = await request(app.getHttpServer())
        .post(`/tenant/mt-servers/${SECOND_MT_SERVER.serverId}/toggle-status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('应该能启用服务器', async () => {
      // POST 端点默认返回 201
      const response = await request(app.getHttpServer())
        .post(`/tenant/mt-servers/${SECOND_MT_SERVER.serverId}/toggle-status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('禁用默认服务器应该返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post(`/tenant/mt-servers/${EXISTING_MT_SERVER.serverId}/toggle-status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==================== 权限测试 ====================
  // 注意: 当前 MtServerController 尚未配置 RolesGuard 限制 Operator
  // 以下测试验证任何已认证用户都能访问（实际权限控制待后续添加）

  describe('权限控制', () => {
    it('Operator 应该能获取服务器列表（当前无角色限制）', async () => {
      // 当前控制器没有 @Roles() 装饰器限制
      const response = await request(app.getHttpServer())
        .get('/tenant/mt-servers')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('未认证用户不能访问 MT 服务器管理', async () => {
      await request(app.getHttpServer())
        .get('/tenant/mt-servers')
        .expect(401);
    });
  });

  // ==================== 完整流程测试 ====================

  describe('完整配置流程', () => {
    it('应该能完成 CRUD 流程：创建 -> 获取 -> 更新 -> 删除', async () => {
      const createDto = {
        serverId: 'mt5-crud-test',
        displayName: 'CRUD Test Server',
        platformType: 'MT5',
        middlewareId: 'middleware-instance-002',
        middlewareUrl: 'http://crud-test:8080',
        serverAddress: 'mt5-crud.example.com:443',
      };

      // 1. 创建服务器
      const createResponse = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createDto)
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      const newServerId = createResponse.body.data.serverId;

      // 2. 获取服务器详情
      const getResponse = await request(app.getHttpServer())
        .get(`/tenant/mt-servers/${newServerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.serverId).toBe(newServerId);

      // 3. 更新服务器
      const updateResponse = await request(app.getHttpServer())
        .put(`/tenant/mt-servers/${newServerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ displayName: 'Updated CRUD Test Server' })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.data.displayName).toBe('Updated CRUD Test Server');

      // 4. 删除服务器 (返回 204 No Content)
      await request(app.getHttpServer())
        .delete(`/tenant/mt-servers/${newServerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // 5. 确认已删除
      await request(app.getHttpServer())
        .get(`/tenant/mt-servers/${newServerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ==================== 输入验证测试 ====================

  describe('输入验证', () => {
    it('serverId 不能为空', async () => {
      const invalidDto = {
        serverId: '',
        displayName: 'Invalid Server',
        platformType: 'MT5',
        middlewareId: 'middleware-001',
        middlewareUrl: 'http://invalid:8080',
        serverAddress: 'mt5-invalid.example.com:443',
      };

      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidDto)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('platformType 只能是 MT4 或 MT5', async () => {
      const invalidDto = {
        serverId: 'mt5-invalid-platform',
        displayName: 'Invalid Platform Server',
        platformType: 'MT6', // 无效的平台类型
        middlewareId: 'middleware-001',
        middlewareUrl: 'http://invalid:8080',
        serverAddress: 'mt5-invalid.example.com:443',
      };

      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidDto)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('middlewareUrl 必须是有效的 URL', async () => {
      const invalidDto = {
        serverId: 'mt5-invalid-url-test',
        displayName: 'Invalid URL Server',
        platformType: 'MT5',
        middlewareId: 'middleware-001',
        middlewareUrl: ':::invalid:::url:::',  // 明显无效的 URL 格式
        serverAddress: 'mt5-invalid.example.com:443',
      };

      const response = await request(app.getHttpServer())
        .post('/tenant/mt-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidDto)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
