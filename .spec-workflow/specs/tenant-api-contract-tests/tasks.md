# 任务文档: Tenant API 契约测试

## 任务概览

本文档定义 Tenant API 契约测试的实现任务。

**总任务数**: 12 个任务
**预计文件变更**: 约 20 个文件

---

## 第一阶段: 测试基础设施

- [x] 1. 配置 E2E 测试环境
  - **文件**: `apps/tenant-api/test/`, `apps/tenant-api/jest-e2e.json`
  - **描述**: 配置 Jest E2E 测试环境和基础设施
  - **_Leverage**: `apps/platform-service/test/` 配置
  - **_Requirements**: NFR-CT-1, NFR-CT-2
  - **_Prompt**: |
    Role: NestJS 测试专家
    Task: 配置 E2E 测试环境：
    - 创建 test/jest-e2e.json 配置
    - 创建 test/setup.ts 全局设置
    - 配置测试数据库 (SQLite in-memory 或 PostgreSQL test schema)
    - 配置测试超时时间
    - 添加测试脚本到 package.json: "test:e2e", "test:e2e:watch", "test:e2e:cov"
    Restrictions:
    - 使用 Jest + Supertest
    - 测试环境独立于开发环境
    Success: npm run test:e2e 可执行

- [x] 2. 创建测试工具和 Mock 服务
  - **文件**: `apps/tenant-api/test/utils/`, `apps/tenant-api/test/mocks/`
  - **描述**: 创建共享测试工具函数和 Mock 服务
  - **_Leverage**: 现有单元测试 Mock
  - **_Requirements**: NFR-CT-3
  - **_Prompt**: |
    Role: NestJS 测试专家
    Task: 创建测试工具：
    - 创建 test/utils/test-helpers.ts:
      - createTestingModule() - 创建测试模块
      - getAuthToken(role) - 获取测试 Token
      - createMockAdmin(overrides) - 创建模拟管理员
      - createMockTenant(overrides) - 创建模拟租户
    - 创建 test/mocks/middleware-proxy.mock.ts - Mock 中间件代理
    - 创建 test/mocks/prisma.mock.ts - Mock Prisma 服务
    - 创建 test/fixtures/test-data.ts - 测试数据常量
    Restrictions:
    - Mock 返回符合实际 DTO 结构
    - 支持自定义覆盖
    Success: Mock 服务可正常注入和使用

- [x] 3. 创建响应验证器
  - **文件**: `apps/tenant-api/test/utils/validators.ts`
  - **描述**: 创建响应格式验证工具
  - **_Leverage**: REQ-CT-1, REQ-CT-2
  - **_Requirements**: REQ-CT-1, REQ-CT-2
  - **_Prompt**: |
    Role: NestJS 测试专家
    Task: 创建响应验证器：
    - 创建 test/utils/validators.ts:
      - expectSuccessResponse(response) - 验证成功响应格式
      - expectErrorResponse(response, code) - 验证错误响应格式
      - expectPaginatedResponse(response) - 验证分页响应格式
      - expectAuthError(response) - 验证认证错误
      - expectForbiddenError(response) - 验证权限错误
    - 使用 Jest 自定义匹配器 (可选)
    Restrictions:
    - 验证所有必要字段存在
    - 验证字段类型正确
    Success: 验证器可检测格式错误

---

## 第二阶段: 认证模块契约测试

- [x] 4. Auth 模块契约测试
  - **文件**: `apps/tenant-api/test/auth.e2e-spec.ts`
  - **描述**: 认证端点契约测试
  - **_Leverage**: auth.controller.ts
  - **_Requirements**: REQ-CT-3
  - **_Prompt**: |
    Role: NestJS 测试专家
    Task: 创建 Auth 契约测试：
    - 创建 test/auth.e2e-spec.ts
    - 测试用例:
      1. POST /tenant/auth/login
         - 成功登录返回 { accessToken, refreshToken, expiresIn }
         - 错误密码返回 AUTH_401_001
         - 账号禁用返回 AUTH_403_001
         - 租户暂停返回 TENANT_403_001
      2. POST /tenant/auth/refresh
         - 有效 refreshToken 返回新 accessToken
         - 无效 Token 返回 AUTH_401_002
      3. POST /tenant/auth/logout
         - 成功登出返回 200
      4. GET /tenant/auth/profile
         - 返回当前管理员信息
         - 无 Token 返回 401
      5. PUT /tenant/auth/profile
         - 更新成功返回更新后数据
      6. POST /tenant/auth/change-password
         - 旧密码错误返回 AUTH_401_001
         - 成功修改返回 200
    Restrictions:
    - 每个用例验证响应格式
    - 测试边界条件
    Success: 所有认证契约测试通过

---

## 第三阶段: 核心业务模块契约测试

- [x] 5. Dashboard 模块契约测试
  - **文件**: `apps/tenant-api/test/dashboard.e2e-spec.ts`
  - **描述**: Dashboard 端点契约测试
  - **_Leverage**: dashboard.controller.ts
  - **_Requirements**: REQ-CT-4
  - **_Prompt**: |
    Role: NestJS 测试专家
    Task: 创建 Dashboard 契约测试：
    - 创建 test/dashboard.e2e-spec.ts
    - 测试用例:
      1. GET /tenant/dashboard/stats
         - 返回 { totalUsers, activeUsers, totalBalance, totalEquity, ... }
      2. GET /tenant/dashboard/trading-trend?days=7
         - 返回数组格式趋势数据
      3. GET /tenant/dashboard/symbol-distribution
         - 返回品种分布数组
      4. GET /tenant/dashboard/user-activity?days=7
         - 返回用户活跃度数据
      5. GET /tenant/dashboard/recent-trades?limit=10
         - 返回最近交易列表
      6. GET /tenant/dashboard/system-status
         - 返回系统状态 { mt5Connected, latency, ... }
    - 所有端点测试无认证返回 401
    Restrictions:
    - 验证数据字段类型
    - 验证数组元素结构
    Success: 所有 Dashboard 契约测试通过

- [x] 6. Users 模块契约测试
  - **文件**: `apps/tenant-api/test/users.e2e-spec.ts`
  - **描述**: 用户管理端点契约测试
  - **_Leverage**: users.controller.ts
  - **_Requirements**: REQ-CT-5, REQ-CT-7
  - **_Prompt**: |
    Role: NestJS 测试专家
    Task: 创建 Users 契约测试：
    - 创建 test/users.e2e-spec.ts
    - 测试用例:
      1. GET /tenant/users
         - 返回分页格式 { items, total, page, limit, totalPages }
         - 支持 ?search=, ?group=, ?status= 过滤
      2. GET /tenant/users/groups
         - 返回组别列表
      3. GET /tenant/users/:login
         - 返回用户详情
         - 不存在返回 404
      4. PUT /tenant/users/:login/group (OWNER, ADMIN only)
         - OPERATOR 返回 403
      5. PUT /tenant/users/:login/leverage
         - 杠杆范围验证 (1-500)
      6. PUT /tenant/users/:login/status
         - 启用/禁用用户
      7. GET /tenant/users/:login/transactions
         - 返回分页出入金记录
      8. GET /tenant/users/:login/logs
         - 返回分页操作日志
      9. POST /tenant/users/export
         - 返回 CSV 文件或下载链接
    Restrictions:
    - 测试权限控制
    - 测试参数验证
    Success: 所有 Users 契约测试通过

- [x] 7. Positions 和 Quotes 模块契约测试
  - **文件**: `apps/tenant-api/test/positions.e2e-spec.ts`, `apps/tenant-api/test/quotes.e2e-spec.ts`
  - **描述**: 持仓和报价端点契约测试
  - **_Leverage**: positions.controller.ts, quotes.controller.ts
  - **_Requirements**: REQ-CT-5
  - **_Prompt**: |
    Role: NestJS 测试专家
    Task: 创建 Positions 和 Quotes 契约测试：
    - 创建 test/positions.e2e-spec.ts:
      1. GET /tenant/positions
         - 返回分页持仓列表
         - 支持 ?symbol=, ?type=, ?login= 过滤
      2. GET /tenant/positions/stats
         - 返回统计 { totalPositions, buyCount, sellCount, totalVolume, totalProfit }
    - 创建 test/quotes.e2e-spec.ts:
      1. GET /tenant/quotes
         - 返回报价列表
         - 支持 ?search= 过滤
      2. GET /tenant/quotes/favorites
         - 返回当前管理员自选列表
      3. POST /tenant/quotes/favorites
         - 添加自选品种
      4. POST /tenant/quotes/favorites/remove
         - 移除自选品种
    Restrictions:
    - 验证持仓数据字段完整性
    - 验证报价数据字段 (bid, ask, spread 等)
    Success: 所有持仓和报价契约测试通过

- [x] 8. History 和 Risk 模块契约测试
  - **文件**: `apps/tenant-api/test/history.e2e-spec.ts`, `apps/tenant-api/test/risk.e2e-spec.ts`
  - **描述**: 历史和风控端点契约测试
  - **_Leverage**: history.controller.ts, risk.controller.ts
  - **_Requirements**: REQ-CT-5, REQ-CT-7
  - **_Prompt**: |
    Role: NestJS 测试专家
    Task: 创建 History 和 Risk 契约测试：
    - 创建 test/history.e2e-spec.ts:
      1. GET /tenant/history
         - 返回分页历史订单
         - 支持 ?from=, ?to=, ?symbol=, ?login= 过滤
      2. GET /tenant/history/stats
         - 返回统计 { totalOrders, totalProfit, winRate, ... }
      3. POST /tenant/history/export
         - 返回导出文件
    - 创建 test/risk.e2e-spec.ts:
      1. GET /tenant/risk/alerts
         - 返回分页预警列表
         - 支持 ?type=, ?level= 过滤
      2. GET /tenant/risk/config (OWNER, ADMIN only)
         - 返回预警配置
      3. PUT /tenant/risk/config (OWNER, ADMIN only)
         - 更新预警配置
         - OPERATOR 返回 403
    Restrictions:
    - 测试时间范围过滤
    - 测试权限控制
    Success: 所有历史和风控契约测试通过

---

## 第四阶段: 设置模块契约测试

- [x] 9. Settings 模块契约测试
  - **文件**: `apps/tenant-api/test/settings.e2e-spec.ts`
  - **描述**: 设置端点契约测试
  - **_Leverage**: settings.controller.ts
  - **_Requirements**: REQ-CT-7
  - **_Prompt**: |
    Role: NestJS 测试专家
    Task: 创建 Settings 契约测试：
    - 创建 test/settings.e2e-spec.ts
    - 测试用例分组:
      1. Branding (白标配置)
         - GET /tenant/settings/branding
         - PUT /tenant/settings/branding (OWNER only)
      2. Admins (管理员管理)
         - GET /tenant/settings/admins (OWNER only)
         - POST /tenant/settings/admins
         - PUT /tenant/settings/admins/:id
         - DELETE /tenant/settings/admins/:id
         - 不能删除最后一个 OWNER
         - 邮箱唯一性验证
      3. API Keys
         - GET /tenant/settings/api-keys
         - POST /tenant/settings/api-keys (返回完整密钥)
         - PUT /tenant/settings/api-keys/:id/status
         - DELETE /tenant/settings/api-keys/:id
      4. Notifications
         - GET /tenant/settings/notifications
         - PUT /tenant/settings/notifications
      5. MT5 Server Info
         - GET /tenant/settings/mt5-server
    Restrictions:
    - 测试所有角色权限
    - 测试业务规则约束
    Success: 所有设置契约测试通过

- [x] 10. Reports 模块契约测试
  - **文件**: `apps/tenant-api/test/reports.e2e-spec.ts`
  - **描述**: 报表端点契约测试
  - **_Leverage**: reports.controller.ts
  - **_Requirements**: REQ-CT-5
  - **_Prompt**: |
    Role: NestJS 测试专家
    Task: 创建 Reports 契约测试：
    - 创建 test/reports.e2e-spec.ts
    - 测试用例:
      1. GET /tenant/reports/trading?period=day
         - 返回交易报表数据
         - 支持 period=day|week|month
      2. GET /tenant/reports/users?period=day
         - 返回用户报表数据
      3. GET /tenant/reports/finance?period=day
         - 返回财务报表数据
      4. POST /tenant/reports/:type/export (OWNER, ADMIN only)
         - 支持 format=pdf|excel
         - OPERATOR 返回 403
    Restrictions:
    - 验证日期范围参数
    - 验证周期切换
    Success: 所有报表契约测试通过

---

## 第五阶段: WebSocket 契约测试

- [x] 11. WebSocket 契约测试
  - **文件**: `apps/tenant-api/test/websocket.e2e-spec.ts`
  - **描述**: WebSocket 事件契约测试
  - **_Leverage**: websocket.gateway.ts
  - **_Requirements**: REQ-CT-6
  - **_Prompt**: |
    Role: NestJS 测试专家，精通 Socket.IO
    Task: 创建 WebSocket 契约测试：
    - 创建 test/websocket.e2e-spec.ts
    - 安装 socket.io-client
    - 测试用例:
      1. 连接认证
         - 有效 Token 连接成功
         - 无效 Token 断开连接
         - 过期 Token 断开连接
      2. position:update 事件
         - 验证数据结构 { ticket, symbol, type, volume, profit, ... }
      3. quote:update 事件
         - 验证数据结构 { symbol, bid, ask, spread, ... }
      4. risk:alert 事件
         - 验证数据结构 { id, type, level, message, ... }
      5. 订阅/取消订阅
         - subscribe:symbols 正确订阅
         - unsubscribe:symbols 正确取消
    Restrictions:
    - 使用 socket.io-client v4
    - 测试连接超时处理
    Success: 所有 WebSocket 契约测试通过

---

## 第六阶段: 测试报告和 CI 集成

- [x] 12. 测试报告和 CI 配置
  - **文件**: `apps/tenant-api/jest-e2e.json`, `.github/workflows/` 或项目 CI 配置
  - **描述**: 配置测试报告和 CI 集成
  - **_Leverage**: 现有 CI 配置
  - **_Requirements**: NFR-CT-1, NFR-CT-2
  - **_Prompt**: |
    Role: DevOps 专家
    Task: 配置测试报告和 CI：
    - 配置 Jest 测试报告:
      - 覆盖率报告 (lcov, text)
      - JUnit XML 报告 (CI 集成)
    - 创建测试脚本:
      - npm run test:e2e:ci - CI 环境运行
      - npm run test:e2e:report - 生成 HTML 报告
    - 配置 CI 工作流 (可选):
      - 在 PR 时运行契约测试
      - 测试失败阻止合并
    - 创建测试文档:
      - test/README.md - 测试运行说明
    Restrictions:
    - 测试超时配置合理
    - 报告格式标准化
    Success: CI 可自动运行契约测试

---

## 任务依赖关系

```
阶段 1 (基础设施)
  └── 任务 1-3: 顺序执行
      │
      ▼
阶段 2-5 (模块测试): 可并行
  ├── 任务 4: Auth (必须最先，其他测试依赖认证)
  │     │
  │     ▼
  ├── 任务 5: Dashboard
  ├── 任务 6: Users
  ├── 任务 7: Positions + Quotes
  ├── 任务 8: History + Risk
  ├── 任务 9: Settings
  ├── 任务 10: Reports
  └── 任务 11: WebSocket
      │
      ▼
阶段 6 (报告和 CI)
  └── 任务 12: 最后执行
```

## 验收标准

1. 所有 12 个任务完成
2. 契约测试覆盖所有 API 端点
3. 测试通过率 100%
4. 测试执行时间 < 60s
5. 生成可读的测试报告
6. 文档说明如何运行测试

## 运行命令

```bash
# 安装依赖
cd apps/tenant-api && npm install

# 运行所有契约测试
npm run test:e2e

# 运行特定模块测试
npm run test:e2e -- --testPathPattern=auth

# 生成覆盖率报告
npm run test:e2e:cov

# 监视模式
npm run test:e2e:watch
```
