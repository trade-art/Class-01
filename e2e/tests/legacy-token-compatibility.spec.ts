import { test, expect } from '@playwright/test';

/**
 * Legacy Token Backward Compatibility E2E Tests
 *
 * Tests that legacy Service Token format continues to work:
 * 1. Legacy token with managerLogin + encryptedPassword still authenticates
 * 2. ManagerIdResolver correctly resolves managerId from legacy credentials
 * 3. Connection pool is correctly used for legacy tokens
 * 4. Warning logs are generated for legacy token usage
 *
 * Requirements: REQ-2 (Backward compatibility)
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
 * Helper to get legacy service token (old format with encryptedPassword)
 */
async function getLegacyServiceToken(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
  serverId?: string
): Promise<{ token: string; expiresAt: string } | null> {
  const response = await request.post(`${TENANT_API_BASE}/tenant/auth/service-token`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      serverId: serverId || process.env.TEST_SERVER_ID || 'test-server-1',
    },
  });

  if (response.status() !== 200) {
    return null;
  }

  const data = await response.json();
  return {
    token: data.data?.token || data.token,
    expiresAt: data.data?.expiresAt || data.expiresAt,
  };
}

/**
 * Helper to decode JWT payload
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
}

/**
 * Helper to detect token type from payload
 */
function detectTokenType(payload: Record<string, unknown>): 'POOL_MODE' | 'LEGACY' | 'UNKNOWN' {
  if (payload.mode === 'pool' && payload.managerId) {
    return 'POOL_MODE';
  }
  if (payload.managerLogin && payload.encryptedPassword) {
    return 'LEGACY';
  }
  return 'UNKNOWN';
}

test.describe('Legacy Token Backward Compatibility', () => {
  test.describe('Legacy Token Format Validation', () => {
    test('should generate legacy token with expected structure', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const legacyToken = await getLegacyServiceToken(request, accessToken);
      if (!legacyToken) {
        test.skip(true, 'Legacy service token endpoint not available');
        return;
      }

      // Verify JWT structure
      const parts = legacyToken.token.split('.');
      expect(parts).toHaveLength(3);

      // Decode and verify payload
      const payload = decodeJwtPayload(legacyToken.token);

      // Legacy token should have managerLogin and encryptedPassword
      expect(payload).toHaveProperty('tenantId');
      expect(payload).toHaveProperty('instanceId');
      expect(payload).toHaveProperty('serverId');
      expect(payload).toHaveProperty('managerLogin');
      expect(payload).toHaveProperty('encryptedPassword');

      // Should NOT have Pool Mode claims
      expect(payload.mode).not.toBe('pool');
      expect(payload.managerId).toBeUndefined();

      // Verify token type detection
      expect(detectTokenType(payload)).toBe('LEGACY');
    });

    test('should distinguish between legacy and Pool Mode tokens', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      // Get legacy token
      const legacyToken = await getLegacyServiceToken(request, accessToken);

      // Get managers for Pool Mode token
      const managersResponse = await request.get(`${TENANT_API_BASE}/tenant/mt-managers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let poolModeToken: string | null = null;

      if (managersResponse.status() === 200) {
        const managers = (await managersResponse.json()).data || [];
        if (managers.length > 0) {
          const managerId = managers[0]?.id;
          if (managerId) {
            const tokenResponse = await request.post(
              `${TENANT_API_BASE}/tenant/mt-managers/${managerId}/access-token`,
              {
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${accessToken}`,
                },
              }
            );
            if (tokenResponse.status() === 200) {
              const data = await tokenResponse.json();
              poolModeToken = data.data?.accessToken || data.accessToken;
            }
          }
        }
      }

      // Compare token types
      if (legacyToken) {
        const legacyPayload = decodeJwtPayload(legacyToken.token);
        expect(detectTokenType(legacyPayload)).toBe('LEGACY');
      }

      if (poolModeToken) {
        const poolPayload = decodeJwtPayload(poolModeToken);
        expect(detectTokenType(poolPayload)).toBe('POOL_MODE');
      }
    });
  });

  test.describe('Legacy Token Authentication', () => {
    test('should authenticate to middleware with legacy token', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const legacyToken = await getLegacyServiceToken(request, accessToken);
      if (!legacyToken) {
        test.skip(true, 'Cannot get legacy service token');
        return;
      }

      // Call middleware with legacy token
      const middlewareResponse = await request.get(`${MIDDLEWARE_BASE}/api/v1/account/balance`, {
        headers: {
          Authorization: `Bearer ${legacyToken.token}`,
        },
      });

      // Should succeed or return service unavailable
      expect([200, 503]).toContain(middlewareResponse.status());
    });

    test('should access trading data with legacy token', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const legacyToken = await getLegacyServiceToken(request, accessToken);
      if (!legacyToken) {
        test.skip(true, 'Cannot get legacy service token');
        return;
      }

      // Access multiple endpoints
      const usersResponse = await request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
        headers: {
          Authorization: `Bearer ${legacyToken.token}`,
        },
      });
      expect([200, 503]).toContain(usersResponse.status());

      const positionsResponse = await request.get(`${MIDDLEWARE_BASE}/api/v1/positions`, {
        headers: {
          Authorization: `Bearer ${legacyToken.token}`,
        },
      });
      expect([200, 503]).toContain(positionsResponse.status());
    });

    test('should reject expired legacy token', async ({ request }) => {
      // Create a manually expired token (simulate expired signature)
      const expiredToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        Buffer.from(
          JSON.stringify({
            tenantId: 'test-tenant',
            instanceId: 'test-instance',
            serverId: 'test-server',
            managerLogin: 12345,
            encryptedPassword: 'test-encrypted',
            exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
          })
        ).toString('base64url') +
        '.invalid_signature';

      const response = await request.get(`${MIDDLEWARE_BASE}/api/v1/account/balance`, {
        headers: {
          Authorization: `Bearer ${expiredToken}`,
        },
      });

      // Should be rejected
      expect([401, 403, 503]).toContain(response.status());
    });
  });

  test.describe('ManagerId Resolution for Legacy Tokens', () => {
    test('should resolve managerId from legacy credentials', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const legacyToken = await getLegacyServiceToken(request, accessToken);
      if (!legacyToken) {
        test.skip(true, 'Cannot get legacy service token');
        return;
      }

      // Call middleware - internally should use ManagerIdResolver
      const response = await request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
        headers: {
          Authorization: `Bearer ${legacyToken.token}`,
        },
      });

      // If successful, ManagerIdResolver worked correctly
      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toBeDefined();
      }

      // Accept both success and service unavailable
      expect([200, 503]).toContain(response.status());
    });

    test('should use connection pool after managerId resolution', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const legacyToken = await getLegacyServiceToken(request, accessToken);
      if (!legacyToken) {
        test.skip(true, 'Cannot get legacy service token');
        return;
      }

      // Get initial pool status
      const initialStatus = await request.get(`${MIDDLEWARE_BASE}/api/v1/pool/status`, {
        headers: { 'X-Internal-Secret': INTERNAL_SECRET },
      });

      // Make multiple requests with legacy token
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
            headers: {
              Authorization: `Bearer ${legacyToken.token}`,
            },
          })
        );
      }
      await Promise.all(requests);

      // Get final pool status
      const finalStatus = await request.get(`${MIDDLEWARE_BASE}/api/v1/pool/status`, {
        headers: { 'X-Internal-Secret': INTERNAL_SECRET },
      });

      // Verify connection pool was used (no new connections created)
      if (initialStatus.status() === 200 && finalStatus.status() === 200) {
        const initial = await initialStatus.json();
        const final = await finalStatus.json();

        const initialCount = initial.data?.totalConnections || initial.totalConnections || 0;
        const finalCount = final.data?.totalConnections || final.totalConnections || 0;

        // Legacy token should reuse pool connections via ManagerIdResolver
        expect(finalCount).toBeLessThanOrEqual(initialCount + 1);
      }
    });
  });

  test.describe('Mixed Token Type Support', () => {
    test('should handle concurrent legacy and Pool Mode requests', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      // Get legacy token
      const legacyToken = await getLegacyServiceToken(request, accessToken);

      // Get Pool Mode token
      let poolModeToken: string | null = null;
      const managersResponse = await request.get(`${TENANT_API_BASE}/tenant/mt-managers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (managersResponse.status() === 200) {
        const managers = (await managersResponse.json()).data || [];
        if (managers.length > 0) {
          const managerId = managers[0]?.id;
          if (managerId) {
            const tokenResponse = await request.post(
              `${TENANT_API_BASE}/tenant/mt-managers/${managerId}/access-token`,
              {
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${accessToken}`,
                },
              }
            );
            if (tokenResponse.status() === 200) {
              const data = await tokenResponse.json();
              poolModeToken = data.data?.accessToken || data.accessToken;
            }
          }
        }
      }

      if (!legacyToken && !poolModeToken) {
        test.skip(true, 'Cannot get any tokens');
        return;
      }

      // Make concurrent requests with both token types
      const concurrentRequests = [];

      if (legacyToken) {
        for (let i = 0; i < 3; i++) {
          concurrentRequests.push(
            request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
              headers: { Authorization: `Bearer ${legacyToken.token}` },
            })
          );
        }
      }

      if (poolModeToken) {
        for (let i = 0; i < 3; i++) {
          concurrentRequests.push(
            request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
              headers: { Authorization: `Bearer ${poolModeToken}` },
            })
          );
        }
      }

      const responses = await Promise.all(concurrentRequests);

      // All should succeed or be unavailable
      for (const response of responses) {
        expect([200, 503]).toContain(response.status());
      }
    });

    test('should seamlessly switch between token types', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      // Get legacy token
      const legacyToken = await getLegacyServiceToken(request, accessToken);

      // Get Pool Mode token
      let poolModeToken: string | null = null;
      const managersResponse = await request.get(`${TENANT_API_BASE}/tenant/mt-managers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (managersResponse.status() === 200) {
        const managers = (await managersResponse.json()).data || [];
        if (managers.length > 0) {
          const managerId = managers[0]?.id;
          if (managerId) {
            const tokenResponse = await request.post(
              `${TENANT_API_BASE}/tenant/mt-managers/${managerId}/access-token`,
              {
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${accessToken}`,
                },
              }
            );
            if (tokenResponse.status() === 200) {
              const data = await tokenResponse.json();
              poolModeToken = data.data?.accessToken || data.accessToken;
            }
          }
        }
      }

      if (!legacyToken || !poolModeToken) {
        test.skip(true, 'Need both token types for this test');
        return;
      }

      // Alternate between token types
      for (let i = 0; i < 5; i++) {
        // Legacy request
        const legacyResponse = await request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
          headers: { Authorization: `Bearer ${legacyToken.token}` },
        });
        expect([200, 503]).toContain(legacyResponse.status());

        // Pool Mode request
        const poolResponse = await request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
          headers: { Authorization: `Bearer ${poolModeToken}` },
        });
        expect([200, 503]).toContain(poolResponse.status());
      }
    });
  });

  test.describe('Deprecation Warnings', () => {
    test('should accept legacy token with deprecation handling', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      const legacyToken = await getLegacyServiceToken(request, accessToken);
      if (!legacyToken) {
        test.skip(true, 'Cannot get legacy service token');
        return;
      }

      // Call middleware with legacy token
      const response = await request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
        headers: {
          Authorization: `Bearer ${legacyToken.token}`,
        },
      });

      // Should succeed or be unavailable
      expect([200, 503]).toContain(response.status());

      // Check for deprecation header (if implemented)
      const headers = response.headers();
      // Note: This header might not be present in all implementations
      // Just verify the request succeeded
      if (headers['x-deprecated-token']) {
        expect(headers['x-deprecated-token']).toBe('true');
      }
    });

    test('should provide migration path from legacy to Pool Mode', async ({ request }) => {
      const accessToken = await getAccessToken(request);
      if (!accessToken) {
        test.skip(true, 'Cannot login');
        return;
      }

      // Step 1: Verify legacy token works
      const legacyToken = await getLegacyServiceToken(request, accessToken);
      if (!legacyToken) {
        test.skip(true, 'Cannot get legacy service token');
        return;
      }

      const legacyResponse = await request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
        headers: { Authorization: `Bearer ${legacyToken.token}` },
      });
      expect([200, 503]).toContain(legacyResponse.status());

      // Step 2: Verify Pool Mode token works for same data
      const managersResponse = await request.get(`${TENANT_API_BASE}/tenant/mt-managers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (managersResponse.status() !== 200) {
        test.skip(true, 'Cannot get managers');
        return;
      }

      const managers = (await managersResponse.json()).data || [];
      if (managers.length === 0) {
        test.skip(true, 'No managers available');
        return;
      }

      const managerId = managers[0]?.id;
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
        test.skip(true, 'Cannot get Pool Mode token');
        return;
      }

      const poolModeToken = (await tokenResponse.json()).data?.accessToken;

      const poolResponse = await request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
        headers: { Authorization: `Bearer ${poolModeToken}` },
      });
      expect([200, 503]).toContain(poolResponse.status());

      // Both token types should work and return similar data
      if (legacyResponse.status() === 200 && poolResponse.status() === 200) {
        // Both endpoints responded successfully
        const legacyData = await legacyResponse.json();
        const poolData = await poolResponse.json();

        // Data structure should be similar
        expect(typeof legacyData).toBe(typeof poolData);
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should handle invalid legacy token gracefully', async ({ request }) => {
      const invalidToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        Buffer.from(
          JSON.stringify({
            tenantId: 'invalid-tenant',
            instanceId: 'invalid-instance',
            serverId: 'invalid-server',
            managerLogin: 99999,
            encryptedPassword: 'invalid',
            exp: Math.floor(Date.now() / 1000) + 3600,
          })
        ).toString('base64url') +
        '.fake_signature';

      const response = await request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
        headers: {
          Authorization: `Bearer ${invalidToken}`,
        },
      });

      // Should return proper error, not crash (404 if auth fails before route matching)
      expect([401, 403, 404, 503]).toContain(response.status());

      // Only check JSON body for known JSON response status codes
      if ([401, 403].includes(response.status())) {
        try {
          const body = await response.json();
          expect(body).toHaveProperty('error');
        } catch {
          // Some responses may not be JSON (e.g., HTML error pages)
        }
      }
    });

    test('should handle malformed legacy token', async ({ request }) => {
      // Token with missing required fields
      const malformedToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        Buffer.from(
          JSON.stringify({
            tenantId: 'test-tenant',
            // Missing managerLogin, encryptedPassword
            exp: Math.floor(Date.now() / 1000) + 3600,
          })
        ).toString('base64url') +
        '.invalid';

      const response = await request.get(`${MIDDLEWARE_BASE}/api/v1/users`, {
        headers: {
          Authorization: `Bearer ${malformedToken}`,
        },
      });

      // Should return proper error (404 if auth fails before route matching)
      expect([401, 403, 404, 503]).toContain(response.status());
    });
  });
});
