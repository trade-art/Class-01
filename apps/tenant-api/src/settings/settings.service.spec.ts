import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { MiddlewareProxyService } from '../middleware-proxy';
import { TenantRole } from '@prisma/client';
import { AdminRole, ApiKeyPermission } from './dto';

// Mock bcrypt
jest.mock('bcrypt');

describe('SettingsService', () => {
  let service: SettingsService;

  const mockPrismaService = {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tenantAdmin: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    apiKey: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    notificationSetting: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const mockMiddlewareProxyService = {
    request: jest.fn(),
  };

  const mockTenantId = 'tenant-1';

  const mockTenant = {
    id: 'tenant-1',
    name: 'Test Tenant',
    displayName: 'Test Display Name',
    logo: 'https://example.com/logo.png',
    primaryColor: '#007bff',
    isActive: true,
  };

  const mockAdmin = {
    id: 'admin-1',
    email: 'admin@test.com',
    name: 'Test Admin',
    role: TenantRole.ADMIN,
    isActive: true,
    tenantId: 'tenant-1',
    lastLogin: new Date('2024-01-15T10:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };

  const mockApiKey = {
    id: 'key-1',
    name: 'Test API Key',
    key: 'mt5_abc1234567890',
    hashedKey: 'hashedkey',
    permissions: ['read', 'write'],
    isActive: true,
    tenantId: 'tenant-1',
    lastUsedAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };

  const mockNotificationSettings = {
    tenantId: 'tenant-1',
    riskAlertEmail: true,
    systemAlertEmail: true,
    webhookUrl: null,
    webhookEnabled: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MiddlewareProxyService, useValue: mockMiddlewareProxyService },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBranding', () => {
    it('应该返回租户品牌设置', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);

      const result = await service.getBranding(mockTenantId);

      expect(result).toEqual({
        displayName: mockTenant.displayName,
        logo: mockTenant.logo,
        primaryColor: mockTenant.primaryColor,
      });
    });

    it('租户不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getBranding('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateBranding', () => {
    it('应该成功更新品牌设置', async () => {
      mockPrismaService.tenant.update.mockResolvedValue({
        ...mockTenant,
        displayName: 'New Display Name',
      });

      const result = await service.updateBranding(mockTenantId, {
        displayName: 'New Display Name',
      });

      expect(result.displayName).toBe('New Display Name');
      expect(mockPrismaService.tenant.update).toHaveBeenCalled();
    });
  });

  describe('getAdmins', () => {
    it('应该返回管理员列表', async () => {
      mockPrismaService.tenantAdmin.findMany.mockResolvedValue([mockAdmin]);

      const result = await service.getAdmins(mockTenantId);

      expect(result).toHaveProperty('admins');
      expect(result).toHaveProperty('total', 1);
      expect(result.admins).toHaveLength(1);
      expect(result.admins[0].email).toBe('admin@test.com');
      expect(result.admins[0].role).toBe(AdminRole.ADMIN);
    });

    it('没有管理员时应返回空列表', async () => {
      mockPrismaService.tenantAdmin.findMany.mockResolvedValue([]);

      const result = await service.getAdmins(mockTenantId);

      expect(result.admins).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('createAdmin', () => {
    it('应该成功创建管理员', async () => {
      mockPrismaService.tenantAdmin.findFirst.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedpassword');
      mockPrismaService.tenantAdmin.create.mockResolvedValue({
        ...mockAdmin,
        id: 'new-admin-1',
        email: 'new@test.com',
      });

      const result = await service.createAdmin(mockTenantId, {
        email: 'new@test.com',
        password: 'password123',
        name: 'New Admin',
        role: AdminRole.ADMIN,
      });

      expect(result.email).toBe('new@test.com');
      expect(mockPrismaService.tenantAdmin.create).toHaveBeenCalled();
    });

    it('邮箱已存在时应抛出 ConflictException', async () => {
      mockPrismaService.tenantAdmin.findFirst.mockResolvedValue(mockAdmin);

      await expect(
        service.createAdmin(mockTenantId, {
          email: 'admin@test.com',
          password: 'password123',
          name: 'New Admin',
          role: AdminRole.ADMIN,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateAdmin', () => {
    it('应该成功更新管理员', async () => {
      mockPrismaService.tenantAdmin.findFirst.mockResolvedValue(mockAdmin);
      mockPrismaService.tenantAdmin.update.mockResolvedValue({
        ...mockAdmin,
        name: 'Updated Admin',
      });

      const result = await service.updateAdmin(
        mockTenantId,
        'admin-1',
        'current-admin-id',
        { name: 'Updated Admin' },
      );

      expect(result.name).toBe('Updated Admin');
    });

    it('管理员不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.tenantAdmin.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAdmin(mockTenantId, 'non-existent', 'current-admin', {
          name: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('不能修改自己的角色', async () => {
      mockPrismaService.tenantAdmin.findFirst.mockResolvedValue(mockAdmin);

      await expect(
        service.updateAdmin(mockTenantId, 'admin-1', 'admin-1', {
          role: AdminRole.OPERATOR,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteAdmin', () => {
    it('应该成功删除管理员', async () => {
      const adminToDelete = { ...mockAdmin, role: TenantRole.OPERATOR };
      mockPrismaService.tenantAdmin.findFirst.mockResolvedValue(adminToDelete);
      mockPrismaService.tenantAdmin.delete.mockResolvedValue(adminToDelete);

      await service.deleteAdmin(mockTenantId, 'admin-1', 'current-admin-id');

      expect(mockPrismaService.tenantAdmin.delete).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
      });
    });

    it('管理员不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.tenantAdmin.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteAdmin(mockTenantId, 'non-existent', 'current-admin'),
      ).rejects.toThrow(NotFoundException);
    });

    it('不能删除自己', async () => {
      mockPrismaService.tenantAdmin.findFirst.mockResolvedValue(mockAdmin);

      await expect(
        service.deleteAdmin(mockTenantId, 'admin-1', 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('不能删除最后一个 OWNER', async () => {
      const ownerAdmin = { ...mockAdmin, role: TenantRole.OWNER };
      mockPrismaService.tenantAdmin.findFirst.mockResolvedValue(ownerAdmin);
      mockPrismaService.tenantAdmin.count.mockResolvedValue(1);

      await expect(
        service.deleteAdmin(mockTenantId, 'admin-1', 'other-admin'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getApiKeys', () => {
    it('应该返回 API Key 列表', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue([mockApiKey]);

      const result = await service.getApiKeys(mockTenantId);

      expect(result).toHaveProperty('apiKeys');
      expect(result).toHaveProperty('total', 1);
      expect(result.apiKeys).toHaveLength(1);
      expect(result.apiKeys[0].name).toBe('Test API Key');
      expect(result.apiKeys[0].keyPrefix).toBe('mt5_abc1****');
    });
  });

  describe('createApiKey', () => {
    it('应该成功创建 API Key', async () => {
      mockPrismaService.apiKey.create.mockResolvedValue(mockApiKey);

      const result = await service.createApiKey(mockTenantId, {
        name: 'New API Key',
        permissions: [ApiKeyPermission.READ],
      });

      expect(result.name).toBe('Test API Key');
      expect(result.apiKey).toBeDefined();
      expect(mockPrismaService.apiKey.create).toHaveBeenCalled();
    });
  });

  describe('toggleApiKeyStatus', () => {
    it('应该成功禁用 API Key', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(mockApiKey);
      mockPrismaService.apiKey.update.mockResolvedValue({
        ...mockApiKey,
        isActive: false,
      });

      const result = await service.toggleApiKeyStatus(
        mockTenantId,
        'key-1',
        false,
      );

      expect(result.isActive).toBe(false);
      expect(mockPrismaService.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { isActive: false },
      });
    });

    it('应该成功启用 API Key', async () => {
      const inactiveKey = { ...mockApiKey, isActive: false };
      mockPrismaService.apiKey.findFirst.mockResolvedValue(inactiveKey);
      mockPrismaService.apiKey.update.mockResolvedValue({
        ...inactiveKey,
        isActive: true,
      });

      const result = await service.toggleApiKeyStatus(
        mockTenantId,
        'key-1',
        true,
      );

      expect(result.isActive).toBe(true);
    });

    it('API Key 不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(null);

      await expect(
        service.toggleApiKeyStatus(mockTenantId, 'non-existent', false),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteApiKey', () => {
    it('应该成功删除 API Key', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(mockApiKey);
      mockPrismaService.apiKey.delete.mockResolvedValue(mockApiKey);

      await service.deleteApiKey(mockTenantId, 'key-1');

      expect(mockPrismaService.apiKey.delete).toHaveBeenCalledWith({
        where: { id: 'key-1' },
      });
    });

    it('API Key 不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteApiKey(mockTenantId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getNotificationSettings', () => {
    it('应该返回通知设置', async () => {
      mockPrismaService.notificationSetting.findUnique.mockResolvedValue(
        mockNotificationSettings,
      );

      const result = await service.getNotificationSettings(mockTenantId);

      expect(result.riskAlertEmail).toBe(true);
      expect(result.systemAlertEmail).toBe(true);
      expect(result.webhookEnabled).toBe(false);
    });

    it('没有设置时应创建默认设置', async () => {
      mockPrismaService.notificationSetting.findUnique.mockResolvedValue(null);
      mockPrismaService.notificationSetting.create.mockResolvedValue(
        mockNotificationSettings,
      );

      const result = await service.getNotificationSettings(mockTenantId);

      expect(mockPrismaService.notificationSetting.create).toHaveBeenCalled();
      expect(result.riskAlertEmail).toBe(true);
    });
  });

  describe('updateNotificationSettings', () => {
    it('应该更新通知设置', async () => {
      const updatedSettings = {
        ...mockNotificationSettings,
        webhookUrl: 'https://webhook.example.com',
        webhookEnabled: true,
      };
      mockPrismaService.notificationSetting.upsert.mockResolvedValue(
        updatedSettings,
      );

      const result = await service.updateNotificationSettings(mockTenantId, {
        webhookUrl: 'https://webhook.example.com',
        webhookEnabled: true,
      });

      expect(result.webhookUrl).toBe('https://webhook.example.com');
      expect(result.webhookEnabled).toBe(true);
    });
  });

  describe('getMT5ServerInfo', () => {
    it('应该返回 MT5 服务器信息', async () => {
      const mockHealth = {
        serverName: 'MT5 Demo Server',
        connected: true,
        lastHeartbeat: '2024-01-15T10:00:00Z',
        latency: 50,
        version: '5.0.0',
      };
      mockMiddlewareProxyService.request.mockResolvedValue(mockHealth);

      const result = await service.getMT5ServerInfo('instance-1');

      expect(result.serverName).toBe('MT5 Demo Server');
      expect(result.connected).toBe(true);
      expect(result.latency).toBe(50);
    });

    it('获取失败时应返回默认值', async () => {
      mockMiddlewareProxyService.request.mockRejectedValue(
        new Error('Connection failed'),
      );

      const result = await service.getMT5ServerInfo('instance-1');

      expect(result.serverName).toBe('MT5 Server');
      expect(result.connected).toBe(false);
      expect(result.version).toBe('Unknown');
    });
  });
});
