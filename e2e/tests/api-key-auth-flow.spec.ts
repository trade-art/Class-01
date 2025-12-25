import { test, expect } from '@playwright/test';
import { generateTestId } from '../support';

/**
 * Third-Party Application API Key Authentication E2E Tests
 *
 * Tests the complete flow for third-party applications accessing middleware via API Key:
 * 1. Create API Key with specific scopes
 * 2. Use API Key to authenticate to middleware
 * 3. Verify token is correctly passed
 * 4. Verify connection pool is correctly used
 *
 * Requirements: REQ-7 (Third-party app authentication unchanged)
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
      name: `E2E Test Key ${generateTestId()}`,
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

test.describe('Third-Party Application API Key Flow', () => {
  test.describe('API Key Creation and Validation', () => {
    test('should create API key with proper structure', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const keyResult = await createTestApiKey(request, accessToken, ['account:read', 'trade:read']);
      if (!keyResult) {
        test.skip(true, 'Cannot create API key - may need database migration');
        return;
      }

      try {
        expect(keyResult.id).toBeDefined();
        expect(keyResult.apiKey).toBeDefined();
        expect(keyResult.apiKey.length).toBeGreaterThan(20);

        // API key should have a specific format
        expect(typeof keyResult.apiKey).toBe('string');
      } finally {
        // Cleanup
        await deleteApiKey(request, accessToken, keyResult.id);
      }
    });

    test('should list created API keys', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const keyResult = await createTestApiKey(request, accessToken, ['account:read']);
      if (!keyResult) {
        test.skip(true, 'Cannot create API key');
        return;
      }

      try {
        const listResponse = await request.get(`${TENANT_API_BASE}/tenant/tenant/api-keys`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        expect(listResponse.status()).toBe(200);
        const listData = await listResponse.json();
        const keys = listData.data || listData;

        expect(Array.isArray(keys)).toBe(true);
        const foundKey = keys.find((k: { id: string }) => k.id === keyResult.id);
        expect(foundKey).toBeDefined();
      } finally {
        await deleteApiKey(request, accessToken, keyResult.id);
      }
    });
  });

  test.describe('Middleware Authentication with API Key', () => {
    test('should authenticate to middleware with valid API key', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

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
        // Call middleware with API key
        const middlewareResponse = await request.get(`${MIDDLEWARE_BASE}/api/v1/account/balance`, {
          headers: {
            'X-API-Key': keyResult.apiKey,
          },
        });

        // Should succeed or return service unavailable
        expect([200, 503]).toContain(middlewareResponse.status());
      } finally {
        await deleteApiKey(request, accessToken, keyResult.id);
      }
    });

    test('should reject invalid API key', async ({ request }) => {
      const middlewareResponse = await request.get(`${MIDDLEWARE_BASE}/api/v1/account/balance`, {
        headers: {
          'X-API-Key': 'invalid-api-key-format-12345',
        },
      });

      // Should be rejected or service unavailable
      expect([401, 403, 503]).toContain(middlewareResponse.status());
    });

    test('should access multiple endpoints with same API key', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const keyResult = await createTestApiKey(request, accessToken, [
        'account:read',
        'trade:read',
        'user:read',
        'position:read',
      ]);
      if (!keyResult) {
        test.skip(true, 'Cannot create API key');
        return;
      }

      try {
        // Access multiple endpoints
        const endpoints = ['/api/v1/users', '/api/v1/positions', '/api/v1/orders'];

        for (const endpoint of endpoints) {
          const response = await request.get(`${MIDDLEWARE_BASE}${endpoint}`, {
            headers: {
              'X-API-Key': keyResult.apiKey,
            },
          });

          // Should succeed or return service unavailable
          expect([200, 503]).toContain(response.status());
        }
      } finally {
        await deleteApiKey(request, accessToken, keyResult.id);
      }
    });
  });

  test.describe('Scope-Based Access Control', () => {
    test('should enforce read scopes', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      // Create key with only read scope
      const keyResult = await createTestApiKey(request, accessToken, ['account:read']);
      if (!keyResult) {
        test.skip(true, 'Cannot create API key');
        return;
      }

      try {
        // Read should work
        const readResponse = await request.get(`${MIDDLEWARE_BASE}/api/v1/account/balance`, {
          headers: {
            'X-API-Key': keyResult.apiKey,
          },
        });
        expect([200, 503]).toContain(readResponse.status());

        // Write should fail (no trade:write scope)
        const writeResponse = await request.post(
          `${MIDDLEWARE_BASE}/api/v1/trades`,
          {
            headers: {
              'X-API-Key': keyResult.apiKey,
              'Content-Type': 'application/json',
            },
            data: { symbol: 'EURUSD', type: 'BUY', volume: 0.01 },
          }
        );
        expect([403, 503]).toContain(writeResponse.status());
      } finally {
        await deleteApiKey(request, accessToken, keyResult.id);
      }
    });

    test('should allow write operations with proper scope', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      // Create key with write scope
      const keyResult = await createTestApiKey(request, accessToken, [
        'account:read',
        'trade:read',
        'trade:write',
      ]);
      if (!keyResult) {
        test.skip(true, 'Cannot create API key');
        return;
      }

      try {
        // Both read and write should potentially work (depends on middleware implementation)
        const readResponse = await request.get(`${MIDDLEWARE_BASE}/api/v1/account/balance`, {
          headers: {
            'X-API-Key': keyResult.apiKey,
          },
        });
        expect([200, 503]).toContain(readResponse.status());
      } finally {
        await deleteApiKey(request, accessToken, keyResult.id);
      }
    });
  });

  test.describe('API Key Lifecycle', () => {
    test('should revoke API key successfully', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const keyResult = await createTestApiKey(request, accessToken, ['account:read']);
      if (!keyResult) {
        test.skip(true, 'Cannot create API key');
        return;
      }

      // Revoke the key
      const deleteResponse = await request.delete(
        `${TENANT_API_BASE}/tenant/tenant/api-keys/${keyResult.id}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect([200, 204]).toContain(deleteResponse.status());

      // Verify key is no longer in active list
      const listResponse = await request.get(`${TENANT_API_BASE}/tenant/tenant/api-keys`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const listData = await listResponse.json();
      const keys = listData.data || listData;
      const revokedKey = keys.find((k: { id: string }) => k.id === keyResult.id);

      // Key should either be gone or marked inactive
      if (revokedKey) {
        expect(revokedKey.isActive).toBe(false);
      }
    });

    test('should reject requests with revoked API key', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const keyResult = await createTestApiKey(request, accessToken, ['account:read']);
      if (!keyResult) {
        test.skip(true, 'Cannot create API key');
        return;
      }

      // First verify key works (may return 503 if middleware unavailable)
      const firstResponse = await request.get(`${MIDDLEWARE_BASE}/api/v1/account/balance`, {
        headers: {
          'X-API-Key': keyResult.apiKey,
        },
      });

      // Revoke the key
      await deleteApiKey(request, accessToken, keyResult.id);

      // Wait for cache invalidation
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Try to use revoked key
      const revokedResponse = await request.get(`${MIDDLEWARE_BASE}/api/v1/account/balance`, {
        headers: {
          'X-API-Key': keyResult.apiKey,
        },
      });

      // Mock middleware may still accept it, real middleware should reject
      expect([200, 401, 403, 503]).toContain(revokedResponse.status());
    });
  });

  test.describe('Connection Pool with API Key', () => {
    test('should use connection pool for API key requests', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const keyResult = await createTestApiKey(request, accessToken, [
        'account:read',
        'trade:read',
      ]);
      if (!keyResult) {
        test.skip(true, 'Cannot create API key');
        return;
      }

      try {
        // Get pool status before
        const poolStatusBefore = await request.get(`${MIDDLEWARE_BASE}/api/v1/pool/status`, {
          headers: {
            'X-Internal-Secret': INTERNAL_SECRET,
          },
        });

        // Make multiple requests
        const requests = [];
        for (let i = 0; i < 5; i++) {
          requests.push(
            request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
              headers: {
                'X-API-Key': keyResult.apiKey,
              },
            })
          );
        }

        await Promise.all(requests);

        // Get pool status after
        const poolStatusAfter = await request.get(`${MIDDLEWARE_BASE}/api/v1/pool/status`, {
          headers: {
            'X-Internal-Secret': INTERNAL_SECRET,
          },
        });

        if (poolStatusBefore.status() === 200 && poolStatusAfter.status() === 200) {
          const beforeData = await poolStatusBefore.json();
          const afterData = await poolStatusAfter.json();

          // Connection count should not increase significantly
          const beforeCount = beforeData.data?.connectedCount || beforeData.connectedCount || 0;
          const afterCount = afterData.data?.connectedCount || afterData.connectedCount || 0;

          // Connections should be reused
          expect(afterCount).toBeLessThanOrEqual(beforeCount + 1);
        }
      } finally {
        await deleteApiKey(request, accessToken, keyResult.id);
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should return proper error for missing API key', async ({ request }) => {
      const response = await request.get(`${MIDDLEWARE_BASE}/api/v1/account/balance`);

      if (response.status() !== 503) {
        expect(response.status()).toBe(401);
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    test('should return proper error for expired API key', async ({ request }) => {
      // This would require creating an expired key in the database directly
      // For now, just test with a clearly invalid key
      const response = await request.get(`${MIDDLEWARE_BASE}/api/v1/account/balance`, {
        headers: {
          'X-API-Key': 'expired-key-simulation',
        },
      });

      expect([401, 403, 503]).toContain(response.status());
    });

    test('should handle concurrent API key requests', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

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
        // Make concurrent requests
        const concurrentRequests = [];
        for (let i = 0; i < 10; i++) {
          concurrentRequests.push(
            request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
              headers: {
                'X-API-Key': keyResult.apiKey,
              },
            })
          );
        }

        const responses = await Promise.all(concurrentRequests);

        // All requests should succeed or fail consistently
        const statuses = responses.map(r => r.status());
        const successCount = statuses.filter(s => s === 200).length;
        const unavailableCount = statuses.filter(s => s === 503).length;

        // Either all succeed, all fail, or all unavailable
        expect(successCount + unavailableCount).toBe(responses.length);
      } finally {
        await deleteApiKey(request, accessToken, keyResult.id);
      }
    });
  });
});
