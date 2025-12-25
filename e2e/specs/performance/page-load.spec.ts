/**
 * Page Load Performance Tests
 *
 * Task 17: 验证页面加载性能
 * - 仪表板加载 < 2秒
 * - 用户列表加载 < 2秒
 * - 持仓列表加载 < 2秒
 * - 登录响应 < 1秒
 */

import { test, expect, Page } from '@playwright/test';
import { LoginPage, DashboardPage, UsersPage, PositionsPage, MtServersPage } from '../../pages';
import { AuthHelper } from '../../support/auth.helper';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  LOGIN_RESPONSE: 1000,      // Login should respond within 1 second
  PAGE_LOAD: 2000,           // Page should load within 2 seconds
  FIRST_CONTENTFUL_PAINT: 1500,  // FCP should be under 1.5 seconds
  LARGEST_CONTENTFUL_PAINT: 2500, // LCP should be under 2.5 seconds
  TIME_TO_INTERACTIVE: 3000, // TTI should be under 3 seconds
  CUMULATIVE_LAYOUT_SHIFT: 0.1, // CLS should be under 0.1
};

// Test user credentials
const testUser = {
  email: 'perf-test@demo.com',
  password: 'PerfTest@123'
};

interface PerformanceMetrics {
  loadTime: number;
  domContentLoaded: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  timeToInteractive: number;
  cumulativeLayoutShift: number;
}

async function measurePagePerformance(page: Page): Promise<PerformanceMetrics> {
  const performanceEntries = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paint = performance.getEntriesByType('paint');
    const fcp = paint.find(entry => entry.name === 'first-contentful-paint');

    // Get LCP from PerformanceObserver if available
    let lcp = 0;
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    if (lcpEntries.length > 0) {
      lcp = (lcpEntries[lcpEntries.length - 1] as any).startTime;
    }

    // Get CLS
    let cls = 0;
    const layoutShiftEntries = performance.getEntriesByType('layout-shift');
    for (const entry of layoutShiftEntries) {
      if (!(entry as any).hadRecentInput) {
        cls += (entry as any).value;
      }
    }

    return {
      loadTime: navigation.loadEventEnd - navigation.startTime,
      domContentLoaded: navigation.domContentLoadedEventEnd - navigation.startTime,
      firstContentfulPaint: fcp ? fcp.startTime : 0,
      largestContentfulPaint: lcp,
      timeToInteractive: navigation.domInteractive - navigation.startTime,
      cumulativeLayoutShift: cls
    };
  });

  return performanceEntries;
}

test.describe('Page Load Performance Tests', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();

    // Login before tests
    const auth = new AuthHelper(page);
    await auth.login(testUser.email, testUser.password);
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  test.describe('Login Page Performance', () => {
    test('Login page loads within threshold', async ({ browser }) => {
      const freshContext = await browser.newContext();
      const freshPage = await freshContext.newPage();

      const startTime = Date.now();
      await freshPage.goto('/login');
      await freshPage.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);

      const metrics = await measurePagePerformance(freshPage);
      expect(metrics.firstContentfulPaint).toBeLessThan(THRESHOLDS.FIRST_CONTENTFUL_PAINT);

      await freshContext.close();
    });

    test('Login form submission responds within threshold', async ({ browser }) => {
      const freshContext = await browser.newContext();
      const freshPage = await freshContext.newPage();
      const loginPage = new LoginPage(freshPage);

      await loginPage.navigateTo();

      const startTime = Date.now();
      await loginPage.login(testUser.email, testUser.password);
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(THRESHOLDS.LOGIN_RESPONSE);

      await freshContext.close();
    });

    test('Login with remember me performs similarly', async ({ browser }) => {
      const freshContext = await browser.newContext();
      const freshPage = await freshContext.newPage();
      const loginPage = new LoginPage(freshPage);

      await loginPage.navigateTo();

      const startTime = Date.now();
      await loginPage.login(testUser.email, testUser.password, true);
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(THRESHOLDS.LOGIN_RESPONSE * 1.2); // 20% tolerance

      await freshContext.close();
    });
  });

  test.describe('Dashboard Performance', () => {
    test('Dashboard loads within threshold', async () => {
      const dashboard = new DashboardPage(page);

      const startTime = Date.now();
      await dashboard.navigateTo();
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
    });

    test('Dashboard metrics are displayed quickly', async () => {
      await page.goto('/dashboard');

      // Measure time until stats cards are visible
      const startTime = Date.now();
      await page.waitForSelector('[data-testid="stats-card"]', { state: 'visible' });
      const renderTime = Date.now() - startTime;

      expect(renderTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
    });

    test('Dashboard charts render within acceptable time', async () => {
      await page.goto('/dashboard');

      const startTime = Date.now();
      await page.waitForSelector('[data-testid="chart-container"]', { state: 'visible' });
      const chartRenderTime = Date.now() - startTime;

      expect(chartRenderTime).toBeLessThan(THRESHOLDS.PAGE_LOAD * 1.5); // Charts can take longer
    });

    test('Dashboard has acceptable Core Web Vitals', async () => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      const metrics = await measurePagePerformance(page);

      expect(metrics.firstContentfulPaint).toBeLessThan(THRESHOLDS.FIRST_CONTENTFUL_PAINT);
      expect(metrics.largestContentfulPaint).toBeLessThan(THRESHOLDS.LARGEST_CONTENTFUL_PAINT);
      expect(metrics.cumulativeLayoutShift).toBeLessThan(THRESHOLDS.CUMULATIVE_LAYOUT_SHIFT);
    });
  });

  test.describe('Users Page Performance', () => {
    test('Users list loads within threshold', async () => {
      const usersPage = new UsersPage(page);

      const startTime = Date.now();
      await usersPage.navigateTo();
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
    });

    test('Users table renders with data', async () => {
      await page.goto('/users');

      const startTime = Date.now();
      await page.waitForSelector('table tbody tr', { state: 'visible' });
      const tableRenderTime = Date.now() - startTime;

      expect(tableRenderTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
    });

    test('User search performs within threshold', async () => {
      const usersPage = new UsersPage(page);
      await usersPage.navigateTo();

      const startTime = Date.now();
      await usersPage.search('test');
      await page.waitForLoadState('networkidle');
      const searchTime = Date.now() - startTime;

      expect(searchTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
    });

    test('User pagination performs within threshold', async () => {
      await page.goto('/users');
      await page.waitForSelector('[data-testid="pagination"]');

      const startTime = Date.now();
      await page.click('[data-testid="pagination-next"]');
      await page.waitForLoadState('networkidle');
      const paginationTime = Date.now() - startTime;

      expect(paginationTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
    });
  });

  test.describe('Positions Page Performance', () => {
    test('Positions list loads within threshold', async () => {
      const positionsPage = new PositionsPage(page);

      const startTime = Date.now();
      await positionsPage.navigateTo();
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
    });

    test('Positions table renders with real-time data', async () => {
      await page.goto('/positions');

      const startTime = Date.now();
      await page.waitForSelector('[data-testid="positions-table"]', { state: 'visible' });
      const tableRenderTime = Date.now() - startTime;

      expect(tableRenderTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
    });

    test('Position filtering performs within threshold', async () => {
      const positionsPage = new PositionsPage(page);
      await positionsPage.navigateTo();

      const startTime = Date.now();
      await positionsPage.filterBySymbol('EURUSD');
      await page.waitForLoadState('networkidle');
      const filterTime = Date.now() - startTime;

      expect(filterTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
    });

    test('Position refresh performs within threshold', async () => {
      const positionsPage = new PositionsPage(page);
      await positionsPage.navigateTo();

      const startTime = Date.now();
      await positionsPage.refresh();
      await page.waitForLoadState('networkidle');
      const refreshTime = Date.now() - startTime;

      expect(refreshTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
    });
  });

  test.describe('MT Servers Page Performance', () => {
    test('MT servers list loads within threshold', async () => {
      const serversPage = new MtServersPage(page);

      const startTime = Date.now();
      await serversPage.navigateTo();
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
    });

    test('Server status indicators load quickly', async () => {
      await page.goto('/mt-servers');

      const startTime = Date.now();
      await page.waitForSelector('[data-testid="server-status"]', { state: 'visible' });
      const statusRenderTime = Date.now() - startTime;

      expect(statusRenderTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
    });
  });

  test.describe('Navigation Performance', () => {
    test('Navigation between pages is smooth', async () => {
      const pages = ['/dashboard', '/users', '/positions', '/mt-servers'];
      const navigationTimes: number[] = [];

      for (const pagePath of pages) {
        const startTime = Date.now();
        await page.goto(pagePath);
        await page.waitForLoadState('networkidle');
        navigationTimes.push(Date.now() - startTime);
      }

      // All navigations should be within threshold
      for (const time of navigationTimes) {
        expect(time).toBeLessThan(THRESHOLDS.PAGE_LOAD);
      }

      // Average should be reasonable
      const avgTime = navigationTimes.reduce((a, b) => a + b, 0) / navigationTimes.length;
      expect(avgTime).toBeLessThan(THRESHOLDS.PAGE_LOAD * 0.8); // 80% of threshold
    });

    test('Back/forward navigation is fast', async () => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Test back navigation
      const backStartTime = Date.now();
      await page.goBack();
      await page.waitForLoadState('networkidle');
      const backTime = Date.now() - backStartTime;

      // Test forward navigation
      const forwardStartTime = Date.now();
      await page.goForward();
      await page.waitForLoadState('networkidle');
      const forwardTime = Date.now() - forwardStartTime;

      // Back/forward should be faster due to caching
      expect(backTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
      expect(forwardTime).toBeLessThan(THRESHOLDS.PAGE_LOAD);
    });
  });

  test.describe('Resource Loading Performance', () => {
    test('JavaScript bundles load efficiently', async () => {
      await page.goto('/dashboard');

      const jsResources = await page.evaluate(() => {
        return performance.getEntriesByType('resource')
          .filter((entry: any) => entry.initiatorType === 'script')
          .map((entry: any) => ({
            name: entry.name,
            duration: entry.duration,
            size: entry.transferSize
          }));
      });

      // Check bundle loading times
      for (const resource of jsResources) {
        expect(resource.duration).toBeLessThan(1000); // Each bundle under 1 second
      }
    });

    test('CSS stylesheets load efficiently', async () => {
      await page.goto('/dashboard');

      const cssResources = await page.evaluate(() => {
        return performance.getEntriesByType('resource')
          .filter((entry: any) => entry.initiatorType === 'link' || entry.name.endsWith('.css'))
          .map((entry: any) => ({
            name: entry.name,
            duration: entry.duration
          }));
      });

      for (const resource of cssResources) {
        expect(resource.duration).toBeLessThan(500); // CSS should load very fast
      }
    });

    test('Images load with lazy loading', async () => {
      await page.goto('/dashboard');

      const imageLoadTimes = await page.evaluate(() => {
        return performance.getEntriesByType('resource')
          .filter((entry: any) => entry.initiatorType === 'img')
          .map((entry: any) => entry.duration);
      });

      // Images should not block initial render
      if (imageLoadTimes.length > 0) {
        const maxImageLoadTime = Math.max(...imageLoadTimes);
        expect(maxImageLoadTime).toBeLessThan(THRESHOLDS.PAGE_LOAD * 2);
      }
    });
  });

  test.describe('Memory Performance', () => {
    test('Page does not have memory leaks on navigation', async () => {
      const initialMemory = await page.evaluate(() => {
        if ((performance as any).memory) {
          return (performance as any).memory.usedJSHeapSize;
        }
        return 0;
      });

      // Navigate back and forth multiple times
      for (let i = 0; i < 5; i++) {
        await page.goto('/dashboard');
        await page.goto('/users');
        await page.goto('/positions');
      }

      const finalMemory = await page.evaluate(() => {
        if ((performance as any).memory) {
          return (performance as any).memory.usedJSHeapSize;
        }
        return 0;
      });

      // Memory should not grow significantly (less than 50% increase)
      if (initialMemory > 0) {
        expect(finalMemory).toBeLessThan(initialMemory * 1.5);
      }
    });
  });

  test.describe('Concurrent Users Simulation', () => {
    test('Page performs well under simulated load', async ({ browser }) => {
      const contexts = await Promise.all(
        Array.from({ length: 5 }, () => browser.newContext())
      );

      const pages = await Promise.all(
        contexts.map(ctx => ctx.newPage())
      );

      // Login all users
      await Promise.all(
        pages.map(async (p) => {
          const auth = new AuthHelper(p);
          await auth.login(testUser.email, testUser.password);
        })
      );

      // Measure concurrent page loads
      const startTime = Date.now();
      await Promise.all(
        pages.map(p => p.goto('/dashboard').then(() => p.waitForLoadState('networkidle')))
      );
      const totalTime = Date.now() - startTime;

      // Concurrent loads should still be reasonable
      expect(totalTime).toBeLessThan(THRESHOLDS.PAGE_LOAD * 3);

      // Cleanup
      await Promise.all(contexts.map(ctx => ctx.close()));
    });
  });
});
