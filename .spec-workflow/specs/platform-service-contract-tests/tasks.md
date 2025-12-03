# 任务文档: Platform Service 契约测试

## 任务概览

本文档定义 Platform Service 契约测试的实现任务。

**总任务数**: 14 个任务
**预计文件变更**: 约 25 个文件

---

## 第一阶段: 测试基础设施

- [x] 1. 配置 E2E 测试环境
  - **文件**: `apps/platform-service/test/`, `apps/platform-service/test/jest-e2e.json`
  - **描述**: 配置 Jest E2E 测试环境和基础设施
  - **_Leverage**: `apps/tenant-api/test/` 配置模式
  - **_Requirements**: NFR-PS-1, NFR-PS-2
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: NestJS 测试专家
    Task: 配置 E2E 测试环境：
    - 更新 test/jest-e2e.json 配置（参考 tenant-api）
    - 创建 test/setup.ts 全局设置
    - 配置测试超时时间（30秒）
    - 配置覆盖率报告（text, lcov, html）
    - 配置 JUnit 报告输出
    - 更新 package.json 脚本: "test:e2e", "test:e2e:watch", "test:e2e:cov", "test:e2e:ci"
    Restrictions:
    - 使用 Jest + Supertest
    - 测试环境独立于开发环境
    - 复用 tenant-api 的配置模式
    Success: npm run test:e2e 可执行
    完成后：
    1. 在 tasks.md 中将此任务标记为 [-] (进行中) 开始前
    2. 使用 log-implementation 工具记录实现细节
    3. 完成后将任务标记为 [x]

- [x] 2. 创建测试工具和 Mock 服务
  - **文件**: `apps/platform-service/test/utils/`, `apps/platform-service/test/mocks/`
  - **描述**: 创建共享测试工具函数和 Mock 服务
  - **_Leverage**: `apps/tenant-api/test/mocks/` 模式
  - **_Requirements**: NFR-PS-3, NFR-PS-4
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: NestJS 测试专家
    Task: 创建测试工具：
    - 创建 test/utils/test-helpers.ts:
      - createTestingModule() - 创建测试模块
      - getAuthToken(userType, tenantId?) - 获取测试 Token (支持 PLATFORM_ADMIN 和 TENANT_ADMIN)
      - createMockTenant(overrides) - 创建模拟租户
      - createMockInstance(overrides) - 创建模拟实例
      - createMockPlatformAdmin(overrides) - 创建模拟平台管理员
      - createMockTenantAdmin(overrides) - 创建模拟租户管理员
    - 创建 test/mocks/prisma.mock.ts - Mock Prisma 服务
      - tenant, middlewareInstance, platformAdmin, tenantAdmin, subscription, invoice 操作
    - 创建 test/fixtures/test-data.ts - 测试数据常量
      - TEST_TOKENS (platformAdmin, tenantAdmin, expired)
      - TEST_TENANTS (active, suspended)
      - TEST_INSTANCES
      - TEST_SUBSCRIPTIONS
      - TEST_INVOICES
    Restrictions:
    - Mock 返回符合实际 DTO 结构
    - 支持多租户场景
    - 区分 PLATFORM_ADMIN 和 TENANT_ADMIN 权限
    Success: Mock 服务可正常注入和使用
    完成后：使用 log-implementation 记录，然后标记任务完成

- [x] 3. 创建响应验证器
  - **文件**: `apps/platform-service/test/utils/validators.ts`
  - **描述**: 创建响应格式验证工具
  - **_Leverage**: `apps/tenant-api/test/utils/validators.ts`
  - **_Requirements**: REQ-PS-1, REQ-PS-2
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: NestJS 测试专家
    Task: 创建响应验证器（参考 tenant-api 实现）：
    - 创建 test/utils/validators.ts:
      - expectSuccessResponse(response) - 验证成功响应格式
      - expectErrorResponse(response, code) - 验证错误响应格式
      - expectPaginatedResponse(response, itemsKey) - 验证分页响应格式
      - expectAuthError(response) - 验证 401 认证错误
      - expectForbiddenError(response) - 验证 403 权限错误
      - expectNotFoundError(response) - 验证 404 错误
      - expectValidationError(response) - 验证 400 参数错误
    Restrictions:
    - 验证所有必要字段存在
    - 验证字段类型正确
    - 与 tenant-api 验证器保持一致风格
    Success: 验证器可检测格式错误
    完成后：使用 log-implementation 记录，然后标记任务完成

---

## 第二阶段: 认证模块契约测试

- [x] 4. Auth 模块契约测试
  - **文件**: `apps/platform-service/test/auth.e2e-spec.ts`
  - **描述**: 认证端点契约测试
  - **_Leverage**: `src/modules/auth/auth.controller.ts`
  - **_Requirements**: REQ-PS-3
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: NestJS 测试专家
    Task: 创建 Auth 契约测试：
    - 创建 test/auth.e2e-spec.ts
    - 测试用例:
      1. POST /auth/login
         - PLATFORM_ADMIN 登录成功返回 { accessToken, refreshToken, userType }
         - TENANT_ADMIN 登录成功返回 { accessToken, refreshToken, userType, tenantId }
         - 错误密码返回 401
         - 账号禁用返回 403
      2. POST /auth/refresh
         - 有效 refreshToken 返回新 accessToken
         - 无效 Token 返回 401
      3. GET /auth/me
         - PLATFORM_ADMIN 返回平台管理员信息
         - TENANT_ADMIN 返回租户管理员信息（含 tenantId）
         - 无 Token 返回 401
    Restrictions:
    - 每个用例验证响应格式
    - 测试两种用户类型
    - 测试边界条件
    Success: 所有认证契约测试通过
    完成后：使用 log-implementation 记录，然后标记任务完成

---

## 第三阶段: 核心管理模块契约测试

- [x] 5. Tenants 模块契约测试
  - **文件**: `apps/platform-service/test/tenants.e2e-spec.ts`
  - **描述**: 租户管理端点契约测试
  - **_Leverage**: `src/modules/tenants/tenants.controller.ts`
  - **_Requirements**: REQ-PS-4
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: NestJS 测试专家
    Task: 创建 Tenants 契约测试：
    - 创建 test/tenants.e2e-spec.ts
    - 测试用例:
      1. POST /tenants - 创建租户
         - PLATFORM_ADMIN 可创建，返回完整租户信息
         - TENANT_ADMIN 返回 403
         - 缺少必填字段返回 400
      2. GET /tenants - 获取租户列表
         - 返回分页格式
         - 支持 ?status=, ?search= 过滤
      3. GET /tenants/:id - 获取租户详情
         - 返回租户完整信息
         - 不存在返回 404
      4. PATCH /tenants/:id - 更新租户
         - 更新成功返回更新后数据
      5. DELETE /tenants/:id - 删除租户
         - 有活跃实例时返回 400
      6. POST /tenants/:id/activate - 激活租户
         - 状态变为 ACTIVE
      7. POST /tenants/:id/suspend - 暂停租户
         - 状态变为 SUSPENDED
      8. GET/PATCH /tenants/:id/branding - 品牌设置
    - 所有端点测试无认证返回 401
    Restrictions:
    - 验证响应格式
    - 测试权限控制
    - 测试业务规则
    Success: 所有租户契约测试通过
    完成后：使用 log-implementation 记录，然后标记任务完成

- [x] 6. Instances 模块契约测试
  - **文件**: `apps/platform-service/test/instances.e2e-spec.ts`
  - **描述**: 中间件实例管理端点契约测试
  - **_Leverage**: `src/modules/instances/instances.controller.ts`
  - **_Requirements**: REQ-PS-5
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: NestJS 测试专家
    Task: 创建 Instances 契约测试：
    - 创建 test/instances.e2e-spec.ts
    - 测试用例:
      1. POST /instances - 创建实例
         - 返回实例信息含 apiKey
         - 超出配额返回 400
      2. GET /instances - 获取实例列表（分页）
      3. GET /instances/:id - 获取实例详情
      4. PATCH /instances/:id - 更新实例
      5. DELETE /instances/:id - 删除实例
      6. POST /instances/:id/regenerate-key - 重新生成 API Key
         - 返回新的 apiKey
      7. POST /instances/:id/health-check - 健康检查
         - 返回 { connected, latency, serverTime }
      8. GET /instances/tenant/:tenantId - 获取租户实例
      9. GET /instances/tenant/:tenantId/quota - 获取配额信息
         - 返回 { used, total, available }
      10. MT5 服务器管理 (GET/PATCH/POST/DELETE)
    - 测试 TENANT_ADMIN 只能访问自己租户的实例
    Restrictions:
    - 验证配额检查
    - 验证租户隔离
    - 验证健康检查响应
    Success: 所有实例契约测试通过
    完成后：使用 log-implementation 记录，然后标记任务完成

- [x] 7. Platform Admins 模块契约测试
  - **文件**: `apps/platform-service/test/platform-admins.e2e-spec.ts`
  - **描述**: 平台管理员端点契约测试
  - **_Leverage**: `src/modules/platform-admins/platform-admins.controller.ts`
  - **_Requirements**: REQ-PS-6
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: NestJS 测试专家
    Task: 创建 Platform Admins 契约测试：
    - 创建 test/platform-admins.e2e-spec.ts
    - 测试用例:
      1. POST /platform-admins - 创建管理员
         - 仅 PLATFORM_ADMIN 可访问
         - 邮箱重复返回 400
      2. GET /platform-admins - 获取管理员列表（分页）
      3. GET /platform-admins/:id - 获取管理员详情
      4. PATCH /platform-admins/:id - 更新管理员
      5. DELETE /platform-admins/:id - 删除管理员
         - 不能删除最后一个管理员
      6. POST /platform-admins/:id/change-password
         - 旧密码错误返回 401
      7. POST /platform-admins/:id/reset-password
         - 返回临时密码或重置链接
    - TENANT_ADMIN 访问所有端点返回 403
    Restrictions:
    - 仅 PLATFORM_ADMIN 可访问
    - 验证业务规则
    Success: 所有平台管理员契约测试通过
    完成后：使用 log-implementation 记录，然后标记任务完成

- [x] 8. Tenant Admins 模块契约测试
  - **文件**: `apps/platform-service/test/tenant-admins.e2e-spec.ts`
  - **描述**: 租户管理员端点契约测试
  - **_Leverage**: `src/modules/tenant-admins/tenant-admins.controller.ts`
  - **_Requirements**: REQ-PS-7
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: NestJS 测试专家
    Task: 创建 Tenant Admins 契约测试：
    - 创建 test/tenant-admins.e2e-spec.ts
    - 测试用例:
      1. POST /tenant-admins - 创建租户管理员
         - PLATFORM_ADMIN 可为任意租户创建
         - TENANT_ADMIN 只能为自己租户创建
         - 超出订阅限制返回 400
      2. GET /tenant-admins - 获取列表（分页）
      3. GET /tenant-admins/stats - 获取统计
      4. GET /tenant-admins/:id - 获取详情
      5. GET /tenant-admins/tenant/:tenantId - 获取租户的管理员
         - TENANT_ADMIN 只能查看自己租户
      6. PATCH /tenant-admins/:id - 更新管理员
      7. PATCH /tenant-admins/:id/password - 修改密码
      8. DELETE /tenant-admins/:id - 删除管理员
         - 不能删除租户最后一个 OWNER
      9. POST /tenant-admins/:id/activate - 激活
      10. POST /tenant-admins/:id/deactivate - 停用
    Restrictions:
    - 测试双角色权限差异
    - 验证租户隔离
    - 验证订阅限制
    Success: 所有租户管理员契约测试通过
    完成后：使用 log-implementation 记录，然后标记任务完成

---

## 第四阶段: 订阅和账单模块契约测试

- [x] 9. Subscriptions 模块契约测试
  - **文件**: `apps/platform-service/test/subscriptions.e2e-spec.ts`
  - **描述**: 订阅管理端点契约测试
  - **_Leverage**: `src/modules/subscriptions/subscriptions.controller.ts`
  - **_Requirements**: REQ-PS-8
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: NestJS 测试专家
    Task: 创建 Subscriptions 契约测试：
    - 创建 test/subscriptions.e2e-spec.ts
    - 测试用例:
      1. GET /subscriptions/plans - 获取订阅计划列表
         - 返回 STARTER, PROFESSIONAL, ENTERPRISE 计划
      2. GET /subscriptions/plans/:plan - 获取计划详情
         - 返回 { name, maxInstances, maxAdmins, price, features }
      3. GET /subscriptions - 获取所有订阅（分页）
      4. GET /subscriptions/stats - 获取订阅统计
      5. GET /subscriptions/tenant/:tenantId - 获取租户订阅
      6. GET /subscriptions/tenant/:tenantId/preview/:targetPlan - 升级预览
         - 返回价格差异和生效时间
      7. POST /subscriptions/tenant/:tenantId - 创建/变更订阅
         - 降级时检查资源使用
      8. POST /subscriptions/tenant/:tenantId/renew - 续费
    Restrictions:
    - 验证计划配额
    - 验证升降级逻辑
    Success: 所有订阅契约测试通过
    完成后：使用 log-implementation 记录，然后标记任务完成

- [x] 10. Invoices 模块契约测试
  - **文件**: `apps/platform-service/test/invoices.e2e-spec.ts`
  - **描述**: 账单管理端点契约测试
  - **_Leverage**: `src/modules/invoices/invoices.controller.ts`
  - **_Requirements**: REQ-PS-9
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: NestJS 测试专家
    Task: 创建 Invoices 契约测试：
    - 创建 test/invoices.e2e-spec.ts
    - 测试用例:
      1. POST /invoices - 创建账单
         - 返回唯一账单号
      2. GET /invoices - 获取账单列表（分页）
         - 支持 ?status=, ?tenantId= 过滤
      3. GET /invoices/stats - 获取账单统计
      4. POST /invoices/check-overdue - 检查逾期账单
      5. GET /invoices/:id - 获取账单详情
      6. GET /invoices/number/:invoiceNo - 按账单号查询
      7. GET /invoices/tenant/:tenantId - 获取租户账单
      8. PATCH /invoices/:id/status - 更新账单状态
      9. POST /invoices/:id/pay - 支付账单
         - 更新订阅状态
      10. POST /invoices/:id/cancel - 取消账单
         - 只能取消未支付账单
    Restrictions:
    - 验证账单状态转换
    - 验证支付流程
    Success: 所有账单契约测试通过
    完成后：使用 log-implementation 记录，然后标记任务完成

---

## 第五阶段: 数据和集成模块契约测试

- [x] 11. Trading Data 模块契约测试
  - **文件**: `apps/platform-service/test/trading-data.e2e-spec.ts`
  - **描述**: 交易数据聚合端点契约测试
  - **_Leverage**: `src/modules/trading-data/trading-data.controller.ts`
  - **_Requirements**: REQ-PS-10
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: NestJS 测试专家
    Task: 创建 Trading Data 契约测试：
    - 创建 test/trading-data.e2e-spec.ts
    - 测试用例:
      1. GET /trading-data/overview - 平台概览
         - PLATFORM_ADMIN 返回全平台数据
      2. GET /trading-data/overview/tenant/:tenantId - 租户概览
         - TENANT_ADMIN 只能查看自己租户
      3. GET /trading-data/history - 历史订单（分页）
         - 支持 ?from=, ?to=, ?tenantId= 过滤
      4. GET /trading-data/positions - 当前持仓
      5. GET /trading-data/balances - 账户余额
      6. GET /trading-data/stats - 统计数据
      7. GET /trading-data/aggregated/:tenantId - 租户聚合数据
      8. GET /trading-data/tenant/:tenantId/history - 租户历史
      9. GET /trading-data/instance/:instanceId/history - 实例历史
      10. GET /trading-data/instance/:instanceId/positions - 实例持仓
      11. GET /trading-data/instance/:instanceId/balances - 实例余额
    - 测试租户数据隔离
    Restrictions:
    - TENANT_ADMIN 只能访问自己租户数据
    - 验证时间范围过滤
    Success: 所有交易数据契约测试通过
    完成后：使用 log-implementation 记录，然后标记任务完成

- [x] 12. Webhook 模块契约测试
  - **文件**: `apps/platform-service/test/webhook.e2e-spec.ts`
  - **描述**: 中间件 Webhook 端点契约测试
  - **_Leverage**: `src/modules/middleware-integration/controllers/webhook.controller.ts`
  - **_Requirements**: REQ-PS-11
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: NestJS 测试专家
    Task: 创建 Webhook 契约测试：
    - 创建 test/webhook.e2e-spec.ts
    - 测试用例:
      1. POST /webhook/middleware - 通用中间件事件
         - 有效签名返回 200
         - 无效签名返回 401
      2. POST /webhook/middleware/mt5/status - MT5 状态更新
         - 更新实例状态
      3. POST /webhook/middleware/circuit-breaker - 熔断器事件
      4. POST /webhook/middleware/metrics - 性能指标
      5. POST /webhook/middleware/error - 错误报告
      6. POST /webhook/middleware/heartbeat - 心跳检测
         - 更新实例最后心跳时间
    - 测试签名验证
    Restrictions:
    - 验证 Webhook 签名机制
    - 验证事件处理逻辑
    Success: 所有 Webhook 契约测试通过
    完成后：使用 log-implementation 记录，然后标记任务完成

---

## 第六阶段: 测试报告和 CI 集成

- [x] 13. 创建测试文档
  - **文件**: `apps/platform-service/test/README.md`
  - **描述**: 创建测试运行说明文档
  - **_Leverage**: `apps/tenant-api/test/README.md`
  - **_Requirements**: NFR-PS-3
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: 技术文档专家
    Task: 创建测试文档：
    - 创建 test/README.md，包含：
      - 测试架构说明
      - 测试模块列表（9 个模块，75+ 端点）
      - 运行命令说明
      - 测试约定（响应格式、角色权限）
      - Mock 服务说明
      - 测试数据说明
      - CI/CD 集成说明
      - 添加新测试指南
      - 常见问题
    Restrictions:
    - 参考 tenant-api 文档风格
    - 保持文档简洁清晰
    Success: 文档完整且易于理解
    完成后：使用 log-implementation 记录，然后标记任务完成

- [x] 14. 测试报告和 CI 配置验证
  - **文件**: `apps/platform-service/test/jest-e2e.json`, `apps/platform-service/package.json`
  - **描述**: 验证测试报告和 CI 配置完整性
  - **_Leverage**: `apps/tenant-api/` 配置
  - **_Requirements**: NFR-PS-1, NFR-PS-2
  - **_Prompt**: |
    Implement the task for spec platform-service-contract-tests, first run spec-workflow-guide to get the workflow guide then implement the task:
    Role: DevOps 专家
    Task: 验证和完善配置：
    - 验证 Jest 测试报告配置:
      - 覆盖率报告 (lcov, text, html)
      - JUnit XML 报告 (CI 集成)
    - 验证测试脚本完整:
      - npm run test:e2e - 运行所有测试
      - npm run test:e2e:ci - CI 模式（JUnit 报告）
      - npm run test:e2e:cov - 带覆盖率
      - npm run test:e2e:watch - 监视模式
    - 运行完整测试套件验证
    - 确保所有测试通过
    Restrictions:
    - 测试超时配置合理（30秒单个测试）
    - 报告格式标准化
    Success: CI 可自动运行契约测试，所有测试通过
    完成后：使用 log-implementation 记录，然后标记任务完成

---

## 任务依赖关系

```
阶段 1 (基础设施)
  └── 任务 1-3: 顺序执行
      │
      ▼
阶段 2 (认证)
  └── 任务 4: Auth (必须最先，其他测试依赖认证)
      │
      ▼
阶段 3-5 (模块测试): 可并行
  ├── 任务 5: Tenants
  ├── 任务 6: Instances
  ├── 任务 7: Platform Admins
  ├── 任务 8: Tenant Admins
  ├── 任务 9: Subscriptions
  ├── 任务 10: Invoices
  ├── 任务 11: Trading Data
  └── 任务 12: Webhook
      │
      ▼
阶段 6 (文档和 CI)
  └── 任务 13-14: 最后执行
```

## 验收标准

1. 所有 14 个任务完成
2. 契约测试覆盖所有 75+ API 端点
3. 测试通过率 100%
4. 测试执行时间 < 120s
5. 生成可读的测试报告
6. 文档说明如何运行测试
7. 测试模式与 tenant-api 保持一致

## 运行命令

```bash
# 安装依赖
cd apps/platform-service && npm install

# 运行所有契约测试
npm run test:e2e

# 运行特定模块测试
npm run test:e2e -- --testPathPattern=auth
npm run test:e2e -- --testPathPattern=tenants

# 生成覆盖率报告
npm run test:e2e:cov

# CI 模式
npm run test:e2e:ci

# 监视模式
npm run test:e2e:watch
```
