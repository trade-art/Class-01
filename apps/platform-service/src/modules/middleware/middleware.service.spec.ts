/**
 * MiddlewareService 单元测试
 *
 * 测试内容:
 * - CRUD 操作 (创建、查询、更新、删除)
 * - API Key 生成和验证
 * - 删除前依赖检查
 * - 健康状态更新
 *
 * saas-middleware-management Task 10.1
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { MiddlewareService } from './middleware.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { MiddlewareAssignmentMode, MiddlewareStatus } from '@prisma/client';

describe('MiddlewareService', () => {
  let service: MiddlewareService;
  let prisma: {
    middleware: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    middlewareAssignment: {
      count: jest.Mock;
    };
  };
  let encryptionService: {
    generateApiKey: jest.Mock;
    hash: jest.Mock;
    encrypt: jest.Mock;
    decrypt: jest.Mock;
  };

  const mockMiddleware = {
    id: 'test-middleware-id',
    name: 'Test Middleware',
    description: 'Test Description',
    url: 'http://localhost:8080',
    apiKey: 'mw_test_api_key_12345',
    apiKeyHash: 'hashed_api_key',
    assignmentMode: MiddlewareAssignmentMode.SHARED,
    maxTenants: 10,
    status: MiddlewareStatus.ONLINE,
    lastHeartbeat: new Date(),
    serverIp: '192.168.1.100',
    activeSessions: 5,
    memoryUsage: 60.5,
    cpuUsage: 30.2,
    cacheStatus: { enabled: true },
    createdAt: new Date(),
    updatedAt: new Date(),
    assignments: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MiddlewareService,
        {
          provide: PrismaService,
          useValue: {
            middleware: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            middlewareAssignment: {
              count: jest.fn(),
            },
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            generateApiKey: jest.fn().mockReturnValue('reg_new_secret_67890'),
            hash: jest.fn().mockReturnValue('new_hashed_api_key'),
            encrypt: jest.fn(),
            decrypt: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MiddlewareService>(MiddlewareService);
    prisma = module.get(PrismaService);
    encryptionService = module.get(EncryptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确注入依赖', () => {
      expect(service).toBeDefined();
    });
  });

  describe('create', () => {
    const createDto = {
      name: 'New Middleware',
      description: 'New Description',
      url: 'http://localhost:9090',
      serverIp: '192.168.1.101',
      assignmentMode: MiddlewareAssignmentMode.SHARED,
      maxTenants: 5,
    };

    it('应该成功创建中间件并返回注册密钥', async () => {
      prisma.middleware.findFirst.mockResolvedValue(null);
      prisma.middleware.create.mockResolvedValue({
        ...mockMiddleware,
        ...createDto,
        registrationSecret: 'reg_new_secret_67890',
        registrationSecretHash: 'new_hashed_secret',
      });

      const result = await service.create(createDto);

      expect(result.name).toBe(createDto.name);
      expect(result.url).toBe(createDto.url);
      expect(result.registrationSecret).toBe('reg_new_secret_67890');
      expect(encryptionService.generateApiKey).toHaveBeenCalledWith('reg_');
      expect(encryptionService.hash).toHaveBeenCalledWith('reg_new_secret_67890');
    });

    it('名称已存在时应抛出 ConflictException', async () => {
      prisma.middleware.findFirst.mockResolvedValue(mockMiddleware);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
      await expect(service.create(createDto)).rejects.toThrow(
        `中间件名称 ${createDto.name} 已存在`,
      );
    });

    it('创建时应设置初始状态为 UNKNOWN', async () => {
      prisma.middleware.findFirst.mockResolvedValue(null);
      prisma.middleware.create.mockResolvedValue({
        ...mockMiddleware,
        ...createDto,
        status: MiddlewareStatus.UNKNOWN,
      });

      await service.create(createDto);

      expect(prisma.middleware.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MiddlewareStatus.UNKNOWN,
          }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('应该返回所有中间件列表', async () => {
      prisma.middleware.findMany.mockResolvedValue([mockMiddleware]);

      const result = await service.findAll({});

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe(mockMiddleware.name);
    });

    it('应该支持按状态过滤', async () => {
      prisma.middleware.findMany.mockResolvedValue([mockMiddleware]);

      await service.findAll({ status: MiddlewareStatus.ONLINE });

      expect(prisma.middleware.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: MiddlewareStatus.ONLINE,
          }),
        }),
      );
    });

    it('应该支持按分配模式过滤', async () => {
      prisma.middleware.findMany.mockResolvedValue([mockMiddleware]);

      await service.findAll({ assignmentMode: MiddlewareAssignmentMode.DEDICATED });

      expect(prisma.middleware.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assignmentMode: MiddlewareAssignmentMode.DEDICATED,
          }),
        }),
      );
    });

    it('应该支持搜索功能', async () => {
      prisma.middleware.findMany.mockResolvedValue([mockMiddleware]);

      await service.findAll({ search: 'test' });

      expect(prisma.middleware.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                name: expect.objectContaining({ contains: 'test' }),
              }),
            ]),
          }),
        }),
      );
    });

    it('空列表应返回空数组', async () => {
      prisma.middleware.findMany.mockResolvedValue([]);

      const result = await service.findAll({});

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('应该返回中间件详情', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);

      const result = await service.findOne('test-middleware-id');

      expect(result.id).toBe(mockMiddleware.id);
      expect(result.name).toBe(mockMiddleware.name);
    });

    it('中间件不存在时应抛出 NotFoundException', async () => {
      prisma.middleware.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        '中间件 non-existent-id 不存在',
      );
    });
  });

  describe('update', () => {
    const updateDto = {
      name: 'Updated Middleware',
      description: 'Updated Description',
    };

    it('应该成功更新中间件', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.middleware.update.mockResolvedValue({
        ...mockMiddleware,
        ...updateDto,
      });

      const result = await service.update('test-middleware-id', updateDto);

      expect(result.name).toBe(updateDto.name);
      expect(prisma.middleware.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'test-middleware-id' },
          data: expect.objectContaining(updateDto),
        }),
      );
    });

    it('中间件不存在时应抛出 NotFoundException', async () => {
      prisma.middleware.findUnique.mockResolvedValue(null);

      await expect(
        service.update('non-existent-id', updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('更新 URL 时应检查冲突', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.middleware.findFirst.mockResolvedValue({
        ...mockMiddleware,
        id: 'other-middleware-id',
      });

      await expect(
        service.update('test-middleware-id', {
          url: 'http://localhost:8080',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('更新 URL 为自身时不应报冲突', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.middleware.findFirst.mockResolvedValue(null);
      prisma.middleware.update.mockResolvedValue(mockMiddleware);

      const result = await service.update('test-middleware-id', {
        url: 'http://new-url.com',
      });

      expect(result).toBeDefined();
    });
  });

  describe('remove', () => {
    it('应该成功删除无分配的中间件', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.middlewareAssignment.count.mockResolvedValue(0);
      prisma.middleware.delete.mockResolvedValue(mockMiddleware);

      await service.remove('test-middleware-id');

      expect(prisma.middleware.delete).toHaveBeenCalledWith({
        where: { id: 'test-middleware-id' },
      });
    });

    it('中间件不存在时应抛出 NotFoundException', async () => {
      prisma.middleware.findUnique.mockResolvedValue(null);

      await expect(service.remove('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('有关联租户时应抛出 ConflictException', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.middlewareAssignment.count.mockResolvedValue(3);

      await expect(service.remove('test-middleware-id')).rejects.toThrow(
        ConflictException,
      );
      await expect(service.remove('test-middleware-id')).rejects.toThrow(
        /仍有 3 个租户分配/,
      );
    });
  });

  describe('regenerateRegistrationSecret', () => {
    it('应该成功重新生成注册密钥', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.middleware.update.mockResolvedValue({
        ...mockMiddleware,
        registrationSecret: 'reg_new_secret_67890',
        registrationSecretHash: 'new_hashed_secret',
      });

      const result = await service.regenerateRegistrationSecret('test-middleware-id');

      expect(result.registrationSecret).toBe('reg_new_secret_67890');
      expect(result.message).toContain('新的注册密钥已生成');
      expect(encryptionService.generateApiKey).toHaveBeenCalledWith('reg_');
    });

    it('中间件不存在时应抛出 NotFoundException', async () => {
      prisma.middleware.findUnique.mockResolvedValue(null);

      await expect(
        service.regenerateRegistrationSecret('non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateApiKey', () => {
    it('有效的 API Key 应返回中间件', async () => {
      encryptionService.hash.mockReturnValue('hashed_api_key');
      prisma.middleware.findFirst.mockResolvedValue(mockMiddleware);

      const result = await service.validateApiKey('mw_test_api_key_12345');

      expect(result).toBeDefined();
      expect(result?.id).toBe(mockMiddleware.id);
      expect(encryptionService.hash).toHaveBeenCalledWith('mw_test_api_key_12345');
    });

    it('无效的 API Key 应返回 null', async () => {
      encryptionService.hash.mockReturnValue('invalid_hash');
      prisma.middleware.findFirst.mockResolvedValue(null);

      const result = await service.validateApiKey('invalid_api_key');

      expect(result).toBeNull();
    });
  });

  describe('updateHealthStatus', () => {
    it('应该成功更新健康状态', async () => {
      prisma.middleware.update.mockResolvedValue(mockMiddleware);

      const healthData = {
        status: MiddlewareStatus.ONLINE,
        serverIp: '192.168.1.100',
        activeSessions: 10,
        memoryUsage: 70.5,
        cpuUsage: 45.2,
        cacheStatus: { enabled: true, hitRate: 0.95 },
      };

      await service.updateHealthStatus('test-middleware-id', healthData);

      expect(prisma.middleware.update).toHaveBeenCalledWith({
        where: { id: 'test-middleware-id' },
        data: expect.objectContaining({
          status: MiddlewareStatus.ONLINE,
          serverIp: '192.168.1.100',
          activeSessions: 10,
          memoryUsage: 70.5,
          cpuUsage: 45.2,
          cacheStatus: healthData.cacheStatus,
          lastHeartbeat: expect.any(Date),
        }),
      });
    });

    it('应该支持部分健康数据更新', async () => {
      prisma.middleware.update.mockResolvedValue(mockMiddleware);

      await service.updateHealthStatus('test-middleware-id', {
        status: MiddlewareStatus.DEGRADED,
      });

      expect(prisma.middleware.update).toHaveBeenCalledWith({
        where: { id: 'test-middleware-id' },
        data: expect.objectContaining({
          status: MiddlewareStatus.DEGRADED,
          lastHeartbeat: expect.any(Date),
        }),
      });
    });
  });

  describe('响应 DTO 转换', () => {
    it('应该正确转换为响应 DTO', async () => {
      const middlewareWithAssignments = {
        ...mockMiddleware,
        assignments: [{ id: 'assignment-1' }, { id: 'assignment-2' }],
      };
      prisma.middleware.findUnique.mockResolvedValue(middlewareWithAssignments);

      const result = await service.findOne('test-middleware-id');

      expect(result.assignedTenantCount).toBe(2);
      expect(result).not.toHaveProperty('apiKey');
      expect(result).not.toHaveProperty('apiKeyHash');
    });

    it('没有分配时 assignedTenantCount 应为 0', async () => {
      prisma.middleware.findUnique.mockResolvedValue({
        ...mockMiddleware,
        assignments: [],
      });

      const result = await service.findOne('test-middleware-id');

      expect(result.assignedTenantCount).toBe(0);
    });
  });
});
