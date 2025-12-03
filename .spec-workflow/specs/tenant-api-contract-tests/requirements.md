# 需求文档: Tenant API 契约测试

## 概述

为 Tenant API 创建完整的 API 契约测试套件，确保所有端点的请求/响应格式符合设计规范，为前端开发提供稳定可靠的 API 接口。

## 测试目标

### 主要目标

1. **验证 API 响应格式** - 确保所有端点返回符合规范的 JSON 结构
2. **验证错误码规范** - 确保错误响应包含正确的错误码和消息
3. **验证认证流程** - 确保 JWT 认证机制正常工作
4. **验证数据类型** - 确保响应字段类型与 DTO 定义一致
5. **验证分页格式** - 确保分页响应结构统一

### 测试范围

| 模块 | 端点数量 | 优先级 |
|------|---------|-------|
| Auth | 6 | P0 |
| Dashboard | 6 | P0 |
| Users | 9 | P1 |
| Positions | 2 | P1 |
| Quotes | 4 | P1 |
| History | 3 | P1 |
| Risk | 3 | P2 |
| Reports | 4 | P2 |
| Settings | 15+ | P2 |
| WebSocket | 4 events | P1 |

## 功能需求

### REQ-CT-1: 统一响应格式验证

**描述**: 验证所有成功响应符合统一格式

**响应格式**:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:00:00Z",
    "requestId": "uuid"
  }
}
```

**验收标准**:
- [ ] 所有 2xx 响应包含 `success: true`
- [ ] 所有响应包含 `data` 字段
- [ ] 所有响应包含 `meta.timestamp`

### REQ-CT-2: 统一错误格式验证

**描述**: 验证所有错误响应符合统一格式

**错误格式**:
```json
{
  "success": false,
  "error": {
    "code": "AUTH_401_001",
    "message": "用户名或密码错误",
    "details": {},
    "timestamp": "2024-01-15T10:00:00Z",
    "traceId": "uuid"
  }
}
```

**验收标准**:
- [ ] 所有 4xx/5xx 响应包含 `success: false`
- [ ] 错误响应包含规范的 `error.code`
- [ ] 错误响应包含 `error.message`

### REQ-CT-3: 认证端点契约

**端点列表**:
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /tenant/auth/login | 登录 |
| POST | /tenant/auth/refresh | 刷新令牌 |
| POST | /tenant/auth/logout | 登出 |
| POST | /tenant/auth/change-password | 修改密码 |
| GET | /tenant/auth/profile | 获取个人信息 |
| PUT | /tenant/auth/profile | 更新个人信息 |

**验收标准**:
- [ ] 登录成功返回 accessToken 和 refreshToken
- [ ] 无效凭证返回 AUTH_401_001
- [ ] 账号禁用返回 AUTH_403_001
- [ ] 租户暂停返回 TENANT_403_001
- [ ] Token 过期返回 AUTH_401_002

### REQ-CT-4: Dashboard 端点契约

**端点列表**:
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /tenant/dashboard/stats | 统计数据 |
| GET | /tenant/dashboard/trading-trend | 交易趋势 |
| GET | /tenant/dashboard/symbol-distribution | 品种分布 |
| GET | /tenant/dashboard/user-activity | 用户活跃度 |
| GET | /tenant/dashboard/recent-trades | 最近交易 |
| GET | /tenant/dashboard/system-status | 系统状态 |

**验收标准**:
- [ ] 无认证返回 401
- [ ] 统计数据包含必要字段 (totalUsers, totalBalance, etc.)
- [ ] 趋势数据为数组格式

### REQ-CT-5: 分页响应契约

**描述**: 验证所有分页端点返回统一格式

**分页格式**:
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

**适用端点**:
- GET /tenant/users
- GET /tenant/positions
- GET /tenant/history
- GET /tenant/risk/alerts

**验收标准**:
- [ ] 分页响应包含 total, page, limit, totalPages
- [ ] items 为数组类型
- [ ] 默认分页参数生效 (page=1, limit=20)

### REQ-CT-6: WebSocket 事件契约

**事件列表**:
| 事件 | 描述 | 数据结构 |
|------|------|---------|
| position:update | 持仓更新 | PositionUpdateData |
| quote:update | 报价更新 | QuoteUpdateData |
| trade:new | 新成交 | TradeData |
| risk:alert | 风险预警 | RiskAlertData |

**验收标准**:
- [ ] 连接时验证 JWT
- [ ] 无效 Token 断开连接
- [ ] 事件数据结构符合 DTO 定义

### REQ-CT-7: 权限控制契约

**角色权限**:
| 角色 | 描述 |
|------|------|
| OWNER | 租户所有者，完全权限 |
| ADMIN | 管理员，管理权限 |
| OPERATOR | 操作员，只读权限 |

**验收标准**:
- [ ] OPERATOR 访问管理端点返回 403
- [ ] 跨租户访问返回 403
- [ ] 角色继承正确 (OWNER > ADMIN > OPERATOR)

## 非功能需求

### NFR-CT-1: 测试覆盖率

- API 端点覆盖率 > 95%
- 错误场景覆盖率 > 80%

### NFR-CT-2: 测试执行时间

- 单个测试 < 500ms
- 完整测试套件 < 60s

### NFR-CT-3: 可维护性

- 测试数据与测试逻辑分离
- 共享测试工具函数
- 清晰的测试命名规范

## 技术约束

### 测试框架

- Jest + Supertest (HTTP 测试)
- @nestjs/testing (NestJS 集成)
- socket.io-client (WebSocket 测试)

### Mock 策略

- Mock MiddlewareProxyService (不依赖真实中间件)
- Mock PrismaService (使用内存数据)
- 真实 JWT 签发和验证

### 测试数据

- 预设租户: test-tenant
- 预设管理员: admin@test.com / password123
- 预设 Token: 有效期 1 小时

## 验收标准

1. 所有契约测试通过
2. 生成 API 契约文档 (可选: OpenAPI 快照)
3. 测试报告包含覆盖率统计
4. CI 集成就绪
