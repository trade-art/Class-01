import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  MtServerService,
  MtServerDto,
} from '../middleware-proxy/services/mt-server.service';
import { AdapterFactory } from '../middleware-proxy/adapters/adapter.factory';
import { PlatformType } from '../middleware-proxy/adapters/types';

describe('HealthService', () => {
  let service: HealthService;
  let mockPrismaService: {
    tenant: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    mtServer: {
      findMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
  };
  let mockMtServerService: jest.Mocked<MtServerService>;
  let mockAdapterFactory: jest.Mocked<AdapterFactory>;

  const mockTenant = {
    id: 'tenant-1',
    name: 'Test Tenant',
    status: 'ACTIVE',
  };

  const mockServer: MtServerDto = {
    id: 'server-1',
    serverId: 'mt5-server-1',
    displayName: 'MT5 Demo Server',
    platformType: PlatformType.MT5,
    middlewareUrl: 'http://localhost:8080',
    serverAddress: 'demo.mt5server.com:443',
    managerLogin: '12345',
    isActive: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockAdapter = {
    platformType: PlatformType.MT5,
    testConnection: jest.fn(),
    getServerStatus: jest.fn(),
  };

  beforeEach(async () => {
    mockPrismaService = {
      tenant: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      mtServer: {
        findMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    mockMtServerService = {
      getServers: jest.fn(),
      getServer: jest.fn(),
      getServerConfig: jest.fn(),
      getActiveServers: jest.fn(),
      getDefaultServer: jest.fn(),
      getDefaultServerConfig: jest.fn(),
      createServer: jest.fn(),
      updateServer: jest.fn(),
      deleteServer: jest.fn(),
      toggleServerStatus: jest.fn(),
      setDefaultServer: jest.fn(),
    } as unknown as jest.Mocked<MtServerService>;

    mockAdapterFactory = {
      getAdapter: jest.fn().mockResolvedValue(mockAdapter),
      getCircuitBreakerStatus: jest.fn(),
      resetCircuitBreaker: jest.fn(),
      removeAdapter: jest.fn(),
      removeAdaptersByTenant: jest.fn(),
      getStats: jest.fn(),
    } as unknown as jest.Mocked<AdapterFactory>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MtServerService, useValue: mockMtServerService },
        { provide: AdapterFactory, useValue: mockAdapterFactory },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe('isHealthy (K8s liveness probe)', () => {
    it('数据库连接正常时应返回 true', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await service.isHealthy();

      expect(result).toBe(true);
      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
    });

    it('数据库连接失败时应返回 false', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(new Error('Connection failed'));

      const result = await service.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe('isReady (K8s readiness probe)', () => {
    it('数据库正常且有健康服务器时应返回 true', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockPrismaService.tenant.findMany.mockResolvedValue([mockTenant]);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrismaService.mtServer.findMany.mockResolvedValue([mockServer]);
      mockMtServerService.getServers.mockResolvedValue({
        servers: [mockServer],
        total: 1,
      });
      mockMtServerService.getServer.mockResolvedValue(mockServer);
      mockMtServerService.getServerConfig.mockResolvedValue({
        tenantId: 'tenant-1',
        serverId: 'mt5-server-1',
        platformType: PlatformType.MT5,
        middlewareUrl: 'http://localhost:8080',
        serverAddress: 'demo.mt5server.com:443',
        managerLogin: 12345,
        managerPassword: 'password123',
      });
      mockAdapter.testConnection.mockResolvedValue(true);
      mockAdapter.getServerStatus.mockResolvedValue({
        online: true,
        serverTime: new Date(),
        version: '5.0.0',
        connectedUsers: 100,
        activePositions: 500,
      });

      const result = await service.isReady();

      expect(result).toBe(true);
    });

    it('没有服务器时也应返回 true', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockPrismaService.tenant.findMany.mockResolvedValue([]);
      mockPrismaService.mtServer.findMany.mockResolvedValue([]);

      const result = await service.isReady();

      expect(result).toBe(true);
    });

    it('数据库连接失败时应返回 false', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(new Error('Connection failed'));

      const result = await service.isReady();

      expect(result).toBe(false);
    });
  });

  describe('getSystemHealth', () => {
    beforeEach(() => {
      mockPrismaService.tenant.findMany.mockResolvedValue([mockTenant]);
      mockPrismaService.mtServer.findMany.mockResolvedValue([mockServer]);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockMtServerService.getServers.mockResolvedValue({
        servers: [mockServer],
        total: 1,
      });
      mockMtServerService.getServer.mockResolvedValue(mockServer);
      mockMtServerService.getServerConfig.mockResolvedValue({
        tenantId: 'tenant-1',
        serverId: 'mt5-server-1',
        platformType: PlatformType.MT5,
        middlewareUrl: 'http://localhost:8080',
        serverAddress: 'demo.mt5server.com:443',
        managerLogin: 12345,
        managerPassword: 'password123',
      });
    });

    it('所有服务器健康时应返回 healthy 状态', async () => {
      mockAdapter.testConnection.mockResolvedValue(true);
      mockAdapter.getServerStatus.mockResolvedValue({
        online: true,
        serverTime: new Date(),
        version: '5.0.0',
        connectedUsers: 100,
        activePositions: 500,
      });

      const result = await service.getSystemHealth();

      expect(result.status).toBe('healthy');
      expect(result.healthyServers).toBe(1);
      expect(result.unhealthyServers).toBe(0);
      expect(result.totalTenants).toBe(1);
      expect(result.totalServers).toBe(1);
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('部分服务器不健康时应返回 degraded 状态', async () => {
      const secondServer: MtServerDto = {
        ...mockServer,
        id: 'server-2',
        serverId: 'mt5-server-2',
        displayName: 'MT5 Server 2',
      };
      mockPrismaService.mtServer.findMany.mockResolvedValue([mockServer, secondServer]);
      mockMtServerService.getServers.mockResolvedValue({
        servers: [mockServer, secondServer],
        total: 2,
      });

      let callCount = 0;
      mockMtServerService.getServer.mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? mockServer : secondServer;
      });

      mockAdapter.testConnection
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      mockAdapter.getServerStatus
        .mockResolvedValueOnce({
          online: true,
          serverTime: new Date(),
          version: '5.0.0',
          connectedUsers: 100,
          activePositions: 500,
        })
        .mockResolvedValueOnce(null);

      const result = await service.getSystemHealth();

      expect(result.status).toBe('degraded');
      expect(result.healthyServers).toBeGreaterThanOrEqual(0);
    });

    it('includeDetails=true 时应包含租户详情', async () => {
      mockAdapter.testConnection.mockResolvedValue(true);
      mockAdapter.getServerStatus.mockResolvedValue({
        online: true,
        serverTime: new Date(),
        version: '5.0.0',
        connectedUsers: 100,
        activePositions: 500,
      });

      const result = await service.getSystemHealth(true);

      expect(result.tenants).toBeDefined();
      expect(result.tenants).toHaveLength(1);
      expect(result.tenants![0].tenantId).toBe('tenant-1');
    });

    it('includeDetails=false 时不应包含租户详情', async () => {
      mockAdapter.testConnection.mockResolvedValue(true);
      mockAdapter.getServerStatus.mockResolvedValue({
        online: true,
        serverTime: new Date(),
        version: '5.0.0',
        connectedUsers: 100,
        activePositions: 500,
      });

      const result = await service.getSystemHealth(false);

      expect(result.tenants).toBeUndefined();
    });
  });

  describe('getTenantHealth', () => {
    beforeEach(() => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockMtServerService.getServers.mockResolvedValue({
        servers: [mockServer],
        total: 1,
      });
      mockMtServerService.getServer.mockResolvedValue(mockServer);
      mockMtServerService.getServerConfig.mockResolvedValue({
        tenantId: 'tenant-1',
        serverId: 'mt5-server-1',
        platformType: PlatformType.MT5,
        middlewareUrl: 'http://localhost:8080',
        serverAddress: 'demo.mt5server.com:443',
        managerLogin: 12345,
        managerPassword: 'password123',
      });
    });

    it('应该返回租户健康状态', async () => {
      mockAdapter.testConnection.mockResolvedValue(true);
      mockAdapter.getServerStatus.mockResolvedValue({
        online: true,
        serverTime: new Date(),
        version: '5.0.0',
        connectedUsers: 100,
        activePositions: 500,
      });

      const result = await service.getTenantHealth('tenant-1');

      expect(result.tenantId).toBe('tenant-1');
      expect(result.tenantName).toBe('Test Tenant');
      expect(result.status).toBe('healthy');
      expect(result.servers).toHaveLength(1);
      expect(result.healthyCount).toBe(1);
      expect(result.unhealthyCount).toBe(0);
    });

    it('租户不存在时应抛出错误', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getTenantHealth('non-existent')).rejects.toThrow(
        '租户 non-existent 不存在',
      );
    });

    it('没有活跃服务器时状态应为 unhealthy', async () => {
      mockMtServerService.getServers.mockResolvedValue({
        servers: [],
        total: 0,
      });

      const result = await service.getTenantHealth('tenant-1');

      expect(result.status).toBe('unhealthy');
      expect(result.servers).toHaveLength(0);
      expect(result.healthyCount).toBe(0);
    });
  });

  describe('checkServerHealth', () => {
    beforeEach(() => {
      mockMtServerService.getServer.mockResolvedValue(mockServer);
      mockMtServerService.getServerConfig.mockResolvedValue({
        tenantId: 'tenant-1',
        serverId: 'mt5-server-1',
        platformType: PlatformType.MT5,
        middlewareUrl: 'http://localhost:8080',
        serverAddress: 'demo.mt5server.com:443',
        managerLogin: 12345,
        managerPassword: 'password123',
      });
    });

    it('服务器连接正常时应返回 healthy', async () => {
      mockAdapter.testConnection.mockResolvedValue(true);
      mockAdapter.getServerStatus.mockResolvedValue({
        online: true,
        serverTime: new Date(),
        version: '5.0.0',
        connectedUsers: 100,
        activePositions: 500,
      });

      const result = await service.checkServerHealth('tenant-1', 'mt5-server-1');

      expect(result.status).toBe('healthy');
      expect(result.online).toBe(true);
      expect(result.serverId).toBe('mt5-server-1');
      expect(result.displayName).toBe('MT5 Demo Server');
      expect(result.version).toBe('5.0.0');
      expect(result.connectedUsers).toBe(100);
      expect(result.responseTime).toBeDefined();
    });

    it('服务器连接失败时应返回 unhealthy', async () => {
      mockAdapter.testConnection.mockResolvedValue(false);
      mockAdapter.getServerStatus.mockResolvedValue(null);

      const result = await service.checkServerHealth('tenant-1', 'mt5-server-1');

      expect(result.status).toBe('unhealthy');
      expect(result.online).toBe(false);
    });

    it('获取适配器失败时应返回 unhealthy 并包含错误信息', async () => {
      mockAdapterFactory.getAdapter.mockRejectedValue(
        new Error('Middleware unreachable'),
      );

      const result = await service.checkServerHealth('tenant-1', 'mt5-server-1');

      expect(result.status).toBe('unhealthy');
      expect(result.online).toBe(false);
      expect(result.errorMessage).toBe('Middleware unreachable');
    });

    it('应该缓存健康状态', async () => {
      mockAdapter.testConnection.mockResolvedValue(true);
      mockAdapter.getServerStatus.mockResolvedValue({
        online: true,
        serverTime: new Date(),
        version: '5.0.0',
        connectedUsers: 100,
        activePositions: 500,
      });

      // 第一次调用
      await service.checkServerHealth('tenant-1', 'mt5-server-1');

      // 第二次调用（应该使用缓存）
      await service.checkServerHealth('tenant-1', 'mt5-server-1');

      // 适配器只应该被调用一次（第二次使用缓存）
      expect(mockAdapterFactory.getAdapter).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAllServersHealth', () => {
    it('应该返回所有活跃服务器的健康状态', async () => {
      mockPrismaService.mtServer.findMany.mockResolvedValue([
        { tenantId: 'tenant-1', serverId: 'server-1' },
        { tenantId: 'tenant-1', serverId: 'server-2' },
      ]);
      mockMtServerService.getServer.mockResolvedValue(mockServer);
      mockMtServerService.getServerConfig.mockResolvedValue({
        tenantId: 'tenant-1',
        serverId: 'mt5-server-1',
        platformType: PlatformType.MT5,
        middlewareUrl: 'http://localhost:8080',
        serverAddress: 'demo.mt5server.com:443',
        managerLogin: 12345,
        managerPassword: 'password123',
      });
      mockAdapter.testConnection.mockResolvedValue(true);
      mockAdapter.getServerStatus.mockResolvedValue({
        online: true,
        serverTime: new Date(),
        version: '5.0.0',
        connectedUsers: 100,
        activePositions: 500,
      });

      const result = await service.getAllServersHealth();

      expect(result).toHaveLength(2);
    });
  });

  describe('getCircuitBreakerStatus', () => {
    it('应该返回熔断器状态', async () => {
      mockAdapterFactory.getCircuitBreakerStatus.mockReturnValue({
        state: 'closed',
        failureCount: 0,
        lastSuccess: new Date(),
      });

      const result = await service.getCircuitBreakerStatus('tenant-1', 'server-1');

      expect(result.tenantId).toBe('tenant-1');
      expect(result.serverId).toBe('server-1');
      expect(result.state).toBe('closed');
      expect(result.failureCount).toBe(0);
    });

    it('熔断器不存在时应返回默认 closed 状态', async () => {
      mockAdapterFactory.getCircuitBreakerStatus.mockReturnValue(null);

      const result = await service.getCircuitBreakerStatus('tenant-1', 'server-1');

      expect(result.state).toBe('closed');
      expect(result.failureCount).toBe(0);
    });

    it('熔断器打开时应返回 open 状态', async () => {
      mockAdapterFactory.getCircuitBreakerStatus.mockReturnValue({
        state: 'open',
        failureCount: 5,
        lastFailure: new Date(),
      });

      const result = await service.getCircuitBreakerStatus('tenant-1', 'server-1');

      expect(result.state).toBe('open');
      expect(result.failureCount).toBe(5);
    });
  });

  describe('resetCircuitBreaker', () => {
    it('应该成功重置熔断器', async () => {
      mockAdapterFactory.resetCircuitBreaker.mockReturnValue(undefined);

      const result = await service.resetCircuitBreaker('tenant-1', 'server-1');

      expect(result).toBe(true);
      expect(mockAdapterFactory.resetCircuitBreaker).toHaveBeenCalledWith(
        'tenant-1',
        'server-1',
      );
    });

    it('重置失败时应返回 false', async () => {
      mockAdapterFactory.resetCircuitBreaker.mockImplementation(() => {
        throw new Error('Reset failed');
      });

      const result = await service.resetCircuitBreaker('tenant-1', 'server-1');

      expect(result).toBe(false);
    });
  });

  describe('getAllCircuitBreakerStatus', () => {
    it('应该返回所有熔断器状态', async () => {
      mockPrismaService.mtServer.findMany.mockResolvedValue([
        { tenantId: 'tenant-1', serverId: 'server-1' },
        { tenantId: 'tenant-2', serverId: 'server-2' },
      ]);
      mockAdapterFactory.getCircuitBreakerStatus
        .mockReturnValueOnce({
          state: 'closed',
          failureCount: 0,
        })
        .mockReturnValueOnce({
          state: 'open',
          failureCount: 5,
        });

      const result = await service.getAllCircuitBreakerStatus();

      expect(result).toHaveLength(2);
      expect(result[0].state).toBe('closed');
      expect(result[1].state).toBe('open');
    });
  });

  describe('clearHealthCache', () => {
    it('应该清除健康缓存', async () => {
      // 先填充缓存
      mockMtServerService.getServer.mockResolvedValue(mockServer);
      mockMtServerService.getServerConfig.mockResolvedValue({
        tenantId: 'tenant-1',
        serverId: 'mt5-server-1',
        platformType: PlatformType.MT5,
        middlewareUrl: 'http://localhost:8080',
        serverAddress: 'demo.mt5server.com:443',
        managerLogin: 12345,
        managerPassword: 'password123',
      });
      mockAdapter.testConnection.mockResolvedValue(true);
      mockAdapter.getServerStatus.mockResolvedValue({
        online: true,
        serverTime: new Date(),
        version: '5.0.0',
        connectedUsers: 100,
        activePositions: 500,
      });

      await service.checkServerHealth('tenant-1', 'mt5-server-1');

      // 清除缓存
      service.clearHealthCache();

      // 再次检查应该重新调用适配器
      await service.checkServerHealth('tenant-1', 'mt5-server-1');

      expect(mockAdapterFactory.getAdapter).toHaveBeenCalledTimes(2);
    });
  });

  describe('determineHealthStatus (通过 checkServerHealth 间接测试)', () => {
    beforeEach(() => {
      mockMtServerService.getServer.mockResolvedValue(mockServer);
      mockMtServerService.getServerConfig.mockResolvedValue({
        tenantId: 'tenant-1',
        serverId: 'mt5-server-1',
        platformType: PlatformType.MT5,
        middlewareUrl: 'http://localhost:8080',
        serverAddress: 'demo.mt5server.com:443',
        managerLogin: 12345,
        managerPassword: 'password123',
      });
    });

    it('连接正常且响应快时应返回 healthy', async () => {
      mockAdapter.testConnection.mockResolvedValue(true);
      mockAdapter.getServerStatus.mockResolvedValue({
        online: true,
        serverTime: new Date(),
        version: '5.0.0',
        connectedUsers: 100,
        activePositions: 500,
      });

      const result = await service.checkServerHealth('tenant-1', 'mt5-server-1');

      expect(result.status).toBe('healthy');
    });

    it('连接失败时应返回 unhealthy', async () => {
      mockAdapter.testConnection.mockResolvedValue(false);
      mockAdapter.getServerStatus.mockResolvedValue(null);

      // 清除缓存以确保重新检查
      service.clearHealthCache();

      const result = await service.checkServerHealth('tenant-1', 'mt5-server-1');

      expect(result.status).toBe('unhealthy');
    });
  });
});
