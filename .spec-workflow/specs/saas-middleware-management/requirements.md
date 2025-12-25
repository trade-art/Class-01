# Requirements Document: SaaS Middleware Management

## Introduction

本功能重构 MT5 服务器和中间件的管理架构，将管理权限从租户层面提升到 SaaS 平台层面。SaaS 管理员负责：
1. 管理中间件实例（添加、监控、分配）
2. 为租户配置 MT5 服务器连接信息
3. 分配中间件给租户（支持共享和独占模式）

中间件通过安全的服务间认证从 platform-service 获取其负责的租户配置，实现动态配置而非硬编码。

## Business Context

### 当前问题
- MT5 服务器配置由租户自行管理，存在安全风险
- 中间件配置硬编码，无法动态管理
- 无法监控中间件健康状态
- 无法实现中间件资源的灵活分配（共享/独占）

### 目标架构
- SaaS 管理员集中管理所有 MT5 连接信息
- 中间件动态从 platform-service 获取配置
- 支持中间件健康监控和状态展示
- 支持灵活的中间件分配策略

---

## Requirements

### R1: 中间件实例管理

**User Story:** As a SaaS administrator, I want to manage middleware instances centrally, so that I can monitor and allocate resources effectively.

#### Acceptance Criteria

1. WHEN SaaS admin adds a middleware instance THEN system SHALL store middleware info (name, URL, API key, description)
2. WHEN SaaS admin views middleware list THEN system SHALL display all middleware instances with their status
3. WHEN SaaS admin edits middleware instance THEN system SHALL update the middleware configuration
4. WHEN SaaS admin deletes middleware instance THEN system SHALL check for tenant dependencies and warn/prevent if assigned
5. IF middleware has no assigned tenants THEN system SHALL allow deletion
6. WHEN middleware is added THEN system SHALL generate a unique API key for service authentication

---

### R2: 中间件健康监控

**User Story:** As a SaaS administrator, I want to monitor middleware health status, so that I can ensure system reliability.

#### Acceptance Criteria

1. WHEN SaaS admin views middleware detail page THEN system SHALL display:
   - Connection status (online/offline)
   - Server IP address
   - Last heartbeat time
   - Active sessions count
   - Cache status (Redis connection, cache hit rate)
   - Memory usage
   - CPU usage (if available)
2. WHEN middleware health check fails THEN system SHALL mark middleware as offline
3. WHEN middleware reconnects THEN system SHALL update status to online
4. IF middleware is offline for more than 5 minutes THEN system SHALL send alert notification

---

### R3: MT5 服务器配置管理（租户级别）

**User Story:** As a SaaS administrator, I want to configure MT5 server connections for each tenant, so that tenants don't need to manage sensitive credentials.

#### Acceptance Criteria

1. WHEN SaaS admin configures MT5 server for a tenant THEN system SHALL store:
   - Server address (IP:Port)
   - Manager login
   - Manager password (encrypted)
   - Display name
   - Platform type (MT5/MT4)
2. WHEN SaaS admin views tenant's MT5 config THEN system SHALL display server info (password masked)
3. WHEN SaaS admin updates MT5 config THEN system SHALL encrypt and store new credentials
4. WHEN MT5 config is updated THEN system SHALL notify assigned middleware to refresh configuration
5. IF tenant has no MT5 config THEN system SHALL prevent middleware assignment

---

### R4: 中间件分配策略

**User Story:** As a SaaS administrator, I want to assign middleware instances to tenants flexibly, so that I can optimize resource usage.

#### Acceptance Criteria

1. WHEN SaaS admin assigns middleware to tenant THEN system SHALL support two modes:
   - Shared mode: Multiple small tenants share one middleware
   - Dedicated mode: Large tenant has exclusive middleware
2. WHEN assigning shared middleware THEN system SHALL check capacity limits
3. WHEN assigning dedicated middleware THEN system SHALL mark middleware as exclusive
4. WHEN middleware assignment changes THEN system SHALL notify both old and new middleware
5. IF tenant has no assigned middleware THEN system SHALL display warning in tenant management
6. WHEN viewing middleware detail THEN system SHALL list all assigned tenants

---

### R5: 中间件配置拉取 API

**User Story:** As a middleware service, I want to securely fetch my assigned tenant configurations, so that I can connect to MT5 servers dynamically.

#### Acceptance Criteria

1. WHEN middleware requests configuration THEN system SHALL require API key authentication
2. IF API key is valid THEN system SHALL return only configurations for tenants assigned to this middleware
3. WHEN middleware fetches config THEN system SHALL return:
   - Tenant ID
   - MT5 server address
   - Manager login
   - Manager password (decrypted for middleware use)
   - Platform type
4. IF API key is invalid THEN system SHALL return 401 Unauthorized
5. WHEN tenant config is updated THEN middleware SHALL be able to poll for changes
6. IF middleware is not assigned any tenants THEN system SHALL return empty configuration list

---

### R6: 租户控制台权限调整

**User Story:** As a tenant administrator, I want to view my MT5 server configuration (read-only), so that I know which server I'm connected to.

#### Acceptance Criteria

1. WHEN tenant admin views MT5 server page THEN system SHALL display server info in read-only mode
2. WHEN tenant admin views MT5 server page THEN system SHALL NOT show edit/add/delete buttons
3. WHEN tenant has no MT5 config THEN system SHALL display message "Please contact SaaS administrator to configure MT5 server"
4. IF tenant tries to call MT5 management API THEN system SHALL return 403 Forbidden

---

## Non-Functional Requirements

### Code Architecture and Modularity
- **Single Responsibility Principle**: Middleware management, MT5 config, and assignment should be separate modules
- **Modular Design**: New middleware monitor page should be a standalone module
- **Dependency Management**: Middleware service should not depend on tenant-api internals
- **Clear Interfaces**: Define clean API contracts between platform-service and middleware

### Performance
- Middleware health check should respond within 5 seconds
- Configuration fetch API should respond within 1 second
- Health status should be cached for 30 seconds to reduce load

### Security
- MT5 Manager passwords must be encrypted at rest (AES-256)
- Middleware API keys must be unique and securely generated (UUID v4 + random suffix)
- Service-to-service communication should use HTTPS in production
- API key should have limited permissions (only fetch own tenant configs)

### Reliability
- Middleware should cache last known configuration locally
- If platform-service is unavailable, middleware should continue with cached config
- Configuration changes should be eventually consistent (within 60 seconds)

### Usability
- Middleware status should be visually clear (green/red indicators)
- Admin should be able to test middleware connection from UI
- Error messages should be descriptive and actionable

---

## Out of Scope

- Automatic middleware scaling
- Load balancing between multiple middlewares
- Middleware deployment/provisioning
- Historical metrics/analytics dashboard
