# Tasks Document: MT5 Middleware Integration

## Phase 1: 基础设施 (P0)

- [x] 1. 创建响应转换器 ResponseTransformer
  - File: `apps/tenant-api/src/middleware-proxy/transformers/response.transformer.ts`
  - 实现中间件响应格式 `{code, message, data}` 到平台格式 `{success, data}` 的转换
  - 实现错误码映射表 (中间件 code → HTTP status + error code)
  - Purpose: 统一响应格式，为后续所有 API 调用提供基础
  - _Leverage: apps/tenant-api/src/common/business.exception.ts, apps/tenant-api/src/common/error-codes.ts_
  - _Requirements: REQ-3_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer specializing in data transformation and error handling | Task: Create ResponseTransformer class that converts middleware response format {code, message, data, timestamp} to platform format {success, data} or {success, error}. Include comprehensive error code mapping table for codes 1001-5002. Reference existing error handling patterns from business.exception.ts | Restrictions: Do not modify existing error handling code, maintain backward compatibility, follow existing code style | _Leverage: apps/tenant-api/src/common/business.exception.ts for error patterns | _Requirements: REQ-3 | Success: All middleware response codes are properly mapped, transformation handles null/undefined data, unit tests pass with 100% coverage | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

- [x] 2. 创建数据传输对象 DTOs (已存在于 middleware-proxy.dto.ts)
  - Files:
    - `apps/tenant-api/src/middleware-proxy/dto/account.dto.ts`
    - `apps/tenant-api/src/middleware-proxy/dto/position.dto.ts`
    - `apps/tenant-api/src/middleware-proxy/dto/quote.dto.ts`
    - `apps/tenant-api/src/middleware-proxy/dto/symbol.dto.ts`
    - `apps/tenant-api/src/middleware-proxy/dto/history.dto.ts`
  - 定义 AccountInfo, Position, Quote, Symbol, HistoryDeal 接口
  - 添加字段验证装饰器 (class-validator)
  - Purpose: 类型安全的数据结构定义
  - _Leverage: apps/tenant-api/src/middleware-proxy/dto/middleware-proxy.dto.ts_
  - _Requirements: REQ-5, REQ-6, REQ-7, REQ-8_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: TypeScript Developer specializing in type systems and validation | Task: Create comprehensive DTOs for MT5 data structures (AccountInfo, Position, Quote, Symbol, HistoryDeal) with class-validator decorators. Follow existing DTO patterns from middleware-proxy.dto.ts. Include camelCase property names with proper type annotations | Restrictions: Must use class-validator for validation, follow existing naming conventions, do not create circular dependencies | _Leverage: apps/tenant-api/src/middleware-proxy/dto/middleware-proxy.dto.ts for patterns | _Requirements: REQ-5, REQ-6, REQ-7, REQ-8 | Success: All DTOs compile without errors, validation decorators are properly applied, types match design document specifications | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

- [x] 3. 创建中间件认证服务 MiddlewareAuthService
  - File: `apps/tenant-api/src/middleware-proxy/services/middleware-auth.service.ts`
  - 实现中间件登录 (调用 /api/v1/auth/admin/login)
  - 实现 Token 缓存管理 (使用内存 Map，后续可升级 Redis)
  - 实现 Token 自动刷新逻辑
  - Purpose: 管理与中间件的认证会话
  - _Leverage: apps/tenant-api/src/auth/auth.service.ts for auth patterns_
  - _Requirements: REQ-4_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer specializing in authentication and session management | Task: Create MiddlewareAuthService that manages JWT sessions with MT5-middleware. Implement login method calling /api/v1/auth/admin/login, token caching using Map (with TTL), and automatic refresh before expiry. Include getSession, login, refreshToken, clearSession methods | Restrictions: Use in-memory Map for now (Redis upgrade later), do not store passwords in cache, handle token refresh 5 minutes before expiry | _Leverage: apps/tenant-api/src/auth/auth.service.ts for auth patterns | _Requirements: REQ-4 | Success: Login returns valid JWT, tokens are cached and retrieved correctly, refresh happens automatically before expiry, clearSession removes all cached data | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

---

## Phase 2: 核心功能 (P1)

- [x] 4. 重构 MiddlewareProxyService - 基础架构
  - File: `apps/tenant-api/src/middleware-proxy/middleware-proxy.service.ts`
  - 注入 MiddlewareAuthService 和 ResponseTransformer
  - 重构 makeRequest 方法支持认证头和响应转换
  - 添加实例配置获取逻辑
  - Purpose: 建立代理服务的新架构
  - _Leverage: apps/tenant-api/src/middleware-proxy/middleware-proxy.service.ts (existing)_
  - _Requirements: REQ-3, REQ-4_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer with expertise in service architecture | Task: Refactor MiddlewareProxyService to inject MiddlewareAuthService and ResponseTransformer. Update makeRequest method to: 1) Get middleware JWT from auth service, 2) Add Authorization header, 3) Transform response using ResponseTransformer. Add getInstanceConfig method to fetch instance settings from database | Restrictions: Maintain backward compatibility with existing methods, do not break existing functionality, keep existing method signatures where possible | _Leverage: apps/tenant-api/src/middleware-proxy/middleware-proxy.service.ts | _Requirements: REQ-3, REQ-4 | Success: makeRequest correctly adds auth header, responses are transformed to platform format, existing tests still pass | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

- [x] 5. 重构 MiddlewareProxyService - 账户和持仓 API
  - File: `apps/tenant-api/src/middleware-proxy/middleware-proxy.service.ts`
  - 实现 getAccountInfo() 方法 - 调用 /api/v1/account/info
  - 实现 getPositions() 方法 - 调用 /api/v1/trading/positions
  - 实现 getPositionByTicket() 方法 - 调用 /api/v1/trading/positions/{ticket}
  - Purpose: 实现账户和持仓数据获取
  - _Leverage: MT5-middleware API endpoints_
  - _Requirements: REQ-5, REQ-6_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer with expertise in API integration | Task: Implement account and position methods in MiddlewareProxyService: 1) getAccountInfo() calling /api/v1/account/info, 2) getPositions(filters?) calling /api/v1/trading/positions, 3) getPositionByTicket(ticket) calling /api/v1/trading/positions/{ticket}. Use makeRequest for all calls, return typed DTOs | Restrictions: Must use the refactored makeRequest method, return proper DTOs not raw data, handle empty results gracefully | _Leverage: Task 4 refactored makeRequest method | _Requirements: REQ-5, REQ-6 | Success: All methods return properly typed data, error cases are handled, methods work with real middleware endpoints | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

- [x] 6. 重构 MiddlewareProxyService - 行情和历史 API
  - File: `apps/tenant-api/src/middleware-proxy/middleware-proxy.service.ts`
  - 实现 getQuotes() 方法 - 调用 /api/v1/market/quotes/{symbol}
  - 实现 getSymbols() 方法 - 调用 /api/v1/market/symbols
  - 实现 getSymbolInfo() 方法 - 调用 /api/v1/market/symbols/{symbol}
  - 实现 getHistory() 方法 - 调用 /api/v1/trading/orders (历史订单)
  - Purpose: 实现行情和历史数据获取
  - _Leverage: MT5-middleware API endpoints_
  - _Requirements: REQ-7, REQ-8_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer with expertise in API integration | Task: Implement market and history methods in MiddlewareProxyService: 1) getQuotes(symbols[]) with batch support, 2) getSymbols() for full list, 3) getSymbolInfo(symbol), 4) getHistory(filters) with date range and pagination. Transform all responses to platform DTOs | Restrictions: Batch quote requests if more than 10 symbols, implement proper pagination for history, handle timezone conversions | _Leverage: Task 4-5 patterns | _Requirements: REQ-7, REQ-8 | Success: All methods return properly typed data, pagination works correctly, batch requests are efficient | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

- [x] 7. 适配健康检查服务 HealthCheckerService
  - File: `apps/platform-service/src/modules/middleware-integration/services/health-checker.service.ts`
  - 创建 HealthResponseAdapter 适配中间件响应格式
  - 修改 checkInstanceHealth 方法解析新格式
  - 提取 components, circuit_breakers, metrics 信息
  - Purpose: 正确解析中间件详细健康状态
  - _Leverage: apps/platform-service/src/modules/middleware-integration/interfaces/middleware-health.interface.ts_
  - _Requirements: REQ-2_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer with expertise in health monitoring | Task: Adapt HealthCheckerService to parse middleware's /health/detailed response format. Create HealthResponseAdapter to extract: 1) Overall status (healthy/degraded/unhealthy), 2) Component statuses (mt5, redis, database), 3) Circuit breaker states, 4) Metrics (cpu, memory, connections). Update checkInstanceHealth to use adapter | Restrictions: Do not break existing health check flow, maintain backward compatibility with old response format, store parsed metrics in healthData field | _Leverage: apps/platform-service/src/modules/middleware-integration/interfaces/middleware-health.interface.ts | _Requirements: REQ-2 | Success: Health checks correctly parse new format, status is correctly determined from components, metrics are stored for monitoring | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

- [x] 8. 更新 MiddlewareProxyModule 依赖注入 (已在 Task 4 中完成)
  - File: `apps/tenant-api/src/middleware-proxy/middleware-proxy.module.ts`
  - 注册 MiddlewareAuthService
  - 注册 ResponseTransformer
  - 配置模块导出
  - Purpose: 完成依赖注入配置
  - _Leverage: apps/tenant-api/src/middleware-proxy/middleware-proxy.module.ts_
  - _Requirements: REQ-3, REQ-4_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Developer with expertise in module architecture | Task: Update MiddlewareProxyModule to register new services: 1) Add MiddlewareAuthService as provider, 2) Add ResponseTransformer as provider, 3) Export services for use in other modules. Ensure proper dependency order | Restrictions: Do not create circular module dependencies, follow NestJS module patterns, maintain existing exports | _Leverage: apps/tenant-api/src/middleware-proxy/middleware-proxy.module.ts | _Requirements: REQ-3, REQ-4 | Success: Module compiles without errors, all services are injectable, no circular dependency warnings | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

---

## Phase 3: 实时推送 (P2)

- [x] 9. 创建 WebSocket 桥接服务 WebSocketBridgeService
  - File: `apps/tenant-api/src/websocket/websocket-bridge.service.ts`
  - 实现连接到中间件 WebSocket (/ws/market, /ws/trading)
  - 实现消息转发逻辑
  - 实现自动重连机制
  - Purpose: 桥接中间件和平台 WebSocket
  - _Leverage: apps/tenant-api/src/websocket/tenant-websocket.gateway.ts_
  - _Requirements: REQ-9_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Developer with expertise in WebSocket and real-time communication | Task: Create WebSocketBridgeService that: 1) Connects to middleware WebSocket endpoints (/ws/market, /ws/trading) with JWT auth, 2) Forwards messages to TenantWebsocketGateway, 3) Implements exponential backoff reconnection (5s, 10s, 20s, max 10 retries). Include subscribe/unsubscribe methods for channels | Restrictions: Use ws library for client connections, do not block event loop, handle connection errors gracefully | _Leverage: apps/tenant-api/src/websocket/tenant-websocket.gateway.ts patterns | _Requirements: REQ-9 | Success: Successfully connects to middleware WebSocket, messages are forwarded to clients, reconnection works after disconnect | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

- [x] 10. 扩展 TenantWebsocketGateway
  - File: `apps/tenant-api/src/websocket/tenant-websocket.gateway.ts`
  - 集成 WebSocketBridgeService
  - 添加订阅管理 (行情、持仓、账户频道)
  - 实现消息广播到订阅客户端
  - Purpose: 完成 WebSocket 端到端集成
  - _Leverage: apps/tenant-api/src/websocket/websocket-bridge.service.ts_
  - _Requirements: REQ-9_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Developer with expertise in WebSocket Gateways | Task: Extend TenantWebsocketGateway to: 1) Inject WebSocketBridgeService, 2) Handle 'subscribe' events for market/trading channels, 3) Manage client subscriptions in a Map, 4) Broadcast received messages to subscribed clients. Add handleSubscribe and handleUnsubscribe methods | Restrictions: Verify client authentication before subscription, limit subscriptions per client, clean up on disconnect | _Leverage: apps/tenant-api/src/websocket/websocket-bridge.service.ts | _Requirements: REQ-9 | Success: Clients can subscribe to channels, receive real-time updates, subscriptions are cleaned on disconnect | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

- [x] 11. 适配 Webhook 事件处理
  - File: `apps/platform-service/src/modules/middleware-integration/controllers/webhook.controller.ts`
  - 添加中间件特定事件处理 (mt5.connected, mt5.disconnected)
  - 更新事件数据结构解析
  - 触发状态更新和告警
  - Purpose: 接收并处理中间件状态变化
  - _Leverage: apps/platform-service/src/modules/middleware-integration/services/event-emitter.service.ts_
  - _Requirements: REQ-10_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Developer with expertise in webhook handling | Task: Update WebhookController to handle middleware-specific events: 1) mt5.connected - update instance status to ONLINE, 2) mt5.disconnected - update status to OFFLINE and trigger alert, 3) health.check_failed - log warning and update healthData. Parse event_type and data fields from webhook payload | Restrictions: Validate webhook signature before processing, do not expose internal errors, log all events for audit | _Leverage: apps/platform-service/src/modules/middleware-integration/services/event-emitter.service.ts | _Requirements: REQ-10 | Success: Webhook events are processed correctly, instance status updates in database, alerts are triggered for critical events | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

---

## Phase 4: 前端集成 (P3)

- [x] 12. 更新 Dashboard 控制器连接真实数据
  - File: `apps/tenant-api/src/dashboard/dashboard.controller.ts`
  - 修改 getAccount 方法使用 MiddlewareProxyService
  - 修改 getPositions 方法使用真实数据
  - 添加错误处理和降级逻辑
  - Purpose: 仪表盘显示真实 MT5 数据
  - _Leverage: apps/tenant-api/src/middleware-proxy/middleware-proxy.service.ts_
  - _Requirements: REQ-5, REQ-6_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer | Task: Update DashboardController to use real MT5 data: 1) Modify getAccount to call MiddlewareProxyService.getAccountInfo(), 2) Modify getPositions to call getPositions(), 3) Add try-catch with graceful degradation (return cached or empty data on error). Get instanceId from user's tenant configuration | Restrictions: Do not remove mock data fallback for development, handle missing instance configuration, log errors for debugging | _Leverage: apps/tenant-api/src/middleware-proxy/middleware-proxy.service.ts | _Requirements: REQ-5, REQ-6 | Success: Dashboard shows real MT5 account data, positions display correctly, errors are handled gracefully | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

- [x] 13. 更新 Quotes 控制器连接真实数据
  - File: `apps/tenant-api/src/quotes/quotes.controller.ts`
  - 修改 getQuotes 方法使用 MiddlewareProxyService
  - 修改 getSymbols 方法使用真实数据
  - Purpose: 行情页面显示真实报价
  - _Leverage: apps/tenant-api/src/middleware-proxy/middleware-proxy.service.ts_
  - _Requirements: REQ-7_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer | Task: Update QuotesController to use real MT5 data: 1) Modify getQuotes to call MiddlewareProxyService.getQuotes(), 2) Modify getSymbols to call getSymbols(), 3) Modify getSymbolInfo to call getSymbolInfo(). Handle batch quote requests efficiently | Restrictions: Cache symbols list (changes rarely), limit quote batch size to 50, handle unknown symbols gracefully | _Leverage: apps/tenant-api/src/middleware-proxy/middleware-proxy.service.ts | _Requirements: REQ-7 | Success: Quotes display real bid/ask prices, symbol list loads correctly, batch requests work efficiently | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

- [x] 14. 更新 History 控制器连接真实数据
  - File: `apps/tenant-api/src/history/history.controller.ts`
  - 修改 getHistory 方法使用 MiddlewareProxyService
  - 实现分页和筛选逻辑
  - Purpose: 历史记录页面显示真实交易历史
  - _Leverage: apps/tenant-api/src/middleware-proxy/middleware-proxy.service.ts_
  - _Requirements: REQ-8_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Backend Developer | Task: Update HistoryController to use real MT5 data: 1) Modify getHistory to call MiddlewareProxyService.getHistory() with filters, 2) Implement pagination (page, limit params), 3) Support filtering by symbol, date range, action type. Transform timestamps to user timezone | Restrictions: Limit default page size to 50, validate date range (max 1 year), handle large result sets efficiently | _Leverage: apps/tenant-api/src/middleware-proxy/middleware-proxy.service.ts | _Requirements: REQ-8 | Success: History displays real trading records, pagination works correctly, filters apply properly | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

---

## Phase 5: 测试和文档 (P4)

- [x] 15. 编写单元测试
  - Files:
    - `apps/tenant-api/src/middleware-proxy/transformers/response.transformer.spec.ts`
    - `apps/tenant-api/src/middleware-proxy/services/middleware-auth.service.spec.ts`
  - 测试响应转换逻辑
  - 测试认证服务
  - Purpose: 确保核心组件可靠性
  - _Leverage: Jest testing framework_
  - _Requirements: All_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: QA Engineer with expertise in Jest and unit testing | Task: Write comprehensive unit tests for: 1) ResponseTransformer - test all error code mappings, success/error transformations, edge cases (null data, missing fields), 2) MiddlewareAuthService - test login, token caching, refresh logic, clearSession. Use mocks for external dependencies | Restrictions: Achieve 80%+ code coverage, test both success and failure paths, do not test implementation details | _Leverage: Jest mocking capabilities | _Requirements: All | Success: All tests pass, coverage meets threshold, edge cases are covered | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

- [x] 16. 编写集成测试
  - File: `apps/tenant-api/test/middleware-proxy.e2e-spec.ts`
  - 测试完整的 API 调用流程
  - 测试认证 → 请求 → 响应转换链路
  - Purpose: 验证端到端集成正确性
  - _Leverage: Supertest, NestJS testing module_
  - _Requirements: All_
  - _Prompt: Implement the task for spec mt5-middleware-integration, first run spec-workflow-guide to get the workflow guide then implement the task: Role: QA Engineer with expertise in E2E testing | Task: Write integration tests for middleware proxy flow: 1) Test authentication flow (login → get token → make request), 2) Test data retrieval endpoints (account, positions, quotes), 3) Test error handling (middleware down, invalid token). Use test middleware mock or real dev middleware | Restrictions: Clean up test data after each test, do not depend on production middleware, handle async operations properly | _Leverage: Supertest for HTTP testing | _Requirements: All | Success: Integration tests cover main flows, tests are isolated and repeatable, CI pipeline passes | After completing: 1) Mark task as [-] in_progress in tasks.md before starting, 2) Use log-implementation tool to record artifacts after completion, 3) Mark task as [x] completed in tasks.md_

---

## Summary

| Phase | Tasks | Priority | Est. Effort |
|-------|-------|----------|-------------|
| Phase 1: 基础设施 | 1-3 | P0 | 1 day |
| Phase 2: 核心功能 | 4-8 | P1 | 2 days |
| Phase 3: 实时推送 | 9-11 | P2 | 1.5 days |
| Phase 4: 前端集成 | 12-14 | P3 | 1 day |
| Phase 5: 测试文档 | 15-16 | P4 | 1 day |

**Total: 16 tasks, ~6.5 days estimated**
