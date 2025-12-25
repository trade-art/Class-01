# Requirements Document - SaaS MVP Upgrade

## Introduction

本规格定义 MT5 SaaS 平台 MVP 升级的完整需求，包含两个核心阶段：
1. **Platform API 升级** - 完善总后台的租户管理、套餐配置、中间件分配功能
2. **shared-auth 共享包** - 抽取认证逻辑为共享包，供所有业务模块复用

> **注意**：Copy API 将在后续独立开发，不包含在本次升级范围内。

本需求基于以下架构决议文档：
- `docs/ARCHITECTURE.md` - 系统架构设计
- `docs/architecture-review-issues.md` - 24 个架构决议

## Alignment with Product Vision

本升级实现 MVP 核心功能，支撑 SaaS 多租户平台的商业化运营：
- 平台运营方可管理多个租户（券商/代理商）
- 每个租户可独立配置 MT5 服务器和用户
- 统一的认证逻辑支持后续业务模块扩展

---

## Phase 1: Platform API 升级

### REQ-1.1 平台管理员认证

**User Story:** 作为平台运营人员，我希望使用独立的管理员账号登录总后台，以便管理所有租户。

#### Acceptance Criteria

1. WHEN 管理员输入正确邮箱和密码 THEN 系统 SHALL 返回 JWT Token（Access Token 15分钟 + Refresh Token 7天）
2. WHEN Access Token 过期 THEN 系统 SHALL 支持使用 Refresh Token 获取新 Token
3. WHEN Refresh Token 使用后 THEN 系统 SHALL 轮换生成新的 Refresh Token（一次性使用）
4. IF 管理员角色为 super_admin THEN 系统 SHALL 授予所有管理权限
5. IF 管理员角色为 operator THEN 系统 SHALL 仅授予只读权限

### REQ-1.2 租户管理 (CRUD)

**User Story:** 作为平台管理员，我希望创建、编辑、禁用租户，以便管理平台上的所有客户。

#### Acceptance Criteria

1. WHEN 创建租户时 THEN 系统 SHALL 验证域名唯一性并生成租户 ID
2. WHEN 编辑租户信息 THEN 系统 SHALL 记录变更历史（审计日志）
3. WHEN 禁用租户 THEN 系统 SHALL 清除该租户的 Redis 缓存，使其无法登录
4. WHEN 删除租户 THEN 系统 SHALL 执行软删除（设置 deletedAt），保留数据
5. IF 租户域名已被使用 THEN 系统 SHALL 返回 409 Conflict 错误

### REQ-1.3 套餐配置

**User Story:** 作为平台管理员，我希望配置不同的套餐（Basic/Pro/Enterprise），以便控制租户可使用的功能和资源。

#### Acceptance Criteria

1. WHEN 创建套餐时 THEN 系统 SHALL 支持配置以下参数：
   - 模块权限（Tenant API / Copy API / CRM API）
   - MT5 服务器数量限制
   - 交易用户数量限制
   - API 调用频率限制
2. WHEN 为租户分配套餐 THEN 系统 SHALL 立即生效功能限制
3. WHEN 租户超出套餐限制 THEN 系统 SHALL 返回 403 Forbidden 并提示升级
4. IF 套餐变更 THEN 系统 SHALL 清除租户的套餐缓存（TTL 10分钟）

### REQ-1.4 中间件实例管理

**User Story:** 作为平台管理员，我希望管理多个 C++ 中间件实例，以便为不同租户分配计算资源。

#### Acceptance Criteria

1. WHEN 添加中间件实例时 THEN 系统 SHALL 验证连接可用性（健康检查）
2. WHEN 中间件实例不可用 THEN 系统 SHALL 标记状态为 offline 并发送告警
3. WHEN 查看中间件实例列表 THEN 系统 SHALL 显示实时状态和已分配租户
4. IF 中间件配置变更 THEN 系统 SHALL 清除相关缓存（TTL 5分钟）

### REQ-1.5 中间件分配

**User Story:** 作为平台管理员，我希望将中间件实例分配给租户，以便租户的业务模块可以连接 MT5 服务器。

#### Acceptance Criteria

1. WHEN 分配中间件给租户 THEN 系统 SHALL 验证中间件状态为 online
2. WHEN 分配成功 THEN 系统 SHALL 更新租户的中间件配置
3. WHEN 取消分配 THEN 系统 SHALL 验证租户无活跃连接后执行
4. IF 租户已有分配 THEN 系统 SHALL 支持重新分配（迁移）

### REQ-1.6 Phase 1 测试与验证

**User Story:** 作为开发团队，我希望在 Platform API 开发完成后进行全面测试，以确保功能正确和系统稳定。

#### Acceptance Criteria

1. **单元测试**
   - WHEN 完成每个 Service 开发 THEN 开发者 SHALL 编写单元测试，覆盖率 ≥ 80%
   - WHEN 测试认证逻辑 THEN 测试 SHALL 覆盖 Token 生成、验证、刷新、过期场景

2. **集成测试**
   - WHEN 完成 API 开发 THEN 开发者 SHALL 编写集成测试，使用真实数据库
   - WHEN 测试租户管理 THEN 测试 SHALL 覆盖 CRUD 全流程和边界条件
   - WHEN 测试中间件分配 THEN 测试 SHALL 模拟中间件连接成功/失败场景

3. **API 契约验证**
   - WHEN API 开发完成 THEN 系统 SHALL 生成 OpenAPI 文档
   - WHEN 验证 API 契约 THEN 测试 SHALL 确保请求/响应格式符合规范

4. **手动验收测试**
   - WHEN Phase 1 开发完成 THEN QA SHALL 执行手动验收测试清单
   - WHEN 发现缺陷 THEN 开发者 SHALL 修复并重新测试

---

## Phase 2: shared-auth 共享认证包

### REQ-2.1 JWT 认证守卫

**User Story:** 作为后端开发者，我希望使用共享的 JwtAuthGuard，以便在所有模块中统一验证 JWT Token。

#### Acceptance Criteria

1. WHEN 请求携带有效 JWT THEN Guard SHALL 解析 Token 并注入用户上下文
2. WHEN JWT 签名无效 THEN Guard SHALL 返回 401 Unauthorized
3. WHEN JWT 已过期 THEN Guard SHALL 返回 401 并提示 Token 过期
4. IF JWT Payload 包含 tenantId THEN Guard SHALL 将其存入请求上下文

### REQ-2.2 租户认证守卫

**User Story:** 作为后端开发者，我希望使用共享的 TenantAuthGuard，以便强制校验租户隔离。

#### Acceptance Criteria

1. WHEN JWT 中的 tenantId 与请求 tenantId 不一致 THEN Guard SHALL 返回 401 Unauthorized
2. WHEN 租户状态为 disabled THEN Guard SHALL 返回 403 Forbidden
3. WHEN 租户不存在 THEN Guard SHALL 返回 404 Not Found（不泄露信息）
4. IF 请求路径在白名单中 THEN Guard SHALL 跳过租户校验

### REQ-2.3 用户/租户装饰器

**User Story:** 作为后端开发者，我希望使用 @CurrentUser 和 @CurrentTenant 装饰器，以便便捷获取当前用户和租户信息。

#### Acceptance Criteria

1. WHEN 使用 @CurrentUser() THEN 装饰器 SHALL 返回完整的用户信息对象
2. WHEN 使用 @CurrentTenant() THEN 装饰器 SHALL 返回租户 ID
3. WHEN 未通过认证使用装饰器 THEN 装饰器 SHALL 返回 undefined
4. IF 需要特定字段 THEN 装饰器 SHALL 支持 @CurrentUser('email') 形式

### REQ-2.4 请求日志中间件

**User Story:** 作为运维人员，我希望所有请求都有统一的日志格式和 Request ID，以便追踪问题。

#### Acceptance Criteria

1. WHEN 接收请求时 THEN 中间件 SHALL 生成唯一 Request ID（UUID）
2. WHEN 记录日志时 THEN 中间件 SHALL 包含：Request ID、tenantId、userId、路径、耗时
3. WHEN 请求完成 THEN 中间件 SHALL 记录响应状态码和耗时
4. IF 请求头包含 X-Request-ID THEN 中间件 SHALL 使用该值（链路追踪）

### REQ-2.5 限流守卫

**User Story:** 作为平台运营，我希望对 API 请求进行限流，以防止滥用和保护系统稳定性。

#### Acceptance Criteria

1. WHEN 请求频率超过限制 THEN Guard SHALL 返回 429 Too Many Requests
2. WHEN 配置限流规则时 THEN 系统 SHALL 支持按租户/用户/IP 三种维度
3. WHEN 达到限流阈值 80% THEN 系统 SHALL 记录告警日志
4. IF 租户套餐包含更高限额 THEN Guard SHALL 使用套餐配置的限额

### REQ-2.6 Phase 2 测试与验证

**User Story:** 作为开发团队，我希望对 shared-auth 包进行全面测试，以确保所有模块可以安全复用。

#### Acceptance Criteria

1. **单元测试**
   - WHEN 完成 Guard 开发 THEN 开发者 SHALL 编写单元测试，覆盖率 ≥ 90%
   - WHEN 测试 JwtAuthGuard THEN 测试 SHALL 覆盖有效/无效/过期 Token 场景
   - WHEN 测试 TenantAuthGuard THEN 测试 SHALL 覆盖租户隔离的所有边界条件

2. **租户隔离测试（必须 100% 覆盖）**
   - WHEN 租户 A 的 Token 访问租户 B 资源 THEN 系统 SHALL 返回 401/404
   - WHEN 测试跨租户访问 THEN 测试 SHALL 覆盖所有资源类型
   - WHEN 资源不存在 THEN 系统 SHALL 返回 404（不泄露存在性）

3. **集成验证**
   - WHEN shared-auth 包发布前 THEN 开发者 SHALL 在 Tenant API 中集成测试
   - WHEN 集成测试通过 THEN 开发者 SHALL 更新 Platform API 使用共享包
   - WHEN 两个模块都验证通过 THEN shared-auth SHALL 标记为稳定版本

4. **安全审计**
   - WHEN Phase 2 完成 THEN 安全团队 SHALL 审计认证逻辑
   - WHEN 发现安全漏洞 THEN 开发者 SHALL 立即修复并重新审计

---

## MVP 验收测试

### REQ-MVP-1 全系统集成测试

**User Story:** 作为产品负责人，我希望在 MVP 发布前进行全系统集成测试，以确保所有模块协同工作正常。

#### Acceptance Criteria

1. **跨模块集成测试**
   - WHEN 所有模块开发完成 THEN 测试 SHALL 验证模块间数据一致性
   - WHEN Platform 禁用租户 THEN Tenant API SHALL 拒绝该租户请求
   - WHEN Platform 分配中间件 THEN 业务模块 SHALL 能正确连接

2. **端到端业务场景测试**
   - WHEN 进行 E2E 测试 THEN 测试 SHALL 覆盖以下完整场景：
     - 场景 1：平台创建租户 → 分配套餐 → 分配中间件 → 租户登录成功
     - 场景 2：租户配置 MT5 服务器 → 添加用户 → 用户登录交易

3. **性能基准测试**
   - WHEN MVP 功能完成 THEN 测试 SHALL 验证性能指标：
     - API 响应时间 P95 < 200ms
     - WebSocket 推送延迟 < 100ms
   - IF 性能不达标 THEN 开发者 SHALL 优化并重新测试

4. **安全渗透测试**
   - WHEN MVP 发布前 THEN 安全团队 SHALL 进行渗透测试
   - WHEN 测试项目包括：
     - SQL 注入
     - XSS 攻击
     - CSRF 攻击
     - JWT Token 伪造
     - 租户越权访问
   - WHEN 发现漏洞 THEN 开发者 SHALL 修复并重新测试

5. **发布验收**
   - WHEN 所有测试通过 THEN 产品负责人 SHALL 进行最终验收
   - WHEN 验收通过 THEN 系统 SHALL 标记为可发布状态
   - WHEN 验收不通过 THEN 开发者 SHALL 修复问题并重新提交

---

## Non-Functional Requirements

### Code Architecture and Modularity

- **模块完全独立**：Platform API / Tenant API 互不调用
- **数据存储隔离**：每个模块独立的 PostgreSQL + Redis
- **共享包复用**：认证逻辑通过 @mt5-platform/shared-auth 共享
- **接口契约**：OpenAPI/Swagger 自动生成 API 文档

### Performance

| 指标 | 目标值 |
|------|--------|
| API 响应时间（P95） | < 200ms |
| 数据库查询 | < 50ms |
| WebSocket 推送延迟 | < 100ms |

### Security

- **JWT 安全**：Access Token 15分钟，Refresh Token 7天一次性使用
- **租户隔离**：三层防护（Guard + DB中间件 + 自动化测试）
- **密码存储**：MT Manager 密码 AES-256-GCM 加密
- **网络安全**：中间件仅内网访问，HTTPS 强制，HSTS 头部

### Reliability

- **健康检查**：所有服务 30 秒间隔健康检查
- **故障隔离**：模块独立部署，单模块故障不影响其他

### Usability

- **API 版本控制**：/api/v1/ 前缀
- **统一响应格式**：{ success, data, error, meta }
- **国际化支持**：错误消息支持中英文

### Testing Requirements

| 测试类型 | 覆盖率目标 | 执行时机 |
|---------|-----------|---------|
| 单元测试 | ≥ 80% | 每次提交 |
| 集成测试 | ≥ 60% | 每次 PR |
| 租户隔离测试 | 100% | 每次 PR |
| E2E 测试 | 核心流程 | 每次发布 |
| 性能测试 | 达标 | 每次发布 |
| 安全测试 | 无高危漏洞 | 每次发布 |

---

## Dependencies

| 依赖项 | 说明 |
|--------|------|
| C++ MT5 Middleware | 必须已部署并可用 |
| PostgreSQL 15 | 每个模块独立实例 |
| Redis 7 | 每个模块独立实例 |
| Nginx | 反向代理和负载均衡 |

## Out of Scope (本次升级)

- Copy API（后续独立开发）
- MT4 支持（V1.0）
- CRM 模块（V1.0）
- OpenTelemetry 链路追踪（V1.0）
- Token 设备绑定（V1.0）
- 自动化证书管理（V1.0）
- 2FA 认证（V1.0）
- 异常行为检测（V1.0）

---

## References

- [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) - 系统架构设计
- [architecture-review-issues.md](../../docs/architecture-review-issues.md) - 24 个架构决议
