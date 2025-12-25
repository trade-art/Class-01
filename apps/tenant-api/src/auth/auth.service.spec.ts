import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MtServerService } from '../middleware-proxy/services/mt-server.service';
import { AccountLockoutService } from '../security/account-lockout.service';
import { PasswordService } from '../security/password.service';
import { AuditLoggerService } from '../security/audit-logger.service';
import { MiddlewareAuthService } from '../middleware-proxy/services/middleware-auth.service';
import { TenantRole } from '@prisma/client';

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

  const mockAccountLockoutService = {
    getLockoutStatus: jest.fn().mockResolvedValue({
      isLocked: false,
      remainingAttempts: 5,
      lockoutUntil: null,
    }),
    recordFailedAttempt: jest.fn().mockResolvedValue({
      isLocked: false,
      remainingAttempts: 4,
      lockoutUntil: null,
    }),
    resetFailedAttempts: jest.fn().mockResolvedValue(undefined),
  };

  const mockPasswordService = {
    hashPassword: jest.fn().mockResolvedValue('hashed-password'),
    verifyPassword: jest.fn().mockResolvedValue(true),
    validatePassword: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
  };

  const mockAuditLoggerService = {
    logSecurityEvent: jest.fn(),
    logUserAction: jest.fn(),
    logAdminAction: jest.fn(),
    logLoginSuccess: jest.fn(),
    logLoginFailure: jest.fn(),
    logPasswordChange: jest.fn(),
  };

  const mockMiddlewareAuthService = {
    generateServiceToken: jest.fn().mockResolvedValue('mock-service-token'),
    generatePoolModeToken: jest.fn().mockResolvedValue('mock-pool-mode-token'),
    validateServiceToken: jest.fn().mockResolvedValue({ valid: true }),
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
    lastLoginIp: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    tenant: {
      id: 'tenant-1',
      name: 'Test Tenant',
      code: 'test-tenant',
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
        { provide: MiddlewareAuthService, useValue: mockMiddlewareAuthService },
        { provide: AccountLockoutService, useValue: mockAccountLockoutService },
        { provide: PasswordService, useValue: mockPasswordService },
        { provide: AuditLoggerService, useValue: mockAuditLoggerService },
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
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValue(mockAdmin);
      mockPrismaService.middlewareInstance.findMany.mockResolvedValue([
        { id: 'instance-1' },
      ]);
      mockPrismaService.tenantAdmin.update.mockResolvedValue(mockAdmin);
      mockPasswordService.verifyPassword.mockResolvedValue(true);
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
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@test.com', password: 'password' }),
      ).rejects.toThrow();
    });

    it('密码错误时应抛出异常', async () => {
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValue(mockAdmin);
      // 服务使用 passwordService.verifyPassword 而不是直接使用 bcrypt
      mockPasswordService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login({ email: 'admin@test.com', password: 'wrongpassword' }),
      ).rejects.toThrow();
    });

    it('账号被禁用时应抛出异常', async () => {
      const inactiveAdmin = { ...mockAdmin, isActive: false };
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValue(inactiveAdmin);
      mockPasswordService.verifyPassword.mockResolvedValue(true);

      await expect(
        service.login({ email: 'admin@test.com', password: 'password123' }),
      ).rejects.toThrow();
    });

    it('租户非激活状态时应抛出异常', async () => {
      const adminWithInactiveTenant = {
        ...mockAdmin,
        tenant: { ...mockAdmin.tenant, status: 'SUSPENDED' },
      };
      mockPrismaService.tenantAdmin.findUnique.mockResolvedValue(adminWithInactiveTenant);
      mockPasswordService.verifyPassword.mockResolvedValue(true);

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
      // 服务调用两次 verifyPassword:
      // 1. 验证当前密码 (应该返回 true)
      // 2. 检查新密码是否与旧密码相同 (应该返回 false)
      mockPasswordService.verifyPassword
        .mockResolvedValueOnce(true)  // 当前密码正确
        .mockResolvedValueOnce(false); // 新密码与旧密码不同
      mockPasswordService.hashPassword.mockResolvedValue('new-hashed-password');
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
      mockPasswordService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.changePassword('admin-1', {
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword456',
        }),
      ).rejects.toThrow();
    });
  });
});
