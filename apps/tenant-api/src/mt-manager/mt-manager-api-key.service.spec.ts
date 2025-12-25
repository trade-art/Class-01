import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { MtManagerApiKeyService } from './mt-manager-api-key.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../security/encryption.service';

describe('MtManagerApiKeyService', () => {
  let service: MtManagerApiKeyService;
  let prismaService: PrismaService;
  let encryptionService: EncryptionService;

  const mockTenantId = 'tenant-test-123';
  const mockManagerId = 'manager-test-456';
  const mockOperatorId = 'operator-test-789';

  const mockManager = {
    id: mockManagerId,
    tenantId: mockTenantId,
    managerLogin: BigInt(10007),
    displayName: '测试经理账号',
    isActive: true,
    apiKeyId: null,
    apiKeySecretHash: null,
    apiKeyEnabled: false,
    apiKeyCreatedAt: null,
    apiKeyLastUsedAt: null,
    apiKeyLastUsedIp: null,
    server: {
      id: 'server-test-1',
      serverId: 'mt5-server-1',
      displayName: '测试服务器',
      platformType: 'MT5',
      middlewareId: 'middleware-1',
      middlewareUrl: 'http://localhost:3001',
    },
  };

  const mockPrismaService = {
    mtManager: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'apiKey.jwtSecret': 'test-jwt-secret-for-api-key',
        'jwt.secret': 'test-jwt-secret',
      };
      return config[key];
    }),
  };

  // 模拟加密后的数据
  const mockEncryptedData = JSON.stringify({
    ciphertext: 'base64-encrypted-data',
    iv: 'base64-iv',
    authTag: 'base64-auth-tag',
    keyId: 'master-v1',
    algorithm: 'aes-256-gcm',
    version: 1,
  });

  const mockEncryptionService = {
    encryptToString: jest.fn().mockReturnValue(mockEncryptedData),
    decryptFromString: jest.fn().mockReturnValue('ms_test-api-secret-value-12345678901234567890'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MtManagerApiKeyService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    service = module.get<MtManagerApiKeyService>(MtManagerApiKeyService);
    prismaService = module.get<PrismaService>(PrismaService);
    encryptionService = module.get<EncryptionService>(EncryptionService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateApiKey', () => {
    it('应成功生成 API Key', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: null,
      });
      mockPrismaService.mtManager.update.mockResolvedValue({
        ...mockManager,
        apiKeyId: 'mk_test123',
        apiKeyEnabled: true,
      });

      const result = await service.generateApiKey(mockTenantId, mockManagerId, ['*'], mockOperatorId);

      expect(result).toHaveProperty('apiKeyId');
      expect(result).toHaveProperty('apiSecret');
      expect(result).toHaveProperty('managerId', mockManagerId);
      expect(result.apiKeyId).toMatch(/^mk_/);
      expect(result.apiSecret).toMatch(/^ms_/);
      expect(mockEncryptionService.encryptToString).toHaveBeenCalled();
      expect(mockPrismaService.mtManager.update).toHaveBeenCalledWith({
        where: { id: mockManagerId },
        data: expect.objectContaining({
          apiKeyId: expect.stringMatching(/^mk_/),
          apiKeySecretHash: mockEncryptedData,
          apiKeyEnabled: true,
        }),
      });
    });

    it('经理账号不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue(null);

      await expect(
        service.generateApiKey(mockTenantId, mockManagerId, ['*'], mockOperatorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('已有 API Key 时应抛出 ConflictException', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: 'existing-api-key',
      });

      await expect(
        service.generateApiKey(mockTenantId, mockManagerId, ['*'], mockOperatorId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getApiSecret', () => {
    it('应成功获取解密后的 API Secret', async () => {
      const mockApiKeyId = 'mk_test123456789012345678';
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        apiKeyId: mockApiKeyId,
        apiKeySecretHash: mockEncryptedData,
      });

      const result = await service.getApiSecret(mockTenantId, mockManagerId);

      expect(result).toEqual({
        apiKeyId: mockApiKeyId,
        apiSecret: 'ms_test-api-secret-value-12345678901234567890',
      });
      expect(mockEncryptionService.decryptFromString).toHaveBeenCalledWith(
        mockEncryptedData,
        { associatedData: `manager:${mockManagerId}` },
      );
    });

    it('经理账号不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue(null);

      await expect(service.getApiSecret(mockTenantId, mockManagerId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('没有 API Key 时应抛出 BadRequestException', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        apiKeyId: null,
        apiKeySecretHash: null,
      });

      await expect(service.getApiSecret(mockTenantId, mockManagerId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('解密失败时应抛出 BadRequestException', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        apiKeyId: 'mk_test123',
        apiKeySecretHash: mockEncryptedData,
      });
      mockEncryptionService.decryptFromString.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      await expect(service.getApiSecret(mockTenantId, mockManagerId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getApiKeyStatus', () => {
    it('应返回 API Key 状态', async () => {
      const mockCreatedAt = new Date('2024-12-18T10:00:00Z');
      const mockLastUsedAt = new Date('2024-12-18T12:00:00Z');
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        apiKeyId: 'mk_test123456789012345678',
        apiKeyEnabled: true,
        apiKeyCreatedAt: mockCreatedAt,
        apiKeyLastUsedAt: mockLastUsedAt,
        apiKeyLastUsedIp: '192.168.1.100',
      });

      const result = await service.getApiKeyStatus(mockTenantId, mockManagerId);

      expect(result).toEqual({
        enabled: true,
        apiKeyId: expect.stringContaining('mk_test'),
        createdAt: mockCreatedAt.toISOString(),
        lastUsedAt: mockLastUsedAt.toISOString(),
        lastUsedIp: '192.168.1.100',
      });
    });

    it('没有 API Key 时应返回空状态', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        apiKeyId: null,
        apiKeyEnabled: false,
        apiKeyCreatedAt: null,
        apiKeyLastUsedAt: null,
        apiKeyLastUsedIp: null,
      });

      const result = await service.getApiKeyStatus(mockTenantId, mockManagerId);

      expect(result).toEqual({
        enabled: false,
        apiKeyId: null,
        createdAt: null,
        lastUsedAt: null,
        lastUsedIp: null,
      });
    });

    it('经理账号不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue(null);

      await expect(service.getApiKeyStatus(mockTenantId, mockManagerId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('revokeApiKey', () => {
    it('应成功吊销 API Key', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: 'mk_existing-key',
      });
      mockPrismaService.mtManager.update.mockResolvedValue({
        ...mockManager,
        apiKeyId: null,
        apiKeySecretHash: null,
        apiKeyEnabled: false,
      });

      await service.revokeApiKey(mockTenantId, mockManagerId, mockOperatorId);

      expect(mockPrismaService.mtManager.update).toHaveBeenCalledWith({
        where: { id: mockManagerId },
        data: {
          apiKeyId: null,
          apiKeySecretHash: null,
          apiKeyEnabled: false,
          apiKeyCreatedAt: null,
          apiKeyLastUsedAt: null,
          apiKeyLastUsedIp: null,
        },
      });
    });

    it('没有 API Key 时应抛出 BadRequestException', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: null,
      });

      await expect(
        service.revokeApiKey(mockTenantId, mockManagerId, mockOperatorId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('toggleApiKey', () => {
    it('应成功启用 API Key', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: 'mk_existing-key',
        apiKeyEnabled: false,
      });
      mockPrismaService.mtManager.update.mockResolvedValue({
        ...mockManager,
        apiKeyEnabled: true,
      });

      await service.toggleApiKey(mockTenantId, mockManagerId, true, mockOperatorId);

      expect(mockPrismaService.mtManager.update).toHaveBeenCalledWith({
        where: { id: mockManagerId },
        data: { apiKeyEnabled: true },
      });
    });

    it('应成功禁用 API Key', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: 'mk_existing-key',
        apiKeyEnabled: true,
      });
      mockPrismaService.mtManager.update.mockResolvedValue({
        ...mockManager,
        apiKeyEnabled: false,
      });

      await service.toggleApiKey(mockTenantId, mockManagerId, false, mockOperatorId);

      expect(mockPrismaService.mtManager.update).toHaveBeenCalledWith({
        where: { id: mockManagerId },
        data: { apiKeyEnabled: false },
      });
    });

    it('没有 API Key 时应抛出 BadRequestException', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: null,
      });

      await expect(
        service.toggleApiKey(mockTenantId, mockManagerId, true, mockOperatorId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('authenticate', () => {
    const mockApiKeyId = 'mk_test123456789012345678';
    const mockApiSecret = 'ms_test-api-secret-value-12345678901234567890';

    it('应成功认证并返回 Token', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: mockApiKeyId,
        apiKeySecretHash: mockEncryptedData,
        apiKeyEnabled: true,
      });
      mockEncryptionService.decryptFromString.mockReturnValue(mockApiSecret);
      mockPrismaService.mtManager.update.mockResolvedValue({});

      const result = await service.authenticate(mockApiKeyId, mockApiSecret, '192.168.1.100');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn', 15 * 60);
      expect(result).toHaveProperty('refreshExpiresIn', 7 * 24 * 60 * 60);
      expect(result).toHaveProperty('tokenType', 'Bearer');
      expect(result).toHaveProperty('manager');
      expect(result.manager).toHaveProperty('id', mockManagerId);
    });

    it('无效的 API Key 应抛出 UnauthorizedException', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue(null);

      await expect(
        service.authenticate('invalid-key', mockApiSecret, '192.168.1.100'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('API Key 已禁用时应抛出 UnauthorizedException', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: mockApiKeyId,
        apiKeyEnabled: false,
      });

      await expect(
        service.authenticate(mockApiKeyId, mockApiSecret, '192.168.1.100'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('经理账号未激活时应抛出 UnauthorizedException', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: mockApiKeyId,
        apiKeyEnabled: true,
        isActive: false,
      });

      await expect(
        service.authenticate(mockApiKeyId, mockApiSecret, '192.168.1.100'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('错误的 API Secret 应抛出 UnauthorizedException', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: mockApiKeyId,
        apiKeySecretHash: mockEncryptedData,
        apiKeyEnabled: true,
      });
      mockEncryptionService.decryptFromString.mockReturnValue('different-secret');

      await expect(
        service.authenticate(mockApiKeyId, mockApiSecret, '192.168.1.100'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateAccessToken', () => {
    it('有效的 Access Token 应返回 payload', async () => {
      // 先生成一个有效的 token
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: 'mk_test123',
        apiKeySecretHash: mockEncryptedData,
        apiKeyEnabled: true,
      });
      mockEncryptionService.decryptFromString.mockReturnValue('ms_test-secret');
      mockPrismaService.mtManager.update.mockResolvedValue({});

      const authResult = await service.authenticate(
        'mk_test123',
        'ms_test-secret',
        '192.168.1.100',
      );

      const payload = service.validateAccessToken(authResult.accessToken);

      expect(payload).toHaveProperty('type', 'access');
      expect(payload).toHaveProperty('managerId', mockManagerId);
      expect(payload).toHaveProperty('tenantId', mockTenantId);
    });

    it('无效的 Token 应抛出 UnauthorizedException', () => {
      expect(() => service.validateAccessToken('invalid-token')).toThrow(UnauthorizedException);
    });
  });

  describe('简化 Token 结构验证 (安全性改进)', () => {
    const mockApiKeyId = 'mk_test123456789012345678';
    const mockApiSecret = 'ms_test-api-secret-value-12345678901234567890';

    /**
     * 验证 Token 只包含必要的最小字段，不暴露敏感信息
     * Requirements: REQ-9 Token 安全性改进
     */
    it('Access Token 应只包含 managerId, tenantId, apiKeyId, type', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: mockApiKeyId,
        apiKeySecretHash: mockEncryptedData,
        apiKeyEnabled: true,
      });
      mockEncryptionService.decryptFromString.mockReturnValue(mockApiSecret);
      mockPrismaService.mtManager.update.mockResolvedValue({});

      const authResult = await service.authenticate(mockApiKeyId, mockApiSecret, '192.168.1.100');
      const payload = service.validateAccessToken(authResult.accessToken);

      // 验证必须存在的字段
      expect(payload).toHaveProperty('type', 'access');
      expect(payload).toHaveProperty('managerId', mockManagerId);
      expect(payload).toHaveProperty('tenantId', mockTenantId);
      expect(payload).toHaveProperty('apiKeyId', mockApiKeyId);

      // 验证敏感字段不存在于 Token 中
      expect(payload).not.toHaveProperty('serverId');
      expect(payload).not.toHaveProperty('managerLogin');
      expect(payload).not.toHaveProperty('middlewareId');
      expect(payload).not.toHaveProperty('middlewareUrl');
      expect(payload).not.toHaveProperty('platformType');
      expect(payload).not.toHaveProperty('password');
      expect(payload).not.toHaveProperty('encryptedPassword');
    });

    it('Refresh Token 应只包含 managerId, tenantId, apiKeyId, type', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: mockApiKeyId,
        apiKeySecretHash: mockEncryptedData,
        apiKeyEnabled: true,
      });
      mockEncryptionService.decryptFromString.mockReturnValue(mockApiSecret);
      mockPrismaService.mtManager.update.mockResolvedValue({});

      const authResult = await service.authenticate(mockApiKeyId, mockApiSecret, '192.168.1.100');
      // 使用 jwt.decode 检查 refresh token payload 结构 (不验证签名)
      const payload = jwt.decode(authResult.refreshToken) as Record<string, unknown>;

      // 验证必须存在的字段
      expect(payload).toHaveProperty('type', 'refresh');
      expect(payload).toHaveProperty('managerId', mockManagerId);
      expect(payload).toHaveProperty('tenantId', mockTenantId);
      expect(payload).toHaveProperty('apiKeyId', mockApiKeyId);

      // 验证敏感字段不存在于 Token 中
      expect(payload).not.toHaveProperty('serverId');
      expect(payload).not.toHaveProperty('managerLogin');
      expect(payload).not.toHaveProperty('middlewareId');
      expect(payload).not.toHaveProperty('middlewareUrl');
      expect(payload).not.toHaveProperty('platformType');
      expect(payload).not.toHaveProperty('password');
      expect(payload).not.toHaveProperty('encryptedPassword');
    });

    it('Token payload 字段数量应最小化', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: mockApiKeyId,
        apiKeySecretHash: mockEncryptedData,
        apiKeyEnabled: true,
      });
      mockEncryptionService.decryptFromString.mockReturnValue(mockApiSecret);
      mockPrismaService.mtManager.update.mockResolvedValue({});

      const authResult = await service.authenticate(mockApiKeyId, mockApiSecret, '192.168.1.100');
      const payload = service.validateAccessToken(authResult.accessToken);

      // Token 应只有必要字段: type, managerId, tenantId, apiKeyId, iat, exp, iss, sub
      const payloadKeys = Object.keys(payload);
      const expectedKeys = ['type', 'managerId', 'tenantId', 'apiKeyId', 'iat', 'exp', 'iss', 'sub'];

      // 所有键都应在预期列表中
      payloadKeys.forEach((key) => {
        expect(expectedKeys).toContain(key);
      });
    });

    it('认证结果应包含 manager 信息用于客户端显示', async () => {
      mockPrismaService.mtManager.findFirst.mockResolvedValue({
        ...mockManager,
        apiKeyId: mockApiKeyId,
        apiKeySecretHash: mockEncryptedData,
        apiKeyEnabled: true,
      });
      mockEncryptionService.decryptFromString.mockReturnValue(mockApiSecret);
      mockPrismaService.mtManager.update.mockResolvedValue({});

      const authResult = await service.authenticate(mockApiKeyId, mockApiSecret, '192.168.1.100');

      // 认证响应应包含 manager 信息 (用于客户端显示，非存储在 Token 中)
      expect(authResult.manager).toBeDefined();
      expect(authResult.manager.id).toBe(mockManagerId);
      expect(authResult.manager.displayName).toBe(mockManager.displayName);
    });
  });
});
