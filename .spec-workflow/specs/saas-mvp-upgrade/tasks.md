# Tasks Document - SaaS MVP Upgrade

## Phase 1: Platform API 升级

### 1.1 平台管理员认证模块

- [ ] 1.1.1 创建 PlatformAdmin Prisma 模型
  - File: apps/platform-service/prisma/schema.prisma
  - 添加 PlatformAdmin 模型（id, email, password, name, role, status, timestamps）
  - 添加 AdminRole 枚举（SUPER_ADMIN, OPERATOR）
  - Purpose: 定义平台管理员数据结构
  - _Leverage: 现有 schema.prisma 模式_
  - _Requirements: REQ-1.1_

- [ ] 1.1.2 实现 AuthModule 认证服务
  - File: apps/platform-service/src/modules/auth/auth.service.ts
  - 实现 login() - 邮箱密码验证，返回 TokenPair
  - 实现 refreshToken() - Refresh Token 轮换
  - 实现 logout() - 清除 Redis 中的 Token
  - Purpose: 平台管理员 JWT 认证逻辑
  - _Leverage: tenant-api/src/auth/auth.service.ts 模式_
  - _Requirements: REQ-1.1_

- [ ] 1.1.3 创建 AuthController 认证端点
  - File: apps/platform-service/src/modules/auth/auth.controller.ts
  - POST /auth/login - 管理员登录
  - POST /auth/refresh - 刷新 Token
  - POST /auth/logout - 登出
  - Purpose: 暴露认证 API 端点
  - _Leverage: tenant-api/src/auth/auth.controller.ts_
  - _Requirements: REQ-1.1_

- [ ] 1.1.4 实现角色权限守卫
  - File: apps/platform-service/src/common/guards/roles.guard.ts
  - 创建 @Roles() 装饰器
  - 实现 RolesGuard - 检查管理员角色
  - super_admin 拥有所有权限，operator 只读
  - Purpose: 基于角色的访问控制
  - _Leverage: 设计文档 1.1 AuthModule_
  - _Requirements: REQ-1.1_

- [ ] 1.1.5 编写 Auth 模块单元测试
  - File: apps/platform-service/src/modules/auth/auth.service.spec.ts
  - 测试 Token 生成、验证、刷新、过期场景
  - 测试角色权限控制
  - 覆盖率目标 ≥ 90%
  - Purpose: 确保认证逻辑正确性
  - _Requirements: REQ-1.6_

### 1.2 租户管理模块

- [ ] 1.2.1 完善 Tenant Prisma 模型
  - File: apps/platform-service/prisma/schema.prisma
  - 确保 Tenant 模型包含 domain（唯一）、status、deletedAt
  - 添加与 Plan、Middleware 的关联
  - Purpose: 完善租户数据结构
  - _Leverage: 现有 schema.prisma_
  - _Requirements: REQ-1.2_

- [ ] 1.2.2 实现 TenantsService CRUD 服务
  - File: apps/platform-service/src/modules/tenants/tenants.service.ts
  - 实现 create() - 验证域名唯一性
  - 实现 findAll() - 分页查询
  - 实现 update() - 记录审计日志
  - 实现 disable() - 清除 Redis 缓存
  - 实现 delete() - 软删除
  - Purpose: 租户 CRUD 业务逻辑
  - _Leverage: 现有 tenants.service.ts_
  - _Requirements: REQ-1.2_

- [ ] 1.2.3 创建审计日志服务
  - File: apps/platform-service/src/common/services/audit-log.service.ts
  - 记录租户变更操作（who, when, what, before, after）
  - 存储到 AuditLog 表
  - Purpose: 追踪所有敏感操作
  - _Requirements: REQ-1.2_

- [ ] 1.2.4 实现租户缓存清除逻辑
  - File: apps/platform-service/src/modules/tenants/tenants.service.ts
  - 禁用租户时清除 Redis 缓存键
  - 缓存键格式: tenant:{tenantId}:*
  - Purpose: 确保禁用立即生效
  - _Requirements: REQ-1.2_

- [ ] 1.2.5 编写租户管理集成测试
  - File: apps/platform-service/test/tenants.e2e-spec.ts
  - 测试 CRUD 全流程
  - 测试域名唯一性约束
  - 测试软删除和缓存清除
  - Purpose: 验证租户管理端到端流程
  - _Requirements: REQ-1.6_

### 1.3 套餐配置模块

- [ ] 1.3.1 创建 Plan Prisma 模型
  - File: apps/platform-service/prisma/schema.prisma
  - 添加 Plan 模型（name, modules[], limits, price）
  - 建立 Tenant-Plan 关联
  - Purpose: 定义套餐数据结构
  - _Requirements: REQ-1.3_

- [ ] 1.3.2 实现 SubscriptionsService 套餐服务
  - File: apps/platform-service/src/modules/subscriptions/subscriptions.service.ts
  - 实现 createPlan() - 创建套餐
  - 实现 assignPlan() - 分配套餐给租户
  - 实现 checkLimit() - 检查资源限制
  - Purpose: 套餐管理业务逻辑
  - _Leverage: 设计文档 1.3 SubscriptionsModule_
  - _Requirements: REQ-1.3_

- [ ] 1.3.3 实现套餐限制检查中间件
  - File: apps/platform-service/src/common/guards/plan-limit.guard.ts
  - 检查 MT5 服务器数量限制
  - 检查用户数量限制
  - 返回 403 并提示升级
  - Purpose: 强制套餐资源限制
  - _Requirements: REQ-1.3_

- [ ] 1.3.4 实现套餐缓存策略
  - File: apps/platform-service/src/modules/subscriptions/subscriptions.service.ts
  - 套餐信息缓存 TTL 10分钟
  - 套餐变更时主动清除缓存
  - Purpose: 优化查询性能
  - _Requirements: REQ-1.3_

- [ ] 1.3.5 编写套餐模块单元测试
  - File: apps/platform-service/src/modules/subscriptions/subscriptions.service.spec.ts
  - 测试套餐限制检查逻辑
  - 测试缓存清除
  - Purpose: 验证套餐功能正确性
  - _Requirements: REQ-1.6_

### 1.4 中间件实例管理模块

- [ ] 1.4.1 完善 Middleware Prisma 模型
  - File: apps/platform-service/prisma/schema.prisma
  - 确保 Middleware 模型包含 host, port, status
  - 添加 MiddlewareStatus 枚举
  - Purpose: 定义中间件实例数据结构
  - _Leverage: 现有 schema.prisma_
  - _Requirements: REQ-1.4_

- [ ] 1.4.2 实现 MiddlewareService 管理服务
  - File: apps/platform-service/src/modules/middleware/middleware.service.ts
  - 实现 create() - 添加中间件实例
  - 实现 findAll() - 列表查询
  - 实现 healthCheck() - 健康检查
  - 实现 updateStatus() - 更新状态
  - Purpose: 中间件实例管理逻辑
  - _Leverage: 现有 middleware 模块_
  - _Requirements: REQ-1.4_

- [ ] 1.4.3 实现健康检查定时任务
  - File: apps/platform-service/src/modules/middleware/middleware-health.scheduler.ts
  - 30秒间隔检查所有中间件
  - 不可用时标记 offline 并告警
  - Purpose: 自动监控中间件状态
  - _Leverage: 现有 health-checker.service.ts_
  - _Requirements: REQ-1.4_

- [ ] 1.4.4 实现中间件配置缓存
  - File: apps/platform-service/src/modules/middleware/middleware.service.ts
  - 中间件配置缓存 TTL 5分钟
  - 配置变更时主动清除缓存
  - Purpose: 优化查询性能
  - _Requirements: REQ-1.4_

### 1.5 中间件分配模块

- [ ] 1.5.1 实现 MiddlewareAssignmentService
  - File: apps/platform-service/src/modules/middleware-assignment/middleware-assignment.service.ts
  - 实现 assign() - 分配中间件给租户
  - 实现 unassign() - 取消分配
  - 实现 reassign() - 重新分配（迁移）
  - Purpose: 中间件分配业务逻辑
  - _Leverage: 现有 middleware-assignment 模块_
  - _Requirements: REQ-1.5_

- [ ] 1.5.2 实现分配前验证逻辑
  - File: apps/platform-service/src/modules/middleware-assignment/middleware-assignment.service.ts
  - 验证中间件状态为 online
  - 验证租户无活跃连接（取消分配时）
  - Purpose: 确保分配安全性
  - _Requirements: REQ-1.5_

- [ ] 1.5.3 创建 MiddlewareAssignment Controller
  - File: apps/platform-service/src/modules/middleware-assignment/middleware-assignment.controller.ts
  - POST /middleware-assignments - 分配
  - DELETE /middleware-assignments/:tenantId - 取消
  - PUT /middleware-assignments/:tenantId - 重新分配
  - Purpose: 暴露分配 API 端点
  - _Requirements: REQ-1.5_

- [ ] 1.5.4 编写中间件分配集成测试
  - File: apps/platform-service/test/middleware-assignment.e2e-spec.ts
  - 测试分配/取消/迁移流程
  - 测试验证逻辑
  - Purpose: 验证分配端到端流程
  - _Requirements: REQ-1.6_

### 1.6 Phase 1 测试与验证

- [ ] 1.6.1 生成 OpenAPI 文档
  - File: apps/platform-service/src/main.ts
  - 配置 Swagger 模块
  - 生成 API 文档
  - Purpose: API 契约文档化
  - _Requirements: REQ-1.6_

- [ ] 1.6.2 编写 Phase 1 集成测试套件
  - File: apps/platform-service/test/*.e2e-spec.ts
  - 覆盖所有 API 端点
  - 使用真实数据库
  - Purpose: 验证 API 正确性
  - _Requirements: REQ-1.6_

- [ ] 1.6.3 执行手动验收测试
  - 按照验收测试清单执行
  - 记录发现的缺陷
  - 修复并重新测试
  - Purpose: 确保功能符合需求
  - _Requirements: REQ-1.6_

---

## Phase 2: shared-auth 共享认证包

### 2.1 包初始化与接口定义

- [ ] 2.1.1 创建 shared-auth 包结构
  - File: packages/shared-auth/
  - 创建 package.json、tsconfig.json
  - 设置 npm workspace 引用
  - Purpose: 初始化共享包
  - _Requirements: REQ-2.1_

- [ ] 2.1.2 定义 JWT Payload 接口
  - File: packages/shared-auth/src/interfaces/jwt-payload.interface.ts
  - 定义 JwtPayload 接口（sub, tenantId, email, roles, type, iat, exp）
  - 导出类型定义
  - Purpose: 统一 JWT 结构
  - _Leverage: 设计文档 2.1 Package Structure_
  - _Requirements: REQ-2.1_

- [ ] 2.1.3 定义用户上下文接口
  - File: packages/shared-auth/src/interfaces/user-context.interface.ts
  - 定义 UserContext 接口
  - 定义 TenantContext 接口
  - Purpose: 统一上下文结构
  - _Requirements: REQ-2.1_

### 2.2 Guards 实现

- [ ] 2.2.1 实现 JwtAuthGuard
  - File: packages/shared-auth/src/guards/jwt-auth.guard.ts
  - 提取并验证 JWT Token
  - 处理 Token 过期和无效场景
  - 支持 @Public() 装饰器跳过
  - Purpose: 统一 JWT 验证
  - _Leverage: tenant-api/src/auth/guards/jwt-auth.guard.ts_
  - _Requirements: REQ-2.1_

- [ ] 2.2.2 实现 TenantAuthGuard
  - File: packages/shared-auth/src/guards/tenant-auth.guard.ts
  - 校验 JWT 中的 tenantId
  - 检查租户状态（disabled → 403）
  - 不存在返回 404（不泄露信息）
  - 支持白名单路径跳过
  - Purpose: 强制租户隔离
  - _Leverage: tenant-api/src/auth/guards/tenant.guard.ts_
  - _Requirements: REQ-2.2_

- [ ] 2.2.3 实现 RateLimitGuard
  - File: packages/shared-auth/src/guards/rate-limit.guard.ts
  - 基于 Redis 的滑动窗口限流
  - 支持按租户/用户/IP 三种维度
  - 80% 阈值告警日志
  - 从套餐读取限额配置
  - Purpose: API 限流保护
  - _Leverage: 设计文档 2.5 RateLimitGuard_
  - _Requirements: REQ-2.5_

### 2.3 Decorators 实现

- [ ] 2.3.1 实现 @CurrentUser 装饰器
  - File: packages/shared-auth/src/decorators/current-user.decorator.ts
  - 从请求上下文提取用户信息
  - 支持 @CurrentUser('email') 形式
  - Purpose: 便捷获取当前用户
  - _Leverage: tenant-api/src/auth/decorators/_
  - _Requirements: REQ-2.3_

- [ ] 2.3.2 实现 @CurrentTenant 装饰器
  - File: packages/shared-auth/src/decorators/current-tenant.decorator.ts
  - 从请求上下文提取租户 ID
  - Purpose: 便捷获取当前租户
  - _Requirements: REQ-2.3_

- [ ] 2.3.3 实现 @Public 装饰器
  - File: packages/shared-auth/src/decorators/public.decorator.ts
  - 标记公开端点，跳过 JWT 验证
  - Purpose: 标记无需认证的端点
  - _Requirements: REQ-2.1_

- [ ] 2.3.4 实现 @RequireScopes 装饰器
  - File: packages/shared-auth/src/decorators/require-scopes.decorator.ts
  - 检查 Token 中的 scopes
  - Purpose: 细粒度权限控制
  - _Leverage: 现有 require-scopes.decorator.ts_
  - _Requirements: REQ-2.3_

### 2.4 Middleware 实现

- [ ] 2.4.1 实现 RequestLoggerMiddleware
  - File: packages/shared-auth/src/middleware/request-logger.middleware.ts
  - 生成或使用传入的 Request ID
  - 记录请求日志（requestId, tenantId, userId, path, duration）
  - 设置 X-Request-ID 响应头
  - Purpose: 统一请求日志格式
  - _Leverage: 设计文档 2.6 RequestLoggerMiddleware_
  - _Requirements: REQ-2.4_

### 2.5 模块导出与集成

- [ ] 2.5.1 创建 SharedAuthModule
  - File: packages/shared-auth/src/shared-auth.module.ts
  - 实现 forRoot() / forRootAsync() 配置方法
  - 导出所有 Guards、Decorators、Middleware
  - Purpose: 提供模块化导入方式
  - _Requirements: REQ-2.1_

- [ ] 2.5.2 创建包入口文件
  - File: packages/shared-auth/src/index.ts
  - 导出所有公共 API
  - 导出类型定义
  - Purpose: 统一导出入口
  - _Requirements: REQ-2.1_

- [ ] 2.5.3 更新 Tenant API 使用 shared-auth
  - File: apps/tenant-api/src/app.module.ts
  - 替换本地 Guards 为 shared-auth
  - 验证功能不变
  - Purpose: 验证包集成
  - _Requirements: REQ-2.6_

- [ ] 2.5.4 更新 Platform API 使用 shared-auth
  - File: apps/platform-service/src/app.module.ts
  - 引入 SharedAuthModule
  - 配置 JWT 验证
  - Purpose: Platform API 集成
  - _Requirements: REQ-2.6_

### 2.6 Phase 2 测试与验证

- [ ] 2.6.1 编写 JwtAuthGuard 单元测试
  - File: packages/shared-auth/src/guards/jwt-auth.guard.spec.ts
  - 测试有效/无效/过期 Token
  - 测试 @Public 跳过逻辑
  - 覆盖率目标 ≥ 90%
  - Purpose: 验证 JWT 验证逻辑
  - _Requirements: REQ-2.6_

- [ ] 2.6.2 编写 TenantAuthGuard 单元测试
  - File: packages/shared-auth/src/guards/tenant-auth.guard.spec.ts
  - 测试租户匹配/禁用/不存在场景
  - 测试白名单跳过
  - 覆盖率目标 100%
  - Purpose: 验证租户隔离逻辑
  - _Requirements: REQ-2.6_

- [ ] 2.6.3 编写租户隔离集成测试
  - File: apps/tenant-api/test/tenant-isolation.e2e-spec.ts
  - 租户 A Token 访问租户 B 资源 → 404
  - 覆盖所有资源类型
  - 覆盖率目标 100%
  - Purpose: 验证跨租户隔离
  - _Requirements: REQ-2.6_

- [ ] 2.6.4 执行安全审计
  - 审计认证逻辑
  - 检查 Token 处理安全性
  - 验证租户隔离完整性
  - Purpose: 确保认证安全
  - _Requirements: REQ-2.6_

---

## MVP 验收测试

### 3.1 跨模块集成测试

- [ ] 3.1.1 编写 Platform-Tenant 集成测试
  - File: e2e/platform-tenant.e2e-spec.ts
  - Platform 禁用租户 → Tenant API 拒绝请求
  - Platform 分配中间件 → Tenant API 可连接
  - Purpose: 验证模块间数据一致性
  - _Requirements: REQ-MVP-1_

- [ ] 3.1.2 编写端到端业务场景测试
  - File: e2e/business-flows.e2e-spec.ts
  - 场景 1：创建租户 → 分配套餐 → 分配中间件 → 登录成功
  - 场景 2：配置 MT5 服务器 → 添加用户 → 用户交易
  - Purpose: 验证完整业务流程
  - _Requirements: REQ-MVP-1_

### 3.2 性能与安全测试

- [ ] 3.2.1 执行性能基准测试
  - API 响应时间 P95 < 200ms
  - WebSocket 推送延迟 < 100ms
  - 记录基准数据
  - Purpose: 验证性能指标
  - _Requirements: REQ-MVP-1_

- [ ] 3.2.2 执行安全渗透测试
  - 测试 SQL 注入
  - 测试 XSS 攻击
  - 测试 JWT Token 伪造
  - 测试租户越权访问
  - Purpose: 验证安全性
  - _Requirements: REQ-MVP-1_

### 3.3 发布验收

- [ ] 3.3.1 执行最终验收测试
  - 产品负责人审核所有功能
  - 确认符合需求规格
  - 标记为可发布状态
  - Purpose: 最终发布审批
  - _Requirements: REQ-MVP-1_

---

## Task Dependencies

```
Phase 1 (Platform API):
1.1.1 → 1.1.2 → 1.1.3 → 1.1.4 → 1.1.5
1.2.1 → 1.2.2 → 1.2.3, 1.2.4 → 1.2.5
1.3.1 → 1.3.2 → 1.3.3, 1.3.4 → 1.3.5
1.4.1 → 1.4.2 → 1.4.3, 1.4.4
1.5.1 → 1.5.2 → 1.5.3 → 1.5.4
1.6.1, 1.6.2 → 1.6.3

Phase 2 (shared-auth):
2.1.1 → 2.1.2, 2.1.3
2.1.2, 2.1.3 → 2.2.1, 2.2.2, 2.2.3
2.2.* → 2.3.*, 2.4.1
2.3.*, 2.4.1 → 2.5.1 → 2.5.2
2.5.2 → 2.5.3, 2.5.4
2.5.3, 2.5.4 → 2.6.1, 2.6.2, 2.6.3 → 2.6.4

MVP 验收:
Phase 1 + Phase 2 完成 → 3.1.1, 3.1.2
3.1.* → 3.2.1, 3.2.2
3.2.* → 3.3.1
```

## Summary

| 阶段 | 任务数 | 预计覆盖需求 |
|------|--------|-------------|
| Phase 1: Platform API | 22 | REQ-1.1 ~ REQ-1.6 |
| Phase 2: shared-auth | 18 | REQ-2.1 ~ REQ-2.6 |
| MVP 验收 | 5 | REQ-MVP-1 |
| **总计** | **45** | **全部需求** |
