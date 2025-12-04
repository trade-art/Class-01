/**
 * 测试数据常量
 * 预设的测试数据，用于契约测试
 */

import { JwtService } from '@nestjs/jwt';

// ==================== 租户数据 ====================

export const TEST_TENANT = {
  id: 'tenant-test-001',
  code: 'TEST001',
  name: 'Test Tenant',
  displayName: 'Test Display Name',
  logo: 'https://example.com/logo.png',
  primaryColor: '#007bff',
  status: 'ACTIVE',
  expiresAt: new Date('2025-12-31'),
  subscriptionType: 'PROFESSIONAL',
  subscriptionExpiry: new Date('2025-12-31'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const TEST_TENANT_SUSPENDED = {
  ...TEST_TENANT,
  id: 'tenant-suspended-001',
  code: 'SUSPENDED',
  status: 'SUSPENDED',
};

// ==================== 管理员数据 ====================

export const TEST_ADMIN = {
  id: 'admin-test-001',
  email: 'admin@test.com',
  password: '$2b$10$iugYzlUY.fLiYWqowAft/.xXev5kZjE0qr9brvBmcQYNq3S8JDsD.', // real bcrypt hash of 'password123'
  name: 'Test Admin',
  role: 'ADMIN' as const,
  isActive: true,
  tenantId: 'tenant-test-001',
  lastLogin: new Date('2024-01-15T10:00:00Z'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const TEST_ADMIN_OWNER = {
  ...TEST_ADMIN,
  id: 'admin-owner-001',
  email: 'owner@test.com',
  name: 'Test Owner',
  role: 'OWNER' as const,
};

export const TEST_ADMIN_OPERATOR = {
  ...TEST_ADMIN,
  id: 'admin-operator-001',
  email: 'operator@test.com',
  name: 'Test Operator',
  role: 'OPERATOR' as const,
};

export const TEST_ADMIN_DISABLED = {
  ...TEST_ADMIN,
  id: 'admin-disabled-001',
  email: 'disabled@test.com',
  isActive: false,
};

export const TEST_ADMIN_SUSPENDED_TENANT = {
  ...TEST_ADMIN,
  id: 'admin-suspended-tenant-001',
  email: 'suspended@test.com',
  tenantId: 'tenant-suspended-001',
};

// ==================== 中间件实例数据 ====================

export const TEST_INSTANCE = {
  id: 'instance-test-001',
  tenantId: TEST_TENANT.id,
  name: 'Test Instance',
  status: 'ONLINE',
};

// ==================== JWT Tokens ====================

const jwtService = new JwtService({
  secret: process.env.JWT_SECRET || 'test-jwt-secret-key-for-e2e-testing',
});

export const TEST_TOKENS = {
  // 有效的 ADMIN Token (注意: 角色使用小写以匹配 API)
  validAdmin: jwtService.sign(
    {
      sub: TEST_ADMIN.id,
      email: TEST_ADMIN.email,
      tenantId: TEST_TENANT.id,
      instanceId: TEST_INSTANCE.id,
      role: 'admin',
    },
    { expiresIn: '1h' },
  ),

  // 有效的 OWNER Token
  validOwner: jwtService.sign(
    {
      sub: TEST_ADMIN_OWNER.id,
      email: TEST_ADMIN_OWNER.email,
      tenantId: TEST_TENANT.id,
      instanceId: TEST_INSTANCE.id,
      role: 'owner',
    },
    { expiresIn: '1h' },
  ),

  // 有效的 OPERATOR Token
  validOperator: jwtService.sign(
    {
      sub: TEST_ADMIN_OPERATOR.id,
      email: TEST_ADMIN_OPERATOR.email,
      tenantId: TEST_TENANT.id,
      instanceId: TEST_INSTANCE.id,
      role: 'operator',
    },
    { expiresIn: '1h' },
  ),

  // 过期的 Token
  expired: jwtService.sign(
    {
      sub: TEST_ADMIN.id,
      email: TEST_ADMIN.email,
      tenantId: TEST_TENANT.id,
      instanceId: TEST_INSTANCE.id,
      role: 'admin',
    },
    { expiresIn: '-1h' },
  ),

  // 无效类型的 Token (platform_admin)
  invalidType: jwtService.sign(
    {
      sub: 'platform-admin-001',
      email: 'platform@test.com',
      role: 'super_admin',
      type: 'platform_admin',
    },
    { expiresIn: '1h' },
  ),
};

// ==================== 登录凭证 ====================
// 注意: LoginDto 只接受 email 和 password，不需要 tenantCode

export const TEST_CREDENTIALS = {
  valid: {
    email: TEST_ADMIN.email,
    password: 'password123',
  },
  invalidPassword: {
    email: TEST_ADMIN.email,
    password: 'wrongpassword',
  },
  invalidEmail: {
    email: 'nonexistent@test.com',
    password: 'password123',
  },
  suspendedTenant: {
    email: 'suspended@test.com', // 使用属于 suspended tenant 的 admin email
    password: 'password123',
  },
  disabledAdmin: {
    email: TEST_ADMIN_DISABLED.email,
    password: 'password123',
  },
};

// ==================== 交易用户数据 ====================

export const TEST_TRADING_USERS = [
  {
    login: 1001,
    name: 'Trader One',
    email: 'trader1@example.com',
    group: 'demo',
    leverage: 100,
    balance: 10000,
    equity: 10500,
    margin: 2000,
    freeMargin: 8500,
    marginLevel: 525,
    status: 'active',
    registrationTime: '2024-01-01T00:00:00Z',
    lastLoginTime: '2024-01-15T10:00:00Z',
  },
  {
    login: 1002,
    name: 'Trader Two',
    email: 'trader2@example.com',
    group: 'real',
    leverage: 200,
    balance: 50000,
    equity: 48000,
    margin: 10000,
    freeMargin: 38000,
    marginLevel: 480,
    status: 'active',
    registrationTime: '2024-01-05T00:00:00Z',
    lastLoginTime: '2024-01-14T15:00:00Z',
  },
];

// ==================== 持仓数据 ====================

export const TEST_POSITIONS = [
  {
    ticket: 12345,
    login: 1001,
    symbol: 'EURUSD',
    type: 'buy',
    volume: 1.0,
    openPrice: 1.085,
    currentPrice: 1.0875,
    stopLoss: 1.08,
    takeProfit: 1.095,
    profit: 250,
    swap: -2.5,
    commission: -7,
    openTime: '2024-01-15T10:30:00Z',
    comment: 'Test position',
  },
  {
    ticket: 12346,
    login: 1002,
    symbol: 'GBPUSD',
    type: 'sell',
    volume: 0.5,
    openPrice: 1.265,
    currentPrice: 1.2625,
    stopLoss: 1.27,
    takeProfit: 1.255,
    profit: 125,
    swap: -1.5,
    commission: -3.5,
    openTime: '2024-01-15T11:00:00Z',
    comment: '',
  },
];

// ==================== 报价数据 ====================

export const TEST_QUOTES = [
  {
    symbol: 'EURUSD',
    bid: 1.085,
    ask: 1.0852,
    last: 1.0851,
    high: 1.09,
    low: 1.08,
    volume: 1000,
    time: '2024-01-15T10:30:00Z',
    spread: 2,
    change: 0.0005,
    changePercent: 0.05,
  },
  {
    symbol: 'GBPUSD',
    bid: 1.265,
    ask: 1.2652,
    last: 1.2651,
    high: 1.27,
    low: 1.26,
    volume: 800,
    time: '2024-01-15T10:30:00Z',
    spread: 2,
    change: -0.001,
    changePercent: -0.08,
  },
  {
    symbol: 'USDJPY',
    bid: 148.5,
    ask: 148.52,
    last: 148.51,
    high: 149.0,
    low: 148.0,
    volume: 1200,
    time: '2024-01-15T10:30:00Z',
    spread: 2,
    change: 0.15,
    changePercent: 0.1,
  },
];

// ==================== 历史订单数据 ====================
// 格式匹配 DealDto: ticket, symbol, type, volume, price, profit, commission, swap, time, comment

export const TEST_HISTORY_ORDERS = [
  {
    ticket: 11111,
    login: 1001,
    symbol: 'EURUSD',
    type: 'buy',
    volume: 1.0,
    price: 1.085,        // DealDto 使用 price 而不是 openPrice/closePrice
    openPrice: 1.08,     // 保留用于兼容性
    closePrice: 1.085,   // 保留用于兼容性
    profit: 500,
    swap: -5,
    commission: -7,
    time: '2024-01-12T15:00:00Z',  // DealDto 使用 time
    openTime: '2024-01-10T10:00:00Z',
    closeTime: '2024-01-12T15:00:00Z',
    comment: '',
  },
  {
    ticket: 11112,
    login: 1002,
    symbol: 'GBPUSD',
    type: 'sell',
    volume: 0.5,
    price: 1.265,
    openPrice: 1.27,
    closePrice: 1.265,
    profit: 250,
    swap: -2.5,
    commission: -3.5,
    time: '2024-01-13T12:00:00Z',
    openTime: '2024-01-11T09:00:00Z',
    closeTime: '2024-01-13T12:00:00Z',
    comment: '',
  },
];

// ==================== 风险预警数据 ====================
// level 使用大写枚举: INFO, WARNING, CRITICAL
// createdAt 使用 Date 对象

export const TEST_RISK_ALERTS = [
  {
    id: 'alert-001',
    tenantId: TEST_TENANT.id,
    type: 'LOW_MARGIN',
    level: 'CRITICAL',
    message: '用户 1001 保证金水平低于 50%',
    data: { login: 1001, marginLevel: 48.5 },
    isRead: false,
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: 'alert-002',
    tenantId: TEST_TENANT.id,
    type: 'LARGE_TRADE',
    level: 'WARNING',
    message: '检测到大额交易',
    data: { login: 1002, volume: 10, symbol: 'XAUUSD' },
    isRead: true,
    createdAt: new Date('2024-01-14T15:00:00Z'),
  },
];

// ==================== Dashboard 统计数据 ====================

export const TEST_DASHBOARD_STATS = {
  totalUsers: 150,
  activeUsers: 85,
  totalBalance: 1500000,
  totalEquity: 1580000,
  totalMargin: 320000,
  totalProfit: 80000,
  todayTrades: 245,
  todayVolume: 125.5,
};

// ==================== API Key 数据 ====================

export const TEST_API_KEYS = [
  {
    id: 'key-001',
    name: 'Production API Key',
    key: 'mt5_prod_abc123',
    keyPrefix: 'mt5_prod_****',
    hashedKey: 'hashed-key-1',
    permissions: ['read', 'write'],
    isActive: true,
    tenantId: TEST_TENANT.id,
    lastUsedAt: new Date('2024-01-15T10:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 'key-002',
    name: 'Read-only API Key',
    key: 'mt5_ro_xyz789',
    keyPrefix: 'mt5_ro_****',
    hashedKey: 'hashed-key-2',
    permissions: ['read'],
    isActive: true,
    tenantId: TEST_TENANT.id,
    lastUsedAt: null,
    createdAt: new Date('2024-01-05T00:00:00Z'),
  },
];

// ==================== 通知设置数据 ====================

export const TEST_NOTIFICATION_SETTINGS = {
  tenantId: TEST_TENANT.id,
  riskAlertEmail: true,
  systemAlertEmail: true,
  webhookUrl: 'https://webhook.example.com/notify',
  webhookEnabled: true,
};
