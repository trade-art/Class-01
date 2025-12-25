import { test, expect } from '@playwright/test';
import { TradingUserFactory } from '../../factories';
import { PositionsPage } from '../../pages';
import {
  generateTestId,
  waitForApiResponse,
  mockApiResponse,
  clearMocks,
} from '../../support';

/**
 * Positions List E2E Tests
 *
 * Tests the positions list functionality including:
 * - Display all positions with real-time P&L
 * - Filter by symbol and user
 * - Data refresh
 * - Real-time updates
 */

test.describe('Positions List', () => {
  let positionsPage: PositionsPage;

  const generatePositions = (count: number, login?: number) => {
    const userLogin = login || 100001;
    return TradingUserFactory.createPositions(userLogin, count);
  };

  test.beforeEach(async ({ page }) => {
    positionsPage = new PositionsPage(page);

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

  test.describe('Display Positions', () => {
    test('should display all positions in table', async ({ page }) => {
      const positions = generatePositions(10);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: positions,
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      const count = await positionsPage.getPositionCount();
      expect(count).toBe(10);
    });

    test('should display position details correctly', async ({ page }) => {
      const position = TradingUserFactory.createPosition(100001, {
        ticket: 12345678,
        symbol: 'EURUSD',
        type: 'buy',
        volume: 1.5,
        openPrice: 1.1050,
        currentPrice: 1.1075,
        profit: 375.00,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: [position],
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      const table = page.locator('table, [data-testid="positions-table"]');
      await expect(table).toContainText('12345678');
      await expect(table).toContainText('EURUSD');
      await expect(table).toContainText('Buy');
      await expect(table).toContainText('1.5');
    });

    test('should display real-time profit/loss', async ({ page }) => {
      const positions = [
        TradingUserFactory.createPosition(100001, { profit: 500.25, type: 'buy' }),
        TradingUserFactory.createPosition(100002, { profit: -250.50, type: 'sell' }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: positions,
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      // Positive profit should be styled green
      const profitCell = page.locator(`tr:has-text("${positions[0].ticket}") .profit, tr:has-text("${positions[0].ticket}") [data-field="profit"]`);
      await expect(profitCell).toHaveClass(/positive|profit|green/);

      // Negative profit should be styled red
      const lossCell = page.locator(`tr:has-text("${positions[1].ticket}") .profit, tr:has-text("${positions[1].ticket}") [data-field="profit"]`);
      await expect(lossCell).toHaveClass(/negative|loss|red/);
    });

    test('should display summary statistics', async ({ page }) => {
      const positions = generatePositions(5);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: positions,
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      await positionsPage.expectSummaryVisible();
    });

    test('should show empty state when no positions', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: [],
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      const emptyState = page.locator('.empty-state, [data-testid="no-positions"]');
      await expect(emptyState).toBeVisible();
    });
  });

  test.describe('Filter by Symbol', () => {
    test('should filter positions by symbol', async ({ page }) => {
      const eurusdPositions = [
        TradingUserFactory.createPosition(100001, { symbol: 'EURUSD' }),
        TradingUserFactory.createPosition(100002, { symbol: 'EURUSD' }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions.*symbol=EURUSD/, {
        body: eurusdPositions,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: generatePositions(10),
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      await positionsPage.filterBySymbol('EURUSD');

      await waitForApiResponse(page, /symbol=EURUSD/, { method: 'GET' });

      const count = await positionsPage.getPositionCount();
      expect(count).toBe(2);
    });

    test('should display available symbols in filter', async ({ page }) => {
      const positions = [
        TradingUserFactory.createPosition(100001, { symbol: 'EURUSD' }),
        TradingUserFactory.createPosition(100002, { symbol: 'GBPUSD' }),
        TradingUserFactory.createPosition(100003, { symbol: 'XAUUSD' }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: positions,
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      const symbolFilter = page.locator('select[name="symbol"], [data-testid="symbol-filter"]');
      await expect(symbolFilter).toContainText('EURUSD');
      await expect(symbolFilter).toContainText('GBPUSD');
      await expect(symbolFilter).toContainText('XAUUSD');
    });

    test('should clear symbol filter', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: generatePositions(10),
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      await positionsPage.filterBySymbol('EURUSD');

      const clearButton = page.locator('button:has-text("Clear"), [data-testid="clear-filter"]');
      if (await clearButton.isVisible()) {
        await clearButton.click();
        await waitForApiResponse(page, /\/positions/, { method: 'GET' });
      }
    });
  });

  test.describe('Filter by User', () => {
    test('should filter positions by user login', async ({ page }) => {
      const userPositions = TradingUserFactory.createPositions(100001, 3);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions.*login=100001/, {
        body: userPositions,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: generatePositions(10),
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      await positionsPage.search('100001');

      await waitForApiResponse(page, /login=100001/, { method: 'GET' });
    });

    test('should combine symbol and user filters', async ({ page }) => {
      const filteredPositions = [
        TradingUserFactory.createPosition(100001, { symbol: 'EURUSD' }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions.*symbol=EURUSD.*login=100001/, {
        body: filteredPositions,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: generatePositions(10),
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      await positionsPage.filterBySymbol('EURUSD');
      await positionsPage.search('100001');

      await waitForApiResponse(page, /symbol=EURUSD.*login=100001|login=100001.*symbol=EURUSD/, {
        method: 'GET',
        timeout: 5000,
      });
    });
  });

  test.describe('Filter by Type', () => {
    test('should filter by buy positions', async ({ page }) => {
      const buyPositions = [
        TradingUserFactory.createPosition(100001, { type: 'buy' }),
        TradingUserFactory.createPosition(100002, { type: 'buy' }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions.*type=buy/, {
        body: buyPositions,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: generatePositions(10),
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      await positionsPage.filterByType('buy');

      await waitForApiResponse(page, /type=buy/, { method: 'GET' });
    });

    test('should filter by sell positions', async ({ page }) => {
      const sellPositions = [
        TradingUserFactory.createPosition(100001, { type: 'sell' }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions.*type=sell/, {
        body: sellPositions,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: generatePositions(10),
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      await positionsPage.filterByType('sell');

      await waitForApiResponse(page, /type=sell/, { method: 'GET' });
    });
  });

  test.describe('Data Refresh', () => {
    test('should refresh positions on button click', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: generatePositions(5),
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      await positionsPage.refresh();

      await waitForApiResponse(page, /\/positions/, { method: 'GET' });
    });

    test('should show loading state during refresh', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: generatePositions(5),
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      // Delay refresh response
      page.route(/\/api\/mt-servers\/.*\/positions/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(generatePositions(5)),
        });
      });

      await positionsPage.refresh();

      const loadingIndicator = page.locator('.loading, .spinner');
      await expect(loadingIndicator).toBeVisible();
    });

    test('should update last refresh time', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: generatePositions(5),
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      const lastUpdate = page.locator('[data-testid="last-update"], .last-update');
      if (await lastUpdate.isVisible()) {
        const initialTime = await lastUpdate.textContent();

        await positionsPage.refresh();
        await waitForApiResponse(page, /\/positions/, { method: 'GET' });

        const updatedTime = await lastUpdate.textContent();
        expect(updatedTime).not.toBe(initialTime);
      }
    });
  });

  test.describe('Real-time Updates', () => {
    test('should show connection status indicator', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: generatePositions(5),
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      const connectionIndicator = page.locator('[data-testid="connection-indicator"], .connection-status');
      await expect(connectionIndicator).toBeVisible();
    });

    test('should update positions in real-time', async ({ page }) => {
      const initialPositions = [
        TradingUserFactory.createPosition(100001, {
          ticket: 12345678,
          profit: 100.00,
        }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: initialPositions,
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      // Simulate WebSocket update by triggering a refresh
      const updatedPositions = [
        { ...initialPositions[0], profit: 150.00, currentPrice: 1.1100 },
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: updatedPositions,
      });

      await positionsPage.refresh();

      const profitCell = page.locator(`tr:has-text("12345678") [data-field="profit"], tr:has-text("12345678") .profit`);
      await expect(profitCell).toContainText('150');
    });
  });

  test.describe('Position Details', () => {
    test('should show position details on click', async ({ page }) => {
      const position = TradingUserFactory.createPosition(100001, {
        ticket: 12345678,
        swap: -5.25,
        comment: 'Test position',
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: [position],
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      await positionsPage.viewPositionDetails(12345678);

      const modal = page.locator('.modal, [role="dialog"]');
      await expect(modal).toBeVisible();

      // Should show additional details
      await expect(modal).toContainText('Swap');
      await expect(modal).toContainText('-5.25');
    });

    test('should close position details modal', async ({ page }) => {
      const position = TradingUserFactory.createPosition(100001, { ticket: 12345678 });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: [position],
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      await positionsPage.viewPositionDetails(12345678);
      await positionsPage.closePositionDetails();

      const modal = page.locator('.modal, [role="dialog"]');
      await expect(modal).toBeHidden();
    });
  });

  test.describe('Summary Statistics', () => {
    test('should display total positions count', async ({ page }) => {
      const positions = generatePositions(15);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: positions,
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      const totalPositions = await positionsPage.getTotalPositions();
      expect(totalPositions).toBe(15);
    });

    test('should display total profit', async ({ page }) => {
      const positions = [
        TradingUserFactory.createPosition(100001, { profit: 500 }),
        TradingUserFactory.createPosition(100002, { profit: 300 }),
        TradingUserFactory.createPosition(100003, { profit: -200 }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: positions,
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      const totalProfit = await positionsPage.getTotalProfit();
      expect(totalProfit).toBeCloseTo(600, 0);
    });

    test('should display total volume', async ({ page }) => {
      const positions = [
        TradingUserFactory.createPosition(100001, { volume: 1.5 }),
        TradingUserFactory.createPosition(100002, { volume: 0.5 }),
        TradingUserFactory.createPosition(100003, { volume: 2.0 }),
      ];

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions/, {
        body: positions,
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      const totalVolume = await positionsPage.getTotalVolume();
      expect(totalVolume).toBeCloseTo(4.0, 1);
    });
  });

  test.describe('Pagination', () => {
    test('should paginate large position list', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions.*page=1/, {
        body: {
          positions: generatePositions(20),
          total: 100,
          page: 1,
          limit: 20,
        },
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      const pagination = page.locator('.pagination, [data-testid="pagination"]');
      await expect(pagination).toBeVisible();
    });

    test('should navigate to next page', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions.*page=1/, {
        body: {
          positions: generatePositions(20),
          total: 100,
          page: 1,
          limit: 20,
        },
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/positions.*page=2/, {
        body: {
          positions: generatePositions(20),
          total: 100,
          page: 2,
          limit: 20,
        },
      });

      await positionsPage.goto();
      await positionsPage.waitForLoad();

      await positionsPage.nextPage();

      await waitForApiResponse(page, /page=2/, { method: 'GET' });
    });
  });
});
