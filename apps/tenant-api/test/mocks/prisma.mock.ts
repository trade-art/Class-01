/**
 * Prisma Service Mock
 * 用于 E2E 测试的内存数据存储
 */

import { Injectable } from '@nestjs/common';
import {
  TEST_TENANT,
  TEST_TENANT_SUSPENDED,
  TEST_ADMIN,
  TEST_ADMIN_OWNER,
  TEST_ADMIN_OPERATOR,
  TEST_ADMIN_DISABLED,
  TEST_ADMIN_SUSPENDED_TENANT,
  TEST_API_KEYS,
  TEST_NOTIFICATION_SETTINGS,
  TEST_RISK_ALERTS,
} from '../fixtures/test-data';

@Injectable()
export class MockPrismaService {
  // 内存数据存储
  private tenants = [TEST_TENANT, TEST_TENANT_SUSPENDED];
  private admins = [
    TEST_ADMIN,
    TEST_ADMIN_OWNER,
    TEST_ADMIN_OPERATOR,
    TEST_ADMIN_DISABLED,
    TEST_ADMIN_SUSPENDED_TENANT,
  ];
  private apiKeys = [...TEST_API_KEYS];
  private notificationSettings = [TEST_NOTIFICATION_SETTINGS];
  private riskAlerts = [...TEST_RISK_ALERTS];
  private favoriteSymbols: Array<{
    id: string;
    adminId: string;
    symbol: string;
  }> = [];

  // Tenant 操作
  tenant = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (where.id) {
        return Promise.resolve(
          this.tenants.find((t) => t.id === where.id) || null,
        );
      }
      if (where.code) {
        return Promise.resolve(
          this.tenants.find((t) => t.code === where.code) || null,
        );
      }
      return Promise.resolve(null);
    }),

    findFirst: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        this.tenants.find((t) => {
          if (where.code) return t.code === where.code;
          if (where.id) return t.id === where.id;
          return false;
        }) || null,
      );
    }),

    update: jest.fn().mockImplementation(({ where, data }) => {
      const index = this.tenants.findIndex((t) => t.id === where.id);
      if (index >= 0) {
        this.tenants[index] = { ...this.tenants[index], ...data };
        return Promise.resolve(this.tenants[index]);
      }
      return Promise.reject(new Error('Tenant not found'));
    }),
  };

  // TenantAdmin 操作
  tenantAdmin = {
    findUnique: jest.fn().mockImplementation(({ where, include }) => {
      // 支持通过 id 或 email 查找
      let admin = null;
      if (where.id) {
        admin = this.admins.find((a) => a.id === where.id) || null;
      } else if (where.email) {
        admin = this.admins.find((a) => a.email === where.email) || null;
      }
      if (admin && include?.tenant) {
        return Promise.resolve({
          ...admin,
          tenant: this.tenants.find((t) => t.id === admin.tenantId) || null,
        });
      }
      return Promise.resolve(admin);
    }),

    findFirst: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        this.admins.find((a) => {
          if (where.id) return a.id === where.id;
          if (where.email && where.tenantId) {
            return a.email === where.email && a.tenantId === where.tenantId;
          }
          if (where.tenantId) return a.tenantId === where.tenantId;
          return false;
        }) || null,
      );
    }),

    findMany: jest.fn().mockImplementation(({ where, include }) => {
      let result = this.admins;
      if (where?.tenantId) {
        result = result.filter((a) => a.tenantId === where.tenantId);
      }
      if (where?.email) {
        result = result.filter((a) => a.email === where.email);
      }
      // 如果需要 include tenant，添加 tenant 关联
      if (include?.tenant) {
        result = result.map((admin) => ({
          ...admin,
          tenant: this.tenants.find((t) => t.id === admin.tenantId) || null,
        }));
      }
      return Promise.resolve(result);
    }),

    create: jest.fn().mockImplementation(({ data }) => {
      const newAdmin = {
        id: `admin-${Date.now()}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.admins.push(newAdmin);
      return Promise.resolve(newAdmin);
    }),

    update: jest.fn().mockImplementation(({ where, data }) => {
      const index = this.admins.findIndex((a) => a.id === where.id);
      if (index >= 0) {
        this.admins[index] = {
          ...this.admins[index],
          ...data,
          updatedAt: new Date(),
        };
        return Promise.resolve(this.admins[index]);
      }
      return Promise.reject(new Error('Admin not found'));
    }),

    delete: jest.fn().mockImplementation(({ where }) => {
      const index = this.admins.findIndex((a) => a.id === where.id);
      if (index >= 0) {
        const deleted = this.admins.splice(index, 1)[0];
        return Promise.resolve(deleted);
      }
      return Promise.reject(new Error('Admin not found'));
    }),

    count: jest.fn().mockImplementation(({ where }) => {
      let result = this.admins;
      if (where?.tenantId) {
        result = result.filter((a) => a.tenantId === where.tenantId);
      }
      if (where?.role) {
        result = result.filter((a) => a.role === where.role);
      }
      return Promise.resolve(result.length);
    }),
  };

  // ApiKey 操作
  apiKey = {
    findMany: jest.fn().mockImplementation(({ where, orderBy, skip, take }) => {
      let result = [...this.apiKeys];
      if (where?.tenantId) {
        result = result.filter((k) => k.tenantId === where.tenantId);
      }
      if (where?.isActive !== undefined) {
        result = result.filter((k) => k.isActive === where.isActive);
      }
      if (where?.revokedAt === null) {
        result = result.filter((k) => k.revokedAt === null);
      }
      if (where?.revokedAt && where.revokedAt.not === null) {
        result = result.filter((k) => k.revokedAt !== null);
      }
      if (where?.serverId) {
        result = result.filter((k) => k.serverId === where.serverId);
      }
      // 排序
      if (orderBy?.createdAt === 'desc') {
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      // 分页
      if (skip !== undefined && take !== undefined) {
        result = result.slice(skip, skip + take);
      }
      return Promise.resolve(result);
    }),

    findFirst: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        this.apiKeys.find((k) => {
          // 支持按 id 和 tenantId 查找
          if (where.id && where.tenantId) {
            return k.id === where.id && k.tenantId === where.tenantId;
          }
          // 支持按 hashedKey 查找 (用于验证)
          if (where.hashedKey) {
            return k.hashedKey === where.hashedKey;
          }
          return false;
        }) || null,
      );
    }),

    count: jest.fn().mockImplementation(({ where }) => {
      let result = this.apiKeys;
      if (where?.tenantId) {
        result = result.filter((k) => k.tenantId === where.tenantId);
      }
      if (where?.isActive !== undefined) {
        result = result.filter((k) => k.isActive === where.isActive);
      }
      if (where?.revokedAt === null) {
        result = result.filter((k) => k.revokedAt === null);
      }
      return Promise.resolve(result.length);
    }),

    create: jest.fn().mockImplementation(({ data }) => {
      const newKey = {
        id: `key-${Date.now()}`,
        usageCount: 0,
        lastUsedAt: null,
        lastUsedIp: null,
        revokedAt: null,
        revokedBy: null,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.apiKeys.push(newKey);
      return Promise.resolve(newKey);
    }),

    update: jest.fn().mockImplementation(({ where, data }) => {
      const index = this.apiKeys.findIndex((k) => k.id === where.id);
      if (index >= 0) {
        this.apiKeys[index] = {
          ...this.apiKeys[index],
          ...data,
          updatedAt: new Date(),
        };
        return Promise.resolve(this.apiKeys[index]);
      }
      return Promise.reject(new Error('ApiKey not found'));
    }),

    delete: jest.fn().mockImplementation(({ where }) => {
      const index = this.apiKeys.findIndex((k) => k.id === where.id);
      if (index >= 0) {
        const deleted = this.apiKeys.splice(index, 1)[0];
        return Promise.resolve(deleted);
      }
      return Promise.reject(new Error('ApiKey not found'));
    }),
  };

  // NotificationSetting 操作
  notificationSetting = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        this.notificationSettings.find(
          (s) => s.tenantId === where.tenantId,
        ) || null,
      );
    }),

    create: jest.fn().mockImplementation(({ data }) => {
      this.notificationSettings.push(data);
      return Promise.resolve(data);
    }),

    upsert: jest.fn().mockImplementation(({ where, create, update }) => {
      const index = this.notificationSettings.findIndex(
        (s) => s.tenantId === where.tenantId,
      );
      if (index >= 0) {
        this.notificationSettings[index] = {
          ...this.notificationSettings[index],
          ...update,
        };
        return Promise.resolve(this.notificationSettings[index]);
      }
      this.notificationSettings.push(create);
      return Promise.resolve(create);
    }),
  };

  // RiskAlert 操作
  riskAlert = {
    findMany: jest.fn().mockImplementation(({ where, orderBy, skip, take }) => {
      let result = [...this.riskAlerts];
      if (where?.tenantId) {
        result = result.filter((a) => a.tenantId === where.tenantId);
      }
      if (where?.type) {
        result = result.filter((a) => a.type === where.type);
      }
      if (where?.level) {
        result = result.filter((a) => a.level === where.level);
      }
      // 简单排序
      result.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      // 分页
      if (skip !== undefined && take !== undefined) {
        result = result.slice(skip, skip + take);
      }
      return Promise.resolve(result);
    }),

    count: jest.fn().mockImplementation(({ where }) => {
      let result = this.riskAlerts;
      if (where?.tenantId) {
        result = result.filter((a) => a.tenantId === where.tenantId);
      }
      return Promise.resolve(result.length);
    }),

    updateMany: jest.fn().mockImplementation(({ where, data }) => {
      let count = 0;
      this.riskAlerts = this.riskAlerts.map((alert) => {
        let match = true;
        if (where.tenantId && alert.tenantId !== where.tenantId) match = false;
        if (where.id && where.id.in && !where.id.in.includes(alert.id))
          match = false;
        if (match) {
          count++;
          return { ...alert, ...data };
        }
        return alert;
      });
      return Promise.resolve({ count });
    }),

    deleteMany: jest.fn().mockImplementation(({ where }) => {
      const initialLength = this.riskAlerts.length;
      this.riskAlerts = this.riskAlerts.filter((alert) => {
        if (where.tenantId && alert.tenantId !== where.tenantId) return true;
        if (where.id && alert.id !== where.id) return true;
        return false;
      });
      return Promise.resolve({ count: initialLength - this.riskAlerts.length });
    }),

    groupBy: jest.fn().mockImplementation(({ by, where, _count }: any) => {
      // 支持 isRead 过滤
      let filtered = this.riskAlerts.filter(
        (a) => !where?.tenantId || a.tenantId === where.tenantId,
      );
      if (where?.isRead !== undefined) {
        filtered = filtered.filter((a) => a.isRead === where.isRead);
      }

      const result = filtered.reduce(
        (acc: Record<string, any>, alert: any) => {
          const key = alert[by[0] as keyof typeof alert] as string;
          if (!acc[key]) {
            // 返回 _count 对象，包含 by 字段名和 _all
            acc[key] = { [by[0]]: key, _count: { [by[0]]: 0, _all: 0 } };
          }
          acc[key]._count[by[0]]++;
          acc[key]._count._all++;
          return acc;
        },
        {} as Record<string, any>,
      );
      return Promise.resolve(Object.values(result));
    }),
  };

  // RiskConfig 操作
  riskConfig = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve({
        tenantId: where.tenantId,
        largeTradeThreshold: 10,
        lowMarginThreshold: 50,
        highFrequencyThreshold: 100,
        isEnabled: true,
      });
    }),

    upsert: jest.fn().mockImplementation(({ where, create, update }) => {
      return Promise.resolve({
        tenantId: where.tenantId,
        isEnabled: true,
        largeTradeThreshold: 10,
        lowMarginThreshold: 50,
        ...update,
      });
    }),
  };

  // AdminFavoriteSymbol 操作
  adminFavoriteSymbol = {
    findMany: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        this.favoriteSymbols.filter((f) => f.adminId === where.adminId),
      );
    }),

    findFirst: jest.fn().mockImplementation(({ where }) => {
      const found = this.favoriteSymbols.find(
        (f) => f.adminId === where.adminId && f.symbol === where.symbol,
      );
      return Promise.resolve(found || null);
    }),

    create: jest.fn().mockImplementation(({ data }) => {
      const newFavorite = {
        id: `fav-${Date.now()}`,
        ...data,
      };
      this.favoriteSymbols.push(newFavorite);
      return Promise.resolve(newFavorite);
    }),

    delete: jest.fn().mockImplementation(({ where }) => {
      const index = this.favoriteSymbols.findIndex(
        (f) =>
          f.adminId === where.adminId_symbol?.adminId &&
          f.symbol === where.adminId_symbol?.symbol,
      );
      if (index >= 0) {
        const deleted = this.favoriteSymbols.splice(index, 1)[0];
        return Promise.resolve(deleted);
      }
      return Promise.reject(new Error('Favorite not found'));
    }),

    deleteMany: jest.fn().mockImplementation(({ where }) => {
      const initialLength = this.favoriteSymbols.length;
      this.favoriteSymbols = this.favoriteSymbols.filter((f) => {
        if (where.adminId && f.adminId !== where.adminId) return true;
        if (where.symbol && f.symbol !== where.symbol) return true;
        return false;
      });
      return Promise.resolve({ count: initialLength - this.favoriteSymbols.length });
    }),

    createMany: jest.fn().mockImplementation(({ data }) => {
      const items = Array.isArray(data) ? data : [data];
      items.forEach((item) => {
        this.favoriteSymbols.push({
          id: `fav-${Date.now()}-${Math.random()}`,
          ...item,
        });
      });
      return Promise.resolve({ count: items.length });
    }),
  };

  // 事务支持
  $transaction = jest.fn().mockImplementation(async (operations) => {
    if (Array.isArray(operations)) {
      return Promise.all(operations);
    }
    return operations(this);
  });

  // 连接方法
  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);

  // MiddlewareInstance 操作 (用于 auth/me 获取默认实例和 TenantGuard 验证)
  middlewareInstance = {
    findMany: jest.fn().mockImplementation(({ where, take }) => {
      // 返回一个模拟的在线实例
      if (where?.status === 'ONLINE') {
        return Promise.resolve([
          {
            id: 'instance-test-001',
            tenantId: where.tenantId,
            status: 'ONLINE',
          },
        ]);
      }
      return Promise.resolve([]);
    }),

    findUnique: jest.fn().mockImplementation(({ where }) => {
      // TenantGuard 使用此方法检查实例状态
      if (where?.id === 'instance-test-001') {
        return Promise.resolve({
          id: 'instance-test-001',
          tenantId: 'tenant-test-001',
          status: 'ONLINE',
        });
      }
      return Promise.resolve(null);
    }),
  };

  // IpBlacklist 操作 (用于 IpBlacklistService)
  ipBlacklist = {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(({ data }) => {
      return Promise.resolve({
        id: `blacklist-${Date.now()}`,
        ...data,
        createdAt: new Date(),
      });
    }),
    update: jest.fn().mockImplementation(({ where, data }) => {
      return Promise.resolve({
        id: where.id,
        ...data,
        updatedAt: new Date(),
      });
    }),
    delete: jest.fn().mockResolvedValue({ id: 'deleted' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
  };

  // LoginAttempt 操作 (用于登录尝试跟踪，防止账户锁定)
  loginAttempt = {
    findMany: jest.fn().mockResolvedValue([]), // 返回空数组表示没有失败尝试
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }) => {
      return Promise.resolve({
        id: `attempt-${Date.now()}`,
        ...data,
        createdAt: new Date(),
      });
    }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0), // 返回 0 表示没有失败尝试
  };

  // AuditLog 操作 (用于审计日志)
  auditLog = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }) => {
      return Promise.resolve({
        id: `audit-${Date.now()}`,
        ...data,
        createdAt: new Date(),
      });
    }),
    count: jest.fn().mockResolvedValue(0),
  };

  // MtServer 操作 (用于 MtServerService)
  mtServer = {
    findFirst: jest.fn().mockImplementation(({ where }) => {
      // 返回一个模拟的 MT 服务器
      if (where?.tenantId) {
        return Promise.resolve({
          id: 'mt-server-test-001',
          tenantId: where.tenantId,
          name: 'Test MT Server',
          platform: 'MT5',
          host: 'localhost',
          port: 443,
          managerLogin: 1,
          isDefault: true,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: {
            managers: 0,
          },
        });
      }
      return Promise.resolve(null);
    }),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }) => {
      return Promise.resolve({
        id: `mt-server-${Date.now()}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }),
    update: jest.fn().mockImplementation(({ where, data }) => {
      return Promise.resolve({
        id: where.id,
        ...data,
        updatedAt: new Date(),
      });
    }),
    delete: jest.fn().mockResolvedValue({ id: 'deleted' }),
    count: jest.fn().mockResolvedValue(0),
  };

  // Prisma 原始查询操作 (用于 HealthService)
  $queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
  $executeRaw = jest.fn().mockResolvedValue(1);

  // 重置所有 Mock 数据
  resetMocks() {
    this.tenants = [TEST_TENANT, TEST_TENANT_SUSPENDED];
    this.admins = [
      TEST_ADMIN,
      TEST_ADMIN_OWNER,
      TEST_ADMIN_OPERATOR,
      TEST_ADMIN_DISABLED,
      TEST_ADMIN_SUSPENDED_TENANT,
    ];
    this.apiKeys = [...TEST_API_KEYS];
    this.notificationSettings = [TEST_NOTIFICATION_SETTINGS];
    this.riskAlerts = [...TEST_RISK_ALERTS];
    this.favoriteSymbols = [];
  }
}
