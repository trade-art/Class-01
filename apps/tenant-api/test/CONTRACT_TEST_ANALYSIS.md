# API 契约测试分析报告

**生成时间**: 2024-01-15
**测试结果**: 116 通过 / 118 失败 (不含 WebSocket)

---

## 问题分类汇总

| 问题类型 | 数量 | 影响模块 |
|---------|------|---------|
| JWT Payload 不匹配 (403) | ~60 | History, Settings, Users, Reports, Risk |
| Mock 服务响应缺失 (500) | ~20 | Dashboard, Quotes, Auth |
| 服务降级处理缺失 (期望503得到200) | ~5 | Dashboard, Positions |
| 登录流程差异 (400 vs 401) | ~8 | Auth |
| 响应格式差异 | ~10 | 多个模块 |

---

## 详细问题分析

### 1. JWT Payload 结构不匹配 (高优先级)

**症状**: 大量 403 Forbidden 错误
**原因**: 测试生成的 JWT Token payload 与 API Guard 期望的结构不同

**受影响端点**:
- `/tenant/history/*` - 所有端点
- `/tenant/settings/*` - 所有端点
- `/tenant/reports/*` - 所有端点
- `/tenant/risk/config` - GET/PUT
- `/tenant/users/export` - POST
- `/tenant/users/:login/status` - PUT

**修复方案**:
检查 `JwtStrategy` 和各 Guard 中期望的 JWT payload 结构，更新 `test-data.ts` 中的 token 生成逻辑

```typescript
// 当前测试 Token 结构
{
  sub: 'admin-test-001',
  email: 'admin@test.com',
  tenantId: 'tenant-test-001',
  tenantCode: 'TEST001',
  role: 'ADMIN',
  type: 'tenant_admin',
}

// 可能需要的字段
{
  sub: 'admin-test-001',
  email: 'admin@test.com',
  tenantId: 'tenant-test-001',
  instanceId: 'instance-001',  // 可能缺失
  role: 'ADMIN',
  permissions: ['read', 'write'],  // 可能缺失
}
```

---

### 2. Mock 服务响应缺失 (高优先级)

**症状**: 500 Internal Server Error
**原因**: MockMiddlewareProxyService 未实现某些方法或返回空值

**受影响端点**:
- `GET /tenant/dashboard` - 需要完整的 dashboard 数据
- `GET /tenant/dashboard/account` - 需要账户摘要
- `GET /tenant/dashboard/quick-stats` - 需要快速统计
- `GET /tenant/quotes/symbols` - 需要品种列表
- `GET /tenant/quotes/:symbol` - 需要单个报价
- `GET /tenant/quotes/favorites` - 需要自选列表
- `POST /tenant/quotes/favorites` - 需要添加自选
- `GET /tenant/auth/me` - 需要用户详情查询

**修复方案**:
更新 `middleware-proxy.mock.ts` 添加缺失的方法实现

```typescript
// 需要添加的 Mock 方法
getDashboardData(): Promise<DashboardData>
getAccountSummary(): Promise<AccountSummary>
getQuickStats(): Promise<QuickStats>
getSymbolInfo(symbol: string): Promise<SymbolInfo>
```

---

### 3. 服务降级处理 (中优先级)

**症状**: 期望 503 但得到 200
**原因**: `mockMiddlewareProxyService.setConnected(false)` 未正确触发服务不可用

**受影响端点**:
- `GET /tenant/dashboard` - 中间件不可用时
- `GET /tenant/positions` - 中间件不可用时
- `GET /tenant/history` - 中间件不可用时

**修复方案**:
检查 MockMiddlewareProxyService 的 `setConnected()` 实现，确保断开时抛出适当异常

```typescript
// Mock 应该实现
setConnected(connected: boolean) {
  this.isConnected = connected;
}

someMethod() {
  if (!this.isConnected) {
    throw new ServiceUnavailableException('中间件服务不可用');
  }
  // ...
}
```

---

### 4. Auth 登录流程差异 (中优先级)

**症状**: 期望 401 但得到 400
**原因**: 登录失败时 API 返回 400 (Bad Request) 而非 401 (Unauthorized)

**受影响场景**:
- 密码错误
- 邮箱不存在
- 账号禁用
- 租户暂停

**修复方案** (二选一):
1. **调整测试**: 将期望的状态码从 401 改为 400
2. **调整 API**: 修改 AuthService 登录失败时返回 401

**推荐**: 根据 HTTP 语义，认证失败应返回 401，建议修改 API

---

### 5. 响应格式差异 (低优先级)

**症状**: 断言失败
**原因**: 实际响应结构与测试期望不同

**示例**:
```typescript
// 测试期望
{ success: true, data: { items: [...], total, page, limit } }

// 实际可能
{ success: true, data: { users: [...], pagination: { total, page, limit } } }
```

**修复方案**: 检查各端点的实际响应格式，更新 validators.ts 和测试断言

---

## 修复优先级

### P0 - 必须修复 (阻塞前端开发)

1. **JWT Payload 结构** - 检查并对齐 token 结构
2. **Mock 服务实现** - 补充缺失的 Mock 方法

### P1 - 应该修复 (影响测试可靠性)

3. **服务降级处理** - 确保 Mock 正确模拟服务不可用
4. **Auth 状态码** - 统一认证失败的响应码

### P2 - 可以延后 (不影响主要功能)

5. **响应格式对齐** - 细节调整
6. **WebSocket 测试** - 需要特殊测试配置

---

## 修复文件清单

| 文件 | 修复内容 |
|------|---------|
| `test/fixtures/test-data.ts` | 更新 JWT payload 结构 |
| `test/mocks/middleware-proxy.mock.ts` | 添加缺失的 Mock 方法 |
| `test/mocks/prisma.mock.ts` | 添加 admin 查询方法 |
| `src/auth/auth.service.ts` | 调整登录失败状态码 (可选) |
| `test/utils/validators.ts` | 更新响应格式验证 |

---

## 下一步行动

1. 检查 `src/auth/strategies/jwt.strategy.ts` 中的 payload 验证逻辑
2. 检查各 Guard 中期望的用户对象结构
3. 补充 MockMiddlewareProxyService 缺失方法
4. 逐模块运行测试验证修复效果
