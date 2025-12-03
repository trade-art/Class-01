# 任务文档: Tenant API Service

## 任务概览

本文档将设计文档中的组件分解为可执行的开发任务。

**总任务数**: 28 个任务
**预计文件变更**: 约 60 个文件

---

## 第一阶段: 项目初始化与基础设施

- [x] 1. 创建 Tenant API 项目结构
  - **文件**: `apps/tenant-api/` 目录结构
  - **描述**: 初始化 NestJS 项目，配置基础文件
  - **_Leverage**: `apps/platform-service/` 现有结构
  - **_Requirements**: 所有需求
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 Tenant API 项目基础结构：
    - 创建 apps/tenant-api/ 目录
    - 初始化 package.json (参考 platform-service)
    - 创建 nest-cli.json 配置
    - 创建 tsconfig.json 配置
    - 创建 src/main.ts 入口文件 (端口 3002)
    - 创建 src/app.module.ts 根模块
    - 创建 .env.example 环境变量模板
    Restrictions:
    - 端口使用 3002
    - 参考 platform-service 的配置格式
    - 使用中文注释
    _Leverage: apps/platform-service/ 项目结构
    _Requirements: 所有
    Success: 项目可以启动，访问 http://localhost:3002 返回基础响应
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 2. 配置 Prisma 模块
  - **文件**: `apps/tenant-api/src/prisma/prisma.module.ts`, `prisma.service.ts`
  - **描述**: 配置 Prisma 数据库连接，共享现有 Schema
  - **_Leverage**: `apps/platform-service/src/prisma/`
  - **_Requirements**: 所有需求
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS/Prisma 后端开发专家
    Task: 配置 Prisma 模块：
    - 创建 src/prisma/prisma.module.ts
    - 创建 src/prisma/prisma.service.ts (参考 platform-service)
    - 在根 prisma/schema.prisma 中添加新模型 (RiskAlert, RiskConfig, AdminFavoriteSymbol, NotificationSetting)
    - 运行 prisma generate 和 prisma migrate
    Restrictions:
    - 共享根目录 prisma/schema.prisma
    - 使用相同的数据库连接
    _Leverage: apps/platform-service/src/prisma/
    _Requirements: 所有
    Success: Prisma 连接正常，新模型已创建
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 3. 创建公共模块 - 异常过滤器和响应拦截器
  - **文件**: `apps/tenant-api/src/common/filters/`, `apps/tenant-api/src/common/interceptors/`
  - **描述**: 创建统一的异常处理和响应格式
  - **_Leverage**: `apps/platform-service/src/common/`
  - **_Requirements**: 所有需求
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建公共模块：
    - 创建 src/common/filters/http-exception.filter.ts
    - 创建 src/common/interceptors/response.interceptor.ts
    - 创建 src/common/exceptions/business.exception.ts
    - 创建 src/common/dto/pagination.dto.ts
    - 错误响应格式: { success: false, error: { code, message, details, timestamp, traceId } }
    - 成功响应格式: { success: true, data: T, meta?: {...} }
    Restrictions:
    - 参考 platform-service 实现
    - 使用中文注释
    _Leverage: apps/platform-service/src/common/
    _Requirements: 所有
    Success: 统一的错误和响应格式生效
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 4. 创建配置模块
  - **文件**: `apps/tenant-api/src/config/configuration.ts`, `validation.ts`
  - **描述**: 创建应用配置和验证
  - **_Leverage**: `apps/platform-service/src/config/`
  - **_Requirements**: 所有需求
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建配置模块：
    - 创建 src/config/configuration.ts (数据库、JWT、Redis、中间件配置)
    - 创建 src/config/validation.ts (Joi schema 验证)
    - 在 app.module.ts 中注册 ConfigModule
    配置项:
    - DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN
    - REDIS_HOST, REDIS_PORT
    - MIDDLEWARE_TIMEOUT (默认 30000)
    Restrictions:
    - 使用 @nestjs/config
    - 参考 platform-service 配置结构
    _Leverage: apps/platform-service/src/config/
    _Requirements: 所有
    Success: 配置正确加载，环境变量验证通过
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第二阶段: 中间件代理服务

- [x] 5. 创建 MiddlewareProxyService 核心服务
  - **文件**: `apps/tenant-api/src/middleware-proxy/middleware-proxy.service.ts`
  - **描述**: 创建统一的中间件 API 调用服务
  - **_Leverage**: 设计文档 MiddlewareProxyService 定义
  - **_Requirements**: REQ-2 ~ REQ-6, REQ-8, REQ-13
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 MiddlewareProxyService：
    - 创建 src/middleware-proxy/middleware-proxy.module.ts
    - 创建 src/middleware-proxy/middleware-proxy.service.ts
    - 实现 getInstanceConfig(tenantId) 方法 - 获取租户实例配置
    - 实现 proxyRequest<T>(tenantId, method, path, data?, params?) 方法 - 代理请求
    - 实现 cachedRequest<T>(cacheKey, ttl, fetcher) 方法 - 带缓存请求
    - 添加超时处理 (默认 30s)
    - 添加错误处理和转换
    Restrictions:
    - 使用 @nestjs/axios HttpService
    - 使用 @nestjs/cache-manager 缓存
    - 中间件不可用时抛出 INSTANCE_503_001 错误
    _Leverage: 设计文档 MiddlewareProxyService
    _Requirements: REQ-2 ~ REQ-6, REQ-8, REQ-13
    Success: 可以成功调用中间件 API，缓存生效
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 6. 创建中间件 DTO 定义
  - **文件**: `apps/tenant-api/src/middleware-proxy/dto/`
  - **描述**: 定义中间件请求和响应的 DTO
  - **_Leverage**: MT5 Middleware API 文档
  - **_Requirements**: REQ-2 ~ REQ-6
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建中间件 DTO：
    - 创建 src/middleware-proxy/dto/middleware-response.dto.ts
    - 创建 src/middleware-proxy/dto/middleware-error.dto.ts
    - 定义 UsersResponse, PositionsResponse, QuotesResponse, HistoryResponse 等
    - 定义 MonitorStats, PositionStats 等统计 DTO
    Restrictions:
    - 字段命名与中间件 API 响应匹配 (snake_case)
    - 添加类型注释
    _Leverage: MT5 Middleware API 文档
    _Requirements: REQ-2 ~ REQ-6
    Success: DTO 完整覆盖所有中间件响应类型
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第三阶段: 认证模块

- [x] 7. 创建 JWT 策略和守卫
  - **文件**: `apps/tenant-api/src/modules/auth/strategies/`, `apps/tenant-api/src/common/guards/`
  - **描述**: 创建 JWT 认证策略和守卫
  - **_Leverage**: `apps/platform-service/src/modules/auth/`
  - **_Requirements**: REQ-1
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家，精通 Passport JWT
    Task: 创建认证策略和守卫：
    - 创建 src/modules/auth/strategies/jwt.strategy.ts
    - 创建 src/common/guards/jwt-auth.guard.ts
    - 创建 src/common/guards/roles.guard.ts
    - 创建 src/common/decorators/current-admin.decorator.ts
    - 创建 src/common/decorators/roles.decorator.ts
    JWT Payload 结构:
    - sub: admin ID
    - email, tenantId, tenantCode, role, type: 'tenant_admin'
    Restrictions:
    - 独立于 platform-service 的 JWT 配置
    - 验证 type 必须为 'tenant_admin'
    _Leverage: apps/platform-service/src/modules/auth/
    _Requirements: REQ-1
    Success: JWT 验证正常，装饰器可获取当前管理员信息
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 8. 创建 AuthService 核心服务
  - **文件**: `apps/tenant-api/src/modules/auth/auth.service.ts`
  - **描述**: 实现登录、令牌刷新、密码修改等核心逻辑
  - **_Leverage**: `apps/platform-service/src/modules/auth/`
  - **_Requirements**: REQ-1
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 AuthService：
    - 创建 src/modules/auth/auth.service.ts
    - 实现 login(dto) - 验证凭证、签发令牌
    - 实现 refreshToken(dto) - 刷新 accessToken
    - 实现 changePassword(adminId, dto) - 修改密码
    - 实现 getProfile(adminId) - 获取管理员信息
    - 实现 validateTenant(tenantCode) - 验证租户状态
    - 实现 validateAdmin(tenantId, email, password) - 验证管理员
    错误码:
    - AUTH_401_001: 用户名或密码错误
    - AUTH_401_002: Token 无效或已过期
    - AUTH_403_001: 账号已被禁用
    - TENANT_403_001: 租户已暂停或过期
    Restrictions:
    - 密码使用 bcrypt 比对
    - 更新最后登录时间
    _Leverage: apps/platform-service/src/modules/auth/
    _Requirements: REQ-1
    Success: 登录流程正常，错误码正确返回
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 9. 创建 AuthController
  - **文件**: `apps/tenant-api/src/modules/auth/auth.controller.ts`
  - **描述**: 实现认证 API 端点
  - **_Leverage**: 设计文档 AuthController 定义
  - **_Requirements**: REQ-1
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 AuthController：
    - 创建 src/modules/auth/auth.controller.ts
    - 创建 src/modules/auth/dto/login.dto.ts
    - 创建 src/modules/auth/dto/change-password.dto.ts
    - 实现端点:
      - POST /tenant/auth/login
      - POST /tenant/auth/refresh
      - POST /tenant/auth/logout
      - POST /tenant/auth/change-password
      - GET /tenant/auth/profile
      - PUT /tenant/auth/profile
    Restrictions:
    - 使用 class-validator 验证 DTO
    - 添加 Swagger 文档注解
    _Leverage: 设计文档 AuthController
    _Requirements: REQ-1
    Success: 所有认证端点正常工作
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 10. 创建 AuthModule 并注册
  - **文件**: `apps/tenant-api/src/modules/auth/auth.module.ts`
  - **描述**: 创建认证模块并注册到 AppModule
  - **_Leverage**: `apps/platform-service/src/modules/auth/`
  - **_Requirements**: REQ-1
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 AuthModule：
    - 创建 src/modules/auth/auth.module.ts
    - 配置 JwtModule (secret, expiresIn)
    - 配置 PassportModule
    - 导出 JwtService 供其他模块使用
    - 在 app.module.ts 中注册 AuthModule
    Restrictions:
    - JWT secret 从配置读取
    - accessToken 过期时间: 15m
    - refreshToken 过期时间: 7d
    _Leverage: apps/platform-service/src/modules/auth/
    _Requirements: REQ-1
    Success: AuthModule 正确注册，JWT 配置生效
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第四阶段: Dashboard 模块

- [x] 11. 创建 DashboardService
  - **文件**: `apps/tenant-api/src/modules/dashboard/dashboard.service.ts`
  - **描述**: 实现 Dashboard 数据聚合逻辑
  - **_Leverage**: MiddlewareProxyService
  - **_Requirements**: REQ-2
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 DashboardService：
    - 创建 src/modules/dashboard/dashboard.service.ts
    - 实现 getStats(tenantId) - 获取统计数据 (调用中间件 /api/v1/monitor/stats)
    - 实现 getTradingTrend(tenantId, days) - 获取交易趋势
    - 实现 getSymbolDistribution(tenantId) - 获取品种分布
    - 实现 getUserActivity(tenantId, days) - 获取用户活跃度
    - 实现 getRecentTrades(tenantId, limit) - 获取最近交易
    - 实现 getSystemStatus(tenantId) - 获取系统状态
    缓存策略:
    - stats: TTL 1分钟
    - trend/distribution: TTL 5分钟
    Restrictions:
    - 使用 MiddlewareProxyService 调用中间件
    - 数据映射从 snake_case 到 camelCase
    _Leverage: MiddlewareProxyService
    _Requirements: REQ-2
    Success: Dashboard 数据正确获取和缓存
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 12. 创建 DashboardController 和 Module
  - **文件**: `apps/tenant-api/src/modules/dashboard/dashboard.controller.ts`, `dashboard.module.ts`
  - **描述**: 实现 Dashboard API 端点
  - **_Leverage**: 设计文档 DashboardController 定义
  - **_Requirements**: REQ-2
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 DashboardController 和 Module：
    - 创建 src/modules/dashboard/dashboard.controller.ts
    - 创建 src/modules/dashboard/dashboard.module.ts
    - 实现端点:
      - GET /tenant/dashboard/stats
      - GET /tenant/dashboard/trading-trend?days=7
      - GET /tenant/dashboard/symbol-distribution
      - GET /tenant/dashboard/user-activity?days=7
      - GET /tenant/dashboard/recent-trades?limit=10
      - GET /tenant/dashboard/system-status
    Restrictions:
    - 所有端点需要 JWT 认证
    - 添加 Swagger 文档注解
    _Leverage: 设计文档 DashboardController
    _Requirements: REQ-2
    Success: Dashboard 端点正常返回数据
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第五阶段: 交易用户模块

- [x] 13. 创建 UsersService
  - **文件**: `apps/tenant-api/src/modules/users/users.service.ts`
  - **描述**: 实现交易用户管理逻辑
  - **_Leverage**: MiddlewareProxyService
  - **_Requirements**: REQ-3
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 UsersService：
    - 创建 src/modules/users/users.service.ts
    - 实现 getList(tenantId, query) - 用户列表 (分页、搜索、筛选、排序)
    - 实现 getGroups(tenantId) - 获取组别列表
    - 实现 getDetail(tenantId, login) - 用户详情
    - 实现 updateGroup(tenantId, login, group) - 修改组别
    - 实现 updateLeverage(tenantId, login, leverage) - 修改杠杆
    - 实现 updateStatus(tenantId, login, status) - 启用/禁用
    - 实现 getTransactions(tenantId, login, query) - 出入金记录
    - 实现 getLogs(tenantId, login, query) - 操作日志
    - 实现 exportCsv(tenantId, query) - 导出 CSV
    中间件 API:
    - GET /api/v1/account/users
    - PUT /api/v1/account/users/:login/group
    - PUT /api/v1/account/users/:login/leverage
    Restrictions:
    - 使用 MiddlewareProxyService
    - 验证杠杆值范围 (1-500)
    _Leverage: MiddlewareProxyService
    _Requirements: REQ-3
    Success: 用户管理功能正常
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 14. 创建 UsersController 和 Module
  - **文件**: `apps/tenant-api/src/modules/users/users.controller.ts`, `users.module.ts`
  - **描述**: 实现用户管理 API 端点
  - **_Leverage**: 设计文档 UsersController 定义
  - **_Requirements**: REQ-3
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 UsersController 和 Module：
    - 创建 src/modules/users/users.controller.ts
    - 创建 src/modules/users/users.module.ts
    - 创建 src/modules/users/dto/user-list.dto.ts
    - 创建 src/modules/users/dto/update-user.dto.ts
    - 实现端点:
      - GET /tenant/users
      - GET /tenant/users/groups
      - GET /tenant/users/:login
      - PUT /tenant/users/:login/group (Owner, Admin)
      - PUT /tenant/users/:login/leverage (Owner, Admin)
      - PUT /tenant/users/:login/status (Owner, Admin)
      - GET /tenant/users/:login/transactions
      - GET /tenant/users/:login/logs
      - POST /tenant/users/export (Owner, Admin)
    Restrictions:
    - 使用 @Roles 装饰器控制权限
    - 添加 Swagger 文档注解
    _Leverage: 设计文档 UsersController
    _Requirements: REQ-3
    Success: 用户管理端点正常工作，权限控制生效
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第六阶段: 持仓和报价模块

- [x] 15. 创建 PositionsService 和 Controller
  - **文件**: `apps/tenant-api/src/modules/positions/`
  - **描述**: 实现持仓监控功能
  - **_Leverage**: MiddlewareProxyService
  - **_Requirements**: REQ-4
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 Positions 模块：
    - 创建 src/modules/positions/positions.module.ts
    - 创建 src/modules/positions/positions.service.ts
    - 创建 src/modules/positions/positions.controller.ts
    - 实现 getList(tenantId, query) - 持仓列表 (按用户、品种、盈亏筛选)
    - 实现 getStats(tenantId) - 持仓统计 (总数、手数、盈亏、多空比)
    端点:
    - GET /tenant/positions
    - GET /tenant/positions/stats
    中间件 API:
    - GET /api/v1/trading/positions
    - GET /api/v1/trading/positions/stats
    Restrictions:
    - 使用 MiddlewareProxyService
    - 添加分页支持
    _Leverage: MiddlewareProxyService
    _Requirements: REQ-4
    Success: 持仓数据正确获取
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 16. 创建 QuotesService 和 Controller
  - **文件**: `apps/tenant-api/src/modules/quotes/`
  - **描述**: 实现报价监控和自选功能
  - **_Leverage**: MiddlewareProxyService, AdminFavoriteSymbol 模型
  - **_Requirements**: REQ-5
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 Quotes 模块：
    - 创建 src/modules/quotes/quotes.module.ts
    - 创建 src/modules/quotes/quotes.service.ts
    - 创建 src/modules/quotes/quotes.controller.ts
    - 实现 getList(tenantId, search?) - 报价列表
    - 实现 getFavorites(adminId) - 自选列表
    - 实现 addFavorite(adminId, symbol) - 添加自选
    - 实现 removeFavorite(adminId, symbol) - 移除自选
    端点:
    - GET /tenant/quotes
    - GET /tenant/quotes/favorites
    - POST /tenant/quotes/favorites
    - POST /tenant/quotes/favorites/remove
    中间件 API:
    - GET /api/v1/quotes/symbols
    Restrictions:
    - 自选存储到 AdminFavoriteSymbol 表
    - 缓存报价数据 TTL 1分钟
    _Leverage: MiddlewareProxyService
    _Requirements: REQ-5
    Success: 报价和自选功能正常
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第七阶段: 历史和风控模块

- [x] 17. 创建 HistoryService 和 Controller
  - **文件**: `apps/tenant-api/src/modules/history/`
  - **描述**: 实现交易历史查询功能
  - **_Leverage**: MiddlewareProxyService
  - **_Requirements**: REQ-6
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 History 模块：
    - 创建 src/modules/history/history.module.ts
    - 创建 src/modules/history/history.service.ts
    - 创建 src/modules/history/history.controller.ts
    - 实现 getList(tenantId, query) - 历史订单 (用户、品种、时间、类型筛选)
    - 实现 getStats(tenantId, query) - 历史统计 (订单数、盈亏、胜率、持仓时间)
    - 实现 export(tenantId, query, format) - 导出 CSV/Excel
    端点:
    - GET /tenant/history
    - GET /tenant/history/stats
    - POST /tenant/history/export
    中间件 API:
    - GET /api/v1/trading/history/orders
    Restrictions:
    - 支持时间范围查询
    - 添加分页支持
    _Leverage: MiddlewareProxyService
    _Requirements: REQ-6
    Success: 历史查询和导出功能正常
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 18. 创建 RiskService 和 Controller
  - **文件**: `apps/tenant-api/src/modules/risk/`
  - **描述**: 实现风控预警功能
  - **_Leverage**: RiskAlert, RiskConfig 模型
  - **_Requirements**: REQ-7
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 Risk 模块：
    - 创建 src/modules/risk/risk.module.ts
    - 创建 src/modules/risk/risk.service.ts
    - 创建 src/modules/risk/risk.controller.ts
    - 实现 getAlerts(tenantId, query) - 预警列表 (类型、级别、时间筛选)
    - 实现 getConfig(tenantId) - 获取预警配置
    - 实现 updateConfig(tenantId, dto) - 更新预警配置
    - 实现 createAlert(tenantId, type, level, message, data) - 创建预警 (内部调用)
    端点:
    - GET /tenant/risk/alerts
    - GET /tenant/risk/config (Owner, Admin)
    - PUT /tenant/risk/config (Owner, Admin)
    预警类型:
    - LARGE_TRADE, LOW_MARGIN, HIGH_FREQUENCY, ABNORMAL_PROFIT
    Restrictions:
    - 使用 Prisma 操作 RiskAlert, RiskConfig 表
    - 权限控制: 仅 owner/admin 可配置
    _Leverage: RiskAlert, RiskConfig 模型
    _Requirements: REQ-7
    Success: 预警列表和配置功能正常
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第八阶段: 报表模块

- [x] 19. 创建 ReportsService
  - **文件**: `apps/tenant-api/src/modules/reports/reports.service.ts`
  - **描述**: 实现报表数据聚合逻辑
  - **_Leverage**: MiddlewareProxyService
  - **_Requirements**: REQ-8
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 ReportsService：
    - 创建 src/modules/reports/reports.service.ts
    - 实现 getTradingReport(tenantId, query) - 交易报表
      - 日/周/月切换
      - 交易量趋势、交易额趋势、品种分析、时段分析
    - 实现 getUsersReport(tenantId, query) - 用户报表
      - 新增趋势、活跃趋势、留存率、价值排名、分组统计
    - 实现 getFinanceReport(tenantId, query) - 财务报表
      - 出入金统计、资金流水、手续费收入、月度对比
    - 实现 export(tenantId, type, query, format) - 导出 PDF/Excel
    Restrictions:
    - 聚合中间件数据
    - 支持日期范围查询
    - 缓存报表数据 TTL 5分钟
    _Leverage: MiddlewareProxyService
    _Requirements: REQ-8
    Success: 报表数据正确聚合
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 20. 创建 ReportsController 和 Module
  - **文件**: `apps/tenant-api/src/modules/reports/reports.controller.ts`, `reports.module.ts`
  - **描述**: 实现报表 API 端点
  - **_Leverage**: 设计文档 ReportsController 定义
  - **_Requirements**: REQ-8
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 ReportsController 和 Module：
    - 创建 src/modules/reports/reports.controller.ts
    - 创建 src/modules/reports/reports.module.ts
    - 实现端点:
      - GET /tenant/reports/trading?period=day&startDate=&endDate=
      - GET /tenant/reports/users?period=day&startDate=&endDate=
      - GET /tenant/reports/finance?period=day&startDate=&endDate=
      - POST /tenant/reports/:type/export (Owner, Admin)
    Query 参数:
    - period: day | week | month
    - startDate, endDate: ISO 日期
    - format: pdf | excel (导出时)
    Restrictions:
    - 所有端点需要 JWT 认证
    - 导出需要 Owner/Admin 权限
    _Leverage: 设计文档
    _Requirements: REQ-8
    Success: 报表端点正常工作
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第九阶段: 设置模块

- [x] 21. 创建 BrandingController 和 Service
  - **文件**: `apps/tenant-api/src/modules/settings/branding/`
  - **描述**: 实现白标配置功能
  - **_Leverage**: Tenant 模型白标字段
  - **_Requirements**: REQ-9
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 Branding 模块：
    - 创建 src/modules/settings/branding/branding.service.ts
    - 创建 src/modules/settings/branding/branding.controller.ts
    - 实现 getBranding(tenantId) - 获取白标配置
    - 实现 updateBranding(tenantId, dto) - 更新白标
    - 实现 uploadLogo(tenantId, file) - 上传 Logo
    - 实现 uploadFavicon(tenantId, file) - 上传 Favicon
    端点:
    - GET /tenant/settings/branding
    - PUT /tenant/settings/branding (Owner)
    - POST /tenant/settings/branding/logo (Owner)
    - POST /tenant/settings/branding/favicon (Owner)
    文件上传:
    - Logo: 最大 2MB, PNG/JPG/SVG
    - Favicon: 最大 512KB, PNG/ICO
    Restrictions:
    - 仅 Owner 可修改
    - 使用 Multer 处理文件上传
    - 存储到本地 uploads/ 目录 (后续可改为 S3)
    _Leverage: Tenant 模型
    _Requirements: REQ-9
    Success: 白标配置和文件上传正常
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 22. 创建 AdminsController 和 Service
  - **文件**: `apps/tenant-api/src/modules/settings/admins/`
  - **描述**: 实现管理员管理功能
  - **_Leverage**: TenantAdmin 模型
  - **_Requirements**: REQ-10
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 Admins 模块：
    - 创建 src/modules/settings/admins/admins.service.ts
    - 创建 src/modules/settings/admins/admins.controller.ts
    - 实现 getList(tenantId, query) - 管理员列表
    - 实现 create(tenantId, dto) - 创建管理员
    - 实现 update(tenantId, id, dto) - 更新管理员
    - 实现 resetPassword(tenantId, id, dto) - 重置密码
    - 实现 toggleStatus(tenantId, id, isActive) - 启用/禁用
    - 实现 delete(tenantId, id) - 删除管理员
    端点:
    - GET /tenant/settings/admins (Owner)
    - POST /tenant/settings/admins (Owner)
    - PUT /tenant/settings/admins/:id (Owner)
    - POST /tenant/settings/admins/:id/reset-password (Owner)
    - PUT /tenant/settings/admins/:id/status (Owner)
    - DELETE /tenant/settings/admins/:id (Owner)
    约束:
    - 邮箱在租户内唯一
    - 不能删除最后一个 Owner
    - 不能降级自己的角色
    Restrictions:
    - 仅 Owner 可操作
    - 密码使用 bcrypt 哈希
    _Leverage: TenantAdmin 模型
    _Requirements: REQ-10
    Success: 管理员 CRUD 功能正常
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 23. 创建 ApiKeysController 和 Service
  - **文件**: `apps/tenant-api/src/modules/settings/api-keys/`
  - **描述**: 实现 API 密钥管理功能
  - **_Leverage**: ApiKey 模型
  - **_Requirements**: REQ-11
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 ApiKeys 模块：
    - 创建 src/modules/settings/api-keys/api-keys.service.ts
    - 创建 src/modules/settings/api-keys/api-keys.controller.ts
    - 实现 getList(tenantId) - 密钥列表 (脱敏显示)
    - 实现 create(tenantId, dto) - 创建密钥 (返回完整密钥，仅一次)
    - 实现 updatePermissions(tenantId, id, permissions) - 更新权限
    - 实现 regenerate(tenantId, id) - 重新生成
    - 实现 toggleStatus(tenantId, id, isActive) - 启用/禁用
    - 实现 delete(tenantId, id) - 删除
    端点:
    - GET /tenant/settings/api-keys (Owner, Admin)
    - POST /tenant/settings/api-keys (Owner, Admin)
    - PUT /tenant/settings/api-keys/:id/permissions (Owner, Admin)
    - POST /tenant/settings/api-keys/:id/regenerate (Owner, Admin)
    - PUT /tenant/settings/api-keys/:id/status (Owner, Admin)
    - DELETE /tenant/settings/api-keys/:id (Owner, Admin)
    密钥生成:
    - 使用 crypto.randomBytes(32) 生成
    - 存储 SHA-256 哈希
    Restrictions:
    - Owner/Admin 可操作
    - 密钥只在创建/重新生成时显示一次
    _Leverage: ApiKey 模型
    _Requirements: REQ-11
    Success: API 密钥管理功能正常
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 24. 创建 NotificationsController 和 Service
  - **文件**: `apps/tenant-api/src/modules/settings/notifications/`
  - **描述**: 实现通知设置功能
  - **_Leverage**: NotificationSetting 模型
  - **_Requirements**: REQ-12
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 Notifications 模块：
    - 创建 src/modules/settings/notifications/notifications.service.ts
    - 创建 src/modules/settings/notifications/notifications.controller.ts
    - 实现 getSettings(tenantId) - 获取通知设置
    - 实现 updateSettings(tenantId, dto) - 更新设置
    端点:
    - GET /tenant/settings/notifications (Owner, Admin)
    - PUT /tenant/settings/notifications (Owner, Admin)
    设置项:
    - riskAlertEmail: boolean
    - systemAlertEmail: boolean
    - webhookUrl: string?
    - webhookEnabled: boolean
    Restrictions:
    - Owner/Admin 可操作
    - 验证 webhookUrl 格式
    _Leverage: NotificationSetting 模型
    _Requirements: REQ-12
    Success: 通知设置功能正常
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 25. 创建 SettingsModule 和 MT5 Server Info
  - **文件**: `apps/tenant-api/src/modules/settings/settings.module.ts`
  - **描述**: 整合设置模块，添加 MT5 服务器信息端点
  - **_Leverage**: 所有 settings 子模块
  - **_Requirements**: REQ-9 ~ REQ-13
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 SettingsModule：
    - 创建 src/modules/settings/settings.module.ts
    - 导入 BrandingModule, AdminsModule, ApiKeysModule, NotificationsModule
    - 添加 MT5ServerController:
      - GET /tenant/settings/mt5-server - 获取 MT5 服务器信息
    MT5 服务器信息:
    - 调用中间件 /health/detailed 获取
    - 返回: 服务器名称、连接状态、最后心跳
    Restrictions:
    - 在 app.module.ts 中注册 SettingsModule
    - 所有设置端点需要 JWT 认证
    _Leverage: 所有 settings 子模块
    _Requirements: REQ-9 ~ REQ-13
    Success: 所有设置功能正常工作
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第十阶段: WebSocket 网关

- [x] 26. 创建 WebSocket Gateway
  - **文件**: `apps/tenant-api/src/modules/websocket/websocket.gateway.ts`
  - **描述**: 创建 WebSocket 网关，转发实时数据
  - **_Leverage**: @nestjs/websockets, 设计文档 WebSocketGateway 定义
  - **_Requirements**: REQ-4, REQ-5
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家，精通 WebSocket
    Task: 创建 WebSocket Gateway：
    - 创建 src/modules/websocket/websocket.module.ts
    - 创建 src/modules/websocket/websocket.gateway.ts
    - 创建 src/modules/websocket/websocket.service.ts
    - 实现 handleConnection(client) - 验证 JWT，建立连接
    - 实现 handleDisconnect(client) - 清理连接
    - 实现 subscribeToMiddleware(tenantId, client) - 订阅中间件 WS
    - 实现 broadcastPositionUpdate(tenantId, data) - 广播持仓更新
    - 实现 broadcastQuoteUpdate(tenantId, data) - 广播报价更新
    事件:
    - position:update - 持仓变化
    - quote:update - 报价更新
    - trade:new - 新成交
    Restrictions:
    - 使用 Socket.IO
    - 连接时验证 JWT (handshake.auth.token)
    - 按 tenant 分房间广播
    _Leverage: @nestjs/websockets
    _Requirements: REQ-4, REQ-5
    Success: WebSocket 连接和数据推送正常
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第十一阶段: 测试和文档

- [x] 27. 编写单元测试
  - **文件**: `apps/tenant-api/src/**/*.spec.ts`
  - **描述**: 为核心 Service 编写单元测试
  - **_Leverage**: Jest, @nestjs/testing
  - **_Requirements**: 所有需求
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 测试专家
    Task: 编写单元测试：
    - 为 AuthService 编写测试 (login, refreshToken, changePassword)
    - 为 MiddlewareProxyService 编写测试 (proxyRequest, cachedRequest)
    - 为 DashboardService 编写测试 (getStats, getTradingTrend)
    - 为 UsersService 编写测试 (getList, updateGroup)
    - Mock 依赖: PrismaService, HttpService, CacheManager
    覆盖率目标:
    - Service 层 > 80%
    - 核心逻辑 > 90%
    Restrictions:
    - 使用 Jest
    - Mock 外部依赖
    - 测试正常和异常场景
    _Leverage: Jest, @nestjs/testing
    _Requirements: 所有
    Success: 测试覆盖率达标，所有测试通过
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 28. 配置 Swagger 文档
  - **文件**: `apps/tenant-api/src/main.ts`
  - **描述**: 配置 Swagger API 文档
  - **_Leverage**: @nestjs/swagger
  - **_Requirements**: 所有需求
  - **_Prompt**: |
    Implement the task for spec tenant-api, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 配置 Swagger 文档：
    - 在 main.ts 中配置 SwaggerModule
    - 设置 API 标题、描述、版本
    - 配置 Bearer JWT 认证
    - 为所有 Controller 添加 @ApiTags
    - 为所有端点添加 @ApiOperation, @ApiResponse
    - 为所有 DTO 添加 @ApiProperty
    Swagger 配置:
    - 路径: /api/docs
    - 标题: Tenant API
    - 版本: 1.0.0
    Restrictions:
    - 使用 @nestjs/swagger
    - 完整的请求/响应示例
    _Leverage: @nestjs/swagger
    _Requirements: 所有
    Success: Swagger 文档完整可用
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 任务依赖关系

```
阶段 1 (项目初始化)
  └── 任务 1-4: 顺序执行
      │
      ▼
阶段 2 (中间件代理)
  └── 任务 5-6: 顺序执行
      │
      ▼
阶段 3-9 (业务模块): 可并行
  ├── 阶段 3: 认证 (任务 7-10)
  ├── 阶段 4: Dashboard (任务 11-12)
  ├── 阶段 5: 用户 (任务 13-14)
  ├── 阶段 6: 持仓/报价 (任务 15-16)
  ├── 阶段 7: 历史/风控 (任务 17-18)
  ├── 阶段 8: 报表 (任务 19-20)
  └── 阶段 9: 设置 (任务 21-25)
      │
      ▼
阶段 10 (WebSocket)
  └── 任务 26: 依赖阶段 3 认证模块
      │
      ▼
阶段 11 (测试和文档)
  └── 任务 27-28: 最后执行
```

## 验收标准

1. 所有 28 个任务完成
2. 服务可在 3002 端口启动
3. 所有 API 端点可访问
4. JWT 认证正常工作
5. 中间件 API 调用正常
6. WebSocket 实时推送正常
7. 单元测试覆盖率 > 80%
8. Swagger 文档完整
