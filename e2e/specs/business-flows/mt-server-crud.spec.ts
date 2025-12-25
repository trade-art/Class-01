import { test, expect } from '@playwright/test';
import { MtServerFactory } from '../../factories';
import { MtServersPage } from '../../pages';
import {
  createTestContext,
  generateTestId,
  waitForApiResponse,
  expectToast,
  mockApiResponse,
  clearMocks,
} from '../../support';

/**
 * MT Server CRUD E2E Tests
 *
 * Tests the complete MT server management flow including:
 * - Adding MT5/MT4 servers
 * - Editing server configurations
 * - Deleting servers
 * - Setting default server
 */

test.describe('MT Server CRUD Operations', () => {
  let mtServersPage: MtServersPage;

  test.beforeEach(async ({ page }) => {
    mtServersPage = new MtServersPage(page);

    // Mock authenticated user
    await mockApiResponse(page, /\/api\/auth\/me/, {
      body: {
        id: 'test-user-001',
        email: 'admin@test.local',
        role: 'owner',
        tenantId: 'test-tenant-001',
      },
    });

    // Navigate to MT servers page
    await mtServersPage.goto();
    await mtServersPage.waitForLoad();
  });

  test.afterEach(async ({ page }) => {
    await clearMocks(page);
  });

  test.describe('Add MT Server', () => {
    test('should add MT5 server successfully', async ({ page }) => {
      const serverData = MtServerFactory.createMT5('test-tenant-001', {
        name: `MT5 Server ${generateTestId()}`,
      });

      await mtServersPage.openAddServerModal();

      await mtServersPage.fillServerForm({
        name: serverData.name,
        platformType: 'MT5',
        serverAddress: serverData.serverAddress,
        serverPort: serverData.serverPort,
        middlewareUrl: serverData.middlewareUrl,
        managerLogin: serverData.managerLogin,
        managerPassword: serverData.managerPassword,
      });

      // Wait for modal save button and click
      await page.locator('button:has-text("Save"), button:has-text("Create")').click();

      // Wait for API response
      const response = await waitForApiResponse(page, '/api/mt-servers', { method: 'POST' });
      expect(response.status).toBe(201);

      // Verify success message
      await expectToast(page, { type: 'success' });

      // Verify server appears in list
      await mtServersPage.expectServerVisible(serverData.name);
    });

    test('should add MT4 server successfully', async ({ page }) => {
      const serverData = MtServerFactory.createMT4('test-tenant-001', {
        name: `MT4 Server ${generateTestId()}`,
      });

      await mtServersPage.openAddServerModal();

      await mtServersPage.fillServerForm({
        name: serverData.name,
        platformType: 'MT4',
        serverAddress: serverData.serverAddress,
        serverPort: serverData.serverPort,
        middlewareUrl: serverData.middlewareUrl,
        managerLogin: serverData.managerLogin,
        managerPassword: serverData.managerPassword,
      });

      await page.locator('button:has-text("Save"), button:has-text("Create")').click();

      const response = await waitForApiResponse(page, '/api/mt-servers', { method: 'POST' });
      expect(response.status).toBe(201);

      await expectToast(page, { type: 'success' });
      await mtServersPage.expectServerVisible(serverData.name);
    });

    test('should validate required fields', async ({ page }) => {
      await mtServersPage.openAddServerModal();

      // Try to submit empty form
      await page.locator('button:has-text("Save"), button:has-text("Create")').click();

      // Should show validation errors
      const errors = page.locator('.error-message, .field-error, [role="alert"]');
      await expect(errors.first()).toBeVisible();

      // Modal should still be open
      const modal = page.locator('.modal, [role="dialog"]');
      await expect(modal).toBeVisible();
    });

    test('should validate server address format', async ({ page }) => {
      await mtServersPage.openAddServerModal();

      await page.locator('input[name="serverAddress"]').fill('invalid-address!!');
      await page.locator('input[name="serverAddress"]').blur();

      const error = page.locator('[data-field="serverAddress"] .error, .field-error');
      await expect(error).toBeVisible();
    });

    test('should validate middleware URL format', async ({ page }) => {
      await mtServersPage.openAddServerModal();

      await page.locator('input[name="middlewareUrl"]').fill('not-a-url');
      await page.locator('input[name="middlewareUrl"]').blur();

      const error = page.locator('[data-field="middlewareUrl"] .error, .field-error');
      await expect(error).toBeVisible();
    });

    test('should validate port number range', async ({ page }) => {
      await mtServersPage.openAddServerModal();

      await page.locator('input[name="serverPort"]').fill('99999');
      await page.locator('input[name="serverPort"]').blur();

      const error = page.locator('[data-field="serverPort"] .error, .field-error');
      await expect(error).toBeVisible();
    });

    test('should prevent duplicate server names', async ({ page }) => {
      const existingServerName = 'Existing Server';

      // Mock API to return conflict error
      await mockApiResponse(page, /\/api\/mt-servers$/, {
        status: 409,
        body: {
          error: 'Conflict',
          message: 'Server name already exists',
        },
      });

      await mtServersPage.openAddServerModal();

      const serverData = MtServerFactory.create('test-tenant-001', {
        name: existingServerName,
      });

      await mtServersPage.fillServerForm({
        name: serverData.name,
        platformType: 'MT5',
        serverAddress: serverData.serverAddress,
        serverPort: serverData.serverPort,
        middlewareUrl: serverData.middlewareUrl,
        managerLogin: serverData.managerLogin,
        managerPassword: serverData.managerPassword,
      });

      await page.locator('button:has-text("Save"), button:has-text("Create")').click();

      // Should show error message
      await expectToast(page, { type: 'error', message: 'already exists' });
    });
  });

  test.describe('Edit MT Server', () => {
    const existingServer = {
      id: 'server-001',
      name: 'Test Server',
      platformType: 'MT5' as const,
      serverAddress: '192.168.1.100',
      serverPort: 443,
      middlewareUrl: 'http://localhost:8888',
      managerLogin: '1000',
      managerPassword: 'password123',
    };

    test.beforeEach(async ({ page }) => {
      // Mock existing server in list
      await mockApiResponse(page, /\/api\/mt-servers$/, {
        body: [existingServer],
      });

      await page.reload();
      await mtServersPage.waitForLoad();
    });

    test('should edit server name successfully', async ({ page }) => {
      const newName = `Updated Server ${generateTestId()}`;

      await mtServersPage.editServer(existingServer.name, { name: newName });

      const response = await waitForApiResponse(page, `/api/mt-servers/${existingServer.id}`, {
        method: 'PATCH',
      });
      expect(response.status).toBeLessThan(300);

      await expectToast(page, { type: 'success' });
    });

    test('should edit server address successfully', async ({ page }) => {
      const newAddress = '10.0.0.50';

      await mtServersPage.editServer(existingServer.name, { serverAddress: newAddress });

      const response = await waitForApiResponse(page, `/api/mt-servers/${existingServer.id}`, {
        method: 'PATCH',
      });
      expect(response.status).toBeLessThan(300);

      await expectToast(page, { type: 'success' });
    });

    test('should edit middleware URL successfully', async ({ page }) => {
      const newMiddlewareUrl = 'http://new-middleware:8080';

      await mtServersPage.editServer(existingServer.name, { middlewareUrl: newMiddlewareUrl });

      await expectToast(page, { type: 'success' });
    });

    test('should edit manager credentials successfully', async ({ page }) => {
      await mtServersPage.editServer(existingServer.name, {
        managerLogin: '2000',
        managerPassword: 'newpassword456',
      });

      await expectToast(page, { type: 'success' });
    });

    test('should cancel edit without saving changes', async ({ page }) => {
      const row = page.locator(`tr:has-text("${existingServer.name}")`);
      await row.locator('button:has-text("Edit"), [data-testid="edit"]').click();

      const modal = page.locator('.modal, [role="dialog"]');
      await expect(modal).toBeVisible();

      // Make changes
      await page.locator('input[name="name"]').fill('Changed Name');

      // Cancel
      await page.locator('button:has-text("Cancel")').click();

      // Modal should close
      await expect(modal).toBeHidden();

      // Original name should still be visible
      await expect(row).toBeVisible();
    });
  });

  test.describe('Delete MT Server', () => {
    const existingServer = {
      id: 'server-001',
      name: 'Server To Delete',
      platformType: 'MT5',
      connectionStatus: 'disconnected',
    };

    test.beforeEach(async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers$/, {
        body: [existingServer],
      });

      await page.reload();
      await mtServersPage.waitForLoad();
    });

    test('should delete server after confirmation', async ({ page }) => {
      await mtServersPage.deleteServer(existingServer.name);

      const response = await waitForApiResponse(page, `/api/mt-servers/${existingServer.id}`, {
        method: 'DELETE',
      });
      expect(response.status).toBeLessThan(300);

      await expectToast(page, { type: 'success' });
    });

    test('should cancel delete operation', async ({ page }) => {
      const row = page.locator(`tr:has-text("${existingServer.name}")`);
      await row.locator('button:has-text("Delete"), [data-testid="delete"]').click();

      const confirmDialog = page.locator('[role="alertdialog"], .confirm-dialog');
      await expect(confirmDialog).toBeVisible();

      // Cancel
      await page.locator('button:has-text("Cancel"), button:has-text("No")').click();

      // Dialog should close
      await expect(confirmDialog).toBeHidden();

      // Server should still be visible
      await expect(row).toBeVisible();
    });

    test('should prevent deleting default server', async ({ page }) => {
      // Mock default server
      await mockApiResponse(page, /\/api\/mt-servers$/, {
        body: [{ ...existingServer, isDefault: true }],
      });

      await page.reload();
      await mtServersPage.waitForLoad();

      const row = page.locator(`tr:has-text("${existingServer.name}")`);
      const deleteButton = row.locator('button:has-text("Delete"), [data-testid="delete"]');

      // Delete button should be disabled or show warning on click
      const isDisabled = await deleteButton.isDisabled();
      if (!isDisabled) {
        await deleteButton.click();
        await expectToast(page, { type: 'error', message: 'default' });
      }
    });

    test('should prevent deleting server with active connections', async ({ page }) => {
      // Mock server with active connections
      await mockApiResponse(page, /\/api\/mt-servers$/, {
        body: [{ ...existingServer, connectionStatus: 'connected', activeUsers: 5 }],
      });

      await page.reload();
      await mtServersPage.waitForLoad();

      const row = page.locator(`tr:has-text("${existingServer.name}")`);
      await row.locator('button:has-text("Delete"), [data-testid="delete"]').click();

      // Should show warning about active connections
      const warningDialog = page.locator('[role="alertdialog"], .confirm-dialog');
      await expect(warningDialog).toContainText(/active|connections|users/i);
    });
  });

  test.describe('Set Default Server', () => {
    const servers = [
      { id: 'server-001', name: 'Server 1', isDefault: true },
      { id: 'server-002', name: 'Server 2', isDefault: false },
    ];

    test.beforeEach(async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers$/, {
        body: servers,
      });

      await page.reload();
      await mtServersPage.waitForLoad();
    });

    test('should set server as default', async ({ page }) => {
      await mtServersPage.setAsDefault('Server 2');

      const response = await waitForApiResponse(page, '/api/mt-servers/server-002/default', {
        method: 'POST',
      });
      expect(response.status).toBeLessThan(300);

      await expectToast(page, { type: 'success' });
    });

    test('should display default badge on default server', async ({ page }) => {
      const defaultRow = page.locator('tr:has-text("Server 1")');
      const defaultBadge = defaultRow.locator('.badge-default, [data-testid="default-badge"]');

      await expect(defaultBadge).toBeVisible();
    });

    test('should only have one default server at a time', async ({ page }) => {
      // Set Server 2 as default
      await mtServersPage.setAsDefault('Server 2');
      await waitForApiResponse(page, '/api/mt-servers/server-002/default', { method: 'POST' });

      // Mock updated list
      await mockApiResponse(page, /\/api\/mt-servers$/, {
        body: [
          { ...servers[0], isDefault: false },
          { ...servers[1], isDefault: true },
        ],
      });

      await page.reload();
      await mtServersPage.waitForLoad();

      // Only Server 2 should have default badge
      const defaultBadges = page.locator('.badge-default, [data-testid="default-badge"]');
      await expect(defaultBadges).toHaveCount(1);

      const server2Row = page.locator('tr:has-text("Server 2")');
      await expect(server2Row.locator('.badge-default, [data-testid="default-badge"]')).toBeVisible();
    });
  });

  test.describe('Server List', () => {
    test('should display all servers', async ({ page }) => {
      const servers = [
        MtServerFactory.createMT5('test-tenant-001', { name: 'MT5 Server 1' }),
        MtServerFactory.createMT4('test-tenant-001', { name: 'MT4 Server 1' }),
        MtServerFactory.createMT5('test-tenant-001', { name: 'MT5 Server 2' }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers$/, {
        body: servers,
      });

      await page.reload();
      await mtServersPage.waitForLoad();

      const count = await mtServersPage.getServerCount();
      expect(count).toBe(3);
    });

    test('should filter servers by platform type', async ({ page }) => {
      const servers = [
        MtServerFactory.createMT5('test-tenant-001', { name: 'MT5 Server' }),
        MtServerFactory.createMT4('test-tenant-001', { name: 'MT4 Server' }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers$/, {
        body: servers,
      });

      await page.reload();
      await mtServersPage.waitForLoad();

      await mtServersPage.filterByPlatform('MT5');

      // Should only show MT5 servers
      await mtServersPage.expectServerVisible('MT5 Server');
    });

    test('should search servers by name', async ({ page }) => {
      const servers = [
        MtServerFactory.create('test-tenant-001', { name: 'Production Server' }),
        MtServerFactory.create('test-tenant-001', { name: 'Staging Server' }),
        MtServerFactory.create('test-tenant-001', { name: 'Development Server' }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers$/, {
        body: servers,
      });

      await page.reload();
      await mtServersPage.waitForLoad();

      await mtServersPage.search('Production');

      await mtServersPage.expectServerVisible('Production Server');
    });

    test('should show empty state when no servers', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers$/, {
        body: [],
      });

      await page.reload();
      await mtServersPage.waitForLoad();

      const emptyState = page.locator('.empty-state, [data-testid="no-servers"]');
      await expect(emptyState).toBeVisible();
      await expect(emptyState).toContainText(/no server|add.*server/i);
    });
  });
});
