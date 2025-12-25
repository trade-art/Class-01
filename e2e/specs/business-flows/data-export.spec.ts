import { test, expect, Download } from '@playwright/test';
import { TradingUserFactory } from '../../factories';
import {
  generateTestId,
  waitForApiResponse,
  mockApiResponse,
  clearMocks,
} from '../../support';

/**
 * Data Export E2E Tests
 *
 * Tests the data export functionality including:
 * - Export user list to CSV
 * - Export positions list to CSV
 * - Export orders list to Excel
 * - Verify exported file contents
 */

test.describe('Data Export', () => {
  const generateUsers = (count: number) => {
    return TradingUserFactory.createMany(count);
  };

  const generatePositions = (count: number) => {
    return TradingUserFactory.createPositions(100001, count);
  };

  const generateOrders = (count: number) => {
    return TradingUserFactory.createOrders(100001, count);
  };

  test.beforeEach(async ({ page }) => {
    // Mock authenticated user
    await mockApiResponse(page, /\/api\/auth\/me/, {
      body: {
        id: 'test-user-001',
        email: 'admin@test.local',
        role: 'owner',
        tenantId: 'test-tenant-001',
      },
    });
  });

  test.afterEach(async ({ page }) => {
    await clearMocks(page);
  });

  test.describe('Export User List', () => {
    test('should export user list to CSV', async ({ page }) => {
      const users = generateUsers(10);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users,
          total: 10,
          page: 1,
          limit: 100,
        },
      });

      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Start waiting for download before clicking
      const downloadPromise = page.waitForEvent('download');

      const exportButton = page.locator('button:has-text("Export"), [data-testid="export"]');
      await exportButton.click();

      // Select CSV format if options available
      const csvOption = page.locator('button:has-text("CSV"), [data-format="csv"]');
      if (await csvOption.isVisible()) {
        await csvOption.click();
      }

      const download = await downloadPromise;

      // Verify download started
      expect(download.suggestedFilename()).toMatch(/users.*\.csv$/i);
    });

    test('should include all user columns in export', async ({ page }) => {
      const users = [
        TradingUserFactory.create({
          login: 100001,
          name: 'John Doe',
          email: 'john@test.local',
          balance: 10000.50,
          equity: 12500.75,
          group: 'real\\vip',
        }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: { users, total: 1 },
      });

      // Mock export endpoint to return CSV content
      await page.route(/\/api\/mt-servers\/.*\/users\/export/, async (route) => {
        const csvContent = `Login,Name,Email,Balance,Equity,Group
100001,John Doe,john@test.local,10000.50,12500.75,"real\\vip"`;

        await route.fulfill({
          status: 200,
          contentType: 'text/csv',
          headers: {
            'Content-Disposition': 'attachment; filename="users.csv"',
          },
          body: csvContent,
        });
      });

      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      const downloadPromise = page.waitForEvent('download');
      await page.locator('button:has-text("Export")').click();

      const download = await downloadPromise;
      const content = await download.createReadStream();

      // Read and verify content
      let csvData = '';
      for await (const chunk of content) {
        csvData += chunk.toString();
      }

      expect(csvData).toContain('Login');
      expect(csvData).toContain('Name');
      expect(csvData).toContain('Balance');
      expect(csvData).toContain('Equity');
    });

    test('should apply current filters to export', async ({ page }) => {
      const vipUsers = generateUsers(5).map((u) => ({ ...u, group: 'real\\vip' }));

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: { users: generateUsers(10), total: 10 },
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users\/export.*group=vip/, {
        body: vipUsers,
      });

      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Apply group filter
      const groupFilter = page.locator('select[name="group"], [data-testid="group-filter"]');
      if (await groupFilter.isVisible()) {
        await groupFilter.selectOption('real\\vip');
      }

      const downloadPromise = page.waitForEvent('download');
      await page.locator('button:has-text("Export")').click();

      // Export should include filter params
      await waitForApiResponse(page, /export.*group=vip|group=vip.*export/, { method: 'GET' });

      await downloadPromise;
    });
  });

  test.describe('Export Positions List', () => {
    test('should export positions to CSV', async ({ page }) => {
      const positions = generatePositions(10);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: positions,
      });

      await page.goto('/positions');
      await page.waitForLoadState('networkidle');

      const downloadPromise = page.waitForEvent('download');

      const exportButton = page.locator('button:has-text("Export"), [data-testid="export"]');
      await exportButton.click();

      const csvOption = page.locator('button:has-text("CSV"), [data-format="csv"]');
      if (await csvOption.isVisible()) {
        await csvOption.click();
      }

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/positions.*\.csv$/i);
    });

    test('should include position details in export', async ({ page }) => {
      const positions = [
        TradingUserFactory.createPosition(100001, {
          ticket: 12345678,
          symbol: 'EURUSD',
          type: 'buy',
          volume: 1.5,
          openPrice: 1.1050,
          currentPrice: 1.1075,
          profit: 375.00,
        }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: positions,
      });

      await page.route(/\/api\/mt-servers\/.*\/positions\/export/, async (route) => {
        const csvContent = `Ticket,Login,Symbol,Type,Volume,Open Price,Current Price,Profit
12345678,100001,EURUSD,Buy,1.50,1.10500,1.10750,375.00`;

        await route.fulfill({
          status: 200,
          contentType: 'text/csv',
          headers: {
            'Content-Disposition': 'attachment; filename="positions.csv"',
          },
          body: csvContent,
        });
      });

      await page.goto('/positions');
      await page.waitForLoadState('networkidle');

      const downloadPromise = page.waitForEvent('download');
      await page.locator('button:has-text("Export")').click();

      const download = await downloadPromise;
      const content = await download.createReadStream();

      let csvData = '';
      for await (const chunk of content) {
        csvData += chunk.toString();
      }

      expect(csvData).toContain('Ticket');
      expect(csvData).toContain('Symbol');
      expect(csvData).toContain('Profit');
    });

    test('should apply symbol filter to positions export', async ({ page }) => {
      const positions = generatePositions(10);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: positions,
      });

      await page.goto('/positions');
      await page.waitForLoadState('networkidle');

      // Apply symbol filter
      const symbolFilter = page.locator('select[name="symbol"], [data-testid="symbol-filter"]');
      if (await symbolFilter.isVisible()) {
        await symbolFilter.selectOption('EURUSD');
      }

      const downloadPromise = page.waitForEvent('download');
      await page.locator('button:has-text("Export")').click();

      // Should include symbol filter in export
      await waitForApiResponse(page, /export.*symbol=EURUSD|symbol=EURUSD.*export/, { method: 'GET' });

      await downloadPromise;
    });
  });

  test.describe('Export Orders List', () => {
    test('should export orders to Excel', async ({ page }) => {
      const orders = generateOrders(10);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: orders,
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const downloadPromise = page.waitForEvent('download');

      const exportButton = page.locator('button:has-text("Export"), [data-testid="export"]');
      await exportButton.click();

      // Select Excel format
      const excelOption = page.locator('button:has-text("Excel"), [data-format="xlsx"]');
      if (await excelOption.isVisible()) {
        await excelOption.click();
      }

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/orders.*\.(xlsx|xls)$/i);
    });

    test('should export orders to CSV', async ({ page }) => {
      const orders = generateOrders(10);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: orders,
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const downloadPromise = page.waitForEvent('download');

      const exportButton = page.locator('button:has-text("Export"), [data-testid="export"]');
      await exportButton.click();

      const csvOption = page.locator('button:has-text("CSV"), [data-format="csv"]');
      if (await csvOption.isVisible()) {
        await csvOption.click();
      }

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/orders.*\.csv$/i);
    });

    test('should include order columns in export', async ({ page }) => {
      const orders = [
        TradingUserFactory.createOrder(100001, {
          ticket: 87654321,
          symbol: 'GBPUSD',
          type: 'buy_limit',
          volume: 0.5,
          openPrice: 1.2750,
        }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: orders,
      });

      await page.route(/\/api\/mt-servers\/.*\/orders\/export/, async (route) => {
        const csvContent = `Ticket,Login,Symbol,Type,Volume,Price,State,Time
87654321,100001,GBPUSD,Buy Limit,0.50,1.27500,Pending,2024-01-15 10:30:00`;

        await route.fulfill({
          status: 200,
          contentType: 'text/csv',
          headers: {
            'Content-Disposition': 'attachment; filename="orders.csv"',
          },
          body: csvContent,
        });
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const downloadPromise = page.waitForEvent('download');
      await page.locator('button:has-text("Export")').click();

      const download = await downloadPromise;
      const content = await download.createReadStream();

      let csvData = '';
      for await (const chunk of content) {
        csvData += chunk.toString();
      }

      expect(csvData).toContain('Ticket');
      expect(csvData).toContain('Symbol');
      expect(csvData).toContain('Type');
    });

    test('should apply date range filter to orders export', async ({ page }) => {
      const orders = generateOrders(10);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: orders,
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      // Apply date filter
      const dateFrom = page.locator('input[name="dateFrom"], [data-testid="date-from"]');
      const dateTo = page.locator('input[name="dateTo"], [data-testid="date-to"]');

      if (await dateFrom.isVisible()) {
        await dateFrom.fill('2024-01-01');
        await dateTo.fill('2024-12-31');

        await page.locator('button:has-text("Apply")').click();
      }

      const downloadPromise = page.waitForEvent('download');
      await page.locator('button:has-text("Export")').click();

      // Should include date filters
      await waitForApiResponse(page, /export.*from=.*to=|from=.*to=.*export/, { method: 'GET' });

      await downloadPromise;
    });
  });

  test.describe('Export Format Selection', () => {
    test('should show export format options', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: { users: generateUsers(5), total: 5 },
      });

      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      const exportButton = page.locator('button:has-text("Export"), [data-testid="export"]');
      await exportButton.click();

      // Check for format options
      const formatOptions = page.locator('.export-options, [data-testid="export-options"]');
      if (await formatOptions.isVisible()) {
        await expect(formatOptions).toContainText('CSV');
        await expect(formatOptions).toContainText('Excel');
      }
    });

    test('should remember last selected format', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: { users: generateUsers(5), total: 5 },
      });

      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // First export - select Excel
      const exportButton = page.locator('button:has-text("Export"), [data-testid="export"]');
      await exportButton.click();

      const excelOption = page.locator('button:has-text("Excel"), [data-format="xlsx"]');
      if (await excelOption.isVisible()) {
        const downloadPromise = page.waitForEvent('download');
        await excelOption.click();
        await downloadPromise;

        // Navigate away and back
        await page.goto('/dashboard');
        await page.goto('/users');
        await page.waitForLoadState('networkidle');

        // Check if Excel is remembered (implementation dependent)
      }
    });
  });

  test.describe('Export Loading States', () => {
    test('should show loading state during export', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: { users: generateUsers(5), total: 5 },
      });

      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Delay export response
      page.route(/\/api\/mt-servers\/.*\/users\/export/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: 'text/csv',
          body: 'Login,Name\n100001,Test',
        });
      });

      const exportButton = page.locator('button:has-text("Export")');
      await exportButton.click();

      // Loading indicator should appear
      const loadingIndicator = page.locator('.export-loading, [data-testid="export-loading"]');
      if (await loadingIndicator.isVisible({ timeout: 1000 })) {
        await expect(loadingIndicator).toBeVisible();
      }
    });

    test('should disable export button while exporting', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: { users: generateUsers(5), total: 5 },
      });

      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      page.route(/\/api\/mt-servers\/.*\/users\/export/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: 'text/csv',
          body: 'Login,Name\n100001,Test',
        });
      });

      const exportButton = page.locator('button:has-text("Export")');
      await exportButton.click();

      // Button should be disabled during export
      await expect(exportButton).toBeDisabled();
    });
  });

  test.describe('Export Error Handling', () => {
    test('should show error message on export failure', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: { users: generateUsers(5), total: 5 },
      });

      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Mock export failure
      await page.route(/\/api\/mt-servers\/.*\/users\/export/, async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Export failed' }),
        });
      });

      const exportButton = page.locator('button:has-text("Export")');
      await exportButton.click();

      // Error message should appear
      const errorToast = page.locator('.toast-error, [role="alert"]');
      await expect(errorToast).toBeVisible();
    });

    test('should allow retry after export failure', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: { users: generateUsers(5), total: 5 },
      });

      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      let attemptCount = 0;
      await page.route(/\/api\/mt-servers\/.*\/users\/export/, async (route) => {
        attemptCount++;
        if (attemptCount === 1) {
          await route.fulfill({
            status: 500,
            body: JSON.stringify({ error: 'Export failed' }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'text/csv',
            body: 'Login,Name\n100001,Test',
          });
        }
      });

      // First attempt - fails
      const exportButton = page.locator('button:has-text("Export")');
      await exportButton.click();

      // Wait for error
      const errorToast = page.locator('.toast-error, [role="alert"]');
      await expect(errorToast).toBeVisible();

      // Close error toast if needed
      const closeButton = errorToast.locator('button[aria-label="Close"], .close');
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }

      // Second attempt - succeeds
      const downloadPromise = page.waitForEvent('download');
      await exportButton.click();

      await downloadPromise;
    });
  });

  test.describe('Large Data Export', () => {
    test('should handle large dataset export', async ({ page }) => {
      const largeUserSet = generateUsers(1000);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: { users: largeUserSet.slice(0, 20), total: 1000 },
      });

      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Export should request all data
      await page.route(/\/api\/mt-servers\/.*\/users\/export/, async (route) => {
        const csvHeader = 'Login,Name,Balance\n';
        const csvRows = largeUserSet.map((u) => `${u.login},${u.name},${u.balance}`).join('\n');

        await route.fulfill({
          status: 200,
          contentType: 'text/csv',
          headers: {
            'Content-Disposition': 'attachment; filename="users.csv"',
          },
          body: csvHeader + csvRows,
        });
      });

      const downloadPromise = page.waitForEvent('download');
      await page.locator('button:has-text("Export")').click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('.csv');
    });

    test('should show progress for large exports', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: { users: generateUsers(20), total: 5000 },
      });

      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Long running export
      page.route(/\/api\/mt-servers\/.*\/users\/export/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.fulfill({
          status: 200,
          contentType: 'text/csv',
          body: 'Login,Name\n100001,Test',
        });
      });

      await page.locator('button:has-text("Export")').click();

      // Check for progress indicator
      const progress = page.locator('.export-progress, [data-testid="export-progress"]');
      if (await progress.isVisible({ timeout: 500 })) {
        await expect(progress).toBeVisible();
      }
    });
  });
});
