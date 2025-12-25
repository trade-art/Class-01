# Middleware Management API Documentation

## Overview

The Middleware Management API provides endpoints for managing middleware instances, their assignments to tenants, and service-to-service communication. This API is part of the SaaS MT5 Platform.

## Authentication

### Platform Admin APIs
All platform admin endpoints require JWT Bearer authentication. Include the token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

Required roles: `admin` or `super_admin`

### Internal APIs (Service-to-Service)
Internal endpoints use API Key authentication. Include the key in the `X-Middleware-API-Key` header:

```
X-Middleware-API-Key: <api_key>
```

---

## 1. Middleware Management

Base URL: `/api/v1/middlewares`

### 1.1 Create Middleware

Creates a new middleware instance and generates an API Key.

**Endpoint:** `POST /middlewares`

**Request Body:**
```json
{
  "name": "Middleware-01",
  "description": "Primary middleware for small tenants",
  "url": "http://middleware-01:8080",
  "assignmentMode": "SHARED",
  "maxTenants": 10
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Middleware name |
| description | string | No | Description |
| url | string | Yes | Middleware URL (must be unique) |
| assignmentMode | enum | No | `SHARED` (default) or `DEDICATED` |
| maxTenants | integer | No | Maximum tenants (1-100, default: 10) |

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Middleware-01",
  "description": "Primary middleware for small tenants",
  "url": "http://middleware-01:8080",
  "assignmentMode": "SHARED",
  "maxTenants": 10,
  "status": "UNKNOWN",
  "activeSessions": 0,
  "assignedTenantCount": 0,
  "createdAt": "2025-12-09T10:00:00.000Z",
  "updatedAt": "2025-12-09T10:00:00.000Z",
  "apiKey": "mw_abc123xyz789..."
}
```

> **Important:** The `apiKey` is only returned on creation. Store it securely as it cannot be retrieved again.

**Error Responses:**
- `409 Conflict`: URL already exists

---

### 1.2 List Middlewares

Retrieves all middlewares with optional filtering.

**Endpoint:** `GET /middlewares`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | enum | Filter by status: `ONLINE`, `OFFLINE`, `DEGRADED`, `ERROR`, `UNKNOWN` |
| assignmentMode | enum | Filter by mode: `SHARED`, `DEDICATED` |
| search | string | Search by name |

**Response (200 OK):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Middleware-01",
    "description": "Primary middleware",
    "url": "http://middleware-01:8080",
    "assignmentMode": "SHARED",
    "maxTenants": 10,
    "status": "ONLINE",
    "lastHeartbeat": "2025-12-09T10:05:00.000Z",
    "serverIp": "192.168.1.100",
    "activeSessions": 25,
    "memoryUsage": 65.5,
    "cpuUsage": 30.2,
    "assignedTenantCount": 5,
    "createdAt": "2025-12-09T10:00:00.000Z",
    "updatedAt": "2025-12-09T10:05:00.000Z"
  }
]
```

---

### 1.3 Get Middleware Details

Retrieves detailed information about a specific middleware.

**Endpoint:** `GET /middlewares/:id`

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Middleware-01",
  "description": "Primary middleware",
  "url": "http://middleware-01:8080",
  "assignmentMode": "SHARED",
  "maxTenants": 10,
  "status": "ONLINE",
  "lastHeartbeat": "2025-12-09T10:05:00.000Z",
  "serverIp": "192.168.1.100",
  "activeSessions": 25,
  "memoryUsage": 65.5,
  "cpuUsage": 30.2,
  "cacheStatus": {
    "redisConnected": true,
    "hitRate": 0.95,
    "totalKeys": 1500
  },
  "assignedTenantCount": 5,
  "createdAt": "2025-12-09T10:00:00.000Z",
  "updatedAt": "2025-12-09T10:05:00.000Z"
}
```

**Error Responses:**
- `404 Not Found`: Middleware does not exist

---

### 1.4 Update Middleware

Updates middleware information.

**Endpoint:** `PUT /middlewares/:id`

**Request Body:**
```json
{
  "name": "Middleware-01-Updated",
  "description": "Updated description",
  "maxTenants": 15
}
```

All fields are optional.

**Response (200 OK):** Returns updated middleware object.

**Error Responses:**
- `404 Not Found`: Middleware does not exist
- `409 Conflict`: URL conflict with another middleware

---

### 1.5 Delete Middleware

Deletes a middleware instance. All tenant assignments must be removed first.

**Endpoint:** `DELETE /middlewares/:id`

**Response:** `204 No Content`

**Error Responses:**
- `404 Not Found`: Middleware does not exist
- `409 Conflict`: Still has tenant assignments

---

### 1.6 Regenerate API Key

Generates a new API Key for the middleware. The old key becomes invalid immediately.

**Endpoint:** `POST /middlewares/:id/regenerate-api-key`

**Response (200 OK):**
```json
{
  "apiKey": "mw_new_key_xyz789...",
  "message": "New API Key generated. Store it securely."
}
```

**Error Responses:**
- `404 Not Found`: Middleware does not exist

---

### 1.7 Trigger Health Check

Triggers an immediate health check for a middleware.

**Endpoint:** `POST /middlewares/:id/health-check`

**Response (200 OK):**
```json
{
  "status": "ONLINE",
  "message": "Health check completed. Current status: ONLINE"
}
```

**Error Responses:**
- `404 Not Found`: Middleware does not exist

---

### 1.8 Get Health Summary

Returns aggregated health statistics for all middlewares.

**Endpoint:** `GET /middlewares/health/summary`

**Response (200 OK):**
```json
{
  "total": 5,
  "online": 3,
  "offline": 1,
  "degraded": 1,
  "error": 0,
  "unknown": 0
}
```

---

## 2. Middleware Assignment Management

Base URL: `/api/v1/middleware-assignments`

### 2.1 Get All Middleware Capacity

Returns capacity information for all middlewares.

**Endpoint:** `GET /middleware-assignments/capacity`

**Response (200 OK):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Middleware-01",
    "assignmentMode": "SHARED",
    "maxTenants": 10,
    "currentTenants": 5,
    "availableSlots": 5,
    "canAssign": true
  }
]
```

---

### 2.2 Get Available Middlewares

Returns middlewares that can accept new tenant assignments.

**Endpoint:** `GET /middleware-assignments/available`

**Response (200 OK):** Same format as Get All Middleware Capacity, filtered to only middlewares where `canAssign` is `true`.

---

### 2.3 Get Assignments by Middleware

Returns all tenants assigned to a specific middleware.

**Endpoint:** `GET /middleware-assignments/middleware/:middlewareId`

**Response (200 OK):**
```json
[
  {
    "id": "assignment-id-001",
    "middlewareId": "550e8400-e29b-41d4-a716-446655440000",
    "tenantId": "tenant-id-001",
    "assignedAt": "2025-12-09T10:00:00.000Z",
    "assignedBy": "admin-user-id",
    "tenant": {
      "id": "tenant-id-001",
      "name": "Demo Tenant",
      "code": "DEMO"
    }
  }
]
```

**Error Responses:**
- `404 Not Found`: Middleware does not exist

---

### 2.4 Get Middleware by Tenant

Returns the middleware assigned to a specific tenant.

**Endpoint:** `GET /middleware-assignments/tenant/:tenantId`

**Response (200 OK):**
```json
{
  "middlewareId": "550e8400-e29b-41d4-a716-446655440000",
  "middlewareName": "Middleware-01",
  "middlewareUrl": "http://middleware-01:8080",
  "assignedAt": "2025-12-09T10:00:00.000Z",
  "hasMtServerConfig": true
}
```

**Response (200 OK with null):** Returns `null` if tenant has no middleware assigned.

**Error Responses:**
- `404 Not Found`: Tenant does not exist

---

### 2.5 Assign Tenant to Middleware

Assigns a tenant to a middleware instance.

**Endpoint:** `POST /middleware-assignments/middleware/:middlewareId/assign`

**Request Body:**
```json
{
  "tenantId": "tenant-id-001",
  "notes": "Optional assignment notes"
}
```

**Response (201 Created):**
```json
{
  "id": "assignment-id-001",
  "middlewareId": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "tenant-id-001",
  "assignedAt": "2025-12-09T10:00:00.000Z",
  "assignedBy": "admin-user-id"
}
```

**Error Responses:**
- `404 Not Found`: Middleware or tenant does not exist
- `409 Conflict`:
  - Tenant already assigned to this middleware
  - Middleware at capacity (SHARED mode)
  - Middleware already has a tenant (DEDICATED mode)
  - Tenant has no MT server configuration

---

### 2.6 Unassign Tenant from Middleware

Removes a tenant's assignment from a middleware.

**Endpoint:** `DELETE /middleware-assignments/middleware/:middlewareId/tenant/:tenantId`

**Response (200 OK):**
```json
{
  "message": "Unassignment successful"
}
```

**Error Responses:**
- `404 Not Found`: Assignment does not exist

---

### 2.7 Batch Assign Tenants

Assigns multiple tenants to a middleware in a single operation.

**Endpoint:** `POST /middleware-assignments/middleware/:middlewareId/batch-assign`

**Request Body:**
```json
{
  "tenantIds": ["tenant-id-001", "tenant-id-002", "tenant-id-003"]
}
```

**Response (201 Created):**
```json
{
  "success": ["tenant-id-001", "tenant-id-002"],
  "failed": [
    {
      "tenantId": "tenant-id-003",
      "reason": "No MT server configuration"
    }
  ]
}
```

---

## 3. Internal Middleware API (Service-to-Service)

Base URL: `/api/v1/internal/middleware`

> These endpoints are used by middleware instances to communicate with the platform. They require API Key authentication.

### 3.1 Get Configuration

Retrieves all tenant configurations assigned to the requesting middleware.

**Endpoint:** `GET /internal/middleware/config`

**Headers:**
```
X-Middleware-API-Key: <api_key>
```

**Response (200 OK):**
```json
{
  "middlewareId": "550e8400-e29b-41d4-a716-446655440000",
  "middlewareName": "Middleware-01",
  "configVersion": 5,
  "configUpdatedAt": "2025-12-09T10:00:00.000Z",
  "tenants": [
    {
      "tenantId": "tenant-id-001",
      "tenantCode": "DEMO",
      "tenantName": "Demo Tenant",
      "mtServers": [
        {
          "id": "server-id-001",
          "serverId": "mt5-demo-01",
          "displayName": "Demo MT5 Server",
          "platformType": "MT5",
          "middlewareUrl": "http://middleware-01:8080",
          "serverAddress": "mt5.demo.com:443",
          "managerLogin": "1000",
          "managerPassword": "decrypted_password_here",
          "isActive": true,
          "isDefault": true,
          "configVersion": 3,
          "lastModifiedAt": "2025-12-09T09:00:00.000Z"
        }
      ]
    }
  ]
}
```

> **Security Note:** Passwords are returned in decrypted form for middleware use. This endpoint should only be accessible from trusted internal networks.

**Error Responses:**
- `401 Unauthorized`: Invalid or missing API Key

---

### 3.2 Report Heartbeat

Reports middleware health status to the platform.

**Endpoint:** `POST /internal/middleware/heartbeat`

**Headers:**
```
X-Middleware-API-Key: <api_key>
```

**Request Body:**
```json
{
  "serverIp": "192.168.1.100",
  "activeSessions": 25,
  "memoryUsage": 65.5,
  "cpuUsage": 30.2,
  "cacheStatus": {
    "redisConnected": true,
    "hitRate": 0.95,
    "totalKeys": 1500
  },
  "status": "healthy"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| serverIp | string | No | Server IP address |
| activeSessions | integer | No | Number of active sessions |
| memoryUsage | number | No | Memory usage percentage (0-100) |
| cpuUsage | number | No | CPU usage percentage (0-100) |
| cacheStatus | object | No | Cache status information |
| status | string | No | Health status: `healthy`, `degraded`, `unhealthy` |

**Response (200 OK):**
```json
{
  "success": true,
  "nextHeartbeatInterval": 30,
  "configUpdated": true,
  "newConfigVersion": 6
}
```

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Whether heartbeat was recorded |
| nextHeartbeatInterval | integer | Recommended interval until next heartbeat (seconds) |
| configUpdated | boolean | Whether configuration has been updated |
| newConfigVersion | integer | New configuration version (if updated) |

**Error Responses:**
- `401 Unauthorized`: Invalid or missing API Key

---

### 3.3 Health Check

Validates API Key and returns basic middleware information.

**Endpoint:** `GET /internal/middleware/health`

**Headers:**
```
X-Middleware-API-Key: <api_key>
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "middlewareId": "550e8400-e29b-41d4-a716-446655440000",
  "middlewareName": "Middleware-01"
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or missing API Key

---

## Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (successful deletion) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing or invalid authentication) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 409 | Conflict (duplicate resource or business rule violation) |
| 500 | Internal Server Error |

---

## Middleware Status Values

| Status | Description |
|--------|-------------|
| ONLINE | Middleware is healthy and operational |
| OFFLINE | Middleware is not responding |
| DEGRADED | Middleware is responding but with reduced performance |
| ERROR | Middleware is experiencing errors |
| UNKNOWN | Status not yet determined (initial state) |

---

## Assignment Mode Values

| Mode | Description |
|------|-------------|
| SHARED | Multiple tenants can be assigned (up to maxTenants) |
| DEDICATED | Only one tenant can be assigned |

---

## Code Examples

### TypeScript/JavaScript - Create Middleware

```typescript
const response = await fetch('/api/v1/middlewares', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    name: 'Middleware-01',
    url: 'http://middleware-01:8080',
    assignmentMode: 'SHARED',
    maxTenants: 10
  })
});

const middleware = await response.json();
console.log('API Key:', middleware.apiKey); // Store this securely!
```

### TypeScript/JavaScript - Middleware Heartbeat

```typescript
const response = await fetch('/api/v1/internal/middleware/heartbeat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Middleware-API-Key': apiKey
  },
  body: JSON.stringify({
    serverIp: '192.168.1.100',
    activeSessions: 25,
    memoryUsage: 65.5,
    cpuUsage: 30.2,
    status: 'healthy'
  })
});

const result = await response.json();
if (result.configUpdated) {
  // Fetch new configuration
  await refreshConfiguration();
}
```

### cURL - List Middlewares

```bash
curl -X GET "http://localhost:3000/api/v1/middlewares?status=ONLINE" \
  -H "Authorization: Bearer <token>"
```

### cURL - Get Middleware Configuration

```bash
curl -X GET "http://localhost:3000/api/v1/internal/middleware/config" \
  -H "X-Middleware-API-Key: mw_abc123xyz789"
```
