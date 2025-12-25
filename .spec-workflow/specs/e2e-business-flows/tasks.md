# Tasks Document: E2E Business Flows

## Phase 1: Test Infrastructure Setup

- [x] 1. 配置 Playwright 测试框架
  - File: `package.json` (add devDependencies), `playwright.config.ts`, `e2e/tsconfig.json`
  - 安装 Playwright 依赖，配置测试报告输出
  - 配置多浏览器支持，截图和视频录制
  - Purpose: E2E 测试基础设施
  - _Leverage: 现有 Jest 配置_
  - _Requirements: 1.1_
  - _Prompt: Role: QA Engineer | Task: Setup Playwright with config, multi-browser support, screenshot/video recording | Restrictions: Parallel test execution | Success: Playwright runs basic test_

- [x] 2. 创建测试数据工厂
  - File: `e2e/factories/tenant.factory.ts`, `e2e/factories/user.factory.ts`, `e2e/factories/mt-server.factory.ts`, `e2e/factories/trading-user.factory.ts`, `e2e/factories/index.ts`
  - TenantFactory、UserFactory、MtServerFactory、TradingUserFactory
  - 支持数据库插入
  - Purpose: 测试数据生成
  - _Leverage: @faker-js/faker_
  - _Requirements: 1.2_
  - _Prompt: Role: QA Engineer | Task: Create test data factories for tenant, user, mt-server, trading-user with DB insert | Restrictions: Realistic test data | Success: Factories generate valid test data_

- [x] 3. 创建 Page Object Models
  - File: `e2e/pages/login.page.ts`, `e2e/pages/dashboard.page.ts`, `e2e/pages/users.page.ts`, `e2e/pages/mt-servers.page.ts`, `e2e/pages/positions.page.ts`, `e2e/pages/index.ts`
  - LoginPage、DashboardPage、UsersPage、MtServersPage、PositionsPage
  - Purpose: 页面交互封装
  - _Leverage: Playwright best practices_
  - _Requirements: 1.3_
  - _Prompt: Role: QA Engineer | Task: Create Page Object Models for main pages with selectors and actions | Restrictions: Reusable and maintainable | Success: Pages encapsulate all interactions_

- [x] 4. 创建测试辅助函数
  - File: `e2e/support/auth.helper.ts`, `e2e/support/database.helper.ts`, `e2e/support/api.helper.ts`, `e2e/support/test-utils.ts`
  - 认证辅助、数据库重置、API 请求辅助、等待和断言
  - Purpose: 测试工具函数
  - _Leverage: Task 2_
  - _Requirements: 1.4_
  - _Prompt: Role: QA Engineer | Task: Create test helpers for auth, database, API, assertions | Restrictions: DRY principle | Success: Helpers simplify test code_

## Phase 2: Tenant Registration Flow Tests

- [x] 5. 创建租户注册测试
  - File: `e2e/specs/business-flows/tenant-registration.spec.ts`
  - 成功注册新租户，验证邮件发送，验证管理员账户创建
  - 验证默认设置初始化，重复邮箱注册失败
  - Purpose: 验证注册流程
  - _Leverage: Task 1-4_
  - _Requirements: 2.1, 2.4_
  - _Prompt: Role: QA Engineer | Task: Create tenant registration E2E tests covering happy path and error scenarios | Restrictions: Isolated test data | Success: Registration flow fully tested_

- [x] 6. 创建初始化向导测试
  - File: `e2e/specs/business-flows/onboarding-wizard.spec.ts`
  - 首次登录引导流程，MT 服务器配置步骤
  - 跳过可选步骤，向导完成后重定向
  - Purpose: 验证初始化流程
  - _Leverage: Task 5_
  - _Requirements: 2.1, 2.5_
  - _Prompt: Role: QA Engineer | Task: Create onboarding wizard E2E tests for first login flow | Restrictions: Test all wizard paths | Success: Wizard flow fully tested_

## Phase 3: MT Server Configuration Flow Tests

- [x] 7. 创建 MT 服务器 CRUD 测试
  - File: `e2e/specs/business-flows/mt-server-crud.spec.ts`
  - 添加 MT5/MT4 服务器，编辑服务器配置
  - 删除服务器，设置默认服务器
  - Purpose: 验证服务器配置管理
  - _Leverage: Task 3, Task 4_
  - _Requirements: 3.1, 3.3, 3.5_
  - _Prompt: Role: QA Engineer | Task: Create MT server CRUD E2E tests for add, edit, delete, set-default | Restrictions: Test validation errors | Success: Server CRUD fully tested_

- [x] 8. 创建 MT 服务器连接测试
  - File: `e2e/specs/business-flows/mt-server-connection.spec.ts`
  - 测试连接成功、失败（错误凭证）、超时
  - 显示服务器版本和延迟，错误提示
  - Purpose: 验证连接测试功能
  - _Leverage: Task 7_
  - _Requirements: 3.2, 3.4_
  - _Prompt: Role: QA Engineer | Task: Create MT server connection E2E tests for success, failure, timeout scenarios | Restrictions: Mock middleware for failure tests | Success: Connection test fully tested_

## Phase 4: User Management Flow Tests

- [x] 9. 创建用户列表测试
  - File: `e2e/specs/business-flows/user-list.spec.ts`
  - 显示用户列表，分页功能
  - 按登录名、姓名搜索，按分组过滤
  - Purpose: 验证用户列表功能
  - _Leverage: Task 3, Task 4_
  - _Requirements: 4.1, 4.2, 4.4_
  - _Prompt: Role: QA Engineer | Task: Create user list E2E tests for display, pagination, search, filter | Restrictions: Large dataset tests | Success: User list fully tested_

- [x] 10. 创建用户详情测试
  - File: `e2e/specs/business-flows/user-detail.spec.ts`
  - 显示账户信息、余额和净值
  - 显示持仓、订单、成交记录
  - Purpose: 验证用户详情功能
  - _Leverage: Task 9_
  - _Requirements: 4.3_
  - _Prompt: Role: QA Engineer | Task: Create user detail E2E tests for account info, positions, orders, deals tabs | Restrictions: Test data loading states | Success: User detail fully tested_

## Phase 5: Trading Data Flow Tests

- [x] 11. 创建持仓列表测试
  - File: `e2e/specs/business-flows/positions-list.spec.ts`
  - 显示所有持仓和实时盈亏
  - 按品种、用户过滤，数据刷新
  - Purpose: 验证持仓列表功能
  - _Leverage: Task 3, Task 4_
  - _Requirements: 5.1, 5.3, 5.4_
  - _Prompt: Role: QA Engineer | Task: Create positions list E2E tests for display, P&L, filtering, refresh | Restrictions: Test real-time updates | Success: Positions list fully tested_

- [x] 12. 创建订单列表测试
  - File: `e2e/specs/business-flows/orders-list.spec.ts`
  - 显示挂单和历史订单
  - 按时间范围、状态过滤，分页功能
  - Purpose: 验证订单列表功能
  - _Leverage: Task 11_
  - _Requirements: 5.2, 5.3_
  - _Prompt: Role: QA Engineer | Task: Create orders list E2E tests for pending, history, filtering, pagination | Restrictions: Date range filtering | Success: Orders list fully tested_

- [x] 13. 创建数据导出测试
  - File: `e2e/specs/business-flows/data-export.spec.ts`
  - 导出用户列表 CSV、持仓列表 CSV、订单列表 Excel
  - 验证导出文件内容
  - Purpose: 验证数据导出功能
  - _Leverage: Task 9, Task 11, Task 12_
  - _Requirements: 5.5_
  - _Prompt: Role: QA Engineer | Task: Create data export E2E tests for CSV and Excel exports with content validation | Restrictions: Verify file contents | Success: Export functionality fully tested_

## Phase 6: Multi-tenant Isolation Tests

- [x] 14. 创建数据隔离测试
  - File: `e2e/specs/isolation/data-isolation.spec.ts`
  - 租户 A 只能看到自己的数据，租户 B 只能看到自己的数据
  - 跨租户数据不可见，API 响应只包含当前租户数据
  - Purpose: 验证数据隔离
  - _Leverage: Task 2, Task 4_
  - _Requirements: 6.1_
  - _Prompt: Role: QA Engineer | Task: Create data isolation E2E tests with multiple tenants verifying complete isolation | Restrictions: Create separate tenant contexts | Success: Data isolation verified_

- [x] 15. 创建跨租户访问测试
  - File: `e2e/specs/isolation/cross-tenant-access.spec.ts`
  - 直接访问其他租户资源返回 403/404
  - 修改请求参数尝试返回 403/404，Token 篡改检测
  - Purpose: 验证访问控制
  - _Leverage: Task 14_
  - _Requirements: 6.2, 6.3_
  - _Prompt: Role: QA Engineer | Task: Create cross-tenant access E2E tests for direct access, param tampering, token manipulation | Restrictions: Security-focused tests | Success: Cross-tenant access blocked_

- [x] 16. 创建租户生命周期测试
  - File: `e2e/specs/isolation/tenant-lifecycle.spec.ts`
  - 禁用租户后无法访问和会话终止
  - 重新启用后恢复访问，租户删除后数据清理
  - Purpose: 验证租户状态管理
  - _Leverage: Task 14_
  - _Requirements: 6.4, 6.5_
  - _Prompt: Role: QA Engineer | Task: Create tenant lifecycle E2E tests for disable, enable, delete scenarios | Restrictions: Test session invalidation | Success: Tenant lifecycle fully tested_

## Phase 7: Performance Tests

- [x] 17. 创建页面加载时间测试
  - File: `e2e/specs/performance/page-load.spec.ts`
  - 仪表板、用户列表、持仓列表加载 < 2秒
  - 登录响应 < 1秒
  - Purpose: 验证页面性能
  - _Leverage: Playwright performance APIs_
  - _Requirements: 7.1_
  - _Prompt: Role: QA Engineer | Task: Create page load time tests with performance assertions | Restrictions: Consistent test environment | Success: Page load times meet SLA_

- [x] 18. 创建 API 响应时间测试
  - File: `e2e/specs/performance/api-response.spec.ts`
  - 用户列表、持仓列表 API < 1秒
  - 搜索 API < 500ms，大数据量分页 < 2秒
  - Purpose: 验证 API 性能
  - _Leverage: supertest_
  - _Requirements: 7.2_
  - _Prompt: Role: QA Engineer | Task: Create API response time tests with timing assertions | Restrictions: Large dataset scenarios | Success: API times meet SLA_

## Phase 8: CI/CD Integration

- [x] 19. 创建 E2E 测试 workflow
  - File: `.github/workflows/e2e-tests.yml`
  - PR 触发 E2E 测试，测试环境自动启动
  - 并行运行测试，测试报告上传，失败截图保存
  - Purpose: CI 集成 E2E 测试
  - _Leverage: Task 1_
  - _Requirements: 8.1_
  - _Prompt: Role: DevOps Engineer | Task: Create E2E test GitHub workflow with parallel execution, reports, screenshots | Restrictions: PR-triggered | Success: E2E tests run in CI_

- [x] 20. 创建测试环境配置
  - File: `e2e/docker-compose.test.yml`, `e2e/.env.test`
  - 测试数据库、Redis 配置
  - Mock MT5 服务配置，环境变量
  - Purpose: 隔离测试环境
  - _Leverage: docker-compose_
  - _Requirements: 8.2_
  - _Prompt: Role: DevOps Engineer | Task: Create test environment docker-compose with test DB, Redis, mock middleware | Restrictions: Isolated from prod | Success: Tests run in isolated environment_

- [x] 21. 创建测试文档
  - File: `e2e/README.md`, `docs/e2e-testing-guide.md`
  - 测试运行指南，测试编写规范
  - Page Object 使用指南，常见问题
  - Purpose: 测试文档
  - _Requirements: 8.3_
  - _Prompt: Role: Technical Writer | Task: Create E2E testing documentation with run guide, writing guide, FAQ | Restrictions: Beginner-friendly | Success: New devs can write and run E2E tests_

## Summary

| Phase | Tasks | Count |
|-------|-------|-------|
| Phase 1: Test Infrastructure Setup | 1-4 | 4 |
| Phase 2: Tenant Registration Flow Tests | 5-6 | 2 |
| Phase 3: MT Server Configuration Flow Tests | 7-8 | 2 |
| Phase 4: User Management Flow Tests | 9-10 | 2 |
| Phase 5: Trading Data Flow Tests | 11-13 | 3 |
| Phase 6: Multi-tenant Isolation Tests | 14-16 | 3 |
| Phase 7: Performance Tests | 17-18 | 2 |
| Phase 8: CI/CD Integration | 19-21 | 3 |
| **Total** | | **21** |
