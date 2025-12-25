# 需求文档: Middleware Auth Refactor (中间件认证架构重构)

## 简介

本文档定义 MT5 Middleware 认证架构的重构需求。当前中间件使用传统的登录端点 (`/api/v1/auth/admin/login`) 进行认证，但由于 MT5 Manager 凭据已存储在 Tenant API 数据库中，这种方式存在冗余。

**重构目标**:
1. **服务间通信**: Tenant API 生成 Service Token，中间件验证后直接使用
2. **第三方直连**: 支持外部应用（高频交易系统）通过 API Key 直接调用中间件

**价值**:
- 简化认证流程，减少网络请求
- 统一凭据管理，避免敏感信息多处传输
- 支持多种接入场景（内部服务 + 外部应用）

## 与产品愿景的对齐

本功能支持:
- SaaS 平台多租户架构的安全性要求
- 第三方系统集成的开放性需求
- 高频交易场景的低延迟要求

## 背景分析

### 当前认证流程（存在的问题）

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Tenant API     │     │   C++ 中间件     │     │   MT5 Server    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ 1. POST /auth/admin/login                     │
         │   (login: 10007, password: xxx)               │
         │ ──────────────────────>│                       │
         │                       │ 2. 验证凭据            │
         │                       │ ──────────────────────>│
         │<────────────────────── │                       │
         │   返回 JWT token       │                       │
         │                       │                       │
         │ 3. GET /api/v1/users  │                       │
         │   (Bearer token)      │                       │
         │ ──────────────────────>│                       │
```

**问题**:
1. MT5 凭据已存储在 Tenant API 数据库，每次请求还需要"登录"是冗余的
2. 登录端点暴露了认证攻击面
3. 不支持第三方应用直接接入

### 目标架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        安全边界                                  │
│                                                                  │
│  ┌──────────────┐                  ┌──────────────┐             │
│  │  Tenant API  │  Service Token   │  C++ 中间件   │             │
│  │   (3200)     │ ────────────────>│   (8083)     │             │
│  └──────────────┘                  └──────┬───────┘             │
│                                           │                      │
│  ┌──────────────┐                         │                      │
│  │  第三方应用   │  API Key               │                      │
│  │  (高频交易)   │ ───────────────────────┘                      │
│  └──────────────┘                                                │
│                                                                  │
│  认证方式:                                                        │
│  1. Service Token - 内部服务间通信（Tenant API → 中间件）         │
│  2. API Key - 外部应用直连（第三方交易系统 → 中间件）              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 第一部分: Service Token 认证（内部服务间）

### REQ-ST1: Tenant API 生成 Service Token

**用户故事:** 作为 Tenant API，我需要生成包含租户和 MT5 凭据信息的 Service Token，以便中间件验证后直接连接 MT5 服务器。

#### 验收标准

##### ST1.1 Token 生成

1. Tenant API 生成 JWT Service Token，包含以下 Payload:
   ```json
   {
     "type": "service",
     "iss": "tenant-api",
     "sub": "tenant:{tenantId}",
     "tenantId": "uuid",
     "serverId": "demo-mt5-server",
     "serverAddress": "192.250.228.240:1950",
     "managerLogin": 10007,
     "managerPassword": "encrypted_password",
     "iat": 1704067200,
     "exp": 1704070800
   }
   ```
2. Token 使用 HS256 或 RS256 签名
3. 敏感字段（managerPassword）使用 AES-256-GCM 加密后再放入 Token
4. Token 有效期可配置（默认 1 小时）

##### ST1.2 Token 刷新策略

1. Token 过期前 5 分钟自动刷新
2. 刷新时重新从数据库读取最新凭据
3. 刷新失败不影响现有请求（使用旧 Token 直到过期）

##### ST1.3 密钥管理

1. 签名密钥从环境变量或配置文件读取
2. 支持密钥轮换（双密钥验证期）
3. 加密密钥与签名密钥分离

### REQ-ST2: 中间件验证 Service Token

**用户故事:** 作为 C++ 中间件，我需要验证来自 Tenant API 的 Service Token，提取凭据并建立 MT5 连接。

#### 验收标准

##### ST2.1 Token 验证

1. 从 `Authorization: Bearer <token>` 头提取 Token
2. 验证 Token 签名（使用共享密钥或公钥）
3. 验证 Token 未过期
4. 验证 `type` 字段为 `"service"`
5. 验证 `iss` 字段为 `"tenant-api"`

##### ST2.2 凭据提取与连接

1. 从 Token 解密 `managerPassword`
2. 使用 `serverAddress` + `managerLogin` + `managerPassword` 建立 MT5 连接
3. 按 `tenantId:serverId` 缓存 MT5 会话
4. 会话复用：相同 tenant+server 的请求复用已有连接

##### ST2.3 错误处理

1. Token 无效返回 `401 Unauthorized`:
   ```json
   {
     "success": false,
     "error": "Invalid service token",
     "code": "AUTH_INVALID_TOKEN"
   }
   ```
2. Token 过期返回 `401 Unauthorized`:
   ```json
   {
     "success": false,
     "error": "Service token expired",
     "code": "AUTH_TOKEN_EXPIRED"
   }
   ```
3. MT5 连接失败返回 `503 Service Unavailable`:
   ```json
   {
     "success": false,
     "error": "Failed to connect MT5 server",
     "code": "MT5_CONNECTION_FAILED"
   }
   ```

---

## 第二部分: API Key 认证（外部应用直连）

### REQ-AK1: API Key 管理

**用户故事:** 作为租户管理员，我需要在租户控制台创建和管理 API Key，供第三方应用直接调用中间件。

#### 验收标准

##### AK1.1 API Key 生成

1. 租户控制台支持创建 API Key:
   - 名称（用于识别用途）
   - 权限范围（scopes）
   - 过期时间（可选）
   - IP 白名单（可选）
2. API Key 格式: `mt5_{tenantId}_{randomString}`
3. Key 只在创建时显示一次，之后只显示前缀
4. Key 的 SHA-256 哈希存储到数据库

##### AK1.2 权限范围（Scopes）

1. 支持以下权限范围:
   - `trading:read` - 读取交易数据（持仓、订单、历史）
   - `trading:write` - 执行交易操作（开仓、平仓、修改）
   - `account:read` - 读取账户信息
   - `account:write` - 修改账户信息
   - `market:read` - 读取市场数据（报价、品种）
   - `admin:*` - 管理员权限（仅限租户 Owner）
2. 创建 Key 时必须指定至少一个 scope
3. API 调用时验证 scope 是否匹配

##### AK1.3 API Key 管理操作

1. 列出所有 API Key（不显示完整 Key）
2. 撤销 API Key（立即生效）
3. 更新 API Key 信息（名称、IP 白名单）
4. 查看 API Key 使用统计

### REQ-AK2: 中间件验证 API Key

**用户故事:** 作为 C++ 中间件，我需要验证第三方应用的 API Key，并根据权限控制访问。

#### 验收标准

##### AK2.1 API Key 验证流程

1. 从 `X-API-Key` 头提取 API Key
2. 计算 Key 的 SHA-256 哈希
3. 查询 Redis 缓存或调用 Tenant API 验证:
   ```
   GET /internal/api-keys/validate?keyHash={hash}
   ```
4. 验证响应包含:
   - 租户信息（tenantId, serverId）
   - 权限范围（scopes）
   - 有效性（isActive, expiresAt）
   - IP 白名单（allowedIps）

##### AK2.2 API Key 缓存

1. 验证结果缓存到中间件内存（TTL 5 分钟）
2. 缓存 Key: `apikey:{hash_prefix}`
3. 撤销 Key 时通过 Webhook 通知中间件清除缓存

##### AK2.3 权限检查

1. 每个 API 端点定义所需 scope:
   ```cpp
   // 示例
   GET  /api/v1/account/positions  -> requires: trading:read
   POST /api/v1/trading/order      -> requires: trading:write
   GET  /api/v1/account/users      -> requires: account:read
   ```
2. 请求的 scope 不足时返回 `403 Forbidden`:
   ```json
   {
     "success": false,
     "error": "Insufficient permissions",
     "code": "AUTH_INSUFFICIENT_SCOPE",
     "required": ["trading:write"],
     "provided": ["trading:read"]
   }
   ```

##### AK2.4 IP 白名单验证

1. 如果 API Key 配置了 IP 白名单，验证请求来源 IP
2. IP 不在白名单时返回 `403 Forbidden`
3. 支持 CIDR 格式（如 `192.168.1.0/24`）

##### AK2.5 使用统计

1. 记录 API Key 调用次数
2. 记录最后使用时间
3. 统计数据异步上报到 Tenant API

---

## 第三部分: 认证端点重构

### REQ-EP1: 废弃旧登录端点

**用户故事:** 作为系统维护者，我需要逐步废弃旧的登录端点，平滑迁移到新认证方式。

#### 验收标准

##### EP1.1 废弃计划

1. Phase 1（当前版本）:
   - 新增 Service Token 和 API Key 认证
   - 旧端点标记为 Deprecated
   - 旧端点调用记录警告日志
2. Phase 2（下一版本）:
   - 旧端点返回 `410 Gone`
   - 提供迁移指南

##### EP1.2 废弃的端点

1. `POST /api/v1/auth/admin/login` - 管理员登录
2. `POST /api/v1/auth/login` - 用户登录（如果仅用于内部）
3. `POST /api/v1/auth/refresh` - Token 刷新

##### EP1.3 保留的端点

1. `GET /health` - 健康检查（无需认证）
2. `GET /api/v1/server/info` - 服务器信息（无需认证）

### REQ-EP2: 新认证中间件

**用户故事:** 作为 C++ 中间件，我需要统一的认证中间件来处理多种认证方式。

#### 验收标准

##### EP2.1 认证优先级

1. 认证检查顺序:
   ```
   1. 检查 Authorization: Bearer <token> → Service Token 验证
   2. 检查 X-API-Key: <key> → API Key 验证
   3. 都没有 → 401 Unauthorized
   ```
2. 两种认证方式互斥，不能同时使用

##### EP2.2 豁免路径

1. 以下路径免认证:
   - `GET /health`
   - `GET /api/v1/server/info`
   - `GET /` (API 信息页)
2. 其他所有路径需要认证

##### EP2.3 认证上下文

1. 认证成功后设置请求上下文:
   ```cpp
   struct AuthContext {
     AuthType type;           // SERVICE_TOKEN 或 API_KEY
     std::string tenantId;
     std::string serverId;
     std::vector<std::string> scopes;
     std::string clientIp;
   };
   ```
2. 后续处理器可从上下文获取租户信息

---

## 第四部分: Tenant API 改动

### REQ-TA1: Service Token 生成服务

**用户故事:** 作为 Tenant API，我需要生成和管理 Service Token。

#### 验收标准

##### TA1.1 Token 服务

1. 新增 `ServiceTokenService`:
   - `generateToken(tenantId, serverId): string`
   - `refreshToken(oldToken): string`
   - `validateToken(token): TokenPayload | null`
2. Token 生成时从数据库读取 MT5 凭据
3. 凭据加密后放入 Token

##### TA1.2 中间件调用重构

1. `MiddlewareAuthService` 重构:
   - 移除 `login()` 方法
   - 新增 `getServiceToken()` 方法
   - 请求中间件时使用 Service Token
2. 向后兼容：保留旧方法但标记 Deprecated

### REQ-TA2: API Key 管理服务

**用户故事:** 作为 Tenant API，我需要提供 API Key 的 CRUD 操作。

#### 验收标准

##### TA2.1 数据模型

1. 扩展 `api_keys` 表:
   ```sql
   ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scopes TEXT[];
   ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS allowed_ips TEXT[];
   ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP;
   ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS usage_count BIGINT DEFAULT 0;
   ```

##### TA2.2 API Key CRUD

1. `POST /tenant/api-keys` - 创建 API Key
2. `GET /tenant/api-keys` - 列出 API Keys
3. `GET /tenant/api-keys/:id` - 获取 API Key 详情
4. `PATCH /tenant/api-keys/:id` - 更新 API Key
5. `DELETE /tenant/api-keys/:id` - 撤销 API Key

##### TA2.3 内部验证端点

1. `GET /internal/api-keys/validate` - 供中间件验证 API Key
2. 此端点仅允许内部调用（IP 白名单或服务密钥）

### REQ-TA3: API Key 撤销通知

**用户故事:** 作为系统，我需要在 API Key 撤销时通知中间件清除缓存。

#### 验收标准

##### TA3.1 Webhook 通知

1. API Key 撤销时发送 Webhook 到中间件:
   ```json
   {
     "event": "api_key_revoked",
     "data": {
       "keyHashPrefix": "abc123...",
       "tenantId": "uuid",
       "revokedAt": "2025-01-01T00:00:00Z"
     }
   }
   ```
2. 中间件收到通知后清除对应缓存

---

## 第五部分: 租户控制台改动

### REQ-TC1: API Key 管理界面

**用户故事:** 作为租户管理员，我需要在控制台管理 API Key。

#### 验收标准

##### TC1.1 API Key 列表页

1. 显示所有 API Key:
   - 名称
   - Key 前缀（如 `mt5_xxx...`）
   - 权限范围
   - 创建时间
   - 最后使用时间
   - 状态（活跃/已撤销）
2. 支持搜索和筛选

##### TC1.2 创建 API Key

1. 创建表单:
   - 名称（必填）
   - 权限范围（多选）
   - 过期时间（可选）
   - IP 白名单（可选，多行输入）
2. 创建成功后显示完整 Key（只显示一次）
3. 提供复制按钮

##### TC1.3 API Key 详情

1. 显示 Key 详情和使用统计
2. 支持更新名称和 IP 白名单
3. 支持撤销 Key（需二次确认）

---

## 非功能性需求

### 代码架构和模块化

- **单一职责原则**: 认证逻辑独立为中间件，与业务逻辑分离
- **模块化设计**: Service Token 和 API Key 验证器可独立测试
- **依赖管理**: 使用依赖注入，便于单元测试
- **清晰接口**: 定义明确的认证上下文接口

### 性能要求

- Service Token 验证 < 1ms（仅签名验证）
- API Key 验证 < 10ms（缓存命中）
- API Key 验证 < 100ms（缓存未命中，需调用 Tenant API）
- 认证中间件不应成为性能瓶颈

### 安全要求

- MT5 Manager 密码在 Token 中加密存储（AES-256-GCM）
- API Key 使用 SHA-256 哈希存储，不存储明文
- 签名密钥支持轮换
- 所有认证失败记录审计日志
- 支持 IP 白名单限制
- 防止时序攻击（使用常量时间比较）

### 可靠性要求

- 认证服务 99.9% 可用
- 缓存失效时可降级到实时验证
- 密钥轮换期间不中断服务

### 可观测性要求

- 记录所有认证尝试（成功/失败）
- 记录 API Key 使用统计
- 提供认证相关的 Prometheus 指标
- 支持分布式追踪

---

## API 接口设计

### 中间件认证相关

```
# 豁免认证的端点
GET  /health                        # 健康检查
GET  /api/v1/server/info           # 服务器信息

# 需要认证的端点（Service Token 或 API Key）
GET  /api/v1/account/users         # scope: account:read
GET  /api/v1/account/positions     # scope: trading:read
POST /api/v1/trading/order         # scope: trading:write
...
```

### Tenant API - API Key 管理

```
# 租户管理员调用
POST   /tenant/api-keys            # 创建 API Key
GET    /tenant/api-keys            # 列出 API Keys
GET    /tenant/api-keys/:id        # 获取详情
PATCH  /tenant/api-keys/:id        # 更新
DELETE /tenant/api-keys/:id        # 撤销

# 内部调用（中间件验证用）
GET    /internal/api-keys/validate?keyHash={hash}
```

### Webhook 事件

```
# 中间件接收
POST /api/v1/webhooks/platform
  Event: api_key_revoked
  Body: { keyHashPrefix, tenantId, revokedAt }
```

---

## 迁移计划

### Phase 1: 新增认证方式（当前）

1. 中间件新增 Service Token 验证
2. 中间件新增 API Key 验证
3. Tenant API 新增 Service Token 生成
4. Tenant API 新增 API Key 管理
5. 旧登录端点标记 Deprecated

### Phase 2: 切换内部调用

1. Tenant API 切换到 Service Token 方式调用中间件
2. 验证功能正常
3. 移除旧的登录调用逻辑

### Phase 3: 废弃旧端点

1. 旧登录端点返回 410 Gone
2. 更新文档
3. 通知相关方

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 密钥泄露 | 高 | 密钥轮换机制、审计日志、IP 白名单 |
| 认证服务不可用 | 高 | 缓存降级、健康检查、告警 |
| 迁移期间兼容性问题 | 中 | 分阶段迁移、保留旧端点过渡期 |
| Token 被重放 | 中 | 短过期时间、nonce 机制（可选） |
