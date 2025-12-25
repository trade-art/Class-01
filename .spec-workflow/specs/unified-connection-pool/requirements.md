# Requirements Document: Unified Connection Pool

## Introduction

本功能旨在统一 MT5 中间件的连接池架构，解决当前系统中存在两套独立连接池（ManagerSessionPool 和 ManagerConnectionPool）导致的资源浪费和架构复杂性问题。

**核心价值：**
- 允许租户管理后台和第三方应用共用同一个 MT5 经理账号的连接
- 支持租户管理多个 MT 经理账号（跨多个中间件实例）
- 支持租户被分配多个中间件实例的场景
- 减少 MT5 服务器连接数，提升系统稳定性
- 简化认证架构，统一使用 `managerId` 作为连接池键

## Background / Problem Statement

### 当前系统架构

```
租户 (Tenant)
├── 中间件分配 (middleware_assignments) ── 关联多个中间件实例
│   ├── 中间件实例 A (Middleware)
│   └── 中间件实例 B (Middleware)
│
├── MT 服务器 (MtServer) ── 关联到某个中间件实例
│   ├── MT 服务器 1 → 中间件实例 A
│   └── MT 服务器 2 → 中间件实例 B
│
└── MT 经理账号 (MtManager) ── 关联到某个 MT 服务器
    ├── Manager 1 → MT 服务器 1
    ├── Manager 2 → MT 服务器 1
    └── Manager 3 → MT 服务器 2
```

### 当前架构问题

1. **双连接池架构**：
   - `ManagerSessionPool`：Service Token 模式使用，基于 session 的连接管理
   - `ManagerConnectionPool`：API Key Token 模式使用，基于 managerId 的连接管理

2. **资源浪费**：同一个 Manager 账号在两种模式下会创建独立的 MT5 连接

3. **场景冲突**：
   - 租户管理后台需要管理多个 Manager 账号（跨多个中间件实例）
   - 第三方应用使用 API Key 访问特定 Manager 账号
   - 两者可能访问同一个 Manager，但使用不同的连接

4. **Token 结构不一致**：
   - Service Token 包含 `encryptedPassword`，每次需要解密后连接
   - API Key Token 包含 `managerId`，使用预建立的连接池

### 目标场景

**场景一：租户管理后台使用流程**
1. 租户管理员使用账号密码登录后台（获得 JWT Token）
2. 查看分配给租户的中间件实例列表
3. 选择某个中间件实例，查看该实例下的 MT 服务器和 Manager 列表
4. 选择某个 Manager，获取该 Manager 的 Pool Mode Access Token
5. 使用 Access Token 调用中间件 API 查看数据/执行操作
6. 切换到另一个 Manager，重复步骤 4-5

**场景二：第三方应用使用流程（保持不变）**
1. 第三方应用使用 API Key ID + API Secret 调用认证端点
2. 系统返回 Access Token (15分钟有效) + Refresh Token (7天有效)
3. **Token 绑定到特定的 MT 经理账号**（一个 API Key 对应一个 Manager）
4. 使用 Access Token 调用中间件 API 执行交易操作
5. Access Token 过期后，使用 Refresh Token 获取新的 Token 对
6. Refresh Token 过期后，重新使用 API Key + Secret 认证

**关键区别：**
| 场景 | 认证方式 | Token 获取 | Manager 切换 |
|------|---------|-----------|-------------|
| 租户后台 | 账号密码登录 (JWT) | 可获取任意 Manager 的 Token | 支持动态切换 |
| 第三方应用 | API Key + Secret | 绑定特定 Manager | 不支持切换（需不同 API Key） |

## Requirements

### Requirement 1: 统一连接池管理

**User Story:** 作为系统架构师，我希望将两套连接池合并为一套，以便减少代码复杂性和资源消耗。

#### Acceptance Criteria

1. WHEN 任何认证模式的请求到达 THEN 系统 SHALL 使用统一的 `ManagerConnectionPool`（以 `managerId` 为键）
2. WHEN Service Token 请求到达 THEN 系统 SHALL 从 Token 中提取 `managerId` 并复用现有连接
3. IF 连接池中已存在该 `managerId` 的连接 THEN 系统 SHALL 复用该连接而非创建新连接
4. WHEN 连接空闲超过配置的超时时间 THEN 系统 SHALL 自动清理该连接

### Requirement 2: Service Token 结构升级

**User Story:** 作为后端开发者，我希望 Service Token 包含 `managerId`，以便与连接池架构对齐。

#### Acceptance Criteria

1. WHEN 生成 Service Token THEN 系统 SHALL 在 payload 中包含 `managerId` 字段
2. WHEN 生成 Service Token THEN 系统 SHALL 包含 `mode: "pool"` 标识
3. IF Token 包含 `mode: "pool"` THEN 系统 SHALL 使用 `managerId` 查找连接而非解密密码
4. WHEN 验证 Service Token THEN 系统 SHALL 同时支持新旧两种 Token 格式（向后兼容）

### Requirement 3: 租户后台多 Manager 支持

**User Story:** 作为租户管理员，我希望在后台切换不同的 MT 经理账号（可能跨多个中间件实例），以便管理和查看各个账号的数据。

#### Acceptance Criteria

1. WHEN 租户管理员查看中间件实例列表 THEN 系统 SHALL 返回所有分配给该租户的中间件实例
2. WHEN 租户管理员选择一个中间件实例 THEN 系统 SHALL 显示该实例下所有可用的 Manager 账号
3. WHEN 租户管理员选择一个 Manager 账号 THEN 系统 SHALL 生成该 Manager 的 Pool Mode Access Token
4. WHEN 使用 Pool Mode Access Token 调用 API THEN 系统 SHALL 使用对应 Manager 的连接
5. IF 租户管理员切换到另一个 Manager（同一或不同中间件实例）THEN 系统 SHALL 生成新 Manager 的 Token
6. WHEN 请求新 Manager 的 Token THEN 系统 SHALL 复用已有的 JWT 认证（无需重新登录）

### Requirement 4: 新增内部 Access Token 端点

**User Story:** 作为租户管理后台，我需要一个端点来获取指定 Manager 的 Pool Mode Access Token，以便调用中间件 API。

#### Acceptance Criteria

1. WHEN 调用 `POST /api/v1/mt-managers/{managerId}/access-token` THEN 系统 SHALL 返回该 Manager 的 Access Token
2. IF 请求的 Manager 不属于当前租户 THEN 系统 SHALL 返回 403 Forbidden
3. IF Manager 未激活或不存在 THEN 系统 SHALL 返回 404 Not Found
4. IF Manager 关联的 MT Server 未配置中间件实例 THEN 系统 SHALL 返回 400 Bad Request
5. WHEN 返回 Access Token THEN 系统 SHALL 包含以下信息：
   - accessToken: Pool Mode Access Token
   - expiresIn: Token 有效期（秒）
   - middlewareUrl: 对应中间件实例的 URL
   - manager: Manager 基本信息（id, login, serverName）
6. IF 用户角色不是 owner/admin/operator THEN 系统 SHALL 返回 403 Forbidden

### Requirement 5: 多中间件实例支持

**User Story:** 作为平台管理员，我希望租户可以被分配多个中间件实例，每个中间件实例独立管理其连接池。

#### Acceptance Criteria

1. WHEN 租户有多个中间件分配 THEN 系统 SHALL 允许在任意分配的中间件上操作
2. WHEN 生成 Access Token THEN 系统 SHALL 验证目标 Manager 的中间件属于租户分配范围
3. IF Manager 的中间件未分配给租户 THEN 系统 SHALL 返回 403 Forbidden
4. WHEN 查询 Manager 列表 THEN 系统 SHALL 支持按中间件实例 ID 筛选

### Requirement 6: C++ 中间件连接池统一

**User Story:** 作为 C++ 中间件开发者，我希望所有请求统一使用 `ManagerConnectionPool`，以便简化代码维护。

#### Acceptance Criteria

1. WHEN C++ 中间件收到任何类型的认证请求 THEN 系统 SHALL 统一使用 `ManagerConnectionPool`
2. WHEN Token 包含 `managerId` THEN 系统 SHALL 直接使用该 ID 查找连接
3. IF Token 为旧格式（包含 `encryptedPassword`）THEN 系统 SHALL 通过数据库查询获取 `managerId`
4. WHEN 连接池满载 THEN 系统 SHALL 按 LRU 策略淘汰最少使用的连接
5. WHEN 中间件启动时 THEN 系统 SHALL 从 Tenant API 获取该实例下所有启用的 Manager 并预建立连接

### Requirement 7: 第三方应用认证流程保持不变

**User Story:** 作为第三方应用开发者，我希望现有的 API Key 认证流程保持不变，以便无需修改现有集成代码。

#### Acceptance Criteria

1. WHEN 第三方应用使用 API Key + Secret 认证 THEN 系统 SHALL 返回 Access Token (15分钟) + Refresh Token (7天)
2. WHEN 生成 API Key Token THEN 系统 SHALL 将 Token 绑定到特定的 MT 经理账号
3. IF 第三方应用使用 Access Token 调用 API THEN 系统 SHALL 使用绑定的 Manager 连接
4. WHEN Access Token 过期 THEN 系统 SHALL 支持使用 Refresh Token 刷新
5. IF Refresh Token 过期 THEN 系统 SHALL 要求重新使用 API Key + Secret 认证
6. WHEN 第三方应用需要访问不同 Manager THEN 系统 SHALL 要求为该 Manager 生成独立的 API Key

### Requirement 8: 连接池共享机制

**User Story:** 作为系统架构师，我希望租户后台和第三方应用访问同一个 Manager 时能共享连接，以便减少资源消耗。

#### Acceptance Criteria

1. WHEN 租户后台和第三方应用访问同一个 Manager THEN 系统 SHALL 共享同一个 MT5 连接
2. WHEN 任一来源的 Token 请求到达 THEN 系统 SHALL 使用 `managerId` 查找统一连接池
3. IF 连接池中已存在该 Manager 的连接 THEN 系统 SHALL 复用而非新建
4. WHEN 所有使用该连接的 Token 都过期 THEN 系统 SHALL 保持连接在池中（直到空闲超时）

## Non-Functional Requirements

### Code Architecture and Modularity
- **Single Responsibility Principle**: Service Token Service 和 API Key Service 职责分离
- **Modular Design**: 连接池管理作为独立模块
- **Dependency Management**: Token 生成逻辑不依赖具体的连接池实现
- **Clear Interfaces**: 定义清晰的 Token Payload 接口

### Performance
- 连接池复用应减少 MT5 连接创建时间至少 80%
- 单个 Manager 的并发请求应共享同一连接
- Token 验证延迟应小于 10ms
- 中间件启动预连接时间应在 30 秒内完成（100 个 Manager 以内）

### Security
- Access Token 有效期应限制在 15 分钟以内
- Token 中不应包含明文密码
- Manager 访问应严格遵循租户隔离
- 中间件实例访问应验证租户分配关系
- 所有 Token 操作应记录审计日志

### Reliability
- 连接池应支持自动重连机制
- 连接异常时应优雅降级而非系统崩溃
- 向后兼容旧版 Token 格式至少 6 个月
- 中间件实例离线时应正确反馈状态

### Usability
- API 响应应包含清晰的错误信息
- Token 过期前应支持主动刷新
- 前端应无感知地处理 Token 切换
- 中间件实例状态应实时可见

## Out of Scope

- MT4 平台支持（仅限 MT5）
- 多实例中间件负载均衡（单 Manager 只能连一个中间件）
- Token 黑名单机制
- 实时 Token 撤销推送
- 跨中间件实例的 Manager 迁移

## Dependencies

- MT5 中间件 C++ 代码库
- Tenant API (NestJS)
- Prisma ORM / PostgreSQL
- JWT 签名密钥配置
- middleware_assignments 表结构

## Glossary

| Term | Definition |
|------|------------|
| Manager | MT5 Manager 账号，用于管理交易服务器 |
| Service Token | 租户后台使用的认证 Token |
| API Key Token | 第三方应用使用的认证 Token |
| Pool Mode | 使用预建立连接池的工作模式 |
| managerId | Manager 在平台数据库中的 UUID |
| middlewareId | 中间件实例在平台数据库中的 UUID |
| middleware_assignments | 租户与中间件实例的分配关系表 |

## API Summary

### 新增端点（租户后台专用）

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/v1/mt-managers/{managerId}/access-token` | POST | 获取指定 Manager 的 Pool Mode Access Token |

### 修改端点

| 端点 | 变更 |
|------|------|
| `POST /tenant/auth/service-token` | Token payload 增加 managerId 和 mode 字段 |

### 第三方应用端点（保持不变）

| 端点 | 方法 | 描述 |
|------|------|------|
| `POST /api/v1/mt-managers/api-key/authenticate` | POST | API Key + Secret 认证，返回 Access Token + Refresh Token |
| `POST /api/v1/mt-managers/api-key/refresh` | POST | 使用 Refresh Token 刷新 Access Token |

### 依赖现有端点

| 端点 | 用途 |
|------|------|
| `GET /api/v1/middleware-instances` | 获取租户分配的中间件实例列表 |
| `GET /api/v1/mt-managers` | 获取租户的 Manager 列表（支持按中间件筛选） |
| `GET /api/v1/mt-servers` | 获取租户的 MT 服务器列表 |
| `POST /api/v1/mt-managers/{managerId}/api-key` | 为 Manager 生成 API Key（第三方应用使用） |
| `DELETE /api/v1/mt-managers/{managerId}/api-key` | 撤销 Manager 的 API Key |
