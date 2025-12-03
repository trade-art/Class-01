# 需求文档: Middleware Integration (中间件集成层)

## 简介

本文档定义 MT5 Middleware SaaS Platform 的中间件集成层功能需求。Middleware Integration 包含两个方向的改动：

1. **Platform Service 集成层**: 平台服务与中间件实例之间的通信和数据聚合
2. **MT5-Middleware SaaS 适配**: 中间件本身需要的改动以支持 SaaS 平台集成

**目标**: 实现 Platform Service 与多个 MT5 Middleware 实例之间的可靠通信和数据聚合，同时确保中间件支持平台所需的接口和认证机制。

**价值**: 为 SaaS 平台提供统一的中间件管理能力，支持多租户、多实例的复杂部署场景，确保系统的可靠性和可观测性。

## 与产品愿景的对齐

本功能支持架构文档 `docs/SAAS_PLATFORM_ARCHITECTURE.md` 中定义的：
- 第2.1节: Platform Service 与 Middleware Instance 的通信架构
- 第4.1节: 中间件实例管理功能
- 第8.3节: 数据隔离策略

## 现有中间件能力分析

通过分析 `E:\MT5_Project\MT5-middleware` 代码，当前中间件已具备：

### 已有功能
- **多租户模式** (`multi_tenant.enabled`): ManagerSessionPool 支持多 Manager 会话
- **动态服务器管理**: addServer/removeServer/updateServer API
- **健康检查端点**: `/health` 返回基础健康状态
- **监控端点**: `/api/v1/monitor/*` 提供连接池、系统信息、熔断器状态
- **API Key 认证框架**: `security.enable_api_key` 配置项（未完全实现）
- **熔断器**: 支持 MT5、Redis、Database 的熔断保护
- **凭证加密**: AES-256-GCM 加密 Manager 密码

### 需要增强的功能
- API Key 认证机制（当前仅有配置项，未实现验证逻辑）
- 健康检查端点返回数据不够详细
- 缺少实例标识（instance_id）概念
- 缺少平台回调通知机制

---

## 第一部分: MT5-Middleware SaaS 适配需求

### REQ-M1: API Key 认证实现

**用户故事:** 作为 SaaS 平台，我需要通过 API Key 安全地与中间件通信，确保只有授权的平台服务才能调用中间件 API。

#### 验收标准

##### M1.1 API Key 验证过滤器

1. 实现 `ApiKeyFilter` HTTP 过滤器:
   - 从请求头 `X-API-Key` 读取 API Key
   - 与配置的 `security.api_key` 比对
   - 验证失败返回 401 Unauthorized
2. 支持配置多个有效 API Key（用于密钥轮换）
3. 支持 API Key 的 SHA-256 哈希存储（不存储明文）

##### M1.2 认证配置

1. 扩展 `config.json` 配置:
   ```json
   "security": {
     "enable_api_key": true,
     "api_keys": [
       {
         "key_hash": "sha256_hash_of_key",
         "name": "platform-service",
         "created_at": "2025-01-01T00:00:00Z"
       }
     ],
     "api_key_header": "X-API-Key"
   }
   ```
2. 支持动态添加/撤销 API Key（通过管理 API）

##### M1.3 豁免路径

1. 以下路径免认证:
   - `/health` - 基础健康检查
   - `/` - API 信息
2. 其他所有 API 路径需要认证

### REQ-M2: 增强型健康检查端点

**用户故事:** 作为 SaaS 平台，我需要获取中间件的详细健康状态，包括 MT5 连接池、数据库、Redis 等组件状态。

#### 验收标准

##### M2.1 详细健康数据

1. `/health` 端点返回增强数据:
   ```json
   {
     "status": "healthy",
     "service": "mt5-middleware",
     "version": "0.1.0",
     "instance_id": "配置的实例ID",
     "timestamp": 1704067200000,
     "uptime_seconds": 86400,
     "components": {
       "mt5": {
         "status": "healthy",
         "pool_available": 20,
         "pool_total": 25,
         "utilization_percent": 20.0,
         "connected_servers": ["main-server", "backup-server"]
       },
       "redis": {
         "status": "healthy",
         "latency_ms": 1
       },
       "database": {
         "status": "healthy",
         "pool_available": 8,
         "pool_total": 10
       }
     },
     "circuit_breakers": {
       "mt5": "closed",
       "redis": "closed",
       "database": "closed"
     }
   }
   ```
2. 任一组件异常时整体状态为 "degraded" 或 "unhealthy"
3. 响应时间 < 100ms（避免阻塞调用）

##### M2.2 实例标识

1. 配置新增 `instance_id` 字段:
   ```json
   "app": {
     "instance_id": "inst_xxxxx"
   }
   ```
2. 所有 API 响应头包含 `X-Instance-Id`
3. 健康检查返回 `instance_id` 用于平台关联

### REQ-M3: 平台回调通知

**用户故事:** 作为 SaaS 平台，我希望在中间件发生重要事件时收到主动通知，而不是依赖轮询。

#### 验收标准

##### M3.1 回调配置

1. 配置新增回调设置:
   ```json
   "platform_callback": {
     "enabled": true,
     "url": "https://platform-service/api/v1/webhooks/middleware",
     "secret": "webhook_signing_secret",
     "events": ["status_change", "circuit_breaker", "error"]
   }
   ```
2. 支持回调 URL 动态配置（通过 API）

##### M3.2 事件类型

1. 支持以下回调事件:
   - `status_change`: 服务状态变更 (启动、关闭)
   - `circuit_breaker_open`: 熔断器打开
   - `circuit_breaker_close`: 熔断器关闭
   - `mt5_disconnect`: MT5 服务器断开
   - `mt5_reconnect`: MT5 服务器重连
2. 回调请求包含签名 (`X-Webhook-Signature`)

##### M3.3 回调重试

1. 回调失败时重试（最多 3 次，指数退避）
2. 记录回调发送日志

### REQ-M4: 管理 API 增强

**用户故事:** 作为 SaaS 平台，我需要通过 API 远程管理中间件配置。

#### 验收标准

##### M4.1 MT5 服务器管理 API

1. 已有功能（ManagerSessionPool 动态服务器管理）需暴露为 REST API:
   - `GET /api/v1/admin/servers` - 获取服务器列表
   - `POST /api/v1/admin/servers` - 添加服务器
   - `PUT /api/v1/admin/servers/:id` - 更新服务器
   - `DELETE /api/v1/admin/servers/:id` - 删除服务器
   - `POST /api/v1/admin/servers/:id/test` - 测试服务器连接
2. 需要 Admin 权限 + API Key 认证

##### M4.2 配置查询 API

1. `GET /api/v1/admin/config` - 获取当前配置（脱敏）
2. `GET /api/v1/admin/stats` - 获取运行统计

##### M4.3 会话管理 API

1. `GET /api/v1/admin/sessions` - 获取所有活跃会话
2. `DELETE /api/v1/admin/sessions/:id` - 强制终止会话
3. `POST /api/v1/admin/sessions/cleanup` - 清理过期会话

---

## 第二部分: Platform Service 集成层需求

### 技术约束

#### 后端技术栈
- **框架**: NestJS (已有 platform-service)
- **HTTP客户端**: @nestjs/axios (HttpModule)
- **WebSocket**: @nestjs/websockets + ws
- **任务调度**: @nestjs/schedule
- **队列**: Bull (可选，用于异步任务)
- **缓存**: Redis (健康状态缓存)

#### 通信协议
- **健康检查**: HTTP GET `/health` (with X-API-Key)
- **API调用**: HTTP REST with API Key 认证
- **实时数据**: WebSocket (报价、持仓更新)
- **事件接收**: HTTP POST Webhook 端点

#### 中间件API规范
基于增强后的 MT5 Middleware API:
- `/health` - 增强型健康检查端点
- `/api/v1/monitor/*` - 监控数据端点
- `/api/v1/admin/servers` - MT5 服务器管理
- `/api/v1/admin/sessions` - 会话管理

### REQ-P1: 健康检查系统

**用户故事:** 作为平台运维人员，我希望系统能自动监控所有中间件实例的健康状态，及时发现问题。

#### 验收标准

##### P1.1 定时健康检查

1. 系统应每分钟自动检查所有在线实例的健康状态
2. 健康检查应包含:
   - HTTP 连通性检查（调用 `/health`）
   - 响应时间测量 (latency)
   - 解析返回的组件状态（MT5、Redis、Database）
   - 熔断器状态
3. 检查结果应更新到数据库:
   - `status`: ONLINE/OFFLINE/ERROR/DEGRADED
   - `lastHealthCheck`: 检查时间
   - `healthData`: 完整健康数据 JSON
   - `latencyMs`: 响应延迟
4. 检查超时时间: 5秒
5. 支持配置检查间隔

##### P1.2 健康状态管理

1. 健康状态定义:
   - ONLINE: 正常运行（所有组件健康）
   - DEGRADED: 部分组件异常但可用
   - OFFLINE: 无法连接
   - ERROR: 连接成功但返回错误
   - MAINTENANCE: 维护中 (手动设置)
2. 状态变更时应记录日志和事件
3. 连续3次检查失败后触发告警

##### P1.3 手动健康检查

1. 支持通过 API 手动触发单个实例的健康检查
2. 支持批量检查指定实例列表
3. 支持检查所有实例
4. 返回详细的检查结果

### REQ-P2: 数据聚合服务

**用户故事:** 作为平台管理员，我希望能够获取跨实例的聚合数据视图。

#### 验收标准

##### P2.1 交易数据聚合

1. 支持从多个实例聚合交易历史:
   - 按租户聚合 (指定 tenantId)
   - 按实例聚合 (指定 instanceId)
   - 全平台聚合 (不指定过滤条件)
2. 聚合数据应按时间排序
3. 支持分页查询
4. 支持过滤条件 (时间范围、品种、用户等)

##### P2.2 持仓数据聚合

1. 支持实时获取多实例的持仓汇总
2. 持仓数据应包含来源实例标识
3. 支持按租户筛选
4. 支持按用户筛选

##### P2.3 账户余额聚合

1. 支持获取多实例的账户余额汇总
2. 计算租户级别的汇总统计:
   - 总账户数
   - 总余额
   - 总净值
3. 支持按租户筛选

##### P2.4 统计数据聚合

1. 支持生成租户交易概览:
   - 今日交易量/交易额
   - 活跃账户数
   - 总盈亏
2. 支持生成全平台统计:
   - 各租户交易排名
   - 品种分布
   - 时段分布

### REQ-P3: 实例通信管理

**用户故事:** 作为系统，我需要可靠地与各个中间件实例通信。

#### 验收标准

##### P3.1 HTTP 客户端管理

1. 为每个实例维护独立的 HTTP 客户端配置:
   - Base URL (host:port)
   - API Key 认证（从加密存储读取）
   - 超时设置
   - 重试策略
2. 请求失败时自动重试 (最多3次，指数退避)
3. 记录请求日志 (请求/响应/耗时)

##### P3.2 连接池管理

1. 复用 HTTP 连接，避免频繁建立连接
2. 配置最大并发连接数
3. 连接超时自动回收

##### P3.3 熔断器模式

1. 当实例连续失败达到阈值时触发熔断
2. 熔断期间快速失败，不发送实际请求
3. 熔断恢复后进入半开状态，逐步恢复流量
4. 熔断状态可查询

### REQ-P4: MT5 服务器远程管理

**用户故事:** 作为平台管理员，我希望能够通过平台管理每个中间件实例的 MT5 服务器配置。

#### 验收标准

##### P4.1 MT5 服务器配置

1. 调用中间件 `/api/v1/admin/servers` API 管理服务器:
   - 获取服务器列表
   - 添加服务器
   - 更新服务器配置
   - 删除服务器
   - 测试服务器连接
2. 服务器配置存储在中间件侧
3. 平台存储配置元数据（用于审计）

##### P4.2 MT5 连接测试

1. 支持测试 MT5 服务器连通性
2. 通过中间件 API 转发测试请求
3. 返回测试结果 (成功/失败、延迟)

### REQ-P5: Webhook 接收

**用户故事:** 作为平台系统，我需要接收中间件的主动通知，实时更新实例状态。

#### 验收标准

##### P5.1 Webhook 端点

1. 实现 `POST /api/v1/webhooks/middleware` 端点
2. 验证 `X-Webhook-Signature` 签名
3. 验证 `X-Instance-Id` 对应已注册实例

##### P5.2 事件处理

1. 处理以下事件:
   - `status_change`: 更新实例状态
   - `circuit_breaker_open/close`: 记录日志、更新健康数据
   - `mt5_disconnect/reconnect`: 更新连接状态
2. 转发事件到前端（通过 WebSocket）
3. 记录事件到数据库

### REQ-P6: 事件通知系统

**用户故事:** 作为平台运维人员，我希望能够及时收到系统异常通知。

#### 验收标准

##### P6.1 事件类型

1. 支持以下事件类型:
   - 实例状态变更 (ONLINE → OFFLINE 等)
   - 健康检查失败
   - 熔断触发/恢复
   - 配额预警 (接近限制)
   - Webhook 接收事件
2. 每种事件包含:
   - 事件类型
   - 时间戳
   - 关联实体 (租户/实例)
   - 详细信息

##### P6.2 通知渠道

1. 系统日志记录
2. 数据库事件存储 (用于查询)
3. WebSocket 推送 (实时通知前端)
4. Webhook 回调 (可选，用于外部集成)

##### P6.3 告警规则

1. 支持配置告警规则:
   - 触发条件 (连续失败次数、状态变更)
   - 告警级别 (info/warning/error/critical)
   - 通知方式
2. 支持告警静默 (维护期间)

### REQ-P7: 配额与限流

**用户故事:** 作为平台管理员，我希望能够控制各租户的资源使用。

#### 验收标准

##### P7.1 配额管理

1. 检查租户实例配额:
   - 当前使用数
   - 最大配额
   - 可用配额
2. 创建实例前验证配额
3. 配额不足时返回明确错误

##### P7.2 请求限流

1. 对中间件 API 调用实施限流:
   - 每个实例的 QPS 限制
   - 每个租户的总 QPS 限制
2. 超过限制时排队或拒绝
3. 返回限流状态和重试建议

### REQ-P8: 数据缓存策略

**用户故事:** 作为系统，我需要优化频繁访问的数据以提高性能。

#### 验收标准

##### P8.1 健康状态缓存

1. 健康检查结果缓存到 Redis
2. 缓存有效期: 30秒
3. 支持强制刷新

##### P8.2 实例信息缓存

1. 实例基本信息缓存
2. 缓存有效期: 5分钟
3. 配置变更时自动失效

##### P8.3 统计数据缓存

1. 聚合统计数据缓存
2. 缓存有效期: 根据数据类型配置
3. 支持预热和刷新

---

## 非功能性需求

### 性能要求

- 健康检查响应时间 < 5秒
- 数据聚合请求响应时间 < 10秒 (取决于实例数量)
- 支持同时监控 100+ 实例
- 并发数据聚合请求 < 50
- 中间件健康端点响应 < 100ms

### 可靠性要求

- 健康检查系统 99.9% 可用
- 单个实例失败不影响其他实例
- 支持优雅降级
- Webhook 发送失败自动重试

### 可观测性要求

- 所有 API 调用记录日志
- 关键操作记录审计日志
- 提供 Prometheus 格式的 metrics (可选)
- 支持分布式追踪 (可选)

### 安全性要求

- 实例 API Key 加密存储
- MT5 Manager 密码加密存储
- 通信使用 HTTPS (生产环境)
- API 调用需要认证
- Webhook 签名验证

---

## API 接口设计

### Platform Service API

#### 健康检查 API

```
POST /api/v1/instances/:id/health-check
  - 触发单个实例健康检查
  - 返回: { status, latencyMs, data }

POST /api/v1/instances/health-check/batch
  - Body: { instanceIds: string[] }
  - 批量健康检查
  - 返回: { results: Map<id, result> }

POST /api/v1/instances/health-check/all
  - 检查所有实例
  - 返回: { total, online, offline, error, degraded }
```

#### 数据聚合 API

```
GET /api/v1/trading-data/history
  - Query: tenantId?, instanceId?, fromDate, toDate, page, limit
  - 聚合交易历史

GET /api/v1/trading-data/positions
  - Query: tenantId?, instanceId?, login?
  - 聚合实时持仓

GET /api/v1/trading-data/balances
  - Query: tenantId?, instanceId?
  - 聚合账户余额

GET /api/v1/trading-data/stats
  - Query: tenantId?, period (today/week/month)
  - 获取交易统计

GET /api/v1/trading-data/tenant-overview
  - Query: tenantId
  - 获取租户交易概览

GET /api/v1/trading-data/platform-overview
  - 获取全平台概览
```

#### MT5 服务器管理 API

```
GET /api/v1/instances/:id/mt5-servers
  - 获取 MT5 服务器列表（转发到中间件）

POST /api/v1/instances/:id/mt5-servers
  - Body: { name, host, port, managerLogin, managerPassword, isDefault? }
  - 添加 MT5 服务器

PUT /api/v1/instances/:id/mt5-servers/:name
  - 更新 MT5 服务器配置

DELETE /api/v1/instances/:id/mt5-servers/:name
  - 删除 MT5 服务器

POST /api/v1/instances/:id/mt5-servers/:name/test
  - 测试 MT5 服务器连接

PUT /api/v1/instances/:id/mt5-servers/:name/default
  - 设置为默认服务器
```

#### Webhook 接收 API

```
POST /api/v1/webhooks/middleware
  - Headers: X-Webhook-Signature, X-Instance-Id
  - Body: { event, timestamp, data }
  - 接收中间件回调
```

#### 配额 API

```
GET /api/v1/tenants/:id/quota
  - 获取租户配额使用情况
  - 返回: { instances: {used, max, available}, admins: {used, max, available} }
```

### MT5-Middleware 新增 API

#### 管理 API

```
GET /api/v1/admin/servers
  - 获取服务器列表
  - 返回: { servers: [...] }

POST /api/v1/admin/servers
  - Body: { server_id, address, name, description, timezone_offset_hours }
  - 添加服务器

PUT /api/v1/admin/servers/:id
  - 更新服务器配置

DELETE /api/v1/admin/servers/:id
  - Query: force? (是否强制断开活跃连接)
  - 删除服务器

POST /api/v1/admin/servers/:id/test
  - Body: { manager_login, manager_password }
  - 测试服务器连接

GET /api/v1/admin/config
  - 获取当前配置（脱敏）

GET /api/v1/admin/stats
  - 获取运行统计

GET /api/v1/admin/sessions
  - 获取所有活跃会话

DELETE /api/v1/admin/sessions/:id
  - 强制终止会话

POST /api/v1/admin/sessions/cleanup
  - 清理过期会话
```
