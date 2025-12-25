# Tasks Document: SaaS Middleware Integration

## Phase 1: 后端API层

- [x] 1. 创建 MtServerController
  - File: `apps/tenant-api/src/mt-server/mt-server.controller.ts`
  - 实现 MT 服务器配置的 REST API 端点
  - 端点包括: GET/POST/PUT/DELETE /api/mt-servers, test-connection, set-default
  - Purpose: 提供租户管理 MT 服务器的 API 接口
  - _Leverage: `apps/tenant-api/src/tenant/tenant.controller.ts`, `apps/tenant-api/src/middleware-proxy/services/mt-server.service.ts`_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer specializing in REST API design | Task: Create MtServerController with complete CRUD endpoints for MT server configuration, including test-connection and set-default endpoints. Use existing TenantController as reference pattern and integrate with MtServerService. | Restrictions: Follow existing controller patterns, use JwtAuthGuard for authentication, extract tenantId from JWT token, do not expose encrypted passwords in responses | _Leverage: tenant.controller.ts for patterns, mt-server.service.ts for business logic_ | _Requirements: 1.1-1.6_ | Success: All endpoints work correctly with proper authentication, validation, and error handling. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

- [x] 2. 扩展 MtServerService 添加连接测试方法
  - File: `apps/tenant-api/src/middleware-proxy/services/mt-server.service.ts`
  - 新增 `testConnection(tenantId, serverId)` 方法
  - 通过 AdapterFactory 获取适配器并调用 `testConnection()` 和 `getServerStatus()`
  - Purpose: 验证 MT 服务器配置的有效性和连通性
  - _Leverage: `apps/tenant-api/src/middleware-proxy/adapters/adapter.factory.ts`, `apps/tenant-api/src/middleware-proxy/adapters/mt5.adapter.ts`_
  - _Requirements: 1.2_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer | Task: Add testConnection method to MtServerService that uses AdapterFactory to get an adapter and calls testConnection()/getServerStatus() to verify server connectivity. Return ConnectionTestResult with success, latency, server info or error details. | Restrictions: Handle connection errors gracefully, measure latency accurately, do not cache test results | _Leverage: adapter.factory.ts, mt5.adapter.ts_ | _Requirements: 1.2_ | Success: testConnection returns accurate results for both successful and failed connections, includes latency measurement. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

- [x] 3. 创建 MtServerModule 并注册到 AppModule
  - File: `apps/tenant-api/src/mt-server/mt-server.module.ts`, `apps/tenant-api/src/app.module.ts`
  - 创建 MtServerModule 封装 Controller
  - 在 AppModule 中导入 MtServerModule
  - Purpose: 模块化组织代码，符合 NestJS 最佳实践
  - _Leverage: `apps/tenant-api/src/tenant/tenant.module.ts`_
  - _Requirements: 1.1_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Module Architect | Task: Create MtServerModule containing MtServerController, import MiddlewareProxyModule for service dependencies. Register in AppModule. | Restrictions: Follow existing module patterns, ensure proper dependency injection | _Leverage: tenant.module.ts_ | _Requirements: 1.1_ | Success: Module is properly structured and all dependencies resolve correctly. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

- [x] 4. 创建 MT 服务器 DTO 和验证
  - File: `apps/tenant-api/src/mt-server/dto/index.ts`
  - 创建 CreateMtServerDto, UpdateMtServerDto 使用 class-validator
  - 添加输入验证装饰器
  - Purpose: 确保 API 输入数据的有效性
  - _Leverage: `apps/tenant-api/src/auth/dto/`_
  - _Requirements: 1.6_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer | Task: Create DTO classes with class-validator decorators for MT server CRUD operations. Include validation for middlewareUrl (URL format), serverAddress, managerLogin (positive number), managerPassword (min length). | Restrictions: Use existing DTO patterns, do not over-validate, keep validation user-friendly | _Leverage: auth/dto/_ | _Requirements: 1.6_ | Success: All DTOs have proper validation, error messages are clear and helpful. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

## Phase 2: 认证流程完善

- [x] 5. 完善 TradingService 认证流程
  - File: `apps/tenant-api/src/middleware-proxy/services/trading.service.ts`
  - 优化 `ensureAuthenticated` 方法，添加令牌刷新逻辑
  - 当令牌即将过期（5分钟内）时自动刷新
  - Purpose: 确保交易请求始终使用有效令牌
  - _Leverage: `apps/tenant-api/src/middleware-proxy/adapters/mt5.adapter.ts`_
  - _Requirements: 2.1, 2.2, 2.3_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer | Task: Enhance ensureAuthenticated in TradingService to check token expiry and proactively refresh when token expires within 5 minutes. Use adapter.isTokenExpiring() check and refreshToken() call. | Restrictions: Do not refresh on every request, handle refresh failures gracefully, log refresh events | _Leverage: mt5.adapter.ts_ | _Requirements: 2.1-2.3_ | Success: Tokens are refreshed proactively, no requests fail due to expired tokens. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

- [x] 6. 添加令牌过期检查方法到 TradingPlatformAdapter
  - File: `apps/tenant-api/src/middleware-proxy/adapters/trading-platform.adapter.ts`
  - 新增 `isTokenExpiring(thresholdMinutes: number)` 方法
  - 检查令牌是否即将在指定时间内过期
  - Purpose: 支持主动令牌刷新逻辑
  - _Leverage: 现有 `tokenExpiry` 属性_
  - _Requirements: 2.3_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: TypeScript Developer | Task: Add isTokenExpiring(thresholdMinutes) method to TradingPlatformAdapter that returns true if token will expire within the threshold. Also add isAuthenticated() method if not present. | Restrictions: Handle null tokenExpiry, use accurate time comparison | _Leverage: existing tokenExpiry property_ | _Requirements: 2.3_ | Success: Method accurately predicts token expiry. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

## Phase 3: 熔断器集成

- [x] 7. 集成熔断器到 TradingService
  - File: `apps/tenant-api/src/middleware-proxy/services/trading.service.ts`
  - 在每次请求前检查熔断器状态
  - 请求成功/失败后更新熔断器
  - Purpose: 保护系统免受中间件故障影响
  - _Leverage: `apps/tenant-api/src/middleware-proxy/adapters/adapter.factory.ts`_
  - _Requirements: 2.4, 2.5_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer | Task: Integrate circuit breaker checks in TradingService methods. Before requests, check isCircuitBreakerOpen(); after success call recordSuccess(); after failure call recordFailure(). Throw ServiceUnavailableException when circuit is open. | Restrictions: Apply to all middleware-calling methods, provide clear error messages when circuit is open | _Leverage: adapter.factory.ts circuit breaker methods_ | _Requirements: 2.4, 2.5_ | Success: Circuit breaker protects system, graceful degradation when middleware is down. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

- [x] 8. 创建中间件不可用异常类
  - File: `apps/tenant-api/src/middleware-proxy/exceptions/middleware-unavailable.exception.ts`
  - 继承 HttpException，返回 503 状态码
  - 包含重试时间建议
  - Purpose: 统一中间件不可用错误处理
  - _Leverage: NestJS 内置异常类_
  - _Requirements: 2.5_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer | Task: Create MiddlewareUnavailableException extending HttpException with 503 status. Include retryAfter property suggesting when to retry (default 30 seconds). | Restrictions: Follow NestJS exception patterns | _Leverage: NestJS HttpException_ | _Requirements: 2.5_ | Success: Exception provides clear error info and retry guidance. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

## Phase 4: 后端单元测试

- [x] 9. MtServerController 单元测试
  - File: `apps/tenant-api/src/mt-server/mt-server.controller.spec.ts`
  - 测试所有 API 端点
  - 模拟 MtServerService 和 TradingService
  - Purpose: 确保 Controller 正确处理请求和响应
  - _Leverage: `apps/tenant-api/src/tenant/tenant.controller.spec.ts`_
  - _Requirements: 6.1_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: QA Engineer with Jest expertise | Task: Write unit tests for MtServerController covering all endpoints: list, get, create, update, delete, test-connection, set-default. Mock services and test both success and error scenarios. | Restrictions: Use Jest mocking, test authentication guards, isolate from real services | _Leverage: tenant.controller.spec.ts_ | _Requirements: 6.1_ | Success: All endpoints tested with good coverage, edge cases handled. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

- [x] 10. TradingService 认证流程单元测试
  - File: `apps/tenant-api/src/middleware-proxy/services/trading.service.spec.ts`
  - 测试令牌刷新逻辑
  - 测试熔断器集成
  - Purpose: 确保认证和容错逻辑正确工作
  - _Leverage: 现有测试文件_
  - _Requirements: 6.1_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: QA Engineer | Task: Add/update tests for TradingService focusing on authentication flow: token refresh when expiring, circuit breaker integration, error handling. Mock adapters and factories. | Restrictions: Test edge cases like token refresh failure, circuit breaker state transitions | _Leverage: existing trading.service.spec.ts_ | _Requirements: 6.1_ | Success: Authentication and circuit breaker logic fully tested. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

## Phase 5: 前端 - API 集成

- [x] 11. 创建 MT 服务器 API 模块
  - File: `apps/tenant-console/src/api/mt-servers.ts`
  - 实现 mtServersApi 对象，包含所有 API 调用方法
  - 复用现有的 request 工具
  - Purpose: 提供前端访问 MT 服务器 API 的统一接口
  - _Leverage: `apps/tenant-console/src/api/trading.ts`, `apps/tenant-console/src/utils/request.ts`_
  - _Requirements: 5.1, 5.2_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Vue.js Frontend Developer | Task: Create mt-servers.ts API module with methods: getServers, getServer, createServer, updateServer, deleteServer, testConnection, setDefault. Use existing request utility and TypeScript interfaces. | Restrictions: Follow existing API module patterns, handle errors consistently | _Leverage: trading.ts, request.ts_ | _Requirements: 5.1, 5.2_ | Success: All API methods work correctly with proper TypeScript types. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

- [x] 12. 创建 MT 服务器类型定义
  - File: `apps/tenant-console/src/types/mt-server.ts`
  - 定义 MtServer, CreateMtServerDto, UpdateMtServerDto, ConnectionTestResult 接口
  - Purpose: 为前端提供类型安全
  - _Leverage: `apps/tenant-console/src/types/`_
  - _Requirements: 5.1_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: TypeScript Developer | Task: Create TypeScript interfaces for MT server data: MtServer (list item), MtServerDetail, CreateMtServerDto, UpdateMtServerDto, ConnectionTestResult. Match backend DTOs. | Restrictions: Keep types in sync with backend | _Leverage: existing types/_ | _Requirements: 5.1_ | Success: Types match backend structure, provide good IntelliSense. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

## Phase 6: 前端 - 页面组件

- [x] 13. 创建 MT 服务器列表页面
  - File: `apps/tenant-console/src/views/mt-servers/MtServerList.vue`
  - 显示服务器列表，支持添加、编辑、删除操作
  - 显示连接状态指示器
  - Purpose: 提供 MT 服务器管理的主界面
  - _Leverage: `apps/tenant-console/src/views/trading/`_
  - _Requirements: 5.1, 5.3_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Vue.js Frontend Developer | Task: Create MtServerList.vue page component with: server list table (name, type, status, actions), add button, edit/delete/test-connection actions, status indicators (active/inactive/default). Use Element Plus components. | Restrictions: Follow existing view patterns, handle loading and error states | _Leverage: trading views_ | _Requirements: 5.1, 5.3_ | Success: List displays correctly with all actions working. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

- [x] 14. 创建 MT 服务器表单组件
  - File: `apps/tenant-console/src/views/mt-servers/MtServerForm.vue`
  - 支持创建和编辑模式
  - 包含表单验证
  - Purpose: 提供添加/编辑 MT 服务器的表单界面
  - _Leverage: 现有表单组件_
  - _Requirements: 5.2_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Vue.js Frontend Developer | Task: Create MtServerForm.vue dialog component with form fields: serverId, displayName, platformType (select), middlewareUrl, serverAddress, managerLogin, managerPassword, isDefault (checkbox). Add validation and submit handling. Support create and edit modes. | Restrictions: Validate URL format, hide password in edit mode unless changing | _Leverage: existing form components_ | _Requirements: 5.2_ | Success: Form validates correctly, handles both create and edit modes. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

- [x] 15. 添加路由配置
  - File: `apps/tenant-console/src/router/index.ts`
  - 添加 /mt-servers 路由
  - 添加导航菜单项
  - Purpose: 使 MT 服务器管理页面可访问
  - _Leverage: 现有路由配置_
  - _Requirements: 5.1_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Vue.js Frontend Developer | Task: Add route for MtServerList.vue at /mt-servers path. Update navigation menu to include "MT服务器管理" menu item with appropriate icon. | Restrictions: Follow existing route patterns, ensure proper lazy loading | _Leverage: existing router config_ | _Requirements: 5.1_ | Success: Route works correctly, navigation menu shows new item. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

## Phase 7: 集成测试

- [x] 16. 创建 Mock 中间件服务器
  - File: `apps/tenant-api/test/mocks/mock-middleware.ts`
  - 使用 nock 或 msw 模拟中间件 API 响应
  - 支持认证、用户列表、持仓等端点
  - Purpose: 支持集成测试而不依赖真实中间件
  - _Leverage: 现有测试 mock_
  - _Requirements: 6.2_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: QA Engineer | Task: Create mock middleware server using nock or msw that simulates: POST /api/v1/auth/login (return JWT), GET /api/v1/account/users (return user list), GET /api/v1/health (return status). Support configurable responses for success/failure scenarios. | Restrictions: Match real middleware API contract exactly | _Leverage: existing test mocks_ | _Requirements: 6.2_ | Success: Mock server accurately simulates middleware behavior. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

- [x] 17. MT 服务器 API E2E 测试
  - File: `apps/tenant-api/test/mt-server.e2e-spec.ts`
  - 测试完整的服务器配置流程
  - 测试连接测试功能
  - Purpose: 验证 API 端点的完整功能
  - _Leverage: `apps/tenant-api/test/multi-tenant.e2e-spec.ts`_
  - _Requirements: 6.1, 6.3_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: QA Engineer | Task: Write E2E tests for MT server API: create server, list servers, update server, test connection, set default, delete server. Test authentication, validation errors, and success scenarios. | Restrictions: Use test database, clean up after tests | _Leverage: multi-tenant.e2e-spec.ts_ | _Requirements: 6.1, 6.3_ | Success: E2E tests pass and cover all critical paths. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._

- [x] 18. 端到端集成测试
  - File: `apps/tenant-api/test/integration/middleware-integration.e2e-spec.ts`
  - 测试完整流程: 创建配置 → 认证 → 获取数据
  - 使用 Mock 中间件
  - Purpose: 验证 SaaS 平台与中间件的集成
  - _Leverage: Mock 中间件服务器_
  - _Requirements: 6.1, 6.4, 6.5_
  - _Prompt: Implement the task for spec saas-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: QA Engineer | Task: Write integration tests for complete flow: 1) Create MT server config, 2) Test connection, 3) Get trading users through TradingService. Verify data transformation, error handling, circuit breaker behavior. Use mock middleware. | Restrictions: Test real data flow, verify all transformations | _Leverage: mock middleware server_ | _Requirements: 6.1, 6.4, 6.5_ | Success: Integration tests verify complete data flow works correctly. Mark task as in-progress in tasks.md before starting, use log-implementation tool after completion, then mark as complete._
