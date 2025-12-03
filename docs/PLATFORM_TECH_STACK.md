# Platform Service 技术栈与项目结构

## 1. 技术选型确认

### 1.1 后端技术栈

| 组件 | 选型 | 版本 | 说明 |
|------|------|------|------|
| 运行时 | Node.js | 20 LTS | 长期支持版本 |
| 框架 | NestJS | 10.x | 企业级Node框架 |
| 语言 | TypeScript | 5.3+ | 类型安全 |
| ORM | Prisma | 5.x | 现代ORM,类型安全 |
| 数据库 | PostgreSQL | 15+ | 主数据库 |
| 缓存 | Redis | 7.x | 会话/缓存 |
| 认证 | Passport + JWT | - | 身份验证 |
| 文档 | Swagger/OpenAPI | - | API文档自动生成 |
| 验证 | class-validator | - | DTO验证 |
| 日志 | Pino | - | 高性能日志 |

### 1.2 前端技术栈

| 组件 | 选型 | 说明 |
|------|------|------|
| 框架 | Vue 3.4+ | Composition API |
| 语言 | TypeScript | 类型安全 |
| UI组件库 | Arco Design Vue | 字节跳动出品 |
| 构建工具 | Vite 5 | 快速构建 |
| 状态管理 | Pinia | Vue官方推荐 |
| 路由 | Vue Router 4 | - |
| HTTP | Axios | 请求库 |
| 图表 | ECharts | 数据可视化 |

### 1.3 基础设施

| 组件 | 选型 | 说明 |
|------|------|------|
| API Gateway | Kong | 路由/限流/认证 |
| 容器 | Docker | 容器化部署 |
| 编排 | Docker Compose / K8s | 开发/生产 |
| CI/CD | GitHub Actions | 自动化部署 |
| 监控 | Prometheus + Grafana | 可选 |

---

## 2. 项目结构

### 2.1 Monorepo 结构

```
mt5-platform/
├── apps/
│   ├── platform-service/      # Platform 后端服务 (NestJS)
│   ├── platform-console/      # Platform 管理前端 (Vue 3)
│   ├── tenant-console/        # Tenant 管理前端 (Vue 3) - 独立部署
│   └── tenant-service/        # Tenant 后端服务 (可选,可合并到platform-service)
│
├── packages/
│   └── shared/                # 共享代码 (类型定义、工具函数)
│
├── docker-compose.yml         # 本地开发环境
├── docs/                      # 文档
├── package.json               # Workspace根配置
└── README.md
```

**说明**:
- `platform-service`: 平台后端,提供租户管理、实例管理、计费等API
- `platform-console`: 平台管理前端,供平台管理员使用
- `tenant-console`: 租户管理前端,**独立部署**,支持白标和自定义域名

### 2.2 后端项目结构 (platform-service)

```
platform-service/
├── src/
│   ├── main.ts                      # 入口文件
│   ├── app.module.ts                # 根模块
│   │
│   ├── common/                      # 公共模块
│   │   ├── decorators/              # 自定义装饰器
│   │   │   ├── tenant.decorator.ts  # @CurrentTenant()
│   │   │   └── roles.decorator.ts   # @Roles()
│   │   ├── guards/                  # 守卫
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── roles.guard.ts
│   │   │   └── tenant.guard.ts
│   │   ├── filters/                 # 异常过滤器
│   │   │   └── http-exception.filter.ts
│   │   ├── interceptors/            # 拦截器
│   │   │   ├── logging.interceptor.ts
│   │   │   └── transform.interceptor.ts
│   │   ├── pipes/                   # 管道
│   │   └── dto/                     # 公共DTO
│   │       └── pagination.dto.ts
│   │
│   ├── modules/                     # 业务模块
│   │   ├── auth/                    # 认证模块
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── strategies/
│   │   │   │   ├── jwt.strategy.ts
│   │   │   │   └── local.strategy.ts
│   │   │   └── dto/
│   │   │       ├── login.dto.ts
│   │   │       └── token.dto.ts
│   │   │
│   │   ├── tenants/                 # 租户管理
│   │   │   ├── tenants.module.ts
│   │   │   ├── tenants.controller.ts
│   │   │   ├── tenants.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-tenant.dto.ts
│   │   │   │   ├── update-tenant.dto.ts
│   │   │   │   └── tenant-query.dto.ts
│   │   │   └── entities/
│   │   │       └── tenant.entity.ts
│   │   │
│   │   ├── instances/               # 中间件实例管理
│   │   │   ├── instances.module.ts
│   │   │   ├── instances.controller.ts
│   │   │   ├── instances.service.ts
│   │   │   └── dto/
│   │   │
│   │   ├── subscriptions/           # 订阅管理
│   │   │   ├── subscriptions.module.ts
│   │   │   ├── subscriptions.controller.ts
│   │   │   └── subscriptions.service.ts
│   │   │
│   │   ├── invoices/                # 账单管理
│   │   │   └── ...
│   │   │
│   │   ├── analytics/               # 数据统计
│   │   │   ├── analytics.module.ts
│   │   │   ├── analytics.controller.ts
│   │   │   └── analytics.service.ts
│   │   │
│   │   ├── admins/                  # 平台管理员
│   │   │   └── ...
│   │   │
│   │   └── system/                  # 系统管理
│   │       ├── health/              # 健康检查
│   │       ├── config/              # 配置管理
│   │       └── logs/                # 日志管理
│   │
│   └── config/                      # 配置
│       ├── configuration.ts         # 配置加载
│       ├── database.config.ts
│       └── jwt.config.ts
│
├── prisma/
│   ├── schema.prisma                # 数据库Schema
│   ├── migrations/                  # 迁移文件
│   └── seed.ts                      # 种子数据
│
├── test/                            # 测试
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
│
├── .env                             # 环境变量
├── .env.example
├── nest-cli.json
├── package.json
└── tsconfig.json
```

### 2.3 前端项目结构 (platform-console)

```
platform-console/
├── src/
│   ├── main.ts                      # 入口
│   ├── App.vue                      # 根组件
│   │
│   ├── api/                         # API接口
│   │   ├── index.ts                 # Axios实例
│   │   ├── auth.ts                  # 认证API
│   │   ├── tenants.ts               # 租户API
│   │   ├── instances.ts             # 实例API
│   │   └── analytics.ts             # 统计API
│   │
│   ├── assets/                      # 静态资源
│   │   ├── images/
│   │   └── styles/
│   │
│   ├── components/                  # 公共组件
│   │   ├── charts/                  # 图表组件
│   │   ├── table/                   # 表格组件
│   │   └── form/                    # 表单组件
│   │
│   ├── composables/                 # 组合式函数
│   │   ├── useAuth.ts
│   │   ├── usePagination.ts
│   │   └── usePermission.ts
│   │
│   ├── layouts/                     # 布局
│   │   ├── default-layout.vue
│   │   └── blank-layout.vue
│   │
│   ├── router/                      # 路由
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── base.ts              # 基础路由
│   │   │   └── modules/             # 模块路由
│   │   │       ├── tenants.ts
│   │   │       ├── instances.ts
│   │   │       └── analytics.ts
│   │   └── guard/                   # 路由守卫
│   │       └── permission.ts
│   │
│   ├── store/                       # 状态管理
│   │   ├── index.ts
│   │   └── modules/
│   │       ├── user.ts              # 用户状态
│   │       ├── app.ts               # 应用状态
│   │       └── permission.ts        # 权限状态
│   │
│   ├── types/                       # 类型定义
│   │   ├── api.d.ts
│   │   ├── tenant.d.ts
│   │   └── instance.d.ts
│   │
│   ├── utils/                       # 工具函数
│   │   ├── request.ts               # 请求封装
│   │   ├── auth.ts                  # Token管理
│   │   └── format.ts                # 格式化
│   │
│   └── views/                       # 页面
│       ├── login/                   # 登录
│       │   └── index.vue
│       │
│       ├── dashboard/               # 仪表板
│       │   └── index.vue
│       │
│       ├── tenants/                 # 租户管理
│       │   ├── index.vue            # 列表
│       │   ├── detail.vue           # 详情
│       │   └── components/
│       │       ├── TenantForm.vue
│       │       └── TenantTable.vue
│       │
│       ├── instances/               # 实例管理
│       │   ├── index.vue
│       │   └── detail.vue
│       │
│       ├── subscriptions/           # 订阅管理
│       │   └── ...
│       │
│       ├── analytics/               # 数据统计
│       │   ├── overview.vue
│       │   ├── trading.vue
│       │   └── users.vue
│       │
│       └── system/                  # 系统管理
│           ├── admins/              # 管理员
│           ├── logs/                # 日志
│           └── settings/            # 设置
│
├── public/
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json
```

---

## 3. 快速启动指南

### 3.1 环境准备

```bash
# 安装 Node.js 20 LTS
# 推荐使用 nvm
nvm install 20
nvm use 20

# 安装 pnpm (包管理器)
npm install -g pnpm

# 安装 NestJS CLI
npm install -g @nestjs/cli
```

### 3.2 创建项目

```bash
# 1. 创建项目目录
mkdir mt5-platform && cd mt5-platform

# 2. 初始化 pnpm workspace
pnpm init

# 3. 创建 pnpm-workspace.yaml
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
EOF

# 4. 创建后端项目
mkdir -p apps
cd apps
nest new platform-api --package-manager pnpm --skip-git

# 5. 创建前端项目
npm create arco-pro@latest platform-web
# 选择 Vue 3 + TypeScript

# 6. 返回根目录
cd ..
```

### 3.3 后端初始化

```bash
cd apps/platform-api

# 安装依赖
pnpm add @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt passport-local
pnpm add @prisma/client class-validator class-transformer
pnpm add bcryptjs uuid
pnpm add -D prisma @types/passport-jwt @types/passport-local @types/bcryptjs

# 初始化 Prisma
npx prisma init
```

### 3.4 Prisma Schema (核心表)

> **注意**: 以下为示例 Schema，实际项目使用 `apps/platform-service/prisma/schema.prisma`

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// 平台管理员
// ============================================
model PlatformAdmin {
  id        String       @id @default(uuid())
  email     String       @unique
  password  String
  name      String
  role      PlatformRole @default(ADMIN)
  isActive  Boolean      @default(true)
  lastLogin DateTime?
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  @@map("platform_admins")
}

enum PlatformRole {
  SUPER_ADMIN
  ADMIN
  OPERATOR
}

// ============================================
// 租户 (B端客户)
// ============================================
model Tenant {
  id          String       @id @default(uuid())
  name        String
  code        String       @unique  // 租户编码,用于路由
  email       String
  phone       String?
  company     String?
  logo        String?
  status      TenantStatus @default(PENDING)

  // 订阅信息 (按租户按月收费)
  plan        SubscriptionPlan @default(BASIC)
  maxInstances Int @default(1)
  maxAdmins   Int @default(3)

  // 计费
  billingEmail String?
  billingCycle BillingCycle @default(MONTHLY)

  // 元数据
  settings    Json?
  notes       String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  expiresAt   DateTime?

  // 关系 (一对多: 每个租户可拥有多个实例)
  admins      TenantAdmin[]
  instances   MiddlewareInstance[]
  invoices    Invoice[]
  apiKeys     ApiKey[]

  @@map("tenants")
}

enum TenantStatus {
  PENDING     // 待审批
  ACTIVE      // 活跃
  SUSPENDED   // 已暂停
  EXPIRED     // 已过期
  CANCELLED   // 已取消
}

enum SubscriptionPlan {
  TRIAL
  BASIC
  PROFESSIONAL
  ENTERPRISE
}

enum BillingCycle {
  MONTHLY
  QUARTERLY
  YEARLY
}

// ============================================
// 租户管理员 (B端用户)
// ============================================
model TenantAdmin {
  id        String     @id @default(uuid())
  tenantId  String
  email     String
  password  String
  name      String
  role      TenantRole @default(ADMIN)
  isActive  Boolean    @default(true)
  lastLogin DateTime?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, email])
  @@map("tenant_admins")
}

enum TenantRole {
  OWNER       // 完全权限,可管理计费
  ADMIN       // 可管理实例和交易用户
  OPERATOR    // 只读权限
}

// ============================================
// 中间件实例 (一对多: 每个实例属于一个租户)
// ============================================
model MiddlewareInstance {
  id          String   @id @default(uuid())
  tenantId    String
  name        String
  description String?

  // 连接信息
  host        String
  port        Int      @default(8080)
  apiKey      String   // 实例API密钥

  // MT5服务器配置
  mt5Servers  Json?    // MT5服务器列表

  // 状态
  status      InstanceStatus @default(OFFLINE)
  lastHealthCheck DateTime?
  healthData  Json?    // 最近健康检查数据

  // 限制
  maxSessions Int      @default(100)
  maxManagers Int      @default(10)

  // 元数据
  version     String?
  settings    Json?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("middleware_instances")
}

enum InstanceStatus {
  ONLINE
  OFFLINE
  MAINTENANCE
  ERROR
}

// ============================================
// 账单 (按租户按月收费)
// ============================================
model Invoice {
  id          String   @id @default(uuid())
  tenantId    String
  invoiceNo   String   @unique

  amount      Decimal  @db.Decimal(10, 2)
  currency    String   @default("USD")

  periodStart DateTime
  periodEnd   DateTime
  dueDate     DateTime

  status      InvoiceStatus @default(PENDING)
  paidAt      DateTime?

  items       Json?    // 账单明细
  notes       String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("invoices")
}

enum InvoiceStatus {
  PENDING
  PAID
  OVERDUE
  CANCELLED
  REFUNDED
}

// ============================================
// API密钥 (租户级别)
// ============================================
model ApiKey {
  id          String   @id @default(uuid())
  tenantId    String
  name        String
  key         String   @unique
  hashedKey   String

  permissions Json?
  rateLimit   Int      @default(1000)

  isActive    Boolean  @default(true)
  lastUsedAt  DateTime?
  expiresAt   DateTime?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("api_keys")
}

// ============================================
// 系统设置
// ============================================
model SystemSetting {
  id        String   @id @default(uuid())
  key       String   @unique
  value     Json
  category  String   @default("general")
  description String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("system_settings")
}
```

### 3.5 基础模块示例

```typescript
// src/modules/tenants/tenants.controller.ts

import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantQueryDto } from './dto/tenant-query.dto';

@ApiTags('租户管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('platform/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles('admin', 'operator')
  @ApiOperation({ summary: '获取租户列表' })
  findAll(@Query() query: TenantQueryDto) {
    return this.tenantsService.findAll(query);
  }

  @Get(':id')
  @Roles('admin', 'operator')
  @ApiOperation({ summary: '获取租户详情' })
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: '创建租户' })
  create(@Body() createTenantDto: CreateTenantDto) {
    return this.tenantsService.create(createTenantDto);
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: '更新租户' })
  update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Delete(':id')
  @Roles('super_admin')
  @ApiOperation({ summary: '删除租户' })
  remove(@Param('id') id: string) {
    return this.tenantsService.remove(id);
  }

  @Post(':id/suspend')
  @Roles('admin')
  @ApiOperation({ summary: '暂停租户服务' })
  suspend(@Param('id') id: string) {
    return this.tenantsService.updateStatus(id, 'suspended');
  }

  @Post(':id/activate')
  @Roles('admin')
  @ApiOperation({ summary: '恢复租户服务' })
  activate(@Param('id') id: string) {
    return this.tenantsService.updateStatus(id, 'active');
  }
}
```

```typescript
// src/modules/tenants/tenants.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantQueryDto } from './dto/tenant-query.dto';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: TenantQueryDto) {
    const { page = 1, pageSize = 20, status, search } = query;

    const where = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { contactEmail: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          instances: {
            include: { instance: true }
          },
          subscriptions: {
            where: { status: 'active' },
            include: { plan: true },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        instances: {
          include: { instance: true }
        },
        admins: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            status: true,
            lastLoginAt: true,
          },
        },
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }

    return tenant;
  }

  async create(dto: CreateTenantDto) {
    return this.prisma.tenant.create({
      data: {
        code: dto.code,
        name: dto.name,
        displayName: dto.displayName,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
      },
    });
  }

  async update(id: string, dto: UpdateTenantDto) {
    return this.prisma.tenant.update({
      where: { id },
      data: dto,
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.tenant.update({
      where: { id },
      data: { status },
    });
  }

  async remove(id: string) {
    // 软删除
    return this.prisma.tenant.update({
      where: { id },
      data: { status: 'terminated' },
    });
  }
}
```

---

## 4. Docker 开发环境

```yaml
# docker/docker-compose.yml

version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: platform
      POSTGRES_PASSWORD: platform123
      POSTGRES_DB: mt5_platform
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  kong:
    image: kong:3.4
    ports:
      - "8000:8000"   # Proxy
      - "8001:8001"   # Admin API
      - "8443:8443"   # Proxy SSL
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /etc/kong/kong.yml
      KONG_PROXY_ACCESS_LOG: /dev/stdout
      KONG_ADMIN_ACCESS_LOG: /dev/stdout
      KONG_PROXY_ERROR_LOG: /dev/stderr
      KONG_ADMIN_ERROR_LOG: /dev/stderr
      KONG_ADMIN_LISTEN: 0.0.0.0:8001
    volumes:
      - ./kong/kong.yml:/etc/kong/kong.yml

volumes:
  postgres_data:
  redis_data:
```

```yaml
# docker/kong/kong.yml

_format_version: "3.0"

services:
  - name: platform-api
    url: http://host.docker.internal:3000
    routes:
      - name: platform-api-route
        paths:
          - /api/v1/platform

  - name: tenant-api
    url: http://host.docker.internal:3000
    routes:
      - name: tenant-api-route
        paths:
          - /api/v1/tenant

  - name: middleware-asia
    url: http://host.docker.internal:8083
    routes:
      - name: middleware-asia-route
        paths:
          - /api/v1/trading
        headers:
          X-Instance-Id:
            - asia

plugins:
  - name: cors
    config:
      origins:
        - "*"
      methods:
        - GET
        - POST
        - PUT
        - DELETE
        - OPTIONS
      headers:
        - Authorization
        - Content-Type
        - X-Instance-Id
        - X-Tenant-Id
```

---

## 5. 开发启动命令

```bash
# 1. 启动基础服务 (PostgreSQL, Redis)
docker-compose up -d

# 2. 启动后端
cd apps/platform-service
npm run start:dev

# 3. 启动前端
cd apps/platform-console
npm run dev

# 访问地址:
# - 前端: http://localhost:5173
# - 后端: http://localhost:3000
# - API文档: http://localhost:3000/docs
```

---

## 6. 当前进度

### 已完成
- [x] 项目结构初始化 (Monorepo)
- [x] 数据库 Schema 设计 (Prisma)
- [x] 认证模块 (Platform Admin 登录)
- [x] 租户 CRUD API
- [x] 实例管理 API
- [x] 平台管理员 API
- [x] 前端基础页面 (登录、仪表板、租户列表、实例列表)

### 待开发
- [ ] 租户管理员 (TenantAdmin) API
- [ ] 实例健康检查功能
- [ ] API Key 管理
- [ ] 账单/计费模块
- [ ] Tenant Console (独立部署)
- [ ] Kong API Gateway 配置
- [ ] 与 MT5 中间件集成

---

*文档版本: 1.1*
*更新时间: 2025-12-01*
