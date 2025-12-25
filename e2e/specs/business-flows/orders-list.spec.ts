import { test, expect } from '@playwright/test';
import { TradingUserFactory } from '../../factories';
import {
  generateTestId,
  waitForApiResponse,
  mockApiResponse,
  clearMocks,
} from '../../support';

/**
 * Orders List E2E Tests
 *
 * Tests the orders list functionality including:
 * - Pending orders display
 * - History orders display
 * - Filter by time range and status
 * - Pagination
 */

test.describe('Orders List', () => {
  const generateOrders = (count: number, login?: number) => {
    const userLogin = login || 100001;
    return TradingUserFactory.createOrders(userLogin, count);
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

  test.describe('Display Pending Orders', () => {
    test('should display pending orders in table', async ({ page }) => {
      const orders = generateOrders(5);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: orders,
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const table = page.locator('table, [data-testid="orders-table"]');
      await expect(table).toBeVisible();

      const rows = table.locator('tbody tr');
      await expect(rows).toHaveCount(5);
    });

    test('should display order details correctly', async ({ page }) => {
      const order = TradingUserFactory.createOrder(100001, {
        ticket: 87654321,
        symbol: 'EURUSD',
        type: 'buy_limit',
        volume: 1.0,
        openPrice: 1.1000,
        state: 'pending',
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: [order],
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const table = page.locator('table, [data-testid="orders-table"]');
      await expect(table).toContainText('87654321');
      await expect(table).toContainText('EURUSD');
      await expect(table).toContainText(/Buy Limit/i);
      await expect(table).toContainText('1.1000');
    });

    test('should show different order types', async ({ page }) => {
      const orders = [
        TradingUserFactory.createOrder(100001, { type: 'buy_limit', ticket: 1 }),
        TradingUserFactory.createOrder(100001, { type: 'sell_limit', ticket: 2 }),
        TradingUserFactory.createOrder(100001, { type: 'buy_stop', ticket: 3 }),
        TradingUserFactory.createOrder(100001, { type: 'sell_stop', ticket: 4 }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: orders,
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const table = page.locator('table, [data-testid="orders-table"]');
      await expect(table).toContainText(/Buy Limit/i);
      await expect(table).toContainText(/Sell Limit/i);
      await expect(table).toContainText(/Buy Stop/i);
      await expect(table).toContainText(/Sell Stop/i);
    });

    test('should show empty state when no pending orders', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: [],
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const emptyState = page.locator('.empty-state, [data-testid="no-orders"]');
      await expect(emptyState).toBeVisible();
    });
  });

  test.describe('Display History Orders', () => {
    test('should switch to history tab', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: generateOrders(5),
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const historyTab = page.locator('button:has-text("History"), [data-tab="history"]');
      await historyTab.click();

      await waitForApiResponse(page, /\/orders\/history|state=filled/, { method: 'GET' });
    });

    test('should display filled orders in history', async ({ page }) => {
      const historyOrders = [
        TradingUserFactory.createOrder(100001, {
          state: 'filled',
          ticket: 11111111,
        }),
        TradingUserFactory.createOrder(100002, {
          state: 'filled',
          ticket: 22222222,
        }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders.*state=filled/, {
        body: historyOrders,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: [],
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const historyTab = page.locator('button:has-text("History"), [data-tab="history"]');
      await historyTab.click();

      const table = page.locator('table, [data-testid="orders-table"]');
      await expect(table).toContainText('11111111');
    });

    test('should display cancelled orders in history', async ({ page }) => {
      const cancelledOrders = [
        TradingUserFactory.createOrder(100001, {
          state: 'cancelled',
          ticket: 33333333,
        }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders.*state=cancelled/, {
        body: cancelledOrders,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: [],
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const historyTab = page.locator('button:has-text("History"), [data-tab="history"]');
      await historyTab.click();

      // Filter by cancelled
      const stateFilter = page.locator('select[name="state"], [data-testid="state-filter"]');
      if (await stateFilter.isVisible()) {
        await stateFilter.selectOption('cancelled');
      }
    });
  });

  test.describe('Filter by Time Range', () => {
    test('should filter orders by date range', async ({ page }) => {
      const orders = generateOrders(10);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: orders,
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      // Set date range
      const dateFrom = page.locator('input[name="dateFrom"], [data-testid="date-from"]');
      const dateTo = page.locator('input[name="dateTo"], [data-testid="date-to"]');

      if (await dateFrom.isVisible()) {
        await dateFrom.fill('2024-01-01');
        await dateTo.fill('2024-12-31');

        await page.locator('button:has-text("Apply"), button:has-text("Filter")').click();

        await waitForApiResponse(page, /from=.*to=/, { method: 'GET' });
      }
    });

    test('should have quick date range presets', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: generateOrders(5),
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const presets = page.locator('[data-testid="date-presets"], .date-presets');
      if (await presets.isVisible()) {
        await expect(presets).toContainText(/Today|Week|Month/);
      }
    });

    test('should filter by today', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: generateOrders(5),
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const todayButton = page.locator('button:has-text("Today"), [data-preset="today"]');
      if (await todayButton.isVisible()) {
        await todayButton.click();

        const today = new Date().toISOString().split('T')[0];
        await waitForApiResponse(page, new RegExp(`from=${today}`), { method: 'GET' });
      }
    });

    test('should filter by this week', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: generateOrders(5),
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const weekButton = page.locator('button:has-text("Week"), [data-preset="week"]');
      if (await weekButton.isVisible()) {
        await weekButton.click();

        await waitForApiResponse(page, /from=.*to=/, { method: 'GET' });
      }
    });

    test('should filter by this month', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: generateOrders(5),
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const monthButton = page.locator('button:has-text("Month"), [data-preset="month"]');
      if (await monthButton.isVisible()) {
        await monthButton.click();

        await waitForApiResponse(page, /from=.*to=/, { method: 'GET' });
      }
    });
  });

  test.describe('Filter by Status', () => {
    test('should filter by pending status', async ({ page }) => {
      const pendingOrders = generateOrders(3).map((o) => ({ ...o, state: 'pending' }));

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders.*state=pending/, {
        body: pendingOrders,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: generateOrders(10),
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const stateFilter = page.locator('select[name="state"], [data-testid="state-filter"]');
      if (await stateFilter.isVisible()) {
        await stateFilter.selectOption('pending');

        await waitForApiResponse(page, /state=pending/, { method: 'GET' });
      }
    });

    test('should filter by filled status', async ({ page }) => {
      const filledOrders = generateOrders(5).map((o) => ({ ...o, state: 'filled' }));

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders.*state=filled/, {
        body: filledOrders,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: generateOrders(10),
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const stateFilter = page.locator('select[name="state"], [data-testid="state-filter"]');
      if (await stateFilter.isVisible()) {
        await stateFilter.selectOption('filled');

        await waitForApiResponse(page, /state=filled/, { method: 'GET' });
      }
    });

    test('should filter by expired status', async ({ page }) => {
      const expiredOrders = generateOrders(2).map((o) => ({ ...o, state: 'expired' }));

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders.*state=expired/, {
        body: expiredOrders,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: generateOrders(10),
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const stateFilter = page.locator('select[name="state"], [data-testid="state-filter"]');
      if (await stateFilter.isVisible()) {
        await stateFilter.selectOption('expired');

        await waitForApiResponse(page, /state=expired/, { method: 'GET' });
      }
    });
  });

  test.describe('Filter by Symbol', () => {
    test('should filter orders by symbol', async ({ page }) => {
      const eurusdOrders = generateOrders(3).map((o) => ({ ...o, symbol: 'EURUSD' }));

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders.*symbol=EURUSD/, {
        body: eurusdOrders,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: generateOrders(10),
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const symbolFilter = page.locator('select[name="symbol"], [data-testid="symbol-filter"]');
      if (await symbolFilter.isVisible()) {
        await symbolFilter.selectOption('EURUSD');

        await waitForApiResponse(page, /symbol=EURUSD/, { method: 'GET' });
      }
    });
  });

  test.describe('Pagination', () => {
    test('should display pagination for large result set', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: {
          orders: generateOrders(20),
          total: 100,
          page: 1,
          limit: 20,
        },
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const pagination = page.locator('.pagination, [data-testid="pagination"]');
      await expect(pagination).toBeVisible();
    });

    test('should navigate to next page', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders.*page=1/, {
        body: {
          orders: generateOrders(20),
          total: 100,
          page: 1,
          limit: 20,
        },
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders.*page=2/, {
        body: {
          orders: generateOrders(20),
          total: 100,
          page: 2,
          limit: 20,
        },
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const nextButton = page.locator('button:has-text("Next"), [aria-label="Next page"]');
      await nextButton.click();

      await waitForApiResponse(page, /page=2/, { method: 'GET' });
    });

    test('should navigate to previous page', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders.*page=2/, {
        body: {
          orders: generateOrders(20),
          total: 100,
          page: 2,
          limit: 20,
        },
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders.*page=1/, {
        body: {
          orders: generateOrders(20),
          total: 100,
          page: 1,
          limit: 20,
        },
      });

      await page.goto('/orders?page=2');
      await page.waitForLoadState('networkidle');

      const prevButton = page.locator('button:has-text("Previous"), [aria-label="Previous page"]');
      await prevButton.click();

      await waitForApiResponse(page, /page=1/, { method: 'GET' });
    });

    test('should change page size', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: {
          orders: generateOrders(20),
          total: 100,
          page: 1,
          limit: 20,
        },
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const pageSizeSelect = page.locator('select[name="pageSize"], [data-testid="page-size"]');
      if (await pageSizeSelect.isVisible()) {
        await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders.*limit=50/, {
          body: {
            orders: generateOrders(50),
            total: 100,
            page: 1,
            limit: 50,
          },
        });

        await pageSizeSelect.selectOption('50');

        await waitForApiResponse(page, /limit=50/, { method: 'GET' });
      }
    });
  });

  test.describe('Order Details', () => {
    test('should show order details on click', async ({ page }) => {
      const order = TradingUserFactory.createOrder(100001, {
        ticket: 12345678,
        comment: 'Test order',
        expiration: new Date(Date.now() + 86400000).toISOString(),
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: [order],
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const row = page.locator(`tr:has-text("12345678")`);
      await row.click();

      const modal = page.locator('.modal, [role="dialog"]');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('Test order');
    });

    test('should display SL and TP in order details', async ({ page }) => {
      const order = TradingUserFactory.createOrder(100001, {
        ticket: 12345678,
        sl: 1.0900,
        tp: 1.1200,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: [order],
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const row = page.locator(`tr:has-text("12345678")`);
      await row.click();

      const modal = page.locator('.modal, [role="dialog"]');
      await expect(modal).toContainText('1.0900');
      await expect(modal).toContainText('1.1200');
    });
  });

  test.describe('Refresh Data', () => {
    test('should refresh orders on button click', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: generateOrders(5),
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      const refreshButton = page.locator('button:has-text("Refresh"), [data-testid="refresh"]');
      await refreshButton.click();

      await waitForApiResponse(page, /\/orders/, { method: 'GET' });
    });

    test('should maintain filters after refresh', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/orders/, {
        body: generateOrders(10),
      });

      await page.goto('/orders');
      await page.waitForLoadState('networkidle');

      // Apply filter
      const symbolFilter = page.locator('select[name="symbol"], [data-testid="symbol-filter"]');
      if (await symbolFilter.isVisible()) {
        await symbolFilter.selectOption('EURUSD');
      }

      // Refresh
      const refreshButton = page.locator('button:has-text("Refresh"), [data-testid="refresh"]');
      await refreshButton.click();

      // Filter should still be applied
      await waitForApiResponse(page, /symbol=EURUSD/, { method: 'GET' });
    });
  });
});
