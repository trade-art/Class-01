/**
 * API Response Time Tests
 *
 * Task 18: 验证 API 响应性能
 * - 用户列表 API < 1秒
 * - 持仓列表 API < 1秒
 * - 搜索 API < 500ms
 * - 大数据量分页 < 2秒
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { generateTestId } from '../../support/test-utils';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  LIST_API: 1000,           // List APIs should respond within 1 second
  SEARCH_API: 500,          // Search should be under 500ms
  LARGE_DATASET: 2000,      // Large datasets under 2 seconds
  SIMPLE_GET: 300,          // Simple GET requests under 300ms
  CREATE_API: 1000,         // Create operations under 1 second
  UPDATE_API: 500,          // Update operations under 500ms
  DELETE_API: 500,          // Delete operations under 500ms
};

// Test credentials
const testCredentials = {
  email: 'perf-test@demo.com',
  password: 'PerfTest@123'
};

interface ApiTimingResult {
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  dataSize?: number;
}

test.describe('API Response Time Tests', () => {
  let request: APIRequestContext;
  let authToken: string;

  test.beforeAll(async ({ playwright }) => {
    // Create API request context
    request = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
      extraHTTPHeaders: {
        'Content-Type': 'application/json'
      }
    });

    // Get auth token
    const loginResponse = await request.post('/api/auth/login', {
      data: {
        email: testCredentials.email,
        password: testCredentials.password
      }
    });

    const loginData = await loginResponse.json();
    authToken = loginData.accessToken || loginData.token;

    // Update request context with auth
    request = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });
  });

  test.afterAll(async () => {
    await request?.dispose();
  });

  async function measureApiCall(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    data?: any
  ): Promise<ApiTimingResult> {
    const startTime = Date.now();

    let response;
    switch (method) {
      case 'GET':
        response = await request.get(endpoint);
        break;
      case 'POST':
        response = await request.post(endpoint, { data });
        break;
      case 'PUT':
        response = await request.put(endpoint, { data });
        break;
      case 'PATCH':
        response = await request.patch(endpoint, { data });
        break;
      case 'DELETE':
        response = await request.delete(endpoint);
        break;
    }

    const responseTime = Date.now() - startTime;
    const responseData = await response.text();

    return {
      endpoint,
      method,
      responseTime,
      statusCode: response.status(),
      dataSize: responseData.length
    };
  }

  test.describe('Authentication API Performance', () => {
    test('Login API responds within threshold', async ({ playwright }) => {
      const freshRequest = await playwright.request.newContext({
        baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
        extraHTTPHeaders: { 'Content-Type': 'application/json' }
      });

      const result = await measureApiCall('POST', '/api/auth/login', {
        email: testCredentials.email,
        password: testCredentials.password
      });

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LIST_API);
      expect(result.statusCode).toBe(200);

      await freshRequest.dispose();
    });

    test('Token refresh responds within threshold', async () => {
      const result = await measureApiCall('POST', '/api/auth/refresh');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.SIMPLE_GET);
    });

    test('User profile API responds quickly', async () => {
      const result = await measureApiCall('GET', '/api/auth/me');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.SIMPLE_GET);
      expect(result.statusCode).toBe(200);
    });
  });

  test.describe('Users API Performance', () => {
    test('Users list API responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/users');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LIST_API);
      expect(result.statusCode).toBe(200);
    });

    test('Users list with pagination responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/users?page=1&pageSize=20');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LIST_API);
    });

    test('Users search API responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/users?search=test');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.SEARCH_API);
    });

    test('Users filter by role responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/users?role=admin');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LIST_API);
    });

    test('Single user fetch responds quickly', async () => {
      // First get a user ID
      const listResponse = await request.get('/api/users?pageSize=1');
      const users = await listResponse.json();

      if (users.data?.[0]?.id) {
        const result = await measureApiCall('GET', `/api/users/${users.data[0].id}`);

        expect(result.responseTime).toBeLessThan(THRESHOLDS.SIMPLE_GET);
      }
    });

    test('User creation responds within threshold', async () => {
      const result = await measureApiCall('POST', '/api/users', {
        email: `perf-test-${generateTestId()}@test.com`,
        name: 'Performance Test User',
        role: 'user'
      });

      expect(result.responseTime).toBeLessThan(THRESHOLDS.CREATE_API);
    });

    test('Large user list with pagination responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/users?page=1&pageSize=100');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LARGE_DATASET);
    });
  });

  test.describe('Positions API Performance', () => {
    test('Positions list API responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/positions');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LIST_API);
      expect(result.statusCode).toBe(200);
    });

    test('Positions with real-time data responds quickly', async () => {
      const result = await measureApiCall('GET', '/api/positions?realtime=true');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LIST_API);
    });

    test('Positions filter by symbol responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/positions?symbol=EURUSD');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.SEARCH_API);
    });

    test('Positions filter by type responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/positions?type=BUY');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.SEARCH_API);
    });

    test('Position summary API responds quickly', async () => {
      const result = await measureApiCall('GET', '/api/positions/summary');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.SIMPLE_GET);
    });

    test('Large positions dataset responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/positions?pageSize=500');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LARGE_DATASET);
    });
  });

  test.describe('Orders API Performance', () => {
    test('Orders list API responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/orders');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LIST_API);
    });

    test('Pending orders API responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/orders?status=pending');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LIST_API);
    });

    test('Order history with date range responds within threshold', async () => {
      const fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - 1);

      const result = await measureApiCall(
        'GET',
        `/api/orders/history?from=${fromDate.toISOString()}&to=${new Date().toISOString()}`
      );

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LARGE_DATASET);
    });

    test('Order search responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/orders?search=12345');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.SEARCH_API);
    });
  });

  test.describe('MT Servers API Performance', () => {
    test('MT servers list API responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/mt-servers');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LIST_API);
    });

    test('MT server status check responds quickly', async () => {
      // Get a server ID first
      const listResponse = await request.get('/api/mt-servers');
      const servers = await listResponse.json();

      if (servers.data?.[0]?.id) {
        const result = await measureApiCall('GET', `/api/mt-servers/${servers.data[0].id}/status`);

        expect(result.responseTime).toBeLessThan(THRESHOLDS.SIMPLE_GET);
      }
    });

    test('MT server connection test responds within timeout', async () => {
      const listResponse = await request.get('/api/mt-servers');
      const servers = await listResponse.json();

      if (servers.data?.[0]?.id) {
        const result = await measureApiCall(
          'POST',
          `/api/mt-servers/${servers.data[0].id}/test-connection`
        );

        // Connection test can take longer
        expect(result.responseTime).toBeLessThan(5000);
      }
    });
  });

  test.describe('Dashboard API Performance', () => {
    test('Dashboard stats API responds quickly', async () => {
      const result = await measureApiCall('GET', '/api/dashboard/stats');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.SIMPLE_GET);
    });

    test('Dashboard charts data responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/dashboard/charts');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LIST_API);
    });

    test('Dashboard recent activity responds quickly', async () => {
      const result = await measureApiCall('GET', '/api/dashboard/activity?limit=10');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.SIMPLE_GET);
    });
  });

  test.describe('Export API Performance', () => {
    test('User export CSV responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/users/export?format=csv');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LARGE_DATASET);
    });

    test('Positions export responds within threshold', async () => {
      const result = await measureApiCall('GET', '/api/positions/export?format=csv');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LARGE_DATASET);
    });

    test('Large export with filters responds within extended threshold', async () => {
      const result = await measureApiCall('GET', '/api/orders/export?format=excel&pageSize=1000');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.LARGE_DATASET * 2);
    });
  });

  test.describe('Concurrent API Requests', () => {
    test('Multiple concurrent GET requests perform well', async () => {
      const endpoints = [
        '/api/users',
        '/api/positions',
        '/api/orders',
        '/api/mt-servers',
        '/api/dashboard/stats'
      ];

      const startTime = Date.now();
      const results = await Promise.all(
        endpoints.map(endpoint => measureApiCall('GET', endpoint))
      );
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      for (const result of results) {
        expect(result.statusCode).toBe(200);
        expect(result.responseTime).toBeLessThan(THRESHOLDS.LIST_API * 2);
      }

      // Total concurrent time should be reasonable
      expect(totalTime).toBeLessThan(THRESHOLDS.LARGE_DATASET);
    });

    test('Rapid sequential requests perform consistently', async () => {
      const times: number[] = [];

      for (let i = 0; i < 10; i++) {
        const result = await measureApiCall('GET', '/api/users?page=' + (i + 1));
        times.push(result.responseTime);
      }

      // Check consistency (no significant degradation)
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);

      expect(avgTime).toBeLessThan(THRESHOLDS.LIST_API);
      expect(maxTime).toBeLessThan(THRESHOLDS.LIST_API * 1.5);
    });

    test('Mixed read/write operations perform well', async () => {
      const operations = [
        () => measureApiCall('GET', '/api/users'),
        () => measureApiCall('GET', '/api/positions'),
        () => measureApiCall('POST', '/api/users', {
          email: `perf-mixed-${generateTestId()}@test.com`,
          name: 'Mixed Test',
          role: 'user'
        }),
        () => measureApiCall('GET', '/api/orders'),
      ];

      const results = await Promise.all(operations.map(op => op()));

      for (const result of results) {
        if (result.method === 'GET') {
          expect(result.responseTime).toBeLessThan(THRESHOLDS.LIST_API);
        } else {
          expect(result.responseTime).toBeLessThan(THRESHOLDS.CREATE_API);
        }
      }
    });
  });

  test.describe('API Response Size Performance', () => {
    test('Large response size does not significantly impact time', async () => {
      const smallResult = await measureApiCall('GET', '/api/users?pageSize=10');
      const largeResult = await measureApiCall('GET', '/api/users?pageSize=100');

      // Large response should not be 10x slower
      expect(largeResult.responseTime).toBeLessThan(smallResult.responseTime * 5);
    });

    test('Pagination maintains consistent response times', async () => {
      const page1 = await measureApiCall('GET', '/api/users?page=1&pageSize=20');
      const page5 = await measureApiCall('GET', '/api/users?page=5&pageSize=20');
      const page10 = await measureApiCall('GET', '/api/users?page=10&pageSize=20');

      // Later pages should not be significantly slower
      expect(page5.responseTime).toBeLessThan(page1.responseTime * 1.5);
      expect(page10.responseTime).toBeLessThan(page1.responseTime * 2);
    });
  });

  test.describe('Error Response Performance', () => {
    test('404 errors respond quickly', async () => {
      const result = await measureApiCall('GET', '/api/users/non-existent-id');

      expect(result.responseTime).toBeLessThan(THRESHOLDS.SIMPLE_GET);
      expect(result.statusCode).toBe(404);
    });

    test('Validation errors respond quickly', async () => {
      const result = await measureApiCall('POST', '/api/users', {
        // Invalid data - missing required fields
        invalid: 'data'
      });

      expect(result.responseTime).toBeLessThan(THRESHOLDS.SIMPLE_GET);
      expect([400, 422]).toContain(result.statusCode);
    });

    test('Unauthorized requests respond quickly', async ({ playwright }) => {
      const unauthRequest = await playwright.request.newContext({
        baseURL: process.env.API_BASE_URL || 'http://localhost:3000'
      });

      const startTime = Date.now();
      const response = await unauthRequest.get('/api/users');
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(THRESHOLDS.SIMPLE_GET);
      expect(response.status()).toBe(401);

      await unauthRequest.dispose();
    });
  });

  test.describe('Performance Benchmarks', () => {
    test('Generate API performance report', async () => {
      const benchmarks: ApiTimingResult[] = [];

      // Collect performance data for all major endpoints
      const endpoints = [
        { method: 'GET' as const, path: '/api/auth/me' },
        { method: 'GET' as const, path: '/api/users' },
        { method: 'GET' as const, path: '/api/users?search=test' },
        { method: 'GET' as const, path: '/api/positions' },
        { method: 'GET' as const, path: '/api/orders' },
        { method: 'GET' as const, path: '/api/mt-servers' },
        { method: 'GET' as const, path: '/api/dashboard/stats' },
      ];

      for (const endpoint of endpoints) {
        const result = await measureApiCall(endpoint.method, endpoint.path);
        benchmarks.push(result);
      }

      // Log performance report
      console.log('\n=== API Performance Report ===\n');
      for (const result of benchmarks) {
        const status = result.responseTime < THRESHOLDS.LIST_API ? '✓' : '✗';
        console.log(
          `${status} ${result.method} ${result.endpoint}: ${result.responseTime}ms (${result.statusCode})`
        );
      }

      // All benchmarks should pass
      for (const result of benchmarks) {
        expect(result.responseTime).toBeLessThan(THRESHOLDS.LIST_API);
      }
    });
  });
});
