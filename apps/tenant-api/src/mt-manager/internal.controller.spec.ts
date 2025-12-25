import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { MtManagerService } from './mt-manager.service';

describe('InternalController', () => {
  let controller: InternalController;
  let mtManagerService: jest.Mocked<MtManagerService>;
  let configService: jest.Mocked<ConfigService>;

  const mockInternalSecret = 'test-internal-secret-123';
  const mockMiddlewareId = 'middleware-uuid-123';

  const mockManagerList = {
    managers: [
      {
        managerId: 'manager-uuid-1',
        tenantId: 'tenant-uuid-1',
        mtServerId: 'server-1',
        serverAddress: 'mt5.example.com:443',
        managerLogin: '12345',
        encryptedPassword: 'encrypted-password-1',
      },
      {
        managerId: 'manager-uuid-2',
        tenantId: 'tenant-uuid-1',
        mtServerId: 'server-1',
        serverAddress: 'mt5.example.com:443',
        managerLogin: '12346',
        encryptedPassword: 'encrypted-password-2',
      },
    ],
    total: 2,
  };

  beforeEach(async () => {
    const mockMtManagerService = {
      findByMiddlewareId: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'INTERNAL_API_SECRET') {
          return mockInternalSecret;
        }
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [
        {
          provide: MtManagerService,
          useValue: mockMtManagerService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<InternalController>(InternalController);
    mtManagerService = module.get(MtManagerService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getManagers', () => {
    it('应该返回经理账号列表 - 有效的内部密钥', async () => {
      mtManagerService.findByMiddlewareId.mockResolvedValue(mockManagerList);

      const result = await controller.getManagers(
        mockInternalSecret,
        mockMiddlewareId,
      );

      expect(result.total).toBe(2);
      expect(result.managers).toHaveLength(2);
      expect(result.managers[0].managerId).toBe('manager-uuid-1');
      expect(result.managers[0].managerLogin).toBe('12345');
      expect(mtManagerService.findByMiddlewareId).toHaveBeenCalledWith(
        mockMiddlewareId,
      );
    });

    it('应该抛出 UnauthorizedException - 缺少内部密钥', async () => {
      await expect(
        controller.getManagers('', mockMiddlewareId),
      ).rejects.toThrow(UnauthorizedException);

      expect(mtManagerService.findByMiddlewareId).not.toHaveBeenCalled();
    });

    it('应该抛出 UnauthorizedException - 无效的内部密钥', async () => {
      await expect(
        controller.getManagers('invalid-secret', mockMiddlewareId),
      ).rejects.toThrow(UnauthorizedException);

      expect(mtManagerService.findByMiddlewareId).not.toHaveBeenCalled();
    });

    it('应该抛出 UnauthorizedException - 缺少 middlewareId 参数', async () => {
      await expect(
        controller.getManagers(mockInternalSecret, ''),
      ).rejects.toThrow(UnauthorizedException);

      expect(mtManagerService.findByMiddlewareId).not.toHaveBeenCalled();
    });

    it('应该抛出 UnauthorizedException - middlewareId 为 undefined', async () => {
      await expect(
        controller.getManagers(mockInternalSecret, undefined as unknown as string),
      ).rejects.toThrow(UnauthorizedException);

      expect(mtManagerService.findByMiddlewareId).not.toHaveBeenCalled();
    });

    it('应该返回空列表 - 中间件没有关联的经理账号', async () => {
      mtManagerService.findByMiddlewareId.mockResolvedValue({
        managers: [],
        total: 0,
      });

      const result = await controller.getManagers(
        mockInternalSecret,
        mockMiddlewareId,
      );

      expect(result.total).toBe(0);
      expect(result.managers).toHaveLength(0);
      expect(mtManagerService.findByMiddlewareId).toHaveBeenCalledWith(
        mockMiddlewareId,
      );
    });

    it('应该正确映射响应字段', async () => {
      mtManagerService.findByMiddlewareId.mockResolvedValue(mockManagerList);

      const result = await controller.getManagers(
        mockInternalSecret,
        mockMiddlewareId,
      );

      const firstManager = result.managers[0];
      expect(firstManager).toHaveProperty('managerId');
      expect(firstManager).toHaveProperty('tenantId');
      expect(firstManager).toHaveProperty('mtServerId');
      expect(firstManager).toHaveProperty('serverAddress');
      expect(firstManager).toHaveProperty('managerLogin');
      expect(firstManager).toHaveProperty('encryptedPassword');
    });

    it('应该处理 service 抛出的错误', async () => {
      const error = new Error('Database connection failed');
      mtManagerService.findByMiddlewareId.mockRejectedValue(error);

      await expect(
        controller.getManagers(mockInternalSecret, mockMiddlewareId),
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('X-Internal-Secret 安全验证', () => {
    it('应该大小写敏感匹配密钥', async () => {
      // 假设配置的密钥是小写的
      await expect(
        controller.getManagers(mockInternalSecret.toUpperCase(), mockMiddlewareId),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('应该拒绝带有空格的密钥', async () => {
      await expect(
        controller.getManagers(` ${mockInternalSecret} `, mockMiddlewareId),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('应该拒绝 null 密钥', async () => {
      await expect(
        controller.getManagers(null as unknown as string, mockMiddlewareId),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
