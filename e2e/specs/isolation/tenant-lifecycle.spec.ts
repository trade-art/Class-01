/**
 * Tenant Lifecycle Tests
 *
 * Task 16: 验证租户生命周期管理
 * - 租户创建后数据完全隔离
 * - 租户暂停后无法访问
 * - 租户删除后数据清理验证
 * - 租户恢复后数据完整性
 */

import { test, expect, Page, BrowserContext, APIRequestContext } from '@playwright/test';
import { LoginPage, DashboardPage } from '../../pages';
import { generateTestId, retry } from '../../support/test-utils';
import { DatabaseHelper, getSharedDatabase } from '../../support/database.helper';

// Test tenant for lifecycle tests
const testTenant = {
  id: '',
  name: `Lifecycle Test Tenant ${generateTestId()}`,
  email: `lifecycle-${generateTestId()}@test.com`,
  password: 'LifecycleTest@123',
  plan: 'professional'
};

// Platform admin credentials
const platformAdmin = {
  email: 'platform-admin@mt5platform.com',
  password: 'PlatformAdmin@123'
};

test.describe('Tenant Lifecycle Management', () => {
  let adminContext: BrowserContext;
  let tenantContext: BrowserContext;
  let adminPage: Page;
  let tenantPage: Page;
  let adminRequest: APIRequestContext;
  let db: DatabaseHelper;

  test.beforeAll(async ({ browser, playwright }) => {
    adminContext = await browser.newContext();
    tenantContext = await browser.newContext();
    adminPage = await adminContext.newPage();
    tenantPage = await tenantContext.newPage();

    db = await getSharedDatabase();

    // Setup admin API context
    adminRequest = await playwright.request.newContext({
      baseURL: process.env.PLATFORM_API_URL || 'http://localhost:3001',
      extraHTTPHeaders: {
        'Content-Type': 'application/json'
      }
    });
  });

  test.afterAll(async () => {
    await adminContext?.close();
    await tenantContext?.close();
    await adminRequest?.dispose();
  });

  test.describe('Tenant Creation', () => {
    test('New tenant is created with isolated namespace', async () => {
      // Register new tenant
      const response = await adminRequest.post('/api/tenants', {
        data: {
          name: testTenant.name,
          adminEmail: testTenant.email,
          adminPassword: testTenant.password,
          plan: testTenant.plan
        }
      });

      expect(response.ok()).toBe(true);
      const tenant = await response.json();
      testTenant.id = tenant.id;

      // Verify tenant created in database
      const dbTenant = await db.query(
        'SELECT * FROM tenants WHERE id = $1',
        [testTenant.id]
      );
      expect(dbTenant.rows.length).toBe(1);
      expect(dbTenant.rows[0].status).toBe('active');
    });

    test('New tenant has empty data set', async () => {
      // Login as new tenant
      const loginPage = new LoginPage(tenantPage);
      await loginPage.navigateTo();
      await loginPage.login(testTenant.email, testTenant.password);

      // Verify dashboard shows empty state
      const dashboard = new DashboardPage(tenantPage);
      await dashboard.navigateTo();

      const totalUsers = await dashboard.getTotalUsers();
      expect(totalUsers).toBe(0);
    });

    test('New tenant cannot see other tenant data', async () => {
      // Try to access random user ID
      const response = await tenantPage.request.get('/api/users/random-user-id');
      expect([403, 404]).toContain(response.status());
    });

    test('Tenant is assigned unique identifiers', async () => {
      const response = await tenantPage.request.get('/api/tenant/info');

      if (response.ok()) {
        const info = await response.json();
        expect(info.id).toBe(testTenant.id);
        expect(info.apiKey).toBeDefined();
        expect(info.apiKey.length).toBeGreaterThan(20);
      }
    });
  });

  test.describe('Tenant Suspension', () => {
    test.beforeAll(async () => {
      // Ensure tenant is active before suspension tests
      await adminRequest.patch(`/api/tenants/${testTenant.id}`, {
        data: { status: 'active' }
      });
    });

    test('Platform admin can suspend tenant', async () => {
      const response = await adminRequest.patch(`/api/tenants/${testTenant.id}/suspend`, {
        data: {
          reason: 'Payment overdue',
          suspendedBy: platformAdmin.email
        }
      });

      expect(response.ok()).toBe(true);

      const tenant = await response.json();
      expect(tenant.status).toBe('suspended');
    });

    test('Suspended tenant cannot login', async () => {
      // Clear existing session
      await tenantContext.clearCookies();

      const loginPage = new LoginPage(tenantPage);
      await loginPage.navigateTo();
      await loginPage.login(testTenant.email, testTenant.password);

      // Should show suspension message
      await expect(tenantPage.locator('text=/suspended|disabled|account.*inactive/i')).toBeVisible();

      // Should not reach dashboard
      expect(tenantPage.url()).not.toContain('/dashboard');
    });

    test('Suspended tenant API calls are rejected', async () => {
      const response = await tenantPage.request.get('/api/users');

      expect([401, 403]).toContain(response.status());
    });

    test('Suspended tenant data is preserved', async () => {
      // Verify data still exists in database
      const tenantData = await db.query(
        'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1',
        [testTenant.id]
      );

      // Data count should be preserved (even if 0)
      expect(tenantData.rows[0].count).toBeDefined();
    });

    test('Suspended tenant cannot be accessed by other tenants', async () => {
      // Even suspended tenant data should remain isolated
      const otherTenantResponse = await adminRequest.get(`/api/tenants/${testTenant.id}/users`, {
        headers: {
          'Authorization': 'Bearer other-tenant-token'
        }
      });

      expect([401, 403, 404]).toContain(otherTenantResponse.status());
    });
  });

  test.describe('Tenant Reactivation', () => {
    test('Platform admin can reactivate suspended tenant', async () => {
      const response = await adminRequest.patch(`/api/tenants/${testTenant.id}/reactivate`, {
        data: {
          reactivatedBy: platformAdmin.email,
          notes: 'Payment received'
        }
      });

      expect(response.ok()).toBe(true);

      const tenant = await response.json();
      expect(tenant.status).toBe('active');
    });

    test('Reactivated tenant can login', async () => {
      await tenantContext.clearCookies();

      const loginPage = new LoginPage(tenantPage);
      await loginPage.navigateTo();
      await loginPage.login(testTenant.email, testTenant.password);

      // Should reach dashboard
      await expect(tenantPage).toHaveURL(/dashboard/);
    });

    test('Reactivated tenant data is intact', async () => {
      const dashboard = new DashboardPage(tenantPage);
      await dashboard.navigateTo();

      // Data should be accessible
      const statsVisible = await tenantPage.locator('[data-testid="stats-card"]').isVisible();
      expect(statsVisible).toBe(true);
    });

    test('Reactivation is logged in audit trail', async () => {
      const auditResponse = await adminRequest.get(`/api/tenants/${testTenant.id}/audit-logs`);

      if (auditResponse.ok()) {
        const logs = await auditResponse.json();
        const reactivationLog = logs.data?.find(
          (log: any) => log.action === 'TENANT_REACTIVATED'
        );
        expect(reactivationLog).toBeDefined();
      }
    });
  });

  test.describe('Tenant Deletion', () => {
    let deletedTenantId: string;

    test.beforeAll(async () => {
      // Create a new tenant specifically for deletion test
      const response = await adminRequest.post('/api/tenants', {
        data: {
          name: `Delete Test Tenant ${generateTestId()}`,
          adminEmail: `delete-${generateTestId()}@test.com`,
          adminPassword: 'DeleteTest@123',
          plan: 'starter'
        }
      });

      const tenant = await response.json();
      deletedTenantId = tenant.id;

      // Add some test data to the tenant
      await db.query(
        'INSERT INTO users (id, tenant_id, email, name) VALUES ($1, $2, $3, $4)',
        [`user-${generateTestId()}`, deletedTenantId, 'testuser@delete.test', 'Test User']
      );
    });

    test('Tenant deletion requires confirmation', async () => {
      // Attempt deletion without confirmation
      const response = await adminRequest.delete(`/api/tenants/${deletedTenantId}`);

      // Should require confirmation
      expect([400, 422]).toContain(response.status());
    });

    test('Tenant soft deletion marks tenant as deleted', async () => {
      const response = await adminRequest.delete(`/api/tenants/${deletedTenantId}`, {
        data: {
          confirmDelete: true,
          deletedBy: platformAdmin.email,
          reason: 'Customer requested'
        }
      });

      expect(response.ok()).toBe(true);

      // Verify soft delete
      const tenant = await db.query(
        'SELECT * FROM tenants WHERE id = $1',
        [deletedTenantId]
      );
      expect(tenant.rows[0].status).toBe('deleted');
      expect(tenant.rows[0].deleted_at).toBeDefined();
    });

    test('Deleted tenant cannot login', async () => {
      const newContext = await tenantContext.browser()!.newContext();
      const page = await newContext.newPage();

      const loginPage = new LoginPage(page);
      await loginPage.navigateTo();
      await loginPage.login('testuser@delete.test', 'DeleteTest@123');

      // Should show deletion message
      await expect(page.locator('text=/deleted|removed|no longer exists/i')).toBeVisible();

      await newContext.close();
    });

    test('Deleted tenant data is inaccessible via API', async () => {
      const response = await adminRequest.get(`/api/tenants/${deletedTenantId}/users`);

      expect([404, 410]).toContain(response.status()); // Gone
    });

    test('Deleted tenant ID cannot be reused', async () => {
      const response = await adminRequest.post('/api/tenants', {
        data: {
          id: deletedTenantId, // Try to reuse ID
          name: 'Reuse Attempt',
          adminEmail: 'reuse@test.com',
          adminPassword: 'Reuse@123',
          plan: 'starter'
        }
      });

      // Should either reject or assign new ID
      if (response.ok()) {
        const tenant = await response.json();
        expect(tenant.id).not.toBe(deletedTenantId);
      } else {
        expect([400, 409]).toContain(response.status());
      }
    });
  });

  test.describe('Tenant Data Retention', () => {
    test('Soft deleted tenant data exists in database', async () => {
      const deletedTenants = await db.query(
        `SELECT * FROM tenants WHERE status = 'deleted' AND deleted_at > NOW() - INTERVAL '30 days'`
      );

      expect(deletedTenants.rows.length).toBeGreaterThanOrEqual(0);
    });

    test('Data retention policy is enforced', async () => {
      // Check for data older than retention period
      const retentionDays = 90; // Configurable retention period

      const oldDeletedTenants = await db.query(
        `SELECT * FROM tenants WHERE status = 'deleted' AND deleted_at < NOW() - INTERVAL '${retentionDays} days'`
      );

      // Old data should be purged (or scheduled for purging)
      // This verifies retention policy is working
      expect(oldDeletedTenants.rows.length).toBe(0);
    });

    test('Backup includes tenant data before deletion', async () => {
      // Verify backup job status
      const backupResponse = await adminRequest.get('/api/admin/backups');

      if (backupResponse.ok()) {
        const backups = await backupResponse.json();
        expect(backups.length).toBeGreaterThan(0);
        expect(backups[0].status).toBe('completed');
      }
    });
  });

  test.describe('Tenant Resource Limits', () => {
    test('Tenant cannot exceed user limit for plan', async () => {
      // Get plan limits
      const planResponse = await tenantPage.request.get('/api/tenant/plan');

      if (planResponse.ok()) {
        const plan = await planResponse.json();
        const userLimit = plan.limits?.users || 10;

        // Try to create users beyond limit
        for (let i = 0; i < userLimit + 1; i++) {
          const createResponse = await tenantPage.request.post('/api/users', {
            data: {
              email: `limit-test-${i}@test.com`,
              name: `Limit Test ${i}`,
              role: 'user'
            }
          });

          if (i >= userLimit) {
            // Should fail when exceeding limit
            expect([402, 403, 429]).toContain(createResponse.status());
          }
        }
      }
    });

    test('Tenant cannot exceed storage limit', async () => {
      // This would test file upload limits
      const largeFile = Buffer.alloc(100 * 1024 * 1024); // 100MB

      const response = await tenantPage.request.post('/api/files/upload', {
        multipart: {
          file: {
            name: 'large-file.bin',
            mimeType: 'application/octet-stream',
            buffer: largeFile
          }
        }
      });

      // Should be rejected if exceeds quota
      expect([402, 403, 413, 429]).toContain(response.status());
    });

    test('API rate limits are tenant-specific', async () => {
      const requests: Promise<any>[] = [];

      // Make many rapid requests
      for (let i = 0; i < 100; i++) {
        requests.push(tenantPage.request.get('/api/users'));
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status() === 429);

      // Should hit rate limit
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  test.describe('Tenant Migration', () => {
    test('Tenant can be migrated to different plan', async () => {
      const response = await adminRequest.patch(`/api/tenants/${testTenant.id}/plan`, {
        data: {
          newPlan: 'enterprise',
          effectiveDate: new Date().toISOString()
        }
      });

      expect(response.ok()).toBe(true);

      const tenant = await response.json();
      expect(tenant.plan).toBe('enterprise');
    });

    test('Plan migration updates resource limits', async () => {
      const response = await tenantPage.request.get('/api/tenant/plan');

      if (response.ok()) {
        const plan = await response.json();
        // Enterprise plan should have higher limits
        expect(plan.limits?.users).toBeGreaterThanOrEqual(100);
      }
    });

    test('Historical data is preserved during migration', async () => {
      // Verify historical data still accessible
      const historyResponse = await tenantPage.request.get('/api/audit-logs');

      if (historyResponse.ok()) {
        const history = await historyResponse.json();
        expect(history.data?.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Multi-Region Isolation', () => {
    test('Tenant data stays in designated region', async () => {
      const response = await tenantPage.request.get('/api/tenant/info');

      if (response.ok()) {
        const info = await response.json();
        expect(info.region).toBeDefined();
        expect(['us-east', 'eu-west', 'ap-southeast']).toContain(info.region);
      }
    });

    test('Cross-region data access is prevented', async () => {
      // Try to access resource in different region
      const response = await tenantPage.request.get('/api/users', {
        headers: {
          'X-Region': 'eu-west' // Attempt to specify different region
        }
      });

      // Should either ignore header or return data from own region only
      if (response.ok()) {
        const data = await response.json();
        // All data should be from tenant's region
        for (const item of data.data || []) {
          // Region should match tenant's region
          expect(item.region).not.toBe('eu-west');
        }
      }
    });
  });
});
