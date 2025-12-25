# 第三方应用调用 C++ 中间件指南

## 概述

第三方应用通过 **Service Token** 认证方式调用 MT5 中间件 API。

## 完整调用流程

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              准备阶段 (一次性配置)                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. 租户管理员在 Platform Console 创建租户                                     │
│     └─> 获得 tenantId                                                        │
│                                                                              │
│  2. 租户管理员在 Tenant Console 配置 MT Server                                │
│     └─> 添加 MT5 服务器地址、Manager 账号密码                                  │
│     └─> 获得 serverId, managerLogin, managerPassword                         │
│                                                                              │
│  3. 平台分配中间件实例给租户                                                   │
│     └─> 获得 instanceId                                                      │
│                                                                              │
│  4. 第三方应用从租户处获取以下信息:                                            │
│     • tenantId (租户ID)                                                      │
│     • serverId (MT服务器ID)                                                  │
│     • instanceId (中间件实例ID)                                              │
│     • managerLogin (Manager账号)                                             │
│     • managerPassword (Manager密码)                                          │
│                                                                              │
│  5. 第三方应用配置加密密钥 (由平台管理员提供):                                  │
│     • SERVICE_TOKEN_JWT_SECRET (JWT签名密钥)                                  │
│     • SERVICE_TOKEN_ENCRYPTION_KEY (AES加密密钥)                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                              运行时调用流程                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐                              ┌─────────────────┐            │
│  │  第三方应用  │                              │   C++ 中间件     │            │
│  └──────┬──────┘                              └────────┬────────┘            │
│         │                                              │                     │
│         │  1. 本地生成 Service Token                    │                     │
│         │     (使用配置的密钥加密 Manager 密码)          │                     │
│         │                                              │                     │
│         │  2. 调用 API                                 │                     │
│         │  ─────────────────────────────────────────>  │                     │
│         │  Authorization: Bearer <token>               │                     │
│         │                                              │                     │
│         │                           3. 验证 JWT 签名    │                     │
│         │                           4. 解密 Manager 密码 │                     │
│         │                           5. 连接 MT5 执行操作 │                     │
│         │                                              │                     │
│         │  6. 返回结果                                  │                     │
│         │  <─────────────────────────────────────────  │                     │
│         │                                              │                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 密钥获取方式

### 方式一: 平台管理员提供 (推荐)

```
平台管理员提供以下配置:
├── SERVICE_TOKEN_JWT_SECRET    # JWT 签名密钥
├── SERVICE_TOKEN_ENCRYPTION_KEY # AES-256 加密密钥 (64位十六进制)
└── MIDDLEWARE_BASE_URL          # 中间件访问地址
```

### 方式二: 通过 Tenant API 获取 Token

如果不想自己生成 Token，可以调用 Tenant API:

```bash
# 登录 Tenant API 获取访问令牌
POST /tenant/auth/login
{
  "email": "admin@tenant.com",
  "password": "your-password"
}

# 使用访问令牌调用中间件代理端点
GET /tenant/middleware/symbols
Authorization: Bearer <tenant-api-token>
```

## Service Token 参数说明

| 参数 | 来源 | 说明 |
|------|------|------|
| `tenantId` | 租户创建时生成 | 租户唯一标识，如 `tenant-001` |
| `instanceId` | 中间件分配时生成 | 中间件实例ID，如 `inst_tenant-001_demo-server` |
| `serverId` | MT Server 配置时生成 | MT5服务器ID，如 `demo-mt5-server` |
| `managerLogin` | MT5 服务器配置 | Manager 账号，如 `10007` |
| `managerPassword` | MT5 服务器配置 | Manager 密码 (需要加密) |
| `scopes` | 权限配置 | 权限范围，如 `["*"]` 或 `["trading:read"]` |

## 加密密钥配置

### 中间件配置文件 (configs/config.json)

```json
{
  "auth": {
    "service_token": {
      "enabled": true,
      "jwt_secret": "your-jwt-secret-must-match",
      "encryption_key": "64位十六进制字符串",
      "issuer": "tenant-api"
    }
  }
}
```

### 第三方应用环境变量

```bash
# 必须与中间件配置完全一致
SERVICE_TOKEN_JWT_SECRET=your-jwt-secret-must-match
SERVICE_TOKEN_ENCRYPTION_KEY=438eca4f30898e7e7e565da15339702b1fc2e253e3ce1ac3aadd30f7173126d0
SERVICE_TOKEN_ISSUER=tenant-api

# 中间件地址
MIDDLEWARE_BASE_URL=http://middleware-host:8083
```

## 生成 Service Token

### Node.js 完整示例

```javascript
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class ServiceTokenGenerator {
  constructor(config) {
    this.jwtSecret = config.jwtSecret;
    this.encryptionKey = Buffer.from(config.encryptionKey, 'hex');
    this.issuer = config.issuer || 'tenant-api';

    if (this.encryptionKey.length !== 32) {
      throw new Error('加密密钥必须是32字节 (64位十六进制字符)');
    }
  }

  /**
   * 加密密码 (AES-256-GCM)
   * 格式: iv(12字节) + ciphertext + authTag(16字节)
   */
  encryptPassword(password) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(password, 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    // 重要: 顺序必须是 iv + ciphertext + authTag
    return Buffer.concat([iv, encrypted, authTag]).toString('base64');
  }

  /**
   * 生成 Service Token
   */
  generate(params) {
    const payload = {
      tenantId: params.tenantId,
      instanceId: params.instanceId,
      serverId: params.serverId,
      managerLogin: params.managerLogin,
      encryptedPassword: this.encryptPassword(params.managerPassword),
      scopes: params.scopes || ['*']
    };

    return jwt.sign(payload, this.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: params.expiresIn || 3600,
      issuer: this.issuer,
      header: { alg: 'HS256', typ: 'JWT' }  // typ: 'JWT' 必须包含
    });
  }
}

// 使用示例
const generator = new ServiceTokenGenerator({
  jwtSecret: process.env.SERVICE_TOKEN_JWT_SECRET,
  encryptionKey: process.env.SERVICE_TOKEN_ENCRYPTION_KEY,
  issuer: 'tenant-api'
});

const token = generator.generate({
  tenantId: 'tenant-001',
  instanceId: 'inst_tenant-001_demo-server',
  serverId: 'demo-mt5-server',
  managerLogin: 10007,
  managerPassword: 'your-manager-password',
  scopes: ['*'],
  expiresIn: 3600  // 1小时
});

console.log('Service Token:', token);
```

### Python 示例

```python
import jwt
import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from datetime import datetime, timedelta

class ServiceTokenGenerator:
    def __init__(self, jwt_secret: str, encryption_key: str, issuer: str = 'tenant-api'):
        self.jwt_secret = jwt_secret
        self.encryption_key = bytes.fromhex(encryption_key)
        self.issuer = issuer

        if len(self.encryption_key) != 32:
            raise ValueError('加密密钥必须是32字节')

    def encrypt_password(self, password: str) -> str:
        """加密密码 (AES-256-GCM)"""
        iv = os.urandom(12)
        aesgcm = AESGCM(self.encryption_key)
        ciphertext_with_tag = aesgcm.encrypt(iv, password.encode('utf-8'), None)

        # ciphertext_with_tag 包含 ciphertext + tag
        # 格式: iv + ciphertext + tag
        combined = iv + ciphertext_with_tag
        return base64.b64encode(combined).decode('ascii')

    def generate(self, tenant_id: str, instance_id: str, server_id: str,
                 manager_login: int, manager_password: str,
                 scopes: list = None, expires_in: int = 3600) -> str:
        """生成 Service Token"""
        now = datetime.utcnow()

        payload = {
            'tenantId': tenant_id,
            'instanceId': instance_id,
            'serverId': server_id,
            'managerLogin': manager_login,
            'encryptedPassword': self.encrypt_password(manager_password),
            'scopes': scopes or ['*'],
            'iat': now,
            'exp': now + timedelta(seconds=expires_in),
            'iss': self.issuer
        }

        return jwt.encode(
            payload,
            self.jwt_secret,
            algorithm='HS256',
            headers={'alg': 'HS256', 'typ': 'JWT'}
        )

# 使用示例
generator = ServiceTokenGenerator(
    jwt_secret=os.environ['SERVICE_TOKEN_JWT_SECRET'],
    encryption_key=os.environ['SERVICE_TOKEN_ENCRYPTION_KEY']
)

token = generator.generate(
    tenant_id='tenant-001',
    instance_id='inst_tenant-001_demo-server',
    server_id='demo-mt5-server',
    manager_login=10007,
    manager_password='your-password'
)
```

## 调用 API

### cURL 示例

```bash
# 设置 Token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 获取品种列表
curl -X GET "http://localhost:8083/api/v1/symbols" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# 获取账户信息
curl -X GET "http://localhost:8083/api/v1/account/info" \
  -H "Authorization: Bearer $TOKEN"

# 获取持仓
curl -X GET "http://localhost:8083/api/v1/account/positions" \
  -H "Authorization: Bearer $TOKEN"
```

### JavaScript/Axios 示例

```javascript
const axios = require('axios');

class MiddlewareClient {
  constructor(baseUrl, token) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // 错误处理
    this.client.interceptors.response.use(
      response => response.data,
      error => {
        if (error.response?.status === 401) {
          throw new Error('Token 无效或已过期，请重新生成');
        }
        throw error;
      }
    );
  }

  // 市场数据
  async getSymbols() {
    return this.client.get('/api/v1/symbols');
  }

  async getQuote(symbol) {
    return this.client.get(`/api/v1/symbols/${symbol}/quote`);
  }

  // 账户信息
  async getAccountInfo() {
    return this.client.get('/api/v1/account/info');
  }

  async getBalance() {
    return this.client.get('/api/v1/account/balance');
  }

  async getPositions() {
    return this.client.get('/api/v1/account/positions');
  }

  async getOrders() {
    return this.client.get('/api/v1/account/orders');
  }

  async getHistory() {
    return this.client.get('/api/v1/account/history');
  }
}

// 使用示例
async function main() {
  const token = generator.generate({...});
  const client = new MiddlewareClient('http://localhost:8083', token);

  try {
    const symbols = await client.getSymbols();
    console.log('品种列表:', symbols);

    const account = await client.getAccountInfo();
    console.log('账户信息:', account);
  } catch (error) {
    console.error('API 调用失败:', error.message);
  }
}
```

## 可用端点列表

### 市场数据 (无需 MT5 登录)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/symbols` | GET | 获取所有品种列表 |
| `/api/v1/symbols/groups` | GET | 获取品种分组 |
| `/api/v1/symbols/{symbol}` | GET | 获取单个品种详情 |
| `/api/v1/symbols/{symbol}/quote` | GET | 获取品种实时报价 |
| `/api/v1/symbols/group/{group}` | GET | 获取指定分组的品种 |

### 账户操作

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/account/info` | GET | 获取账户基本信息 |
| `/api/v1/account/balance` | GET | 获取账户余额 |
| `/api/v1/account/positions` | GET | 获取当前持仓 |
| `/api/v1/account/orders` | GET | 获取挂单列表 |
| `/api/v1/account/history` | GET | 获取历史订单 |

### 健康检查

| 端点 | 方法 | 需要认证 | 说明 |
|------|------|----------|------|
| `/health` | GET | 否 | 基础健康检查 |
| `/api/v1/health` | GET | 否 | API 健康检查 |
| `/api/v1/health/detailed` | GET | 是 | 详细健康状态 |

## 错误处理

### 错误码对照表

| 错误码 | HTTP | 说明 | 处理建议 |
|--------|------|------|----------|
| `AUTH_TOKEN_MISSING` | 401 | 缺少 Authorization 头 | 添加 Bearer Token |
| `AUTH_TOKEN_INVALID` | 401 | Token 签名验证失败 | 检查 JWT Secret 是否一致 |
| `AUTH_TOKEN_EXPIRED` | 401 | Token 已过期 | 重新生成 Token |
| `PASSWORD_DECRYPTION_FAILED` | 401 | 密码解密失败 | 检查加密密钥和格式 |
| `INSUFFICIENT_PERMISSIONS` | 403 | 权限不足 | 检查 scopes 配置 |
| `SERVICE_UNAVAILABLE` | 503 | MT5 服务不可用 | 检查 MT5 服务器连接 |

### 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "AUTH_TOKEN_INVALID",
    "message": "Token 验证失败",
    "detail": "Signature verification failed"
  },
  "timestamp": 1766146495000
}
```

## 常见问题

### Q: Token 验证失败 (Signature verification failed)

**原因**: JWT Secret 不匹配

**解决**: 确保 `SERVICE_TOKEN_JWT_SECRET` 与中间件配置完全一致

### Q: 密码解密失败 (Password decryption failed)

**原因**: 加密格式或密钥不正确

**检查项**:
1. `SERVICE_TOKEN_ENCRYPTION_KEY` 是否与中间件一致
2. 加密格式是否为 `iv + ciphertext + authTag` (不是 `iv + authTag + ciphertext`)

### Q: MT5 service unavailable

**原因**: 中间件无法连接 MT5 服务器

**检查项**:
1. MT5 服务器地址是否正确
2. Manager 账号密码是否正确
3. 网络是否可达

### Q: claim not found

**原因**: JWT 头部缺少 `typ: 'JWT'`

**解决**: 生成 Token 时添加 `header: { alg: 'HS256', typ: 'JWT' }`

## 安全建议

1. **密钥保护**: 不要在代码中硬编码密钥，使用环境变量
2. **Token 缓存**: Token 有效期内可复用，避免频繁生成
3. **权限最小化**: scopes 只申请必要的权限
4. **HTTPS**: 生产环境必须使用 HTTPS
5. **日志脱敏**: 不要在日志中记录完整 Token 或密码
