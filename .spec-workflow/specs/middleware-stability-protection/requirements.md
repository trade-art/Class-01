# Requirements Document: MT5 Middleware Stability Protection

## Introduction

本规范定义了 MT5 中间件稳定性保护机制的需求。核心目标是确保中间件在面对任何形式的外部调用（包括并发请求、异常请求、恶意攻击）时都能保持稳定运行，不会崩溃退出。

### 背景

MT5 SDK 的 `IMTManagerAPI` **不是线程安全的**。当多个线程同时调用同一个 Manager API 实例时，会导致：
- Segmentation Fault（段错误）
- 中间件进程异常退出
- 数据竞争和不一致

当前的前端修复（将 `Promise.all` 改为顺序调用）只是临时方案。真正的解决方案需要在中间件内部实现防护机制，确保即使外部同时发送多个并行请求，中间件也能正确处理。

## Alignment with Product Vision

该功能支持 MT5 多租户 SaaS 平台的核心目标：
- **高可用性**：确保中间件 7x24 小时稳定运行
- **多租户支持**：多个租户可以同时访问，互不干扰
- **企业级可靠性**：满足金融行业对系统稳定性的严格要求

## Requirements

### Requirement 1: 请求序列化保护

**User Story:** 作为平台运维人员，我希望中间件能够自动序列化 MT5 API 调用，这样即使外部发送并行请求也不会导致崩溃。

#### Acceptance Criteria

1. WHEN 多个 HTTP 请求同时到达中间件 THEN 系统 SHALL 将对同一 MT5 连接的 API 调用序列化执行
2. WHEN 请求正在等待执行时 THEN 系统 SHALL 在合理时间内（< 30秒）完成队列中的请求或返回超时错误
3. WHEN MT5 API 调用正在执行时 THEN 系统 SHALL 阻塞后续对同一连接的调用直到当前调用完成
4. IF 请求队列长度超过阈值（默认 100）THEN 系统 SHALL 拒绝新请求并返回 503 Service Unavailable

### Requirement 2: 请求队列管理

**User Story:** 作为系统管理员，我希望能够监控和管理请求队列，这样我可以了解系统负载并及时发现问题。

#### Acceptance Criteria

1. WHEN 请求进入队列时 THEN 系统 SHALL 记录队列长度、等待时间等指标
2. WHEN 队列长度超过警告阈值（默认 50）THEN 系统 SHALL 输出警告日志
3. WHEN 请求等待超时时 THEN 系统 SHALL 返回 408 Request Timeout 错误并记录详细日志
4. IF 管理员请求队列状态 THEN 系统 SHALL 返回当前队列深度、平均等待时间、处理中的请求数

### Requirement 3: 连接池扩展

**User Story:** 作为平台架构师，我希望能够配置每个服务器的连接池大小，这样可以根据业务需求调整并发处理能力。

#### Acceptance Criteria

1. WHEN 中间件启动时 THEN 系统 SHALL 根据配置创建指定数量的 MT5 Manager 连接（默认 3 个）
2. WHEN 请求到达时 THEN 系统 SHALL 从连接池中获取空闲连接，如果没有空闲连接则等待
3. WHEN 连接使用完毕时 THEN 系统 SHALL 将连接归还到连接池
4. IF 连接失效 THEN 系统 SHALL 自动重新建立连接并记录事件

### Requirement 4: 优雅降级

**User Story:** 作为终端用户，我希望在系统高负载时仍能获得响应，即使响应可能会延迟或降级。

#### Acceptance Criteria

1. WHEN 系统负载过高时 THEN 系统 SHALL 优先处理交易类请求（executeTrade、closePosition）
2. WHEN 查询类请求超时时 THEN 系统 SHALL 返回缓存数据（如果可用）并标记为 stale
3. WHEN 所有连接都繁忙超过 5 秒时 THEN 系统 SHALL 返回 503 错误而不是无限等待
4. IF 连续 3 次请求失败 THEN 系统 SHALL 触发断路器，暂停对该服务器的请求 30 秒

### Requirement 5: 错误恢复

**User Story:** 作为平台运维人员，我希望中间件能够从错误中自动恢复，这样不需要人工干预。

#### Acceptance Criteria

1. WHEN MT5 API 调用返回错误时 THEN 系统 SHALL 记录详细错误信息并返回适当的 HTTP 错误码
2. WHEN 检测到连接断开时 THEN 系统 SHALL 自动尝试重连（最多 3 次，间隔递增）
3. WHEN 捕获到未预期的异常时 THEN 系统 SHALL 记录堆栈信息但不崩溃，返回 500 错误
4. IF 重连失败超过 3 次 THEN 系统 SHALL 将该连接标记为不可用并通知运维

## Non-Functional Requirements

### Code Architecture and Modularity

- **Single Responsibility Principle**:
  - `RequestQueue` 类专门负责请求排队和调度
  - `ConnectionPool` 类专门负责连接池管理
  - `CircuitBreaker` 类专门负责熔断器逻辑

- **Modular Design**:
  - 稳定性保护机制应作为独立模块实现，不影响现有业务逻辑
  - 使用装饰器模式包装现有的 MT5Manager 调用

- **Dependency Management**:
  - 新增模块只依赖标准库（std::mutex, std::condition_variable, std::queue）
  - 不引入新的第三方依赖

- **Clear Interfaces**:
  - 保持现有的 Controller 接口不变
  - 内部通过 `SafeMT5Manager` 代理类提供线程安全访问

### Performance

- **请求延迟**：队列等待时间 P95 < 500ms（正常负载下）
- **吞吐量**：单连接支持 100 TPS 的查询请求
- **内存消耗**：每个连接池实例额外内存 < 10MB
- **CPU 开销**：锁竞争导致的 CPU 开销 < 5%

### Security

- **拒绝服务防护**：队列满时立即拒绝新请求，防止内存耗尽
- **超时保护**：所有操作都有超时限制，防止死锁
- **资源隔离**：不同租户的请求使用独立的队列

### Reliability

- **可用性目标**：99.9%（每月停机时间 < 43 分钟）
- **故障恢复时间**：自动恢复时间 < 30 秒
- **数据一致性**：确保交易操作的原子性

### Usability

- **配置简单**：通过配置文件调整参数，无需重新编译
- **监控友好**：提供 Prometheus 格式的指标输出
- **日志清晰**：所有关键操作都有结构化日志

## Technical Constraints

1. **MT5 SDK 限制**：`IMTManagerAPI` 不是线程安全的，必须使用互斥锁保护
2. **Drogon 框架**：HTTP 请求由 Drogon 线程池处理，默认线程数 = CPU 核心数
3. **现有架构**：必须兼容现有的 `ManagerSessionPool` 和 `MT5Manager` 类
4. **编译环境**：C++17，支持 std::shared_mutex 和 std::optional

## Out of Scope

- 分布式请求队列（当前为单实例部署）
- 请求优先级的动态调整
- 自动扩缩容
- WebSocket 连接的特殊处理（当前已是独立线程）
