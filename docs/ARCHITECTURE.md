# MT5 SaaS 平台架构设计文档

> 版本: 1.0 (MVP)
> 最后更新: 2025-12-25
> 状态: 已确认

---

## 目录

1. [架构概览](#一架构概览)
2. [系统拓扑](#二系统拓扑)
3. [模块设计](#三模块设计)
4. [认证与安全](#四认证与安全)
5. [数据架构](#五数据架构)
6. [中间件集成](#六中间件集成)
7. [开发规范](#七开发规范)
8. [部署架构](#八部署架构)
9. [MVP 范围](#九mvp-范围)

---

## 一、架构概览

### 1.1 架构理念

本平台采用**模块独立架构**，核心原则：

- **模块完全独立**：各业务模块平级，互不调用
- **数据存储隔离**：每个模块独立的 PostgreSQL + Redis
- **去中心化鉴权**：无独立 Auth Center，使用共享认证包
- **直连中间件**：各模块直接连接 C++ 中间件，无 Gateway 层
- **简化依赖链**：依赖仅限于共享包，降低耦合

### 1.2 技术选型

| 层级 | 技术栈 |
|------|--------|
| 前端 | Vue 3 + TypeScript + Vite + UnoCSS |
| 后端 | NestJS + TypeScript + Prisma |
| 数据库 | PostgreSQL 15 |
| 缓存 | Redis 7 |
| 反向代理 | Nginx |
| 容器化 | Docker + Docker Compose |
| 中间件 | C++ MT5 Manager API |

### 1.3 核心架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              互联网                                      │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Nginx (1-2 实例)                                 │
│  • 域名→租户映射  • SSL 终止  • 路由转发  • 负载均衡  • 安全头部          │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
            ▼                       ▼                       ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│  Platform API     │   │   Tenant API      │   │    Copy API       │
│  (平台管理)        │   │   (租户业务)       │   │   (跟单业务)       │
│                   │   │                   │   │                   │
│  端口: 3001       │   │  端口: 3000       │   │   端口: 3002      │
└─────────┬─────────┘   └─────────┬─────────┘   └─────────┬─────────┘
          │                       │                       │
          ▼                       ▼                       ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│  Platform DB      │   │   Tenant DB       │   │    Copy DB        │
│  + Redis          │   │   + Redis         │   │    + Redis        │
│                   │   │                   │   │                   │
│  pg:5433 rd:6380  │   │  pg:5432 rd:6379  │   │   pg:5434 rd:6381 │
└───────────────────┘   └───────────────────┘   └─────────┬─────────┘
                                    │                     │
                                    └──────────┬──────────┘
                                               │
                                               ▼
                              ┌─────────────────────────────────┐
                              │      C++ MT5 Middleware         │
                              │      (多实例，按租户分配)         │
                              │                                 │
                              │  实例1 → MT5 Server A           │
                              │  实例2 → MT5 Server B           │
                              │  实例N → MT5 Server N           │
                              └─────────────────────────────────┘
```

---

## 二、系统拓扑

### 2.1 模块关系

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Platform Layer (平台层)                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Platform API + Console                                          │    │
│  │  • 租户管理 (CRUD)                                                │    │
│  │  • 套餐配置 (模块权限、资源限制)                                    │    │
│  │  • 中间件分配 (给租户分配中间件实例)                                │    │
│  │  • 平台管理员认证                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 分配中间件 / 管理套餐
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Business Layer (业务层)                          │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │   Tenant API     │  │    Copy API      │  │    CRM API       │       │
│  │   (租户业务)      │  │   (跟单业务)      │  │  (客户管理) [V1]  │       │
│  │                  │  │                  │  │                  │       │
│  │ • 管理员登录     │  │ • 信号源管理     │  │ • 客户分层       │       │
│  │ • MT5服务器配置  │  │ • 订阅管理       │  │ • IB管理         │       │
│  │ • 用户管理       │  │ • 跟单执行       │  │ • 佣金计算       │       │
│  │ • 账户查询       │  │ • 分成结算       │  │ • 营销活动       │       │
│  │ • 交易操作       │  │ • 跟单记录       │  │ • 报表统计       │       │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘       │
│           │                     │                     │                 │
│           │     各模块独立连接中间件（无相互调用）      │                 │
│           │                     │                     │                 │
│           └──────────────┬──────┴─────────────────────┘                 │
│                          ▼                                               │
│              ┌───────────────────────┐                                  │
│              │   C++ MT5 Middleware   │                                  │
│              │   (共享基础设施)        │                                  │
│              └───────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 模块通信规则

**核心规则：业务模块之间完全独立，互不调用**

| 通信类型 | 允许 | 说明 |
|---------|------|------|
| Tenant API ↔ Copy API | ❌ | 禁止直接调用 |
| Tenant API ↔ CRM API | ❌ | 禁止直接调用 |
| Copy API ↔ CRM API | ❌ | 禁止直接调用 |
| 任意模块 → 中间件 | ✅ | 直接连接获取交易数据 |
| 任意模块 → 共享包 | ✅ | 引用 packages/* |

**数据共享方式：**
- 用户身份：通过 JWT Token 传递（包含 tenantId, userId, roles）
- 交易数据：各模块直接从 C++ 中间件获取
- 租户状态：通过 Redis 缓存（短 TTL，5-10分钟）

---

## 三、模块设计

### 3.1 Platform API (平台管理服务)

**职责：** 管理租户、套餐、中间件分配

**目录结构：**
```
apps/platform-service/
├── src/
│   ├── modules/
│   │   ├── auth/                 # 平台管理员认证
│   │   ├── tenants/              # 租户 CRUD
│   │   ├── instances/            # 租户实例管理
│   │   ├── subscriptions/        # 套餐订阅
│   │   ├── middleware/           # 中间件实例管理
│   │   ├── middleware-assignment/# 中间件分配
│   │   ├── middleware-config/    # 中间件配置
│   │   ├── health/               # 健康检查
│   │   └── ...
│   ├── common/
│   │   ├── guards/               # 认证守卫
│   │   └── services/             # 公共服务
│   └── main.ts
├── prisma/
│   └── schema.prisma
└── package.json
```

**核心功能：**
- 租户创建/禁用/删除
- 套餐配置（模块权限、MT5 服务器数量限制）
- 中间件实例管理和分配
- 平台管理员认证

### 3.2 Tenant API (租户业务服务)

**职责：** 租户级别的业务操作

**目录结构：**
```
apps/tenant-api/
├── src/
│   ├── auth/                     # 租户管理员认证
│   │   ├── guards/               # JWT/Tenant 守卫
│   │   ├── decorators/           # @CurrentUser, @CurrentTenant
│   │   └── services/             # 认证服务
│   ├── middleware-proxy/         # 中间件代理
│   │   ├── adapters/             # MT5Adapter (MT4 预留)
│   │   ├── services/             # 交易/服务器服务
│   │   └── transformers/         # 响应转换
│   ├── mt-server/                # MT 服务器配置
│   ├── mt-manager/               # MT Manager 管理
│   ├── users/                    # 交易用户管理
│   ├── trading/                  # 交易操作
│   ├── positions/                # 持仓查询
│   ├── dashboard/                # 仪表盘数据
│   ├── reports/                  # 报表
│   ├── settings/                 # 租户设置
│   ├── websocket/                # WebSocket 实时数据
│   ├── ws-ticket/                # WebSocket 票据认证
│   ├── api-keys/                 # API Key 管理
│   ├── security/                 # 安全相关
│   ├── health/                   # 健康检查
│   └── ...
├── prisma/
│   └── schema.prisma
└── package.json
```

**核心功能：**
- 租户管理员 JWT 登录
- MT5 服务器配置（添加/编辑/删除）
- MT Manager 账户管理
- 交易用户 CRUD
- 账户余额/持仓/历史查询
- 交易操作代理
- WebSocket 实时数据推送

### 3.3 Copy API (跟单业务服务) [待开发]

**职责：** 跟单社区业务

**计划目录结构：**
```
apps/copy-api/
├── src/
│   ├── auth/                     # 认证（复用共享包）
│   ├── signal-providers/         # 信号源管理
│   │   ├── dto/
│   │   ├── entities/
│   │   └── signal-providers.service.ts
│   ├── subscriptions/            # 订阅管理
│   │   ├── dto/
│   │   └── subscriptions.service.ts
│   ├── copy-engine/              # 跟单引擎
│   │   ├── copy-executor.service.ts
│   │   ├── position-monitor.service.ts
│   │   └── retry-handler.service.ts
│   ├── settlements/              # 分成结算
│   │   ├── profit-calculator.service.ts
│   │   └── settlement.service.ts
│   ├── copy-trades/              # 跟单记录
│   ├── middleware-proxy/         # 中间件代理（复用模式）
│   ├── websocket/                # 实时跟单事件
│   ├── health/
│   └── ...
├── prisma/
│   └── schema.prisma
└── package.json
```

**核心功能：**
- 信号源注册/审核
- 订阅/取消订阅
- 跟单执行（固定手数/比例跟单）
- 跟单状态追踪（PENDING → EXECUTING → SUCCESS/FAILED）
- 分成结算（每日/每周/每月）
- 跟单记录查询

### 3.4 共享包 (packages/)

**目录结构：**
```
packages/
├── shared/                       # 当前共享包
│   └── src/
│       ├── types/                # 共享类型定义
│       ├── utils/                # 工具函数
│       └── index.ts
│
├── shared-auth/                  # [计划] 认证共享包
│   ├── guards/
│   │   ├── tenant-auth.guard.ts  # TenantAuthGuard
│   │   ├── jwt-auth.guard.ts     # JwtAuthGuard
│   │   └── rate-limit.guard.ts   # RateLimitGuard
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   ├── current-tenant.decorator.ts
│   │   └── require-scopes.decorator.ts
│   ├── middleware/
│   │   └── request-logger.middleware.ts
│   └── index.ts
│
├── shared-types/                 # [计划] 类型共享包
│   ├── middleware/               # 中间件请求/响应类型
│   ├── dto/                      # 公共 DTO
│   └── errors/                   # 错误代码定义
│
└── shared-utils/                 # [计划] 工具共享包
    ├── crypto/                   # 加密解密
    ├── validation/               # 校验器
    └── logger/                   # 日志格式
```

**使用方式：**
```typescript
import { TenantAuthGuard, CurrentUser } from '@mt5-platform/shared-auth';
import { MiddlewareTypes } from '@mt5-platform/shared-types';
import { encrypt, decrypt } from '@mt5-platform/shared-utils';
```

---

## 四、认证与安全

### 4.1 认证架构

**采用轻量级 JWT Token 方案，无独立 Auth Center**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           认证流程                                       │
│                                                                          │
│  1. 用户登录                                                             │
│     ┌──────────┐     POST /auth/login      ┌──────────────────┐         │
│     │  客户端   │ ─────────────────────────▶ │  Tenant API      │         │
│     └──────────┘                            │  (验证用户名密码) │         │
│           ▲                                 └────────┬─────────┘         │
│           │                                          │                   │
│           │  Access Token (15min)                    │ 生成 JWT          │
│           │  Refresh Token (7天)                     ▼                   │
│           └──────────────────────────────── ┌──────────────────┐         │
│                                             │  JWT Payload:    │         │
│                                             │  {               │         │
│                                             │    sub: userId,  │         │
│                                             │    tenantId,     │         │
│                                             │    roles: [],    │         │
│                                             │    exp: 15min    │         │
│                                             │  }               │         │
│                                             └──────────────────┘         │
│                                                                          │
│  2. API 请求鉴权                                                         │
│     ┌──────────┐    Authorization: Bearer <token>    ┌──────────┐       │
│     │  客户端   │ ──────────────────────────────────▶ │ Nginx    │       │
│     └──────────┘                                      └────┬─────┘       │
│                                                            │             │
│                                                            ▼             │
│                                      ┌─────────────────────────────┐    │
│                                      │  TenantAuthGuard (服务端)    │    │
│                                      │  1. 验证 JWT 签名            │    │
│                                      │  2. 检查 Token 过期          │    │
│                                      │  3. 校验 tenantId 一致       │    │
│                                      │  4. 注入用户上下文            │    │
│                                      └─────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Token 设计

| Token 类型 | 有效期 | 存储位置 | 用途 |
|-----------|--------|---------|------|
| Access Token | 15 分钟 | 内存/LocalStorage | API 请求认证 |
| Refresh Token | 7 天 | HttpOnly Cookie | 刷新 Access Token |

**JWT Payload 结构：**
```typescript
interface JwtPayload {
  sub: string;        // 用户 ID
  tenantId: string;   // 租户 ID
  email: string;      // 用户邮箱
  roles: string[];    // 角色列表
  type: 'access' | 'refresh';
  iat: number;        // 签发时间
  exp: number;        // 过期时间
}
```

### 4.3 安全防护层级

**第 1 层 - 短期 Token（MVP 必须）：**
- Access Token: 15 分钟
- Refresh Token: 7 天，一次性使用，用后轮换

**第 2 层 - Token 绑定（V1.0）：**
- 绑定 User-Agent（设备指纹）
- 可选绑定 IP（企业版用户）

**第 3 层 - 敏感操作二次验证（MVP 必须）：**
- 交易操作：验证交易密码
- 设置变更：验证短信/邮箱验证码
- 资金操作：验证 2FA（V1.0）

**第 4 层 - 异常检测（V1.0）：**
- 同一 Token 多 IP 使用 → 强制重新登录
- 短时间大量请求 → 限流告警
- 异地登录提醒

### 4.4 租户隔离

**三层防护机制：**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  第 1 层: 全局中间件 TenantAuthGuard                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  • JWT tenantId 与请求 tenantId 必须一致                          │    │
│  │  • 不一致直接返回 401 Unauthorized                                │    │
│  │  • 所有 API 默认启用，白名单除外                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  第 2 层: 数据库自动注入                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  • Prisma 中间件自动给查询添加 tenantId 条件                      │    │
│  │  • 使用 AsyncLocalStorage 传递租户上下文                          │    │
│  │  • 避免开发者遗漏 tenantId 条件                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  第 3 层: 自动化测试                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  • 每个资源接口必须有租户隔离测试                                  │    │
│  │  • 测试用例：租户A的Token不能访问租户B的资源                       │    │
│  │  • 返回 404（不泄露资源存在），非 403                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.5 中间件安全

**存储安全：**
- MT5 Manager 密码使用 AES-256-GCM 加密存储
- 加密密钥存储在环境变量或密钥管理服务
- 数据库只存加密后的密文

**网络安全：**
- 中间件只在内网访问，不暴露公网
- 防火墙限制只允许业务服务器 IP 访问
- 内部通信使用 HTTPS（可用自签名证书）

**访问控制：**
- 每个业务模块使用独立的 API Key
- 记录所有访问日志（who/when/what）
- 敏感操作需要额外授权

### 4.6 HTTPS 安全配置

```nginx
# Nginx 安全头部配置
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Content-Security-Policy "default-src 'self'" always;

# 强制 HTTPS
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}
```

---

## 五、数据架构

### 5.1 数据库设计原则

- **模块独立存储**：每个业务模块使用独立的 PostgreSQL 实例
- **租户隔离**：所有业务表必须包含 `tenantId` 字段
- **软删除**：使用 `deletedAt` 字段，保留审计痕迹
- **时间戳**：所有表包含 `createdAt`, `updatedAt`

### 5.2 核心数据模型

**Platform DB - 平台数据：**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Tenant      │     │  Subscription   │     │   Middleware    │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id              │────▶│ tenantId        │     │ id              │
│ name            │     │ planType        │     │ name            │
│ domain          │     │ startDate       │     │ host            │
│ status          │     │ endDate         │     │ port            │
│ planId          │     │ features        │     │ status          │
│ createdAt       │     │ limits          │     │ assignedTenants │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Tenant DB - 租户业务数据：**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   TenantAdmin   │     │    MTServer     │     │   TenantUser    │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id              │     │ id              │     │ id              │
│ tenantId        │     │ tenantId        │     │ tenantId        │
│ email           │     │ name            │     │ email           │
│ password (hash) │     │ host            │     │ mtLogin         │
│ roles           │     │ managerLogin    │     │ mtServerId      │
│ status          │     │ managerPassword │     │ status          │
└─────────────────┘     │ (encrypted)     │     └─────────────────┘
                        └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  TradingAccount │
                        ├─────────────────┤
                        │ id              │
                        │ userId          │
                        │ mtServerId      │
                        │ mtLogin         │
                        │ mtPassword (enc)│
                        │ platform (MT5)  │
                        │ isDefault       │
                        └─────────────────┘
```

**Copy DB - 跟单业务数据：**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ SignalProvider  │     │  Subscription   │     │   CopyTrade     │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id              │     │ id              │     │ id              │
│ tenantId        │     │ tenantId        │     │ tenantId        │
│ userId          │────▶│ providerId      │────▶│ subscriptionId  │
│ displayName     │     │ followerId      │     │ signalTradeId   │
│ description     │     │ copyMode        │     │ status          │
│ profitShare %   │     │ lotMultiplier   │     │ signalPrice     │
│ tierLevel       │     │ maxLots         │     │ copyPrice       │
│ status          │     │ status          │     │ profit          │
│ statistics      │     │ createdAt       │     │ executedAt      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │   Settlement    │
                                                ├─────────────────┤
                                                │ id              │
                                                │ providerId      │
                                                │ followerId      │
                                                │ period          │
                                                │ grossProfit     │
                                                │ profitShare     │
                                                │ netProfit       │
                                                │ status          │
                                                └─────────────────┘
```

### 5.3 缓存策略

| 缓存项 | TTL | 清除策略 |
|--------|-----|---------|
| 租户状态 | 5 分钟 | 禁用时主动清除 |
| 租户套餐 | 10 分钟 | 变更时主动清除 |
| 中间件配置 | 5 分钟 | 配置变更时清除 |
| 用户 Session | 30 分钟 | 登出时清除 |
| 行情数据 | 1 秒 | 实时更新 |

---

## 六、中间件集成

### 6.1 中间件架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         中间件路由架构                                    │
│                                                                          │
│  ┌───────────────┐                                                       │
│  │  Tenant API   │ ─┐                                                    │
│  └───────────────┘  │                                                    │
│                     │                                                    │
│  ┌───────────────┐  │    ┌──────────────────────┐                       │
│  │   Copy API    │ ─┼───▶│  Middleware Router   │                       │
│  └───────────────┘  │    │  (by tenantId +      │                       │
│                     │    │   mtServerId)        │                       │
│  ┌───────────────┐  │    └──────────┬───────────┘                       │
│  │   CRM API     │ ─┘               │                                    │
│  └───────────────┘                  │                                    │
│                                     ▼                                    │
│           ┌─────────────────────────────────────────┐                   │
│           │                                         │                    │
│    ┌──────┴──────┐  ┌──────────────┐  ┌────────────┴───┐               │
│    │Middleware 1 │  │Middleware 2  │  │ Middleware N   │               │
│    │(Tenant A)   │  │(Tenant B)    │  │ (Tenant X,Y)   │               │
│    └──────┬──────┘  └──────┬───────┘  └────────┬───────┘               │
│           │                │                    │                        │
│           ▼                ▼                    ▼                        │
│    ┌────────────┐   ┌────────────┐      ┌────────────┐                 │
│    │MT5 Server A│   │MT5 Server B│      │MT5 Server X│                 │
│    └────────────┘   └────────────┘      └────────────┘                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 中间件适配器

**Adapter 设计模式：**

```typescript
// 核心交易接口（MT4/MT5 通用）
interface CoreTradingOperations {
  // 账户操作
  getAccountInfo(login: number): Promise<AccountInfo>;
  getBalance(login: number): Promise<Balance>;
  deposit(login: number, amount: number): Promise<TransactionResult>;
  withdraw(login: number, amount: number): Promise<TransactionResult>;

  // 交易操作
  openPosition(order: OrderRequest): Promise<OrderResult>;
  closePosition(ticket: number): Promise<OrderResult>;
  modifyPosition(ticket: number, sl: number, tp: number): Promise<OrderResult>;

  // 查询操作
  getPositions(login: number): Promise<Position[]>;
  getHistory(login: number, from: Date, to: Date): Promise<Trade[]>;
}

// MT5 扩展接口
interface MT5ExtendedOperations extends CoreTradingOperations {
  // MT5 专属功能
  getDeals(login: number, from: Date, to: Date): Promise<Deal[]>;
  getOrders(login: number): Promise<Order[]>;
  // ... 更多 MT5 特有功能
}

// 适配器工厂
class AdapterFactory {
  create(platform: 'MT4' | 'MT5'): TradingPlatformAdapter {
    switch (platform) {
      case 'MT5':
        return new MT5Adapter();
      case 'MT4':
        return new MT4Adapter(); // V1.0 实现
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}
```

### 6.3 跟单引擎

**跟单执行流程：**

```
信号源下单 (T+0ms)
    │
    ▼
MT5 Server 成交 (T+50ms)
    │
    ▼
Middleware 推送事件 (T+100ms)
    │
    ▼
Copy API 接收 (T+120ms)
    │
    ├──▶ 查询所有订阅者
    │
    ▼
并行执行跟单计算 (T+150ms)
    │
    ├──▶ 预检查（余额、风控、持仓数、品种）
    │
    ▼
并行发送跟单指令 (T+200ms)
    │
    ├──▶ 跟单者1: Middleware A ──▶ MT5 Server X (成功)
    ├──▶ 跟单者2: Middleware B ──▶ MT5 Server Y (成功)
    └──▶ 跟单者3: Middleware A ──▶ MT5 Server Z (失败-余额不足)
               │
               ▼
         记录状态 + 通知用户
```

**跟单状态追踪：**
```
PENDING ──▶ EXECUTING ──┬──▶ SUCCESS
                        ├──▶ FAILED (记录原因)
                        └──▶ RETRY (最多3次)
```

**失败处理策略：**
| 失败原因 | 处理方式 |
|---------|---------|
| 余额不足 | 通知用户，不重试 |
| 网络超时 | 自动重试3次，指数退避 |
| 风控限制 | 通知用户，不重试 |
| 交易时间外 | 等待开市后执行 |

---

## 七、开发规范

### 7.1 项目结构

```
mt5-platform/
├── apps/
│   ├── platform-service/         # 平台管理后端
│   ├── platform-console/         # 平台管理前端
│   ├── tenant-api/               # 租户业务后端
│   ├── tenant-console/           # 租户业务前端
│   ├── copy-api/                 # [计划] 跟单业务后端
│   └── copy-console/             # [计划] 跟单业务前端
│
├── packages/
│   ├── shared/                   # 当前共享包
│   ├── shared-auth/              # [计划] 认证共享包
│   ├── shared-types/             # [计划] 类型共享包
│   └── shared-utils/             # [计划] 工具共享包
│
├── docker/
│   ├── Dockerfile.platform-service
│   ├── Dockerfile.tenant-api
│   └── nginx/
│
├── docs/
│   ├── ARCHITECTURE.md           # 本文档
│   ├── architecture-review-issues.md
│   └── copy-trading-mvp-spec.md
│
├── docker-compose.yml            # 开发环境
├── docker-compose.prod.yml       # 生产环境
└── package.json                  # Monorepo 根配置
```

### 7.2 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `tenant-auth.guard.ts` |
| 类名 | PascalCase | `TenantAuthGuard` |
| 函数名 | camelCase | `validateToken()` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 数据库表 | PascalCase | `TenantUser` |
| 数据库字段 | camelCase | `createdAt` |
| API 路径 | kebab-case | `/api/v1/signal-providers` |

### 7.3 API 设计规范

**URL 结构：**
```
/api/v1/{resource}                    # 资源列表
/api/v1/{resource}/{id}               # 单个资源
/api/v1/{resource}/{id}/{sub-resource}# 子资源
```

**响应格式：**
```typescript
// 成功响应
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}

// 错误响应
{
  "success": false,
  "error": {
    "code": "TENANT_NOT_FOUND",
    "message": "Tenant with ID xxx not found"
  }
}
```

### 7.4 测试策略

**分层测试：**

| 层级 | 范围 | Mock 策略 | 覆盖率目标 |
|------|------|----------|-----------|
| 单元测试 | 单个函数/类 | Mock 所有依赖 | 80%+ |
| 集成测试 | 模块内部 | 真实 DB，Mock 中间件 | 60%+ |
| E2E 测试 | API 端到端 | 真实 DB，Mock 中间件 | 核心流程 |
| 租户隔离测试 | 跨租户访问 | - | 100% |

**必须覆盖的测试场景：**
- 每个 API 的正常/异常流程
- 租户隔离（租户 A 不能访问租户 B 资源）
- Token 过期/无效处理
- 中间件超时/错误处理

---

## 八、部署架构

### 8.1 容器清单 (MVP)

| 容器名称 | 镜像 | 端口 | 资源 |
|---------|------|------|------|
| nginx | nginx:alpine | 80, 443 | 0.5 CPU, 256MB |
| platform-service | 自建 | 3001 | 1 CPU, 512MB |
| platform-db | postgres:15-alpine | 5433 | 1 CPU, 1GB |
| platform-redis | redis:7-alpine | 6380 | 0.5 CPU, 256MB |
| tenant-api | 自建 | 3000 | 1 CPU, 512MB |
| tenant-db | postgres:15-alpine | 5432 | 1 CPU, 1GB |
| tenant-redis | redis:7-alpine | 6379 | 0.5 CPU, 256MB |
| copy-api | 自建 | 3002 | 1 CPU, 512MB |
| copy-db | postgres:15-alpine | 5434 | 1 CPU, 1GB |
| copy-redis | redis:7-alpine | 6381 | 0.5 CPU, 256MB |

**总计：10 容器**

### 8.2 网络架构

```yaml
networks:
  mt5-backend:     # 后端服务间通信
    driver: bridge
  mt5-frontend:    # 前后端通信
    driver: bridge
```

### 8.3 健康检查

| 服务 | 端点 | 检查间隔 |
|------|------|---------|
| Platform API | GET /health | 30s |
| Tenant API | GET /api/v1/health | 30s |
| Copy API | GET /api/v1/health | 30s |
| PostgreSQL | pg_isready | 10s |
| Redis | redis-cli ping | 10s |

### 8.4 日志与监控

**MVP 阶段：**
- Request ID 贯穿请求全链路
- 文件日志 + JSON 格式
- Docker logs 收集

**V1.0 阶段：**
- OpenTelemetry + Jaeger
- 自动埋点（HTTP、PostgreSQL、Redis、Axios）
- 可视化调用链

---

## 九、MVP 范围

### 9.1 MVP 功能边界

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MVP 必须实现                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Platform API + Console（平台管理）                                      │
│    ✓ 租户创建/管理                                                       │
│    ✓ 套餐配置（模块权限、MT5服务器数量限制）                               │
│    ✓ 中间件分配                                                          │
│                                                                          │
│  Tenant API + Console（独立业务模块）                                    │
│    ✓ 租户管理员登录                                                      │
│    ✓ MT5 服务器配置                                                      │
│    ✓ 交易用户管理                                                        │
│    ✓ 账户余额/持仓/历史查询                                               │
│                                                                          │
│  Copy API + Console（独立业务模块）                                      │
│    ✓ 信号源注册/审核                                                     │
│    ✓ 订阅/取消订阅                                                       │
│    ✓ 跟单执行（固定手数/比例）                                            │
│    ✓ 跟单记录查询                                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        延后到 V1.0                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  ○ MT4 支持                                                              │
│  ○ CRM 模块                                                              │
│  ○ OpenTelemetry 链路追踪                                                │
│  ○ Token 设备绑定                                                        │
│  ○ 自动化证书管理                                                        │
│  ○ 2FA 认证                                                              │
│  ○ 异常行为检测                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 技术决议汇总

| 领域 | 决议 |
|------|------|
| 认证方案 | 轻量级 JWT Token（非 OAuth2/OIDC） |
| API 网关 | 无独立网关，Nginx + 服务端鉴权 |
| 平台支持 | MVP 仅 MT5，MT4 后续按需 |
| 分布式事务 | 预检查 + 最终一致性 + 状态追踪 |
| 服务数量 | MVP 10 容器，模块独立存储 |
| 证书管理 | MVP 手动，后续自动化 |
| 日志追踪 | MVP Request ID，后续 OpenTelemetry |
| 模块关系 | 完全独立，互不调用 |
| 数据同步 | 无需同步，JWT + 中间件直连 |
| 交易延迟 | 接受 200-500ms，非高频跟单 |
| 账户关联 | 用户-账户关联表 + 手动绑定 |

### 9.3 开发优先级

**Phase 1 - 基础设施（1周）：**
1. packages/shared-auth 共享认证包
2. Docker Compose 开发环境
3. 数据库 Schema 设计

**Phase 2 - Platform API（2周）：**
1. 平台管理员认证
2. 租户 CRUD
3. 中间件管理和分配
4. 套餐配置

**Phase 3 - Tenant API 完善（2周）：**
1. 现有功能优化
2. MT Manager 管理
3. API Key 管理
4. 安全加固

**Phase 4 - Copy API（3周）：**
1. 信号源管理
2. 订阅系统
3. 跟单引擎
4. 分成结算

**Phase 5 - 前端控制台（2周）：**
1. Platform Console
2. Tenant Console 优化
3. Copy Console

---

## 附录

### A. 环境变量配置

```bash
# Platform Service
PLATFORM_DATABASE_URL=postgresql://user:pass@localhost:5433/platform
PLATFORM_REDIS_URL=redis://:pass@localhost:6380
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Tenant API
TENANT_DATABASE_URL=postgresql://user:pass@localhost:5432/tenant
TENANT_REDIS_URL=redis://:pass@localhost:6379
MIDDLEWARE_ENCRYPTION_KEY=your-aes-256-key

# Copy API
COPY_DATABASE_URL=postgresql://user:pass@localhost:5434/copy
COPY_REDIS_URL=redis://:pass@localhost:6381
```

### B. 相关文档

- [架构决议详情](./architecture-review-issues.md) - 24 个架构问题的完整讨论记录
- [跟单 MVP 规格](./copy-trading-mvp-spec.md) - 跟单功能详细设计
- [部署指南](./deployment-guide.md) - 部署操作手册
- [API 文档](./api/) - OpenAPI 规范

---

> 本文档基于 2025-12-25 架构评审会议的所有决议整理。
>
> 如有问题请联系架构团队。
