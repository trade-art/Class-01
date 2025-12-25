import { Page, expect, Locator } from '@playwright/test';
import { TenantFactory, UserFactory, MtServerFactory } from '../factories';
import { AuthHelper, createAuthHelper } from './auth.helper';
import { ApiHelper, createApiHelper } from './api.helper';

/**
 * Test context with commonly used helpers
 */
export interface TestContext {
  page: Page;
  auth: AuthHelper;
  api: ApiHelper;
}

/**
 * Create test context with helpers
 */
export function createTestContext(page: Page): TestContext {
  return {
    page,
    auth: createAuthHelper(page, page.context()),
    api: createApiHelper(page),
  };
}

/**
 * Wait for element to stabilize (no animations/transitions)
 */
export async function waitForStable(locator: Locator, timeout = 5000): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout });

  // Wait for any animations to complete
  await locator.evaluate((el) => {
    return new Promise<void>((resolve) => {
      const animations = el.getAnimations();
      if (animations.length === 0) {
        resolve();
        return;
      }
      Promise.all(animations.map((a) => a.finished)).then(() => resolve());
    });
  });
}

/**
 * Wait for network idle
 */
export async function waitForNetworkIdle(page: Page, timeout = 5000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Retry an action multiple times
 */
export async function retry<T>(
  action: () => Promise<T>,
  options: { maxAttempts?: number; delay?: number; shouldRetry?: (error: Error) => boolean } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, shouldRetry = () => true } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Generate unique test ID
 */
export function generateTestId(prefix = 'test'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Create test tenant data with unique identifiers
 */
export function createTestTenantData() {
  const testId = generateTestId();
  return TenantFactory.create({
    code: `TST${testId.substring(0, 6).toUpperCase()}`,
    name: `Test Tenant ${testId}`,
  });
}

/**
 * Create test user data with unique identifiers
 */
export function createTestUserData(tenantId: string, role?: 'owner' | 'admin' | 'operator' | 'viewer') {
  const testId = generateTestId();
  return UserFactory.create(tenantId, {
    email: `user-${testId}@test.local`,
    name: `Test User ${testId}`,
    role,
  });
}

/**
 * Create test MT server data with mock middleware
 */
export function createTestMtServerData(tenantId: string) {
  return MtServerFactory.createWithMockMiddleware(tenantId);
}

/**
 * Take screenshot on failure
 */
export async function screenshotOnFailure(page: Page, testName: string): Promise<string | null> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${testName}-${timestamp}.png`;
    const path = `e2e/screenshots/${filename}`;
    await page.screenshot({ path, fullPage: true });
    return path;
  } catch (error) {
    console.error('Failed to take screenshot:', error);
    return null;
  }
}

/**
 * Log page console messages for debugging
 */
export function setupConsoleLogger(page: Page): void {
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      console.log(`[${type.toUpperCase()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', (error) => {
    console.error('[PAGE ERROR]', error.message);
  });
}

/**
 * Wait for API response
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  options: { method?: string; timeout?: number } = {}
): Promise<{ status: number; body: unknown }> {
  const { method, timeout = 10000 } = options;

  const response = await page.waitForResponse(
    (resp) => {
      const urlMatches =
        typeof urlPattern === 'string'
          ? resp.url().includes(urlPattern)
          : urlPattern.test(resp.url());

      const methodMatches = !method || resp.request().method() === method.toUpperCase();

      return urlMatches && methodMatches;
    },
    { timeout }
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  return { status: response.status(), body };
}

/**
 * Intercept and mock API response
 * Only intercepts XHR/Fetch requests, not page navigation
 */
export async function mockApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  response: { status?: number; body: unknown }
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    const acceptHeader = request.headers()['accept'] || '';

    // Only intercept XHR/Fetch requests (API calls), not document navigation
    // Check resource type and accept header to distinguish API calls from page loads
    const isApiRequest =
      resourceType === 'xhr' ||
      resourceType === 'fetch' ||
      acceptHeader.includes('application/json') ||
      !acceptHeader.includes('text/html');

    if (isApiRequest && resourceType !== 'document') {
      await route.fulfill({
        status: response.status || 200,
        contentType: 'application/json',
        body: JSON.stringify(response.body),
      });
    } else {
      // Let page navigation requests pass through
      await route.continue();
    }
  });
}

/**
 * Clear all mocked routes
 */
export async function clearMocks(page: Page): Promise<void> {
  await page.unrouteAll();
}

/**
 * Assert table row count
 */
export async function expectTableRowCount(
  page: Page,
  tableSelector: string,
  expectedCount: number
): Promise<void> {
  const table = page.locator(tableSelector);
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(expectedCount);
}

/**
 * Assert form validation error
 */
export async function expectFormError(
  page: Page,
  fieldName: string,
  errorMessage: string
): Promise<void> {
  const errorLocator = page.locator(
    `[data-field="${fieldName}"] .error, [name="${fieldName}"] + .error, .field-error:has-text("${errorMessage}")`
  );
  await expect(errorLocator).toBeVisible();
  await expect(errorLocator).toContainText(errorMessage);
}

/**
 * Assert toast notification
 */
export async function expectToast(
  page: Page,
  options: { type?: 'success' | 'error' | 'warning' | 'info'; message?: string }
): Promise<void> {
  const toastSelector = options.type
    ? `.toast.${options.type}, .toast-${options.type}, [data-toast-type="${options.type}"]`
    : '.toast, .notification, [role="alert"]';

  const toast = page.locator(toastSelector);
  await expect(toast).toBeVisible();

  if (options.message) {
    await expect(toast).toContainText(options.message);
  }
}

/**
 * Dismiss all visible toasts
 */
export async function dismissToasts(page: Page): Promise<void> {
  const closeButtons = page.locator('.toast-close, .toast [aria-label="Close"]');
  const count = await closeButtons.count();

  for (let i = 0; i < count; i++) {
    await closeButtons.nth(i).click();
  }
}

/**
 * Scroll element into view
 */
export async function scrollIntoView(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
}

/**
 * Get table data as array of objects
 */
export async function getTableData<T extends Record<string, string>>(
  page: Page,
  tableSelector: string,
  columns: (keyof T)[]
): Promise<T[]> {
  const table = page.locator(tableSelector);
  const rows = await table.locator('tbody tr').all();

  const data: T[] = [];

  for (const row of rows) {
    const cells = await row.locator('td').all();
    const rowData: Record<string, string> = {};

    for (let i = 0; i < columns.length && i < cells.length; i++) {
      const text = await cells[i].textContent();
      rowData[columns[i] as string] = text?.trim() || '';
    }

    data.push(rowData as T);
  }

  return data;
}

/**
 * Fill form fields
 */
export async function fillForm(
  page: Page,
  fields: Record<string, string | number | boolean>
): Promise<void> {
  for (const [name, value] of Object.entries(fields)) {
    const selector = `input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`;
    const field = page.locator(selector);

    if (typeof value === 'boolean') {
      if (value) {
        await field.check();
      } else {
        await field.uncheck();
      }
    } else if (await field.evaluate((el) => el.tagName === 'SELECT')) {
      await field.selectOption(String(value));
    } else {
      await field.fill(String(value));
    }
  }
}

/**
 * Clear form fields
 */
export async function clearForm(page: Page, fieldNames: string[]): Promise<void> {
  for (const name of fieldNames) {
    const selector = `input[name="${name}"], textarea[name="${name}"]`;
    await page.locator(selector).clear();
  }
}

/**
 * Format date for input
 */
export function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Format datetime for input
 */
export function formatDateTimeForInput(date: Date): string {
  return date.toISOString().slice(0, 16);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Setup Pinia auth state in localStorage (for tenant-console Vue app)
 * This bypasses the need for actual login by setting up the persisted Pinia state
 */
export async function setupPiniaAuthState(
  page: Page,
  options: {
    userId?: string;
    email?: string;
    role?: 'owner' | 'admin' | 'operator';
    tenantId?: string;
    tenantName?: string;
    tenantCode?: string;
  } = {}
): Promise<void> {
  const {
    userId = 'test-user-001',
    email = 'admin@test.local',
    role = 'owner',
    tenantId = 'test-tenant-001',
    tenantName = 'Test Tenant',
    tenantCode = 'TEST',
  } = options;

  // Generate mock JWT token
  const mockToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify({
    sub: userId,
    email,
    role,
    tenantId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }))}.mock-signature`;

  // Pinia persisted state structure for 'tenant-auth' store
  const piniaAuthState = {
    accessToken: mockToken,
    refreshToken: `refresh-${mockToken}`,
    admin: {
      id: userId,
      email,
      name: email.split('@')[0],
      role,
      tenantId,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    tenant: {
      id: tenantId,
      code: tenantCode,
      name: tenantName,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };

  await page.addInitScript((state) => {
    localStorage.setItem('tenant-auth', JSON.stringify(state));
  }, piniaAuthState);
}

/**
 * Clear Pinia auth state from localStorage
 */
export async function clearPiniaAuthState(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('tenant-auth');
  });
}

/**
 * Assert Naive UI toast/message notification
 * Naive UI uses n-message component which renders in a different container
 */
export async function expectNaiveMessage(
  page: Page,
  options: { type?: 'success' | 'error' | 'warning' | 'info'; message?: string | RegExp; timeout?: number }
): Promise<void> {
  const { type, message, timeout = 5000 } = options;

  // Naive UI message container selectors
  const containerSelector = '.n-message-container, .n-message-wrapper';
  const messageSelector = type
    ? `.n-message--${type}-type, .n-message.n-message--${type}`
    : '.n-message';

  const container = page.locator(containerSelector);
  const messageEl = container.locator(messageSelector);

  await expect(messageEl.first()).toBeVisible({ timeout });

  if (message) {
    if (typeof message === 'string') {
      await expect(messageEl.first()).toContainText(message);
    } else {
      const text = await messageEl.first().textContent();
      expect(text).toMatch(message);
    }
  }
}

/**
 * Click Naive UI dropdown menu item
 * Opens the dropdown and clicks the specified menu item
 */
export async function clickNaiveDropdownItem(
  page: Page,
  triggerLocator: Locator,
  itemKey: string | RegExp
): Promise<void> {
  // Click the dropdown trigger
  await triggerLocator.click();

  // Wait for dropdown menu to appear
  const dropdownMenu = page.locator('.n-dropdown-menu, .n-popover');
  await expect(dropdownMenu).toBeVisible();

  // Click the menu item
  const menuItem = typeof itemKey === 'string'
    ? dropdownMenu.locator(`.n-dropdown-option:has-text("${itemKey}")`)
    : dropdownMenu.locator('.n-dropdown-option').filter({ hasText: itemKey });

  await menuItem.click();
}
