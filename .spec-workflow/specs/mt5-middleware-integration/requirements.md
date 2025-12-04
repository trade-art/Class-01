# Requirements Document: MT5 Middleware Integration

## Introduction

本规范定义了 MT5 SaaS 平台 (mt5-platform) 与 MT5 中间件服务 (MT5-middleware) 的集成需求。目标是实现平台与中间件的完整对接，使租户能够通过平台界面访问真实的 MT5 交易数据，包括账户信息、持仓、报价、交易历史等。

**项目背景**：
- **mt5-platform**: NestJS + Vue3 多租户 SaaS 平台，提供租户管理、实例管理、交易监控等功能
- **MT5-middleware**: C++ Drogon 高性能中间件，连接 MT5 Manager API，提供 RESTful API 和 WebSocket 实时推送

## Alignment with Product Vision

此集成是平台核心功能的关键环节，使平台从"管理壳"升级为"真实交易平台"：
- 实现租户控制台的真实数据展示
- 支持多租户多实例的 MT5 服务器管理
- 提供实时行情和交易数据推送

---

## Requirements

### REQ-1: 中间件实例配置管理

**User Story:** 作为平台管理员，我希望能够配置和管理中间件实例，以便租户能够连接到 MT5 服务器。

#### Acceptance Criteria

1. WHEN 管理员在平台创建中间件实例 THEN 系统 SHALL 存储实例配置（host, port, apiKey, useTls）
2. WHEN 管理员配置 MT5 服务器信息 THEN 系统 SHALL 支持配置多个 MT5 服务器（address, managerLogin, managerPassword）
3. WHEN 实例配置完成 THEN 系统 SHALL 能够测试与中间件的连接状态
4. IF 中间件连接失败 THEN 系统 SHALL 显示具体错误信息并记录日志

---

### REQ-2: 健康检查与状态监控

**User Story:** 作为平台管理员，我希望实时监控中间件实例的健康状态，以便及时发现和处理问题。

#### Acceptance Criteria

1. WHEN 系统执行健康检查 THEN 系统 SHALL 调用中间件 `/health/detailed` 端点获取详细状态
2. WHEN 健康检查返回结果 THEN 系统 SHALL 解析并存储组件状态（mt5、redis、database）
3. IF 健康检查连续失败 N 次 THEN 系统 SHALL 更新实例状态为 OFFLINE 并触发告警
4. WHEN 中间件状态变化 THEN 系统 SHALL 通过 Webhook 接收通知并更新状态

---

### REQ-3: API 响应格式适配

**User Story:** 作为开发者，我希望平台能够正确解析中间件的响应格式，以便前端能够正常展示数据。

#### Acceptance Criteria

1. WHEN 调用中间件 API THEN 系统 SHALL 将响应格式从 `{ code, message, data, timestamp }` 转换为 `{ success, data }`
2. WHEN 中间件返回错误 THEN 系统 SHALL 将 `code` 映射为对应的 HTTP 状态码和错误消息
3. IF 中间件响应超时 THEN 系统 SHALL 返回 503 Service Unavailable 并触发熔断器

---

### REQ-4: 认证与会话管理

**User Story:** 作为租户管理员，我希望系统能够安全地与中间件进行认证，以便访问 MT5 数据。

#### Acceptance Criteria

1. WHEN 租户登录平台 THEN 系统 SHALL 使用配置的凭证向中间件发起认证请求
2. WHEN 中间件返回 JWT Token THEN 系统 SHALL 缓存 Token 并关联到租户会话
3. IF Token 过期 THEN 系统 SHALL 自动刷新或重新认证
4. WHEN 租户登出 THEN 系统 SHALL 清理关联的中间件会话

---

### REQ-5: 账户数据集成

**User Story:** 作为租户管理员，我希望在控制台查看真实的 MT5 账户信息，包括余额、净值、保证金等。

#### Acceptance Criteria

1. WHEN 请求账户信息 THEN 系统 SHALL 调用中间件 `/api/v1/account/info` 并返回账户详情
2. WHEN 请求账户余额 THEN 系统 SHALL 返回 balance, equity, margin, margin_free, margin_level
3. WHEN 数据更新 THEN 系统 SHALL 支持通过 WebSocket 实时推送账户变化

---

### REQ-6: 持仓数据集成

**User Story:** 作为租户管理员，我希望实时查看所有持仓信息，以便监控交易风险。

#### Acceptance Criteria

1. WHEN 请求持仓列表 THEN 系统 SHALL 调用中间件 `/api/v1/trading/positions` 并返回所有持仓
2. WHEN 请求单个持仓 THEN 系统 SHALL 通过 ticket 查询具体持仓详情
3. WHEN 持仓状态变化（开仓/平仓/修改）THEN 系统 SHALL 通过 WebSocket 推送更新
4. WHEN 展示持仓 THEN 系统 SHALL 显示 symbol, action, volume, price_open, price_current, profit, sl, tp

---

### REQ-7: 行情数据集成

**User Story:** 作为租户管理员，我希望查看实时行情报价，以便了解市场动态。

#### Acceptance Criteria

1. WHEN 请求品种列表 THEN 系统 SHALL 调用中间件 `/api/v1/market/symbols` 返回可交易品种
2. WHEN 请求报价数据 THEN 系统 SHALL 返回 bid, ask, time 等报价信息
3. WHEN 订阅实时行情 THEN 系统 SHALL 通过 WebSocket 接收 tick 数据推送
4. WHEN 请求 K 线数据 THEN 系统 SHALL 支持 M1/M5/M15/M30/H1 等多个时间周期

---

### REQ-8: 交易历史集成

**User Story:** 作为租户管理员，我希望查询历史交易记录，以便进行交易分析和报表生成。

#### Acceptance Criteria

1. WHEN 请求交易历史 THEN 系统 SHALL 支持按时间范围、品种、账户筛选
2. WHEN 返回历史记录 THEN 系统 SHALL 包含 ticket, symbol, action, volume, price, profit, commission, time
3. WHEN 导出历史数据 THEN 系统 SHALL 支持 CSV/Excel 格式导出

---

### REQ-9: WebSocket 实时推送

**User Story:** 作为租户管理员，我希望接收实时数据推送，以便无需刷新页面即可获取最新信息。

#### Acceptance Criteria

1. WHEN 前端建立 WebSocket 连接 THEN 系统 SHALL 验证用户身份并建立会话
2. WHEN 订阅行情频道 THEN 系统 SHALL 转发中间件的 tick/candle 数据
3. WHEN 订阅交易频道 THEN 系统 SHALL 转发 position/order/account 变化事件
4. IF WebSocket 连接断开 THEN 系统 SHALL 支持自动重连机制

---

### REQ-10: Webhook 事件处理

**User Story:** 作为系统，我希望接收中间件的状态变化通知，以便实时更新系统状态。

#### Acceptance Criteria

1. WHEN 中间件发送 Webhook 事件 THEN 系统 SHALL 验证签名后处理事件
2. WHEN 收到 `mt5.connected` 事件 THEN 系统 SHALL 更新实例状态为 ONLINE
3. WHEN 收到 `mt5.disconnected` 事件 THEN 系统 SHALL 更新实例状态为 OFFLINE 并触发告警
4. WHEN 收到 `circuit_breaker` 事件 THEN 系统 SHALL 更新熔断器状态

---

## Non-Functional Requirements

### Code Architecture and Modularity
- **Single Responsibility Principle**: 每个服务类只负责单一功能（代理、认证、缓存等）
- **Modular Design**: 中间件集成作为独立模块，不影响现有功能
- **Dependency Management**: 通过接口抽象减少与中间件的直接耦合
- **Clear Interfaces**: 定义清晰的 DTO 和响应格式

### Performance
- API 响应时间：P95 < 500ms（不含网络延迟）
- WebSocket 推送延迟：< 100ms
- 健康检查频率：每 60 秒一次
- 缓存 TTL：报价 1-5 秒，账户信息 5 秒，品种信息 24 小时

### Security
- 所有中间件通信支持 TLS/HTTPS
- API Key 加密存储（AES-256）
- Webhook 签名验证（HMAC-SHA256）
- JWT Token 安全传递和刷新

### Reliability
- 熔断器保护：连续 5 次失败触发熔断
- 自动重试：最多 3 次，指数退避
- 降级策略：中间件不可用时返回缓存数据或友好错误
- 连接池管理：防止连接泄漏

### Usability
- 配置界面友好，支持连接测试
- 错误信息清晰，便于排查问题
- 状态展示直观，一目了然

---

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            数据流向                                       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [租户控制台]                                                             │
│       │                                                                  │
│       ├─── HTTP Request ───> [tenant-api]                                │
│       │                          │                                       │
│       │                          ├─── Proxy ───> [MT5-middleware]        │
│       │                          │                      │                │
│       │                          │                      ├───> [MT5 Server]
│       │                          │                      │                │
│       │                          │<── Response ─────────┘                │
│       │                          │                                       │
│       │<── Response ─────────────┘                                       │
│       │                                                                  │
│       └─── WebSocket ───> [tenant-api WS Gateway]                        │
│                               │                                          │
│                               └─── Forward ───> [MT5-middleware WS]      │
│                                                                          │
│  [管理平台]                                                               │
│       │                                                                  │
│       └─── HTTP ───> [platform-service]                                  │
│                          │                                               │
│                          ├─── Health Check ───> [MT5-middleware]         │
│                          │                                               │
│                          └─── Webhook Handler <─── [MT5-middleware]      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## API Mapping Reference

| 平台端点 | 中间件端点 | 说明 |
|---------|-----------|------|
| `/tenant/dashboard/account` | `/api/v1/account/info` | 账户信息 |
| `/tenant/positions` | `/api/v1/trading/positions` | 持仓列表 |
| `/tenant/quotes` | `/api/v1/market/quotes/{symbol}` | 报价数据 |
| `/tenant/quotes/symbols` | `/api/v1/market/symbols` | 品种列表 |
| `/tenant/history` | `/api/v1/trading/orders` | 交易历史 |
| `/health` (实例) | `/health/detailed` | 健康检查 |

---

## Out of Scope

以下功能不在本次集成范围内：
- 交易下单功能（开仓、平仓、修改订单）
- 多 MT5 服务器切换
- API Key 轮换机制
- 性能监控仪表盘
