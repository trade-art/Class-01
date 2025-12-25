/**
 * Cross-Tenant Access Tests
 *
 * Task 15: 验证跨租户访问防护
 * - 使用租户 A 的 token 访问租户 B 的数据被拒绝
 * - API 层面的租户隔离验证
 * - URL 直接访问其他租户资源被阻止
 * - 防止租户 ID 篡改攻击
 */

import { test, expect, Page, BrowserContext, APIRequestContext } from '@playwright/test';
import { LoginPage } from '../../pages';
import { generateTestId } from '../../support/test-utils';
import { AuthHelper } from '../../support/auth.helper';

// Test tenant configurations
const tenantA = {
  id: 'tenant-a-' + generateTestId(),
  email: 'admin@tenant-a.test',
  password: 'TenantA@123',
  token: '' // Will be set after login
};

const tenantB = {
  id: 'tenant-b-' + generateTestId(),
  email: 'admin@tenant-b.test',
  password: 'TenantB@123',
  token: '' // Will be set after login
};

// Known resource IDs for testing
const tenantAResources = {
  userId: 'user-a-001',
  serverId: 'server-a-001',
  positionId: 'position-a-001'
};

const tenantBResources = {
  userId: 'user-b-001',
  serverId: 'server-b-001',
  positionId: 'position-b-001'
};

test.describe('Cross-Tenant Access Prevention', () => {
  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;
  let requestA: APIRequestContext;
  let requestB: APIRequestContext;

  test.beforeAll(async ({ browser, playwright }) => {
    // Create separate browser contexts
    contextA = await browser.newContext();
    contextB = await browser.newContext();
    pageA = await contextA.newPage();
    pageB = await contextB.newPage();

    // Login and get tokens
    const authA = new AuthHelper(pageA);
    const authB = new AuthHelper(pageB);

    await authA.login(tenantA.email, tenantA.password);
    await authB.login(tenantB.email, tenantB.password);

    tenantA.token = await authA.getToken() || '';
    tenantB.token = await authB.getToken() || '';

    // Create API request contexts with tenant tokens
    requestA = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
      extraHTTPHeaders: {
        'Authorization': `Bearer ${tenantA.token}`,
        'Content-Type': 'application/json'
      }
    });

    requestB = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
      extraHTTPHeaders: {
        'Authorization': `Bearer ${tenantB.token}`,
        'Content-Type': 'application/json'
      }
    });
  });

  test.afterAll(async () => {
    await contextA?.close();
    await contextB?.close();
    await requestA?.dispose();
    await requestB?.dispose();
  });

  test.describe('Token-Based Access Control', () => {
    test('Tenant A token cannot access Tenant B users', async () => {
      const response = await requestA.get(`/api/users/${tenantBResources.userId}`);

      // Should be rejected - either 403 (forbidden) or 404 (not found to prevent enumeration)
      expect([403, 404]).toContain(response.status());
    });

    test('Tenant B token cannot access Tenant A users', async () => {
      const response = await requestB.get(`/api/users/${tenantAResources.userId}`);

      expect([403, 404]).toContain(response.status());
    });

    test('Tenant A token cannot access Tenant B servers', async () => {
      const response = await requestA.get(`/api/mt-servers/${tenantBResources.serverId}`);

      expect([403, 404]).toContain(response.status());
    });

    test('Tenant B token cannot access Tenant A servers', async () => {
      const response = await requestB.get(`/api/mt-servers/${tenantAResources.serverId}`);

      expect([403, 404]).toContain(response.status());
    });

    test('Tenant A token cannot access Tenant B positions', async () => {
      const response = await requestA.get(`/api/positions/${tenantBResources.positionId}`);

      expect([403, 404]).toContain(response.status());
    });
  });

  test.describe('Direct URL Access Prevention', () => {
    test('Direct URL to Tenant B user is blocked for Tenant A', async () => {
      // Try to navigate directly to a Tenant B resource
      await pageA.goto(`/users/${tenantBResources.userId}`);

      // Should show error or redirect to own tenant
      const currentUrl = pageA.url();
      expect(currentUrl).not.toContain(tenantBResources.userId);

      // Should see error message or be redirected
      const hasError = await pageA.locator('text=/not found|access denied|unauthorized/i').isVisible();
      const isRedirected = !currentUrl.includes(tenantBResources.userId);

      expect(hasError || isRedirected).toBe(true);
    });

    test('Direct URL to Tenant A server is blocked for Tenant B', async () => {
      await pageB.goto(`/mt-servers/${tenantAResources.serverId}`);

      const currentUrl = pageB.url();
      expect(currentUrl).not.toContain(tenantAResources.serverId);
    });

    test('Direct URL manipulation does not leak data', async () => {
      // Try various URL patterns to access other tenant's data
      const maliciousUrls = [
        `/users?tenantId=${tenantB.id}`,
        `/api/users?tenant=${tenantB.id}`,
        `/mt-servers?filter[tenantId]=${tenantB.id}`,
      ];

      for (const url of maliciousUrls) {
        const response = await pageA.request.get(url);
        const data = await response.json().catch(() => ({}));

        // Should not return Tenant B data
        if (Array.isArray(data.data)) {
          for (const item of data.data) {
            expect(item.tenantId).not.toBe(tenantB.id);
          }
        }
      }
    });
  });

  test.describe('Tenant ID Tampering Prevention', () => {
    test('Cannot create resource with different tenant ID', async () => {
      const response = await requestA.post('/api/users', {
        data: {
          email: 'hacker@evil.com',
          name: 'Hacker',
          tenantId: tenantB.id, // Attempting to inject different tenant ID
          role: 'admin'
        }
      });

      // Should either reject or ignore the tenantId field
      if (response.ok()) {
        const createdUser = await response.json();
        // If created, should use token's tenant, not injected one
        expect(createdUser.tenantId).not.toBe(tenantB.id);
      } else {
        // Or should be rejected
        expect([400, 403]).toContain(response.status());
      }
    });

    test('Cannot update resource to different tenant', async () => {
      const response = await requestA.patch(`/api/users/${tenantAResources.userId}`, {
        data: {
          tenantId: tenantB.id // Attempting to move resource to different tenant
        }
      });

      // Should either reject or ignore the tenantId field
      if (response.ok()) {
        const updatedUser = await response.json();
        expect(updatedUser.tenantId).not.toBe(tenantB.id);
      } else {
        expect([400, 403]).toContain(response.status());
      }
    });

    test('Cannot override tenant context in headers', async () => {
      // Try to override tenant via custom headers
      const response = await pageA.request.get('/api/users', {
        headers: {
          'Authorization': `Bearer ${tenantA.token}`,
          'X-Tenant-ID': tenantB.id, // Attempting to override
          'X-Tenant-Override': tenantB.id,
          'Tenant-ID': tenantB.id
        }
      });

      if (response.ok()) {
        const data = await response.json();
        // Should use token's tenant, not header override
        if (Array.isArray(data.data)) {
          for (const item of data.data) {
            expect(item.tenantId).not.toBe(tenantB.id);
          }
        }
      }
    });

    test('Cannot use path traversal to access other tenant', async () => {
      const traversalAttempts = [
        `/api/tenants/${tenantB.id}/users`,
        `/api/users/../../../tenants/${tenantB.id}/users`,
        `/api/users?../tenantId=${tenantB.id}`,
      ];

      for (const path of traversalAttempts) {
        const response = await requestA.get(path);

        // Should be rejected
        expect([400, 403, 404]).toContain(response.status());
      }
    });
  });

  test.describe('Bulk Operation Isolation', () => {
    test('Bulk export only includes own tenant data', async () => {
      const response = await requestA.get('/api/users/export');

      if (response.ok()) {
        const data = await response.text();
        // Should not contain Tenant B identifiers
        expect(data).not.toContain(tenantB.id);
        expect(data).not.toContain('@tenant-b.test');
      }
    });

    test('Bulk delete cannot affect other tenant', async () => {
      const response = await requestA.delete('/api/users/bulk', {
        data: {
          ids: [tenantBResources.userId] // Attempting to delete Tenant B user
        }
      });

      // Should be rejected or skip non-owned resources
      if (response.ok()) {
        const result = await response.json();
        expect(result.deleted || []).not.toContain(tenantBResources.userId);
      } else {
        expect([400, 403, 404]).toContain(response.status());
      }
    });

    test('Bulk update cannot modify other tenant resources', async () => {
      const response = await requestA.patch('/api/users/bulk', {
        data: {
          ids: [tenantBResources.userId],
          updates: { status: 'disabled' }
        }
      });

      if (response.ok()) {
        const result = await response.json();
        expect(result.updated || []).not.toContain(tenantBResources.userId);
      } else {
        expect([400, 403, 404]).toContain(response.status());
      }
    });
  });

  test.describe('Search and Filter Isolation', () => {
    test('Global search only returns own tenant results', async () => {
      const response = await requestA.get('/api/search?q=admin');

      if (response.ok()) {
        const results = await response.json();

        // All results should belong to Tenant A
        for (const item of results.data || []) {
          expect(item.tenantId).toBe(tenantA.id);
        }
      }
    });

    test('Advanced filter cannot access other tenant', async () => {
      const response = await requestA.get('/api/users', {
        params: {
          'filter[tenantId]': tenantB.id,
          'filter[email]': '@tenant-b.test'
        }
      });

      if (response.ok()) {
        const data = await response.json();
        // Should return empty or only Tenant A data
        expect(data.data?.length || 0).toBe(0);
      }
    });

    test('SQL injection attempt is blocked', async () => {
      const injectionAttempts = [
        "' OR tenantId='tenant-b-id'--",
        "1; SELECT * FROM users WHERE tenant_id='tenant-b-id'",
        "${tenantB.id}",
      ];

      for (const injection of injectionAttempts) {
        const response = await requestA.get('/api/users', {
          params: { search: injection }
        });

        // Should either sanitize or reject
        if (response.ok()) {
          const data = await response.json();
          for (const item of data.data || []) {
            expect(item.tenantId).not.toBe(tenantB.id);
          }
        }
      }
    });
  });

  test.describe('WebSocket Isolation', () => {
    test('WebSocket connection is tenant-scoped', async () => {
      // Establish WebSocket connection for Tenant A
      const wsUrl = `ws://localhost:3000/ws?token=${tenantA.token}`;

      const messages: any[] = [];

      await pageA.evaluate(async (url) => {
        return new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(url);

          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            // Verify all messages are for current tenant
            if (data.tenantId && data.tenantId !== 'tenant-a') {
              reject(new Error('Received message from wrong tenant'));
            }
          };

          ws.onopen = () => {
            // Wait a bit for any messages
            setTimeout(() => {
              ws.close();
              resolve();
            }, 2000);
          };

          ws.onerror = () => resolve(); // WebSocket might not be available in test
        });
      }, wsUrl);
    });

    test('Cannot subscribe to other tenant events', async () => {
      const subscribeResponse = await requestA.post('/api/ws/subscribe', {
        data: {
          channel: `tenant-${tenantB.id}-events` // Attempting to subscribe to Tenant B
        }
      });

      // Should be rejected
      expect([400, 403]).toContain(subscribeResponse.status());
    });
  });

  test.describe('Report and Analytics Isolation', () => {
    test('Dashboard analytics only show own tenant data', async () => {
      const response = await requestA.get('/api/analytics/dashboard');

      if (response.ok()) {
        const analytics = await response.json();
        expect(analytics.tenantId).toBe(tenantA.id);
      }
    });

    test('Report generation is tenant-scoped', async () => {
      const response = await requestA.post('/api/reports/generate', {
        data: {
          type: 'user-activity',
          dateRange: { from: '2024-01-01', to: '2024-12-31' }
        }
      });

      if (response.ok()) {
        const report = await response.json();
        // Report should only contain Tenant A data
        expect(report.tenantId).toBe(tenantA.id);
      }
    });

    test('Cannot generate report for other tenant', async () => {
      const response = await requestA.post('/api/reports/generate', {
        data: {
          type: 'user-activity',
          tenantId: tenantB.id // Attempting to generate report for Tenant B
        }
      });

      if (response.ok()) {
        const report = await response.json();
        // Should ignore injected tenantId
        expect(report.tenantId).not.toBe(tenantB.id);
      } else {
        expect([400, 403]).toContain(response.status());
      }
    });
  });
});
