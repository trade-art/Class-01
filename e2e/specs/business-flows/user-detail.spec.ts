import { test, expect } from '@playwright/test';
import { TradingUserFactory } from '../../factories';
import {
  generateTestId,
  waitForApiResponse,
  mockApiResponse,
  clearMocks,
} from '../../support';

/**
 * User Detail E2E Tests
 *
 * Tests the user detail view functionality including:
 * - Account information display
 * - Balance and equity display
 * - Positions list
 * - Orders list
 * - Deal history
 */

test.describe('User Detail', () => {
  const testUser = TradingUserFactory.create({
    login: 100001,
    name: 'John Doe',
    email: 'john@test.local',
    group: 'real\\vip',
    balance: 50000.00,
    credit: 0,
    equity: 52500.75,
    margin: 5000.00,
    marginFree: 47500.75,
    marginLevel: 1050.015,
    profit: 2500.75,
    leverage: 100,
    status: 'active',
  });

  const testPositions = TradingUserFactory.createPositions(testUser.login, 3);
  const testOrders = TradingUserFactory.createOrders(testUser.login, 2);

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

    // Mock user detail
    await mockApiResponse(page, new RegExp(`/api/mt-servers/.*/users/${testUser.login}`), {
      body: testUser,
    });

    // Mock positions
    await mockApiResponse(page, new RegExp(`/api/mt-servers/.*/users/${testUser.login}/positions`), {
      body: testPositions,
    });

    // Mock orders
    await mockApiResponse(page, new RegExp(`/api/mt-servers/.*/users/${testUser.login}/orders`), {
      body: testOrders,
    });

    // Mock deals/history
    await mockApiResponse(page, new RegExp(`/api/mt-servers/.*/users/${testUser.login}/deals`), {
      body: [],
    });
  });

  test.afterEach(async ({ page }) => {
    await clearMocks(page);
  });

  test.describe('Account Information', () => {
    test('should display user login and name', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      await expect(page.locator('.user-login, [data-testid="user-login"]')).toContainText(
        testUser.login.toString()
      );
      await expect(page.locator('.user-name, [data-testid="user-name"]')).toContainText(
        testUser.name
      );
    });

    test('should display user group', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const groupInfo = page.locator('[data-testid="user-group"], .user-group');
      await expect(groupInfo).toContainText('real\\vip');
    });

    test('should display user email', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const emailInfo = page.locator('[data-testid="user-email"], .user-email');
      await expect(emailInfo).toContainText(testUser.email);
    });

    test('should display user leverage', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const leverageInfo = page.locator('[data-testid="user-leverage"], .user-leverage');
      await expect(leverageInfo).toContainText(`1:${testUser.leverage}`);
    });

    test('should display user status', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const statusBadge = page.locator('[data-testid="user-status"], .status-badge');
      await expect(statusBadge).toContainText(/active/i);
    });

    test('should display registration date', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const registrationInfo = page.locator('[data-testid="registration-date"], .registration-date');
      await expect(registrationInfo).toBeVisible();
    });

    test('should display last access time', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const lastAccessInfo = page.locator('[data-testid="last-access"], .last-access');
      await expect(lastAccessInfo).toBeVisible();
    });
  });

  test.describe('Balance and Equity Display', () => {
    test('should display balance', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const balanceInfo = page.locator('[data-testid="balance"], .balance');
      await expect(balanceInfo).toContainText('50,000.00');
    });

    test('should display equity', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const equityInfo = page.locator('[data-testid="equity"], .equity');
      await expect(equityInfo).toContainText('52,500.75');
    });

    test('should display margin', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const marginInfo = page.locator('[data-testid="margin"], .margin');
      await expect(marginInfo).toContainText('5,000.00');
    });

    test('should display free margin', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const freeMarginInfo = page.locator('[data-testid="free-margin"], .free-margin');
      await expect(freeMarginInfo).toContainText('47,500.75');
    });

    test('should display margin level', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const marginLevelInfo = page.locator('[data-testid="margin-level"], .margin-level');
      await expect(marginLevelInfo).toContainText('1050');
    });

    test('should display profit/loss', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const profitInfo = page.locator('[data-testid="profit"], .profit');
      await expect(profitInfo).toContainText('2,500.75');
    });

    test('should display credit', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const creditInfo = page.locator('[data-testid="credit"], .credit');
      await expect(creditInfo).toContainText('0.00');
    });

    test('should highlight negative profit in red', async ({ page }) => {
      const userWithLoss = { ...testUser, profit: -1500.25, equity: 48499.75 };

      await mockApiResponse(page, new RegExp(`/api/mt-servers/.*/users/${testUser.login}`), {
        body: userWithLoss,
      });

      await page.goto(`/users/${testUser.login}`);

      const profitInfo = page.locator('[data-testid="profit"], .profit');
      await expect(profitInfo).toHaveClass(/negative|loss|red/);
    });

    test('should show margin call warning when margin level low', async ({ page }) => {
      const marginCallUser = TradingUserFactory.createMarginCall({ login: testUser.login });

      await mockApiResponse(page, new RegExp(`/api/mt-servers/.*/users/${testUser.login}`), {
        body: marginCallUser,
      });

      await page.goto(`/users/${testUser.login}`);

      const marginWarning = page.locator('.margin-warning, [data-testid="margin-call-warning"]');
      await expect(marginWarning).toBeVisible();
    });
  });

  test.describe('Positions Tab', () => {
    test('should display positions tab', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const positionsTab = page.locator('button:has-text("Positions"), [data-tab="positions"]');
      await expect(positionsTab).toBeVisible();
    });

    test('should show positions list', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      // Click positions tab
      await page.locator('button:has-text("Positions"), [data-tab="positions"]').click();

      // Should show positions table
      const positionsTable = page.locator('[data-testid="positions-table"], .positions-table');
      await expect(positionsTable).toBeVisible();

      // Should have correct number of positions
      const rows = positionsTable.locator('tbody tr');
      await expect(rows).toHaveCount(3);
    });

    test('should display position details', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);
      await page.locator('button:has-text("Positions"), [data-tab="positions"]').click();

      const positionsTable = page.locator('[data-testid="positions-table"], .positions-table');

      // Check for position columns
      await expect(positionsTable).toContainText('Ticket');
      await expect(positionsTable).toContainText('Symbol');
      await expect(positionsTable).toContainText('Type');
      await expect(positionsTable).toContainText('Volume');
      await expect(positionsTable).toContainText('Profit');
    });

    test('should show empty state when no positions', async ({ page }) => {
      await mockApiResponse(page, new RegExp(`/api/mt-servers/.*/users/${testUser.login}/positions`), {
        body: [],
      });

      await page.goto(`/users/${testUser.login}`);
      await page.locator('button:has-text("Positions"), [data-tab="positions"]').click();

      const emptyState = page.locator('.empty-positions, [data-testid="no-positions"]');
      await expect(emptyState).toBeVisible();
    });

    test('should calculate total position profit', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);
      await page.locator('button:has-text("Positions"), [data-tab="positions"]').click();

      const totalProfit = page.locator('[data-testid="total-profit"], .total-profit');
      await expect(totalProfit).toBeVisible();
    });
  });

  test.describe('Orders Tab', () => {
    test('should display orders tab', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const ordersTab = page.locator('button:has-text("Orders"), [data-tab="orders"]');
      await expect(ordersTab).toBeVisible();
    });

    test('should show pending orders list', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      // Click orders tab
      await page.locator('button:has-text("Orders"), [data-tab="orders"]').click();

      // Should show orders table
      const ordersTable = page.locator('[data-testid="orders-table"], .orders-table');
      await expect(ordersTable).toBeVisible();

      // Should have correct number of orders
      const rows = ordersTable.locator('tbody tr');
      await expect(rows).toHaveCount(2);
    });

    test('should display order details', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);
      await page.locator('button:has-text("Orders"), [data-tab="orders"]').click();

      const ordersTable = page.locator('[data-testid="orders-table"], .orders-table');

      // Check for order columns
      await expect(ordersTable).toContainText('Ticket');
      await expect(ordersTable).toContainText('Symbol');
      await expect(ordersTable).toContainText('Type');
      await expect(ordersTable).toContainText('Price');
    });

    test('should show empty state when no orders', async ({ page }) => {
      await mockApiResponse(page, new RegExp(`/api/mt-servers/.*/users/${testUser.login}/orders`), {
        body: [],
      });

      await page.goto(`/users/${testUser.login}`);
      await page.locator('button:has-text("Orders"), [data-tab="orders"]').click();

      const emptyState = page.locator('.empty-orders, [data-testid="no-orders"]');
      await expect(emptyState).toBeVisible();
    });
  });

  test.describe('Deals/History Tab', () => {
    const testDeals = [
      {
        ticket: 10000001,
        time: new Date().toISOString(),
        type: 'buy',
        symbol: 'EURUSD',
        volume: 1.0,
        price: 1.1050,
        profit: 150.25,
        commission: -7.00,
        swap: -2.50,
      },
      {
        ticket: 10000002,
        time: new Date().toISOString(),
        type: 'sell',
        symbol: 'GBPUSD',
        volume: 0.5,
        price: 1.2750,
        profit: -75.00,
        commission: -3.50,
        swap: 0,
      },
    ];

    test('should display deals tab', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const dealsTab = page.locator('button:has-text("Deals"), button:has-text("History"), [data-tab="deals"]');
      await expect(dealsTab).toBeVisible();
    });

    test('should show deal history', async ({ page }) => {
      await mockApiResponse(page, new RegExp(`/api/mt-servers/.*/users/${testUser.login}/deals`), {
        body: testDeals,
      });

      await page.goto(`/users/${testUser.login}`);

      // Click deals tab
      await page.locator('button:has-text("Deals"), button:has-text("History"), [data-tab="deals"]').click();

      // Should show deals table
      const dealsTable = page.locator('[data-testid="deals-table"], .deals-table');
      await expect(dealsTable).toBeVisible();
    });

    test('should display deal details', async ({ page }) => {
      await mockApiResponse(page, new RegExp(`/api/mt-servers/.*/users/${testUser.login}/deals`), {
        body: testDeals,
      });

      await page.goto(`/users/${testUser.login}`);
      await page.locator('button:has-text("Deals"), button:has-text("History"), [data-tab="deals"]').click();

      const dealsTable = page.locator('[data-testid="deals-table"], .deals-table');

      // Check for deal columns
      await expect(dealsTable).toContainText('Time');
      await expect(dealsTable).toContainText('Symbol');
      await expect(dealsTable).toContainText('Profit');
    });

    test('should filter deals by date range', async ({ page }) => {
      await mockApiResponse(page, new RegExp(`/api/mt-servers/.*/users/${testUser.login}/deals`), {
        body: testDeals,
      });

      await page.goto(`/users/${testUser.login}`);
      await page.locator('button:has-text("Deals"), button:has-text("History"), [data-tab="deals"]').click();

      // Date range picker
      const dateFrom = page.locator('input[name="dateFrom"], [data-testid="date-from"]');
      const dateTo = page.locator('input[name="dateTo"], [data-testid="date-to"]');

      if (await dateFrom.isVisible()) {
        await dateFrom.fill('2024-01-01');
        await dateTo.fill('2024-12-31');

        await page.locator('button:has-text("Apply"), button:has-text("Filter")').click();

        await waitForApiResponse(page, /deals.*from=.*to=/, { method: 'GET' });
      }
    });

    test('should calculate total profit from deals', async ({ page }) => {
      await mockApiResponse(page, new RegExp(`/api/mt-servers/.*/users/${testUser.login}/deals`), {
        body: testDeals,
      });

      await page.goto(`/users/${testUser.login}`);
      await page.locator('button:has-text("Deals"), button:has-text("History"), [data-tab="deals"]').click();

      const totalProfit = page.locator('[data-testid="deals-total-profit"], .total-profit');
      await expect(totalProfit).toBeVisible();
    });
  });

  test.describe('Data Loading States', () => {
    test('should show loading state while fetching user data', async ({ page }) => {
      // Delay response
      page.route(new RegExp(`/api/mt-servers/.*/users/${testUser.login}`), async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(testUser),
        });
      });

      await page.goto(`/users/${testUser.login}`);

      const loadingIndicator = page.locator('.loading, .spinner, [role="progressbar"]');
      await expect(loadingIndicator).toBeVisible();
    });

    test('should show error state when user not found', async ({ page }) => {
      await mockApiResponse(page, new RegExp(`/api/mt-servers/.*/users/${testUser.login}`), {
        status: 404,
        body: { error: 'User not found' },
      });

      await page.goto(`/users/${testUser.login}`);

      const errorState = page.locator('.error-state, [data-testid="user-not-found"]');
      await expect(errorState).toBeVisible();
    });

    test('should refresh data on button click', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const refreshButton = page.locator('button:has-text("Refresh"), [data-testid="refresh"]');
      if (await refreshButton.isVisible()) {
        await refreshButton.click();

        await waitForApiResponse(page, new RegExp(`/users/${testUser.login}`), { method: 'GET' });
      }
    });
  });

  test.describe('Navigation', () => {
    test('should navigate back to user list', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const backButton = page.locator('button:has-text("Back"), a:has-text("Back"), [data-testid="back"]');
      await backButton.click();

      await expect(page).toHaveURL(/\/users$/);
    });

    test('should show breadcrumbs', async ({ page }) => {
      await page.goto(`/users/${testUser.login}`);

      const breadcrumbs = page.locator('.breadcrumbs, [data-testid="breadcrumbs"]');
      await expect(breadcrumbs).toBeVisible();
      await expect(breadcrumbs).toContainText('Users');
      await expect(breadcrumbs).toContainText(testUser.login.toString());
    });
  });
});
