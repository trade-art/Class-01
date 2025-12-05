import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { MtServerService, CreateMtServerDto } from './mt-server.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformType } from '../adapters/types';

describe('MtServerService', () => {
  let service: MtServerService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockTenantId = 'tenant-123';
  const mockServerId = 'server-456';

  const mockMtServer = {
    id: 'mt-server-id',
    tenantId: mockTenantId,
    serverId: mockServerId,
    displayName: 'Test MT5 Server',
    platformType: 'MT5' as const,
    middlewareUrl: 'http://localhost:8080',
    serverAddress: 'mt5.example.com:443',
    managerLogin: BigInt(1000),
    managerPasswordEncrypted: 'encrypted_password',
    isActive: true,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      mtServer: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MtServerService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<MtServerService>(MtServerService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getServers', () => {
    it('应该返回租户的所有 MT 服务器', async () => {
      prismaService.mtServer.findMany = jest.fn().mockResolvedValue([mockMtServer]);

      const result = await service.getServers(mockTenantId);

      expect(result.total).toBe(1);
      expect(result.servers[0].serverId).toBe(mockServerId);
      expect(prismaService.mtServer.findMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
    });

    it('应该返回空列表当没有服务器时', async () => {
      prismaService.mtServer.findMany = jest.fn().mockResolvedValue([]);

      const result = await service.getServers(mockTenantId);

      expect(result.total).toBe(0);
      expect(result.servers).toHaveLength(0);
    });
  });

  describe('getServer', () => {
    it('应该返回指定的 MT 服务器', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue(mockMtServer);

      const result = await service.getServer(mockTenantId, mockServerId);

      expect(result.serverId).toBe(mockServerId);
      expect(result.platformType).toBe(PlatformType.MT5);
    });

    it('当服务器不存在时应该抛出 NotFoundException', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.getServer(mockTenantId, 'non-existent'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getDefaultServer', () => {
    it('应该返回默认服务器', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue(mockMtServer);

      const result = await service.getDefaultServer(mockTenantId);

      expect(result).not.toBeNull();
      expect(result!.isDefault).toBe(true);
    });

    it('当没有默认服务器时应该返回第一个活跃服务器', async () => {
      const firstActiveServer = { ...mockMtServer, isDefault: false };
      prismaService.mtServer.findFirst = jest.fn()
        .mockResolvedValueOnce(null) // 没有默认服务器
        .mockResolvedValueOnce(firstActiveServer); // 返回第一个活跃服务器

      const result = await service.getDefaultServer(mockTenantId);

      expect(result).not.toBeNull();
    });

    it('当没有任何服务器时应该返回 null', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue(null);

      const result = await service.getDefaultServer(mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('createServer', () => {
    const createDto: CreateMtServerDto = {
      serverId: 'new-server',
      displayName: 'New Server',
      middlewareUrl: 'http://localhost:8081',
      serverAddress: 'new.mt5.com:443',
      managerLogin: 2000,
      managerPassword: 'password123',
      isDefault: false,
    };

    it('应该成功创建 MT 服务器', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue(null);
      prismaService.mtServer.create = jest.fn().mockResolvedValue({
        ...mockMtServer,
        serverId: createDto.serverId,
        displayName: createDto.displayName,
      });

      const result = await service.createServer(mockTenantId, createDto);

      expect(result.serverId).toBe(createDto.serverId);
      expect(prismaService.mtServer.create).toHaveBeenCalled();
    });

    it('当 serverId 已存在时应该抛出 ConflictException', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue(mockMtServer);

      await expect(service.createServer(mockTenantId, createDto))
        .rejects.toThrow(ConflictException);
    });

    it('当中间件 URL 无效时应该抛出 BadRequestException', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue(null);

      const invalidDto = { ...createDto, middlewareUrl: 'not-a-valid-url' };

      await expect(service.createServer(mockTenantId, invalidDto))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('updateServer', () => {
    it('应该成功更新 MT 服务器', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue(mockMtServer);
      prismaService.mtServer.update = jest.fn().mockResolvedValue({
        ...mockMtServer,
        displayName: 'Updated Name',
      });

      const result = await service.updateServer(mockTenantId, mockServerId, {
        displayName: 'Updated Name',
      });

      expect(result.displayName).toBe('Updated Name');
    });

    it('当服务器不存在时应该抛出 NotFoundException', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.updateServer(mockTenantId, 'non-existent', {}))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleServerStatus', () => {
    it('应该成功切换服务器状态', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue({
        ...mockMtServer,
        isDefault: false,
      });
      prismaService.mtServer.update = jest.fn().mockResolvedValue({
        ...mockMtServer,
        isActive: false,
        isDefault: false,
      });

      const result = await service.toggleServerStatus(mockTenantId, mockServerId, false);

      expect(result.isActive).toBe(false);
    });

    it('禁用默认服务器时应该选择新的默认服务器', async () => {
      const anotherServer = { ...mockMtServer, id: 'another-id', isDefault: false };

      prismaService.mtServer.findFirst = jest.fn()
        .mockResolvedValueOnce(mockMtServer) // 当前服务器是默认
        .mockResolvedValueOnce(anotherServer); // 另一个活跃服务器
      prismaService.mtServer.update = jest.fn().mockResolvedValue({
        ...mockMtServer,
        isActive: false,
        isDefault: false,
      });

      await service.toggleServerStatus(mockTenantId, mockServerId, false);

      expect(prismaService.mtServer.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteServer', () => {
    it('应该成功删除 MT 服务器', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue({
        ...mockMtServer,
        isDefault: false,
      });
      prismaService.mtServer.delete = jest.fn().mockResolvedValue(mockMtServer);

      await service.deleteServer(mockTenantId, mockServerId);

      expect(prismaService.mtServer.delete).toHaveBeenCalledWith({
        where: { id: mockMtServer.id },
      });
    });

    it('当服务器不存在时应该抛出 NotFoundException', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.deleteServer(mockTenantId, 'non-existent'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('setDefaultServer', () => {
    it('应该成功设置默认服务器', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue({
        ...mockMtServer,
        isDefault: false,
      });
      prismaService.mtServer.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      prismaService.mtServer.update = jest.fn().mockResolvedValue({
        ...mockMtServer,
        isDefault: true,
      });

      const result = await service.setDefaultServer(mockTenantId, mockServerId);

      expect(result.isDefault).toBe(true);
      expect(prismaService.mtServer.updateMany).toHaveBeenCalled();
    });

    it('当服务器不存在或未激活时应该抛出 NotFoundException', async () => {
      prismaService.mtServer.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.setDefaultServer(mockTenantId, 'non-existent'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
