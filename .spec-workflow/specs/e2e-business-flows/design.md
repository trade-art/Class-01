# Design Document: E2E Business Flows

## Overview

本设计文档描述SaaS平台端到端业务流程测试架构，确保从用户注册到交易数据查看的完整业务流程正常工作。

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     E2E Testing Architecture                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Test Runner (Playwright/Cypress)                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │ UI Tests    │  │ API Tests   │  │ Integration │                  │   │
│  │  │ (Browser)   │  │ (HTTP)      │  │ Tests       │                  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │   │
│  │         │                │                │                          │   │
│  └─────────┼────────────────┼────────────────┼──────────────────────────┘   │
│            │                │                │                              │
│            ▼                ▼                ▼                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Application Under Test                            │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐              ┌─────────────────┐               │   │
│  │  │ tenant-console  │◄────────────►│   tenant-api    │               │   │
│  │  │ (Frontend)      │    REST      │   (Backend)     │               │   │
│  │  │ :5173           │              │   :3000         │               │   │
│  │  └─────────────────┘              └────────┬────────┘               │   │
│  │                                            │                         │   │
│  │                                            ▼                         │   │
│  │                                   ┌─────────────────┐                │   │
│  │                                   │ MT5-middleware  │                │   │
│  │                                   │ :8080           │                │   │
│  │                                   └────────┬────────┘                │   │
│  │                                            │                         │   │
│  │                                            ▼                         │   │
│  │                                   ┌─────────────────┐                │   │
│  │                                   │   MT5 Server    │                │   │
│  │                                   │   (Mock/Real)   │                │   │
│  │                                   └─────────────────┘                │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Test Infrastructure                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │ PostgreSQL  │  │   Redis     │  │ Test Data   │                  │   │
│  │  │ (Test DB)   │  │ (Test)      │  │ Factory     │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Business Flow Diagrams

### Flow 1: Tenant Registration and Initialization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Tenant Registration Flow                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │ Register│────▶│ Verify      │────▶│ Create      │────▶│ Setup       │   │
│  │ Form    │     │ Email       │     │ Tenant      │     │ Wizard      │   │
│  └─────────┘     └─────────────┘     └─────────────┘     └─────────────┘   │
│                                                                             │
│  Steps:                                                                     │
│  1. User fills registration form (company, email, password)                 │
│  2. System sends verification email                                         │
│  3. User verifies email                                                     │
│  4. System creates tenant, admin user, default settings                     │
│  5. User completes setup wizard (MT server config)                          │
│  6. System validates MT server connection                                   │
│  7. Dashboard becomes accessible                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow 2: MT Server Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   MT Server Configuration Flow                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │ Add Server  │────▶│ Test        │────▶│ Save        │                   │
│  │ Form        │     │ Connection  │     │ Config      │                   │
│  └─────────────┘     └─────────────┘     └─────────────┘                   │
│        │                                        │                           │
│        │                                        ▼                           │
│        │                              ┌─────────────────┐                   │
│        │                              │ Set as Default  │                   │
│        │                              └─────────────────┘                   │
│        │                                        │                           │
│        ▼                                        ▼                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Server List View                              │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │ Server Name   │ Type │ Status    │ Latency │ Actions         │   │   │
│  │  │ Demo-MT5      │ MT5  │ Connected │ 45ms    │ [Edit] [Delete] │   │   │
│  │  │ Live-MT4      │ MT4  │ Connected │ 32ms    │ [Edit] [Delete] │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow 3: Trading User Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Trading User Management Flow                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        User List Page                                │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │ Search: [          ] [Group: All ▼] [Server: Demo-MT5 ▼]    │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │ Login │ Name       │ Balance    │ Equity     │ Group        │   │   │
│  │  │ 10001 │ John Doe   │ $10,000.00 │ $10,500.00 │ demo-retail  │   │   │
│  │  │ 10002 │ Jane Smith │ $25,000.00 │ $24,800.00 │ demo-vip     │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  │  [< Prev] Page 1 of 10 [Next >]                                     │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Click on user row:                                                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      User Detail View                                │   │
│  │                                                                      │   │
│  │  [Account Info] [Positions] [Orders] [Deals]                        │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │ Account: 10001        Name: John Doe                         │   │   │
│  │  │ Balance: $10,000.00   Equity: $10,500.00                     │   │   │
│  │  │ Margin: $2,000.00     Free Margin: $8,500.00                 │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow 4: Multi-tenant Isolation Verification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Multi-tenant Isolation Test                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Test Scenario                                 │   │
│  │                                                                      │   │
│  │  Tenant A                              Tenant B                      │   │
│  │  ┌─────────────────────┐              ┌─────────────────────┐       │   │
│  │  │ Token: jwt-tenant-a │              │ Token: jwt-tenant-b │       │   │
│  │  │ Data: [A1, A2, A3]  │              │ Data: [B1, B2, B3]  │       │   │
│  │  └──────────┬──────────┘              └──────────┬──────────┘       │   │
│  │             │                                    │                   │   │
│  │             ▼                                    ▼                   │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │                     Test Cases                                  │ │   │
│  │  │                                                                 │ │   │
│  │  │  1. Tenant A requests /api/users                                │ │   │
│  │  │     → Returns [A1, A2, A3] ✓                                    │ │   │
│  │  │                                                                 │ │   │
│  │  │  2. Tenant A requests /api/users/:B1                            │ │   │
│  │  │     → Returns 404 Not Found ✓                                   │ │   │
│  │  │                                                                 │ │   │
│  │  │  3. Tenant A modifies Authorization to Tenant B's token         │ │   │
│  │  │     → Returns 401 Unauthorized ✓                                │ │   │
│  │  │                                                                 │ │   │
│  │  │  4. Tenant B disabled, Tenant B requests any API                │ │   │
│  │  │     → Returns 403 Forbidden ✓                                   │ │   │
│  │  │                                                                 │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Test Framework Design

### Test Structure

```typescript
// e2e/specs/business-flows/tenant-registration.spec.ts
describe('Tenant Registration Flow', () => {
  describe('Complete Registration Journey', () => {
    it('should register new tenant successfully', async () => {});
    it('should create admin user with correct permissions', async () => {});
    it('should initialize default settings', async () => {});
    it('should redirect to setup wizard', async () => {});
  });

  describe('Error Scenarios', () => {
    it('should reject duplicate email', async () => {});
    it('should validate password requirements', async () => {});
    it('should handle verification timeout', async () => {});
  });
});
```

### Test Data Factory

```typescript
// e2e/factories/tenant.factory.ts
export class TenantFactory {
  static create(overrides?: Partial<Tenant>): Tenant {
    return {
      id: faker.string.uuid(),
      name: faker.company.name(),
      email: faker.internet.email(),
      status: 'active',
      settings: {
        defaultMtServer: null,
        timezone: 'UTC',
        locale: 'en',
      },
      ...overrides,
    };
  }

  static async createInDb(prisma: PrismaClient, overrides?: Partial<Tenant>) {
    const tenant = this.create(overrides);
    return prisma.tenant.create({ data: tenant });
  }
}
```

### Page Object Model

```typescript
// e2e/pages/users-page.ts
export class UsersPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto('/users');
  }

  async searchUser(query: string) {
    await this.page.fill('[data-testid="search-input"]', query);
    await this.page.click('[data-testid="search-button"]');
  }

  async selectUser(login: string) {
    await this.page.click(`[data-testid="user-row-${login}"]`);
  }

  async getUserCount(): Promise<number> {
    const rows = await this.page.$$('[data-testid^="user-row-"]');
    return rows.length;
  }

  async getTableData(): Promise<UserRow[]> {
    return this.page.$$eval('[data-testid^="user-row-"]', (rows) =>
      rows.map((row) => ({
        login: row.querySelector('.login')?.textContent,
        name: row.querySelector('.name')?.textContent,
        balance: row.querySelector('.balance')?.textContent,
      }))
    );
  }
}
```

## Test Categories

### 1. Happy Path Tests

| Test Case | Flow | Expected Result |
|-----------|------|-----------------|
| Complete tenant registration | Registration | Tenant created, admin user active |
| Add MT5 server | MT Server | Server saved, connection verified |
| View user list | User Management | Users displayed with pagination |
| Search users by login | User Management | Matching users returned |
| View user positions | Positions | Open positions displayed |

### 2. Error Handling Tests

| Test Case | Input | Expected Result |
|-----------|-------|-----------------|
| Duplicate email registration | Existing email | 400 error, clear message |
| Invalid MT server credentials | Wrong password | Connection failed, error shown |
| Unauthorized resource access | Cross-tenant ID | 403/404 response |
| Session expired | Expired JWT | Redirect to login |

### 3. Performance Tests

| Test Case | Criteria | Threshold |
|-----------|----------|-----------|
| Page load time | Dashboard | < 2s |
| User list load | 1000 users | < 3s |
| Search response | Any query | < 1s |
| Login response | Valid creds | < 500ms |

### 4. Multi-tenant Isolation Tests

| Test Case | Action | Verification |
|-----------|--------|--------------|
| Data isolation | Query all data | Only tenant's data returned |
| Cross-tenant access | Direct ID access | 403/404 returned |
| Token tampering | Modified JWT | 401 returned |
| Disabled tenant | Any request | 403 returned |

## File Structure

```
e2e/
├── fixtures/
│   ├── tenants.json
│   ├── users.json
│   └── mt-servers.json
├── factories/
│   ├── tenant.factory.ts
│   ├── user.factory.ts
│   └── mt-server.factory.ts
├── pages/
│   ├── login-page.ts
│   ├── dashboard-page.ts
│   ├── users-page.ts
│   ├── positions-page.ts
│   └── mt-servers-page.ts
├── specs/
│   ├── business-flows/
│   │   ├── tenant-registration.spec.ts
│   │   ├── mt-server-config.spec.ts
│   │   ├── user-management.spec.ts
│   │   └── trading-data.spec.ts
│   ├── isolation/
│   │   ├── data-isolation.spec.ts
│   │   └── security.spec.ts
│   └── performance/
│       └── load-times.spec.ts
├── support/
│   ├── commands.ts
│   ├── hooks.ts
│   └── test-utils.ts
├── playwright.config.ts
└── jest-e2e.config.ts
```

## Test Environment

### Configuration

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30000,
  retries: 2,
  workers: 4,
  reporter: [
    ['html', { outputFolder: 'reports/e2e' }],
    ['junit', { outputFile: 'reports/e2e-results.xml' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'api', testMatch: '**/*.api.spec.ts' },
  ],
});
```

### Database Setup/Teardown

```typescript
// e2e/support/hooks.ts
beforeAll(async () => {
  // Reset test database
  await prisma.$executeRaw`TRUNCATE TABLE "Tenant" CASCADE`;

  // Seed test data
  await seedTestData();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clear Redis cache
  await redis.flushdb();
});
```

## Integration with CI/CD

```yaml
# .github/workflows/e2e-tests.yml
e2e-tests:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:15
      env:
        POSTGRES_DB: test
        POSTGRES_PASSWORD: test
    redis:
      image: redis:7
  steps:
    - uses: actions/checkout@v4
    - name: Setup Node.js
      uses: actions/setup-node@v4
    - name: Install dependencies
      run: npm ci
    - name: Start application
      run: npm run start:test &
    - name: Wait for app
      run: npx wait-on http://localhost:3000/health
    - name: Run E2E tests
      run: npm run test:e2e
    - name: Upload reports
      uses: actions/upload-artifact@v4
      with:
        name: e2e-reports
        path: reports/
```

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| Playwright | 1.40.x | Browser automation |
| Jest | 29.x | Test runner |
| @faker-js/faker | 8.x | Test data generation |
| supertest | 6.x | API testing |
| testcontainers | 10.x | Docker test containers |
