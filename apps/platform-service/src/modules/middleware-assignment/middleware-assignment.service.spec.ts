/**
 * MiddlewareAssignmentService 单元测试
 *
 * 测试内容:
 * - 分配逻辑 (assign)
 * - 取消分配 (unassign)
 * - 容量限制检查
 * - 独占模式检查
 * - 批量分配
 *
 * saas-middleware-management Task 10.2
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { MiddlewareAssignmentService } from './middleware-assignment.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MiddlewareAssignmentMode, MiddlewareStatus } from '@prisma/client';

describe('MiddlewareAssignmentService', () => {
  let service: MiddlewareAssignmentService;
  let prisma: {
    middleware: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    tenant: {
      findUnique: jest.Mock;
    };
    middlewareAssignment: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    middlewareInstance: {
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    mtServer: {
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const mockMiddleware = {
    id: 'middleware-1',
    name: 'Test Middleware',
    url: 'http://localhost:8080',
    assignmentMode: MiddlewareAssignmentMode.SHARED,
    maxTenants: 5,
    status: MiddlewareStatus.ONLINE,
    assignments: [],
  };

  const mockTenant = {
    id: 'tenant-1',
    name: 'Test Tenant',
    code: 'test-tenant',
  };

  const mockAssignment = {
    id: 'assignment-1',
    middlewareId: 'middleware-1',
    tenantId: 'tenant-1',
    assignedAt: new Date(),
    assignedBy: 'operator-1',
    tenant: mockTenant,
    middleware: {
      id: 'middleware-1',
      name: 'Test Middleware',
      url: 'http://localhost:8080',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MiddlewareAssignmentService,
        {
          provide: PrismaService,
          useValue: {
            middleware: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            tenant: {
              findUnique: jest.fn(),
            },
            middlewareAssignment: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
            },
            middlewareInstance: {
              create: jest.fn(),
              deleteMany: jest.fn(),
            },
            mtServer: {
              count: jest.fn(),
            },
            $transaction: jest.fn((callback) => callback({
              middlewareAssignment: {
                create: jest.fn().mockResolvedValue({
                  id: 'assignment-1',
                  middlewareId: 'middleware-1',
                  tenantId: 'tenant-1',
                  assignedAt: new Date(),
                  assignedBy: 'operator-1',
                  tenant: {
                    id: 'tenant-1',
                    name: 'Test Tenant',
                    code: 'test-tenant',
                  },
                  middleware: {
                    id: 'middleware-1',
                    name: 'Test Middleware',
                    url: 'http://localhost:8080',
                  },
                }),
                delete: jest.fn(),
              },
              middlewareInstance: {
                create: jest.fn().mockResolvedValue({
                  id: 'instance-1',
                  middlewareId: 'middleware-1',
                  tenantId: 'tenant-1',
                  name: 'Test Middleware - Test Tenant',
                }),
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
              },
            })),
          },
        },
      ],
    }).compile();

    service = module.get<MiddlewareAssignmentService>(MiddlewareAssignmentService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确注入依赖', () => {
      expect(service).toBeDefined();
    });
  });

  describe('assign', () => {
    it('应该成功分配租户到中间件', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.tenant.findUnique.mockResolvedValue(mockTenant);
      prisma.middlewareAssignment.findFirst.mockResolvedValue(null);
      prisma.middlewareAssignment.findUnique.mockResolvedValue(null);
      prisma.mtServer.count.mockResolvedValue(1);

      const result = await service.assign('middleware-1', 'tenant-1', 'operator-1');

      expect(result.middlewareId).toBe('middleware-1');
      expect(result.tenantId).toBe('tenant-1');
      // 服务现在使用 $transaction 进行分配操作
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('中间件不存在时应抛出 NotFoundException', async () => {
      prisma.middleware.findUnique.mockResolvedValue(null);

      await expect(
        service.assign('non-existent', 'tenant-1', 'operator-1'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.assign('non-existent', 'tenant-1', 'operator-1'),
      ).rejects.toThrow('中间件 non-existent 不存在');
    });

    it('租户不存在时应抛出 NotFoundException', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.assign('middleware-1', 'non-existent', 'operator-1'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.assign('middleware-1', 'non-existent', 'operator-1'),
      ).rejects.toThrow('租户 non-existent 不存在');
    });

    it('租户已有其他分配时应抛出 ConflictException', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.tenant.findUnique.mockResolvedValue(mockTenant);
      prisma.middlewareAssignment.findFirst.mockResolvedValue({
        ...mockAssignment,
        middlewareId: 'other-middleware',
        middleware: { name: 'Other Middleware' },
      });

      await expect(
        service.assign('middleware-1', 'tenant-1', 'operator-1'),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.assign('middleware-1', 'tenant-1', 'operator-1'),
      ).rejects.toThrow(/已分配到中间件/);
    });

    it('租户已分配到此中间件时应抛出 ConflictException', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.tenant.findUnique.mockResolvedValue(mockTenant);
      prisma.middlewareAssignment.findFirst.mockResolvedValue(null);
      prisma.middlewareAssignment.findUnique.mockResolvedValue(mockAssignment);

      await expect(
        service.assign('middleware-1', 'tenant-1', 'operator-1'),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.assign('middleware-1', 'tenant-1', 'operator-1'),
      ).rejects.toThrow(/已经分配到此中间件/);
    });

    describe('独占模式 (DEDICATED)', () => {
      const dedicatedMiddleware = {
        ...mockMiddleware,
        assignmentMode: MiddlewareAssignmentMode.DEDICATED,
      };

      it('独占模式下已有分配应抛出 ConflictException', async () => {
        prisma.middleware.findUnique.mockResolvedValue({
          ...dedicatedMiddleware,
          assignments: [{ id: 'existing-assignment' }],
        });
        prisma.tenant.findUnique.mockResolvedValue(mockTenant);
        prisma.middlewareAssignment.findFirst.mockResolvedValue(null);
        prisma.middlewareAssignment.findUnique.mockResolvedValue(null);

        await expect(
          service.assign('middleware-1', 'tenant-1', 'operator-1'),
        ).rejects.toThrow(ConflictException);
        await expect(
          service.assign('middleware-1', 'tenant-1', 'operator-1'),
        ).rejects.toThrow(/独占模式/);
      });

      it('独占模式下无分配应成功', async () => {
        prisma.middleware.findUnique.mockResolvedValue({
          ...dedicatedMiddleware,
          assignments: [],
        });
        prisma.tenant.findUnique.mockResolvedValue(mockTenant);
        prisma.middlewareAssignment.findFirst.mockResolvedValue(null);
        prisma.middlewareAssignment.findUnique.mockResolvedValue(null);
        prisma.mtServer.count.mockResolvedValue(1);
        prisma.middlewareAssignment.create.mockResolvedValue(mockAssignment);

        const result = await service.assign('middleware-1', 'tenant-1', 'operator-1');

        expect(result).toBeDefined();
      });
    });

    describe('共享模式容量限制', () => {
      it('达到容量上限时应抛出 ConflictException', async () => {
        const fullMiddleware = {
          ...mockMiddleware,
          maxTenants: 2,
          assignments: [{ id: '1' }, { id: '2' }],
        };
        prisma.middleware.findUnique.mockResolvedValue(fullMiddleware);
        prisma.tenant.findUnique.mockResolvedValue(mockTenant);
        prisma.middlewareAssignment.findFirst.mockResolvedValue(null);
        prisma.middlewareAssignment.findUnique.mockResolvedValue(null);

        await expect(
          service.assign('middleware-1', 'tenant-1', 'operator-1'),
        ).rejects.toThrow(ConflictException);
        await expect(
          service.assign('middleware-1', 'tenant-1', 'operator-1'),
        ).rejects.toThrow(/已达到最大租户数/);
      });

      it('未达到容量上限时应成功', async () => {
        prisma.middleware.findUnique.mockResolvedValue({
          ...mockMiddleware,
          maxTenants: 5,
          assignments: [{ id: '1' }, { id: '2' }],
        });
        prisma.tenant.findUnique.mockResolvedValue(mockTenant);
        prisma.middlewareAssignment.findFirst.mockResolvedValue(null);
        prisma.middlewareAssignment.findUnique.mockResolvedValue(null);
        prisma.mtServer.count.mockResolvedValue(1);
        prisma.middlewareAssignment.create.mockResolvedValue(mockAssignment);

        const result = await service.assign('middleware-1', 'tenant-1', 'operator-1');

        expect(result).toBeDefined();
      });
    });

    it('租户无 MT 配置时应记录警告但不阻止分配', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.tenant.findUnique.mockResolvedValue(mockTenant);
      prisma.middlewareAssignment.findFirst.mockResolvedValue(null);
      prisma.middlewareAssignment.findUnique.mockResolvedValue(null);
      prisma.mtServer.count.mockResolvedValue(0);

      const result = await service.assign('middleware-1', 'tenant-1', 'operator-1');

      expect(result).toBeDefined();
      // 验证使用事务创建分配记录
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('unassign', () => {
    it('应该成功取消分配', async () => {
      prisma.middlewareAssignment.findUnique.mockResolvedValue(mockAssignment);

      await service.unassign('middleware-1', 'tenant-1');

      // 验证使用事务进行删除
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('分配关系不存在时应抛出 NotFoundException', async () => {
      prisma.middlewareAssignment.findUnique.mockResolvedValue(null);

      await expect(
        service.unassign('middleware-1', 'tenant-1'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.unassign('middleware-1', 'tenant-1'),
      ).rejects.toThrow('租户与中间件的分配关系不存在');
    });
  });

  describe('getAssignmentsByMiddleware', () => {
    it('应该返回中间件的所有分配', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.middlewareAssignment.findMany.mockResolvedValue([mockAssignment]);

      const result = await service.getAssignmentsByMiddleware('middleware-1');

      expect(result).toHaveLength(1);
      expect(result[0].tenantId).toBe('tenant-1');
    });

    it('中间件不存在时应抛出 NotFoundException', async () => {
      prisma.middleware.findUnique.mockResolvedValue(null);

      await expect(
        service.getAssignmentsByMiddleware('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('无分配时应返回空数组', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.middlewareAssignment.findMany.mockResolvedValue([]);

      const result = await service.getAssignmentsByMiddleware('middleware-1');

      expect(result).toEqual([]);
    });
  });

  describe('getMiddlewareByTenant', () => {
    it('应该返回租户的中间件信息', async () => {
      prisma.tenant.findUnique.mockResolvedValue(mockTenant);
      prisma.middlewareAssignment.findFirst.mockResolvedValue(mockAssignment);
      prisma.mtServer.count.mockResolvedValue(2);

      const result = await service.getMiddlewareByTenant('tenant-1');

      expect(result).toBeDefined();
      expect(result?.middlewareId).toBe('middleware-1');
      expect(result?.hasMtServerConfig).toBe(true);
    });

    it('租户不存在时应抛出 NotFoundException', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.getMiddlewareByTenant('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('租户无分配时应返回 null', async () => {
      prisma.tenant.findUnique.mockResolvedValue(mockTenant);
      prisma.middlewareAssignment.findFirst.mockResolvedValue(null);

      const result = await service.getMiddlewareByTenant('tenant-1');

      expect(result).toBeNull();
    });

    it('租户无 MT 配置时 hasMtServerConfig 应为 false', async () => {
      prisma.tenant.findUnique.mockResolvedValue(mockTenant);
      prisma.middlewareAssignment.findFirst.mockResolvedValue(mockAssignment);
      prisma.mtServer.count.mockResolvedValue(0);

      const result = await service.getMiddlewareByTenant('tenant-1');

      expect(result?.hasMtServerConfig).toBe(false);
    });
  });

  describe('getAllMiddlewareCapacity', () => {
    it('应该返回所有中间件的容量信息', async () => {
      prisma.middleware.findMany.mockResolvedValue([
        {
          ...mockMiddleware,
          _count: { assignments: 2 },
        },
        {
          ...mockMiddleware,
          id: 'middleware-2',
          assignmentMode: MiddlewareAssignmentMode.DEDICATED,
          maxTenants: 1,
          _count: { assignments: 0 },
        },
      ]);

      const result = await service.getAllMiddlewareCapacity();

      expect(result).toHaveLength(2);
      expect(result[0].currentTenants).toBe(2);
      expect(result[0].availableSlots).toBe(3);
      expect(result[0].canAssign).toBe(true);
      expect(result[1].availableSlots).toBe(1);
      expect(result[1].canAssign).toBe(true);
    });

    it('独占模式已分配时可用槽位应为 0', async () => {
      prisma.middleware.findMany.mockResolvedValue([
        {
          ...mockMiddleware,
          assignmentMode: MiddlewareAssignmentMode.DEDICATED,
          maxTenants: 1,
          _count: { assignments: 1 },
        },
      ]);

      const result = await service.getAllMiddlewareCapacity();

      expect(result[0].availableSlots).toBe(0);
      expect(result[0].canAssign).toBe(false);
    });

    it('共享模式满员时可用槽位应为 0', async () => {
      prisma.middleware.findMany.mockResolvedValue([
        {
          ...mockMiddleware,
          maxTenants: 3,
          _count: { assignments: 3 },
        },
      ]);

      const result = await service.getAllMiddlewareCapacity();

      expect(result[0].availableSlots).toBe(0);
      expect(result[0].canAssign).toBe(false);
    });
  });

  describe('getAvailableMiddlewares', () => {
    it('应该只返回有可用容量的中间件', async () => {
      prisma.middleware.findMany.mockResolvedValue([
        {
          ...mockMiddleware,
          id: 'available',
          maxTenants: 5,
          _count: { assignments: 2 },
        },
        {
          ...mockMiddleware,
          id: 'full',
          maxTenants: 3,
          _count: { assignments: 3 },
        },
      ]);

      const result = await service.getAvailableMiddlewares();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('available');
    });
  });

  describe('batchAssign', () => {
    it('应该返回成功和失败的分配结果', async () => {
      prisma.middleware.findUnique.mockResolvedValue(mockMiddleware);
      prisma.middlewareAssignment.findFirst.mockResolvedValue(null);
      prisma.middlewareAssignment.findUnique.mockResolvedValue(null);
      prisma.mtServer.count.mockResolvedValue(1);

      // 第一个租户成功
      prisma.tenant.findUnique
        .mockResolvedValueOnce(mockTenant)
        .mockResolvedValueOnce(null); // 第二个租户不存在

      prisma.middlewareAssignment.create.mockResolvedValue(mockAssignment);

      const result = await service.batchAssign(
        'middleware-1',
        ['tenant-1', 'tenant-2'],
        'operator-1',
      );

      expect(result.success).toHaveLength(1);
      expect(result.success[0]).toBe('tenant-1');
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].tenantId).toBe('tenant-2');
    });

    it('空租户列表应返回空结果', async () => {
      const result = await service.batchAssign('middleware-1', [], 'operator-1');

      expect(result.success).toEqual([]);
      expect(result.failed).toEqual([]);
    });
  });
});
