import { Test, TestingModule } from '@nestjs/testing';
import { MtServerController } from './mt-server.controller';
import {
  MtServerService,
  MtServerDto,
  ConnectionTestResult,
} from '../middleware-proxy/services/mt-server.service';
import { PlatformType } from '../middleware-proxy/adapters/types';
import { CreateMtServerRequestDto, UpdateMtServerRequestDto } from './dto';

describe('MtServerController', () => {
  let controller: MtServerController;
  let mtServerService: jest.Mocked<MtServerService>;

  const mockTenantId = 'tenant-123';
  const mockServerId = 'server-456';

  const mockMtServer: MtServerDto = {
    id: 'mt-server-id',
    serverId: mockServerId,
    displayName: 'Test MT5 Server',
    platformType: PlatformType.MT5,
    middlewareId: 'middleware-uuid-123',
    middlewareUrl: 'http://localhost:8080',
    serverAddress: 'mt5.example.com:443',
    managerCount: 1,
    defaultManagerLogin: null,
    isActive: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockConnectionTestResult: ConnectionTestResult = {
    success: true,
    latency: 50,
    serverVersion: 'MT5 Build 3815',
    serverTime: new Date().toISOString(),
  };

  beforeEach(async () => {
    const mockMtServerService = {
      getServers: jest.fn(),
      getServer: jest.fn(),
      createServer: jest.fn(),
      updateServer: jest.fn(),
      deleteServer: jest.fn(),
      testConnection: jest.fn(),
      setDefaultServer: jest.fn(),
      toggleServerStatus: jest.fn(),
      getDefaultServer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MtServerController],
      providers: [
        {
          provide: MtServerService,
          useValue: mockMtServerService,
        },
      ],
    }).compile();

    controller = module.get<MtServerController>(MtServerController);
    mtServerService = module.get(MtServerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getServers', () => {
    it('应该返回服务器列表', async () => {
      const expectedResult = {
        servers: [mockMtServer],
        total: 1,
      };
      mtServerService.getServers.mockResolvedValue(expectedResult);

      const result = await controller.getServers(mockTenantId);

      expect(result).toEqual(expectedResult);
      expect(mtServerService.getServers).toHaveBeenCalledWith(mockTenantId);
    });
  });

  describe('getServer', () => {
    it('应该返回指定的服务器', async () => {
      mtServerService.getServer.mockResolvedValue(mockMtServer);

      const result = await controller.getServer(mockTenantId, mockServerId);

      expect(result).toEqual(mockMtServer);
      expect(mtServerService.getServer).toHaveBeenCalledWith(mockTenantId, mockServerId);
    });
  });

  describe('createServer', () => {
    it('应该创建新服务器', async () => {
      const createDto: CreateMtServerRequestDto = {
        serverId: 'new-server',
        displayName: 'New Server',
        platformType: PlatformType.MT5,
        middlewareId: 'middleware-uuid-123',
        middlewareUrl: 'http://localhost:8080',
        serverAddress: 'new.example.com:443',
        isDefault: false,
      };
      mtServerService.createServer.mockResolvedValue(mockMtServer);

      const result = await controller.createServer(mockTenantId, createDto);

      expect(result).toEqual(mockMtServer);
      expect(mtServerService.createServer).toHaveBeenCalledWith(mockTenantId, createDto);
    });
  });

  describe('updateServer', () => {
    it('应该更新服务器', async () => {
      const updateDto: UpdateMtServerRequestDto = {
        displayName: 'Updated Server Name',
      };
      mtServerService.updateServer.mockResolvedValue({
        ...mockMtServer,
        displayName: 'Updated Server Name',
      });

      const result = await controller.updateServer(mockTenantId, mockServerId, updateDto);

      expect(result.displayName).toBe('Updated Server Name');
      expect(mtServerService.updateServer).toHaveBeenCalledWith(
        mockTenantId,
        mockServerId,
        updateDto,
      );
    });
  });

  describe('deleteServer', () => {
    it('应该删除服务器', async () => {
      mtServerService.deleteServer.mockResolvedValue(undefined);

      await controller.deleteServer(mockTenantId, mockServerId);

      expect(mtServerService.deleteServer).toHaveBeenCalledWith(mockTenantId, mockServerId);
    });
  });

  describe('testConnection', () => {
    it('应该返回连接测试结果 - 成功', async () => {
      mtServerService.testConnection.mockResolvedValue(mockConnectionTestResult);

      const result = await controller.testConnection(mockTenantId, mockServerId);

      expect(result.success).toBe(true);
      expect(result.latency).toBe(50);
      expect(mtServerService.testConnection).toHaveBeenCalledWith(mockTenantId, mockServerId);
    });

    it('应该返回连接测试结果 - 失败', async () => {
      const failedResult: ConnectionTestResult = {
        success: false,
        latency: 0,
        error: '连接超时',
      };
      mtServerService.testConnection.mockResolvedValue(failedResult);

      const result = await controller.testConnection(mockTenantId, mockServerId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('连接超时');
    });
  });

  describe('setDefault', () => {
    it('应该设置默认服务器', async () => {
      const updatedServer = { ...mockMtServer, isDefault: true };
      mtServerService.setDefaultServer.mockResolvedValue(updatedServer);

      const result = await controller.setDefault(mockTenantId, mockServerId);

      expect(result.isDefault).toBe(true);
      expect(mtServerService.setDefaultServer).toHaveBeenCalledWith(mockTenantId, mockServerId);
    });
  });

  describe('toggleStatus', () => {
    it('应该切换服务器启用状态 - 启用', async () => {
      const enabledServer = { ...mockMtServer, isActive: true };
      mtServerService.toggleServerStatus.mockResolvedValue(enabledServer);

      const result = await controller.toggleStatus(mockTenantId, mockServerId, { isActive: true });

      expect(result.isActive).toBe(true);
      expect(mtServerService.toggleServerStatus).toHaveBeenCalledWith(
        mockTenantId,
        mockServerId,
        true,
      );
    });

    it('应该切换服务器启用状态 - 禁用', async () => {
      const disabledServer = { ...mockMtServer, isActive: false };
      mtServerService.toggleServerStatus.mockResolvedValue(disabledServer);

      const result = await controller.toggleStatus(mockTenantId, mockServerId, { isActive: false });

      expect(result.isActive).toBe(false);
      expect(mtServerService.toggleServerStatus).toHaveBeenCalledWith(
        mockTenantId,
        mockServerId,
        false,
      );
    });
  });

  describe('getDefaultServer', () => {
    it('应该返回默认服务器', async () => {
      mtServerService.getDefaultServer.mockResolvedValue(mockMtServer);

      const result = await controller.getDefaultServer(mockTenantId);

      expect(result).toEqual(mockMtServer);
      expect(mtServerService.getDefaultServer).toHaveBeenCalledWith(mockTenantId);
    });

    it('应该返回 null 当没有默认服务器时', async () => {
      mtServerService.getDefaultServer.mockResolvedValue(null);

      const result = await controller.getDefaultServer(mockTenantId);

      expect(result).toBeNull();
    });
  });
});
