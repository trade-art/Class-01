# Requirements Document: SaaS Multi-Tenant Architecture

## Introduction

本规范定义了 MT5 SaaS 平台的多租户架构升级需求。目标是将现有的单租户中间件改造为支持多租户隔离的企业级 SaaS 平台，包含故障隔离、租户路由、用户管理等核心能力。

**项目背景**：
- **MT5-middleware**: C++ Drogon 高性能中间件，当前为单租户模式
- **tenant-api**: NestJS 租户 API 服务，需要支持多租户认证和路由
- **tenant-console**: Vue3 前端应用，需要支持子域名和白标域名

**核心问题**：
1. 当前中间件连接池按 `server_id` 隔离，无法支持多租户
2. 某租户的 MT5 服务器故障可能影响其他租户
3. 缺少租户级别的熔断器和健康监控
4. 用户管理 API 尚未实现

**范围**：本规范涉及中间件多租户改造、熔断器增强、用户管理 API、前端租户识别等。

## Alignment with Product Vision

此功能是多租户 SaaS 平台的核心架构升级：
- 支持一个中间件实例服务多个租户（小租户共享）
- 支持大租户独立部署中间件实例
- 实现租户级别的故障隔离，防止单点故障扩散
- 提供完整的用户管理能力

---

## 模块一：多租户架构核心

### REQ-MT-1: 租户级别连接池隔离

**User Story:** 作为平台运维，我希望每个租户的 MT5 连接相互隔离，以便某租户服务器故障不会影响其他租户。

#### Acceptance Criteria

1. WHEN 中间件处理请求 THEN 系统 SHALL 使用 `tenant_id:server_id` 作为连接池 Key
2. WHEN 创建新连接 THEN 系统 SHALL 为该租户:服务器组合分配独立的连接池
3. WHEN 请求携带 JWT THEN 系统 SHALL 从 JWT 中提取 `tenant_id` 和 `server_id`
4. IF 连接池 Key 不存在 THEN 系统 SHALL 动态创建连接池（懒加载）

**技术规范**：
```cpp
// 连接池 Key 格式
std::string poolKey = tenantId + ":" + serverId;  // e.g., "tenant_a:main-server"

// JWT Payload 结构
{
  "sub": "user_login",
  "tenant_id": "uuid-tenant-id",
  "server_id": "main-server",
  "role": "user|admin|owner",
  "exp": 1234567890
}
```

---

### REQ-MT-2: 租户级别熔断器

**User Story:** 作为平台运维，我希望每个租户的 MT5 服务器有独立的熔断器，以便快速识别和隔离故障服务器。

#### Acceptance Criteria

1. WHEN 中间件初始化 THEN 系统 SHALL 为每个 `tenant_id:server_id` 创建独立熔断器
2. WHEN 某租户服务器连续失败 5 次 THEN 系统 SHALL 打开该租户的熔断器
3. WHEN 熔断器打开 THEN 系统 SHALL 快速返回 503 错误，不再尝试连接
4. WHEN 熔断器打开 30 秒后 THEN 系统 SHALL 进入半开状态，允许少量请求测试
5. IF 半开状态测试成功 THEN 系统 SHALL 关闭熔断器恢复正常

**熔断器配置**：
```json
{
  "circuit_breaker": {
    "failure_threshold": 5,
    "failure_rate_threshold": 0.5,
    "open_timeout_ms": 30000,
    "half_open_max_requests": 3
  }
}
```

---

### REQ-MT-3: 服务器健康状态监控

**User Story:** 作为平台运维，我希望实时查看每个租户服务器的健康状态，以便快速定位问题。

#### Acceptance Criteria

1. WHEN 调用 `GET /api/v1/health/servers` THEN 系统 SHALL 返回所有服务器健康状态
2. WHEN 返回健康状态 THEN 系统 SHALL 包含：状态(HEALTHY/DEGRADED/UNHEALTHY)、成功/失败次数、熔断器状态
3. WHEN 调用 `GET /api/v1/health/servers/{tenant_id}/{server_id}` THEN 系统 SHALL 返回指定服务器详情
4. WHEN 调用 `POST /api/v1/health/servers/{tenant_id}/{server_id}/reset` THEN 系统 SHALL 重置熔断器

**API 规范**：
```
GET /api/v1/health/servers

Response:
{
  "code": 0,
  "data": {
    "servers": {
      "tenant_a:main-server": {
        "status": "HEALTHY",
        "successCount": 1500,
        "failureCount": 2,
        "rejectedCount": 0,
        "circuitState": "CLOSED",
        "lastSuccessTime": "2024-12-05T10:00:00Z"
      },
      "tenant_b:main-server": {
        "status": "UNHEALTHY",
        "successCount": 100,
        "failureCount": 50,
        "rejectedCount": 200,
        "circuitState": "OPEN",
        "lastError": "Connection timeout"
      }
    }
  }
}
```

---

### REQ-MT-4: 动态租户配置加载

**User Story:** 作为平台运维，我希望中间件能从数据库动态加载租户的 MT5 服务器配置，以便无需重启即可添加新租户。

#### Acceptance Criteria

1. WHEN 中间件启动 THEN 系统 SHALL 从 SaaS 数据库加载所有活跃租户的 MT5 配置
2. WHEN SaaS 平台添加新租户服务器 THEN 系统 SHALL 通过配置更新机制通知中间件
3. WHEN 收到配置更新通知 THEN 系统 SHALL 动态创建新的连接池（无需重启）
4. IF 租户被禁用 THEN 系统 SHALL 清理该租户的所有连接和会话

**数据库表结构**：
```sql
-- 租户表
CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    code VARCHAR(50) UNIQUE,      -- 子域名标识: company-a
    name VARCHAR(255),
    custom_domain VARCHAR(255),   -- 白标域名: trade.company.com
    status VARCHAR(20),           -- active/suspended/deleted
    deployment_mode VARCHAR(20),  -- shared/dedicated
    middleware_url VARCHAR(255),  -- 专用中间件地址(dedicated模式)
    created_at TIMESTAMP
);

-- MT5服务器配置表
CREATE TABLE mt5_servers (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    server_id VARCHAR(50),
    display_name VARCHAR(100),
    address VARCHAR(255),
    manager_login BIGINT,
    manager_password_encrypted TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP
);
```

---

### REQ-MT-5: 请求超时保护

**User Story:** 作为平台运维，我希望每个 MT5 请求有严格的超时限制，以便防止长时间阻塞影响其他请求。

#### Acceptance Criteria

1. WHEN 发起 MT5 API 请求 THEN 系统 SHALL 设置最大超时时间 10 秒
2. IF 请求超时 THEN 系统 SHALL 返回 504 错误并记录失败
3. WHEN 请求超时 THEN 系统 SHALL 更新熔断器失败计数
4. WHEN 配置超时参数 THEN 系统 SHALL 支持按操作类型设置不同超时（读5秒，写10秒）

---

## 模块二：前端租户识别

### REQ-FE-1: 混合域名解析策略

**User Story:** 作为租户用户，我希望通过公司专属域名访问交易平台，以便获得品牌化的使用体验。

#### Acceptance Criteria

1. WHEN 用户访问 `{tenant_code}.yoursaas.com` THEN 前端 SHALL 从子域名解析 `tenant_code`
2. WHEN 用户访问白标域名 THEN 前端 SHALL 调用 API 查询对应的 `tenant_id`
3. WHEN 获取到 `tenant_id` THEN 前端 SHALL 调用租户配置 API 获取 MT5 服务器列表
4. IF 域名无法解析到租户 THEN 前端 SHALL 显示 "租户不存在" 错误页面

**前端解析逻辑**：
```typescript
// 混合解析策略
function resolveTenant(hostname: string): Promise<TenantInfo> {
  if (hostname.endsWith('.yoursaas.com')) {
    // 方案B: 子域名约定
    const tenantCode = hostname.split('.')[0];
    return api.get(`/tenant/by-code/${tenantCode}`);
  } else {
    // 方案A: 白标域名查询
    return api.get(`/tenant/by-domain/${hostname}`);
  }
}
```

---

### REQ-FE-2: 租户 API 端点

**User Story:** 作为前端应用，我需要通过 API 获取租户信息和 MT5 服务器列表。

#### Acceptance Criteria

1. WHEN 调用 `GET /api/tenant/by-code/{code}` THEN 系统 SHALL 返回租户基本信息
2. WHEN 调用 `GET /api/tenant/by-domain/{domain}` THEN 系统 SHALL 返回白标域名对应的租户信息
3. WHEN 返回租户信息 THEN 系统 SHALL 包含 `tenant_id`、`name`、`theme`、`mt5_servers` 列表

**API 规范**：
```
GET /api/tenant/by-code/company-a

Response:
{
  "code": 0,
  "data": {
    "tenant_id": "uuid-xxx",
    "name": "Company A Trading",
    "theme": {
      "primaryColor": "#1890ff",
      "logo": "https://..."
    },
    "mt5_servers": [
      {
        "server_id": "main-server",
        "display_name": "主服务器",
        "is_default": true
      },
      {
        "server_id": "demo-server",
        "display_name": "模拟服务器"
      }
    ]
  }
}
```

---

## 模块三：用户管理 API

> 以下需求合并自 middleware-user-management spec

### REQ-UM-1: 用户列表查询

**User Story:** 作为租户管理员，我希望获取所有 MT5 交易用户列表，以便查看和管理我的客户。

#### Acceptance Criteria

1. WHEN 调用 `GET /api/v1/account/users` THEN 系统 SHALL 返回当前租户的用户列表
2. WHEN 提供 `group` 参数 THEN 系统 SHALL 按组别筛选用户
3. WHEN 提供 `page` 和 `limit` 参数 THEN 系统 SHALL 返回对应页的用户数据
4. WHEN 提供 `keyword` 参数 THEN 系统 SHALL 按用户名或 login 模糊搜索
5. IF 用户数量超过 1000 THEN 系统 SHALL 使用流式分批获取

**API 规范**：
```
GET /api/v1/account/users?group=demo\\standard&page=1&limit=20

Headers:
  Authorization: Bearer <jwt_with_tenant_id>

Response:
{
  "code": 0,
  "data": {
    "users": [...],
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

---

### REQ-UM-2: 用户组列表

**User Story:** 作为租户管理员，我希望获取所有可用的用户组，以便在管理用户时选择正确的组别。

#### Acceptance Criteria

1. WHEN 调用 `GET /api/v1/account/groups` THEN 系统 SHALL 返回当前租户 MT5 服务器的所有用户组
2. WHEN 返回组信息 THEN 系统 SHALL 包含组名称、描述、默认杠杆等配置
3. IF MT5 服务器未连接或熔断器打开 THEN 系统 SHALL 返回 503 错误

---

### REQ-UM-3: 用户详情查询

**User Story:** 作为租户管理员，我希望查看单个用户的详细信息。

#### Acceptance Criteria

1. WHEN 调用 `GET /api/v1/account/users/{login}` THEN 系统 SHALL 返回该用户的完整信息
2. IF 用户不存在 THEN 系统 SHALL 返回 404 错误
3. WHEN 返回用户信息 THEN 系统 SHALL 包含基本信息、账户余额、保证金状态

---

### REQ-UM-4: 更新用户组别

**User Story:** 作为租户管理员，我希望能够变更用户的组别。

#### Acceptance Criteria

1. WHEN 调用 `PUT /api/v1/account/users/{login}/group` THEN 系统 SHALL 更新用户的组别
2. IF 目标组不存在 THEN 系统 SHALL 返回 400 错误
3. WHEN 更新成功 THEN 系统 SHALL 返回更新后的用户信息
4. WHEN 更新操作执行 THEN 系统 SHALL 记录审计日志

---

### REQ-UM-5: 更新用户杠杆

**User Story:** 作为租户管理员，我希望能够调整用户的杠杆倍数。

#### Acceptance Criteria

1. WHEN 调用 `PUT /api/v1/account/users/{login}/leverage` THEN 系统 SHALL 更新用户的杠杆
2. IF 杠杆值不在允许范围（1-1000）THEN 系统 SHALL 返回 400 错误
3. WHEN 更新成功 THEN 系统 SHALL 返回更新后的杠杆值

---

### REQ-UM-6: 更新用户状态

**User Story:** 作为租户管理员，我希望能够启用或禁用用户账户。

#### Acceptance Criteria

1. WHEN 调用 `PUT /api/v1/account/users/{login}/status` THEN 系统 SHALL 更新用户的启用状态
2. IF 用户有未平仓持仓且尝试禁用 THEN 系统 SHALL 返回警告但允许操作
3. WHEN 更新成功 THEN 系统 SHALL 返回更新后的状态

---

### REQ-UM-7: 用户持仓查询

**User Story:** 作为租户管理员，我希望查看特定用户的持仓列表。

#### Acceptance Criteria

1. WHEN 调用 `GET /api/v1/account/users/{login}/positions` THEN 系统 SHALL 返回该用户的所有持仓
2. WHEN 返回持仓 THEN 系统 SHALL 包含 symbol, volume, openPrice, currentPrice, profit

---

### REQ-UM-8: 用户交易历史查询

**User Story:** 作为租户管理员，我希望查看特定用户的交易历史。

#### Acceptance Criteria

1. WHEN 调用 `GET /api/v1/account/users/{login}/history` THEN 系统 SHALL 返回该用户的交易历史
2. WHEN 提供 `startDate` 和 `endDate` THEN 系统 SHALL 按时间范围筛选

---

## 模块四：混合部署支持

### REQ-DP-1: 部署模式配置

**User Story:** 作为平台运维，我希望能够为大租户配置独立的中间件实例。

#### Acceptance Criteria

1. WHEN 租户 `deployment_mode = 'dedicated'` THEN 系统 SHALL 路由请求到专用中间件
2. WHEN 租户 `deployment_mode = 'shared'` THEN 系统 SHALL 路由请求到共享中间件
3. WHEN 配置专用中间件 THEN 系统 SHALL 在租户记录中保存 `middleware_url`

---

### REQ-DP-2: API Gateway 租户路由

**User Story:** 作为平台架构，我需要 API Gateway 根据租户自动路由到正确的中间件实例。

#### Acceptance Criteria

1. WHEN API Gateway 收到请求 THEN 系统 SHALL 从 JWT 解析 `tenant_id`
2. WHEN 获取到 `tenant_id` THEN 系统 SHALL 查询租户路由表获取目标中间件地址
3. WHEN 转发请求 THEN 系统 SHALL 保持原始请求头和 JWT

---

## Non-Functional Requirements

### Code Architecture and Modularity
- **租户隔离原则**: 所有资源按 `tenant_id:server_id` 粒度隔离
- **单一职责**: ManagerSessionPool 负责连接管理，CircuitBreaker 负责熔断
- **清晰接口**: JWT 中的 `tenant_id` 是租户识别的唯一标准

### Performance
- 熔断器状态检查：< 1ms
- 连接池获取：< 5ms
- 用户列表查询（单页）：< 500ms
- 配置热更新：< 5s 生效

### Security
- Manager 凭证加密存储（AES-256）
- 租户间数据完全隔离
- 所有写操作需要 Admin 权限
- 审计日志记录关键操作

### Reliability
- 单租户故障不影响其他租户
- 熔断器快速失败，30秒自动恢复测试
- 连接池自动重连机制
- 优雅降级：熔断时返回明确错误

### Usability
- 健康状态 API 实时可查
- 错误消息包含租户和服务器标识
- 支持手动重置熔断器

---

## Out of Scope

以下功能不在本次实现范围内：
- 用户创建（开户）功能
- 用户删除功能
- 密码重置功能
- 前端完整的租户管理界面
- Kubernetes 自动扩缩容
- 多区域部署
