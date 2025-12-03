# Platform Service E2E 契约测试

本目录包含 platform-service 服务的端到端 (E2E) API 契约测试，用于验证 API 请求/响应格式的正确性。

## 测试架构

```
test/
├── fixtures/           # 测试数据
│   └── test-data.ts    # JWT tokens, 测试用户, 租户等
├── mocks/              # Mock 服务
│   └── prisma.mock.ts  # Prisma 数据库 Mock
├── utils/              # 测试工具
│   └── validators.ts   # 响应格式验证器
├── *.e2e-spec.ts       # E2E 测试文件
├── jest-e2e.json       # Jest E2E 配置
├── setup.ts            # 测试全局设置
└── README.md           # 本文档
```

## 测试模块

| 模块 | 测试文件 | 端点数量 | 描述 |
|------|----------|----------|------|
| Auth | `auth.e2e-spec.ts` | 6 | 登录、Token 刷新、登出、密码重置、个人信息 |
| Tenants | `tenants.e2e-spec.ts` | 12 | 租户 CRUD、状态管理、统计 |
| Instances | `instances.e2e-spec.ts` | 13 | 中间件实例管理、健康检查、命令执行 |
| Platform Admins | `platform-admins.e2e-spec.ts` | 8 | 平台管理员 CRUD、密码管理 |
| Tenant Admins | `tenant-admins.e2e-spec.ts` | 12 | 租户管理员 CRUD、激活/停用 |
| Subscriptions | `subscriptions.e2e-spec.ts` | 8 | 订阅计划、订阅管理、升降级 |
| Invoices | `invoices.e2e-spec.ts` | 10 | 账单 CRUD、支付、取消、逾期检查 |
| Trading Data | `trading-data.e2e-spec.ts` | 11 | 交易数据聚合、概览、历史、持仓、余额 |
| Webhook | `webhook.e2e-spec.ts` | 6 | 中间件 Webhook 接收、签名验证 |

**总计: 9 个模块, 86+ 端点**

## 运行测试

### 运行所有 E2E 测试
```bash
npm run test:e2e
```

### 监视模式
```bash
npm run test:e2e:watch
```

### 带覆盖率
```bash
npm run test:e2e:cov
```

### CI 模式 (生成 JUnit 报告)
```bash
npm run test:e2e:ci
```

### 运行单个测试文件
```bash
npm run test:e2e -- --testPathPattern=auth
npm run test:e2e -- --testPathPattern=tenants
npm run test:e2e -- --testPathPattern=instances
```

### 运行特定测试
```bash
npm run test:e2e -- --testNamePattern="应能成功登录"
```

## 测试约定

### 响应格式

所有 API 响应遵循统一格式：

**成功响应:**
```json
{
  "success": true,
  "data": { ... }
}
```

**错误响应:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述"
  }
}
```

**分页响应:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

**登录响应:**
```json
{
  "success": true,
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresIn": 3600,
    "user": {
      "id": "...",
      "email": "...",
      "name": "...",
      "role": "...",
      "userType": "platform_admin | tenant_admin"
    }
  }
}
```

### 用户类型和角色权限

**Platform Admin (平台管理员):**
| 角色 | 描述 | 权限范围 |
|------|------|----------|
| SUPER_ADMIN | 超级管理员 | 全平台最高权限 |
| ADMIN | 管理员 | 平台管理权限 |
| OPERATOR | 操作员 | 只读和基本操作 |

**Tenant Admin (租户管理员):**
| 角色 | 描述 | 权限范围 |
|------|------|----------|
| OWNER | 租户所有者 | 租户内最高权限 |
| ADMIN | 管理员 | 租户管理权限 |
| OPERATOR | 操作员 | 只读和基本操作 |

### 访问控制规则

| 端点类别 | Platform Admin | Tenant Admin |
|----------|----------------|--------------|
| /tenants | 全部权限 | 无权限 (403) |
| /instances | 全部权限 | 无权限 (403) |
| /platform-admins | 全部权限 | 无权限 (403) |
| /tenant-admins | 全部权限 | 仅限本租户 |
| /subscriptions | 全部权限 | 仅限本租户 (只读) |
| /invoices | 全部权限 | 仅限本租户 (只读) |
| /trading-data | 全部权限 | 无权限 (403) |
| /webhook | - | - (签名验证) |

## Mock 服务

### MockPrismaService

模拟数据库操作：

```typescript
// 创建 Mock 服务
const mockPrismaService = new MockPrismaService();

// 设置返回值
mockPrismaService.tenant.findMany.mockResolvedValue([TEST_TENANT]);
mockPrismaService.tenant.findUnique.mockResolvedValue(TEST_TENANT);

// 重置 Mock
mockPrismaService.resetMocks();
```

支持的模型：
- `tenant` - 租户
- `middlewareInstance` - 中间件实例
- `platformAdmin` - 平台管理员
- `tenantAdmin` - 租户管理员
- `subscription` - 订阅
- `invoice` - 账单
- `instanceEvent` - 实例事件

### HttpService Mock

模拟中间件 HTTP 调用：

```typescript
mockHttpService = {
  get: jest.fn(),
  post: jest.fn(),
};

// 设置返回值
mockHttpService.get.mockReturnValue(
  of({ data: { orders: mockTradingOrders } })
);
```

## 测试数据

### 预定义测试用户

```typescript
TEST_PLATFORM_ADMIN = {
  id: 'platform-admin-001',
  email: 'superadmin@platform.com',
  role: 'SUPER_ADMIN',
};

TEST_TENANT = {
  id: '11111111-1111-4111-a111-111111111111',
  code: 'TEST001',
  name: 'Test Tenant',
  status: 'ACTIVE',
};

TEST_TENANT_ADMIN = {
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  tenantId: TEST_TENANT.id,
  email: 'admin@testtenant.com',
  role: 'ADMIN',
};
```

### 预生成 JWT Token

```typescript
TEST_TOKENS = {
  // Platform Admin Tokens
  platformSuperAdmin: '...',   // SUPER_ADMIN
  platformAdmin: '...',        // ADMIN
  platformOperator: '...',     // OPERATOR

  // Tenant Admin Tokens
  tenantOwner: '...',          // OWNER
  tenantAdmin: '...',          // ADMIN
  tenantOperator: '...',       // OPERATOR

  // 特殊 Token
  expired: '...',              // 过期 Token
  suspendedTenantAdmin: '...', // 暂停租户的管理员
}
```

## 响应验证器

```typescript
// 验证成功响应
expectSuccessResponse(response);

// 获取响应数据
const data = getSuccessData<TenantDto>(response);

// 验证错误响应
expectErrorResponse(response, 'TENANT_NOT_FOUND', 404);

// 验证认证错误 (401)
expectAuthError(response);

// 验证权限错误 (403)
expectForbiddenError(response);

// 验证资源不存在 (404)
expectNotFoundError(response);

// 验证请求参数错误 (400)
expectBadRequestError(response);

// 验证分页响应
expectPaginatedResponse(response, 'tenants');

// 验证登录响应
expectLoginResponse(response);
expectPlatformAdminLoginResponse(response);
expectTenantAdminLoginResponse(response);

// 验证 UUID 格式
expectUUID(value);

// 验证 Email 格式
expectEmail(value);
```

## CI/CD 集成

### 测试配置

```json
// jest-e2e.json
{
  "testTimeout": 30000,
  "reporters": [
    "default",
    ["jest-junit", {
      "outputDirectory": "<rootDir>/../reports",
      "outputName": "e2e-results.xml"
    }]
  ]
}
```

### GitHub Actions 工作流

- **触发条件:** push/PR 到 main/develop 分支
- **测试阶段:** Lint -> Unit Tests -> E2E Tests -> Build
- **报告输出:** JUnit XML + 覆盖率报告
- **Artifact:** 测试结果保留 30 天

### 运行 CI 测试

```bash
npm run test:e2e:ci
```

## 添加新测试

1. 在 `test/` 目录创建 `{module}.e2e-spec.ts`

2. 使用标准模板结构：

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MockPrismaService } from './mocks/prisma.mock';
import { TEST_TOKENS, TEST_TENANT } from './fixtures/test-data';
import { expectSuccessResponse, expectAuthError } from './utils/validators';

describe('ModuleName (E2E)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockPrismaService.resetMocks();
  });

  // ==================== 认证测试 ====================
  describe('认证和授权', () => {
    it('无认证 token 应返回 401', async () => {
      const response = await request(app.getHttpServer()).get('/endpoint');
      expectAuthError(response);
    });
  });

  // ==================== 功能测试 ====================
  describe('GET /endpoint - 端点描述', () => {
    it('应能成功获取数据', async () => {
      mockPrismaService.model.findMany.mockResolvedValue([TEST_DATA]);

      const response = await request(app.getHttpServer())
        .get('/endpoint')
        .set('Authorization', `Bearer ${TEST_TOKENS.platformSuperAdmin}`)
        .expect(200);

      expectSuccessResponse(response);
    });
  });
});
```

3. 遵循测试结构顺序：
   - 认证测试 (401 场景)
   - 权限测试 (403 场景)
   - 成功场景测试
   - 验证错误测试 (400 场景)
   - 资源不存在测试 (404 场景)
   - 业务规则测试 (409 等场景)

4. 如需新的测试数据，添加到 `fixtures/test-data.ts`

5. 如需新的验证器，添加到 `utils/validators.ts`

## 常见问题

**Q: 测试超时怎么办？**
A: 检查 `jest-e2e.json` 中的 `testTimeout` 设置，默认 30 秒。对于复杂测试，可以单独设置超时：
```typescript
it('复杂测试', async () => {
  // ...
}, 60000); // 60 秒超时
```

**Q: 如何调试失败的测试？**
A:
1. 使用 `--verbose` 获取详细输出：
   ```bash
   npm run test:e2e -- --verbose
   ```
2. 运行单个测试文件：
   ```bash
   npm run test:e2e -- --testPathPattern=auth
   ```
3. 使用 `.only` 运行单个测试：
   ```typescript
   it.only('应能成功登录', async () => { ... });
   ```

**Q: Mock 数据不生效？**
A: 确保在 `beforeEach` 中调用 `mockPrismaService.resetMocks()` 重置 Mock。

**Q: Token 验证失败？**
A: 检查 JWT_SECRET 环境变量是否与测试数据中使用的一致 (默认: `test-jwt-secret-key-for-e2e-testing`)。

**Q: Webhook 签名验证失败？**
A: 确保：
1. 时间戳在 5 分钟有效期内
2. 签名使用正确的 HMAC-SHA256 格式
3. Instance 已配置 webhookSecret

**Q: 如何查看生成的测试报告？**
A: 运行 `npm run test:e2e:ci` 后，在 `reports/e2e-results.xml` 查看 JUnit 报告。
