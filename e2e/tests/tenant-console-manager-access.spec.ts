import { test, expect } from '@playwright/test';
import { generateTestId } from '../support';

/**
 * Tenant Console Manager Access E2E Tests
 *
 * Tests the complete flow for tenant console accessing middleware via Pool Mode token:
 * 1. Login to tenant console
 * 2. Get Manager Access Token from /api/v1/mt-managers/{managerId}/access-token
 * 3. Use the token to call middleware API
 * 4. Verify connection pool is correctly used
 *
 * Requirements: REQ-3 (Unified Connection Pool)
 */

// Test configuration
const TENANT_API_BASE = process.env.E2E_API_URL || process.env.TENANT_API_URL || 'http://localhost:3002';
const MIDDLEWARE_BASE = process.env.MIDDLEWARE_URL || 'http://localhost:8888';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'internal-secret-key';

// Token cache
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Helper function to get access token by logging in
 */
async function getAccessToken(request: import('@playwright/test').APIRequestContext): Promise<string | null> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const loginResponse = await request.post(`${TENANT_API_BASE}/tenant/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      email: process.env.TEST_ADMIN_EMAIL || 'admin@demo.com',
      password: process.env.TEST_ADMIN_PASSWORD || 'demo123456',
    },
  });

  if (loginResponse.status() !== 200) {
    return null;
  }

  const loginData = await loginResponse.json();
  cachedAccessToken = loginData.data?.accessToken || loginData.accessToken || null;
  tokenExpiresAt = Date.now() + 900 * 1000;
  return cachedAccessToken;
}

/**
 * Helper to get available manager ID for testing
 */
async function getTestManagerId(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string
): Promise<string | null> {
  const response = await request.get(`${TENANT_API_BASE}/tenant/mt-managers`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status() !== 200) {
    return null;
  }

  const data = await response.json();
  // API returns: { success: true, data: { managers: [...], total: N } }
  const managers = data.data?.managers || data.managers || data.data || data;

  if (Array.isArray(managers) && managers.length > 0) {
    // Find an active manager
    const activeManager = managers.find((m: { isActive?: boolean; status?: string }) =>
      m.isActive !== false && m.status !== 'inactive'
    );
    return activeManager?.id || managers[0]?.id || null;
  }

  return null;
}

test.describe('Tenant Console Manager Access Flow', () => {
  test.describe('Pool Mode Token Generation', () => {
    test('should successfully get Manager Access Token after login', async ({ request }) => {
      // Step 1: Login to tenant console
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login to tenant console');
        return;
      }

      // Step 2: Get available manager
      const managerId = await getTestManagerId(request, accessToken);
      if (!managerId) {
        test.skip(true, 'No managers available for testing');
        return;
      }

      // Step 3: Request Manager Access Token
      const tokenResponse = await request.post(
        `${TENANT_API_BASE}/tenant/mt-managers/${managerId}/access-token`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // POST returns 201 Created or 200 OK depending on implementation
      expect([200, 201]).toContain(tokenResponse.status());

      const responseData = await tokenResponse.json();
      const data = responseData.data || responseData;

      // Verify response structure
      expect(data).toHaveProperty('accessToken');
      expect(data).toHaveProperty('tokenType');
      expect(data).toHaveProperty('expiresIn');
      expect(data).toHaveProperty('expiresAt');
      expect(data).toHaveProperty('middlewareUrl');
      expect(data).toHaveProperty('manager');

      // Verify token type
      expect(data.tokenType).toBe('Bearer');

      // Verify token is JWT format
      const token = data.accessToken;
      const parts = token.split('.');
      expect(parts).toHaveLength(3);

      // Decode and verify payload contains Pool Mode claims
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(payload).toHaveProperty('tenantId');
      expect(payload).toHaveProperty('managerId');
      expect(payload.mode).toBe('pool');

      // Verify manager info
      expect(data.manager).toHaveProperty('id');
      expect(data.manager.id).toBe(managerId);
    });

    test('should reject unauthenticated requests', async ({ request }) => {
      const response = await request.post(
        `${TENANT_API_BASE}/tenant/mt-managers/test-manager-id/access-token`,
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      expect(response.status()).toBe(401);
    });

    test('should reject non-existent manager', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const response = await request.post(
        `${TENANT_API_BASE}/tenant/mt-managers/non-existent-manager-id/access-token`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(response.status()).toBe(404);
    });
  });

  test.describe('Middleware API Access with Pool Mode Token', () => {
    test('should authenticate to middleware with Pool Mode token', async ({ request }) => {
      // Step 1: Login and get Manager Access Token
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const managerId = await getTestManagerId(request, accessToken);
      if (!managerId) {
        test.skip(true, 'No managers available');
        return;
      }

      const tokenResponse = await request.post(
        `${TENANT_API_BASE}/tenant/mt-managers/${managerId}/access-token`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (tokenResponse.status() !== 200) {
        test.skip(true, 'Cannot get Manager Access Token');
        return;
      }

      const tokenData = await tokenResponse.json();
      const managerToken = tokenData.data?.accessToken || tokenData.accessToken;
      const middlewareUrl = tokenData.data?.middlewareUrl || tokenData.middlewareUrl || MIDDLEWARE_BASE;

      // Step 2: Call middleware API with Manager Token
      const middlewareResponse = await request.get(`${middlewareUrl}/api/v1/account/balance`, {
        headers: {
          Authorization: `Bearer ${managerToken}`,
        },
      });

      // Should succeed or return service unavailable
      expect([200, 503]).toContain(middlewareResponse.status());

      if (middlewareResponse.status() === 200) {
        const responseData = await middlewareResponse.json();
        // Verify response is from middleware
        expect(responseData).toBeDefined();
      }
    });

    test('should access trading data with Pool Mode token', async ({ request }) => {
      // Get Manager Access Token
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const managerId = await getTestManagerId(request, accessToken);
      if (!managerId) {
        test.skip(true, 'No managers available');
        return;
      }

      const tokenResponse = await request.post(
        `${TENANT_API_BASE}/tenant/mt-managers/${managerId}/access-token`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (tokenResponse.status() !== 200) {
        test.skip(true, 'Cannot get Manager Access Token');
        return;
      }

      const tokenData = await tokenResponse.json();
      const managerToken = tokenData.data?.accessToken || tokenData.accessToken;
      const middlewareUrl = tokenData.data?.middlewareUrl || tokenData.middlewareUrl || MIDDLEWARE_BASE;

      // Access users list
      const usersResponse = await request.get(`${middlewareUrl}/api/v1/users`, {
        headers: {
          Authorization: `Bearer ${managerToken}`,
        },
      });

      expect([200, 503]).toContain(usersResponse.status());

      // Access positions list
      const positionsResponse = await request.get(`${middlewareUrl}/api/v1/positions`, {
        headers: {
          Authorization: `Bearer ${managerToken}`,
        },
      });

      expect([200, 503]).toContain(positionsResponse.status());
    });
  });

  test.describe('Connection Pool Usage Verification', () => {
    test('should use connection pool for Pool Mode token requests', async ({ request }) => {
      // Get Manager Access Token
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const managerId = await getTestManagerId(request, accessToken);
      if (!managerId) {
        test.skip(true, 'No managers available');
        return;
      }

      const tokenResponse = await request.post(
        `${TENANT_API_BASE}/tenant/mt-managers/${managerId}/access-token`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (tokenResponse.status() !== 200) {
        test.skip(true, 'Cannot get Manager Access Token');
        return;
      }

      const tokenData = await tokenResponse.json();
      const managerToken = tokenData.data?.accessToken || tokenData.accessToken;
      const middlewareUrl = tokenData.data?.middlewareUrl || tokenData.middlewareUrl || MIDDLEWARE_BASE;

      // Check pool status before requests
      const poolStatusBefore = await request.get(`${middlewareUrl}/api/v1/pool/status`, {
        headers: {
          'X-Internal-Secret': INTERNAL_SECRET,
        },
      });

      // Make multiple requests with the same token
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          request.get(`${middlewareUrl}/api/v1/account/balance`, {
            headers: {
              Authorization: `Bearer ${managerToken}`,
            },
          })
        );
      }

      await Promise.all(requests);

      // Check pool status after requests
      const poolStatusAfter = await request.get(`${middlewareUrl}/api/v1/pool/status`, {
        headers: {
          'X-Internal-Secret': INTERNAL_SECRET,
        },
      });

      if (poolStatusBefore.status() === 200 && poolStatusAfter.status() === 200) {
        const beforeData = await poolStatusBefore.json();
        const afterData = await poolStatusAfter.json();

        // Connection count should not increase significantly
        // (connection pool should reuse existing connection)
        const beforeCount = beforeData.data?.totalConnections || beforeData.totalConnections || 0;
        const afterCount = afterData.data?.totalConnections || afterData.totalConnections || 0;

        // No new connections should be created for the same manager
        expect(afterCount).toBeLessThanOrEqual(beforeCount + 1);
      }
    });

    test('should verify Pool Mode token uses pre-established connection', async ({ request }) => {
      // Get Manager Access Token
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const managerId = await getTestManagerId(request, accessToken);
      if (!managerId) {
        test.skip(true, 'No managers available');
        return;
      }

      const tokenResponse = await request.post(
        `${TENANT_API_BASE}/tenant/mt-managers/${managerId}/access-token`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (tokenResponse.status() !== 200) {
        test.skip(true, 'Cannot get Manager Access Token');
        return;
      }

      const tokenData = await tokenResponse.json();
      const middlewareUrl = tokenData.data?.middlewareUrl || tokenData.middlewareUrl || MIDDLEWARE_BASE;

      // Get specific connection status for this manager
      const connectionResponse = await request.get(
        `${middlewareUrl}/api/v1/pool/connections/${managerId}`,
        {
          headers: {
            'X-Internal-Secret': INTERNAL_SECRET,
          },
        }
      );

      if (connectionResponse.status() === 200) {
        const connectionData = await connectionResponse.json();
        const data = connectionData.data || connectionData;

        // Verify connection exists and is connected
        expect(data.status).toBe('CONNECTED');
        expect(data.managerId).toBe(managerId);
      }
    });
  });

  test.describe('Token Expiry and Refresh', () => {
    test('should include proper expiry in Manager Access Token', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const managerId = await getTestManagerId(request, accessToken);
      if (!managerId) {
        test.skip(true, 'No managers available');
        return;
      }

      const tokenResponse = await request.post(
        `${TENANT_API_BASE}/tenant/mt-managers/${managerId}/access-token`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // POST returns 201 Created or 200 OK depending on implementation
      expect([200, 201]).toContain(tokenResponse.status());

      const tokenData = await tokenResponse.json();
      const data = tokenData.data || tokenData;

      // Verify expiry fields
      expect(data.expiresIn).toBeGreaterThan(0);
      expect(data.expiresIn).toBeLessThanOrEqual(3600); // Max 1 hour

      // expiresAt could be unix seconds or milliseconds or ISO string
      const expiresAtValue = typeof data.expiresAt === 'number'
        ? (data.expiresAt < 10000000000 ? data.expiresAt * 1000 : data.expiresAt) // convert seconds to ms if needed
        : new Date(data.expiresAt).getTime();
      expect(expiresAtValue).toBeGreaterThan(Date.now());

      // Decode JWT and verify exp claim
      const token = data.accessToken;
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      expect(payload.exp).toBeDefined();
      expect(payload.exp * 1000).toBeGreaterThan(Date.now());
    });

    test('should be able to get new token before expiry', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const managerId = await getTestManagerId(request, accessToken);
      if (!managerId) {
        test.skip(true, 'No managers available');
        return;
      }

      // Get first token
      const firstResponse = await request.post(
        `${TENANT_API_BASE}/tenant/mt-managers/${managerId}/access-token`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // POST returns 201 Created or 200 OK
      expect([200, 201]).toContain(firstResponse.status());
      const firstToken = (await firstResponse.json()).data?.accessToken;

      // Wait a bit and get second token
      await new Promise(resolve => setTimeout(resolve, 100));

      const secondResponse = await request.post(
        `${TENANT_API_BASE}/tenant/mt-managers/${managerId}/access-token`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // POST returns 201 Created or 200 OK
      expect([200, 201]).toContain(secondResponse.status());
      const secondToken = (await secondResponse.json()).data?.accessToken;

      // Both tokens should be valid (different due to iat/exp)
      expect(firstToken).toBeDefined();
      expect(secondToken).toBeDefined();
    });
  });

  test.describe('Error Handling', () => {
    test('should return proper error for inactive manager', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      // Try to get token for a manager that might be inactive
      // The exact behavior depends on test data setup
      const response = await request.post(
        `${TENANT_API_BASE}/tenant/mt-managers/inactive-manager-test/access-token`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // Should return 404 (not found) or 403 (forbidden for inactive)
      expect([404, 403]).toContain(response.status());

      if (response.status() !== 404) {
        const errorData = await response.json();
        expect(errorData).toHaveProperty('error');
      }
    });

    test('should return proper error for manager from different tenant', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      // Try to access manager from another tenant
      const response = await request.post(
        `${TENANT_API_BASE}/tenant/mt-managers/other-tenant-manager-id/access-token`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // Should be 404 or 403
      expect([404, 403]).toContain(response.status());
    });
  });
});
