# MT5 Middleware SaaS Platform 架构设计

## 1. 业务模型概述

### 1.1 角色定义

| 角色 | 说明 | 示例 |
|------|------|------|
| **Platform** | SaaS平台运营商 | TradeArt |
| **Tenant** | B端客户,券商/经纪商 | 券商A、券商B |
| **Trader** | C端,交易用户 | 券商的客户 |

### 1.2 核心关系

```
┌─────────────────────────────────────────────────────────────────┐
│                    SaaS Platform (TradeArt)                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Platform Admin Console                        │  │
│  │  - 租户管理 (CRUD)                                         │  │
│  │  - 中间件实例管理                                          │  │
│  │  - 全局数据统计                                            │  │
│  │  - 计费/订阅管理                                           │  │
│  │  - 系统监控告警                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Tenant Registry                           ││
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐                 ││
│  │  │ Tenant A│    │ Tenant B│    │ Tenant C│    ...          ││
│  │  │ (券商A) │    │ (券商B) │    │ (券商C) │                 ││
│  │  └────┬────┘    └────┬────┘    └────┬────┘                 ││
│  │       │              │              │                       ││
│  │       │              │              │   一对多关系           ││
│  │       ▼              ▼              ▼   (每个实例属于一个租户)││
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐                 ││
│  │  │Instance1│    │Instance2│    │Instance3│    ...          ││
│  │  │ 中间件  │    │ 中间件  │    │ 中间件  │                 ││
│  │  └────┬────┘    └────┬────┘    └────┬────┘                 ││
│  │       │              │              │                       ││
│  └───────┼──────────────┼──────────────┼───────────────────────┘│
│          │              │              │                        │
└──────────┼──────────────┼──────────────┼────────────────────────┘
           │              │              │
           ▼              ▼              ▼
      ┌─────────┐    ┌─────────┐    ┌─────────┐
      │MT5 Srv A│    │MT5 Srv B│    │MT5 Srv C│   (券商自有)
      └─────────┘    └─────────┘    └─────────┘
```

### 1.3 一对多关系详解

```
Tenant (B端账号)              Middleware Instance (中间件实例)
┌──────────────┐
│ Tenant A     │─────────────▶┌──────────────────────────┐
│ (券商A)      │              │ Instance 1 (Asia)        │
│              │              │ - region: asia           │
│              │              │ - mt5_servers: [...]     │
│              │              └──────────────────────────┘
│              │
│              │─────────────▶┌──────────────────────────┐
│              │              │ Instance 2 (Europe)      │
└──────────────┘              │ - region: europe         │
                              └──────────────────────────┘

┌──────────────┐              ┌──────────────────────────┐
│ Tenant B     │─────────────▶│ Instance 3 (America)     │
│ (券商B)      │              │ - region: america        │
└──────────────┘              │ - mt5_servers: [...]     │
                              └──────────────────────────┘

关系说明:
- 每个租户可以拥有多个中间件实例 (一对多)
- 每个中间件实例只属于一个租户
- 租户可根据订阅计划获得不同数量的实例配额
```

---

## 2. 系统架构

### 2.1 整体架构图

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              用户访问层                                     │
│                                                                            │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐               │
│  │ Platform Admin │  │ Tenant Admin   │  │ Trader App     │               │
│  │ Console        │  │ Console        │  │ (Mobile/Web)   │               │
│  │ (独立部署)     │  │ (独立部署)     │  │ (白标部署)     │               │
│  │                │  │                │  │                │               │
│  │ platform.      │  │ {tenant}.      │  │ app.broker-    │               │
│  │ example.com    │  │ example.com    │  │ {x}.com        │               │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘               │
└──────────┼───────────────────┼───────────────────┼────────────────────────┘
           │                   │                   │
           ▼                   ▼                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                              API Gateway (Kong)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  - 统一认证 (JWT)                                                    │  │
│  │  - 路由分发 (根据租户路由到对应服务)                                  │  │
│  │  - 限流/熔断                                                         │  │
│  │  - 请求日志                                                          │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬──────────────────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│ Platform      │         │ Middleware    │         │ Middleware    │
│ Service       │         │ Instance 1    │         │ Instance N    │
│               │         │               │         │               │
│ ┌───────────┐ │         │ ┌───────────┐ │         │ ┌───────────┐ │
│ │Tenant Mgmt│ │         │ │ MT5       │ │         │ │ MT5       │ │
│ │Instance   │ │         │ │ Manager   │ │         │ │ Manager   │ │
│ │Mgmt       │ │         │ │ Pool      │ │         │ │ Pool      │ │
│ │Billing    │ │         │ ├───────────┤ │         │ ├───────────┤ │
│ │Analytics  │ │         │ │ REST API  │ │         │ │ REST API  │ │
│ └───────────┘ │         │ │ WebSocket │ │         │ │ WebSocket │ │
└───────┬───────┘         └───────┬───────┘         └───────┬───────┘
        │                         │                         │
        │                         ▼                         ▼
        │                   ┌───────────┐             ┌───────────┐
        │                   │ MT5 Server│             │ MT5 Server│
        │                   │ (券商自有) │             │ (券商自有) │
        │                   └───────────┘             └───────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                              数据存储层                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐               │
│  │ PostgreSQL     │  │ Redis          │  │ TimescaleDB    │               │
│  │ (主数据库)     │  │ (缓存/会话)    │  │ (时序数据)     │               │
│  │                │  │                │  │ (可选)         │               │
│  │ - tenants      │  │ - sessions     │  │ - trades       │               │
│  │ - instances    │  │ - quotes       │  │ - candles      │               │
│  │ - users        │  │ - rate_limit   │  │ - metrics      │               │
│  │ - invoices     │  │                │  │                │               │
│  └────────────────┘  └────────────────┘  └────────────────┘               │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 组件职责

#### Platform Admin Console (平台管理前端) - 独立部署
- **部署**: 独立前端应用,域名如 `platform.example.com`
- **用户**: 平台管理员 (Platform Admin)
- **功能**: 租户管理、实例管理、计费管理、全局统计

#### Tenant Admin Console (租户管理前端) - 独立部署
- **部署**: 独立前端应用,支持租户子域名如 `{tenant-code}.example.com`
- **用户**: 租户管理员 (Tenant Admin)
- **功能**: 交易用户管理、交易监控、报表统计、白标配置
- **白标支持**: 可配置Logo、主题色、自定义域名

#### Trader App (交易应用)
- **部署方案**: 券商自有域名 (完全白标)
  - 域名示例: `app.broker-a.com`, `trade.broker-b.com`
  - 每个租户配置独立域名，完全白标化
  - 支持 Mobile App (iOS/Android) 和 Web App
- **认证流程**: MT5 账号直接登录
  - 用户使用 MT5 Login + Password 登录
  - 中间件验证 MT5 凭证有效性
  - 验证通过后签发 JWT Token
- **说明**: 交易用户(C端)使用的移动端/Web端应用

#### Platform Service (平台后端服务)
- **部署**: 独立后端服务
- **职责**:
  - 租户、实例、计费的管理
  - 为 Platform Console 和 Tenant Console 提供 API
  - 实例健康检查和监控

#### API Gateway (API网关)
- **推荐**: Kong (开源版)
- **职责**:
  - 统一入口,路由分发
  - JWT 认证验证
  - 限流/熔断保护
  - 请求日志记录
- **路由规则**:
  - `/api/v1/platform/*` → Platform Service
  - `/api/v1/tenant/*` → Platform Service (租户API)
  - `/api/v1/trading/*` → 对应的 Middleware Instance

#### Middleware Instance (中间件实例)
- **部署**: 每个租户的实例独立部署
- **职责**:
  - 连接 MT5 服务器
  - 提供交易 API (REST + WebSocket)
  - 管理 MT5 Manager 连接池

---

## 3. 数据模型设计

### 3.1 核心实体

```sql
-- ==================== 平台层 ====================

-- 租户表 (B端客户)
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(50) UNIQUE NOT NULL,  -- 租户编码,用于路由
    name            VARCHAR(200) NOT NULL,        -- 公司名称
    display_name    VARCHAR(200),                 -- 显示名称(白标)
    logo_url        VARCHAR(500),                 -- Logo URL(白标)
    primary_color   VARCHAR(20),                  -- 主题色(白标)

    -- 联系信息
    contact_name    VARCHAR(100),
    contact_email   VARCHAR(200),
    contact_phone   VARCHAR(50),

    -- 状态
    status          VARCHAR(20) DEFAULT 'active', -- active/suspended/terminated

    -- 订阅信息
    plan            VARCHAR(50) DEFAULT 'basic',  -- trial/basic/professional/enterprise
    max_instances   INT DEFAULT 1,                -- 最大实例数
    max_admins      INT DEFAULT 3,                -- 最大管理员数
    billing_cycle   VARCHAR(20) DEFAULT 'monthly', -- monthly/quarterly/yearly
    billing_email   VARCHAR(200),

    -- 审计
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ                   -- 订阅过期时间
);

-- 中间件实例表 (一对多: 每个实例属于一个租户)
CREATE TABLE middleware_instances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,  -- 所属租户

    name            VARCHAR(200) NOT NULL,
    description     TEXT,

    -- 连接信息
    host            VARCHAR(500) NOT NULL,        -- 实例主机地址
    port            INT DEFAULT 8080,             -- 端口
    api_key         VARCHAR(200) NOT NULL,        -- API密钥

    -- MT5服务器配置
    mt5_servers     JSONB,                        -- MT5服务器列表配置

    -- 状态
    status          VARCHAR(20) DEFAULT 'offline', -- online/offline/maintenance/error
    last_health_check TIMESTAMPTZ,
    health_data     JSONB,                        -- 最近健康检查数据

    -- 限制
    max_sessions    INT DEFAULT 100,              -- 最大会话数
    max_managers    INT DEFAULT 10,               -- 最大Manager数

    -- 配置
    version         VARCHAR(50),                  -- 中间件版本
    settings        JSONB,                        -- 其他配置

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_instances_tenant ON middleware_instances(tenant_id);

-- 平台管理员表
CREATE TABLE platform_admins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(200) UNIQUE NOT NULL,
    password        VARCHAR(200) NOT NULL,
    name            VARCHAR(100) NOT NULL,

    role            VARCHAR(50) DEFAULT 'admin',  -- super_admin/admin/operator
    is_active       BOOLEAN DEFAULT true,
    last_login      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 租户管理员表 (B端用户)
CREATE TABLE tenant_admins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    email           VARCHAR(200) NOT NULL,
    password        VARCHAR(200) NOT NULL,
    name            VARCHAR(100) NOT NULL,

    role            VARCHAR(50) DEFAULT 'admin',  -- owner/admin/operator
    is_active       BOOLEAN DEFAULT true,
    last_login      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, email)
);

-- ==================== 计费相关 ====================

-- 账单表
CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_no      VARCHAR(50) UNIQUE NOT NULL,  -- 账单编号

    amount          DECIMAL(10,2) NOT NULL,
    currency        VARCHAR(10) DEFAULT 'USD',

    -- 账单周期
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    due_date        DATE NOT NULL,

    -- 状态
    status          VARCHAR(20) DEFAULT 'pending', -- pending/paid/overdue/cancelled/refunded
    paid_at         TIMESTAMPTZ,

    -- 明细
    items           JSONB,                        -- 账单明细项
    notes           TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- API密钥表 (租户级别)
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    name            VARCHAR(100) NOT NULL,        -- 密钥名称
    key             VARCHAR(200) UNIQUE NOT NULL, -- 密钥值
    hashed_key      VARCHAR(200) NOT NULL,        -- 哈希后的密钥

    permissions     JSONB,                        -- 权限列表
    rate_limit      INT DEFAULT 1000,             -- 每分钟请求限制

    is_active       BOOLEAN DEFAULT true,
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 系统设置表
CREATE TABLE system_settings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key             VARCHAR(100) UNIQUE NOT NULL,
    value           JSONB NOT NULL,
    category        VARCHAR(50) DEFAULT 'general',
    description     TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== 实例层 (每个中间件实例内) ====================

-- 交易用户表 (需要添加tenant_id用于数据隔离)
-- ALTER TABLE trading_users ADD COLUMN tenant_id UUID;
-- CREATE INDEX idx_trading_users_tenant ON trading_users(tenant_id);

-- 交易记录表 (需要添加tenant_id用于数据隔离)
-- ALTER TABLE trades ADD COLUMN tenant_id UUID;
-- CREATE INDEX idx_trades_tenant ON trades(tenant_id);
```

### 3.2 数据隔离策略

```
┌─────────────────────────────────────────────────────────────────┐
│                         数据访问控制                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Platform Admin                                                 │
│  └─▶ 可访问所有数据                                              │
│      SELECT * FROM trades; -- 全量                              │
│                                                                 │
│  Tenant Admin (tenant_id = 'A')                                 │
│  └─▶ 只能访问自己租户的数据                                       │
│      SELECT * FROM trades WHERE tenant_id = 'A';                │
│                                                                 │
│  Trader (tenant_id = 'A', login = 12345)                        │
│  └─▶ 只能访问自己的数据                                          │
│      SELECT * FROM trades WHERE tenant_id = 'A' AND login = 12345;│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

实现方式:
1. 所有业务表添加 tenant_id 字段
2. API层根据JWT中的tenant_id自动过滤
3. 使用PostgreSQL Row Level Security (RLS) 作为额外保障
```

---

## 4. 功能模块设计

### 4.1 Platform Admin Console (平台管理后台)

#### 4.1.1 租户管理
```
功能列表:
├── 租户列表
│   ├── 搜索/筛选 (状态、订阅计划、创建时间)
│   ├── 批量操作 (启用/禁用)
│   └── 导出
│
├── 租户详情
│   ├── 基本信息编辑
│   ├── 白标配置 (Logo、颜色、显示名称)
│   ├── 关联的中间件实例
│   ├── 管理员账号列表
│   ├── 订阅信息
│   └── 操作日志
│
├── 创建租户
│   ├── 基本信息
│   ├── 选择订阅计划
│   ├── 分配中间件实例
│   └── 创建初始管理员账号
│
└── 租户操作
    ├── 暂停服务
    ├── 恢复服务
    ├── 终止合作
    └── 重置管理员密码
```

#### 4.1.2 中间件实例管理
```
功能列表:
├── 实例列表
│   ├── 健康状态监控 (绿/黄/红)
│   ├── 负载指标 (连接数、QPS、CPU、内存)
│   └── 关联租户数量
│
├── 实例详情
│   ├── 基本信息
│   ├── MT5服务器配置
│   ├── 关联的租户列表
│   ├── 性能指标图表
│   └── 日志查看
│
├── 实例操作
│   ├── 启动/停止/重启
│   ├── 配置更新
│   ├── 扩容/缩容
│   └── 日志下载
│
└── 部署新实例
    ├── 选择区域
    ├── 配置参数
    └── 一键部署 (Docker/K8s)
```

#### 4.1.3 全局数据统计
```
功能列表:
├── 总览Dashboard
│   ├── 总租户数 / 活跃租户数
│   ├── 总实例数 / 在线实例数
│   ├── 总交易用户数
│   ├── 今日交易量 / 交易额
│   └── 系统告警
│
├── 交易数据分析
│   ├── 全平台交易趋势
│   ├── 各租户交易对比
│   ├── 品种分布
│   ├── 交易时段分布
│   └── 数据导出
│
├── 用户增长分析
│   ├── 新增用户趋势
│   ├── 活跃用户趋势
│   └── 各租户用户分布
│
└── 收入分析
    ├── 订阅收入趋势
    ├── 各计划收入占比
    └── 续费率统计
```

#### 4.1.4 计费管理

**计费模式: 按租户按月收费**

```
计费规则:
├── 计费周期: 月付 (支持季付/年付可选)
├── 计费对象: 租户 (Tenant)
├── 计费依据: 订阅计划 (Plan)
└── 账单生成: 每月1日自动生成上月账单

订阅计划示例:
┌─────────────┬─────────────┬─────────────┬─────────────┐
│   Trial     │   Basic     │ Professional│ Enterprise  │
├─────────────┼─────────────┼─────────────┼─────────────┤
│ 免费14天    │ $X/月       │ $XX/月      │ 定制报价    │
│ 1个实例     │ 1个实例     │ 3个实例     │ 不限实例    │
│ 2个MT5服务器│ 2个MT5服务器│ 5个MT5服务器│ 不限服务器  │
│ 100交易用户 │ 500交易用户 │ 2000交易用户│ 不限用户    │
│ 3个管理员   │ 5个管理员   │ 10个管理员  │ 不限管理员  │
│ 基础支持    │ 邮件支持    │ 优先支持    │ 专属支持    │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

```
功能列表:
├── 订阅计划管理
│   ├── 计划列表 (Trial/Basic/Professional/Enterprise)
│   ├── 创建/编辑计划
│   ├── 定价调整
│   └── 功能配额设置 (实例数/用户数/管理员数)
│
├── 账单管理
│   ├── 账单列表
│   ├── 账单详情
│   ├── 自动生成月账单
│   ├── 手动生成账单
│   └── 标记已付款
│
├── 租户订阅
│   ├── 查看租户当前计划
│   ├── 升级/降级计划
│   ├── 续费操作
│   └── 取消订阅
│
└── 收款记录
    ├── 支付记录列表
    └── 退款处理
```

#### 4.1.5 系统监控
```
功能列表:
├── 实时监控
│   ├── 各实例健康状态
│   ├── API响应时间
│   ├── 错误率
│   └── 连接数
│
├── 告警管理
│   ├── 告警规则配置
│   ├── 告警历史
│   ├── 通知渠道 (邮件/短信/Webhook)
│   └── 值班表
│
└── 审计日志
    ├── 管理员操作日志
    ├── 租户操作日志
    └── 系统事件日志
```

### 4.2 Tenant Admin Console (租户管理后台)

#### 4.2.1 Dashboard
```
功能列表:
├── 概览
│   ├── 交易用户总数 / 今日活跃
│   ├── 今日交易量 / 交易额
│   ├── 持仓总览
│   └── 系统状态
│
├── 快捷操作
│   ├── 查看实时报价
│   ├── 用户快速搜索
│   └── 最近交易
│
└── 公告/通知
    └── 平台公告、维护通知
```

#### 4.2.2 交易用户管理
```
功能列表:
├── 用户列表
│   ├── 搜索 (Login/姓名/邮箱)
│   ├── 筛选 (状态/组别/余额范围)
│   ├── 排序
│   └── 导出
│
├── 用户详情
│   ├── 基本信息
│   ├── 账户余额/净值/保证金
│   ├── 持仓列表
│   ├── 交易历史
│   ├── 出入金记录
│   └── 操作日志
│
└── 用户操作
    ├── 修改组别
    ├── 调整杠杆
    ├── 信用额度管理
    └── 禁用/启用
```

#### 4.2.3 交易监控
```
功能列表:
├── 实时持仓
│   ├── 全部持仓列表
│   ├── 按用户分组
│   ├── 按品种分组
│   ├── 盈亏统计
│   └── 风险预警
│
├── 实时报价
│   ├── 自选品种
│   ├── 报价推送
│   └── 点差监控
│
├── 交易历史
│   ├── 历史订单查询
│   ├── 统计分析
│   └── 导出报表
│
└── 风控监控
    ├── 大额交易预警
    ├── 异常交易检测
    └── 保证金预警
```

#### 4.2.4 报表统计
```
功能列表:
├── 交易报表
│   ├── 日/周/月报表
│   ├── 交易量统计
│   ├── 盈亏分析
│   └── 品种分析
│
├── 用户报表
│   ├── 新增用户统计
│   ├── 活跃用户分析
│   ├── 用户留存率
│   └── 用户价值分析
│
└── 财务报表
    ├── 出入金统计
    ├── 手续费收入
    └── 对账报表
```

#### 4.2.5 系统配置
```
功能列表:
├── 品牌设置 (白标)
│   ├── Logo上传
│   ├── 主题色配置
│   ├── 显示名称
│   └── 联系信息
│
├── 管理员管理
│   ├── 管理员列表
│   ├── 添加/编辑管理员
│   ├── 权限分配
│   └── 操作日志
│
├── MT5服务器
│   ├── 服务器列表 (只读)
│   ├── 连接状态
│   └── 请求添加/移除 (需平台审批)
│
└── 通知设置
    ├── 告警接收人
    └── 通知方式
```

---

## 5. API设计

### 5.1 API结构

```
/api/v1/
├── platform/                    # 平台管理API (Platform Admin用)
│   ├── tenants/                 # 租户管理
│   ├── instances/               # 实例管理
│   ├── subscriptions/           # 订阅管理
│   ├── invoices/                # 账单管理
│   ├── analytics/               # 全局统计
│   └── system/                  # 系统管理
│
├── tenant/                      # 租户管理API (Tenant Admin用)
│   ├── profile/                 # 租户信息
│   ├── admins/                  # 管理员管理
│   ├── users/                   # 交易用户管理
│   ├── trades/                  # 交易查询
│   ├── positions/               # 持仓查询
│   ├── reports/                 # 报表
│   └── settings/                # 设置
│
└── trading/                     # 交易API (Trader用,现有API)
    ├── auth/
    ├── accounts/
    ├── symbols/
    ├── quotes/
    ├── orders/
    └── positions/
```

### 5.2 认证与路由

```
┌─────────────────────────────────────────────────────────────────┐
│                         JWT Token 结构                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Platform Admin Token:                                          │
│  {                                                              │
│    "sub": "platform_admin_id",                                  │
│    "type": "platform_admin",                                    │
│    "role": "super_admin",                                       │
│    "permissions": ["*"]                                         │
│  }                                                              │
│                                                                 │
│  Tenant Admin Token:                                            │
│  {                                                              │
│    "sub": "tenant_admin_id",                                    │
│    "type": "tenant_admin",                                      │
│    "tenant_id": "tenant_uuid",                                  │
│    "tenant_code": "broker_a",                                   │
│    "role": "admin",                                             │
│    "allowed_instances": ["instance_1", "instance_2"],           │
│    "permissions": ["users.read", "trades.read", ...]            │
│  }                                                              │
│                                                                 │
│  Trader Token: (MT5直接登录,中间件签发)                          │
│  {                                                              │
│    "sub": "10007",              // MT5 Login                    │
│    "type": "trader",                                            │
│    "tenant_id": "tenant_uuid",                                  │
│    "instance_id": "instance_uuid",                              │
│    "session_id": "session_uuid",                                │
│    "mt5_server": "demo.broker.com:443",                         │
│    "role": "USER"               // USER or MANAGER              │
│  }                                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

路由策略:
1. 根据JWT type决定访问哪套API
2. 根据tenant_id进行数据过滤
3. 交易请求根据instance_id路由到对应中间件
```

### 5.3 Trader App 认证流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Trader App 认证流程                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. 用户访问 Trader App                                                      │
│     └─▶ 通过券商自有域名访问 (如 app.broker-a.com)                            │
│                                                                             │
│  2. 用户输入登录凭证                                                         │
│     ┌─────────────────┐                                                     │
│     │ MT5 Login: 10007│                                                     │
│     │ Password: ****  │                                                     │
│     │ Server: (可选)  │  ← 如果租户有多个MT5服务器,需要选择                    │
│     └─────────────────┘                                                     │
│                                                                             │
│  3. 认证请求流程                                                             │
│                                                                             │
│     Trader App                     API Gateway                Middleware    │
│         │                              │                          │         │
│         │  POST /api/v1/trading/auth   │                          │         │
│         │  {login, password, server?}  │                          │         │
│         │─────────────────────────────▶│                          │         │
│         │                              │   路由到对应中间件实例    │         │
│         │                              │─────────────────────────▶│         │
│         │                              │                          │         │
│         │                              │     MT5 Server           │         │
│         │                              │        │                 │         │
│         │                              │        │ 验证MT5凭证     │         │
│         │                              │        │◀───────────────│         │
│         │                              │        │ 返回验证结果    │         │
│         │                              │        │───────────────▶│         │
│         │                              │                          │         │
│         │                              │   验证成功,签发JWT       │         │
│         │                              │◀─────────────────────────│         │
│         │   返回JWT Token              │                          │         │
│         │◀─────────────────────────────│                          │         │
│         │                              │                          │         │
│                                                                             │
│  4. Token使用                                                                │
│     └─▶ 后续所有API请求携带 Authorization: Bearer {token}                    │
│     └─▶ Token过期后需重新使用MT5凭证登录                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

认证API:
POST /api/v1/trading/auth/login
Request:
{
  "login": 10007,           // MT5 Login (必填)
  "password": "********",   // MT5 Password (必填)
  "server": "demo:443"      // MT5 Server (可选,租户单服务器时可省略)
}

Response (成功):
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 86400,
    "user": {
      "login": 10007,
      "name": "John Doe",
      "group": "demo\\retail",
      "leverage": 100,
      "balance": 10000.00,
      "currency": "USD"
    }
  }
}

Response (失败):
{
  "success": false,
  "error": {
    "code": "AUTH_401_002",
    "message": "MT5登录失败: 用户名或密码错误"
  }
}

安全考虑:
- 密码不在任何地方存储,每次直接向MT5服务器验证
- JWT Token有效期默认24小时,可按租户配置
- 支持refresh token机制延长会话(可选)
- 登录失败次数限制,防止暴力破解
- 所有通信使用HTTPS加密
```

---

## 6. 部署架构

### 6.1 推荐部署方案

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Kubernetes Cluster                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Ingress Controller                            │   │
│  │  - SSL终止                                                           │   │
│  │  - 路由: platform.yourdomain.com → Platform Service                 │   │
│  │  - 路由: *.tenant.yourdomain.com → API Gateway                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│         ┌────────────────────────────┼────────────────────────────┐        │
│         │                            │                            │        │
│         ▼                            ▼                            ▼        │
│  ┌─────────────┐            ┌─────────────┐            ┌─────────────┐    │
│  │  Platform   │            │ API Gateway │            │   Tenant    │    │
│  │  Service    │            │  (Kong)     │            │   Console   │    │
│  │  (2 pods)   │            │  (2 pods)   │            │   (2 pods)  │    │
│  └─────────────┘            └──────┬──────┘            └─────────────┘    │
│                                    │                                       │
│                    ┌───────────────┼───────────────┐                      │
│                    │               │               │                      │
│                    ▼               ▼               ▼                      │
│             ┌───────────┐   ┌───────────┐   ┌───────────┐                │
│             │Middleware │   │Middleware │   │Middleware │                │
│             │Instance 1 │   │Instance 2 │   │Instance 3 │                │
│             │(Asia)     │   │(Europe)   │   │(America)  │                │
│             │ 2 pods    │   │ 2 pods    │   │ 2 pods    │                │
│             └───────────┘   └───────────┘   └───────────┘                │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                         Data Layer                                   │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │ │
│  │  │ PostgreSQL  │  │   Redis     │  │ TimescaleDB │                  │ │
│  │  │  (HA)       │  │  Cluster    │  │  (HA)       │                  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### 6.2 域名规划

```
域名结构:
├── platform.tradetech.com          # 平台管理后台 (Platform Admin)
├── api.tradetech.com               # API Gateway (统一API入口)
│
├── Tenant Admin Console (租户管理后台)
│   ├── brokera.tenant.tradetech.com    # 租户A的管理后台 (平台子域名)
│   ├── brokerb.tenant.tradetech.com    # 租户B的管理后台
│   └── 自定义域名支持:
│       ├── admin.brokera.com           # 租户A自己的域名 (白标)
│       └── admin.brokerb.com           # 租户B自己的域名
│
└── Trader App (交易应用) - 券商自有域名 (完全白标)
    ├── app.brokera.com             # 租户A的交易App
    ├── trade.brokerb.com           # 租户B的交易App
    └── mobile.brokerc.com          # 租户C的交易App
    注: Trader App 仅支持券商自有域名,不提供平台统一入口
```

---

## 7. 实施路线图

### Phase 1: 基础平台 (4-6周)
```
目标: 搭建基础的多租户平台

任务:
□ Platform Management Service 开发
  □ 租户CRUD API
  □ 实例管理API
  □ 基础认证系统

□ 数据库改造
  □ 添加平台层表
  □ 现有表添加tenant_id
  □ 数据迁移脚本

□ 中间件改造
  □ 支持tenant_id
  □ API Gateway集成

□ Platform Admin Console (基础版)
  □ 租户管理
  □ 实例管理
  □ 登录认证

交付物:
- 可运行的平台管理后台
- 支持多租户的中间件
- 部署文档
```

### Phase 2: 租户后台 (3-4周)
```
目标: 完成租户管理后台

任务:
□ Tenant Admin Console 开发
  □ Dashboard
  □ 用户管理
  □ 交易查询
  □ 基础报表

□ 白标功能
  □ Logo/颜色配置
  □ 自定义域名支持

□ 权限系统
  □ 角色定义
  □ 权限分配
  □ 访问控制

交付物:
- 完整的租户管理后台
- 白标配置功能
```

### Phase 3: 计费与运营 (2-3周)
```
目标: 完善商业化功能

任务:
□ 计费系统
  □ 订阅计划管理
  □ 账单生成
  □ 支付集成 (可选)

□ 监控告警
  □ 健康检查
  □ 告警规则
  □ 通知系统

□ 运营工具
  □ 全局统计
  □ 审计日志
  □ 数据导出

交付物:
- 完整的计费系统
- 监控告警系统
```

### Phase 4: 优化与扩展 (持续)
```
目标: 持续优化和功能扩展

任务:
□ 性能优化
□ 安全加固
□ 高可用改进
□ 新功能开发
```

---

## 8. 关键技术决策

### 8.1 是否需要API Gateway?

**建议: 需要**

理由:
1. 统一入口,简化客户端
2. 租户路由,根据domain/header路由到对应实例
3. 统一认证,一处验证JWT
4. 限流熔断,保护后端服务
5. 请求日志,便于审计

推荐: Kong (开源版即可满足需求)

### 8.2 中间件实例如何管理?

**建议: Kubernetes + Helm**

```yaml
# 每个中间件实例一个Helm Release
helm install middleware-asia ./mt5-middleware \
  --set instance.code=asia \
  --set instance.region=asia \
  --set database.host=postgresql \
  --set redis.host=redis
```

好处:
1. 声明式配置
2. 一键部署/升级/回滚
3. 自动扩缩容
4. 健康检查与自愈

### 8.3 数据如何隔离?

**建议: 逻辑隔离 + RLS**

```sql
-- 启用Row Level Security
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

-- 创建策略
CREATE POLICY tenant_isolation ON trades
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

好处:
1. 简单高效
2. 统一管理
3. 灵活查询(平台级别可跨租户)
4. 成本低(共用数据库)

---

## 9. 技术规范

### 9.1 错误码规范

#### 错误码格式

```
错误码格式: [模块代码][错误类型][序号]
示例: AUTH_401_001

模块代码:
- AUTH: 认证模块
- TENANT: 租户模块
- INSTANCE: 实例模块
- BILLING: 计费模块
- SYSTEM: 系统模块

错误类型 (HTTP状态码):
- 400: 请求参数错误
- 401: 未认证
- 403: 无权限
- 404: 资源不存在
- 409: 资源冲突
- 422: 业务逻辑错误
- 500: 服务器内部错误
```

#### 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "TENANT_404_001",
    "message": "租户不存在",
    "details": {
      "tenantId": "xxx-xxx-xxx"
    },
    "timestamp": "2025-01-01T00:00:00Z",
    "traceId": "trace-xxx-xxx"
  }
}
```

#### 常用错误码列表

| 错误码 | HTTP状态 | 描述 |
|--------|----------|------|
| AUTH_401_001 | 401 | Token无效或已过期 |
| AUTH_401_002 | 401 | 用户名或密码错误 |
| AUTH_403_001 | 403 | 无权访问此资源 |
| AUTH_403_002 | 403 | 账号已被禁用 |
| TENANT_404_001 | 404 | 租户不存在 |
| TENANT_409_001 | 409 | 租户编码已存在 |
| TENANT_422_001 | 422 | 租户已过期,请续费 |
| TENANT_422_002 | 422 | 已达到最大实例数限制 |
| INSTANCE_404_001 | 404 | 实例不存在 |
| INSTANCE_422_001 | 422 | 实例健康检查失败 |
| INSTANCE_422_002 | 422 | 实例配置无效 |
| BILLING_404_001 | 404 | 账单不存在 |
| BILLING_422_001 | 422 | 账单已支付,无法取消 |
| SYSTEM_500_001 | 500 | 数据库连接失败 |
| SYSTEM_500_002 | 500 | 外部服务调用失败 |

### 9.2 API版本策略

#### 版本格式

```
URL路径版本: /api/v1/tenants
Header版本: X-API-Version: 2025-01-01 (可选,用于小版本更新)
```

#### 版本生命周期

| 阶段 | 状态 | 说明 |
|------|------|------|
| Current | 活跃 | 当前推荐版本,持续维护 |
| Deprecated | 废弃 | 仍可用,但建议迁移,响应头包含警告 |
| Sunset | 下线 | 不再可用,返回410 Gone |

#### 版本升级规则

```
主版本升级 (v1 → v2):
- 重大API变更,不向后兼容
- 至少提前6个月通知
- 旧版本至少保持12个月可用

次版本升级 (通过Header区分):
- 向后兼容的功能增强
- 新增字段使用可选参数
- 废弃字段标记deprecated但保留
```

#### 废弃响应示例

```http
HTTP/1.1 200 OK
Deprecation: true
Sunset: Sat, 01 Jan 2026 00:00:00 GMT
Link: </api/v2/tenants>; rel="successor-version"
X-Deprecation-Notice: This endpoint is deprecated. Please migrate to /api/v2/tenants
```

### 9.3 数据备份与恢复

#### 备份策略

```
┌─────────────────────────────────────────────────────────────────┐
│                         备份架构                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PostgreSQL 备份:                                               │
│  ├── 全量备份: 每日凌晨2点 (pg_dump)                            │
│  ├── 增量备份: 每小时WAL归档                                    │
│  ├── 保留策略: 日备份7天, 周备份4周, 月备份12个月                │
│  └── 存储位置: 云对象存储 (跨区域复制)                          │
│                                                                 │
│  Redis 备份:                                                    │
│  ├── RDB快照: 每6小时                                           │
│  ├── AOF持久化: 每秒同步                                        │
│  └── 保留策略: 最近7天                                          │
│                                                                 │
│  应用配置备份:                                                   │
│  ├── 配置文件: Git版本控制                                      │
│  ├── 密钥/证书: 加密存储 + 版本管理                             │
│  └── 环境变量: Vault或云密钥服务                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 恢复流程

```
灾难恢复等级:

Level 1 - 单表/单租户恢复 (RTO: 30分钟)
├── 场景: 误删数据、数据损坏
├── 方法: 从备份恢复指定表/数据
└── 步骤: 定位备份 → 提取数据 → 恢复到临时表 → 验证 → 合并

Level 2 - 单实例恢复 (RTO: 2小时)
├── 场景: 数据库实例故障
├── 方法: 启动备份实例或从备份恢复
└── 步骤: 切换到备实例 → 恢复增量数据 → 验证完整性 → 切换流量

Level 3 - 全站恢复 (RTO: 8小时)
├── 场景: 数据中心故障、严重安全事件
├── 方法: 灾备站点接管
└── 步骤: 激活灾备 → 恢复数据 → DNS切换 → 服务验证

RTO: Recovery Time Objective (恢复时间目标)
RPO: Recovery Point Objective (恢复点目标) = 最近1小时
```

#### 备份验证

```bash
# 每周自动验证备份可用性
# 恢复到测试环境并执行完整性检查

验证项目:
□ 备份文件完整性 (校验和)
□ 可成功恢复到测试环境
□ 数据一致性检查 (行数、关键数据)
□ 应用层验证 (API健康检查)
```

---

## 10. 中间件集中管理架构

### 10.1 架构概述

在 SaaS 模式下，中间件实例由平台统一管理和分配。租户无法直接管理中间件实例，而是通过平台管理员进行配置。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Platform Service                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    中间件管理模块                                     │    │
│  │  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │    │
│  │  │ Middleware  │  │ Middleware      │  │ Middleware Config       │  │    │
│  │  │ Service     │  │ Assignment      │  │ Service (Internal API)  │  │    │
│  │  │             │  │ Service         │  │                         │  │    │
│  │  │ - CRUD      │  │                 │  │ - 配置拉取              │  │    │
│  │  │ - API Key   │  │ - 分配租户      │  │ - 心跳上报              │  │    │
│  │  │ - 健康检查  │  │ - 取消分配      │  │ - 健康检查              │  │    │
│  │  │             │  │ - 容量管理      │  │                         │  │    │
│  │  └──────┬──────┘  └────────┬────────┘  └───────────┬─────────────┘  │    │
│  │         │                  │                       │                │    │
│  └─────────┼──────────────────┼───────────────────────┼────────────────┘    │
│            │                  │                       │                     │
│            ▼                  ▼                       ▼                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      PostgreSQL                                      │    │
│  │  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │    │
│  │  │ Middleware  │  │ Middleware      │  │ MtServer                │  │    │
│  │  │             │  │ Assignment      │  │                         │  │    │
│  │  │ - id        │  │                 │  │ - tenantId              │  │    │
│  │  │ - name      │  │ - middlewareId  │  │ - serverId              │  │    │
│  │  │ - url       │  │ - tenantId      │  │ - serverAddress         │  │    │
│  │  │ - apiKey    │  │ - assignedAt    │  │ - managerPassword (加密)│  │    │
│  │  │ - status    │  │ - assignedBy    │  │ - configVersion         │  │    │
│  │  │ - maxTenants│  │                 │  │                         │  │    │
│  │  └─────────────┘  └─────────────────┘  └─────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ API Key 认证
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Middleware Instances                                  │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Middleware A   │  │  Middleware B   │  │  Middleware C   │             │
│  │  (SHARED)       │  │  (SHARED)       │  │  (DEDICATED)    │             │
│  │                 │  │                 │  │                 │             │
│  │  租户: A, B, C  │  │  租户: D, E     │  │  租户: F (独占) │             │
│  │  容量: 3/10     │  │  容量: 2/10     │  │  容量: 1/1      │             │
│  │                 │  │                 │  │                 │             │
│  │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │             │
│  │  │ 定期心跳  │──┼──┼──│ 定期心跳  │──┼──┼──│ 定期心跳  │──┼────────────▶│
│  │  └───────────┘  │  │  └───────────┘  │  │  └───────────┘  │   Platform  │
│  │                 │  │                 │  │                 │   Service   │
│  │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │             │
│  │  │ 拉取配置  │◀─┼──┼──│ 拉取配置  │◀─┼──┼──│ 拉取配置  │◀─┼────────────│
│  │  └───────────┘  │  │  └───────────┘  │  │  └───────────┘  │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 核心数据模型

#### Middleware 表
```sql
CREATE TABLE middlewares (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    url             VARCHAR(500) UNIQUE NOT NULL,

    -- API Key 认证
    api_key         VARCHAR(200) NOT NULL,       -- 仅创建时返回
    api_key_hash    VARCHAR(200) NOT NULL,       -- 用于验证

    -- 分配模式
    assignment_mode  VARCHAR(20) DEFAULT 'SHARED', -- SHARED / DEDICATED
    max_tenants     INT DEFAULT 10,

    -- 健康状态
    status          VARCHAR(20) DEFAULT 'UNKNOWN', -- ONLINE / OFFLINE / DEGRADED / ERROR / UNKNOWN
    last_heartbeat  TIMESTAMPTZ,
    server_ip       VARCHAR(50),
    active_sessions INT DEFAULT 0,
    memory_usage    DECIMAL(5,2),                 -- 百分比
    cpu_usage       DECIMAL(5,2),                 -- 百分比
    cache_status    JSONB,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### MiddlewareAssignment 表
```sql
CREATE TABLE middleware_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    middleware_id   UUID NOT NULL REFERENCES middlewares(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    assigned_at     TIMESTAMPTZ DEFAULT NOW(),
    assigned_by     UUID NOT NULL,
    notes           TEXT,

    UNIQUE(middleware_id, tenant_id)
);
```

### 10.3 分配模式

| 模式 | 说明 | 使用场景 |
|------|------|----------|
| **SHARED** | 共享模式，多个租户共用一个中间件实例 | 小型租户，成本敏感 |
| **DEDICATED** | 独占模式，一个租户独占一个中间件实例 | 大型租户，性能要求高 |

#### 分配规则
1. **SHARED 模式**：检查当前租户数是否小于 `maxTenants`
2. **DEDICATED 模式**：检查是否已有租户分配
3. **租户限制**：租户必须已配置 MT 服务器才能分配中间件
4. **重复检查**：同一租户不能重复分配到同一中间件

### 10.4 服务间通信

#### API Key 认证流程
```
┌─────────────┐                    ┌─────────────────┐
│  Middleware │                    │ Platform Service│
│  Instance   │                    │                 │
└──────┬──────┘                    └────────┬────────┘
       │                                    │
       │  GET /internal/middleware/config   │
       │  X-Middleware-API-Key: mw_xxx      │
       │────────────────────────────────────▶
       │                                    │
       │            ┌───────────────────────┤
       │            │ 1. 提取 API Key       │
       │            │ 2. 计算 Hash          │
       │            │ 3. 查询数据库匹配     │
       │            │ 4. 验证通过           │
       │            └───────────────────────┤
       │                                    │
       │  200 OK                            │
       │  { tenants: [...], mtServers: [...]}
       │◀────────────────────────────────────
       │                                    │
```

#### 配置拉取响应结构
```json
{
  "middlewareId": "mw-001",
  "middlewareName": "Middleware-01",
  "configVersion": 5,
  "configUpdatedAt": "2025-12-09T10:00:00Z",
  "tenants": [
    {
      "tenantId": "tenant-001",
      "tenantCode": "DEMO",
      "tenantName": "Demo Tenant",
      "mtServers": [
        {
          "serverId": "mt5-demo-01",
          "platformType": "MT5",
          "serverAddress": "mt5.demo.com:443",
          "managerLogin": "1000",
          "managerPassword": "解密后的密码",
          "isDefault": true,
          "configVersion": 3
        }
      ]
    }
  ]
}
```

#### 心跳上报
中间件定期（默认30秒）向平台上报运行状态：

```json
{
  "serverIp": "192.168.1.100",
  "activeSessions": 25,
  "memoryUsage": 65.5,
  "cpuUsage": 30.2,
  "cacheStatus": {
    "redisConnected": true,
    "hitRate": 0.95,
    "totalKeys": 1500
  },
  "status": "healthy"
}
```

### 10.5 健康状态管理

#### 状态定义
| 状态 | 说明 | 触发条件 |
|------|------|----------|
| ONLINE | 正常运行 | 心跳正常，健康检查通过 |
| OFFLINE | 离线 | 超过3次心跳未收到 |
| DEGRADED | 降级 | CPU > 90% 或 内存 > 90% |
| ERROR | 错误 | 健康检查失败 |
| UNKNOWN | 未知 | 初始状态，尚未收到心跳 |

#### 状态转换
```
                    ┌─────────┐
                    │ UNKNOWN │
                    └────┬────┘
                         │ 收到首次心跳
                         ▼
┌─────────┐        ┌─────────┐        ┌─────────┐
│ OFFLINE │◀──────▶│  ONLINE │◀──────▶│DEGRADED │
└─────────┘        └────┬────┘        └─────────┘
     ▲                  │                  ▲
     │                  │                  │
     │                  ▼                  │
     │             ┌─────────┐             │
     └─────────────│  ERROR  │─────────────┘
                   └─────────┘
```

### 10.6 安全考虑

1. **API Key 安全**
   - API Key 使用 SHA-256 哈希存储
   - 明文 Key 仅在创建时返回一次
   - 支持重新生成 Key（旧 Key 立即失效）

2. **密码加密**
   - MT 服务器管理员密码使用 AES-256-GCM 加密存储
   - 仅在服务间 API 中解密返回
   - 加密密钥通过环境变量管理

3. **网络隔离**
   - 内部 API (`/internal/*`) 建议仅允许内网访问
   - 使用 API Key + IP 白名单双重认证

4. **审计日志**
   - 所有管理操作记录到审计日志
   - 包含操作人、时间、操作内容

---

## 11. 风险与建议

### 10.1 潜在风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 租户数据泄露 | 高 | RLS + API层双重校验 + 审计日志 |
| 单实例故障影响多租户 | 高 | 实例隔离部署 + 健康检查 + 自动切换 |
| 性能瓶颈 | 中 | 监控预警 + 水平扩展 + 缓存优化 |
| 计费争议 | 中 | 详细的使用日志 + 清晰的计费规则 |

### 10.2 建议

1. **先MVP再迭代**: 不要一开始就追求完美,先上线核心功能
2. **数据安全优先**: 租户隔离是SaaS的生命线
3. **监控先行**: 在问题发生前发现问题
4. **文档完善**: API文档、部署文档、操作手册

---

## 10. 下一步行动

1. **确认本方案**: 是否有需要调整的地方?
2. **技术选型确认**: API Gateway、部署方式等
3. **详细排期**: 根据团队情况制定具体计划
4. **开始Phase 1开发**

---

*文档版本: 1.2*
*创建时间: 2025-11-30*
*更新时间: 2025-12-01*

**更新日志**:
- v1.2 (2025-12-01):
  - 确定 Trader App 认证流程: MT5 账号直接登录
  - 确定 Trader App 部署方案: 券商自有域名 (完全白标)
  - 新增 Section 5.3 Trader App 认证流程详细说明
  - 更新架构图和域名规划
- v1.1 (2025-12-01):
  - 更新租户-实例关系为一对多模型
  - 明确 Tenant Console 独立部署方案
  - 补充错误码规范、API版本策略、数据备份恢复章节
  - 更新计费模式说明 (按租户按月收费)
