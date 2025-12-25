# Tasks Document: Unified Connection Pool

## Phase 1: Tenant API 扩展

- [x] 1.1 创建 ManagerAccessTokenResponseDto
  - File: `apps/tenant-api/src/mt-manager/dto/manager-access-token.dto.ts`
  - 定义 Access Token 响应的 DTO 类
  - 包含 accessToken, expiresIn, expiresAt, tokenType, middlewareUrl, manager 信息
  - Purpose: 提供类型安全的 API 响应结构
  - _Leverage: `apps/tenant-api/src/mt-manager/dto/mt-manager.dto.ts`_
  - _Requirements: 4_
  - _Prompt: Role: TypeScript Developer | Task: Create ManagerAccessTokenResponseDto class with proper validation decorators following existing DTO patterns | Restrictions: Use class-validator decorators, follow existing naming conventions | Success: DTO compiles without errors, includes Swagger decorators for API documentation_

- [x] 1.2 创建 MtManagerAccessTokenService
  - File: `apps/tenant-api/src/mt-manager/mt-manager-access-token.service.ts`
  - 实现 `generateAccessToken(tenantId, managerId, userId)` 方法
  - 实现 `validateManagerAccess(tenantId, managerId)` 验证逻辑
  - 验证 Manager 存在、激活、属于租户、关联的中间件已分配
  - Purpose: 处理 Manager Access Token 的生成逻辑
  - _Leverage: `apps/tenant-api/src/auth/services/service-token.service.ts`, `apps/tenant-api/src/mt-manager/mt-manager.service.ts`_
  - _Requirements: 4, 5_
  - _Prompt: Role: NestJS Backend Developer | Task: Implement MtManagerAccessTokenService with manager validation and token generation using ServiceTokenService.generatePoolModeToken() | Restrictions: Must validate tenant ownership and middleware assignment, use existing PrismaService patterns | Success: Service generates valid Pool Mode tokens, proper error handling for all validation scenarios_

- [x] 1.3 创建 MtManagerAccessTokenController
  - File: `apps/tenant-api/src/mt-manager/mt-manager-access-token.controller.ts`
  - 实现 `POST /:managerId/access-token` 端点
  - 添加 `@TenantGuard()` 和 `@Roles(['owner', 'admin', 'operator'])` 装饰器
  - Purpose: 提供租户后台获取 Manager Access Token 的 API
  - _Leverage: `apps/tenant-api/src/mt-manager/mt-manager.controller.ts`_
  - _Requirements: 4_
  - _Prompt: Role: NestJS Backend Developer | Task: Create controller endpoint for generating Manager Access Token with proper guards and decorators | Restrictions: Require JWT authentication, enforce role-based access control | Success: Endpoint accessible only to authenticated tenant users with appropriate roles_

- [x] 1.4 更新 MtManagerModule
  - File: `apps/tenant-api/src/mt-manager/mt-manager.module.ts`
  - 注册 `MtManagerAccessTokenService` 和 `MtManagerAccessTokenController`
  - 确保依赖注入正确配置
  - Purpose: 集成新服务和控制器到模块
  - _Leverage: 现有模块配置_
  - _Requirements: 4_
  - _Prompt: Role: NestJS Developer | Task: Register new service and controller in MtManagerModule | Restrictions: Follow existing module structure | Success: Module compiles and services are properly injected_

- [x] 1.5 编写 Tenant API 单元测试
  - File: `apps/tenant-api/src/mt-manager/mt-manager-access-token.service.spec.ts`
  - 测试 Manager 验证逻辑（存在性、激活状态、租户归属、中间件分配）
  - 测试 Token 生成逻辑
  - 测试错误场景（404, 403, 400）
  - Purpose: 确保服务逻辑正确性
  - _Leverage: `apps/tenant-api/test/mocks/prisma.mock.ts`_
  - _Requirements: 4, 5_
  - _Prompt: Role: QA Engineer | Task: Create comprehensive unit tests for MtManagerAccessTokenService covering all validation scenarios | Restrictions: Mock all external dependencies, test both success and failure cases | Success: 100% coverage of service methods, all edge cases tested_

- [x] 1.6 编写 Tenant API E2E 测试
  - File: `apps/tenant-api/test/mt-manager-access-token.e2e-spec.ts`
  - 测试完整的 API 调用流程
  - 测试认证和授权
  - 测试响应格式
  - Purpose: 验证端到端功能
  - _Leverage: `apps/tenant-api/test/fixtures/test-data.ts`_
  - _Requirements: 4_
  - _Prompt: Role: QA Engineer | Task: Write E2E tests for the access-token endpoint | Restrictions: Use test database, follow existing E2E test patterns | Success: API endpoint works correctly in realistic scenarios_

## Phase 2: C++ 中间件统一

- [x] 2.1 创建 UnifiedTokenValidator 类
  - File: `MT5-middleware/include/filters/UnifiedTokenValidator.h`, `MT5-middleware/src/filters/UnifiedTokenValidator.cpp`
  - 定义 `TokenValidationResult` 结构体
  - 定义 `TokenType` 枚举 (POOL_MODE, API_KEY, LEGACY)
  - 实现 `validate(token)` 方法，支持三种 Token 格式
  - Purpose: 统一所有 Token 类型的验证逻辑
  - _Leverage: `MT5-middleware/src/filters/AuthFilter.cpp` 现有验证逻辑_
  - _Requirements: 2, 6_
  - _Prompt: Role: C++ Developer | Task: Create UnifiedTokenValidator class supporting Pool Mode, API Key, and Legacy token formats with JWT validation | Restrictions: Use existing jwt-cpp library, thread-safe implementation | Success: All three token formats correctly parsed and validated_

- [x] 2.2 创建 ManagerIdResolver 类
  - File: `MT5-middleware/include/services/ManagerIdResolver.h`, `MT5-middleware/src/services/ManagerIdResolver.cpp`
  - 实现旧格式 Token 的 managerId 解析
  - 添加本地缓存（LRU，TTL 5分钟）
  - 支持从 Tenant API 查询 Manager 映射
  - Purpose: 为旧格式 Token 提供 managerId 解析能力
  - _Leverage: `MT5-middleware/src/clients/TenantApiClient.cpp`_
  - _Requirements: 6_
  - _Prompt: Role: C++ Developer | Task: Create ManagerIdResolver with LRU cache for resolving managerId from legacy token credentials | Restrictions: Thread-safe caching, reasonable TTL to balance freshness and performance | Success: Legacy tokens correctly resolved to managerId with efficient caching_

- [x] 2.3 修改 AuthFilter 使用统一验证器
  - File: `MT5-middleware/src/filters/AuthFilter.cpp`
  - 替换现有的分支验证逻辑
  - 使用 `UnifiedTokenValidator` 验证 Token
  - 使用 `ManagerConnectionPool.get(managerId)` 获取连接
  - 旧格式 Token 通过 `ManagerIdResolver` 解析
  - Purpose: 统一所有请求的认证流程
  - _Leverage: 现有 AuthFilter 逻辑_
  - _Requirements: 1, 6_
  - _Prompt: Role: C++ Developer | Task: Refactor AuthFilter to use UnifiedTokenValidator and ManagerConnectionPool for all token types | Restrictions: Maintain backward compatibility with legacy tokens, no breaking changes to API | Success: All three token types work correctly through unified flow_

- [x] 2.4 增强 ManagerConnectionPool 支持按需连接
  - File: `MT5-middleware/src/services/ManagerConnectionPool.cpp`
  - 添加 `getOrCreate(managerId, managerInfo)` 方法
  - 支持在连接不存在时按需建立
  - 添加预热接口 `preloadConnections()`
  - Purpose: 支持旧格式 Token 的按需连接场景
  - _Leverage: 现有 `ManagerConnectionPool` 实现_
  - _Requirements: 1, 6_
  - _Prompt: Role: C++ Developer | Task: Add on-demand connection creation to ManagerConnectionPool for legacy token support | Restrictions: Thread-safe connection creation, avoid connection storms | Success: Connections created on-demand when not in pool, preload works correctly_

- [x] 2.5 添加旧格式 Token 使用警告日志
  - File: `MT5-middleware/src/filters/AuthFilter.cpp`
  - 当检测到旧格式 Token 时记录警告日志
  - 包含建议升级到新格式的信息
  - Purpose: 跟踪旧格式 Token 使用情况，推动迁移
  - _Leverage: 现有日志框架_
  - _Requirements: 2_
  - _Prompt: Role: C++ Developer | Task: Add warning logs for legacy token usage with migration guidance | Restrictions: Do not affect request processing, log only once per session | Success: Legacy token usage is trackable in logs_

- [x] 2.6 编写 C++ 单元测试
  - File: `MT5-middleware/tests/UnifiedTokenValidatorTest.cpp`, `MT5-middleware/tests/ManagerIdResolverTest.cpp`
  - 测试三种 Token 格式的解析
  - 测试 ManagerIdResolver 缓存逻辑
  - 测试错误场景
  - Purpose: 确保新组件正确性
  - _Leverage: 现有测试框架_
  - _Requirements: 2, 6_
  - _Prompt: Role: C++ Developer | Task: Write unit tests for UnifiedTokenValidator and ManagerIdResolver | Restrictions: Test all token formats and edge cases | Success: All components thoroughly tested_

## Phase 3: 集成测试

- [x] 3.1 编写租户后台端到端测试
  - File: `e2e/tests/tenant-console-manager-access.spec.ts`
  - 测试流程：登录 → 获取 Manager Token → 调用中间件 API
  - 验证 Token 正确传递到中间件
  - 验证连接池正确复用
  - Purpose: 验证租户后台完整流程
  - _Leverage: `e2e/` 现有测试框架_
  - _Requirements: 3_
  - _Prompt: Role: QA Engineer | Task: Create E2E test for tenant console accessing middleware via Pool Mode token | Restrictions: Test full flow from login to API call | Success: Complete user journey works correctly_

- [x] 3.2 编写第三方应用端到端测试
  - File: `e2e/tests/api-key-auth-flow.spec.ts`
  - 测试流程：API Key 认证 → 获取 Token → 调用中间件 API
  - 验证 Token 正确传递到中间件
  - 验证连接池正确复用
  - Purpose: 验证第三方应用流程不受影响
  - _Leverage: `e2e/` 现有测试框架_
  - _Requirements: 7_
  - _Prompt: Role: QA Engineer | Task: Create E2E test for third-party app authentication flow | Restrictions: Ensure existing flow unchanged | Success: API Key authentication works as before_

- [x] 3.3 编写连接池共享测试
  - File: `e2e/tests/connection-pool-sharing.spec.ts`
  - 测试场景：租户后台和第三方应用同时访问同一 Manager
  - 验证两者共享同一个 MT5 连接
  - 监控连接池大小
  - Purpose: 验证连接池共享机制
  - _Leverage: 中间件 Pool Status API_
  - _Requirements: 8_
  - _Prompt: Role: QA Engineer | Task: Test that tenant console and third-party app share the same MT5 connection | Restrictions: Verify connection reuse through pool statistics | Success: Single connection serves both access methods_

- [x] 3.4 编写向后兼容性测试
  - File: `e2e/tests/legacy-token-compatibility.spec.ts`
  - 测试旧格式 Service Token 仍然有效
  - 验证旧格式 Token 正确解析 managerId
  - 检查警告日志生成
  - Purpose: 确保向后兼容
  - _Leverage: 现有 Service Token 生成逻辑_
  - _Requirements: 2_
  - _Prompt: Role: QA Engineer | Task: Test backward compatibility with legacy Service Token format | Restrictions: Must not break existing integrations | Success: Legacy tokens work correctly with warning logs_

## Phase 4: 文档和清理

- [x] 4.1 更新 API 文档
  - File: `docs/api/tenant-api.md`
  - 添加新端点 `POST /api/v1/mt-managers/{managerId}/access-token` 文档
  - 包含请求/响应示例
  - 说明权限要求
  - Purpose: 提供完整的 API 文档
  - _Requirements: 4_
  - _Prompt: Role: Technical Writer | Task: Document the new access-token endpoint with examples | Restrictions: Follow existing documentation format | Success: Clear, complete API documentation_

- [x] 4.2 更新中间件架构文档
  - File: `MT5-middleware/docs/MULTI_TENANT_ARCHITECTURE.md`
  - 更新连接池架构说明
  - 添加统一 Token 验证流程图
  - 说明向后兼容策略
  - Purpose: 保持文档与实现同步
  - _Requirements: 1, 6_
  - _Prompt: Role: Technical Writer | Task: Update middleware architecture documentation with unified pool design | Restrictions: Include diagrams and migration timeline | Success: Architecture documentation is current and comprehensive_

- [x] 4.3 创建迁移指南
  - File: `docs/migration/unified-connection-pool.md`
  - 说明新旧 Token 格式差异
  - 提供前端迁移步骤
  - 设定旧格式 Token 废弃时间线
  - Purpose: 指导客户端迁移
  - _Requirements: 2_
  - _Prompt: Role: Technical Writer | Task: Create migration guide for clients upgrading to Pool Mode tokens | Restrictions: Clear timeline and step-by-step instructions | Success: Clients can follow guide to migrate successfully_

- [x] 4.4 代码审查和清理
  - 审查所有新增代码
  - 移除调试代码和注释
  - 确保代码风格一致
  - Purpose: 确保代码质量
  - _Requirements: All_
  - _Prompt: Role: Senior Developer | Task: Review and clean up all new code | Restrictions: Follow project coding standards | Success: Code passes all linting and review checks_

## 依赖关系

```
1.1 → 1.2 → 1.3 → 1.4 → 1.5, 1.6
2.1 → 2.3
2.2 → 2.3 → 2.4 → 2.5 → 2.6
(Phase 1 和 Phase 2 可并行)
Phase 1 + Phase 2 → Phase 3
Phase 3 → Phase 4
```

## 验收标准

1. **功能验收**
   - 租户后台可通过新端点获取 Manager Access Token
   - 第三方应用认证流程保持不变
   - 两者访问同一 Manager 时共享连接
   - 旧格式 Token 继续有效（带警告日志）

2. **性能验收**
   - Token 验证延迟 < 10ms
   - 连接池命中率 > 95%
   - 无额外 MT5 连接创建

3. **安全验收**
   - Manager 访问严格验证租户归属
   - 中间件实例访问验证租户分配
   - 所有操作有审计日志

4. **质量验收**
   - 单元测试覆盖率 > 80%
   - E2E 测试全部通过
   - 无 critical/high 级别安全漏洞
