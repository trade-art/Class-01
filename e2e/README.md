# MT5 Platform E2E Tests

本目录包含 MT5 平台的端到端 (E2E) 测试套件，使用 [Playwright](https://playwright.dev/) 测试框架。

## 目录结构

```
e2e/
├── factories/              # 测试数据工厂
│   ├── trading-user.factory.ts
│   ├── mt-server.factory.ts
│   └── index.ts
├── pages/                  # Page Object Models
│   ├── base.page.ts
│   ├── login.page.ts
│   ├── dashboard.page.ts
│   ├── users.page.ts
│   ├── mt-servers.page.ts
│   ├── positions.page.ts
│   └── index.ts
├── specs/                  # 测试用例
│   ├── business-flows/     # 业务流程测试
│   │   ├── tenant-registration.spec.ts
│   │   ├── onboarding-wizard.spec.ts
│   │   ├── mt-server-crud.spec.ts
│   │   ├── mt-server-connection.spec.ts
│   │   ├── user-list.spec.ts
│   │   ├── user-detail.spec.ts
│   │   ├── positions-list.spec.ts
│   │   ├── orders-list.spec.ts
│   │   └── data-export.spec.ts
│   ├── isolation/          # 多租户隔离测试
│   │   ├── data-isolation.spec.ts
│   │   ├── cross-tenant-access.spec.ts
│   │   └── tenant-lifecycle.spec.ts
│   └── performance/        # 性能测试
│       ├── page-load.spec.ts
│       └── api-response.spec.ts
├── support/                # 测试辅助工具
│   ├── auth.helper.ts
│   ├── database.helper.ts
│   ├── api.helper.ts
│   ├── test-utils.ts
│   └── index.ts
├── docker-compose.test.yml # 测试环境 Docker 配置
├── .env.test               # 测试环境变量
└── README.md               # 本文件
```

## 快速开始

### 前置要求

- Node.js 20+
- Docker & Docker Compose (用于测试环境)
- npm 或 yarn

### 安装依赖

```bash
# 安装项目依赖
npm install

# 安装 Playwright 浏览器
npx playwright install
```

### 运行测试

#### 1. 使用本地服务

```bash
# 启动本地开发服务
npm run dev

# 在另一个终端运行测试
npm run test:e2e
```

#### 2. 使用 Docker 测试环境

```bash
# 启动测试环境
cd e2e
docker-compose -f docker-compose.test.yml up -d

# 运行测试
npm run test:e2e

# 停止测试环境
docker-compose -f docker-compose.test.yml down
```

### 常用命令

```bash
# 运行所有 E2E 测试
npm run test:e2e

# 运行特定测试文件
npx playwright test e2e/specs/business-flows/login.spec.ts

# 运行特定测试套件
npx playwright test --grep "Login"

# 带 UI 运行测试
npx playwright test --ui

# 有头模式运行 (可见浏览器)
npx playwright test --headed

# 调试模式
npx playwright test --debug

# 运行性能测试
npx playwright test e2e/specs/performance

# 运行隔离测试
npx playwright test e2e/specs/isolation

# 生成 HTML 报告
npx playwright show-report
```

### 浏览器配置

测试默认在以下浏览器运行：

- Chromium (默认)
- Firefox
- WebKit (Safari)

指定浏览器运行：

```bash
# 仅 Chromium
npx playwright test --project=chromium

# 仅 Firefox
npx playwright test --project=firefox

# 仅 WebKit
npx playwright test --project=webkit
```

## 测试类型

### 业务流程测试

验证核心业务流程的完整性：

- **租户注册**: 新租户注册和验证流程
- **入职向导**: 首次设置向导流程
- **MT 服务器管理**: CRUD 操作和连接测试
- **用户管理**: 用户列表、详情、搜索过滤
- **交易数据**: 持仓、订单、数据导出

### 隔离测试

验证多租户数据安全：

- **数据隔离**: 租户只能看到自己的数据
- **跨租户访问**: 防止未授权访问
- **租户生命周期**: 暂停、恢复、删除

### 性能测试

验证系统性能指标：

- **页面加载**: < 2秒
- **API 响应**: < 1秒
- **搜索功能**: < 500ms

## 编写测试

### Page Object Model

使用 POM 模式组织页面交互：

```typescript
import { LoginPage, DashboardPage } from '../pages';

test('用户可以登录', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const dashboard = new DashboardPage(page);

  await loginPage.navigateTo();
  await loginPage.login('user@example.com', 'password');

  await expect(page).toHaveURL(/dashboard/);
});
```

### 测试数据工厂

使用工厂创建测试数据：

```typescript
import { TradingUserFactory, MtServerFactory } from '../factories';

const user = TradingUserFactory.create();
const server = MtServerFactory.createMT5();
```

### 测试辅助工具

```typescript
import { AuthHelper, ApiHelper, mockApiResponse } from '../support';

// 认证辅助
const auth = new AuthHelper(page);
await auth.login(email, password);

// API 辅助
const api = new ApiHelper(page);
const users = await api.getUsers();

// Mock API 响应
await mockApiResponse(page, '/api/users', { data: [] });
```

## 环境变量

主要环境变量 (`.env.test`):

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `E2E_BASE_URL` | 应用基础 URL | `http://localhost:8080` |
| `E2E_API_URL` | API 基础 URL | `http://localhost:3000` |
| `E2E_DATABASE_URL` | 测试数据库连接 | - |
| `E2E_HEADLESS` | 无头模式 | `true` |
| `E2E_DEFAULT_TIMEOUT` | 默认超时 (ms) | `30000` |

## CI/CD 集成

测试在 GitHub Actions 中自动运行：

- PR 触发完整测试
- 支持并行执行 (4 个 shard)
- 自动上传测试报告和失败截图

查看 `.github/workflows/e2e-tests.yml` 了解详情。

## 故障排除

### 常见问题

1. **浏览器启动失败**
   ```bash
   npx playwright install --with-deps
   ```

2. **超时错误**
   - 检查服务是否正常运行
   - 增加 `E2E_DEFAULT_TIMEOUT` 值

3. **数据库连接失败**
   - 确认 Docker 容器正在运行
   - 检查 `E2E_DATABASE_URL` 配置

4. **测试不稳定**
   - 使用 `await page.waitForLoadState('networkidle')`
   - 添加适当的等待条件

### 调试技巧

```bash
# 启用调试日志
DEBUG=pw:api npx playwright test

# 录制测试步骤
npx playwright codegen http://localhost:8080

# 查看跟踪文件
npx playwright show-trace trace.zip
```

## 贡献指南

1. 新测试放在对应的 `specs/` 子目录
2. 使用 Page Object Model
3. 使用工厂创建测试数据
4. 保持测试独立，不依赖执行顺序
5. 使用有意义的测试描述

## 更多资源

- [Playwright 文档](https://playwright.dev/docs/intro)
- [详细测试指南](../docs/e2e-testing-guide.md)
- [测试最佳实践](https://playwright.dev/docs/best-practices)
