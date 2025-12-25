# Tenant API Documentation

## Overview

The Tenant API provides endpoints for tenant administrators to manage their MT servers, manager accounts, and access middleware services. This API is part of the SaaS MT5 Platform.

## Authentication

All endpoints require JWT Bearer authentication. Include the token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

The JWT token is obtained through the login endpoint and contains:
- `sub`: User ID
- `tenantId`: Tenant ID
- `role`: User role (`owner`, `admin`, `operator`)

---

## 1. Manager Access Token

Base URL: `/api/v1/mt-managers`

### 1.1 Get Manager Access Token

Generates a Pool Mode Access Token for accessing middleware APIs with a specific manager account. This token allows the tenant console to interact with the middleware using the pre-established MT5 connection from the connection pool.

**Endpoint:** `POST /mt-managers/:managerId/access-token`

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| managerId | string (UUID) | Manager account UUID |

**Required Roles:** `owner`, `admin`, `operator`

**Response (201 Created):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "expiresAt": 1734567890,
  "tokenType": "Bearer",
  "middlewareUrl": "http://middleware-01:8080",
  "manager": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "managerLogin": "10007",
    "displayName": "Production Manager",
    "serverName": "Demo MT5 Server",
    "platformType": "MT5"
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| accessToken | string | Pool Mode JWT token for middleware access |
| expiresIn | integer | Token validity in seconds (default: 900) |
| expiresAt | integer | Token expiration Unix timestamp |
| tokenType | string | Always `Bearer` |
| middlewareUrl | string | URL of the middleware instance to call |
| manager | object | Manager account information |
| manager.id | string | Manager account UUID |
| manager.managerLogin | string | MT manager login number |
| manager.displayName | string | Display name (nullable) |
| manager.serverName | string | Associated MT server name |
| manager.platformType | string | Platform type: `MT4` or `MT5` |

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | BAD_REQUEST | Middleware not configured for the MT server |
| 403 | FORBIDDEN | Manager not active, server not active, wrong tenant, or middleware not assigned |
| 404 | NOT_FOUND | Manager account does not exist |

**Error Response Body:**
```json
{
  "statusCode": 403,
  "message": "Middleware instance not assigned to current tenant",
  "error": "Forbidden"
}
```

---

### Token Structure

The generated Access Token is a JWT with the following payload:

```json
{
  "mode": "pool",
  "managerId": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "tenant-id-001",
  "scopes": ["*"],
  "iat": 1734567000,
  "exp": 1734567900
}
```

| Field | Description |
|-------|-------------|
| mode | Always `pool` for Pool Mode tokens |
| managerId | Manager account UUID - used by middleware to get connection from pool |
| tenantId | Tenant ID for validation |
| scopes | Access scopes (default: `["*"]` for all) |
| iat | Issued at timestamp |
| exp | Expiration timestamp |

---

### Validation Rules

Before generating an Access Token, the following validations are performed:

1. **Manager Exists**: The manager account must exist in the database
2. **Tenant Ownership**: The manager must belong to the requesting tenant
3. **Manager Active**: The manager account must be active (`isActive: true`)
4. **Server Active**: The associated MT server must be active
5. **Middleware Configured**: The MT server must have a middleware instance configured
6. **Middleware Assigned**: The middleware instance must be assigned to the tenant

---

### Usage Flow

1. **Tenant Console Login**: User authenticates and receives JWT token
2. **Get Access Token**: Call this endpoint with manager ID to get Pool Mode token
3. **Call Middleware**: Use the returned `accessToken` and `middlewareUrl` to call middleware APIs
4. **Connection Reuse**: Middleware uses `managerId` from token to get existing MT5 connection from pool

```
Tenant Console                  Tenant API                    Middleware
     |                              |                              |
     |-- Login ------------------->|                              |
     |<-- JWT Token ---------------|                              |
     |                              |                              |
     |-- POST /access-token ------>|                              |
     |                              |-- Validate Manager -------->|
     |<-- Pool Mode Token ---------|                              |
     |                              |                              |
     |-- API Call (with token) ---------------------------------->|
     |                              |                              |-- Get Connection
     |<-- Response ------------------------------------------------|     from Pool
```

---

## Code Examples

### TypeScript/JavaScript - Get Access Token

```typescript
// Get Access Token for a manager
const response = await fetch(`/api/v1/mt-managers/${managerId}/access-token`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  }
});

const { accessToken, middlewareUrl, manager } = await response.json();

// Use the token to call middleware API
const middlewareResponse = await fetch(`${middlewareUrl}/api/v1/users`, {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const users = await middlewareResponse.json();
```

### cURL - Get Access Token

```bash
curl -X POST "http://localhost:3000/api/v1/mt-managers/550e8400-e29b-41d4-a716-446655440000/access-token" \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json"
```

### Vue 3 Composition API Example

```typescript
import { ref } from 'vue';
import { useApi } from '@/composables/useApi';

const api = useApi();

async function getManagerAccessToken(managerId: string) {
  const response = await api.post(`/mt-managers/${managerId}/access-token`);

  // Store token for middleware calls
  const middlewareToken = ref(response.data.accessToken);
  const middlewareUrl = ref(response.data.middlewareUrl);

  return {
    token: middlewareToken.value,
    url: middlewareUrl.value,
    expiresIn: response.data.expiresIn,
    manager: response.data.manager
  };
}
```

---

## Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created (token generated) |
| 400 | Bad Request (validation error or middleware not configured) |
| 401 | Unauthorized (missing or invalid JWT) |
| 403 | Forbidden (insufficient permissions or access denied) |
| 404 | Not Found (manager does not exist) |
| 500 | Internal Server Error |

---

## Security Considerations

1. **Token Lifetime**: Access tokens are short-lived (15 minutes) to minimize risk
2. **No Sensitive Data**: Tokens only contain `managerId`, not credentials
3. **Tenant Isolation**: Manager access is strictly validated against tenant ownership
4. **Middleware Assignment**: Only assigned middleware instances can be accessed
5. **Audit Logging**: All token generation is logged with user ID for audit trail
