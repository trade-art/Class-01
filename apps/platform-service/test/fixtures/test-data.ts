/**
 * Platform Service 测试数据常量
 * 预设的测试数据，用于契约测试
 */

import { JwtService } from '@nestjs/jwt';

// ==================== Platform Admin 数据 ====================

export const TEST_PLATFORM_ADMIN = {
  id: 'platform-admin-001',
  email: 'superadmin@platform.com',
  password: '$2b$10$iugYzlUY.fLiYWqowAft/.xXev5kZjE0qr9brvBmcQYNq3S8JDsD.', // bcrypt hash of 'password123'
  name: 'Super Admin',
  role: 'SUPER_ADMIN' as const,
  isActive: true,
  lastLogin: new Date('2024-01-15T10:00:00Z'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const TEST_PLATFORM_ADMIN_REGULAR = {
  ...TEST_PLATFORM_ADMIN,
  id: 'platform-admin-002',
  email: 'admin@platform.com',
  name: 'Regular Admin',
  role: 'ADMIN' as const,
};

export const TEST_PLATFORM_ADMIN_OPERATOR = {
  ...TEST_PLATFORM_ADMIN,
  id: 'platform-admin-003',
  email: 'operator@platform.com',
  name: 'Operator',
  role: 'OPERATOR' as const,
};

export const TEST_PLATFORM_ADMIN_DISABLED = {
  ...TEST_PLATFORM_ADMIN,
  id: 'platform-admin-disabled',
  email: 'disabled@platform.com',
  isActive: false,
};

// ==================== Tenant 数据 ====================

// 使用有效的 UUID v4 格式以通过 DTO 验证
export const TEST_TENANT = {
  id: '11111111-1111-4111-a111-111111111111',
  name: 'Test Tenant',
  code: 'TEST001',
  email: 'contact@testtenant.com',
  phone: '+1234567890',
  company: 'Test Company Ltd',
  logo: 'https://example.com/logo.png',
  displayName: 'Test Display Name',
  primaryColor: '#007bff',
  status: 'ACTIVE' as const,
  plan: 'PROFESSIONAL' as const,
  maxInstances: 5,
  maxAdmins: 10,
  billingEmail: 'billing@testtenant.com',
  billingCycle: 'MONTHLY' as const,
  settings: { theme: 'dark' },
  notes: 'Test tenant for E2E tests',
  expiresAt: new Date('2025-12-31'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const TEST_TENANT_PENDING = {
  ...TEST_TENANT,
  id: '22222222-2222-4222-a222-222222222222',
  code: 'PENDING01',
  name: 'Pending Tenant',
  status: 'PENDING' as const,
};

export const TEST_TENANT_SUSPENDED = {
  ...TEST_TENANT,
  id: '33333333-3333-4333-a333-333333333333',
  code: 'SUSPENDED',
  name: 'Suspended Tenant',
  status: 'SUSPENDED' as const,
};

export const TEST_TENANT_EXPIRED = {
  ...TEST_TENANT,
  id: '44444444-4444-4444-a444-444444444444',
  code: 'EXPIRED01',
  name: 'Expired Tenant',
  status: 'EXPIRED' as const,
  expiresAt: new Date('2023-12-31'),
};

// ==================== Tenant Admin 数据 ====================

export const TEST_TENANT_ADMIN = {
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  tenantId: '11111111-1111-4111-a111-111111111111', // 引用 TEST_TENANT.id
  email: 'admin@testtenant.com',
  password: '$2b$10$iugYzlUY.fLiYWqowAft/.xXev5kZjE0qr9brvBmcQYNq3S8JDsD.',
  name: 'Tenant Admin',
  role: 'ADMIN' as const,
  isActive: true,
  lastLogin: new Date('2024-01-15T10:00:00Z'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const TEST_TENANT_ADMIN_OWNER = {
  ...TEST_TENANT_ADMIN,
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaab',
  email: 'owner@testtenant.com',
  name: 'Tenant Owner',
  role: 'OWNER' as const,
};

export const TEST_TENANT_ADMIN_OPERATOR = {
  ...TEST_TENANT_ADMIN,
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaac',
  email: 'operator@testtenant.com',
  name: 'Tenant Operator',
  role: 'OPERATOR' as const,
};

export const TEST_TENANT_ADMIN_DISABLED = {
  ...TEST_TENANT_ADMIN,
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaad',
  email: 'disabled@testtenant.com',
  isActive: false,
};

export const TEST_TENANT_ADMIN_SUSPENDED = {
  ...TEST_TENANT_ADMIN,
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaae',
  tenantId: '33333333-3333-4333-a333-333333333333', // 引用 TEST_TENANT_SUSPENDED.id
  email: 'admin@suspendedtenant.com',
};

// ==================== Middleware Instance 数据 ====================

export const TEST_INSTANCE = {
  id: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
  tenantId: '11111111-1111-4111-a111-111111111111', // 引用 TEST_TENANT.id
  name: 'Production MT5',
  description: 'Production MT5 middleware instance',
  host: '192.168.1.100',
  port: 8080,
  apiKey: 'encrypted-api-key',
  useTls: false,
  mt5Servers: [
    { name: 'MT5-Live', host: 'mt5.example.com', port: 443 },
  ],
  status: 'ONLINE' as const,
  lastHealthCheck: new Date('2024-01-15T10:00:00Z'),
  lastCheckedAt: new Date('2024-01-15T10:00:00Z'),
  healthData: { cpu: 25, memory: 60, connections: 50 },
  instanceIdentifier: 'mt5-prod-001',
  webhookSecret: 'webhook-secret-123',
  latencyMs: 45,
  errorMessage: null,
  circuitBreakerState: 'CLOSED' as const,
  consecutiveFailures: 0,
  maxSessions: 100,
  maxManagers: 10,
  version: '1.0.0',
  settings: { autoReconnect: true },
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const TEST_INSTANCE_OFFLINE = {
  ...TEST_INSTANCE,
  id: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbb2',
  name: 'Staging MT5',
  status: 'OFFLINE' as const,
  consecutiveFailures: 3,
  errorMessage: 'Connection refused',
};

export const TEST_INSTANCE_ERROR = {
  ...TEST_INSTANCE,
  id: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbb3',
  name: 'Error MT5',
  status: 'ERROR' as const,
  circuitBreakerState: 'OPEN' as const,
  consecutiveFailures: 5,
  errorMessage: 'MT5 server unreachable',
};

// ==================== Invoice 数据 ====================

export const TEST_INVOICE = {
  id: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
  tenantId: '11111111-1111-4111-a111-111111111111', // 引用 TEST_TENANT.id
  invoiceNo: 'INV-2024-0001',
  amount: 999.99,
  currency: 'USD',
  periodStart: new Date('2024-01-01'),
  periodEnd: new Date('2024-01-31'),
  status: 'PAID' as const,
  paidAt: new Date('2024-01-05'),
  items: [
    { description: 'Professional Plan - January 2024', amount: 999.99 },
  ],
  notes: 'Thank you for your business',
  dueDate: new Date('2024-01-15'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-05'),
};

export const TEST_INVOICE_PENDING = {
  ...TEST_INVOICE,
  id: 'cccccccc-cccc-4ccc-accc-ccccccccccc2',
  invoiceNo: 'INV-2024-0002',
  status: 'PENDING' as const,
  paidAt: null,
  periodStart: new Date('2024-02-01'),
  periodEnd: new Date('2024-02-29'),
};

export const TEST_INVOICE_OVERDUE = {
  ...TEST_INVOICE,
  id: 'cccccccc-cccc-4ccc-accc-ccccccccccc3',
  invoiceNo: 'INV-2024-0003',
  status: 'OVERDUE' as const,
  paidAt: null,
  dueDate: new Date('2024-01-01'),
};

// ==================== API Key 数据 ====================

export const TEST_API_KEY = {
  id: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
  tenantId: '11111111-1111-4111-a111-111111111111', // 引用 TEST_TENANT.id
  name: 'Production API Key',
  key: 'pk_live_abc123xyz789',
  hashedKey: 'hashed-key-value',
  permissions: ['read', 'write', 'trade'],
  rateLimit: 1000,
  isActive: true,
  lastUsedAt: new Date('2024-01-15T10:00:00Z'),
  expiresAt: new Date('2025-12-31'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const TEST_API_KEY_READONLY = {
  ...TEST_API_KEY,
  id: 'dddddddd-dddd-4ddd-addd-ddddddddddd2',
  name: 'Read-only API Key',
  key: 'pk_live_readonly123',
  permissions: ['read'],
};

// ==================== Instance Event 数据 ====================

export const TEST_INSTANCE_EVENTS = [
  {
    id: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee',
    instanceId: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb', // 引用 TEST_INSTANCE.id
    eventType: 'status_change',
    eventData: { from: 'OFFLINE', to: 'ONLINE' },
    severity: 'INFO' as const,
    source: 'platform',
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeee2',
    instanceId: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb', // 引用 TEST_INSTANCE.id
    eventType: 'circuit_breaker',
    eventData: { state: 'OPEN', reason: 'consecutive failures' },
    severity: 'WARNING' as const,
    source: 'platform',
    createdAt: new Date('2024-01-15T09:00:00Z'),
  },
];

// ==================== JWT Tokens ====================

const jwtService = new JwtService({
  secret: process.env.JWT_SECRET || 'test-jwt-secret-key-for-e2e-testing',
});

export const TEST_TOKENS = {
  // Platform Admin Tokens (platform_admin type)
  platformSuperAdmin: jwtService.sign(
    {
      sub: TEST_PLATFORM_ADMIN.id,
      email: TEST_PLATFORM_ADMIN.email,
      name: TEST_PLATFORM_ADMIN.name,
      role: TEST_PLATFORM_ADMIN.role,
      userType: 'platform_admin',
    },
    { expiresIn: '1h' },
  ),

  platformAdmin: jwtService.sign(
    {
      sub: TEST_PLATFORM_ADMIN_REGULAR.id,
      email: TEST_PLATFORM_ADMIN_REGULAR.email,
      name: TEST_PLATFORM_ADMIN_REGULAR.name,
      role: TEST_PLATFORM_ADMIN_REGULAR.role,
      userType: 'platform_admin',
    },
    { expiresIn: '1h' },
  ),

  platformOperator: jwtService.sign(
    {
      sub: TEST_PLATFORM_ADMIN_OPERATOR.id,
      email: TEST_PLATFORM_ADMIN_OPERATOR.email,
      name: TEST_PLATFORM_ADMIN_OPERATOR.name,
      role: TEST_PLATFORM_ADMIN_OPERATOR.role,
      userType: 'platform_admin',
    },
    { expiresIn: '1h' },
  ),

  // Tenant Admin Tokens (tenant_admin type)
  tenantOwner: jwtService.sign(
    {
      sub: TEST_TENANT_ADMIN_OWNER.id,
      email: TEST_TENANT_ADMIN_OWNER.email,
      name: TEST_TENANT_ADMIN_OWNER.name,
      role: TEST_TENANT_ADMIN_OWNER.role,
      userType: 'tenant_admin',
      tenantId: TEST_TENANT.id,
      tenantCode: TEST_TENANT.code,
    },
    { expiresIn: '1h' },
  ),

  tenantAdmin: jwtService.sign(
    {
      sub: TEST_TENANT_ADMIN.id,
      email: TEST_TENANT_ADMIN.email,
      name: TEST_TENANT_ADMIN.name,
      role: TEST_TENANT_ADMIN.role,
      userType: 'tenant_admin',
      tenantId: TEST_TENANT.id,
      tenantCode: TEST_TENANT.code,
    },
    { expiresIn: '1h' },
  ),

  tenantOperator: jwtService.sign(
    {
      sub: TEST_TENANT_ADMIN_OPERATOR.id,
      email: TEST_TENANT_ADMIN_OPERATOR.email,
      name: TEST_TENANT_ADMIN_OPERATOR.name,
      role: TEST_TENANT_ADMIN_OPERATOR.role,
      userType: 'tenant_admin',
      tenantId: TEST_TENANT.id,
      tenantCode: TEST_TENANT.code,
    },
    { expiresIn: '1h' },
  ),

  // Expired token
  expired: jwtService.sign(
    {
      sub: TEST_PLATFORM_ADMIN.id,
      email: TEST_PLATFORM_ADMIN.email,
      name: TEST_PLATFORM_ADMIN.name,
      role: TEST_PLATFORM_ADMIN.role,
      userType: 'platform_admin',
    },
    { expiresIn: '-1h' },
  ),

  // Token for suspended tenant
  suspendedTenantAdmin: jwtService.sign(
    {
      sub: TEST_TENANT_ADMIN_SUSPENDED.id,
      email: TEST_TENANT_ADMIN_SUSPENDED.email,
      name: 'Suspended Admin',
      role: 'ADMIN',
      userType: 'tenant_admin',
      tenantId: TEST_TENANT_SUSPENDED.id,
      tenantCode: TEST_TENANT_SUSPENDED.code,
    },
    { expiresIn: '1h' },
  ),
};

// ==================== 登录凭证 ====================

export const TEST_CREDENTIALS = {
  // Platform Admin 凭证
  platformSuperAdmin: {
    email: TEST_PLATFORM_ADMIN.email,
    password: 'password123',
    userType: 'PLATFORM_ADMIN',
  },
  platformAdmin: {
    email: TEST_PLATFORM_ADMIN_REGULAR.email,
    password: 'password123',
    userType: 'PLATFORM_ADMIN',
  },
  platformDisabled: {
    email: TEST_PLATFORM_ADMIN_DISABLED.email,
    password: 'password123',
    userType: 'PLATFORM_ADMIN',
  },

  // Tenant Admin 凭证
  tenantOwner: {
    email: TEST_TENANT_ADMIN_OWNER.email,
    password: 'password123',
    userType: 'TENANT_ADMIN',
    tenantCode: TEST_TENANT.code,
  },
  tenantAdmin: {
    email: TEST_TENANT_ADMIN.email,
    password: 'password123',
    userType: 'TENANT_ADMIN',
    tenantCode: TEST_TENANT.code,
  },
  tenantDisabled: {
    email: TEST_TENANT_ADMIN_DISABLED.email,
    password: 'password123',
    userType: 'TENANT_ADMIN',
    tenantCode: TEST_TENANT.code,
  },
  tenantSuspended: {
    email: TEST_TENANT_ADMIN_SUSPENDED.email,
    password: 'password123',
    userType: 'TENANT_ADMIN',
    tenantCode: TEST_TENANT_SUSPENDED.code,
  },

  // Invalid credentials
  invalidPassword: {
    email: TEST_PLATFORM_ADMIN.email,
    password: 'wrongpassword',
    userType: 'PLATFORM_ADMIN',
  },
  invalidEmail: {
    email: 'nonexistent@platform.com',
    password: 'password123',
    userType: 'PLATFORM_ADMIN',
  },
  invalidTenantCode: {
    email: TEST_TENANT_ADMIN.email,
    password: 'password123',
    userType: 'TENANT_ADMIN',
    tenantCode: 'INVALID',
  },
};
