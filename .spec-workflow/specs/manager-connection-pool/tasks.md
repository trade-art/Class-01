# Tasks Document - Manager Connection Pool

## Phase 1: Tenant API 内部接口

- [x] 1.1 创建 Internal API Controller
  - File: apps/tenant-api/src/mt-manager/internal.controller.ts
  - 创建 `GET /internal/managers` 端点
  - 实现 X-Internal-Secret 验证
  - 查询并返回指定中间件实例的所有启用经理账号
  - Purpose: 为 C++ 中间件提供经理账号列表接口
  - _Leverage: apps/tenant-api/src/api-keys/api-keys.controller.ts (内部接口验证模式)_
  - _Requirements: REQ-2_
  - _Prompt: Role: NestJS Backend Developer | Task: Create Internal API controller with GET /internal/managers endpoint that validates X-Internal-Secret header and returns enabled manager accounts for the specified middlewareId, following the existing internal API pattern from api-keys.controller.ts | Restrictions: Must validate internal secret, return only enabled managers, include encrypted password | Success: Endpoint returns manager list with managerId, tenantId, mtServerId, serverAddress, managerLogin, encryptedPassword_

- [x] 1.2 创建 ManagerInfoDto
  - File: apps/tenant-api/src/mt-manager/dto/manager-info.dto.ts
  - 定义内部接口返回的经理账号信息 DTO
  - 包含 managerId, tenantId, mtServerId, serverAddress, managerLogin, encryptedPassword
  - Purpose: 定义内部 API 的数据传输对象
  - _Leverage: apps/tenant-api/src/mt-manager/dto/_
  - _Requirements: REQ-2_
  - _Prompt: Role: TypeScript Developer | Task: Create ManagerInfoDto class with all required fields for internal API response | Restrictions: Include class-validator decorators, ensure password is always encrypted | Success: DTO validates correctly and serializes properly_

- [x] 1.3 扩展 MtManagerService
  - File: apps/tenant-api/src/mt-manager/mt-manager.service.ts (修改)
  - 添加 `findByMiddlewareId(middlewareId: string)` 方法
  - 查询指定中间件实例关联的所有启用经理账号
  - Purpose: 提供按中间件实例查询经理账号的数据访问
  - _Leverage: 现有 MtManagerService 查询方法_
  - _Requirements: REQ-2_
  - _Prompt: Role: NestJS Backend Developer | Task: Add findByMiddlewareId method to MtManagerService that queries enabled managers for a specific middleware instance | Restrictions: Only return enabled managers, include encrypted password from database | Success: Method returns array of managers with all required fields_

## Phase 2: C++ 中间件 TenantApiClient 扩展

- [x] 2.1 定义 ManagerInfo 结构体
  - File: MT5-middleware/include/clients/TenantApiClient.hpp (修改)
  - 添加 ManagerInfo 结构体定义
  - 包含 managerId, tenantId, mtServerId, serverAddress, managerLogin, encryptedPassword
  - Purpose: 定义从 Tenant API 获取的经理账号信息结构
  - _Leverage: 现有 ApiKeyValidationResponse 结构_
  - _Requirements: REQ-3_
  - _Prompt: Role: C++ Developer | Task: Define ManagerInfo struct in TenantApiClient.hpp with fields for manager account information | Restrictions: Use std::string for IDs, uint64_t for managerLogin | Success: Struct compiles correctly with fromJson static method_

- [x] 2.2 实现 getManagers 方法
  - File: MT5-middleware/src/clients/TenantApiClient.cpp (修改)
  - 实现 `std::vector<ManagerInfo> getManagers(const std::string& middlewareId)` 方法
  - 调用 `GET /internal/managers?middlewareId=xxx` 接口
  - 使用 X-Internal-Secret 头认证
  - 支持重试机制
  - Purpose: 获取中间件需要连接的所有经理账号
  - _Leverage: 现有 validateApiKey 方法实现_
  - _Requirements: REQ-3_
  - _Prompt: Role: C++ Developer | Task: Implement getManagers method in TenantApiClient that calls Tenant API internal endpoint with X-Internal-Secret header and returns list of ManagerInfo | Restrictions: Use existing HTTP client and retry logic, handle errors gracefully | Success: Method returns vector of ManagerInfo, handles network errors with retry_

## Phase 3: C++ 中间件 ManagerConnectionPool

- [x] 3.1 创建 ManagerConnectionPool 头文件
  - File: MT5-middleware/include/services/ManagerConnectionPool.h (新建)
  - 定义 ConnectionStatus 枚举
  - 定义 PooledConnection 结构体
  - 定义 ManagerConnectionPool 类接口
  - Purpose: 定义连接池的数据结构和接口
  - _Leverage: ManagerSessionPool.h 结构设计_
  - _Requirements: REQ-4_
  - _Prompt: Role: C++ Developer | Task: Create ManagerConnectionPool.h with ConnectionStatus enum, PooledConnection struct, and ManagerConnectionPool class interface including add/remove/get/reconnect/getStatus methods | Restrictions: Use managerId (UUID string) as key, include thread-safe mechanisms | Success: Header compiles correctly, interface covers all required operations_

- [x] 3.2 实现 ManagerConnectionPool 核心方法
  - File: MT5-middleware/src/services/ManagerConnectionPool.cpp (新建)
  - 实现 add(), remove(), get(), reconnect() 方法
  - 使用 std::unordered_map<std::string, PooledConnection> 存储
  - 实现线程安全访问
  - Purpose: 提供连接池的核心管理功能
  - _Leverage: ManagerSessionPool.cpp 实现模式_
  - _Requirements: REQ-4_
  - _Prompt: Role: C++ Developer | Task: Implement ManagerConnectionPool core methods with thread-safe access using mutex, store connections in unordered_map with managerId as key | Restrictions: Ensure thread safety, use existing CredentialEncryption for password decryption | Success: All methods work correctly with concurrent access_

- [x] 3.3 实现健康检查和自动重连
  - File: MT5-middleware/src/services/ManagerConnectionPool.cpp (继续)
  - 实现 healthCheck() 方法，定期检查连接状态
  - 实现自动重连逻辑，支持指数退避
  - 集成现有熔断器机制
  - Purpose: 保证连接池的可用性和稳定性
  - _Leverage: ManagerSessionPool 熔断器和健康检查实现_
  - _Requirements: REQ-7_
  - _Prompt: Role: C++ Developer | Task: Implement healthCheck method with automatic reconnection using exponential backoff, integrate existing CircuitBreaker for failure protection | Restrictions: Health check interval 30 seconds, max retry interval 5 minutes | Success: Broken connections are detected and automatically reconnected_

- [x] 3.4 实现启动初始化
  - File: MT5-middleware/src/services/ManagerConnectionPool.cpp (继续)
  - 实现 initializeFromList(const std::vector<ManagerInfo>& managers) 方法
  - 异步连接所有经理账号，不阻塞启动
  - 输出连接池状态统计
  - Purpose: 支持中间件启动时批量建立连接
  - _Leverage: TenantApiClient.getManagers()_
  - _Requirements: REQ-1_
  - _Prompt: Role: C++ Developer | Task: Implement initializeFromList method that asynchronously connects all managers from list, logs status statistics | Restrictions: Do not block startup, handle individual connection failures gracefully | Success: Pool initializes with multiple connections, failures don't affect other connections_

## Phase 4: C++ 中间件连接池管理接口

- [x] 4.1 创建内部 API 端点
  - File: MT5-middleware/include/controllers/PoolController.h, MT5-middleware/src/controllers/PoolController.cpp (新建)
  - File: MT5-middleware/include/filters/InternalAuthFilter.h, MT5-middleware/src/filters/InternalAuthFilter.cpp (新建)
  - 实现 `POST /api/v1/pool/connections` - 添加新连接
  - 实现 `DELETE /api/v1/pool/connections/{managerId}` - 移除连接
  - 实现 `POST /api/v1/pool/connections/{managerId}/reconnect` - 重新连接
  - 实现 `GET /api/v1/pool/status` - 获取状态
  - 实现 `POST /api/v1/pool/refresh` - 批量刷新连接
  - 实现 `POST /api/v1/pool/health-check` - 手动触发健康检查
  - X-Internal-Secret 头验证 (InternalAuthFilter)
  - Purpose: 供 Tenant API 动态管理连接池
  - _Leverage: 现有 Drogon HTTP 控制器框架_
  - _Requirements: REQ-11_
  - _Prompt: Role: C++ Developer | Task: Create internal API endpoints for connection pool management with X-Internal-Secret validation | Restrictions: Validate all inputs, return appropriate status codes | Success: All endpoints work correctly, proper authentication enforced_

## Phase 5: Tenant API 连接池通知

- [x] 5.1 创建 MiddlewareNotifierService
  - File: apps/tenant-api/src/mt-manager/middleware-notifier.service.ts (新建)
  - 实现调用中间件 `/api/v1/pool/*` 接口的方法
  - 支持 notifyAdd, notifyRemove, notifyUpdate, notifyReconnect, notifyRefreshAll 操作
  - Purpose: Tenant API 通知中间件更新连接池
  - _Leverage: apps/tenant-api/src/middleware-proxy/services/middleware-client.service.ts_
  - _Requirements: REQ-6_
  - _Prompt: Role: NestJS Backend Developer | Task: Create MiddlewareNotifierService that calls C++ middleware internal pool APIs to notify connection changes | Restrictions: Use X-Internal-Secret header, handle network errors | Success: Service can notify middleware of connect/disconnect/reconnect events_

- [x] 5.2 集成到 MtManagerService
  - File: apps/tenant-api/src/mt-manager/mt-manager.service.ts (修改)
  - File: apps/tenant-api/src/mt-manager/mt-manager.module.ts (修改)
  - 在创建经理账号后调用 notifyMiddlewareAddConnection()
  - 在删除经理账号前调用 notifyMiddlewareRemoveConnection()
  - 在修改密码后调用 notifyMiddlewareUpdateConnection()
  - 在状态切换时调用相应通知方法
  - Purpose: 经理账号变更时自动通知中间件
  - _Leverage: MiddlewareNotifierService_
  - _Requirements: REQ-6_
  - _Prompt: Role: NestJS Backend Developer | Task: Integrate MiddlewareNotifierService into MtManagerService lifecycle methods | Restrictions: Notify after successful database operations, handle notification failures gracefully | Success: Manager create/update/delete automatically notifies middleware_

## Phase 6: Token 安全性改进

- [x] 6.1 简化 ApiKeyTokenPayload
  - File: apps/tenant-api/src/auth/interfaces/request-context.interface.ts (修改)
  - 从 ApiKeyTokenPayload 移除 serverId, managerLogin, middlewareId, middlewareUrl, platformType
  - 只保留 type, managerId, tenantId, apiKeyId, iat, exp
  - Purpose: Token 最小化，不暴露敏感信息
  - _Leverage: 现有接口定义_
  - _Requirements: REQ-9_
  - _Prompt: Role: TypeScript Developer | Task: Simplify ApiKeyTokenPayload interface to only include type, managerId, tenantId, apiKeyId, iat, exp | Restrictions: Maintain backward compatibility during transition | Success: Interface only contains minimal required fields_

- [x] 6.2 修改 Token 生成逻辑
  - File: apps/tenant-api/src/mt-manager/mt-manager-api-key.service.ts (修改)
  - 修改 authenticate() 方法生成简化后的 Token
  - 修改 refreshAccessToken() 方法生成简化后的 Token
  - Purpose: 生成只包含必要标识的 Token
  - _Leverage: 现有 JWT 签发逻辑_
  - _Requirements: REQ-9_
  - _Prompt: Role: NestJS Backend Developer | Task: Modify Token generation in authenticate and refreshAccessToken methods to only include managerId, tenantId, apiKeyId | Restrictions: Do not include sensitive fields like managerLogin, serverId | Success: Generated tokens only contain minimal required fields_

- [x] 6.3 修改 ServiceToken 生成
  - File: apps/tenant-api/src/auth/services/service-token.service.ts (修改)
  - 添加 PoolModeServiceTokenPayload 接口和 generatePoolModeToken() 方法
  - 生成只包含 managerId, tenantId, apiKeyId 的 Service Token
  - 移除 managerLogin, encryptedPassword 字段
  - Purpose: Tenant API 发给中间件的 Token 也最小化
  - _Leverage: 现有 ServiceToken 生成逻辑_
  - _Requirements: REQ-10_
  - _Prompt: Role: NestJS Backend Developer | Task: Modify ServiceToken generation to only include managerId, tenantId, apiKeyId | Restrictions: Do not include password or other sensitive data | Success: Service tokens are minimal and secure_

- [x] 6.4 修改 buildContextFromApiKey 函数
  - File: apps/tenant-api/src/auth/interfaces/request-context.interface.ts (修改)
  - 添加 ApiKeyFullContext 接口，buildContextFromApiKey 接受完整上下文
  - 数据库查询移至 Guard 中执行
  - Purpose: 从简化 Token 构建完整的 RequestContext
  - _Leverage: MtManagerService.findById()_
  - _Requirements: REQ-13_
  - _Prompt: Role: NestJS Backend Developer | Task: Modify buildContextFromApiKey to query database for missing fields like serverId, platformType using managerId | Restrictions: Handle manager not found case, maintain backward compatibility | Success: RequestContext is complete even with simplified token_

- [x] 6.5 修改 ApiKeyAuthGuard
  - File: apps/tenant-api/src/auth/guards/api-key-auth.guard.ts (修改)
  - 添加 validateManagerAndGetContext() 方法从数据库查询完整信息
  - 适配新的简化 Token 结构
  - Purpose: Guard 正确处理简化后的 Token
  - _Leverage: 现有 ApiKeyAuthGuard 实现_
  - _Requirements: REQ-13_
  - _Prompt: Role: NestJS Backend Developer | Task: Modify ApiKeyAuthGuard to work with simplified token and call updated buildContextFromApiKey | Restrictions: Maintain authentication security, handle missing manager gracefully | Success: Guard correctly builds RequestContext from simplified token_

## Phase 7: C++ 中间件 Token 验证修改

- [x] 7.1 修改 ServiceTokenValidator
  - File: MT5-middleware/src/filters/ServiceTokenValidator.cpp (修改)
  - File: MT5-middleware/include/filters/ServiceTokenValidator.hpp (修改)
  - 从 Token 提取 managerId 而非 managerLogin
  - 支持连接池模式 Token (mode='pool')，跳过密码解密
  - 添加 isPoolModeToken() 和 buildPoolModeAuthContext() 方法
  - 根据 managerId 从 ManagerConnectionPool 获取连接
  - Purpose: 适配新的 Token 结构，使用连接池
  - _Leverage: 现有 ServiceTokenValidator 实现_
  - _Requirements: REQ-12_
  - _Prompt: Role: C++ Developer | Task: Modify ServiceTokenValidator to extract managerId from token and get connection from ManagerConnectionPool instead of creating new connection | Restrictions: Return 404 if managerId not in pool, remove password decryption code | Success: Token validation uses connection pool, no more on-demand connection creation_

- [x] 7.2 修改 AuthContext 和 ServiceTokenClaims 结构
  - File: MT5-middleware/include/models/AuthContext.hpp (修改)
  - File: MT5-middleware/include/utils/JwtUtils.hpp (修改)
  - File: MT5-middleware/src/utils/JwtUtils.cpp (修改)
  - AuthContext 添加 managerId (string), useConnectionPool (bool) 字段
  - ServiceTokenClaims 添加 managerId, apiKeyId, mode 字段及 isPoolMode() 方法
  - 添加 createPoolModeServiceToken() 静态工厂方法
  - 保留 managerLogin 作为辅助字段（传统模式兼容）
  - Purpose: 上下文结构适配新的标识方式
  - _Leverage: 现有 AuthContext 定义_
  - _Requirements: REQ-12_
  - _Prompt: Role: C++ Developer | Task: Modify AuthContext struct to use managerId (UUID string) as primary identifier | Restrictions: Maintain backward compatibility where possible | Success: AuthContext uses managerId as primary key_

## Phase 8: 测试和切换

- [x] 8.1 Tenant API 单元测试
  - File: apps/tenant-api/src/mt-manager/internal.controller.spec.ts (新建)
  - 测试 Internal API 端点
  - 测试 X-Internal-Secret 验证
  - Purpose: 确保内部接口正确工作
  - _Leverage: 现有测试模式_
  - _Requirements: REQ-14_
  - **完成: 11 个测试用例全部通过**

- [x] 8.2 Tenant API Token 测试
  - File: apps/tenant-api/src/mt-manager/mt-manager-api-key.service.spec.ts (修改)
  - 更新现有测试适配简化后的 Token
  - 添加新测试验证 Token 不包含敏感字段
  - Purpose: 确保 Token 安全性改进正确实现
  - _Leverage: 现有测试_
  - _Requirements: REQ-14_
  - **完成: 27 个测试用例全部通过，包含简化 Token 结构验证**

- [x] 8.3 C++ 中间件 ManagerConnectionPool 测试
  - File: MT5-middleware/tests/test_service_token_validator.cpp (修改)
  - 添加连接池模式 Token 测试用例
  - 测试 isPoolModeToken, buildPoolModeAuthContext 方法
  - Purpose: 确保连接池功能正确
  - _Leverage: 现有测试框架_
  - _Requirements: REQ-14_
  - **完成: 添加 9 个 Pool Mode Token 测试用例**

- [x] 8.4 集成测试
  - File: apps/tenant-api/test/mt-manager-api-key.e2e-spec.ts (新建)
  - 测试 Manager API Key 认证流程
  - 测试 Token 简化结构
  - 测试 Internal API 端点
  - Purpose: 验证系统端到端工作正常
  - _Leverage: 现有 e2e 测试框架_
  - _Requirements: REQ-14_
  - **完成: 创建 E2E 测试覆盖认证、刷新、Internal API**

- [x] 8.5 添加配置开关
  - File: MT5-middleware/configs/config.example.json (修改)
  - 添加 `manager_connection_pool` 配置节
  - File: apps/tenant-api/src/config/configuration.ts (修改)
  - 添加 `features.connectionPoolMode` 和 `features.simplifiedTokenStructure` 配置
  - File: apps/tenant-api/.env.example (修改)
  - 添加环境变量 FEATURE_CONNECTION_POOL_MODE, FEATURE_SIMPLIFIED_TOKEN
  - Purpose: 支持灰度发布和回滚
  - _Leverage: 现有配置系统_
  - _Requirements: REQ-14_
  - **完成: 配置开关已添加到两端配置文件**

- [x] 8.6 更新文档
  - 配置说明已添加到 .env.example 和 config.example.json
  - 代码注释已添加到关键实现文件
  - Purpose: 为运维和开发提供参考
  - _Requirements: REQ-14_
  - **完成: 配置文档已内嵌到配置文件中**
