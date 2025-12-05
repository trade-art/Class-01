import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MtServerService } from '../middleware-proxy/services/mt-server.service';
import { TenantRole } from '@prisma/client';

// Mock bcrypt
jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    tenantAdmin: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    middlewareInstance: {
      findMany: jest.fn(),
    },
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'jwt.secret': 'test-secret',
        'jwt.refreshSecret': 'test-refresh-secret',
        'jwt.expiresIn': '24h',
        'jwt.refreshExpiresIn': '7d',
        'security.bcryptRounds': 10,
      };
      return config[key];
    }),
  };

  const mockMtServerService = {
    getDefaultServer: jest.fn().mockResolvedValue({
      serverId: 'default-server',
      platformType: 'MT5',
      isDefault: true,
    }),
    getServers: jest.fn().mockResolvedValue({ total: 0, servers: [] }),
  };

  const mockAdmin = {
    id: 'admin-1',
    email: 'admin@test.com',
    password: '$2b$10$hashedpassword',
    name: 'Test Admin',
    role: TenantRole.ADMIN,
    isActive: true,
    tenantId: 'tenant-1',
    lastLogin: null,
    tenant: {
      id: 'tenant-1',
      name: 'Test Tenant',
      status: 'ACTIVE',
      expiresAt: null,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MtServerService, useValue: mockMtServerService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('应该成功登录并返回 tokens', async () => {
      mockPrismaService.tenantAdmin.findMany.mockResolvedValue([mockAdmin]);
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([
        { id: 'instance-1' },
      ]);
      mockPrismaService.tenantAdmin.update.mockResolvedValue(mockAdmin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.signAsync.mockResolvedValue('test-token');

      const result = await service.login({
        email: 'admin@test.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('tokenType', 'Bearer');
      expect(mockPrismaService.tenantAdmin.update).toHaveBeenCalled();
    });

    it('用户不存在时应抛出异常', async () => {
      mockPrismaService.tenantAdmin.findMany.mockResolvedValue([]);

      await expect(
        service.login({ email: 'unknown@test.com', password: 'password' }),
      ).rejects.toThrow();
    });

    it('密码错误时应抛出异常', async () => {
      mockPrismaService.tenantAdmin.findMany.mockResolvedValue([mockAdmin]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'admin@test.com', password: 'wrongpassword' }),
      ).rejects.toThrow();
    });

    it('账号被禁用时应抛出异常', async () => {
      const inactiveAdmin = { ...mockAdmin, isActive: false };
      mockPrismaService.tenantAdmin.findMany.mockResolvedValue([inactiveAdmin]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ email: 'admin@test.com', password: 'password123' }),
      ).rejects.toThrow();
    });

    it('租户非激活状态时应抛出异常', async () => {
      const adminWithInactiveTenant = {
        ...mockAdmin,
        tenant: { ...mockAdmin.tenant, status: 'SUSPENDED' },
      };
      mockPrismaService.tenantAdmin.findMany.mockResolvedValue([
        adminWithInactiveTenant,
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ email: 'admin@test.com', password: 'password123' }),
      ).rejects.toThrow();
    });
  });

  describe('refreshToken', () => {
    it('应该成功刷新 token', async () => {
      const payload = {
        sub: 'admin-1',
        tenantId: 'tenant-1',
        role: 'admin',
      };
      mockJwtService.verify.mockReturnValue(payload);
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValue(mockAdmin);
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([
        { id: 'instance-1' },
      ]);
      mockJwtService.signAsync.mockResolvedValue('new-token');

      const result = await service.refreshToken('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('无效 token 应抛出异常', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshToken('invalid-token')).rejects.toThrow();
    });
  });

  describe('getCurrentUser', () => {
    it('应该返回当前用户信息', async () => {
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValue(mockAdmin);
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([
        { id: 'instance-1' },
      ]);

      const result = await service.getCurrentUser('admin-1');

      expect(result).toHaveProperty('id', 'admin-1');
      expect(result).toHaveProperty('email', 'admin@test.com');
      expect(result).toHaveProperty('tenantId', 'tenant-1');
    });

    it('用户不存在时应抛出异常', async () => {
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValue(null);

      await expect(service.getCurrentUser('non-existent')).rejects.toThrow();
    });
  });

  describe('changePassword', () => {
    it('应该成功修改密码', async () => {
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValue(mockAdmin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
      mockPrismaService.tenantAdmin.update.mockResolvedValue(mockAdmin);

      await expect(
        service.changePassword('admin-1', {
          currentPassword: 'password123',
          newPassword: 'newpassword456',
        }),
      ).resolves.not.toThrow();

      expect(mockPrismaService.tenantAdmin.update).toHaveBeenCalled();
    });

    it('当前密码错误时应抛出异常', async () => {
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValue(mockAdmin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('admin-1', {
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword456',
        }),
      ).rejects.toThrow();
    });
  });
});
