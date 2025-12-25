import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { MtManagerAccessTokenService } from './mt-manager-access-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceTokenService } from '../auth/services/service-token.service';

describe('MtManagerAccessTokenService', () => {
  let service: MtManagerAccessTokenService;
  let prismaService: PrismaService;
  let serviceTokenService: ServiceTokenService;

  const mockTenantId = 'tenant-test-123';
  const mockManagerId = 'manager-test-456';
  const mockUserId = 'user-test-789';
  const mockMiddlewareId = 'middleware-test-001';

  const mockManager = {
    id: mockManagerId,
    tenantId: mockTenantId,
    managerLogin: BigInt(10007),
    displayName: '测试经理账号',
    isActive: true,
    server: {
      id: 'server-test-1',
      serverId: 'mt5-server-1',
      displayName: '测试服务器',
      platformType: 'MT5',
      middlewareId: mockMiddlewareId,
      middlewareUrl: 'http://localhost:3001',
      isActive: true,
    },
  };

  const mockMiddlewareAssignment = {
    id: 'assignment-test-1',
    middlewareId: mockMiddlewareId,
    tenantId: mockTenantId,
    assignedAt: new Date(),
    assignedBy: 'admin-1',
  };

  const mockTokenResult = {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-token',
    expiresAt: Math.floor(Date.now() / 1000) + 900,
    tokenType: 'Bearer' as const,
  };

  const mockPrismaService = {
    mtManager: {
      findUnique: jest.fn(),
    },
    middlewareAssignment: {
      findUnique: jest.fn(),
    },
  };

  const mockServiceTokenService = {
    generatePoolModeToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MtManagerAccessTokenService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ServiceTokenService, useValue: mockServiceTokenService },
      ],
    }).compile();

    service = module.get<MtManagerAccessTokenService>(
      MtManagerAccessTokenService,
    );
    prismaService = module.get<PrismaService>(PrismaService);
    serviceTokenService = module.get<ServiceTokenService>(ServiceTokenService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAccessToken', () => {
    it('应成功生成 Access Token', async () => {
      mockPrismaService.mtManager.findUnique.mockResolvedValue(mockManager);
      mockPrismaService.middlewareAssignment.findUnique.mockResolvedValue(
        mockMiddlewareAssignment,
      );
      mockServiceTokenService.generatePoolModeToken.mockReturnValue(
        mockTokenResult,
      );

      const result = await service.generateAccessToken(
        mockTenantId,
        mockManagerId,
        mockUserId,
      );

      expect(result).toBeDefined();
      expect(result.accessToken).toBe(mockTokenResult.token);
      expect(result.expiresIn).toBe(900);
      expect(result.expiresAt).toBe(mockTokenResult.expiresAt);
      expect(result.tokenType).toBe('Bearer');
      expect(result.middlewareUrl).toBe('http://localhost:3001');
      expect(result.manager).toBeDefined();
      expect(result.manager.id).toBe(mockManagerId);
      expect(result.manager.managerLogin).toBe('10007');
      expect(result.manager.platformType).toBe('MT5');

      expect(mockServiceTokenService.generatePoolModeToken).toHaveBeenCalledWith({
        managerId: mockManagerId,
        tenantId: mockTenantId,
        apiKeyId: 'console', // 标识为 Tenant Console 直接访问
        scopes: ['*'],
        expiresIn: 900,
      });
    });

    it('应在 Manager 不存在时抛出 NotFoundException', async () => {
      mockPrismaService.mtManager.findUnique.mockResolvedValue(null);

      await expect(
        service.generateAccessToken(mockTenantId, mockManagerId, mockUserId),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.mtManager.findUnique).toHaveBeenCalledWith({
        where: { id: mockManagerId },
        include: {
          server: {
            select: {
              id: true,
              serverId: true,
              displayName: true,
              platformType: true,
              middlewareId: true,
              middlewareUrl: true,
              isActive: true,
            },
          },
        },
      });
    });

    it('应在 Manager 不属于租户时抛出 ForbiddenException', async () => {
      const wrongTenantManager = {
        ...mockManager,
        tenantId: 'other-tenant-id',
      };
      mockPrismaService.mtManager.findUnique.mockResolvedValue(
        wrongTenantManager,
      );

      await expect(
        service.generateAccessToken(mockTenantId, mockManagerId, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('应在 Manager 未激活时抛出 ForbiddenException', async () => {
      const inactiveManager = {
        ...mockManager,
        isActive: false,
      };
      mockPrismaService.mtManager.findUnique.mockResolvedValue(inactiveManager);

      await expect(
        service.generateAccessToken(mockTenantId, mockManagerId, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('应在服务器未激活时抛出 ForbiddenException', async () => {
      const inactiveServerManager = {
        ...mockManager,
        server: {
          ...mockManager.server,
          isActive: false,
        },
      };
      mockPrismaService.mtManager.findUnique.mockResolvedValue(
        inactiveServerManager,
      );

      await expect(
        service.generateAccessToken(mockTenantId, mockManagerId, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('应在中间件未配置时抛出 BadRequestException', async () => {
      const noMiddlewareManager = {
        ...mockManager,
        server: {
          ...mockManager.server,
          middlewareId: null,
          middlewareUrl: null,
        },
      };
      mockPrismaService.mtManager.findUnique.mockResolvedValue(
        noMiddlewareManager,
      );

      await expect(
        service.generateAccessToken(mockTenantId, mockManagerId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('应在中间件未分配给租户时抛出 ForbiddenException', async () => {
      mockPrismaService.mtManager.findUnique.mockResolvedValue(mockManager);
      mockPrismaService.middlewareAssignment.findUnique.mockResolvedValue(null);

      await expect(
        service.generateAccessToken(mockTenantId, mockManagerId, mockUserId),
      ).rejects.toThrow(ForbiddenException);

      expect(
        mockPrismaService.middlewareAssignment.findUnique,
      ).toHaveBeenCalledWith({
        where: {
          middlewareId_tenantId: {
            middlewareId: mockMiddlewareId,
            tenantId: mockTenantId,
          },
        },
      });
    });
  });

  describe('validateManagerAccess', () => {
    it('应成功验证 Manager 访问权限', async () => {
      mockPrismaService.mtManager.findUnique.mockResolvedValue(mockManager);
      mockPrismaService.middlewareAssignment.findUnique.mockResolvedValue(
        mockMiddlewareAssignment,
      );

      const result = await service.validateManagerAccess(
        mockTenantId,
        mockManagerId,
      );

      expect(result).toBeDefined();
      expect(result.manager.id).toBe(mockManagerId);
      expect(result.manager.tenantId).toBe(mockTenantId);
      expect(result.server.middlewareId).toBe(mockMiddlewareId);
      expect(result.server.middlewareUrl).toBe('http://localhost:3001');
    });

    it('应验证所有必要条件', async () => {
      mockPrismaService.mtManager.findUnique.mockResolvedValue(mockManager);
      mockPrismaService.middlewareAssignment.findUnique.mockResolvedValue(
        mockMiddlewareAssignment,
      );

      const result = await service.validateManagerAccess(
        mockTenantId,
        mockManagerId,
      );

      // 验证 Manager 查询调用
      expect(mockPrismaService.mtManager.findUnique).toHaveBeenCalledTimes(1);

      // 验证中间件分配查询调用
      expect(
        mockPrismaService.middlewareAssignment.findUnique,
      ).toHaveBeenCalledTimes(1);

      // 验证返回的数据结构
      expect(result.manager).toHaveProperty('id');
      expect(result.manager).toHaveProperty('tenantId');
      expect(result.manager).toHaveProperty('managerLogin');
      expect(result.server).toHaveProperty('middlewareId');
      expect(result.server).toHaveProperty('middlewareUrl');
    });
  });
});
