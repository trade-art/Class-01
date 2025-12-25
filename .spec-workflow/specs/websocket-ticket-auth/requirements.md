# Requirements Document: WebSocket Ticket Authentication

## Introduction

本功能实现 WebSocket 一次性 Ticket 认证机制，允许第三方应用通过直连 C++ 中间件的 WebSocket 通道接收实时数据推送（行情报价、持仓盈亏、订单状态），同时保持安全性和可控性。

### 背景

当前架构中，所有第三方应用请求都通过 tenant-api 代理转发到 C++ 中间件。这种方式对于 REST API 请求是合适的（安全可控、统一限流），但对于高频实时数据推送会带来额外延迟：

- 每条消息额外 2-5ms 延迟
- 100+ 条/秒的行情数据会造成显著性能开销
- tenant-api 需要维护大量 WebSocket 连接

### 解决方案

采用混合架构：
- **REST API**（交易/查询）：继续走 tenant-api 代理
- **WebSocket**（实时推送）：通过一次性 Ticket 直连 C++ 中间件

### 涉及组件

| 组件 | 职责 |
|------|------|
| **tenant-api** | 签发 WS Ticket、存储到 Redis |
| **C++ 中间件** | 验证 Ticket、建立 WebSocket 连接、推送实时数据 |
| **Redis** | 共享 Ticket 存储 |

## Alignment with Product Vision

本功能支持 MT5 SaaS 平台的核心目标：
1. **性能优化**：为第三方应用提供低延迟实时数据通道
2. **安全性**：通过 Ticket 机制确保连接安全，不暴露敏感凭证
3. **可扩展性**：减轻 tenant-api 负载，支持更多并发连接

---

## Part A: tenant-api 需求

### REQ-TA-1: WS Ticket 签发端点

**User Story:** 作为第三方应用开发者，我希望通过 Access Token 获取 WebSocket 连接凭证，以便建立实时数据连接。

#### Acceptance Criteria

1. WHEN 客户端使用有效 Access Token 请求 `POST /external/trading/ws-ticket` THEN tenant-api SHALL 返回一次性 Ticket 和 WebSocket 端点信息
2. WHEN Access Token 无效或过期 THEN tenant-api SHALL 返回 401 Unauthorized 错误
3. WHEN 请求成功 THEN tenant-api SHALL 返回包含以下字段的响应：
   - `ticket`: 一次性凭证字符串 (64 字符 hex)
   - `endpoint`: WebSocket 连接地址 (从配置读取)
   - `expiresIn`: Ticket 有效期（秒）
   - `channels`: 可订阅的频道列表 (基于 scopes 计算)

### REQ-TA-2: WsTicketService 服务

**User Story:** 作为开发者，我希望有独立的服务处理 Ticket 生成逻辑，以保持代码模块化。

#### Acceptance Criteria

1. WHEN 调用 generateTicket() THEN WsTicketService SHALL 生成 32 字节随机数并转为 hex 字符串
2. WHEN 生成 Ticket THEN WsTicketService SHALL 从 RequestContext 提取以下信息存入 Redis：
   - `tenantId`: 租户 ID
   - `managerId`: Manager ID
   - `apiKeyId`: API Key ID
   - `serverId`: MT 服务器 ID
   - `scopes`: 权限范围
   - `createdAt`: 创建时间戳
3. WHEN 存储 Ticket THEN WsTicketService SHALL 设置 30 秒 TTL
4. WHEN 计算可用频道 THEN WsTicketService SHALL 根据 scopes 确定：
   - `quotes` 频道需要 `quotes:read` 或 `*` scope
   - `positions` 频道需要 `positions:read` 或 `*` scope
   - `orders` 频道需要 `orders:read` 或 `*` scope

### REQ-TA-3: 配置管理

**User Story:** 作为运维工程师，我希望 WebSocket 端点地址可配置，以支持不同环境部署。

#### Acceptance Criteria

1. WHEN 读取 WebSocket 端点 THEN tenant-api SHALL 从环境变量 `MIDDLEWARE_WS_ENDPOINT` 获取
2. IF 环境变量未设置 THEN tenant-api SHALL 使用默认值 `wss://localhost:8443`
3. WHEN 配置变更 THEN tenant-api SHALL 无需重新构建即可生效

### REQ-TA-4: Redis Key 规范

**User Story:** 作为开发者，我希望 Redis Key 有统一规范，以便维护和调试。

#### Acceptance Criteria

1. WHEN 存储 Ticket THEN tenant-api SHALL 使用 Key 格式: `ws:ticket:{ticketId}`
2. WHEN 存储 Ticket THEN tenant-api SHALL 使用 JSON 格式存储上下文数据
3. IF Redis 连接失败 THEN tenant-api SHALL 返回 503 Service Unavailable

---

## Part B: C++ 中间件需求

### REQ-MW-1: WebSocket Server 端点

**User Story:** 作为第三方应用开发者，我希望通过 WebSocket 连接中间件，以接收实时数据。

#### Acceptance Criteria

1. WHEN 中间件启动 THEN 系统 SHALL 在配置端口启动 WSS (WebSocket Secure) 服务
2. WHEN 客户端连接 `wss://{host}:{port}?ticket={ticketId}` THEN 系统 SHALL 提取并验证 Ticket
3. IF 连接使用非 TLS THEN 系统 SHALL 拒绝连接

### REQ-MW-2: Ticket 验证

**User Story:** 作为安全工程师，我希望 Ticket 验证是原子操作，以防止重放攻击。

#### Acceptance Criteria

1. WHEN 验证 Ticket THEN 中间件 SHALL 使用 Redis Lua 脚本实现原子性 GET + DEL 操作
2. IF Ticket 不存在 THEN 中间件 SHALL 关闭连接并返回错误码 4002
3. IF Ticket 参数缺失 THEN 中间件 SHALL 关闭连接并返回错误码 4001
4. IF 同一 Ticket 被并发使用 THEN 中间件 SHALL 只允许第一个请求成功
5. WHEN Ticket 验证成功 THEN 中间件 SHALL 将上下文信息附加到 WebSocket 连接

### REQ-MW-3: 频道订阅管理

**User Story:** 作为第三方应用开发者，我希望订阅特定数据频道，只接收需要的数据。

#### Acceptance Criteria

1. WHEN 收到 `{"action": "subscribe", "channels": [...]}` THEN 中间件 SHALL 验证权限并激活订阅
2. IF 请求订阅未授权的频道 THEN 中间件 SHALL 返回权限错误消息
3. WHEN 订阅成功 THEN 中间件 SHALL 返回 `{"type": "subscribed", "channels": [...]}`
4. WHEN 收到 `{"action": "unsubscribe", "channels": [...]}` THEN 中间件 SHALL 停止推送对应频道

### REQ-MW-4: 实时数据推送

**User Story:** 作为第三方应用开发者，我希望接收实时行情、持仓和订单更新。

#### Acceptance Criteria

1. WHEN 订阅 `quotes` 频道 THEN 中间件 SHALL 推送实时行情：
   ```json
   {"type": "quote", "symbol": "EURUSD", "bid": 1.0850, "ask": 1.0852, "timestamp": 1703001234567}
   ```
2. WHEN 订阅 `positions` 频道 THEN 中间件 SHALL 推送持仓更新：
   ```json
   {"type": "position", "ticket": 12345, "symbol": "EURUSD", "profit": 150.00, "margin": 1000.00, "timestamp": 1703001234567}
   ```
3. WHEN 订阅 `orders` 频道 THEN 中间件 SHALL 推送订单状态：
   ```json
   {"type": "order", "ticket": 12346, "status": "filled", "filledVolume": 1.0, "timestamp": 1703001234567}
   ```

### REQ-MW-5: 连接生命周期管理

**User Story:** 作为系统管理员，我希望 WebSocket 连接有健康检查机制。

#### Acceptance Criteria

1. WHEN 连接空闲超过 30 秒 THEN 中间件 SHALL 发送 Ping 帧
2. IF 客户端 60 秒内未响应 Pong THEN 中间件 SHALL 关闭连接
3. WHEN 客户端主动断开 THEN 中间件 SHALL 清理连接资源和订阅
4. WHEN 连接异常断开 THEN 中间件 SHALL 记录日志并清理资源

### REQ-MW-6: 租户隔离

**User Story:** 作为安全工程师，我希望不同租户的数据完全隔离。

#### Acceptance Criteria

1. WHEN 推送数据 THEN 中间件 SHALL 只推送属于该连接 tenantId 的数据
2. IF 数据不属于当前连接的租户 THEN 中间件 SHALL 过滤该数据
3. WHEN 连接建立 THEN 中间件 SHALL 将 tenantId 绑定到连接上下文

---

## Non-Functional Requirements

### Code Architecture and Modularity

**tenant-api 侧**:
- `WsTicketService`: 负责 Ticket 生成和 Redis 存储
- `WsTicketController` 或扩展 `ExternalTradingController`: 提供 HTTP 端点
- `WsTicketDto`: 请求/响应数据结构

**C++ 中间件侧**:
- `WebSocketServer`: 连接管理和消息路由
- `TicketValidator`: Ticket 验证逻辑
- `ChannelManager`: 订阅管理和消息分发
- `ConnectionContext`: 连接上下文存储

### Performance

- **NFR-PERF-1**: tenant-api Ticket 签发响应时间 < 50ms
- **NFR-PERF-2**: 中间件 WebSocket 连接建立时间 < 100ms
- **NFR-PERF-3**: 消息推送延迟 < 10ms
- **NFR-PERF-4**: 单个中间件实例支持 10,000+ 并发 WebSocket 连接

### Security

- **NFR-SEC-1**: Ticket 使用 crypto.randomBytes(32) 生成
- **NFR-SEC-2**: Ticket 有效期不超过 30 秒
- **NFR-SEC-3**: Ticket 只能使用一次（原子性消费）
- **NFR-SEC-4**: WebSocket 必须使用 WSS (TLS 加密)
- **NFR-SEC-5**: 必须验证租户隔离

### Reliability

- **NFR-REL-1**: Redis 不可用时，返回 503 错误
- **NFR-REL-2**: 连接异常断开时自动清理资源
- **NFR-REL-3**: 记录所有连接建立和断开事件

---

## Data Structures

### tenant-api: WS Ticket Response

```typescript
// POST /external/trading/ws-ticket
// Headers: Authorization: Bearer <accessToken>

interface WsTicketResponseDto {
  ticket: string;           // 64 字符 hex
  endpoint: string;         // wss://ws.example.com:8443
  expiresIn: number;        // 30
  channels: string[];       // ['quotes', 'positions', 'orders']
}
```

### Redis: Ticket Data

```typescript
interface TicketData {
  tenantId: string;
  managerId: string;
  apiKeyId: string;
  serverId: string;
  scopes: string[];
  createdAt: number;        // Unix timestamp ms
}

// Key: ws:ticket:{ticketId}
// TTL: 30 seconds
// Value: JSON.stringify(TicketData)
```

### C++ 中间件: WebSocket Messages

```cpp
// Client → Server
struct ClientMessage {
    std::string action;     // "subscribe" | "unsubscribe" | "ping"
    std::vector<std::string> channels;
};

// Server → Client
struct ServerMessage {
    std::string type;       // "subscribed" | "quote" | "position" | "order" | "error" | "pong"
    nlohmann::json data;
    int64_t timestamp;
};
```

## Error Codes

| 错误码 | 来源 | 描述 |
|-------|------|------|
| 401 | tenant-api | Access Token 无效 |
| 503 | tenant-api | Redis 不可用 |
| 4001 | C++ 中间件 | Ticket 参数缺失 |
| 4002 | C++ 中间件 | Ticket 无效或已过期 |
| 4003 | C++ 中间件 | 无权订阅该频道 |
| 4004 | C++ 中间件 | 请求频率过高 |
| 4005 | C++ 中间件 | 服务器内部错误 |
