# Tasks Document: WebSocket Ticket Authentication

## Part A: tenant-api 实现

- [x] 1. 创建 WS Ticket DTO 定义
  - File: `src/ws-ticket/dto/ws-ticket.dto.ts`
  - 定义 WsTicketResponseDto 类，包含 ticket, endpoint, expiresIn, channels 字段
  - 使用 class-validator 装饰器和 @ApiProperty Swagger 文档
  - Purpose: 建立 WS Ticket API 的类型安全和文档规范
  - _Leverage: `src/api-keys/dto/index.ts`, `src/middleware-proxy/dto/middleware-proxy.dto.ts`_
  - _Requirements: REQ-TA-1_

- [x] 2. 创建 WsTicketService 服务
  - File: `src/ws-ticket/ws-ticket.service.ts`
  - 实现 generateTicket() 方法：生成 32 字节随机数转 64 字符 hex
  - 实现 calculateChannels() 方法：根据 scopes 计算可用频道
  - 使用 CacheService 存储 Ticket 到 Redis，设置 30 秒 TTL
  - Redis Key 格式: `ws:ticket:{ticketId}`
  - Purpose: 核心业务逻辑，处理 Ticket 生成和存储
  - _Leverage: `src/common/services/cache.service.ts`, `src/middleware-proxy/services/middleware-auth.service.ts`_
  - _Requirements: REQ-TA-2, REQ-TA-4_

- [x] 3. 创建 WsTicketController 控制器
  - File: `src/ws-ticket/ws-ticket.controller.ts`
  - 创建 `POST /external/trading/ws-ticket` 端点
  - 使用 ApiKeyAuthGuard 保护端点
  - 从 RequestContext 提取 tenantId, managerId, apiKeyId, serverId, scopes
  - Purpose: 提供 HTTP API 端点供第三方应用调用
  - _Leverage: `src/auth/guards/api-key-auth.guard.ts`, `src/auth/decorators/current-context.decorator.ts`_
  - _Requirements: REQ-TA-1_

- [x] 4. 创建 WsTicketModule 模块
  - File: `src/ws-ticket/ws-ticket.module.ts`
  - 导入 CommonModule (CacheService), ConfigModule
  - 注册 WsTicketService, WsTicketController
  - Purpose: 模块化组织，方便依赖注入
  - _Leverage: `src/api-keys/api-keys.module.ts`_
  - _Requirements: REQ-TA-2_

- [x] 5. 添加环境变量配置
  - File: `src/config/configuration.ts` (修改)
  - 添加 `MIDDLEWARE_WS_ENDPOINT` 环境变量读取
  - 默认值: `wss://localhost:8443`
  - File: `.env.example` (修改)
  - 添加 `MIDDLEWARE_WS_ENDPOINT` 配置说明
  - Purpose: 支持不同环境的 WebSocket 端点配置
  - _Leverage: 现有 configuration.ts 模式_
  - _Requirements: REQ-TA-3_

- [x] 6. 注册 WsTicketModule 到 AppModule
  - File: `src/app.module.ts` (修改)
  - 导入并注册 WsTicketModule
  - Purpose: 激活 WS Ticket 功能
  - _Leverage: 现有模块注册模式_
  - _Requirements: REQ-TA-1_

- [x] 7. 创建 WsTicketService 单元测试
  - File: `src/ws-ticket/ws-ticket.service.spec.ts`
  - 测试 generateTicket(): 验证 Ticket 格式 (64 hex 字符)
  - 测试 calculateChannels(): 验证 scopes → channels 映射
  - 测试 Redis 存储: Mock CacheService，验证存储参数和 TTL
  - 测试 Redis 失败: 验证返回 503 错误
  - Purpose: 确保核心逻辑正确性
  - _Leverage: `src/api-keys/api-keys.service.spec.ts`, `test/mocks/`_
  - _Requirements: REQ-TA-2, REQ-TA-4_

- [x] 8. 创建 WS Ticket 集成测试
  - File: `test/ws-ticket.e2e-spec.ts`
  - 测试完整流程: Access Token → WS Ticket
  - 测试 401 未认证场景
  - 测试 503 Redis 不可用场景
  - 验证响应格式符合 DTO 定义
  - Purpose: 验证端到端功能正确性
  - _Leverage: `test/auth.e2e-spec.ts`, `test/fixtures/test-data.ts`_
  - _Requirements: REQ-TA-1, REQ-TA-2_

---

## Part B: C++ 中间件实现

> 已完成: 2024-12 (在 E:\MT5_Project\MT5-middleware 中实现)

- [x] 9. 实现 TicketValidator 模块
  - File: `include/websocket/TicketValidator.hpp`, `src/websocket/TicketValidator.cpp`
  - 实现 Redis GET + DEL 原子性验证 (防止重放攻击)
  - 解析 JSON 格式的 TicketData (tenantId, managerId, apiKeyId, serverId, scopes, channels)
  - 返回 TicketValidationResult 验证结果和上下文信息
  - 静态方法 isValidTicketFormat() 验证 64 字符 hex 格式
  - Purpose: 安全验证 Ticket，防止重放攻击
  - _Requirements: REQ-MW-2_

- [x] 10. 实现 ExternalWebSocket 控制器
  - File: `include/controllers/ExternalWebSocket.h`, `src/controllers/ExternalWebSocket.cpp`
  - 使用 Drogon 框架 WebSocketController
  - 端点: `/ws/external?ticket=xxx`
  - 调用 TicketValidator 验证 Ticket
  - 管理连接生命周期 (Ping/Pong, 心跳超时 120s)
  - 连接限制: 全局 2000 连接, 单 IP 20 连接
  - 支持 subscribe/unsubscribe/ping 消息
  - Purpose: WebSocket 连接管理和消息路由
  - _Requirements: REQ-MW-1, REQ-MW-5_

- [x] 11. 实现 ChannelManager 模块
  - File: `include/websocket/ChannelManager.hpp`, `src/websocket/ChannelManager.cpp`
  - 单例模式管理全局频道订阅
  - 处理 subscribe/unsubscribe 消息
  - 验证频道权限 (基于 ConnectionContext.channels)
  - 实现 publish 方法推送数据 (支持 string 和 Json::Value)
  - 确保租户隔离 (按 tenantId + serverId 过滤)
  - 支持频道: quotes, positions, orders
  - Purpose: 频道订阅和消息分发
  - _Requirements: REQ-MW-3, REQ-MW-4, REQ-MW-6_

- [x] 12. 实现 ConnectionContext 结构
  - File: `include/websocket/ConnectionContext.hpp`
  - 定义 ConnectionContext 结构体
  - 存储 tenantId, managerId, apiKeyId, serverId, scopes, channels
  - 跟踪 subscribedChannels 当前订阅的频道
  - 跟踪 lastActivity, lastPing 用于超时检测
  - 提供 canSubscribe(), subscribe(), unsubscribe(), hasScope() 方法
  - Purpose: 连接状态管理
  - _Requirements: REQ-MW-5, REQ-MW-6_

- [x] 13. C++ 中间件集成测试
  - File: `tests/test_ticket_validator.cpp` (C++ GTest)
    - 测试 Ticket 格式验证
    - 测试 Ticket 解析和上下文创建
    - 测试频道权限验证
    - 测试 ChannelManager 统计
  - File: `tests/test_external_websocket.py` (Python pytest)
    - 测试无 Ticket 连接拒绝
    - 测试无效 Ticket 错误响应
    - 测试有效 Ticket 连接成功
    - 测试频道订阅和取消订阅
    - 测试心跳 Ping/Pong
    - 测试 Ticket 单次使用 (防止重放)
  - Purpose: 验证中间件功能完整性
  - _Requirements: REQ-MW-1 ~ REQ-MW-6_

---

## 任务依赖关系

```
Part A (tenant-api):
1 (DTO) ──┬──> 2 (Service) ──┬──> 3 (Controller) ──> 4 (Module) ──> 6 (AppModule)
          │                  │
          └──> 5 (Config) ───┘
                              ├──> 7 (Unit Tests)
                              └──> 8 (E2E Tests)

Part B (C++ 中间件):
9 (TicketValidator) ──┬──> 10 (WebSocketServer)
                      │
12 (ConnectionContext) ──> 11 (ChannelManager) ──> 13 (Integration Tests)
```

## 实现优先级

**Phase 1 - 核心功能** (Part A: 1-6)
- 完成 tenant-api 的 WS Ticket 签发功能
- 可独立测试和部署

**Phase 2 - 测试覆盖** (Part A: 7-8)
- 添加单元测试和集成测试
- 确保代码质量

**Phase 3 - 中间件对接** (Part B: 9-13)
- 与 C++ 中间件团队协调
- 完成 WebSocket 验证和推送功能
