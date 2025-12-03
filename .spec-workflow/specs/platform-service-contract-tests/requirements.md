# 需求文档: Platform Service 契约测试

## 概述

为 Platform Service 创建完整的 API 契约测试套件，确保所有端点的请求/响应格式符合设计规范，为前端开发和多租户管理提供稳定可靠的 API 接口。

## 背景

Platform Service 是 MT5 多租户平台的核心管理服务，负责：
- 租户生命周期管理（创建、激活、暂停）
- 中间件实例管理（分配、配置、健康检查）
- 平台管理员和租户管理员管理
- 订阅计划和账单管理
- 跨租户交易数据聚合
- 中间件集成（Webhook 事件处理）

## 测试目标

### 主要目标

1. **验证 API 响应格式** - 确保所有端点返回符合规范的 JSON 结构
2. **验证错误码规范** - 确保错误响应包含正确的错误码和消息
3. **验证认证流程** - 确保 JWT 认证机制对平台管理员和租户管理员正常工作
4. **验证权限控制** - 确保 PLATFORM_ADMIN 和 TENANT_ADMIN 角色权限正确
5. **验证多租户隔离** - 确保跨租户数据隔离正确
6. **验证分页格式** - 确保分页响应结构统一

### 测试范围

| 模块 | 端点数量 | 优先级 | 描述 |
|------|---------|-------|------|
| Auth | 3 | P0 | 登录、刷新 Token、获取当前用户 |
| Tenants | 8 | P0 | 租户 CRUD、激活/暂停、品牌设置 |
| Instances | 12 | P0 | 实例 CRUD、健康检查、MT5 服务器配置 |
| Platform Admins | 7 | P1 | 平台管理员 CRUD、密码管理 |
| Tenant Admins | 10 | P1 | 租户管理员 CRUD、激活/停用 |
| Subscriptions | 8 | P2 | 订阅计划、续费、升级预览 |
| Invoices | 10 | P2 | 账单 CRUD、支付、逾期检查 |
| Trading Data | 11 | P2 | 跨租户数据聚合、历史、持仓、余额 |
| Webhook | 6 | P1 | 中间件事件接收、健康状态、熔断器 |

**总计**: 75+ 端点

## 功能需求

### REQ-PS-1: 统一响应格式验证

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

### REQ-PS-2: 统一错误格式验证

**描述**: 验证所有错误响应符合统一格式

**错误格式**:
```json
{
  "success": false,
  "error": {
    "code": "TENANT_404_001",
    "message": "租户不存在",
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

### REQ-PS-3: 认证端点契约

**端点列表**:
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /auth/login | 平台/租户管理员登录 |
| POST | /auth/refresh | 刷新令牌 |
| GET | /auth/me | 获取当前用户信息 |

**验收标准**:
- [ ] 登录成功返回 accessToken 和 refreshToken
- [ ] 区分 PLATFORM_ADMIN 和 TENANT_ADMIN 登录
- [ ] 无效凭证返回 401
- [ ] Token 过期返回 401

### REQ-PS-4: 租户管理端点契约

**端点列表**:
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /tenants | 创建租户 |
| GET | /tenants | 获取租户列表 |
| GET | /tenants/:id | 获取租户详情 |
| PATCH | /tenants/:id | 更新租户 |
| DELETE | /tenants/:id | 删除租户 |
| POST | /tenants/:id/activate | 激活租户 |
| POST | /tenants/:id/suspend | 暂停租户 |
| GET | /tenants/:id/branding | 获取品牌设置 |
| PATCH | /tenants/:id/branding | 更新品牌设置 |

**验收标准**:
- [ ] 仅 PLATFORM_ADMIN 可访问
- [ ] 创建租户返回完整租户信息
- [ ] 激活/暂停更新租户状态
- [ ] 租户不存在返回 404
- [ ] 删除有活跃实例的租户返回 400

### REQ-PS-5: 中间件实例端点契约

**端点列表**:
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /instances | 创建实例 |
| GET | /instances | 获取实例列表 |
| GET | /instances/:id | 获取实例详情 |
| PATCH | /instances/:id | 更新实例 |
| DELETE | /instances/:id | 删除实例 |
| POST | /instances/:id/regenerate-key | 重新生成 API Key |
| POST | /instances/:id/health-check | 执行健康检查 |
| GET | /instances/tenant/:tenantId | 获取租户实例列表 |
| GET | /instances/tenant/:tenantId/quota | 获取租户配额 |
| GET | /instances/:id/mt5-servers | 获取 MT5 服务器列表 |
| PATCH | /instances/:id/mt5-servers | 更新 MT5 服务器 |
| POST | /instances/:id/mt5-servers | 添加 MT5 服务器 |
| DELETE | /instances/:id/mt5-servers/:serverName | 删除 MT5 服务器 |

**验收标准**:
- [ ] 创建实例检查租户配额
- [ ] 健康检查返回连接状态和延迟
- [ ] 重新生成 Key 返回新的 API Key
- [ ] 实例不存在返回 404
- [ ] 超出配额返回 400

### REQ-PS-6: 平台管理员端点契约

**端点列表**:
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /platform-admins | 创建管理员 |
| GET | /platform-admins | 获取管理员列表 |
| GET | /platform-admins/:id | 获取管理员详情 |
| PATCH | /platform-admins/:id | 更新管理员 |
| DELETE | /platform-admins/:id | 删除管理员 |
| POST | /platform-admins/:id/change-password | 修改密码 |
| POST | /platform-admins/:id/reset-password | 重置密码 |

**验收标准**:
- [ ] 仅 PLATFORM_ADMIN 可访问
- [ ] 邮箱唯一性验证
- [ ] 不能删除最后一个管理员
- [ ] 密码修改需验证旧密码

### REQ-PS-7: 租户管理员端点契约

**端点列表**:
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /tenant-admins | 创建租户管理员 |
| GET | /tenant-admins | 获取租户管理员列表 |
| GET | /tenant-admins/stats | 获取统计信息 |
| GET | /tenant-admins/:id | 获取管理员详情 |
| GET | /tenant-admins/tenant/:tenantId | 获取租户的管理员 |
| PATCH | /tenant-admins/:id | 更新管理员 |
| PATCH | /tenant-admins/:id/password | 修改密码 |
| DELETE | /tenant-admins/:id | 删除管理员 |
| POST | /tenant-admins/:id/activate | 激活管理员 |
| POST | /tenant-admins/:id/deactivate | 停用管理员 |

**验收标准**:
- [ ] PLATFORM_ADMIN 可管理所有租户管理员
- [ ] TENANT_ADMIN 只能管理自己租户的管理员
- [ ] 不能删除租户的最后一个 OWNER
- [ ] 租户管理员数量受订阅计划限制

### REQ-PS-8: 订阅管理端点契约

**端点列表**:
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /subscriptions/plans | 获取订阅计划列表 |
| GET | /subscriptions/plans/:plan | 获取计划详情 |
| GET | /subscriptions | 获取所有订阅 |
| GET | /subscriptions/stats | 获取订阅统计 |
| GET | /subscriptions/tenant/:tenantId | 获取租户订阅 |
| GET | /subscriptions/tenant/:tenantId/preview/:targetPlan | 升级预览 |
| POST | /subscriptions/tenant/:tenantId | 创建/变更订阅 |
| POST | /subscriptions/tenant/:tenantId/renew | 续费订阅 |

**验收标准**:
- [ ] 返回正确的计划配额（实例数、管理员数）
- [ ] 升级预览显示价格差异
- [ ] 降级检查当前资源使用
- [ ] 过期订阅限制操作

### REQ-PS-9: 账单端点契约

**端点列表**:
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /invoices | 创建账单 |
| GET | /invoices | 获取账单列表 |
| GET | /invoices/stats | 获取账单统计 |
| POST | /invoices/check-overdue | 检查逾期账单 |
| GET | /invoices/:id | 获取账单详情 |
| GET | /invoices/number/:invoiceNo | 按账单号查询 |
| GET | /invoices/tenant/:tenantId | 获取租户账单 |
| PATCH | /invoices/:id/status | 更新账单状态 |
| POST | /invoices/:id/pay | 支付账单 |
| POST | /invoices/:id/cancel | 取消账单 |

**验收标准**:
- [ ] 账单号唯一且格式正确
- [ ] 支付更新账单状态和订阅
- [ ] 取消只能对未支付账单
- [ ] 逾期检查更新租户状态

### REQ-PS-10: 交易数据端点契约

**端点列表**:
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /trading-data/overview | 平台概览 |
| GET | /trading-data/overview/tenant/:tenantId | 租户概览 |
| GET | /trading-data/history | 历史订单 |
| GET | /trading-data/positions | 当前持仓 |
| GET | /trading-data/balances | 账户余额 |
| GET | /trading-data/stats | 统计数据 |
| GET | /trading-data/aggregated/:tenantId | 租户聚合数据 |
| GET | /trading-data/tenant/:tenantId/history | 租户历史 |
| GET | /trading-data/instance/:instanceId/history | 实例历史 |
| GET | /trading-data/instance/:instanceId/positions | 实例持仓 |
| GET | /trading-data/instance/:instanceId/balances | 实例余额 |

**验收标准**:
- [ ] 概览包含总用户、总余额、总持仓等
- [ ] 支持时间范围过滤
- [ ] 数据按租户/实例正确隔离
- [ ] TENANT_ADMIN 只能查看自己租户数据

### REQ-PS-11: Webhook 端点契约

**端点列表**:
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /webhook/middleware | 通用中间件事件 |
| POST | /webhook/middleware/mt5/status | MT5 状态更新 |
| POST | /webhook/middleware/circuit-breaker | 熔断器事件 |
| POST | /webhook/middleware/metrics | 性能指标 |
| POST | /webhook/middleware/error | 错误报告 |
| POST | /webhook/middleware/heartbeat | 心跳检测 |

**验收标准**:
- [ ] 验证 Webhook 签名
- [ ] 无效签名返回 401
- [ ] 正确处理各类事件
- [ ] 心跳更新实例状态

### REQ-PS-12: 分页响应契约

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
- GET /tenants
- GET /instances
- GET /platform-admins
- GET /tenant-admins
- GET /subscriptions
- GET /invoices
- GET /trading-data/history
- GET /trading-data/positions

**验收标准**:
- [ ] 分页响应包含 total, page, limit, totalPages
- [ ] items 为数组类型
- [ ] 默认分页参数生效 (page=1, limit=20)

### REQ-PS-13: 权限控制契约

**角色权限**:
| 角色 | 描述 | 权限范围 |
|------|------|---------|
| PLATFORM_ADMIN | 平台管理员 | 全部端点 |
| TENANT_ADMIN | 租户管理员 | 仅自己租户数据 |

**验收标准**:
- [ ] TENANT_ADMIN 访问平台管理端点返回 403
- [ ] TENANT_ADMIN 访问其他租户数据返回 403
- [ ] 无 Token 返回 401
- [ ] 过期 Token 返回 401

## 非功能需求

### NFR-PS-1: 测试覆盖率

- API 端点覆盖率 > 95%
- 错误场景覆盖率 > 80%

### NFR-PS-2: 测试执行时间

- 单个测试 < 500ms
- 完整测试套件 < 120s (端点多于 tenant-api)

### NFR-PS-3: 可维护性

- 测试数据与测试逻辑分离
- 共享测试工具函数（可复用 tenant-api 模式）
- 清晰的测试命名规范

### NFR-PS-4: 可复用性

- 复用 tenant-api 的测试基础设施模式
- Mock 服务结构保持一致
- 验证器函数可共享

## 技术约束

### 测试框架

- Jest + Supertest (HTTP 测试)
- @nestjs/testing (NestJS 集成)

### Mock 策略

- Mock PrismaService (使用内存数据)
- Mock 外部中间件调用
- 真实 JWT 签发和验证

### 测试数据

**平台管理员**:
- 预设管理员: platform-admin@test.com
- 角色: PLATFORM_ADMIN

**租户数据**:
- 租户 1: tenant-001 (ACTIVE)
- 租户 2: tenant-002 (SUSPENDED)
- 租户管理员: tenant-admin@tenant-001.com

**订阅计划**:
- STARTER: 1 实例, 3 管理员
- PROFESSIONAL: 5 实例, 10 管理员
- ENTERPRISE: 无限实例, 无限管理员

## 依赖关系

- 参考 tenant-api-contract-tests 的实现模式
- 复用测试工具函数设计
- 保持响应格式验证器一致

## 验收标准

1. 所有 75+ 端点契约测试通过
2. 测试覆盖 PLATFORM_ADMIN 和 TENANT_ADMIN 两种角色
3. 测试报告包含覆盖率统计
4. CI 集成就绪
5. 与 tenant-api 测试风格保持一致
