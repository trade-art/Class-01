/**
 * Prisma Service Mock
 * 用于 E2E 测试的内存数据存储
 */

import { Injectable } from '@nestjs/common';
import {
  TEST_PLATFORM_ADMIN,
  TEST_PLATFORM_ADMIN_REGULAR,
  TEST_PLATFORM_ADMIN_OPERATOR,
  TEST_PLATFORM_ADMIN_DISABLED,
  TEST_TENANT,
  TEST_TENANT_PENDING,
  TEST_TENANT_SUSPENDED,
  TEST_TENANT_EXPIRED,
  TEST_TENANT_ADMIN,
  TEST_TENANT_ADMIN_OWNER,
  TEST_TENANT_ADMIN_OPERATOR,
  TEST_TENANT_ADMIN_DISABLED,
  TEST_TENANT_ADMIN_SUSPENDED,
  TEST_INSTANCE,
  TEST_INSTANCE_OFFLINE,
  TEST_INSTANCE_ERROR,
  TEST_INVOICE,
  TEST_INVOICE_PENDING,
  TEST_INVOICE_OVERDUE,
  TEST_API_KEY,
  TEST_API_KEY_READONLY,
  TEST_INSTANCE_EVENTS,
} from '../fixtures/test-data';

@Injectable()
export class MockPrismaService {
  // 内存数据存储
  private platformAdmins = [
    TEST_PLATFORM_ADMIN,
    TEST_PLATFORM_ADMIN_REGULAR,
    TEST_PLATFORM_ADMIN_OPERATOR,
    TEST_PLATFORM_ADMIN_DISABLED,
  ];

  private tenants = [
    TEST_TENANT,
    TEST_TENANT_PENDING,
    TEST_TENANT_SUSPENDED,
    TEST_TENANT_EXPIRED,
  ];

  private tenantAdmins = [
    TEST_TENANT_ADMIN,
    TEST_TENANT_ADMIN_OWNER,
    TEST_TENANT_ADMIN_OPERATOR,
    TEST_TENANT_ADMIN_DISABLED,
    TEST_TENANT_ADMIN_SUSPENDED,
  ];

  private instances = [
    TEST_INSTANCE,
    TEST_INSTANCE_OFFLINE,
    TEST_INSTANCE_ERROR,
  ];

  private invoices = [
    TEST_INVOICE,
    TEST_INVOICE_PENDING,
    TEST_INVOICE_OVERDUE,
  ];

  private apiKeys = [
    TEST_API_KEY,
    TEST_API_KEY_READONLY,
  ];

  private instanceEvents = [...TEST_INSTANCE_EVENTS];

  // ==================== Platform Admin 操作 ====================

  platformAdmin = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (where.id) {
        return Promise.resolve(
          this.platformAdmins.find((a) => a.id === where.id) || null,
        );
      }
      if (where.email) {
        return Promise.resolve(
          this.platformAdmins.find((a) => a.email === where.email) || null,
        );
      }
      return Promise.resolve(null);
    }),

    findFirst: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        this.platformAdmins.find((a) => {
          if (where.email) return a.email === where.email;
          if (where.id) return a.id === where.id;
          return false;
        }) || null,
      );
    }),

    findMany: jest.fn().mockImplementation(({ where, skip, take, orderBy } = {}) => {
      let result = [...this.platformAdmins];
      if (where?.role) {
        result = result.filter((a) => a.role === where.role);
      }
      if (where?.isActive !== undefined) {
        result = result.filter((a) => a.isActive === where.isActive);
      }
      // 简单分页
      if (skip !== undefined) {
        result = result.slice(skip);
      }
      if (take !== undefined) {
        result = result.slice(0, take);
      }
      return Promise.resolve(result);
    }),

    create: jest.fn().mockImplementation(({ data }) => {
      const newAdmin = {
        id: `platform-admin-${Date.now()}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.platformAdmins.push(newAdmin);
      return Promise.resolve(newAdmin);
    }),

    update: jest.fn().mockImplementation(({ where, data }) => {
      const index = this.platformAdmins.findIndex((a) => a.id === where.id);
      if (index >= 0) {
        this.platformAdmins[index] = {
          ...this.platformAdmins[index],
          ...data,
          updatedAt: new Date(),
        };
        return Promise.resolve(this.platformAdmins[index]);
      }
      return Promise.reject(new Error('Platform admin not found'));
    }),

    delete: jest.fn().mockImplementation(({ where }) => {
      const index = this.platformAdmins.findIndex((a) => a.id === where.id);
      if (index >= 0) {
        const deleted = this.platformAdmins.splice(index, 1)[0];
        return Promise.resolve(deleted);
      }
      return Promise.reject(new Error('Platform admin not found'));
    }),

    count: jest.fn().mockImplementation(({ where } = {}) => {
      let result = this.platformAdmins;
      if (where?.role) {
        result = result.filter((a) => a.role === where.role);
      }
      return Promise.resolve(result.length);
    }),
  };

  // ==================== Tenant 操作 ====================

  tenant = {
    findUnique: jest.fn().mockImplementation(({ where, include }) => {
      let tenant = null;
      if (where.id) {
        tenant = this.tenants.find((t) => t.id === where.id) || null;
      }
      if (where.code) {
        tenant = this.tenants.find((t) => t.code === where.code) || null;
      }
      if (!tenant) {
        return Promise.resolve(null);
      }
      // Build result with includes
      const result: any = { ...tenant };
      if (include?.admins) {
        result.admins = this.tenantAdmins.filter((a) => a.tenantId === tenant!.id);
      }
      if (include?.instances) {
        result.instances = this.instances.filter((i) => i.tenantId === tenant!.id);
      }
      if (include?._count) {
        result._count = {
          instances: this.instances.filter((i) => i.tenantId === tenant!.id).length,
          admins: this.tenantAdmins.filter((a) => a.tenantId === tenant!.id).length,
        };
      }
      return Promise.resolve(result);
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

    findMany: jest.fn().mockImplementation(({ where, skip, take, orderBy, include } = {}) => {
      let result = [...this.tenants];
      if (where?.status) {
        result = result.filter((t) => t.status === where.status);
      }
      if (where?.plan) {
        result = result.filter((t) => t.plan === where.plan);
      }
      if (where?.OR) {
        // Search by name or code
        const searchResults = result.filter((t) =>
          where.OR.some((condition: any) => {
            if (condition.name?.contains) {
              return t.name.toLowerCase().includes(condition.name.contains.toLowerCase());
            }
            if (condition.code?.contains) {
              return t.code.toLowerCase().includes(condition.code.contains.toLowerCase());
            }
            return false;
          }),
        );
        result = searchResults;
      }
      // Include relations
      if (include?.admins) {
        result = result.map((tenant) => ({
          ...tenant,
          admins: this.tenantAdmins.filter((a) => a.tenantId === tenant.id),
        }));
      }
      if (include?.instances) {
        result = result.map((tenant) => ({
          ...tenant,
          instances: this.instances.filter((i) => i.tenantId === tenant.id),
        }));
      }
      if (include?._count) {
        result = result.map((tenant) => ({
          ...tenant,
          _count: {
            instances: this.instances.filter((i) => i.tenantId === tenant.id).length,
            admins: this.tenantAdmins.filter((a) => a.tenantId === tenant.id).length,
          },
        }));
      }
      // 分页
      if (skip !== undefined) {
        result = result.slice(skip);
      }
      if (take !== undefined) {
        result = result.slice(0, take);
      }
      return Promise.resolve(result);
    }),

    create: jest.fn().mockImplementation(({ data }) => {
      const newTenant = {
        id: `tenant-${Date.now()}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.tenants.push(newTenant);
      return Promise.resolve(newTenant);
    }),

    update: jest.fn().mockImplementation(({ where, data }) => {
      const index = this.tenants.findIndex((t) => t.id === where.id);
      if (index >= 0) {
        this.tenants[index] = {
          ...this.tenants[index],
          ...data,
          updatedAt: new Date(),
        };
        return Promise.resolve(this.tenants[index]);
      }
      return Promise.reject(new Error('Tenant not found'));
    }),

    delete: jest.fn().mockImplementation(({ where }) => {
      const index = this.tenants.findIndex((t) => t.id === where.id);
      if (index >= 0) {
        const deleted = this.tenants.splice(index, 1)[0];
        return Promise.resolve(deleted);
      }
      return Promise.reject(new Error('Tenant not found'));
    }),

    count: jest.fn().mockImplementation(({ where } = {}) => {
      let result = this.tenants;
      if (where?.status) {
        result = result.filter((t) => t.status === where.status);
      }
      return Promise.resolve(result.length);
    }),

    groupBy: jest.fn().mockImplementation(({ by, _count } = {}) => {
      if (by?.includes('plan')) {
        // 按计划分组统计
        const planCounts: Record<string, number> = {};
        this.tenants.forEach((t) => {
          planCounts[t.plan] = (planCounts[t.plan] || 0) + 1;
        });
        return Promise.resolve(
          Object.entries(planCounts).map(([plan, count]) => ({
            plan,
            _count: { plan: count },
          })),
        );
      }
      if (by?.includes('status')) {
        // 按状态分组统计
        const statusCounts: Record<string, number> = {};
        this.tenants.forEach((t) => {
          statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
        });
        return Promise.resolve(
          Object.entries(statusCounts).map(([status, count]) => ({
            status,
            _count: { status: count },
          })),
        );
      }
      return Promise.resolve([]);
    }),
  };

  // ==================== Tenant Admin 操作 ====================

  tenantAdmin = {
    findUnique: jest.fn().mockImplementation(({ where, include }) => {
      const admin = this.tenantAdmins.find((a) => a.id === where.id) || null;
      if (admin && include?.tenant) {
        return Promise.resolve({
          ...admin,
          tenant: this.tenants.find((t) => t.id === admin.tenantId) || null,
        });
      }
      return Promise.resolve(admin);
    }),

    findFirst: jest.fn().mockImplementation(({ where, include }) => {
      const admin = this.tenantAdmins.find((a) => {
        if (where.id) return a.id === where.id;
        if (where.email && where.tenantId) {
          return a.email === where.email && a.tenantId === where.tenantId;
        }
        if (where.tenantId) return a.tenantId === where.tenantId;
        return false;
      }) || null;

      if (admin && include?.tenant) {
        return Promise.resolve({
          ...admin,
          tenant: this.tenants.find((t) => t.id === admin.tenantId) || null,
        });
      }
      return Promise.resolve(admin);
    }),

    findMany: jest.fn().mockImplementation(({ where, skip, take, include } = {}) => {
      let result = [...this.tenantAdmins];
      if (where?.tenantId) {
        result = result.filter((a) => a.tenantId === where.tenantId);
      }
      if (where?.role) {
        result = result.filter((a) => a.role === where.role);
      }
      if (where?.isActive !== undefined) {
        result = result.filter((a) => a.isActive === where.isActive);
      }
      // Include tenant
      if (include?.tenant) {
        result = result.map((admin) => ({
          ...admin,
          tenant: this.tenants.find((t) => t.id === admin.tenantId) || null,
        }));
      }
      // 分页
      if (skip !== undefined) {
        result = result.slice(skip);
      }
      if (take !== undefined) {
        result = result.slice(0, take);
      }
      return Promise.resolve(result);
    }),

    create: jest.fn().mockImplementation(({ data }) => {
      const newAdmin = {
        id: `tenant-admin-${Date.now()}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.tenantAdmins.push(newAdmin);
      return Promise.resolve(newAdmin);
    }),

    update: jest.fn().mockImplementation(({ where, data }) => {
      const index = this.tenantAdmins.findIndex((a) => a.id === where.id);
      if (index >= 0) {
        this.tenantAdmins[index] = {
          ...this.tenantAdmins[index],
          ...data,
          updatedAt: new Date(),
        };
        return Promise.resolve(this.tenantAdmins[index]);
      }
      return Promise.reject(new Error('Tenant admin not found'));
    }),

    delete: jest.fn().mockImplementation(({ where }) => {
      const index = this.tenantAdmins.findIndex((a) => a.id === where.id);
      if (index >= 0) {
        const deleted = this.tenantAdmins.splice(index, 1)[0];
        return Promise.resolve(deleted);
      }
      return Promise.reject(new Error('Tenant admin not found'));
    }),

    count: jest.fn().mockImplementation(({ where } = {}) => {
      let result = this.tenantAdmins;
      if (where?.tenantId) {
        result = result.filter((a) => a.tenantId === where.tenantId);
      }
      if (where?.role) {
        result = result.filter((a) => a.role === where.role);
      }
      if (where?.isActive !== undefined) {
        result = result.filter((a) => a.isActive === where.isActive);
      }
      return Promise.resolve(result.length);
    }),

    groupBy: jest.fn().mockImplementation(({ by, where, _count } = {}) => {
      let admins = [...this.tenantAdmins];
      if (where?.tenantId) {
        admins = admins.filter((a) => a.tenantId === where.tenantId);
      }
      if (by?.includes('role')) {
        // 按角色分组统计
        const roleCounts: Record<string, number> = {};
        admins.forEach((a) => {
          roleCounts[a.role] = (roleCounts[a.role] || 0) + 1;
        });
        return Promise.resolve(
          Object.entries(roleCounts).map(([role, count]) => ({
            role,
            _count: { role: count },
          })),
        );
      }
      if (by?.includes('tenantId')) {
        // 按租户分组统计
        const tenantCounts: Record<string, number> = {};
        admins.forEach((a) => {
          tenantCounts[a.tenantId] = (tenantCounts[a.tenantId] || 0) + 1;
        });
        return Promise.resolve(
          Object.entries(tenantCounts).map(([tenantId, count]) => ({
            tenantId,
            _count: { tenantId: count },
          })),
        );
      }
      return Promise.resolve([]);
    }),
  };

  // ==================== Middleware Instance 操作 ====================

  middlewareInstance = {
    findUnique: jest.fn().mockImplementation(({ where, include }) => {
      const instance = this.instances.find((i) => i.id === where.id) || null;
      if (instance && include?.tenant) {
        return Promise.resolve({
          ...instance,
          tenant: this.tenants.find((t) => t.id === instance.tenantId) || null,
        });
      }
      if (instance && include?.events) {
        return Promise.resolve({
          ...instance,
          events: this.instanceEvents.filter((e) => e.instanceId === instance.id),
        });
      }
      return Promise.resolve(instance);
    }),

    findFirst: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        this.instances.find((i) => {
          if (where.id) return i.id === where.id;
          if (where.tenantId) return i.tenantId === where.tenantId;
          return false;
        }) || null,
      );
    }),

    findMany: jest.fn().mockImplementation(({ where, skip, take, include } = {}) => {
      let result = [...this.instances];
      if (where?.tenantId) {
        result = result.filter((i) => i.tenantId === where.tenantId);
      }
      if (where?.status) {
        result = result.filter((i) => i.status === where.status);
      }
      // Include tenant
      if (include?.tenant) {
        result = result.map((instance) => ({
          ...instance,
          tenant: this.tenants.find((t) => t.id === instance.tenantId) || null,
        }));
      }
      // 分页
      if (skip !== undefined) {
        result = result.slice(skip);
      }
      if (take !== undefined) {
        result = result.slice(0, take);
      }
      return Promise.resolve(result);
    }),

    create: jest.fn().mockImplementation(({ data }) => {
      const newInstance = {
        id: `instance-${Date.now()}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.instances.push(newInstance);
      return Promise.resolve(newInstance);
    }),

    update: jest.fn().mockImplementation(({ where, data }) => {
      const index = this.instances.findIndex((i) => i.id === where.id);
      if (index >= 0) {
        this.instances[index] = {
          ...this.instances[index],
          ...data,
          updatedAt: new Date(),
        };
        return Promise.resolve(this.instances[index]);
      }
      return Promise.reject(new Error('Instance not found'));
    }),

    delete: jest.fn().mockImplementation(({ where }) => {
      const index = this.instances.findIndex((i) => i.id === where.id);
      if (index >= 0) {
        const deleted = this.instances.splice(index, 1)[0];
        return Promise.resolve(deleted);
      }
      return Promise.reject(new Error('Instance not found'));
    }),

    count: jest.fn().mockImplementation(({ where } = {}) => {
      let result = this.instances;
      if (where?.tenantId) {
        result = result.filter((i) => i.tenantId === where.tenantId);
      }
      if (where?.status) {
        result = result.filter((i) => i.status === where.status);
      }
      return Promise.resolve(result.length);
    }),

    groupBy: jest.fn().mockImplementation(({ by, _count } = {}) => {
      if (by?.includes('tenantId')) {
        // 按租户分组统计
        const tenantCounts: Record<string, number> = {};
        this.instances.forEach((i) => {
          tenantCounts[i.tenantId] = (tenantCounts[i.tenantId] || 0) + 1;
        });
        return Promise.resolve(
          Object.entries(tenantCounts).map(([tenantId, count]) => ({
            tenantId,
            _count: { tenantId: count },
          })),
        );
      }
      if (by?.includes('status')) {
        // 按状态分组统计
        const statusCounts: Record<string, number> = {};
        this.instances.forEach((i) => {
          statusCounts[i.status] = (statusCounts[i.status] || 0) + 1;
        });
        return Promise.resolve(
          Object.entries(statusCounts).map(([status, count]) => ({
            status,
            _count: { status: count },
          })),
        );
      }
      return Promise.resolve([]);
    }),
  };

  // ==================== Invoice 操作 ====================

  invoice = {
    findUnique: jest.fn().mockImplementation(({ where, include }) => {
      let invoice = null;
      if (where.id) {
        invoice = this.invoices.find((i) => i.id === where.id) || null;
      }
      if (where.invoiceNo) {
        invoice = this.invoices.find((i) => i.invoiceNo === where.invoiceNo) || null;
      }
      if (invoice && include?.tenant) {
        return Promise.resolve({
          ...invoice,
          tenant: this.tenants.find((t) => t.id === invoice!.tenantId) || null,
        });
      }
      return Promise.resolve(invoice);
    }),

    findMany: jest.fn().mockImplementation(({ where, skip, take, include, orderBy } = {}) => {
      let result = [...this.invoices];
      if (where?.tenantId) {
        result = result.filter((i) => i.tenantId === where.tenantId);
      }
      if (where?.status) {
        result = result.filter((i) => i.status === where.status);
      }
      // Include tenant
      if (include?.tenant) {
        result = result.map((invoice) => ({
          ...invoice,
          tenant: this.tenants.find((t) => t.id === invoice.tenantId) || null,
        }));
      }
      // 排序
      if (orderBy?.createdAt === 'desc') {
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      // 分页
      if (skip !== undefined) {
        result = result.slice(skip);
      }
      if (take !== undefined) {
        result = result.slice(0, take);
      }
      return Promise.resolve(result);
    }),

    create: jest.fn().mockImplementation(({ data }) => {
      const newInvoice = {
        id: `invoice-${Date.now()}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.invoices.push(newInvoice);
      return Promise.resolve(newInvoice);
    }),

    update: jest.fn().mockImplementation(({ where, data }) => {
      const index = this.invoices.findIndex((i) => i.id === where.id);
      if (index >= 0) {
        this.invoices[index] = {
          ...this.invoices[index],
          ...data,
          updatedAt: new Date(),
        };
        return Promise.resolve(this.invoices[index]);
      }
      return Promise.reject(new Error('Invoice not found'));
    }),

    count: jest.fn().mockImplementation(({ where } = {}) => {
      let result = this.invoices;
      if (where?.tenantId) {
        result = result.filter((i) => i.tenantId === where.tenantId);
      }
      if (where?.status) {
        result = result.filter((i) => i.status === where.status);
      }
      return Promise.resolve(result.length);
    }),

    groupBy: jest.fn().mockImplementation(({ by, _count, _sum } = {}) => {
      if (by?.includes('status')) {
        const statusStats: Record<string, { count: number; sum: number }> = {};
        this.invoices.forEach((invoice) => {
          if (!statusStats[invoice.status]) {
            statusStats[invoice.status] = { count: 0, sum: 0 };
          }
          statusStats[invoice.status].count++;
          statusStats[invoice.status].sum += Number(invoice.amount) || 0;
        });
        return Promise.resolve(
          Object.entries(statusStats).map(([status, stats]) => ({
            status,
            _count: _count ? { status: stats.count } : undefined,
            _sum: _sum ? { amount: stats.sum } : undefined,
          })),
        );
      }
      return Promise.resolve([]);
    }),

    updateMany: jest.fn().mockImplementation(({ where, data } = {}) => {
      let count = 0;
      this.invoices.forEach((invoice, index) => {
        let match = true;
        if (where?.status && invoice.status !== where.status) {
          match = false;
        }
        if (where?.dueDate?.lt) {
          const dueDate = new Date(invoice.dueDate);
          const compareDate = new Date(where.dueDate.lt);
          if (dueDate >= compareDate) {
            match = false;
          }
        }
        if (match) {
          this.invoices[index] = {
            ...this.invoices[index],
            ...data,
            updatedAt: new Date(),
          };
          count++;
        }
      });
      return Promise.resolve({ count });
    }),
  };

  // ==================== API Key 操作 ====================

  apiKey = {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      if (where.id) {
        return Promise.resolve(
          this.apiKeys.find((k) => k.id === where.id) || null,
        );
      }
      if (where.key) {
        return Promise.resolve(
          this.apiKeys.find((k) => k.key === where.key) || null,
        );
      }
      return Promise.resolve(null);
    }),

    findMany: jest.fn().mockImplementation(({ where } = {}) => {
      let result = [...this.apiKeys];
      if (where?.tenantId) {
        result = result.filter((k) => k.tenantId === where.tenantId);
      }
      if (where?.isActive !== undefined) {
        result = result.filter((k) => k.isActive === where.isActive);
      }
      return Promise.resolve(result);
    }),

    create: jest.fn().mockImplementation(({ data }) => {
      const newKey = {
        id: `apikey-${Date.now()}`,
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
      return Promise.reject(new Error('API Key not found'));
    }),

    delete: jest.fn().mockImplementation(({ where }) => {
      const index = this.apiKeys.findIndex((k) => k.id === where.id);
      if (index >= 0) {
        const deleted = this.apiKeys.splice(index, 1)[0];
        return Promise.resolve(deleted);
      }
      return Promise.reject(new Error('API Key not found'));
    }),
  };

  // ==================== Instance Event 操作 ====================

  instanceEvent = {
    findMany: jest.fn().mockImplementation(({ where, skip, take, orderBy } = {}) => {
      let result = [...this.instanceEvents];
      if (where?.instanceId) {
        result = result.filter((e) => e.instanceId === where.instanceId);
      }
      if (where?.eventType) {
        result = result.filter((e) => e.eventType === where.eventType);
      }
      if (where?.severity) {
        result = result.filter((e) => e.severity === where.severity);
      }
      // 排序
      if (orderBy?.createdAt === 'desc') {
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      // 分页
      if (skip !== undefined) {
        result = result.slice(skip);
      }
      if (take !== undefined) {
        result = result.slice(0, take);
      }
      return Promise.resolve(result);
    }),

    create: jest.fn().mockImplementation(({ data }) => {
      const newEvent = {
        id: `event-${Date.now()}`,
        ...data,
        createdAt: new Date(),
      };
      this.instanceEvents.push(newEvent);
      return Promise.resolve(newEvent);
    }),

    count: jest.fn().mockImplementation(({ where } = {}) => {
      let result = this.instanceEvents;
      if (where?.instanceId) {
        result = result.filter((e) => e.instanceId === where.instanceId);
      }
      return Promise.resolve(result.length);
    }),
  };

  // ==================== 事务支持 ====================

  $transaction = jest.fn().mockImplementation(async (operations) => {
    if (Array.isArray(operations)) {
      return Promise.all(operations);
    }
    return operations(this);
  });

  // ==================== 连接方法 ====================

  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);

  // ==================== 重置所有 Mock 数据 ====================

  resetMocks() {
    // 重置内存数据
    this.platformAdmins = [
      TEST_PLATFORM_ADMIN,
      TEST_PLATFORM_ADMIN_REGULAR,
      TEST_PLATFORM_ADMIN_OPERATOR,
      TEST_PLATFORM_ADMIN_DISABLED,
    ];
    this.tenants = [
      TEST_TENANT,
      TEST_TENANT_PENDING,
      TEST_TENANT_SUSPENDED,
      TEST_TENANT_EXPIRED,
    ];
    this.tenantAdmins = [
      TEST_TENANT_ADMIN,
      TEST_TENANT_ADMIN_OWNER,
      TEST_TENANT_ADMIN_OPERATOR,
      TEST_TENANT_ADMIN_DISABLED,
      TEST_TENANT_ADMIN_SUSPENDED,
    ];
    this.instances = [
      TEST_INSTANCE,
      TEST_INSTANCE_OFFLINE,
      TEST_INSTANCE_ERROR,
    ];
    this.invoices = [
      TEST_INVOICE,
      TEST_INVOICE_PENDING,
      TEST_INVOICE_OVERDUE,
    ];
    this.apiKeys = [
      TEST_API_KEY,
      TEST_API_KEY_READONLY,
    ];
    this.instanceEvents = [...TEST_INSTANCE_EVENTS];

    // 重置 platformAdmin mock 并恢复默认实现
    this.platformAdmin.findUnique.mockReset().mockImplementation(({ where }) => {
      if (where.id) {
        return Promise.resolve(
          this.platformAdmins.find((a) => a.id === where.id) || null,
        );
      }
      if (where.email) {
        return Promise.resolve(
          this.platformAdmins.find((a) => a.email === where.email) || null,
        );
      }
      return Promise.resolve(null);
    });

    this.platformAdmin.findFirst.mockReset().mockImplementation(({ where }) => {
      return Promise.resolve(
        this.platformAdmins.find((a) => {
          if (where.email) return a.email === where.email;
          if (where.id) return a.id === where.id;
          return false;
        }) || null,
      );
    });

    this.platformAdmin.findMany.mockReset().mockImplementation(({ where, skip, take, orderBy } = {}) => {
      let result = [...this.platformAdmins];
      if (where?.role) {
        result = result.filter((a) => a.role === where.role);
      }
      if (where?.isActive !== undefined) {
        result = result.filter((a) => a.isActive === where.isActive);
      }
      if (skip !== undefined) {
        result = result.slice(skip);
      }
      if (take !== undefined) {
        result = result.slice(0, take);
      }
      return Promise.resolve(result);
    });

    this.platformAdmin.create.mockReset().mockImplementation(({ data }) => {
      const newAdmin = {
        id: `platform-admin-${Date.now()}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.platformAdmins.push(newAdmin);
      return Promise.resolve(newAdmin);
    });

    this.platformAdmin.update.mockReset().mockImplementation(({ where, data }) => {
      const index = this.platformAdmins.findIndex((a) => a.id === where.id);
      if (index >= 0) {
        this.platformAdmins[index] = {
          ...this.platformAdmins[index],
          ...data,
          updatedAt: new Date(),
        };
        return Promise.resolve(this.platformAdmins[index]);
      }
      return Promise.reject(new Error('Platform admin not found'));
    });

    this.platformAdmin.delete.mockReset().mockImplementation(({ where }) => {
      const index = this.platformAdmins.findIndex((a) => a.id === where.id);
      if (index >= 0) {
        const deleted = this.platformAdmins.splice(index, 1)[0];
        return Promise.resolve(deleted);
      }
      return Promise.reject(new Error('Platform admin not found'));
    });

    this.platformAdmin.count.mockReset().mockImplementation(({ where } = {}) => {
      let result = this.platformAdmins;
      if (where?.role) {
        result = result.filter((a) => a.role === where.role);
      }
      return Promise.resolve(result.length);
    });

    // 重置 tenant mock
    this.tenant.findUnique.mockClear();
    this.tenant.findFirst.mockClear();
    this.tenant.findMany.mockClear();
    this.tenant.create.mockClear();
    this.tenant.update.mockClear();
    this.tenant.delete.mockClear();
    this.tenant.count.mockClear();
    this.tenant.groupBy.mockClear();

    // 重置 tenantAdmin mock 并恢复默认实现
    this.tenantAdmin.findUnique.mockReset().mockImplementation(({ where, include }) => {
      const admin = this.tenantAdmins.find((a) => a.id === where.id) || null;
      if (admin && include?.tenant) {
        return Promise.resolve({
          ...admin,
          tenant: this.tenants.find((t) => t.id === admin.tenantId) || null,
        });
      }
      return Promise.resolve(admin);
    });

    this.tenantAdmin.findFirst.mockReset().mockImplementation(({ where, include }) => {
      const admin = this.tenantAdmins.find((a) => {
        if (where.id) return a.id === where.id;
        if (where.email && where.tenantId) {
          return a.email === where.email && a.tenantId === where.tenantId;
        }
        if (where.tenantId) return a.tenantId === where.tenantId;
        return false;
      }) || null;

      if (admin && include?.tenant) {
        return Promise.resolve({
          ...admin,
          tenant: this.tenants.find((t) => t.id === admin.tenantId) || null,
        });
      }
      return Promise.resolve(admin);
    });

    this.tenantAdmin.findMany.mockClear();
    this.tenantAdmin.create.mockClear();
    this.tenantAdmin.update.mockClear();
    this.tenantAdmin.delete.mockClear();
    this.tenantAdmin.count.mockClear();

    // 重置其他 mock
    this.middlewareInstance.findUnique.mockClear();
    this.middlewareInstance.findFirst.mockClear();
    this.middlewareInstance.findMany.mockClear();
    this.middlewareInstance.create.mockClear();
    this.middlewareInstance.update.mockClear();
    this.middlewareInstance.delete.mockClear();
    this.middlewareInstance.count.mockClear();
    this.middlewareInstance.groupBy.mockClear();

    this.invoice.findUnique.mockClear();
    this.invoice.findMany.mockClear();
    this.invoice.create.mockClear();
    this.invoice.update.mockClear();
    this.invoice.count.mockClear();

    this.apiKey.findUnique.mockClear();
    this.apiKey.findMany.mockClear();
    this.apiKey.create.mockClear();
    this.apiKey.update.mockClear();
    this.apiKey.delete.mockClear();

    this.instanceEvent.findMany.mockClear();
    this.instanceEvent.create.mockClear();
    this.instanceEvent.count.mockClear();
  }
}
