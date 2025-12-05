# Tasks Document: SaaS Multi-Tenant Architecture

## Phase 1: 数据库 Schema 和基础设施 (P0)

- [x] 1.1 创建 Prisma Schema - MtServer 模型
  - File: `apps/platform-service/prisma/schema.prisma`
  - 新增 `MtServer` 模型，包含 `platformType`, `middlewareUrl`, `serverAddress` 等字段
  - 新增 `TenantDomain` 模型用于白标域名映射
  - 新增 `PlatformType` 枚举 (MT5/MT4) 和 `DeploymentMode` 枚举 (SHARED/DEDICATED)
  - Purpose: 建立多租户数据库基础结构
  - _Leverage: 现有 Tenant 模型_
  - _Requirements: REQ-MT-1, REQ-MT-2_
  - _Completed: 2025-12-05_

- [x] 1.2 执行数据库迁移
  - File: `apps/platform-service/prisma/`
  - 使用 `npx prisma db push` 同步数据库结构
  - 验证数据库表结构正确
  - Purpose: 应用数据库 Schema 变更
  - _Leverage: 现有迁移工具链_
  - _Requirements: REQ-MT-1_
  - _Completed: 2025-12-05_

- [x] 1.3 创建种子数据脚本
  - File: `apps/platform-service/prisma/seed.ts`
  - 添加测试租户和 MT5 服务器配置
  - 包含示例白标域名映射
  - Purpose: 提供开发和测试数据
  - _Leverage: 现有 seed 脚本结构_
  - _Requirements: REQ-MT-2_
  - _Completed: 2025-12-05_

## Phase 2: TypeScript 适配层 (P0)

- [x] 2.1 创建 TradingPlatformAdapter 抽象类
  - File: `apps/tenant-api/src/middleware-proxy/adapters/trading-platform.adapter.ts`
  - File: `apps/tenant-api/src/middleware-proxy/adapters/types.ts`
  - 定义 `PlatformType` 枚举 (MT5, MT4)
  - 定义统一接口：`TradingUser`, `TradingPosition`, `TradingOrder`, `TradingDeal`, `TradingSymbol`, `TradingQuote`
  - 创建抽象类 `TradingPlatformAdapter` 定义所有方法签名
  - Purpose: 建立平台无关的统一 API 接口
  - _Requirements: REQ-MT-3, REQ-UM-1_
  - _Completed: 2025-12-05_

- [x] 2.2 实现 MT5Adapter
  - File: `apps/tenant-api/src/middleware-proxy/adapters/mt5.adapter.ts`
  - 继承 `TradingPlatformAdapter`
  - 实现 MT5 中间件端点映射 (`/api/v1/account/users` 等)
  - 实现字段转换 (`margin_free` -> `marginFree` 等)
  - 包含完整的数据转换方法
  - Purpose: 封装 MT5 中间件 API 调用
  - _Leverage: TradingPlatformAdapter, HttpService_
  - _Requirements: REQ-UM-1 ~ REQ-UM-8_
  - _Completed: 2025-12-05_

- [ ] 2.3 实现 MT4Adapter
  - File: `apps/tenant-api/src/middleware-proxy/adapters/mt4.adapter.ts`
  - 继承 `TradingPlatformAdapter`
  - 实现 MT4 中间件端点映射 (`/api/v1/accounts` 等)
  - 实现字段转换 (`account_id` -> `login`, `free_margin` -> `marginFree` 等)
  - Purpose: 封装 MT4 中间件 API 调用
  - _Leverage: TradingPlatformAdapter, HttpService_
  - _Requirements: REQ-UM-1 ~ REQ-UM-8_
  - _Status: 待 MT4 中间件就绪后实现_

- [x] 2.4 创建 AdapterFactory
  - File: `apps/tenant-api/src/middleware-proxy/adapters/adapter.factory.ts`
  - 实现工厂方法根据 `platformType` 创建对应适配器
  - 实现适配器缓存机制 (`Map<string, CachedAdapter>`)
  - 实现空闲适配器自动清理 (30分钟超时)
  - 注册为 NestJS Injectable 服务
  - Purpose: 动态创建和缓存平台适配器
  - _Leverage: MT5Adapter_
  - _Requirements: REQ-MT-3_
  - _Completed: 2025-12-05_

- [x] 2.5 实现 TradingService 和 MtServerService
  - File: `apps/tenant-api/src/middleware-proxy/services/trading.service.ts`
  - File: `apps/tenant-api/src/middleware-proxy/services/mt-server.service.ts`
  - MtServerService: MT 服务器 CRUD、密码加密/解密、服务器配置管理
  - TradingService: 多租户路由、自动认证、统一交易接口
  - 实现 `TenantContext` 基于租户自动解析服务器
  - 实现批量操作支持
  - Purpose: 提供统一的交易平台服务层
  - _Leverage: PrismaService, AdapterFactory_
  - _Requirements: REQ-MT-3, REQ-UM-1 ~ REQ-UM-8_
  - _Completed: 2025-12-05_

- [x] 2.6 更新 MiddlewareProxyModule
  - File: `apps/tenant-api/src/middleware-proxy/middleware-proxy.module.ts`
  - 注册所有适配器和服务 (AdapterFactory, MtServerService, TradingService)
  - 导出服务供其他模块使用
  - Purpose: 模块化交易平台功能
  - _Leverage: NestJS Module 系统_
  - _Requirements: REQ-MT-3_
  - _Completed: 2025-12-05_

## Phase 3: MT5 中间件多租户改造 (P0) - **已跳过**

> **注意**: 此阶段已跳过。TypeScript 适配层已在 tenant-api 中实现多租户支持，
> C++ 中间件保持现有单租户模式，通过 TypeScript 层实现多租户路由和隔离。
> _Skipped: 2025-12-05_

- [~] 3.1 重命名 ManagerSessionPool 为 MT5ManagerSessionPool
  - _Status: SKIPPED - 通过 TypeScript 适配层实现多租户_

- [~] 3.2 实现 PoolKey 结构和多租户支持
  - _Status: SKIPPED - AdapterFactory 在 TypeScript 层实现租户隔离_

- [~] 3.3 实现按租户粒度的熔断器
  - _Status: SKIPPED - AdapterFactory 已实现 TypeScript 层熔断器_

- [~] 3.4 扩展 JWT 解析支持 tenant_id
  - _Status: SKIPPED - tenant-api AuthService 已处理 JWT 租户信息_

- [~] 3.5 实现 UsersController
  - _Status: SKIPPED - TradingController 在 tenant-api 实现_

- [~] 3.6 实现 HealthController
  - _Status: SKIPPED - HealthController 在 tenant-api 实现_

## Phase 4: tenant-api 统一 API (P1)

- [x] 4.1 创建 TradingController
  - File: `apps/tenant-api/src/trading/trading.controller.ts`
  - 实现统一的用户管理 API 端点（用户、持仓、订单、成交、品种、报价、服务器状态）
  - 通过 `X-Server-Id` 请求头或 JWT 中的 `serverId` 确定目标服务器
  - 委托给 TradingService 处理，支持 MT5/MT4 多平台路由
  - Purpose: 对前端暴露统一 API
  - _Leverage: TradingService, JwtAuthGuard_
  - _Requirements: REQ-UM-1 ~ REQ-UM-8_
  - _Completed: 2025-12-05_

- [x] 4.2 扩展 JWT 签发逻辑
  - File: `apps/tenant-api/src/auth/auth.service.ts`
  - File: `apps/tenant-api/src/auth/decorators/current-user.decorator.ts`
  - 在 JWT payload 中添加 `serverId` 和 `platformType`
  - 登录和刷新 Token 时自动获取默认 MT 服务器信息
  - 保持与现有 `instanceId` 的向后兼容
  - Purpose: 支持多租户认证
  - _Leverage: MtServerService, 现有 JWT 签发逻辑_
  - _Requirements: REQ-MT-1, REQ-FE-2_
  - _Completed: 2025-12-05_

- [x] 4.3 实现租户域名解析服务
  - File: `apps/tenant-api/src/tenant/tenant.service.ts`
  - 实现 `getTenantByDomain(domain)` 和 `getTenantByCode(code)` 方法
  - 支持三种解析方式：TenantDomain 表、customDomain 字段、子域名约定
  - 实现 5 分钟缓存机制提升性能
  - 返回租户配置包含可用服务器列表
  - Purpose: 支持前端租户识别
  - _Leverage: PrismaService, MtServerService, TenantDomain 模型_
  - _Requirements: REQ-FE-1, REQ-FE-2_
  - _Completed: 2025-12-05_

- [x] 4.4 创建租户查询 API
  - File: `apps/tenant-api/src/tenant/tenant.controller.ts`
  - File: `apps/tenant-api/src/tenant/tenant.module.ts`
  - 实现 `GET /api/tenant/resolve?domain=xxx` 和 `GET /api/tenant/config?domain=xxx` 公开端点
  - 返回租户配置（品牌信息、服务器列表，不含敏感信息）
  - 使用 `@Public()` 装饰器允许未认证访问
  - Purpose: 供前端获取租户配置
  - _Leverage: TenantService_
  - _Requirements: REQ-FE-1_
  - _Completed: 2025-12-05_

## Phase 5: 健康监控 (P1)

- [x] 5.1 tenant-api 健康聚合服务
  - File: `apps/tenant-api/src/health/health.service.ts`
  - 聚合所有中间件的健康状态
  - 通过适配器获取各平台健康信息
  - 实现系统级、租户级、服务器级健康检查
  - 实现 30 秒健康缓存机制
  - 支持 K8s liveness/readiness probes
  - Purpose: 统一健康状态视图
  - _Leverage: TradingService, AdapterFactory, MtServerService_
  - _Requirements: REQ-MT-5_
  - _Completed: 2025-12-05_

- [x] 5.2 tenant-api 健康 API
  - File: `apps/tenant-api/src/health/health.controller.ts`
  - 实现 `GET /api/health` 存活检查 (公开)
  - 实现 `GET /api/health/ready` 就绪检查 (公开)
  - 实现 `GET /api/health/system` 系统整体状态
  - 实现 `GET /api/health/servers` 所有服务器状态
  - 实现 `GET /api/health/tenant` 当前租户健康状态
  - 实现 `GET /api/health/circuit-breakers` 熔断器状态
  - 实现 `POST /api/health/circuit-breaker/:tenantId/:serverId/reset` 熔断器重置 (管理员)
  - Purpose: 提供健康监控 API
  - _Leverage: HealthService_
  - _Requirements: REQ-MT-5_
  - _Completed: 2025-12-05_

## Phase 6: 混合部署支持 (P2)

- [x] 6.1 API Gateway 路由配置
  - File: `docker/nginx/nginx.conf`
  - File: `docker/nginx/docker-compose.gateway.yml`
  - File: `docker/nginx/README.md`
  - 配置基于租户的路由规则 (map $http_x_tenant_code)
  - 支持 SHARED/DEDICATED 部署模式路由
  - 包含负载均衡、速率限制、健康检查
  - Purpose: 支持混合部署架构
  - _Leverage: 现有 Nginx 配置_
  - _Requirements: REQ-DP-1, REQ-DP-2_
  - _Completed: 2025-12-05_

- [x] 6.2 部署模式配置管理
  - File: `apps/tenant-api/src/tenant/tenant.service.ts`
  - File: `apps/tenant-api/src/tenant/tenant.controller.ts`
  - 添加 `getDeploymentConfig(tenantId)` 和 `getDeploymentConfigByCode(code)` 方法
  - 添加 `DeploymentConfig` 接口和 `DeploymentMode` 枚举
  - 实现部署配置缓存机制 (5分钟)
  - 添加 `GET /api/tenant/deployment/:tenantId` API 端点
  - Purpose: 支持动态部署配置
  - _Leverage: Tenant 模型, MtServerService_
  - _Requirements: REQ-DP-1_
  - _Completed: 2025-12-05_

## Phase 7: MT4 适配器完善 (P3)

- [ ] 7.1 完善 MT4Adapter 端点映射
  - File: `apps/tenant-api/src/trading/adapters/mt4.adapter.ts`
  - 根据实际 MT4 中间件 API 完善所有端点映射
  - 处理 MT4 特有的响应格式
  - Purpose: 完整支持 MT4 平台
  - _Leverage: MT4 中间件 API 文档_
  - _Requirements: REQ-UM-1 ~ REQ-UM-8_
  - _Prompt: Role: Backend Developer | Task: Complete MT4Adapter implementation based on actual MT4 middleware API specification | Restrictions: Must handle all MT4-specific edge cases | Success: All MT4 operations work correctly through unified interface_

- [ ] 7.2 MT4 特有功能处理
  - File: `apps/tenant-api/src/trading/adapters/mt4.adapter.ts`
  - 处理 MT4 独有的功能或限制
  - 在统一接口中优雅降级
  - Purpose: 处理平台差异
  - _Leverage: TradingPlatformAdapter_
  - _Requirements: REQ-MT-3_
  - _Prompt: Role: Backend Developer | Task: Handle MT4-specific features and gracefully degrade for unsupported operations | Restrictions: Must not break unified interface, proper error messages for unsupported features | Success: MT4-specific features handled, graceful degradation for differences_

- [ ] 7.3 混合平台集成测试
  - File: `apps/tenant-api/test/trading.e2e-spec.ts`
  - 编写 MT4 和 MT5 混合场景测试
  - 验证适配器切换正确
  - 验证数据格式统一
  - Purpose: 确保多平台集成正确
  - _Leverage: Jest, Supertest_
  - _Requirements: All_
  - _Prompt: Role: QA Engineer | Task: Create E2E tests covering mixed MT4/MT5 scenarios, verifying correct adapter routing and unified data formats | Restrictions: Must test both platforms in same test suite, mock middleware where needed | Success: All mixed platform scenarios pass, data format consistency verified_

## Phase 8: 测试任务

- [x] 8.1 TypeScript 适配层单元测试
  - File: `apps/tenant-api/src/middleware-proxy/adapters/mt5.adapter.spec.ts`
  - File: `apps/tenant-api/src/middleware-proxy/adapters/adapter.factory.spec.ts`
  - 测试 MT5Adapter 端点映射和字段转换 (23 tests)
  - 测试 AdapterFactory 缓存、多租户隔离、熔断器管理 (23 tests)
  - Mock HTTP 调用 (RxJS Observable)
  - Purpose: 确保适配器逻辑正确
  - _Leverage: Jest, HttpService mock_
  - _Requirements: REQ-UM-1 ~ REQ-UM-8_
  - _Completed: 2025-12-05_

- [x] 8.2 TradingService 和 HealthService 单元测试
  - File: `apps/tenant-api/src/middleware-proxy/services/trading.service.spec.ts`
  - File: `apps/tenant-api/src/health/health.service.spec.ts`
  - 测试 TradingService 多租户路由、自动认证、批量操作 (17 tests)
  - 测试 HealthService K8s 探针、健康聚合、熔断器状态 (26 tests)
  - Mock PrismaService, MtServerService, AdapterFactory
  - Purpose: 确保服务层逻辑正确
  - _Leverage: Jest, NestJS Testing Module_
  - _Requirements: REQ-MT-3, REQ-MT-5_
  - _Completed: 2025-12-05_

- [~] 8.3 MT5 中间件多租户测试
  - _Status: SKIPPED - Phase 3 已跳过，C++ 层保持单租户模式_
  - _多租户隔离已在 TypeScript 层测试覆盖 (adapter.factory.spec.ts)_

- [x] 8.4 端到端集成测试
  - File: `apps/tenant-api/test/multi-tenant.e2e-spec.ts`
  - 测试完整的多租户流程 (21 tests)
  - 测试租户隔离、故障隔离、认证隔离、并发访问、健康检查、部署模式
  - 验证租户 A 故障不影响租户 B
  - Purpose: 验证整体架构正确
  - _Leverage: Jest, Supertest, Mock Services_
  - _Requirements: REQ-MT-4, REQ-MT-5_
  - _Completed: 2025-12-05_

---

## Completion Summary

**Status**: ✅ Implementation Complete (P0-P2 Phases)

**Completed Phases**:
- Phase 1: 数据库 Schema 和基础设施 ✅ (3/3 tasks)
- Phase 2: TypeScript 适配层 ✅ (5/6 tasks, MT4Adapter 待中间件就绪)
- Phase 3: MT5 中间件多租户改造 ⏭️ SKIPPED (通过 TypeScript 层实现)
- Phase 4: tenant-api 统一 API ✅ (4/4 tasks)
- Phase 5: 健康监控 ✅ (2/2 tasks)
- Phase 6: 混合部署支持 ✅ (2/2 tasks)
- Phase 7: MT4 适配器完善 ⏳ DEFERRED (P3, 待 MT4 中间件就绪)
- Phase 8: 测试任务 ✅ (3/4 tasks, MT5 中间件测试已跳过)

**Test Coverage**:
- Unit Tests: 89 tests (MT5Adapter: 23, AdapterFactory: 23, TradingService: 17, HealthService: 26)
- E2E Tests: 21 multi-tenant architecture tests (全部通过)

**Deferred Tasks** (Phase 7 - P3 Priority):
- 2.3 MT4Adapter 实现
- 7.1-7.3 MT4 适配器完善和混合平台测试

_Completion Date: 2025-12-05_
