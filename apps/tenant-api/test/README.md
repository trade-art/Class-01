# Tenant API E2E 契约测试

本目录包含 tenant-api 服务的端到端 (E2E) API 契约测试，用于验证 API 请求/响应格式的正确性。

## 测试架构

```
test/
├── fixtures/           # 测试数据
│   └── test-data.ts    # JWT tokens, 测试用户, 报价等
├── mocks/              # Mock 服务
│   ├── prisma.mock.ts          # Prisma 数据库 Mock
│   └── middleware-proxy.mock.ts # 中间件代理 Mock
├── utils/              # 测试工具
│   └── validators.ts   # 响应格式验证器
├── *.e2e-spec.ts       # E2E 测试文件
├── jest-e2e.json       # Jest E2E 配置
├── setup.ts            # 测试全局设置
└── README.md           # 本文档
```

## 测试模块

| 模块 | 测试文件 | 端点数量 | 描述 |
|------|----------|----------|------|
| Auth | `auth.e2e-spec.ts` | 5 | 登录、刷新 Token、登出、验证、密码 |
| Dashboard | `dashboard.e2e-spec.ts` | 4 | 仪表盘概览、账户、持仓、快捷统计 |
| Users | `users.e2e-spec.ts` | 10+ | 用户列表、分组、详情、更新、交易记录 |
| Positions | `positions.e2e-spec.ts` | 3 | 持仓列表、统计、按品种统计 |
| Quotes | `quotes.e2e-spec.ts` | 8 | 报价列表、品种、自选管理 |
| History | `history.e2e-spec.ts` | 6 | 历史订单、统计、导出、订单详情 |
| Risk | `risk.e2e-spec.ts` | 7 | 风控预警、统计、配置管理 |
| Settings | `settings.e2e-spec.ts` | 10+ | 品牌设置、管理员、API Key、通知 |
| Reports | `reports.e2e-spec.ts` | 6 | 交易/用户/财务报表及导出 |
| WebSocket | `websocket.e2e-spec.ts` | - | 连接认证、订阅/取消订阅、心跳 |

## 运行测试

### 运行所有 E2E 测试
```bash
npm run test:e2e
```

### 监视模式
```bash
npm run test:e2e:watch
```

### 带覆盖率
```bash
npm run test:e2e:cov
```

### CI 模式 (生成 JUnit 报告)
```bash
npm run test:e2e:ci
```

### 调试模式
```bash
npm run test:e2e:debug
```

### 运行单个测试文件
```bash
npm run test:e2e -- auth.e2e-spec.ts
```

## 测试约定

### 响应格式

所有 API 响应遵循统一格式：

**成功响应:**
```json
{
  "success": true,
  "data": { ... }
}
```

**错误响应:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述"
  }
}
```

**分页响应:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

### 角色权限

| 角色 | 描述 |
|------|------|
| OWNER | 租户所有者，最高权限 |
| ADMIN | 管理员，大部分管理权限 |
| OPERATOR | 操作员，只读和基本操作权限 |

### Mock 服务

**MockPrismaService:**
- 模拟数据库操作
- 提供预设测试数据
- 支持动态设置返回值

**MockMiddlewareProxyService:**
- 模拟 MT5 中间件连接
- 支持模拟服务不可用状态
- 提供预设交易数据

## 测试数据

测试使用预生成的 JWT Token：

```typescript
TEST_TOKENS = {
  validOwner: '...',     // OWNER 角色 Token
  validAdmin: '...',     // ADMIN 角色 Token
  validOperator: '...',  // OPERATOR 角色 Token
  expired: '...',        // 过期 Token
}
```

## 自定义 Jest 匹配器

```typescript
// 验证成功响应
expect(response).toBeSuccessResponse();

// 验证错误响应
expect(response).toBeErrorResponse('AUTH_001');

// 验证分页响应
expect(response).toBePaginatedResponse();
```

## CI/CD 集成

测试配置了 GitHub Actions 工作流：

- **触发条件:** push/PR 到 main/develop 分支
- **测试阶段:** Lint -> Unit Tests -> E2E Tests -> Build
- **报告输出:** JUnit XML + 覆盖率报告
- **Artifact:** 测试结果保留 30 天

## 添加新测试

1. 在 `test/` 目录创建 `{module}.e2e-spec.ts`
2. 导入必要的 Mock 服务和测试工具
3. 遵循现有测试结构：
   - 认证测试
   - 权限测试
   - 验证测试
   - 响应格式测试
   - 服务不可用测试
   - 响应时间测试

4. 如需新的测试数据，添加到 `fixtures/test-data.ts`
5. 如需新的验证器，添加到 `utils/validators.ts`

## 常见问题

**Q: 测试超时怎么办？**
A: 检查 `jest-e2e.json` 中的 `testTimeout` 设置，默认 30 秒。

**Q: 如何调试失败的测试？**
A: 使用 `npm run test:e2e:debug` 启动调试模式。

**Q: WebSocket 测试连接失败？**
A: 确保 socket.io-client 版本与服务端 socket.io 版本兼容。
