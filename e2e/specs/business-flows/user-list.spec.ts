import { test, expect } from '@playwright/test';
import { TradingUserFactory } from '../../factories';
import { UsersPage } from '../../pages';
import {
  generateTestId,
  waitForApiResponse,
  expectToast,
  mockApiResponse,
  clearMocks,
  expectTableRowCount,
} from '../../support';

/**
 * User List E2E Tests
 *
 * Tests the trading user list functionality including:
 * - User list display
 * - Pagination
 * - Search by login/name
 * - Filter by group
 */

test.describe('User List', () => {
  let usersPage: UsersPage;

  // Generate test users
  const generateTestUsers = (count: number) => {
    return TradingUserFactory.createMany(count);
  };

  test.beforeEach(async ({ page }) => {
    usersPage = new UsersPage(page);

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

  test.describe('Display User List', () => {
    test('should display all users in table', async ({ page }) => {
      const users = generateTestUsers(5);

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users,
          total: 5,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await usersPage.waitForLoad();

      const userCount = await usersPage.getUserCount();
      expect(userCount).toBe(5);
    });

    test('should display user login, name, balance, and status', async ({ page }) => {
      const user = TradingUserFactory.create({
        login: 100001,
        name: 'John Doe',
        balance: 10000.50,
        status: 'active',
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: [user],
          total: 1,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await usersPage.waitForLoad();

      const table = page.locator('table, [data-testid="users-table"]');

      // Check for user data in table
      await expect(table).toContainText('100001');
      await expect(table).toContainText('John Doe');
      await expect(table).toContainText('10,000.50');
    });

    test('should display user equity and margin info', async ({ page }) => {
      const user = TradingUserFactory.create({
        equity: 12500.75,
        margin: 2500.00,
        marginFree: 10000.75,
        marginLevel: 500.03,
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: [user],
          total: 1,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await usersPage.waitForLoad();

      const table = page.locator('table, [data-testid="users-table"]');
      await expect(table).toContainText('12,500.75');
    });

    test('should show empty state when no users', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: [],
          total: 0,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await usersPage.waitForLoad();

      const emptyState = page.locator('.empty-state, [data-testid="no-users"]');
      await expect(emptyState).toBeVisible();
    });

    test('should display loading state while fetching users', async ({ page }) => {
      // Delay response to observe loading state
      page.route(/\/api\/mt-servers\/.*\/users/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            users: generateTestUsers(3),
            total: 3,
            page: 1,
            limit: 10,
          }),
        });
      });

      await page.goto('/users');

      const loadingIndicator = page.locator('.loading, .spinner, [role="progressbar"]');
      await expect(loadingIndicator).toBeVisible();

      await usersPage.waitForLoad();
    });
  });

  test.describe('Pagination', () => {
    test('should paginate through user list', async ({ page }) => {
      // Mock first page
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users.*page=1/, {
        body: {
          users: generateTestUsers(10),
          total: 25,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await usersPage.waitForLoad();

      // Check pagination info
      const pagination = page.locator('.pagination, [data-testid="pagination"]');
      await expect(pagination).toBeVisible();

      // Mock second page
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users.*page=2/, {
        body: {
          users: generateTestUsers(10),
          total: 25,
          page: 2,
          limit: 10,
        },
      });

      // Go to next page
      await usersPage.nextPage();

      // Should fetch page 2
      await waitForApiResponse(page, /page=2/, { method: 'GET' });
    });

    test('should display page numbers', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: generateTestUsers(10),
          total: 50,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await usersPage.waitForLoad();

      const pagination = page.locator('.pagination, [data-testid="pagination"]');

      // Should show total pages info
      await expect(pagination).toContainText(/1|50|5/);
    });

    test('should disable previous button on first page', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: generateTestUsers(10),
          total: 25,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await usersPage.waitForLoad();

      const prevButton = page.locator('button:has-text("Previous"), [aria-label="Previous page"]');
      await expect(prevButton).toBeDisabled();
    });

    test('should disable next button on last page', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: generateTestUsers(5),
          total: 5,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await usersPage.waitForLoad();

      const nextButton = page.locator('button:has-text("Next"), [aria-label="Next page"]');
      await expect(nextButton).toBeDisabled();
    });

    test('should change page size', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: generateTestUsers(10),
          total: 50,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await usersPage.waitForLoad();

      // Change page size
      const pageSizeSelect = page.locator('select[name="pageSize"], [data-testid="page-size"]');
      if (await pageSizeSelect.isVisible()) {
        await mockApiResponse(page, /\/api\/mt-servers\/.*\/users.*limit=25/, {
          body: {
            users: generateTestUsers(25),
            total: 50,
            page: 1,
            limit: 25,
          },
        });

        await pageSizeSelect.selectOption('25');
        await waitForApiResponse(page, /limit=25/, { method: 'GET' });
      }
    });
  });

  test.describe('Search', () => {
    test('should search by login number', async ({ page }) => {
      const targetUser = TradingUserFactory.create({ login: 123456 });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users.*search=123456/, {
        body: {
          users: [targetUser],
          total: 1,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');

      // Initial load with all users
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: generateTestUsers(10),
          total: 50,
          page: 1,
          limit: 10,
        },
      });

      await usersPage.waitForLoad();

      // Search for specific login
      await usersPage.search('123456');

      // Should show only matching user
      const userCount = await usersPage.getUserCount();
      expect(userCount).toBe(1);
    });

    test('should search by name', async ({ page }) => {
      const targetUser = TradingUserFactory.create({ name: 'John Smith' });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users.*search=John/, {
        body: {
          users: [targetUser],
          total: 1,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: generateTestUsers(10),
          total: 50,
          page: 1,
          limit: 10,
        },
      });
      await usersPage.waitForLoad();

      await usersPage.search('John');

      await waitForApiResponse(page, /search=John/, { method: 'GET' });
    });

    test('should show no results for non-matching search', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users.*search=nonexistent/, {
        body: {
          users: [],
          total: 0,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: generateTestUsers(10),
          total: 50,
          page: 1,
          limit: 10,
        },
      });
      await usersPage.waitForLoad();

      await usersPage.search('nonexistent');

      const emptyState = page.locator('.empty-state, [data-testid="no-results"]');
      await expect(emptyState).toBeVisible();
    });

    test('should clear search and show all users', async ({ page }) => {
      await page.goto('/users');
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: generateTestUsers(10),
          total: 50,
          page: 1,
          limit: 10,
        },
      });
      await usersPage.waitForLoad();

      // Search
      await usersPage.search('test');

      // Clear search
      const clearButton = page.locator('button:has-text("Clear"), [data-testid="clear-search"]');
      if (await clearButton.isVisible()) {
        await clearButton.click();
        await waitForApiResponse(page, /\/api\/mt-servers\/.*\/users/, { method: 'GET' });
      }
    });

    test('should debounce search input', async ({ page }) => {
      await page.goto('/users');
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: generateTestUsers(10),
          total: 50,
          page: 1,
          limit: 10,
        },
      });
      await usersPage.waitForLoad();

      const searchInput = page.locator('input[placeholder*="Search"], input[name="search"]');

      // Type quickly
      await searchInput.type('test query', { delay: 50 });

      // Should wait for debounce before making request
      await page.waitForTimeout(300);
      await waitForApiResponse(page, /search=test%20query/, { method: 'GET', timeout: 5000 });
    });
  });

  test.describe('Filter by Group', () => {
    test('should filter users by group', async ({ page }) => {
      const demoUsers = TradingUserFactory.createMany(3, { group: 'demo\\standard' });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users.*group=demo/, {
        body: {
          users: demoUsers,
          total: 3,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: generateTestUsers(10),
          total: 50,
          page: 1,
          limit: 10,
        },
      });
      await usersPage.waitForLoad();

      // Filter by demo group
      const groupFilter = page.locator('select[name="group"], [data-testid="group-filter"]');
      if (await groupFilter.isVisible()) {
        await groupFilter.selectOption('demo\\standard');
        await waitForApiResponse(page, /group=demo/, { method: 'GET' });
      }
    });

    test('should display available groups in filter', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/groups/, {
        body: {
          groups: ['demo\\standard', 'demo\\vip', 'real\\standard', 'real\\vip'],
        },
      });

      await page.goto('/users');
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: generateTestUsers(10),
          total: 50,
          page: 1,
          limit: 10,
        },
      });
      await usersPage.waitForLoad();

      const groupFilter = page.locator('select[name="group"], [data-testid="group-filter"]');
      if (await groupFilter.isVisible()) {
        const options = groupFilter.locator('option');
        await expect(options).toHaveCount(5); // Including "All" option
      }
    });

    test('should combine search and group filter', async ({ page }) => {
      const filteredUser = TradingUserFactory.create({
        name: 'John VIP',
        group: 'real\\vip',
      });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users.*search=John.*group=real/, {
        body: {
          users: [filteredUser],
          total: 1,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: generateTestUsers(10),
          total: 50,
          page: 1,
          limit: 10,
        },
      });
      await usersPage.waitForLoad();

      // Apply group filter first
      const groupFilter = page.locator('select[name="group"], [data-testid="group-filter"]');
      if (await groupFilter.isVisible()) {
        await groupFilter.selectOption('real\\vip');
      }

      // Then search
      await usersPage.search('John');

      // Both filters should be applied
      await waitForApiResponse(page, /search=John.*group=real|group=real.*search=John/, {
        method: 'GET',
        timeout: 5000,
      });
    });
  });

  test.describe('User Status Display', () => {
    test('should display active user status', async ({ page }) => {
      const activeUser = TradingUserFactory.create({ status: 'active' });

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: [activeUser],
          total: 1,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await usersPage.waitForLoad();

      const row = page.locator(`tr:has-text("${activeUser.login}")`);
      const statusBadge = row.locator('.status-badge, [data-testid="status"]');
      await expect(statusBadge).toHaveClass(/active|success|green/);
    });

    test('should display disabled user status', async ({ page }) => {
      const disabledUser = TradingUserFactory.createDisabled();

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: [disabledUser],
          total: 1,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await usersPage.waitForLoad();

      const row = page.locator(`tr:has-text("${disabledUser.login}")`);
      const statusBadge = row.locator('.status-badge, [data-testid="status"]');
      await expect(statusBadge).toHaveClass(/disabled|danger|red/);
    });

    test('should display margin call warning', async ({ page }) => {
      const marginCallUser = TradingUserFactory.createMarginCall();

      await mockApiResponse(page, /\/api\/mt-servers\/.*\/users/, {
        body: {
          users: [marginCallUser],
          total: 1,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');
      await usersPage.waitForLoad();

      const row = page.locator(`tr:has-text("${marginCallUser.login}")`);
      const warningIndicator = row.locator('.margin-warning, [data-testid="margin-call"]');
      await expect(warningIndicator).toBeVisible();
    });
  });

  test.describe('Server Selection', () => {
    test('should display server selector when multiple servers', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers$/, {
        body: [
          { id: 'server-1', name: 'MT5 Server 1' },
          { id: 'server-2', name: 'MT5 Server 2' },
        ],
      });

      await page.goto('/users');

      const serverSelector = page.locator('select[name="server"], [data-testid="server-selector"]');
      await expect(serverSelector).toBeVisible();
    });

    test('should load users from selected server', async ({ page }) => {
      await mockApiResponse(page, /\/api\/mt-servers$/, {
        body: [
          { id: 'server-1', name: 'Server 1' },
          { id: 'server-2', name: 'Server 2' },
        ],
      });

      await mockApiResponse(page, /\/api\/mt-servers\/server-2\/users/, {
        body: {
          users: generateTestUsers(5),
          total: 5,
          page: 1,
          limit: 10,
        },
      });

      await page.goto('/users');

      const serverSelector = page.locator('select[name="server"], [data-testid="server-selector"]');
      if (await serverSelector.isVisible()) {
        await serverSelector.selectOption('server-2');
        await waitForApiResponse(page, /\/mt-servers\/server-2\/users/, { method: 'GET' });
      }
    });
  });
});
