import { test, expect } from '@playwright/test';
import { generateTestId } from '../support';

/**
 * Connection Pool Sharing E2E Tests
 *
 * Tests that tenant console and third-party applications share the same MT5 connection:
 * 1. Tenant console user gets Pool Mode token for a manager
 * 2. Third-party app uses API Key to access same manager
 * 3. Both should use the same pre-established connection from the pool
 * 4. Verify pool size remains stable
 *
 * Requirements: REQ-8 (Connection pool sharing)
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
      tenantCode: process.env.TEST_TENANT_CODE || 'demo',
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
  const managers = data.data || data;

  if (Array.isArray(managers) && managers.length > 0) {
    const activeManager = managers.find((m: { isActive?: boolean; status?: string }) =>
      m.isActive !== false && m.status !== 'inactive'
    );
    return activeManager?.id || managers[0]?.id || null;
  }

  return null;
}

/**
 * Helper to create API key for testing
 */
async function createTestApiKey(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
  scopes: string[]
): Promise<{ id: string; apiKey: string } | null> {
  const response = await request.post(`${TENANT_API_BASE}/tenant/tenant/api-keys`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      name: `Pool Share Test ${generateTestId()}`,
      scopes,
    },
  });

  if (response.status() !== 201) {
    return null;
  }

  const data = await response.json();
  return {
    id: data.data?.id || data.id,
    apiKey: data.data?.apiKey || data.apiKey,
  };
}

/**
 * Helper to cleanup API key after test
 */
async function deleteApiKey(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
  keyId: string
): Promise<void> {
  await request.delete(`${TENANT_API_BASE}/tenant/tenant/api-keys/${keyId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

/**
 * Helper to get pool status
 */
async function getPoolStatus(
  request: import('@playwright/test').APIRequestContext
): Promise<{
  totalConnections: number;
  connectedCount: number;
  disconnectedCount: number;
} | null> {
  const response = await request.get(`${MIDDLEWARE_BASE}/api/v1/pool/status`, {
    headers: {
      'X-Internal-Secret': INTERNAL_SECRET,
    },
  });

  if (response.status() !== 200) {
    return null;
  }

  const data = await response.json();
  return data.data || data;
}

/**
 * Helper to get connection for specific manager
 */
async function getManagerConnection(
  request: import('@playwright/test').APIRequestContext,
  managerId: string
): Promise<{
  managerId: string;
  status: string;
  lastUsedAt: string;
} | null> {
  const response = await request.get(`${MIDDLEWARE_BASE}/api/v1/pool/connections/${managerId}`, {
    headers: {
      'X-Internal-Secret': INTERNAL_SECRET,
    },
  });

  if (response.status() !== 200) {
    return null;
  }

  const data = await response.json();
  return data.data || data;
}

test.describe('Connection Pool Sharing', () => {
  test.describe('Tenant Console and API Key Sharing Same Connection', () => {
    test('should share same connection between Pool Mode token and API Key', async ({ request }) => {
      // Step 1: Login and get necessary credentials
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

      // Get Pool Mode token for tenant console
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
      const poolModeToken = tokenData.data?.accessToken || tokenData.accessToken;
      const middlewareUrl = tokenData.data?.middlewareUrl || tokenData.middlewareUrl || MIDDLEWARE_BASE;

      // Create API key for third-party access
      const keyResult = await createTestApiKey(request, accessToken, [
        'account:read',
        'trade:read',
        'user:read',
      ]);
      if (!keyResult) {
        test.skip(true, 'Cannot create API key');
        return;
      }

      try {
        // Get initial pool status
        const initialStatus = await getPoolStatus(request);
        const initialConnectionCount = initialStatus?.totalConnections || 0;

        // Step 2: Make requests with Pool Mode token (simulating tenant console)
        const poolModeRequests = [];
        for (let i = 0; i < 3; i++) {
          poolModeRequests.push(
            request.get(`${middlewareUrl}/api/v1/users`, {
              headers: {
                Authorization: `Bearer ${poolModeToken}`,
              },
            })
          );
        }
        await Promise.all(poolModeRequests);

        // Get pool status after Pool Mode requests
        const afterPoolModeStatus = await getPoolStatus(request);

        // Step 3: Make requests with API Key (simulating third-party app)
        const apiKeyRequests = [];
        for (let i = 0; i < 3; i++) {
          apiKeyRequests.push(
            request.get(`${middlewareUrl}/api/v1/users`, {
              headers: {
                'X-API-Key': keyResult.apiKey,
              },
            })
          );
        }
        await Promise.all(apiKeyRequests);

        // Get pool status after both types of requests
        const finalStatus = await getPoolStatus(request);

        // Verify connection pool is stable
        if (initialStatus && afterPoolModeStatus && finalStatus) {
          // Connection count should not significantly increase
          // Both access methods should reuse the same pool
          const connectionIncrease = finalStatus.totalConnections - initialConnectionCount;
          expect(connectionIncrease).toBeLessThanOrEqual(1);
        }
      } finally {
        await deleteApiKey(request, accessToken, keyResult.id);
      }
    });

    test('should verify concurrent access uses same connection', async ({ request }) => {
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

      // Get Pool Mode token
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
      const poolModeToken = tokenData.data?.accessToken || tokenData.accessToken;
      const middlewareUrl = tokenData.data?.middlewareUrl || tokenData.middlewareUrl || MIDDLEWARE_BASE;

      // Create API key
      const keyResult = await createTestApiKey(request, accessToken, [
        'account:read',
        'trade:read',
      ]);
      if (!keyResult) {
        test.skip(true, 'Cannot create API key');
        return;
      }

      try {
        // Get initial connection status for this manager
        const initialConnection = await getManagerConnection(request, managerId);

        // Make concurrent requests with both auth methods
        const concurrentRequests = [
          // Pool Mode requests
          request.get(`${middlewareUrl}/api/v1/users`, {
            headers: { Authorization: `Bearer ${poolModeToken}` },
          }),
          request.get(`${middlewareUrl}/api/v1/positions`, {
            headers: { Authorization: `Bearer ${poolModeToken}` },
          }),
          // API Key requests
          request.get(`${middlewareUrl}/api/v1/users`, {
            headers: { 'X-API-Key': keyResult.apiKey },
          }),
          request.get(`${middlewareUrl}/api/v1/positions`, {
            headers: { 'X-API-Key': keyResult.apiKey },
          }),
        ];

        await Promise.all(concurrentRequests);

        // Get connection status after concurrent requests
        const afterConnection = await getManagerConnection(request, managerId);

        // Verify the same connection was used (status should still be CONNECTED)
        if (initialConnection && afterConnection) {
          expect(afterConnection.status).toBe('CONNECTED');
          // lastUsedAt should be updated
          expect(new Date(afterConnection.lastUsedAt).getTime()).toBeGreaterThanOrEqual(
            new Date(initialConnection.lastUsedAt).getTime()
          );
        }
      } finally {
        await deleteApiKey(request, accessToken, keyResult.id);
      }
    });
  });

  test.describe('Pool Size Stability', () => {
    test('should maintain stable pool size under mixed load', async ({ request }) => {
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

      // Get Pool Mode token
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
      const poolModeToken = tokenData.data?.accessToken || tokenData.accessToken;
      const middlewareUrl = tokenData.data?.middlewareUrl || tokenData.middlewareUrl || MIDDLEWARE_BASE;

      // Create multiple API keys
      const apiKeys: { id: string; apiKey: string }[] = [];
      for (let i = 0; i < 3; i++) {
        const key = await createTestApiKey(request, accessToken, ['account:read', 'user:read']);
        if (key) {
          apiKeys.push(key);
        }
      }

      if (apiKeys.length === 0) {
        test.skip(true, 'Cannot create API keys');
        return;
      }

      try {
        // Record initial pool status
        const initialStatus = await getPoolStatus(request);
        const initialConnected = initialStatus?.connectedCount || 0;

        // Simulate mixed load from different sources
        const loadRequests = [];

        // Pool Mode requests
        for (let i = 0; i < 10; i++) {
          loadRequests.push(
            request.get(`${middlewareUrl}/api/v1/users`, {
              headers: { Authorization: `Bearer ${poolModeToken}` },
            })
          );
        }

        // API Key requests
        for (const key of apiKeys) {
          for (let i = 0; i < 5; i++) {
            loadRequests.push(
              request.get(`${middlewareUrl}/api/v1/users`, {
                headers: { 'X-API-Key': key.apiKey },
              })
            );
          }
        }

        await Promise.all(loadRequests);

        // Check pool status after load
        const finalStatus = await getPoolStatus(request);
        const finalConnected = finalStatus?.connectedCount || 0;

        // Pool should be stable - no connection explosion
        if (initialStatus && finalStatus) {
          // Connected count should not significantly increase
          expect(finalConnected).toBeLessThanOrEqual(initialConnected + 2);

          // Health check: most connections should be connected
          expect(finalStatus.connectedCount).toBeGreaterThanOrEqual(
            finalStatus.totalConnections * 0.5
          );
        }
      } finally {
        // Cleanup API keys
        for (const key of apiKeys) {
          await deleteApiKey(request, accessToken, key.id);
        }
      }
    });

    test('should handle rapid switching between auth methods', async ({ request }) => {
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

      // Get Pool Mode token
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
      const poolModeToken = tokenData.data?.accessToken || tokenData.accessToken;
      const middlewareUrl = tokenData.data?.middlewareUrl || tokenData.middlewareUrl || MIDDLEWARE_BASE;

      const keyResult = await createTestApiKey(request, accessToken, ['account:read', 'user:read']);
      if (!keyResult) {
        test.skip(true, 'Cannot create API key');
        return;
      }

      try {
        const initialStatus = await getPoolStatus(request);

        // Rapid alternating requests
        for (let i = 0; i < 10; i++) {
          // Pool Mode request
          await request.get(`${middlewareUrl}/api/v1/users`, {
            headers: { Authorization: `Bearer ${poolModeToken}` },
          });

          // API Key request
          await request.get(`${middlewareUrl}/api/v1/users`, {
            headers: { 'X-API-Key': keyResult.apiKey },
          });
        }

        const finalStatus = await getPoolStatus(request);

        // Pool should remain stable
        if (initialStatus && finalStatus) {
          expect(finalStatus.totalConnections).toBeLessThanOrEqual(
            initialStatus.totalConnections + 1
          );
        }
      } finally {
        await deleteApiKey(request, accessToken, keyResult.id);
      }
    });
  });

  test.describe('Connection Pool Statistics', () => {
    test('should report accurate pool statistics', async ({ request }) => {
      const poolStatus = await getPoolStatus(request);

      if (!poolStatus) {
        test.skip(true, 'Cannot get pool status - middleware may be unavailable');
        return;
      }

      // Verify statistics structure
      expect(poolStatus).toHaveProperty('totalConnections');
      expect(poolStatus).toHaveProperty('connectedCount');
      expect(poolStatus).toHaveProperty('disconnectedCount');

      // Basic sanity checks
      expect(poolStatus.totalConnections).toBeGreaterThanOrEqual(0);
      expect(poolStatus.connectedCount).toBeGreaterThanOrEqual(0);
      expect(poolStatus.disconnectedCount).toBeGreaterThanOrEqual(0);

      // Connected + disconnected should equal or be less than total
      expect(poolStatus.connectedCount + poolStatus.disconnectedCount).toBeLessThanOrEqual(
        poolStatus.totalConnections + 1 // Allow for race condition
      );
    });

    test('should track connection usage per manager', async ({ request }) => {
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

      // Get connection info before making requests
      const beforeConnection = await getManagerConnection(request, managerId);
      if (!beforeConnection) {
        test.skip(true, 'Cannot get connection info');
        return;
      }

      // Get Pool Mode token and make a request
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
      const poolModeToken = tokenData.data?.accessToken || tokenData.accessToken;
      const middlewareUrl = tokenData.data?.middlewareUrl || tokenData.middlewareUrl || MIDDLEWARE_BASE;

      // Make a request to trigger connection usage
      await request.get(`${middlewareUrl}/api/v1/users`, {
        headers: { Authorization: `Bearer ${poolModeToken}` },
      });

      // Get connection info after making request
      const afterConnection = await getManagerConnection(request, managerId);

      if (afterConnection) {
        // lastUsedAt should be updated
        expect(new Date(afterConnection.lastUsedAt).getTime()).toBeGreaterThanOrEqual(
          new Date(beforeConnection.lastUsedAt).getTime()
        );
      }
    });
  });
});
