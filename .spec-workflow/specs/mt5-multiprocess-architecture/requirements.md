# Requirements Document: MT5 多进程架构

## Introduction

本功能旨在解决 MT5 Manager API DLL 的 `Release()` 方法阻塞问题。当前架构中，`Release()` 可能无限期阻塞，且 DLL 内部存在全局锁，导致阻塞时所有 `CreateManager()` 调用也被阻塞，严重影响系统可用性。

通过多进程架构，将每个 MT5 连接隔离到独立的 Worker 子进程中。当需要释放连接时，直接终止 Worker 进程，由操作系统自动清理 DLL 资源，从根本上解决阻塞问题。

## Background

### 当前问题

1. **Release() 阻塞**：MT5 DLL 的 `Release()` 方法可能无限期阻塞
2. **全局锁**：MT5 DLL 内部有全局锁，`Release()` 阻塞时会阻止所有 `CreateManager()` 调用
3. **业务影响**：禁用经理账号后重新启用时，新连接无法建立，导致租户后台数据为空

### 解决方案原理

- 每个 MT5 连接运行在独立的 Worker 子进程中
- 主进程通过 IPC（Named Pipe）与 Worker 通信
- 需要释放连接时，直接杀掉 Worker 进程
- 操作系统自动清理进程资源（包括 DLL 句柄）
- 新连接在新的 Worker 进程中创建，不受旧进程影响

## Requirements

### REQ-1: Worker 进程生命周期管理

**User Story:** 作为系统运维人员，我希望 Worker 进程能够被可靠地创建、监控和终止，以确保系统稳定运行。

#### Acceptance Criteria

1. WHEN 需要建立 MT5 连接 THEN 系统 SHALL 创建一个新的 Worker 子进程
2. WHEN Worker 进程崩溃 THEN 系统 SHALL 自动检测并清理资源
3. WHEN 需要释放连接 THEN 系统 SHALL 能在 5 秒内终止 Worker 进程
4. IF Worker 进程无响应超过 30 秒 THEN 系统 SHALL 强制终止该进程
5. WHEN 主进程关闭 THEN 系统 SHALL 终止所有 Worker 进程

### REQ-2: IPC 通信机制

**User Story:** 作为开发人员，我希望主进程和 Worker 进程之间有可靠的通信机制，以执行 MT5 操作。

#### Acceptance Criteria

1. WHEN 主进程发送请求 THEN Worker 进程 SHALL 在 100ms 内响应（不含 MT5 操作时间）
2. IF IPC 连接断开 THEN 系统 SHALL 自动检测并标记 Worker 为失效
3. WHEN 执行 MT5 操作 THEN 系统 SHALL 支持同步和异步两种调用模式
4. IF 请求超时 THEN 系统 SHALL 返回超时错误，不阻塞主进程
5. WHEN 传输数据 THEN 系统 SHALL 使用 JSON 格式序列化请求和响应

### REQ-3: MT5 操作代理

**User Story:** 作为业务系统，我希望通过 Worker 进程执行所有 MT5 操作，与当前 API 保持兼容。

#### Acceptance Criteria

1. WHEN 调用 connect() THEN Worker 进程 SHALL 建立到 MT5 服务器的连接
2. WHEN 调用 disconnect() THEN Worker 进程 SHALL 断开 MT5 连接
3. WHEN 调用交易操作 THEN Worker 进程 SHALL 执行并返回结果
4. WHEN 调用查询操作 THEN Worker 进程 SHALL 执行并返回数据
5. IF MT5 操作失败 THEN Worker 进程 SHALL 返回详细错误信息

### REQ-4: 连接池集成

**User Story:** 作为系统架构师，我希望现有的 ManagerConnectionPool 能无缝切换到多进程架构，最小化代码改动。

#### Acceptance Criteria

1. WHEN 使用 ManagerConnectionPool THEN 上层代码 SHALL 无需修改
2. WHEN 添加连接 THEN 系统 SHALL 创建对应的 Worker 进程
3. WHEN 移除连接 THEN 系统 SHALL 终止对应的 Worker 进程
4. WHEN 获取连接 THEN 系统 SHALL 返回 IPC 代理对象
5. IF Worker 进程失效 THEN 健康检查 SHALL 检测并尝试恢复

### REQ-5: 错误处理与容错

**User Story:** 作为系统运维人员，我希望系统能优雅地处理各种异常情况，确保高可用性。

#### Acceptance Criteria

1. WHEN Worker 进程崩溃 THEN 系统 SHALL 自动重新创建 Worker
2. WHEN IPC 通信超时 THEN 系统 SHALL 支持重试机制
3. WHEN 多个操作并发失败 THEN 系统 SHALL 使用熔断器保护
4. IF 无法创建新 Worker THEN 系统 SHALL 记录错误并通知管理员
5. WHEN 发生异常 THEN 系统 SHALL 记录详细日志便于排查

## Non-Functional Requirements

### Code Architecture and Modularity

- **Single Responsibility Principle**: Worker 进程只负责 MT5 操作，IPC 层只负责通信
- **Modular Design**: Worker 管理器、IPC 层、代理对象各自独立
- **Dependency Management**: 新组件与现有代码松耦合
- **Clear Interfaces**: 定义清晰的 IPC 协议和接口

### Performance

- Worker 进程启动时间 < 2 秒
- IPC 通信延迟 < 10ms（不含 MT5 操作时间）
- 支持至少 100 个并发 Worker 进程
- 主进程内存增长 < 10MB（每 10 个 Worker）

### Security

- IPC 通信使用进程级别隔离，不暴露网络端口
- Worker 进程继承主进程的权限，不需要额外权限
- 敏感数据（密码）在 IPC 传输时加密

### Reliability

- Worker 进程崩溃不影响主进程
- 单个 Worker 失败不影响其他 Worker
- 系统可用性目标：99.9%

### Maintainability

- 完整的日志记录，便于问题排查
- Worker 进程可独立调试
- 支持运行时监控 Worker 状态
