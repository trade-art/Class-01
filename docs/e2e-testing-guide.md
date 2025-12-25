# MT5 Platform E2E Testing Guide

本指南详细说明如何为 MT5 平台编写、运行和维护端到端 (E2E) 测试。

## 目录

1. [概述](#概述)
2. [测试架构](#测试架构)
3. [编写测试](#编写测试)
4. [测试模式](#测试模式)
5. [数据管理](#数据管理)
6. [多租户测试](#多租户测试)
7. [性能测试](#性能测试)
8. [CI/CD 集成](#cicd-集成)
9. [最佳实践](#最佳实践)
10. [故障排除](#故障排除)

---

## 概述

### 测试框架

我们使用 [Playwright](https://playwright.dev/) 作为 E2E 测试框架，因为它：

- 支持多浏览器 (Chromium, Firefox, WebKit)
- 内置自动等待
- 强大的选择器引擎
- 优秀的调试工具
- 原生支持并行执行

### 测试范围

E2E 测试覆盖以下核心功能：

| 模块 | 测试内容 |
|------|----------|
| 认证 | 登录、登出、Token 刷新 |
| 租户管理 | 注册、入职、生命周期 |
| MT 服务器 | CRUD、连接测试、状态监控 |
| 用户管理 | 列表、详情、搜索、过滤 |
| 交易数据 | 持仓、订单、导出 |
| 多租户隔离 | 数据隔离、访问控制 |
| 性能 | 页面加载、API 响应 |

---

## 测试架构

### 目录结构

```
e2e/
├── factories/          # 测试数据工厂
├── pages/              # Page Object Models
├── specs/              # 测试用例
│   ├── business-flows/ # 业务流程测试
│   ├── isolation/      # 隔离测试
│   └── performance/    # 性能测试
├── support/            # 辅助工具
└── mocks/              # Mock 服务
```

### Page Object Model (POM)

每个页面都有对应的 Page Object：

```typescript
// e2e/pages/login.page.ts
export class LoginPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('[data-testid="email-input"]');
    this.passwordInput = page.locator('[data-testid="password-input"]');
    this.submitButton = page.locator('[data-testid="login-button"]');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await this.page.waitForURL(/dashboard/);
  }
}
```

### 测试辅助工具

```typescript
// e2e/support/auth.helper.ts
export class AuthHelper {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    // API 登录，设置 cookie/localStorage
  }

  async getToken(): Promise<string | null> {
    // 获取当前认证 token
  }
}
```

---

## 编写测试

### 基本测试结构

```typescript
import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage } from '../../pages';

test.describe('登录功能', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigateTo();
  });

  test('有效凭证可以登录', async ({ page }) => {
    await loginPage.login('admin@test.com', 'password');

    const dashboard = new DashboardPage(page);
    await expect(dashboard.welcomeMessage).toBeVisible();
  });

  test('无效凭证显示错误', async ({ page }) => {
    await loginPage.login('admin@test.com', 'wrong');

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText('Invalid credentials');
  });
});
```

### 使用测试数据工厂

```typescript
import { TradingUserFactory } from '../../factories';

test('创建新用户', async ({ page }) => {
  const userData = TradingUserFactory.create({
    email: 'custom@test.com'
  });

  const usersPage = new UsersPage(page);
  await usersPage.createUser(userData);

  await expect(page.locator(`text=${userData.email}`)).toBeVisible();
});
```

### Mock API 响应

```typescript
import { mockApiResponse } from '../../support/test-utils';

test('显示空状态', async ({ page }) => {
  await mockApiResponse(page, '/api/users', { data: [], total: 0 });

  await page.goto('/users');

  await expect(page.locator('[data-testid="empty-state"]')).toBeVisible();
});
```

---

## 测试模式

### 1. 认证测试模式

```typescript
// 复用认证状态
test.describe('已认证用户', () => {
  test.use({ storageState: 'e2e/.auth/user.json' });

  test('可以访问仪表板', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/dashboard/);
  });
});
```

### 2. 多租户测试模式

```typescript
test.describe('多租户隔离', () => {
  let tenantAPage: Page;
  let tenantBPage: Page;

  test.beforeAll(async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    tenantAPage = await contextA.newPage();
    tenantBPage = await contextB.newPage();

    // 登录不同租户
    await loginAsTenant(tenantAPage, 'tenantA');
    await loginAsTenant(tenantBPage, 'tenantB');
  });

  test('租户 A 无法看到租户 B 数据', async () => {
    await tenantAPage.goto('/users');
    await expect(tenantAPage.locator('text=TenantB-User')).not.toBeVisible();
  });
});
```

### 3. 性能测试模式

```typescript
test('页面加载性能', async ({ page }) => {
  const startTime = Date.now();
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  const loadTime = Date.now() - startTime;

  expect(loadTime).toBeLessThan(2000);

  // Core Web Vitals
  const metrics = await page.evaluate(() => ({
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
    lcp: performance.getEntriesByType('largest-contentful-paint').pop()?.startTime
  }));

  expect(metrics.fcp).toBeLessThan(1500);
  expect(metrics.lcp).toBeLessThan(2500);
});
```

---

## 数据管理

### 测试数据原则

1. **隔离性**: 每个测试使用独立数据
2. **可重复性**: 测试可以多次运行
3. **清理**: 测试后清理创建的数据

### 数据工厂使用

```typescript
// 基本用法
const user = TradingUserFactory.create();

// 自定义属性
const vipUser = TradingUserFactory.createVIP({
  email: 'vip@test.com'
});

// 批量创建
const users = TradingUserFactory.createBatch(10);
```

### 数据库辅助

```typescript
import { DatabaseHelper } from '../../support/database.helper';

test.beforeEach(async () => {
  const db = await getSharedDatabase();
  await db.cleanTestData();
});

test.afterAll(async () => {
  await closeSharedDatabase();
});
```

---

## 多租户测试

### 隔离验证

```typescript
test('数据隔离', async ({ browser }) => {
  // 创建两个独立的浏览器上下文
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();

  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // 分别登录
  await loginAsTenant(pageA, tenantA);
  await loginAsTenant(pageB, tenantB);

  // 验证 A 只能看到 A 的数据
  await pageA.goto('/users');
  const usersA = await pageA.locator('table tbody tr').count();

  // 验证 B 只能看到 B 的数据
  await pageB.goto('/users');
  const usersB = await pageB.locator('table tbody tr').count();

  // 数据应该不同
  expect(usersA).not.toBe(usersB);
});
```

### 跨租户访问测试

```typescript
test('阻止跨租户访问', async ({ page }) => {
  await loginAsTenant(page, tenantA);

  // 尝试直接访问租户 B 的资源
  const response = await page.request.get(`/api/users/${tenantBUserId}`);

  expect([403, 404]).toContain(response.status());
});
```

---

## 性能测试

### 页面加载测试

```typescript
const THRESHOLDS = {
  PAGE_LOAD: 2000,
  FCP: 1500,
  LCP: 2500,
};

test('仪表板加载性能', async ({ page }) => {
  const start = Date.now();
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  expect(Date.now() - start).toBeLessThan(THRESHOLDS.PAGE_LOAD);
});
```

### API 响应测试

```typescript
test('API 响应时间', async ({ request }) => {
  const start = Date.now();
  const response = await request.get('/api/users');
  const duration = Date.now() - start;

  expect(response.ok()).toBe(true);
  expect(duration).toBeLessThan(1000);
});
```

---

## CI/CD 集成

### GitHub Actions 配置

测试在以下情况自动运行：
- Pull Request 创建/更新
- 推送到 main/develop 分支

### 并行执行

测试分成 4 个 shard 并行执行：

```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]

steps:
  - run: npx playwright test --shard=${{ matrix.shard }}/4
```

### 报告和截图

- HTML 测试报告自动上传
- 失败测试自动截图
- 可选视频录制

---

## 最佳实践

### 1. 使用 data-testid

```html
<!-- 好 -->
<button data-testid="submit-button">Submit</button>

<!-- 避免 -->
<button class="btn-primary">Submit</button>
```

```typescript
// 好
await page.click('[data-testid="submit-button"]');

// 避免
await page.click('.btn-primary');
```

### 2. 避免硬编码等待

```typescript
// 好
await page.waitForSelector('[data-testid="user-list"]');
await expect(page.locator('[data-testid="user-list"]')).toBeVisible();

// 避免
await page.waitForTimeout(3000);
```

### 3. 测试独立性

```typescript
// 好 - 每个测试独立
test('创建用户', async ({ page }) => {
  const user = TradingUserFactory.create();
  // ... 测试创建
});

test('删除用户', async ({ page }) => {
  // 先创建，再删除
  const user = await createTestUser();
  // ... 测试删除
});

// 避免 - 测试相互依赖
test('创建用户', async ({ page }) => { /* ... */ });
test('删除刚创建的用户', async ({ page }) => { /* ... */ }); // 依赖上个测试
```

### 4. 有意义的断言

```typescript
// 好
await expect(page.locator('[data-testid="error-message"]'))
  .toContainText('Invalid email format');

// 不够好
await expect(page.locator('[data-testid="error-message"]'))
  .toBeVisible();
```

### 5. 合理的超时

```typescript
// playwright.config.ts
export default defineConfig({
  timeout: 30000,           // 测试超时
  expect: {
    timeout: 5000           // 断言超时
  },
  use: {
    navigationTimeout: 30000,
    actionTimeout: 15000
  }
});
```

---

## 故障排除

### 常见问题

#### 1. 元素未找到

```typescript
// 添加等待
await page.waitForSelector('[data-testid="element"]');

// 或使用 expect
await expect(page.locator('[data-testid="element"]')).toBeVisible();
```

#### 2. 测试不稳定

```typescript
// 使用更可靠的等待
await page.waitForLoadState('networkidle');

// 添加重试
test.describe.configure({ retries: 2 });
```

#### 3. 认证问题

```typescript
// 保存认证状态
await page.context().storageState({ path: '.auth/user.json' });

// 复用认证状态
test.use({ storageState: '.auth/user.json' });
```

### 调试技巧

```bash
# 启用调试
npx playwright test --debug

# 录制操作
npx playwright codegen http://localhost:3000

# 查看跟踪
npx playwright show-trace trace.zip

# 打开报告
npx playwright show-report
```

### 日志和跟踪

```typescript
// 启用跟踪
test.use({
  trace: 'on-first-retry',
  video: 'on-first-retry',
  screenshot: 'only-on-failure'
});
```

---

## 附录

### 有用的 Playwright 命令

```bash
# 安装浏览器
npx playwright install

# 运行特定测试
npx playwright test login.spec.ts

# 运行标记的测试
npx playwright test --grep @smoke

# 生成测试代码
npx playwright codegen

# 更新快照
npx playwright test --update-snapshots
```

### 资源链接

- [Playwright 官方文档](https://playwright.dev/docs/intro)
- [Playwright 最佳实践](https://playwright.dev/docs/best-practices)
- [Playwright API 参考](https://playwright.dev/docs/api/class-playwright)
