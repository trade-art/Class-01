# Requirements Document: SaaS Middleware Integration

## Introduction

本功能实现SaaS多租户平台与MT5中间件的完整集成，使租户能够配置、管理和使用其MT5/MT4交易服务器。这是将已完成的各个独立模块（tenant-api、MT5中间件、前端控制台）连接成一个完整可用系统的关键环节。

### 背景

当前状态：
- tenant-api 已实现 `MT5Adapter`、`TradingService` 等接口层代码
- MT5中间件（C++）已实现相应的REST API端点
- 前端控制台（tenant-console）已实现UI组件

缺失环节：
- 租户MT服务器配置的完整CRUD流程
- API请求/响应格式的契约验证
- 认证令牌在系统间的传递
- 端到端集成测试

## Alignment with Product Vision

本功能支持SaaS平台的核心目标：为券商提供开箱即用的MT5/MT4交易管理平台。通过完成中间件集成，租户将能够：
- 自主配置和管理多个MT服务器
- 通过统一界面监控交易账户和持仓
- 实时获取市场行情数据

## Requirements

### Requirement 1: MT服务器配置管理

**User Story:** 作为租户管理员，我想要添加和管理我的MT5/MT4服务器配置，以便平台能够连接到我的交易服务器。

#### Acceptance Criteria

1. WHEN 租户管理员提交MT服务器配置（服务器地址、管理员登录名、密码、中间件URL） THEN 系统 SHALL 加密存储凭证并创建服务器配置记录
2. WHEN 租户管理员点击"测试连接"按钮 THEN 系统 SHALL 通过中间件验证服务器连通性并返回连接状态
3. WHEN 租户管理员编辑服务器配置 THEN 系统 SHALL 更新配置并重新验证连接
4. WHEN 租户管理员删除服务器配置 THEN 系统 SHALL 清理相关适配器缓存并删除配置记录
5. IF 租户有多个服务器配置 THEN 系统 SHALL 允许设置默认服务器
6. WHEN 配置包含无效凭证 THEN 系统 SHALL 拒绝保存并显示明确的错误信息

### Requirement 2: 中间件认证流程

**User Story:** 作为系统开发者，我需要确保SaaS平台与MT5中间件之间的认证流程正确工作，以便安全地访问交易数据。

#### Acceptance Criteria

1. WHEN 用户首次访问交易功能 THEN 系统 SHALL 自动使用服务器配置的管理员凭证向中间件认证
2. WHEN 中间件返回JWT令牌 THEN 系统 SHALL 缓存令牌并在后续请求中使用
3. WHEN JWT令牌即将过期（5分钟内） THEN 系统 SHALL 自动刷新令牌
4. WHEN 认证失败 THEN 系统 SHALL 记录错误并通过熔断器保护系统
5. IF 中间件不可用 THEN 系统 SHALL 返回优雅降级响应并标记服务状态

### Requirement 3: API契约对齐

**User Story:** 作为系统开发者，我需要确保tenant-api与MT5中间件之间的API契约完全对齐，以避免数据格式不匹配导致的错误。

#### Acceptance Criteria

1. WHEN tenant-api发送认证请求 THEN 请求格式 SHALL 匹配中间件期望的 `{login, password}` 格式
2. WHEN 中间件返回用户列表 THEN tenant-api SHALL 正确转换 `margin_free` → `marginFree` 等字段映射
3. WHEN 中间件返回错误响应 THEN tenant-api SHALL 正确解析错误码并转换为前端友好的错误信息
4. WHEN 请求分页数据 THEN 分页参数（page, limit/pageSize） SHALL 正确传递和转换
5. IF API版本升级 THEN 系统 SHALL 保持向后兼容性

### Requirement 4: 交易数据获取

**User Story:** 作为租户管理员，我想要查看我MT服务器上的交易账户、持仓和订单信息，以便监控交易活动。

#### Acceptance Criteria

1. WHEN 租户管理员请求用户列表 THEN 系统 SHALL 从配置的MT服务器获取并返回用户数据
2. WHEN 租户管理员查看特定用户 THEN 系统 SHALL 显示用户详情、持仓、订单和成交记录
3. WHEN 租户管理员请求实时行情 THEN 系统 SHALL 从中间件获取并返回最新报价
4. WHEN 数据请求超时 THEN 系统 SHALL 在配置的超时时间后返回错误响应
5. IF 用户属于不同的MT服务器 THEN 系统 SHALL 根据请求路由到正确的适配器

### Requirement 5: 前端集成

**User Story:** 作为租户管理员，我想要通过控制台界面管理MT服务器并查看交易数据，以便直观地操作系统。

#### Acceptance Criteria

1. WHEN 租户管理员访问"服务器管理"页面 THEN 系统 SHALL 显示已配置的MT服务器列表
2. WHEN 租户管理员填写服务器配置表单 THEN 前端 SHALL 验证必填字段并显示验证错误
3. WHEN 后端返回API错误 THEN 前端 SHALL 显示用户友好的错误提示
4. WHEN 数据加载中 THEN 前端 SHALL 显示加载状态指示器
5. IF 连接测试成功 THEN 前端 SHALL 显示成功状态并更新服务器状态指示器

### Requirement 6: 端到端集成测试

**User Story:** 作为QA工程师，我需要完整的集成测试套件来验证SaaS平台与MT5中间件的集成正确性。

#### Acceptance Criteria

1. WHEN 运行集成测试 THEN 测试 SHALL 覆盖完整的服务器配置→认证→数据获取流程
2. WHEN MT5中间件不可用 THEN 测试 SHALL 使用Mock服务器完成测试
3. WHEN 测试完成 THEN 测试报告 SHALL 显示各API端点的测试覆盖率
4. IF 真实MT5服务器可用 THEN 测试 SHALL 支持可选的真实服务器测试模式
5. WHEN 检测到API契约变更 THEN 测试 SHALL 失败并明确指出不匹配的字段

## Non-Functional Requirements

### Code Architecture and Modularity
- **Single Responsibility Principle**: MT服务器配置管理与交易数据获取分离
- **Modular Design**: 适配器模式支持MT5/MT4多平台扩展
- **Dependency Management**: 使用依赖注入管理中间件连接
- **Clear Interfaces**: 定义清晰的DTO类型用于API契约

### Performance
- 中间件认证响应时间 < 2秒
- 用户列表查询响应时间 < 3秒（1000用户以内）
- 实时行情更新延迟 < 500ms
- 适配器连接池支持并发请求

### Security
- 服务器凭证使用AES-256加密存储
- 中间件通信支持HTTPS
- JWT令牌安全存储，不暴露给前端
- API请求包含租户隔离验证

### Reliability
- 中间件连接失败时自动重试（最多3次）
- 熔断器保护：连续5次失败后熔断30秒
- 优雅降级：中间件不可用时返回缓存数据或错误提示
- 适配器自动清理：空闲30分钟后释放连接

### Usability
- 服务器配置表单提供输入提示和格式验证
- 连接测试提供实时反馈
- 错误信息清晰说明问题原因和解决建议
- 支持批量导入服务器配置
