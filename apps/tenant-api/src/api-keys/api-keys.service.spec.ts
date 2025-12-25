import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from './services';
import * as crypto from 'crypto';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let prismaService: PrismaService;
  let webhookService: WebhookService;

  const mockTenantId = 'tenant-test-123';
  const mockAdminId = 'admin-test-456';
  const mockApiKeyId = 'api-key-test-789';

  // Mock API Key 数据
  const mockApiKey = {
    id: mockApiKeyId,
    tenantId: mockTenantId,
    name: 'Test API Key',
    keyPrefix: 'mk_a1b2',
    hashedKey: 'hashed-key-value-1234567890abcdef', // 确保足够长以便 substring
    scopes: ['*'],
    allowedIps: [],
    serverId: null,
    rateLimit: 1000,
    usageCount: 0,
    lastUsedAt: null,
    lastUsedIp: null,
    isActive: true,
    revokedAt: null,
    revokedBy: null,
    expiresAt: null,
    createdBy: mockAdminId,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockPrismaService = {
    apiKey: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockWebhookService = {
    notifyApiKeyRevoked: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
    prismaService = module.get<PrismaService>(PrismaService);
    webhookService = module.get<WebhookService>(WebhookService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // create() 测试
  // ============================================

  describe('create', () => {
    const createDto = {
      name: 'New API Key',
      scopes: ['users:read', 'positions:read'],
      allowedIps: ['192.168.1.0/24'],
      rateLimit: 500,
    };

    it('应成功创建 API Key', async () => {
      mockPrismaService.apiKey.create.mockResolvedValue({
        ...mockApiKey,
        name: createDto.name,
        scopes: createDto.scopes,
        allowedIps: createDto.allowedIps,
        rateLimit: createDto.rateLimit,
      });

      const result = await service.create(mockTenantId, createDto, mockAdminId);

      expect(result).toBeDefined();
      expect(result.name).toBe(createDto.name);
      expect(result.scopes).toEqual(createDto.scopes);
      expect(result.allowedIps).toEqual(createDto.allowedIps);
      expect(result.rateLimit).toBe(createDto.rateLimit);
      expect(result.apiKey).toBeDefined();
      expect(result.apiKey).toMatch(/^mk_/); // 应以 mk_ 开头
      expect(result.keyPrefix).toBeDefined();
      expect(mockPrismaService.apiKey.create).toHaveBeenCalled();
    });

    it('应使用默认值创建 API Key', async () => {
      const minimalDto = { name: 'Minimal Key' };

      mockPrismaService.apiKey.create.mockResolvedValue({
        ...mockApiKey,
        name: minimalDto.name,
        scopes: ['*'],
        allowedIps: [],
        rateLimit: 1000,
      });

      const result = await service.create(mockTenantId, minimalDto, mockAdminId);

      expect(result.scopes).toEqual(['*']);
      expect(result.allowedIps).toEqual([]);
      expect(result.rateLimit).toBe(1000);
    });

    it('应支持设置过期时间', async () => {
      const expiresAt = '2025-12-31T23:59:59Z';
      const dtoWithExpiry = { ...createDto, expiresAt };

      mockPrismaService.apiKey.create.mockResolvedValue({
        ...mockApiKey,
        expiresAt: new Date(expiresAt),
      });

      const result = await service.create(mockTenantId, dtoWithExpiry, mockAdminId);

      expect(result.expiresAt).toBeDefined();
      expect(mockPrismaService.apiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expiresAt: new Date(expiresAt),
          }),
        }),
      );
    });
  });

  // ============================================
  // findAll() 测试
  // ============================================

  describe('findAll', () => {
    it('应返回分页的 API Key 列表', async () => {
      mockPrismaService.apiKey.count.mockResolvedValue(1);
      mockPrismaService.apiKey.findMany.mockResolvedValue([mockApiKey]);

      const result = await service.findAll(mockTenantId, {
        page: 1,
        pageSize: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('应按状态过滤活跃的 API Key', async () => {
      mockPrismaService.apiKey.count.mockResolvedValue(1);
      mockPrismaService.apiKey.findMany.mockResolvedValue([mockApiKey]);

      await service.findAll(mockTenantId, { status: 'active' });

      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            revokedAt: null,
          }),
        }),
      );
    });

    it('应按状态过滤已撤销的 API Key', async () => {
      const revokedKey = {
        ...mockApiKey,
        isActive: false,
        revokedAt: new Date(),
      };

      mockPrismaService.apiKey.count.mockResolvedValue(1);
      mockPrismaService.apiKey.findMany.mockResolvedValue([revokedKey]);

      await service.findAll(mockTenantId, { status: 'revoked' });

      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            revokedAt: { not: null },
          }),
        }),
      );
    });

    it('应支持搜索功能', async () => {
      mockPrismaService.apiKey.count.mockResolvedValue(0);
      mockPrismaService.apiKey.findMany.mockResolvedValue([]);

      await service.findAll(mockTenantId, { search: 'test' });

      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalled();
    });

    it('应支持按服务器过滤', async () => {
      mockPrismaService.apiKey.count.mockResolvedValue(0);
      mockPrismaService.apiKey.findMany.mockResolvedValue([]);

      await service.findAll(mockTenantId, { serverId: 'srv_123' });

      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            serverId: 'srv_123',
          }),
        }),
      );
    });
  });

  // ============================================
  // findOne() 测试
  // ============================================

  describe('findOne', () => {
    it('应返回 API Key 详情', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(mockApiKey);

      const result = await service.findOne(mockTenantId, mockApiKeyId);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockApiKeyId);
      expect(result.tenantId).toBe(mockTenantId);
    });

    it('应抛出 NotFoundException 当 Key 不存在', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(mockTenantId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // update() 测试
  // ============================================

  describe('update', () => {
    const updateDto = {
      name: 'Updated Name',
      allowedIps: ['10.0.0.0/8'],
    };

    it('应成功更新 API Key', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(mockApiKey);
      mockPrismaService.apiKey.update.mockResolvedValue({
        ...mockApiKey,
        ...updateDto,
      });

      const result = await service.update(mockTenantId, mockApiKeyId, updateDto);

      expect(result.name).toBe(updateDto.name);
      expect(result.allowedIps).toEqual(updateDto.allowedIps);
    });

    it('应抛出 NotFoundException 当 Key 不存在', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(null);

      await expect(
        service.update(mockTenantId, 'non-existent-id', updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('应抛出 ConflictException 当更新已撤销的 Key', async () => {
      const revokedKey = {
        ...mockApiKey,
        revokedAt: new Date(),
      };
      mockPrismaService.apiKey.findFirst.mockResolvedValue(revokedKey);

      await expect(
        service.update(mockTenantId, mockApiKeyId, updateDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ============================================
  // revoke() 测试
  // ============================================

  describe('revoke', () => {
    it('应成功撤销 API Key', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(mockApiKey);
      mockPrismaService.apiKey.update.mockResolvedValue({
        ...mockApiKey,
        isActive: false,
        revokedAt: new Date(),
        revokedBy: mockAdminId,
      });

      const result = await service.revoke(mockTenantId, mockApiKeyId, mockAdminId);

      expect(result.isActive).toBe(false);
      expect(result.revokedAt).toBeDefined();
      expect(result.revokedBy).toBe(mockAdminId);
    });

    it('应抛出 NotFoundException 当 Key 不存在', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(null);

      await expect(
        service.revoke(mockTenantId, 'non-existent-id', mockAdminId),
      ).rejects.toThrow(NotFoundException);
    });

    it('应抛出 ConflictException 当 Key 已被撤销', async () => {
      const revokedKey = {
        ...mockApiKey,
        revokedAt: new Date(),
      };
      mockPrismaService.apiKey.findFirst.mockResolvedValue(revokedKey);

      await expect(
        service.revoke(mockTenantId, mockApiKeyId, mockAdminId),
      ).rejects.toThrow(ConflictException);
    });

    it('应在撤销后发送 Webhook 通知', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(mockApiKey);
      mockPrismaService.apiKey.update.mockResolvedValue({
        ...mockApiKey,
        isActive: false,
        revokedAt: new Date(),
        revokedBy: mockAdminId,
      });

      await service.revoke(mockTenantId, mockApiKeyId, mockAdminId);

      // 等待异步 webhook 调用
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockWebhookService.notifyApiKeyRevoked).toHaveBeenCalledWith(
        expect.objectContaining({
          keyId: mockApiKeyId,
          tenantId: mockTenantId,
          revokedBy: mockAdminId,
        }),
      );
    });

    it('应在撤销时传递撤销原因到 Webhook', async () => {
      const reason = '安全违规';
      mockPrismaService.apiKey.findFirst.mockResolvedValue(mockApiKey);
      mockPrismaService.apiKey.update.mockResolvedValue({
        ...mockApiKey,
        isActive: false,
        revokedAt: new Date(),
        revokedBy: mockAdminId,
      });

      await service.revoke(mockTenantId, mockApiKeyId, mockAdminId, { reason });

      // 等待异步 webhook 调用
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockWebhookService.notifyApiKeyRevoked).toHaveBeenCalledWith(
        expect.objectContaining({
          keyId: mockApiKeyId,
          reason,
        }),
      );
    });

    it('Webhook 失败不应影响撤销操作', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(mockApiKey);
      mockPrismaService.apiKey.update.mockResolvedValue({
        ...mockApiKey,
        isActive: false,
        revokedAt: new Date(),
        revokedBy: mockAdminId,
      });
      mockWebhookService.notifyApiKeyRevoked.mockRejectedValue(
        new Error('Webhook 连接失败'),
      );

      // 撤销操作应成功完成，即使 Webhook 失败
      const result = await service.revoke(mockTenantId, mockApiKeyId, mockAdminId);

      expect(result.isActive).toBe(false);
      expect(result.revokedAt).toBeDefined();
    });
  });

  // ============================================
  // validate() 测试
  // ============================================

  describe('validate', () => {
    const generateHashedKey = (apiKey: string) => {
      return crypto.createHash('sha256').update(apiKey).digest('hex');
    };

    it('应成功验证有效的 API Key', async () => {
      const rawApiKey = 'mk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      const hashedKey = generateHashedKey(rawApiKey);

      mockPrismaService.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        hashedKey,
      });
      mockPrismaService.apiKey.update.mockResolvedValue(mockApiKey);

      const result = await service.validate({
        apiKey: rawApiKey,
      });

      expect(result.valid).toBe(true);
      expect(result.keyId).toBe(mockApiKeyId);
      expect(result.tenantId).toBe(mockTenantId);
    });

    it('应返回 INVALID_KEY 当 Key 不存在', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(null);

      const result = await service.validate({
        apiKey: 'mk_invalid_key_value',
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_KEY');
    });

    it('应返回 REVOKED 当 Key 已撤销', async () => {
      const rawApiKey = 'mk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      const hashedKey = generateHashedKey(rawApiKey);

      mockPrismaService.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        hashedKey,
        revokedAt: new Date(),
      });

      const result = await service.validate({
        apiKey: rawApiKey,
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('REVOKED');
    });

    it('应返回 EXPIRED 当 Key 已过期', async () => {
      const rawApiKey = 'mk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      const hashedKey = generateHashedKey(rawApiKey);

      mockPrismaService.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        hashedKey,
        expiresAt: new Date('2020-01-01'), // 过期日期
      });

      const result = await service.validate({
        apiKey: rawApiKey,
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('EXPIRED');
    });

    it('应返回 IP_NOT_ALLOWED 当 IP 不在白名单', async () => {
      const rawApiKey = 'mk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      const hashedKey = generateHashedKey(rawApiKey);

      mockPrismaService.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        hashedKey,
        allowedIps: ['192.168.1.0/24'],
      });

      const result = await service.validate({
        apiKey: rawApiKey,
        clientIp: '10.0.0.1',
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('IP_NOT_ALLOWED');
    });

    it('应允许精确匹配的 IP', async () => {
      const rawApiKey = 'mk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      const hashedKey = generateHashedKey(rawApiKey);

      mockPrismaService.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        hashedKey,
        allowedIps: ['192.168.1.100'],
      });
      mockPrismaService.apiKey.update.mockResolvedValue(mockApiKey);

      const result = await service.validate({
        apiKey: rawApiKey,
        clientIp: '192.168.1.100',
      });

      expect(result.valid).toBe(true);
    });

    it('应允许 /24 CIDR 范围内的 IP', async () => {
      const rawApiKey = 'mk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      const hashedKey = generateHashedKey(rawApiKey);

      mockPrismaService.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        hashedKey,
        allowedIps: ['192.168.1.0/24'],
      });
      mockPrismaService.apiKey.update.mockResolvedValue(mockApiKey);

      const result = await service.validate({
        apiKey: rawApiKey,
        clientIp: '192.168.1.50',
      });

      expect(result.valid).toBe(true);
    });

    it('应返回 SCOPE_DENIED 当作用域不足', async () => {
      const rawApiKey = 'mk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      const hashedKey = generateHashedKey(rawApiKey);

      mockPrismaService.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        hashedKey,
        scopes: ['users:read'],
      });

      const result = await service.validate({
        apiKey: rawApiKey,
        requiredScopes: ['trading:execute'],
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('SCOPE_DENIED');
    });

    it('应允许 * 通配符作用域', async () => {
      const rawApiKey = 'mk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      const hashedKey = generateHashedKey(rawApiKey);

      mockPrismaService.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        hashedKey,
        scopes: ['*'],
      });
      mockPrismaService.apiKey.update.mockResolvedValue(mockApiKey);

      const result = await service.validate({
        apiKey: rawApiKey,
        requiredScopes: ['trading:execute', 'users:read'],
      });

      expect(result.valid).toBe(true);
    });

    it('应允许前缀通配符作用域 (如 users:*)', async () => {
      const rawApiKey = 'mk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      const hashedKey = generateHashedKey(rawApiKey);

      mockPrismaService.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        hashedKey,
        scopes: ['users:*'],
      });
      mockPrismaService.apiKey.update.mockResolvedValue(mockApiKey);

      const result = await service.validate({
        apiKey: rawApiKey,
        requiredScopes: ['users:read', 'users:write'],
      });

      expect(result.valid).toBe(true);
    });

    it('应记录使用统计', async () => {
      const rawApiKey = 'mk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      const hashedKey = generateHashedKey(rawApiKey);
      const clientIp = '192.168.1.100';

      mockPrismaService.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        hashedKey,
      });
      mockPrismaService.apiKey.update.mockResolvedValue(mockApiKey);

      await service.validate({
        apiKey: rawApiKey,
        clientIp,
      });

      expect(mockPrismaService.apiKey.update).toHaveBeenCalledWith({
        where: { id: mockApiKeyId },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: expect.any(Date),
          lastUsedIp: clientIp,
        },
      });
    });
  });

  // ============================================
  // recordUsage() 测试
  // ============================================

  describe('recordUsage', () => {
    it('应更新使用统计', async () => {
      mockPrismaService.apiKey.update.mockResolvedValue(mockApiKey);

      await service.recordUsage(mockApiKeyId, '192.168.1.100');

      expect(mockPrismaService.apiKey.update).toHaveBeenCalledWith({
        where: { id: mockApiKeyId },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: expect.any(Date),
          lastUsedIp: '192.168.1.100',
        },
      });
    });

    it('应处理无 IP 的情况', async () => {
      mockPrismaService.apiKey.update.mockResolvedValue(mockApiKey);

      await service.recordUsage(mockApiKeyId);

      expect(mockPrismaService.apiKey.update).toHaveBeenCalledWith({
        where: { id: mockApiKeyId },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: expect.any(Date),
          lastUsedIp: undefined,
        },
      });
    });
  });
});
