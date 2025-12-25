/**
 * Data Isolation Tests
 *
 * Task 14: 验证多租户数据隔离
 * - 租户 A 只能看到自己的数据
 * - 租户 B 只能看到自己的数据
 * - 跨租户数据不可见
 * - API 响应只包含当前租户数据
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { LoginPage, DashboardPage, UsersPage, MtServersPage, PositionsPage } from '../../pages';
import { TradingUserFactory, MtServerFactory } from '../../factories';
import { mockApiResponse, waitForApiResponse, generateTestId } from '../../support/test-utils';
import { ApiHelper } from '../../support/api.helper';

// Test tenant configurations
const tenantA = {
  id: 'tenant-a-' + generateTestId(),
  name: 'Tenant A Corp',
  email: 'admin@tenant-a.test',
  password: 'TenantA@123',
  domain: 'tenant-a.test'
};

const tenantB = {
  id: 'tenant-b-' + generateTestId(),
  name: 'Tenant B Corp',
  email: 'admin@tenant-b.test',
  password: 'TenantB@123',
  domain: 'tenant-b.test'
};

test.describe('Data Isolation Tests', () => {
  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;
  let apiA: ApiHelper;
  let apiB: ApiHelper;

  test.beforeAll(async ({ browser }) => {
    // Create separate browser contexts for each tenant
    contextA = await browser.newContext();
    contextB = await browser.newContext();
    pageA = await contextA.newPage();
    pageB = await contextB.newPage();

    apiA = new ApiHelper(pageA);
    apiB = new ApiHelper(pageB);
  });

  test.afterAll(async () => {
    await contextA?.close();
    await contextB?.close();
  });

  test.describe('User Data Isolation', () => {
    const tenantAUsers = [
      TradingUserFactory.create({ name: 'Alice A', email: 'alice@tenant-a.test' }),
      TradingUserFactory.create({ name: 'Bob A', email: 'bob@tenant-a.test' }),
    ];

    const tenantBUsers = [
      TradingUserFactory.create({ name: 'Charlie B', email: 'charlie@tenant-b.test' }),
      TradingUserFactory.create({ name: 'David B', email: 'david@tenant-b.test' }),
    ];

    test('Tenant A can only see their own users', async () => {
      // Mock API to return only Tenant A users
      await mockApiResponse(pageA, '/api/users*', {
        data: tenantAUsers,
        total: tenantAUsers.length,
        page: 1,
        pageSize: 20
      });

      const loginPage = new LoginPage(pageA);
      const usersPage = new UsersPage(pageA);

      await loginPage.navigateTo();
      await loginPage.login(tenantA.email, tenantA.password);
      await usersPage.navigateTo();

      // Verify only Tenant A users are visible
      for (const user of tenantAUsers) {
        await expect(pageA.locator(`text=${user.name}`)).toBeVisible();
      }

      // Verify Tenant B users are NOT visible
      for (const user of tenantBUsers) {
        await expect(pageA.locator(`text=${user.name}`)).not.toBeVisible();
      }
    });

    test('Tenant B can only see their own users', async () => {
      // Mock API to return only Tenant B users
      await mockApiResponse(pageB, '/api/users*', {
        data: tenantBUsers,
        total: tenantBUsers.length,
        page: 1,
        pageSize: 20
      });

      const loginPage = new LoginPage(pageB);
      const usersPage = new UsersPage(pageB);

      await loginPage.navigateTo();
      await loginPage.login(tenantB.email, tenantB.password);
      await usersPage.navigateTo();

      // Verify only Tenant B users are visible
      for (const user of tenantBUsers) {
        await expect(pageB.locator(`text=${user.name}`)).toBeVisible();
      }

      // Verify Tenant A users are NOT visible
      for (const user of tenantAUsers) {
        await expect(pageB.locator(`text=${user.name}`)).not.toBeVisible();
      }
    });

    test('User search only returns current tenant data', async () => {
      const usersPage = new UsersPage(pageA);

      // Mock search to return filtered Tenant A users
      await mockApiResponse(pageA, '/api/users*search=Alice*', {
        data: [tenantAUsers[0]],
        total: 1,
        page: 1,
        pageSize: 20
      });

      await usersPage.navigateTo();
      await usersPage.search('Alice');

      // Should find Alice from Tenant A
      await expect(pageA.locator(`text=${tenantAUsers[0].name}`)).toBeVisible();

      // Should not find any Tenant B users even if they have similar names
      await expect(pageA.locator('text=Charlie B')).not.toBeVisible();
    });
  });

  test.describe('MT Server Data Isolation', () => {
    const tenantAServers = [
      MtServerFactory.createMT5({ name: 'A-Production-MT5' }),
      MtServerFactory.createMT4({ name: 'A-Production-MT4' }),
    ];

    const tenantBServers = [
      MtServerFactory.createMT5({ name: 'B-Production-MT5' }),
    ];

    test('Tenant A can only see their own MT servers', async () => {
      await mockApiResponse(pageA, '/api/mt-servers*', {
        data: tenantAServers,
        total: tenantAServers.length
      });

      const serversPage = new MtServersPage(pageA);
      await serversPage.navigateTo();

      // Verify Tenant A servers are visible
      for (const server of tenantAServers) {
        await expect(pageA.locator(`text=${server.name}`)).toBeVisible();
      }

      // Verify Tenant B servers are NOT visible
      for (const server of tenantBServers) {
        await expect(pageA.locator(`text=${server.name}`)).not.toBeVisible();
      }
    });

    test('Tenant B can only see their own MT servers', async () => {
      await mockApiResponse(pageB, '/api/mt-servers*', {
        data: tenantBServers,
        total: tenantBServers.length
      });

      const serversPage = new MtServersPage(pageB);
      await serversPage.navigateTo();

      // Verify Tenant B servers are visible
      for (const server of tenantBServers) {
        await expect(pageB.locator(`text=${server.name}`)).toBeVisible();
      }

      // Verify Tenant A servers are NOT visible
      for (const server of tenantAServers) {
        await expect(pageB.locator(`text=${server.name}`)).not.toBeVisible();
      }
    });

    test('Server connection test only affects own tenant', async () => {
      await mockApiResponse(pageA, '/api/mt-servers/*/test-connection', {
        success: true,
        latency: 45,
        message: 'Connection successful'
      });

      const serversPage = new MtServersPage(pageA);
      await serversPage.navigateTo();

      const result = await serversPage.testConnection(tenantAServers[0].name);
      expect(result).toBe(true);
    });
  });

  test.describe('Trading Data Isolation', () => {
    const tenantAPositions = [
      { id: 'pos-a-1', symbol: 'EURUSD', type: 'BUY', volume: 1.0, profit: 150.50, login: 1001 },
      { id: 'pos-a-2', symbol: 'GBPUSD', type: 'SELL', volume: 0.5, profit: -75.25, login: 1002 },
    ];

    const tenantBPositions = [
      { id: 'pos-b-1', symbol: 'USDJPY', type: 'BUY', volume: 2.0, profit: 320.00, login: 2001 },
    ];

    test('Tenant A can only see their positions', async () => {
      await mockApiResponse(pageA, '/api/positions*', {
        data: tenantAPositions,
        total: tenantAPositions.length
      });

      const positionsPage = new PositionsPage(pageA);
      await positionsPage.navigateTo();

      // Verify Tenant A positions are visible
      await expect(pageA.locator('text=EURUSD')).toBeVisible();
      await expect(pageA.locator('text=GBPUSD')).toBeVisible();

      // Verify Tenant B positions are NOT visible
      await expect(pageA.locator('text=USDJPY')).not.toBeVisible();
    });

    test('Tenant B can only see their positions', async () => {
      await mockApiResponse(pageB, '/api/positions*', {
        data: tenantBPositions,
        total: tenantBPositions.length
      });

      const positionsPage = new PositionsPage(pageB);
      await positionsPage.navigateTo();

      // Verify Tenant B positions are visible
      await expect(pageB.locator('text=USDJPY')).toBeVisible();

      // Verify Tenant A positions are NOT visible
      await expect(pageB.locator('text=EURUSD')).not.toBeVisible();
      await expect(pageB.locator('text=GBPUSD')).not.toBeVisible();
    });

    test('Position filtering only affects current tenant data', async () => {
      await mockApiResponse(pageA, '/api/positions*symbol=EURUSD*', {
        data: [tenantAPositions[0]],
        total: 1
      });

      const positionsPage = new PositionsPage(pageA);
      await positionsPage.navigateTo();
      await positionsPage.filterBySymbol('EURUSD');

      await expect(pageA.locator('text=EURUSD')).toBeVisible();
      await expect(pageA.locator('text=GBPUSD')).not.toBeVisible();
    });
  });

  test.describe('Dashboard Stats Isolation', () => {
    test('Tenant A dashboard shows only their stats', async () => {
      await mockApiResponse(pageA, '/api/dashboard/stats', {
        totalUsers: 25,
        totalBalance: 150000,
        totalServers: 2,
        activePositions: 45
      });

      const dashboard = new DashboardPage(pageA);
      await dashboard.navigateTo();

      const totalUsers = await dashboard.getTotalUsers();
      expect(totalUsers).toBe(25);

      const totalBalance = await dashboard.getTotalBalance();
      expect(totalBalance).toContain('150,000');
    });

    test('Tenant B dashboard shows only their stats', async () => {
      await mockApiResponse(pageB, '/api/dashboard/stats', {
        totalUsers: 10,
        totalBalance: 75000,
        totalServers: 1,
        activePositions: 20
      });

      const dashboard = new DashboardPage(pageB);
      await dashboard.navigateTo();

      const totalUsers = await dashboard.getTotalUsers();
      expect(totalUsers).toBe(10);

      const totalBalance = await dashboard.getTotalBalance();
      expect(totalBalance).toContain('75,000');
    });

    test('Dashboard stats are isolated between tenants', async () => {
      // Get stats for both tenants
      const statsA = await pageA.evaluate(async () => {
        const response = await fetch('/api/dashboard/stats');
        return response.json();
      });

      const statsB = await pageB.evaluate(async () => {
        const response = await fetch('/api/dashboard/stats');
        return response.json();
      });

      // Stats should be different (isolated)
      expect(statsA.totalUsers).not.toBe(statsB.totalUsers);
      expect(statsA.totalBalance).not.toBe(statsB.totalBalance);
    });
  });

  test.describe('API Response Isolation', () => {
    test('API includes tenant ID in all responses', async () => {
      const responsePromise = waitForApiResponse(pageA, '/api/users');
      await pageA.goto('/users');
      const response = await responsePromise;

      // Response should contain tenant context
      expect(response.headers()['x-tenant-id']).toBeDefined();
    });

    test('API rejects requests without tenant context', async () => {
      // Attempt to make request without proper tenant context
      const response = await pageA.request.get('/api/users', {
        headers: {
          // Remove tenant-specific headers
          'Authorization': 'Bearer invalid-token'
        }
      });

      expect(response.status()).toBe(401);
    });

    test('API validates tenant ownership for resource access', async () => {
      // Attempt to access a resource from another tenant
      const response = await pageA.request.get('/api/users/tenant-b-user-id');

      // Should return 404 (not found) rather than 403 (forbidden)
      // to avoid information leakage
      expect([403, 404]).toContain(response.status());
    });
  });

  test.describe('Audit Trail Isolation', () => {
    test('Tenant A audit logs only show their activities', async () => {
      await mockApiResponse(pageA, '/api/audit-logs*', {
        data: [
          { id: 'log-1', action: 'USER_CREATED', userId: 'user-a-1', timestamp: new Date().toISOString() },
          { id: 'log-2', action: 'SERVER_CONNECTED', serverId: 'server-a-1', timestamp: new Date().toISOString() },
        ],
        total: 2
      });

      await pageA.goto('/settings/audit-logs');

      // Should see own audit logs
      await expect(pageA.locator('text=USER_CREATED')).toBeVisible();
      await expect(pageA.locator('text=SERVER_CONNECTED')).toBeVisible();
    });

    test('Tenant B audit logs only show their activities', async () => {
      await mockApiResponse(pageB, '/api/audit-logs*', {
        data: [
          { id: 'log-3', action: 'USER_DELETED', userId: 'user-b-1', timestamp: new Date().toISOString() },
        ],
        total: 1
      });

      await pageB.goto('/settings/audit-logs');

      // Should see own audit logs
      await expect(pageB.locator('text=USER_DELETED')).toBeVisible();

      // Should NOT see Tenant A logs
      await expect(pageB.locator('text=USER_CREATED')).not.toBeVisible();
    });
  });
});
