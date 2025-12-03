# 任务文档: 平台核心模块

## 任务概览

本文档将设计文档中的组件分解为可执行的开发任务。

**总任务数**: 17 个任务
**预计文件变更**: 约 30 个文件

---

## 第一阶段: 公共模块和基础设施

- [x] 1. 创建公共模块 - 异常过滤器
  - **文件**: `src/common/filters/http-exception.filter.ts`
  - **描述**: 创建统一的 HTTP 异常过滤器，实现标准化错误响应格式
  - **_Leverage**: `src/modules/auth/guards/` 现有模式
  - **_Requirements**: REQ-1, REQ-2 (错误响应格式)
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家，精通异常处理和过滤器
    Task: 创建 HttpExceptionFilter 实现统一错误响应格式：
    - 捕获所有 HttpException
    - 返回格式: { success: false, error: { code, message, details, timestamp, traceId } }
    - 支持自定义 BusinessException
    - 集成 traceId 生成
    Restrictions:
    - 不修改现有代码
    - 遵循 NestJS 最佳实践
    - 使用中文注释
    _Leverage: 参考 src/modules/auth/guards/ 现有代码模式
    _Requirements: REQ-1, REQ-2
    Success: 过滤器正确捕获异常并返回标准格式，单元测试通过
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 2. 创建公共模块 - 响应拦截器
  - **文件**: `src/common/interceptors/response.interceptor.ts`
  - **描述**: 创建响应拦截器，统一成功响应格式
  - **_Leverage**: NestJS Interceptor 模式
  - **_Requirements**: REQ-2 (API 响应格式)
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 ResponseInterceptor 实现统一成功响应格式：
    - 包装所有成功响应为 { success: true, data: T, meta?: {...} }
    - 支持分页元数据 (page, limit, total, totalPages)
    - 处理空响应和流响应
    Restrictions:
    - 不影响文件下载等特殊响应
    - 遵循 NestJS 拦截器模式
    _Leverage: NestJS 官方文档
    _Requirements: REQ-2
    Success: 所有 API 响应格式统一，分页接口包含正确的 meta 信息
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 3. 创建公共模块 - BusinessException 类
  - **文件**: `src/common/exceptions/business.exception.ts`
  - **描述**: 创建业务异常类，支持错误码
  - **_Leverage**: `src/common/filters/http-exception.filter.ts`
  - **_Requirements**: REQ-1 ~ REQ-7 (错误码)
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 BusinessException 类和错误码常量：
    - 继承 HttpException
    - 支持 code, message, details 参数
    - 创建 ErrorCodes 常量文件定义所有错误码
    - 错误码格式: MODULE_HTTP_SEQ (如 TENANT_404_001)
    Restrictions:
    - 错误码必须唯一
    - 与 HttpExceptionFilter 配合使用
    _Leverage: 设计文档错误码定义
    _Requirements: REQ-1 ~ REQ-7
    Success: BusinessException 可被 HttpExceptionFilter 正确处理，错误码完整定义
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 4. 注册公共模块到 AppModule
  - **文件**: `src/app.module.ts`, `src/main.ts`
  - **描述**: 全局注册异常过滤器和响应拦截器
  - **_Leverage**: `src/common/` 模块
  - **_Requirements**: 所有需求
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 在应用中注册公共模块：
    - 在 main.ts 中全局注册 HttpExceptionFilter
    - 在 main.ts 中全局注册 ResponseInterceptor
    - 创建 CommonModule 导出公共组件
    Restrictions:
    - 不破坏现有功能
    - 确保注册顺序正确
    _Leverage: src/app.module.ts 现有结构
    _Requirements: 所有
    Success: 应用启动正常，所有 API 响应格式统一
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第二阶段: 数据模型扩展

- [x] 5. 扩展 Prisma Schema - Tenant 白标字段
  - **文件**: `prisma/schema.prisma`
  - **描述**: 为 Tenant 模型添加白标配置字段
  - **_Leverage**: 现有 Tenant 模型
  - **_Requirements**: REQ-3 (白标配置)
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: Prisma/PostgreSQL 数据库专家
    Task: 扩展 Tenant 模型：
    - 添加 displayName String? 字段
    - 添加 primaryColor String? 字段
    - 创建数据库迁移脚本
    Restrictions:
    - 字段为可选，不影响现有数据
    - 遵循现有命名规范 (camelCase)
    _Leverage: prisma/schema.prisma 现有结构
    _Requirements: REQ-3
    Success: 迁移成功，现有数据不受影响
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第三阶段: 租户模块扩展

- [x] 6. 扩展 TenantsService - 白标配置
  - **文件**: `src/modules/tenants/tenants.service.ts`, `src/modules/tenants/dto/tenant.dto.ts`
  - **描述**: 添加白标配置更新方法和 DTO
  - **_Leverage**: 现有 TenantsService
  - **_Requirements**: REQ-3
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 扩展 TenantsService：
    - 创建 UpdateBrandingDto (displayName, logoUrl, primaryColor)
    - 添加 updateBranding(id, dto) 方法
    - 验证 primaryColor 格式 (#XXXXXX)
    - 验证 logoUrl 格式 (有效 URL 或 null)
    Restrictions:
    - 复用现有 findOne 方法检查租户存在
    - 使用 class-validator 验证
    _Leverage: src/modules/tenants/tenants.service.ts
    _Requirements: REQ-3
    Success: 白标配置可正确更新，验证生效
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 7. 扩展 TenantsService - 状态管理
  - **文件**: `src/modules/tenants/tenants.service.ts`
  - **描述**: 添加状态转换方法和验证
  - **_Leverage**: 设计文档状态转换规则
  - **_Requirements**: REQ-2
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 扩展 TenantsService 状态管理：
    - 添加 terminate(id) 方法
    - 添加 validateStatusTransition(current, target) 私有方法
    - 状态转换规则:
      - PENDING → ACTIVE, CANCELLED
      - ACTIVE → SUSPENDED, EXPIRED
      - SUSPENDED → ACTIVE, CANCELLED
      - EXPIRED → ACTIVE, CANCELLED
    - 无效转换抛出 BusinessException (TENANT_422_003)
    Restrictions:
    - 状态变更需记录审计日志 (可选)
    - 复用现有 update 方法
    _Leverage: src/modules/tenants/tenants.service.ts
    _Requirements: REQ-2
    Success: 状态转换正确验证，无效转换被拒绝
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 8. 扩展 TenantsController - 新端点
  - **文件**: `src/modules/tenants/tenants.controller.ts`
  - **描述**: 添加白标和终止端点
  - **_Leverage**: 现有 TenantsController
  - **_Requirements**: REQ-2, REQ-3
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 扩展 TenantsController：
    - 添加 PATCH /:id/branding 端点
    - 添加 POST /:id/terminate 端点
    - 添加 Swagger 文档注解
    Restrictions:
    - 复用现有 Guard 和装饰器
    - 遵循 RESTful 设计
    _Leverage: src/modules/tenants/tenants.controller.ts
    _Requirements: REQ-2, REQ-3
    Success: 新端点可访问，Swagger 文档正确显示
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第四阶段: 实例模块扩展

- [x] 9. 扩展 InstancesService - 健康检查
  - **文件**: `src/modules/instances/instances.service.ts`, `src/modules/instances/instances.module.ts`
  - **描述**: 添加中间件健康检查功能
  - **_Leverage**: MT5 Middleware `/health` 端点
  - **_Requirements**: REQ-4
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家，熟悉 HttpModule
    Task: 扩展 InstancesService 健康检查：
    - 在 InstancesModule 导入 HttpModule
    - 添加 checkHealth(id) 方法调用中间件 /health
    - 返回 HealthCheckResult 结构
    - 超时设置 5 秒
    - 错误时返回 offline 状态
    Restrictions:
    - 使用 @nestjs/axios HttpService
    - 处理网络错误
    _Leverage: MT5 Middleware /health 端点
    _Requirements: REQ-4
    Success: 健康检查正确返回实例状态
    Instructions: 完成后使用 log-implementation ��录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 10. 扩展 InstancesService - 配额验证
  - **文件**: `src/modules/instances/instances.service.ts`
  - **描述**: 添加实例配额验证
  - **_Leverage**: TenantsService
  - **_Requirements**: REQ-4
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 扩展 InstancesService 配额验证：
    - 添加 validateQuota(tenantId) 方法
    - 检查租户当前实例数 vs maxInstances
    - 在 create 方法中调用配额验证
    - 超出配额抛出 BusinessException (TENANT_422_002)
    Restrictions:
    - 注入 TenantsService 或 PrismaService
    - 配额检查在创建前执行
    _Leverage: src/modules/tenants/tenants.service.ts
    _Requirements: REQ-4
    Success: 超出配额时创建被拒绝
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 11. 扩展 InstancesController - 健康检查端点
  - **文件**: `src/modules/instances/instances.controller.ts`
  - **描述**: 添加健康检查触发端点
  - **_Leverage**: 现有 InstancesController
  - **_Requirements**: REQ-4
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 扩展 InstancesController：
    - 添加 POST /:id/health-check 端点
    - 返回 HealthCheckResult
    - 添加 Swagger 文档
    Restrictions:
    - 复用现有认证 Guard
    _Leverage: src/modules/instances/instances.controller.ts
    _Requirements: REQ-4
    Success: 健康检查端点可访问
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第五阶段: 新模块开发

- [x] 12. 创建订阅计划模块
  - **文件**: `src/modules/subscriptions/` 目录
  - **描述**: 创建完整的订阅计划模块
  - **_Leverage**: 设计文档订阅计划配置
  - **_Requirements**: REQ-5
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 SubscriptionsModule：
    - 创建 subscriptions.module.ts
    - 创建 subscriptions.service.ts:
      - getPlans() 返回所有计划
      - getPlanByName(name) 返回指定计划
      - changeTenantPlan(tenantId, plan) 变更订阅
      - checkDowngradeImpact(tenantId, targetPlan) 检查降级影响
    - 创建 subscriptions.controller.ts:
      - GET /subscriptions/plans
      - POST /tenants/:id/subscription
    - 创建 dto/subscription.dto.ts
    - 计划配置使用常量文件或 SystemSetting
    Restrictions:
    - 遵循现有模块结构
    - 注入 TenantsService
    _Leverage: src/modules/tenants/ 结构
    _Requirements: REQ-5
    Success: 订阅计划查询和变更功能正常
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 13. 创建账单模块
  - **文件**: `src/modules/invoices/` 目录
  - **描述**: 创建完整的账单管理模块
  - **_Leverage**: 现有 Invoice Prisma 模型
  - **_Requirements**: REQ-6
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 InvoicesModule：
    - 创建 invoices.module.ts
    - 创建 invoices.service.ts:
      - create(tenantId, period) 创建账单
      - findAll(query) 分页查询
      - findOne(id) 获取详情
      - findByTenant(tenantId) 租户账单
      - markAsPaid(id) 标记已支付
      - cancel(id) 取消账单
      - generateInvoiceNo() 生成账单号 INV-YYYYMM-XXXX
    - 创建 invoices.controller.ts:
      - GET /invoices
      - POST /invoices
      - GET /invoices/:id
      - POST /invoices/:id/pay
      - POST /invoices/:id/cancel
    - 创建 dto/invoice.dto.ts
    Restrictions:
    - 已支付账单不能取消
    - 账单号唯一
    _Leverage: prisma/schema.prisma Invoice 模型
    _Requirements: REQ-6
    Success: 账单 CRUD 和状态管理功能正常
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 14. 创建租户管理员模块
  - **文件**: `src/modules/tenant-admins/` 目录
  - **描述**: 创建租户管理员管理模块
  - **_Leverage**: 现有 TenantAdmin Prisma 模型
  - **_Requirements**: REQ-7
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 TenantAdminsModule：
    - 创建 tenant-admins.module.ts
    - 创建 tenant-admins.service.ts:
      - create(tenantId, dto) 创建管理员
      - findByTenant(tenantId) 租户管理员列表
      - findOne(id) 获取详情
      - resetPassword(id) 重置密码 (生成临时密码)
      - disable(id) 禁用账号
      - enable(id) 启用账号
    - 创建 tenant-admins.controller.ts:
      - GET /tenants/:tenantId/admins
      - POST /tenants/:tenantId/admins
      - GET /tenant-admins/:id
      - POST /tenant-admins/:id/reset-password
      - POST /tenant-admins/:id/disable
      - POST /tenant-admins/:id/enable
    - 创建 dto/tenant-admin.dto.ts
    - 复用 AuthService.hashPassword 方法
    Restrictions:
    - 邮箱在租户内唯一
    - 密码哈希存储
    _Leverage: prisma/schema.prisma TenantAdmin 模型, src/modules/auth/auth.service.ts
    _Requirements: REQ-7
    Success: 租户管理员 CRUD 和密码管理功能正常
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 15. 创建交易数据模块 - 中间件集成服务
  - **文件**: `src/modules/trading-data/` 目录
  - **描述**: 创建交易数据服务，集成 MT5 中间件 API 获取交易数据
  - **_Leverage**: MT5 Middleware API (`/api/v1/trading/history/*`, `/api/v1/monitor/stats`)
  - **_Requirements**: REQ-8
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家，熟悉 HTTP 客户端集成
    Task: 创建 TradingDataModule：
    - 创建 trading-data.module.ts
    - 创建 trading-data.service.ts:
      - getGlobalStats(query: StatsQueryDto) 获取全平台统计
        - 聚合所有活跃实例的交易数据
        - 返回: 总订单数、总成交数、总交易额、各租户排名
      - getTenantTradingStats(tenantId, query) 获取租户交易统计
        - 调用租户实例的 /api/v1/monitor/stats
      - getTradeHistory(query: TradeHistoryQueryDto) 获取交易记录
        - 支持按租户、时间范围、品种筛选
        - 调用实例 /api/v1/trading/history/orders
        - 分页返回
      - getPositions(tenantId, query) 获取持仓
        - 调用实例 /api/v1/trading/positions
      - aggregateInstancesData(instanceIds) 聚合多实例数据
    - 创建 middleware-client.service.ts:
      - 封装中间件 HTTP 调用
      - 处理认证 (api_key)
      - 超时和重试机制
    - 注入 InstancesService 获取实例连接信息
    Restrictions:
    - 只读操作，不修改中间件数据
    - 处理中间件连接失败情况
    - 超时设置 10 秒
    _Leverage: E:\MT5_Project\MT5-middleware API 文档
    _Requirements: REQ-8
    Success: 可成功调用中间件 API 获取交易数据并聚合
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

- [x] 16. 创建交易数据模块 - Controller 和 DTO
  - **文件**: `src/modules/trading-data/trading-data.controller.ts`, `src/modules/trading-data/dto/`
  - **描述**: 创建交易数据查询 API 端点
  - **_Leverage**: Task 15 TradingDataService
  - **_Requirements**: REQ-8
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 后端开发专家
    Task: 创建 TradingDataController：
    - 创建 dto/stats-query.dto.ts:
      - timeRange: 'today' | 'week' | 'month' | 'custom'
      - startDate?: Date
      - endDate?: Date
    - 创建 dto/trade-history-query.dto.ts:
      - tenantId?: string
      - symbol?: string
      - type?: 'buy' | 'sell'
      - page, limit
      - timeRange 相关字段
    - 创建 trading-data.controller.ts:
      - GET /trading-data/global-stats - 全局统计
      - GET /trading-data/tenants/:tenantId/stats - 租户统计
      - GET /trading-data/trades - 交易记录列表 (支持筛选)
      - GET /trading-data/tenants/:tenantId/positions - 租户持仓
      - GET /trading-data/tenants/:tenantId/users - 租户交易用户列表
    - 添加 Swagger 文档
    - 所有端点需要 Platform Admin 认证
    Restrictions:
    - 使用 class-validator 验证输入
    - 遵循 RESTful 设计
    _Leverage: src/modules/trading-data/trading-data.service.ts
    _Requirements: REQ-8
    Success: API 端点可访问，返回正确格式数据
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 第六阶段: 集成和测试

- [x] 17. 集成测试和文档
  - **文件**: 多个测试文件, `src/app.module.ts`
  - **描述**: 编写集成测试，更新 Swagger 文档
  - **_Leverage**: 所有新模块
  - **_Requirements**: 所有
  - **_Prompt**: |
    Implement the task for spec platform-core, first run spec-workflow-guide to get the workflow guide then implement the task:

    Role: NestJS 测试专家
    Task: 完成集成测试和文档：
    - 在 AppModule 注册所有新模块 (包括 TradingDataModule)
    - 为关键流程编写 E2E 测试:
      - 租户生命周期: 创建 → 激活 → 暂停 → 恢复
      - 实例健康检查
      - 订阅变更
      - 账单流程
      - 交易数据查询 (Mock 中间件响应)
    - 更新 Swagger 配置确保所有端点文档化
    - 验证所有 API 响应格式统一
    Restrictions:
    - 使用 Jest + Supertest
    - 测试数据隔离
    - 交易数据测试使用 Mock 中间件
    _Leverage: 所有新模块
    _Requirements: 所有 (REQ-1 ~ REQ-8)
    Success: E2E 测试通过，Swagger 文档完整
    Instructions: 完成后使用 log-implementation 记录实现，然后在 tasks.md 中标记为完成 [x]

---

## 任务依赖关系

```
Phase 1 (公共模块)
  1 → 2 → 3 → 4

Phase 2 (数据模型)
  4 → 5

Phase 3 (租户模块)
  5 → 6 → 7 → 8

Phase 4 (实例模块)
  4 → 9 → 10 → 11

Phase 5 (新模块) - 可并行
  8 → 12 (订阅计划)
  8 → 13 (账单)
  8 → 14 (租户管理员)
  11 → 15 → 16 (交易数据，依赖实例模块)

Phase 6 (集成)
  12, 13, 14, 16 → 17
```

## 文件变更清单

| 阶段 | 新增文件 | 修改文件 |
|------|---------|---------|
| Phase 1 | `src/common/filters/http-exception.filter.ts`, `src/common/interceptors/response.interceptor.ts`, `src/common/exceptions/business.exception.ts`, `src/common/exceptions/error-codes.ts`, `src/common/common.module.ts` | `src/app.module.ts`, `src/main.ts` |
| Phase 2 | `prisma/migrations/xxx_add_branding.ts` | `prisma/schema.prisma` |
| Phase 3 | - | `src/modules/tenants/tenants.service.ts`, `src/modules/tenants/tenants.controller.ts`, `src/modules/tenants/dto/tenant.dto.ts` |
| Phase 4 | - | `src/modules/instances/instances.module.ts`, `src/modules/instances/instances.service.ts`, `src/modules/instances/instances.controller.ts` |
| Phase 5 | `src/modules/subscriptions/*`, `src/modules/invoices/*`, `src/modules/tenant-admins/*`, `src/modules/trading-data/*` | `src/app.module.ts` |
| Phase 6 | `test/e2e/*.e2e-spec.ts` | `src/app.module.ts` |
