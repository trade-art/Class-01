# 统一连接池迁移指南

**版本**: 1.0
**创建时间**: 2025-12-19
**状态**: 推荐迁移

---

## 概述

本指南说明如何将现有的 Service Token 认证方式迁移到新的 Pool Mode Token 认证方式。新的认证方式使用统一连接池架构，提供更好的性能和资源利用率。

### 迁移收益

| 收益 | 说明 |
|------|------|
| 连接复用 | 租户后台和第三方应用共享同一 MT5 连接 |
| 减少延迟 | 无需每次请求都建立新连接 |
| 简化认证 | Token 直接包含 managerId，无需运行时解析 |
| 资源优化 | 预连接模式减少连接创建开销 |

---

## Token 格式对比

### Legacy Token (旧格式)

```json
{
  "tenantId": "tenant-001",
  "instanceId": "instance-001",
  "serverId": "server-001",
  "managerLogin": 12345,
  "encryptedPassword": "AES256加密的密码",
  "scopes": ["trade:read", "trade:write"],
  "iat": 1734567890,
  "exp": 1734571490
}
```

**问题**:
- 包含敏感的加密密码
- 需要运行时解析 managerId
- 每次请求都需要密码验证

### Pool Mode Token (新格式)

```json
{
  "tenantId": "tenant-001",
  "managerId": "manager-uuid-001",
  "mode": "pool",
  "scopes": ["trade:read", "trade:write"],
  "iat": 1734567890,
  "exp": 1734571490
}
```

**优势**:
- 不包含密码信息
- 直接使用 managerId 访问连接池
- 更安全、更高效

---

## 迁移步骤

### 前端迁移

#### Step 1: 获取 Manager Access Token

**旧方式** (不推荐):
```javascript
// 使用 manager 登录凭证
const response = await api.post('/api/v1/auth/admin/login', {
  login: 12345,
  password: 'manager_password'
});
const token = response.data.access_token;
```

**新方式** (推荐):
```javascript
// 1. 用户登录租户后台 (已有流程)
const userToken = await loginToTenantConsole();

// 2. 获取 Manager Access Token
const response = await api.post(
  `/api/v1/mt-managers/${managerId}/access-token`,
  {},
  { headers: { Authorization: `Bearer ${userToken}` } }
);

const managerToken = response.data.accessToken;
const middlewareUrl = response.data.middlewareUrl;
```

#### Step 2: 使用 Manager Token 调用中间件 API

```javascript
// 使用 Manager Access Token 调用中间件
const accountBalance = await fetch(
  `${middlewareUrl}/api/v1/account/balance`,
  {
    headers: {
      'Authorization': `Bearer ${managerToken}`,
      'Content-Type': 'application/json'
    }
  }
);
```

### 后端迁移

#### Tenant API 新端点

**端点**: `POST /api/v1/mt-managers/{managerId}/access-token`

**请求**:
```http
POST /api/v1/mt-managers/manager-uuid-001/access-token
Authorization: Bearer <user_jwt_token>
Content-Type: application/json
```

**响应**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "expiresAt": "2025-12-19T12:00:00.000Z",
  "middlewareUrl": "https://middleware.example.com",
  "manager": {
    "id": "manager-uuid-001",
    "login": 12345,
    "mtServerId": "server-uuid-001"
  }
}
```

**权限要求**:
- 需要有效的租户用户 JWT Token
- 用户角色必须是 `owner`、`admin` 或 `operator`
- Manager 必须属于该租户且处于激活状态

---

## 向后兼容性

### 过渡期支持

在迁移过程中，中间件同时支持三种认证方式：

| 认证方式 | 状态 | 支持期限 |
|---------|------|---------|
| Pool Mode Token | **推荐** | 长期支持 |
| Legacy Token | 已弃用 | 12个月后移除 |
| API Key | 正常 | 第三方应用继续使用 |

### Legacy Token 警告

使用 Legacy Token 时，中间件会记录以下警告日志：

```
[WARN] Legacy Service Token detected for tenant tenant-001.
       Legacy tokens are deprecated and will be removed in a future version.
       Please migrate to Pool Mode tokens using the /api/v1/mt-managers/{managerId}/access-token endpoint.
```

### 检测您的 Token 类型

可以通过以下方式检查正在使用的 Token 类型：

```javascript
// 解码 JWT Token (不验证签名)
function getTokenType(token) {
  const payload = JSON.parse(atob(token.split('.')[1]));

  if (payload.mode === 'pool' && payload.managerId) {
    return 'POOL_MODE';  // 新格式
  }

  if (payload.managerLogin && payload.encryptedPassword) {
    return 'LEGACY';  // 旧格式，需要迁移
  }

  return 'UNKNOWN';
}
```

---

## 迁移时间线

| 阶段 | 时间 | 变更 |
|------|------|------|
| **阶段 0** (当前) | 2025-12 | Pool Mode 功能上线，Legacy Token 正常工作 |
| **阶段 1** | 2026-03 | 新项目默认使用 Pool Mode，Legacy Token 记录警告 |
| **阶段 2** | 2026-06 | Legacy Token 响应添加 `X-Deprecated-Token: true` header |
| **阶段 3** | 2026-12 | 完全移除 Legacy Token 支持，返回 401 错误 |

---

## 常见问题

### Q1: 我必须立即迁移吗？

**A**: 不是必须的。Legacy Token 将在 12 个月内继续工作。但建议尽早迁移以获得更好的性能和安全性。

### Q2: API Key 认证方式会受影响吗？

**A**: 不会。API Key 认证方式保持不变，适用于第三方应用集成场景。

### Q3: 迁移后 Token 过期时间有变化吗？

**A**: 默认过期时间为 1 小时，与之前保持一致。可以通过配置调整。

### Q4: 如何处理 Token 刷新？

**A**: Pool Mode Token 过期后，需要重新调用 `/access-token` 端点获取新 Token。建议在前端实现 Token 自动刷新逻辑。

```javascript
class TokenManager {
  async getValidToken() {
    if (this.isTokenExpired()) {
      this.token = await this.refreshToken();
    }
    return this.token;
  }

  isTokenExpired() {
    if (!this.token) return true;
    const payload = JSON.parse(atob(this.token.split('.')[1]));
    // 提前 5 分钟刷新
    return Date.now() >= (payload.exp * 1000 - 5 * 60 * 1000);
  }

  async refreshToken() {
    const response = await api.post(
      `/api/v1/mt-managers/${this.managerId}/access-token`
    );
    return response.data.accessToken;
  }
}
```

### Q5: 多个 Manager 场景如何处理？

**A**: 为每个 Manager 分别获取 Access Token，每个 Token 只能访问对应的 Manager 连接。

```javascript
// 获取多个 Manager 的 Token
const tokens = await Promise.all(
  managerIds.map(id =>
    api.post(`/api/v1/mt-managers/${id}/access-token`)
  )
);

// 使用对应的 Token 访问各自的 Manager
const results = await Promise.all(
  tokens.map((token, index) =>
    callMiddlewareApi(managerIds[index], token.data.accessToken)
  )
);
```

---

## 代码示例

### Vue.js 完整示例

```vue
<script setup>
import { ref, onMounted } from 'vue';
import api from '@/api';

const managerId = ref('');
const managerToken = ref('');
const middlewareUrl = ref('');
const accountBalance = ref(null);

// 获取 Manager Access Token
async function getManagerToken() {
  try {
    const response = await api.post(
      `/api/v1/mt-managers/${managerId.value}/access-token`
    );

    managerToken.value = response.data.accessToken;
    middlewareUrl.value = response.data.middlewareUrl;

    console.log('Got Manager Token:', {
      expiresIn: response.data.expiresIn,
      manager: response.data.manager
    });
  } catch (error) {
    console.error('Failed to get manager token:', error);
  }
}

// 使用 Token 调用中间件 API
async function getAccountBalance() {
  try {
    const response = await fetch(
      `${middlewareUrl.value}/api/v1/account/balance`,
      {
        headers: {
          'Authorization': `Bearer ${managerToken.value}`
        }
      }
    );

    accountBalance.value = await response.json();
  } catch (error) {
    console.error('Failed to get balance:', error);
  }
}

onMounted(() => {
  // 初始化时获取 Token
  if (managerId.value) {
    getManagerToken();
  }
});
</script>
```

### React 完整示例

```jsx
import { useState, useEffect, useCallback } from 'react';
import api from './api';

function useManagerToken(managerId) {
  const [token, setToken] = useState(null);
  const [middlewareUrl, setMiddlewareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchToken = useCallback(async () => {
    if (!managerId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.post(
        `/api/v1/mt-managers/${managerId}/access-token`
      );

      setToken(response.data.accessToken);
      setMiddlewareUrl(response.data.middlewareUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  return { token, middlewareUrl, loading, error, refresh: fetchToken };
}

// 使用示例
function TradingPanel({ managerId }) {
  const { token, middlewareUrl, loading, error } = useManagerToken(managerId);

  const getBalance = async () => {
    const response = await fetch(`${middlewareUrl}/api/v1/account/balance`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.json();
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <button onClick={getBalance}>Get Balance</button>
    </div>
  );
}
```

---

## 支持与反馈

如有迁移问题，请通过以下渠道联系：

- **技术文档**: `docs/api/tenant-api.md`
- **架构文档**: `MT5-middleware/docs/MULTI_TENANT_ARCHITECTURE.md`
- **Issue 跟踪**: GitHub Issues

---

**维护者**: MT5 Platform Team
**版本**: 1.0
**最后更新**: 2025-12-19
