/**
 * Mock MT5 Middleware Server for E2E Testing
 * Simulates MT5 middleware API responses
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;
const MOCK_DELAY_MS = parseInt(process.env.MOCK_DELAY_MS || '50', 10);
const MOCK_ERROR_RATE = parseFloat(process.env.MOCK_ERROR_RATE || '0');

// Middleware
app.use(cors());
app.use(express.json());

// Simulate network delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Random error simulation
const shouldError = () => Math.random() < MOCK_ERROR_RATE;

// Mock data
const TEST_TRADING_USERS = [
  { login: 1001, name: 'John Doe', email: 'john@test.com', group: 'demo', status: 'active', balance: 10000, equity: 10500, leverage: 100 },
  { login: 1002, name: 'Jane Smith', email: 'jane@test.com', group: 'demo', status: 'active', balance: 25000, equity: 24800, leverage: 200 },
  { login: 1003, name: 'Bob Wilson', email: 'bob@test.com', group: 'real', status: 'active', balance: 50000, equity: 52000, leverage: 100 },
  { login: 1004, name: 'Alice Brown', email: 'alice@test.com', group: 'real', status: 'suspended', balance: 5000, equity: 4800, leverage: 50 },
  { login: 1005, name: 'Charlie Davis', email: 'charlie@test.com', group: 'vip', status: 'active', balance: 100000, equity: 105000, leverage: 500 },
];

const TEST_POSITIONS = [
  { ticket: 10001, login: 1001, symbol: 'EURUSD', type: 'buy', volume: 1.0, openPrice: 1.0850, currentPrice: 1.0870, profit: 200, openTime: new Date().toISOString() },
  { ticket: 10002, login: 1001, symbol: 'GBPUSD', type: 'sell', volume: 0.5, openPrice: 1.2650, currentPrice: 1.2630, profit: 100, openTime: new Date().toISOString() },
  { ticket: 10003, login: 1002, symbol: 'USDJPY', type: 'buy', volume: 2.0, openPrice: 149.50, currentPrice: 149.80, profit: 400, openTime: new Date().toISOString() },
  { ticket: 10004, login: 1003, symbol: 'EURUSD', type: 'sell', volume: 1.5, openPrice: 1.0880, currentPrice: 1.0870, profit: 150, openTime: new Date().toISOString() },
  { ticket: 10005, login: 1005, symbol: 'XAUUSD', type: 'buy', volume: 0.1, openPrice: 2020.50, currentPrice: 2025.00, profit: 450, openTime: new Date().toISOString() },
];

const TEST_QUOTES = [
  { symbol: 'EURUSD', bid: 1.0868, ask: 1.0870, spread: 2, high: 1.0895, low: 1.0840, time: new Date().toISOString() },
  { symbol: 'GBPUSD', bid: 1.2628, ask: 1.2631, spread: 3, high: 1.2680, low: 1.2600, time: new Date().toISOString() },
  { symbol: 'USDJPY', bid: 149.78, ask: 149.81, spread: 3, high: 150.20, low: 149.30, time: new Date().toISOString() },
  { symbol: 'XAUUSD', bid: 2024.50, ask: 2025.50, spread: 100, high: 2030.00, low: 2015.00, time: new Date().toISOString() },
  { symbol: 'BTCUSD', bid: 43250.00, ask: 43280.00, spread: 3000, high: 44000.00, low: 42500.00, time: new Date().toISOString() },
];

const TEST_HISTORY_ORDERS = [
  { ticket: 9001, login: 1001, symbol: 'EURUSD', type: 'buy', volume: 1.0, openPrice: 1.0800, closePrice: 1.0850, profit: 500, openTime: '2024-01-01T10:00:00Z', closeTime: '2024-01-01T14:00:00Z' },
  { ticket: 9002, login: 1001, symbol: 'GBPUSD', type: 'sell', volume: 0.5, openPrice: 1.2700, closePrice: 1.2650, profit: 250, openTime: '2024-01-02T09:00:00Z', closeTime: '2024-01-02T16:00:00Z' },
  { ticket: 9003, login: 1002, symbol: 'USDJPY', type: 'buy', volume: 2.0, openPrice: 148.00, closePrice: 149.00, profit: 1350, openTime: '2024-01-03T08:00:00Z', closeTime: '2024-01-04T12:00:00Z' },
];

let mockToken = 'mock-jwt-token-12345';
let refreshToken = 'mock-refresh-token-67890';

// ==================== Health Endpoints ====================

app.get('/health', async (req, res) => {
  await delay(MOCK_DELAY_MS);
  res.json({
    status: 'ok',
    serverName: 'MT5 Mock Server',
    connected: true,
    lastHeartbeat: new Date().toISOString(),
    latency: MOCK_DELAY_MS,
    version: '5.0.0-mock',
  });
});

app.get('/api/health', async (req, res) => {
  await delay(MOCK_DELAY_MS);
  res.json({
    status: 'ok',
    serverName: 'MT5 Mock Server',
    connected: true,
    lastHeartbeat: new Date().toISOString(),
    latency: MOCK_DELAY_MS,
    version: '5.0.0-mock',
  });
});

app.get('/api/v1/health', async (req, res) => {
  await delay(MOCK_DELAY_MS);
  res.json({
    status: 'ok',
    serverName: 'MT5 Mock Server',
    connected: true,
    lastHeartbeat: new Date().toISOString(),
    latency: MOCK_DELAY_MS,
    version: '5.0.0-mock',
  });
});

app.get('/api/test-connection', async (req, res) => {
  await delay(MOCK_DELAY_MS);
  res.json({
    success: true,
    latency: MOCK_DELAY_MS,
    serverVersion: '5.0.0-mock',
    serverTime: new Date().toISOString(),
  });
});

app.get('/api/server/status', async (req, res) => {
  await delay(MOCK_DELAY_MS);
  res.json({
    connected: true,
    serverTime: new Date().toISOString(),
    ping: MOCK_DELAY_MS,
    version: '5.0.0-mock',
  });
});

// ==================== Auth Endpoints ====================

app.post('/api/auth/login', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  if (shouldError()) {
    return res.status(500).json({ message: 'Internal server error' });
  }

  const { managerLogin, managerPassword } = req.body;

  if (managerLogin && managerPassword) {
    res.json({
      accessToken: mockToken,
      refreshToken: refreshToken,
      expiresIn: 3600,
      serverInfo: {
        name: 'MT5 Mock Server',
        version: '5.0.0-mock',
        serverTime: new Date().toISOString(),
      },
    });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  const { managerLogin, managerPassword } = req.body;

  if (managerLogin && managerPassword) {
    res.json({
      accessToken: mockToken,
      refreshToken: refreshToken,
      expiresIn: 3600,
      serverInfo: {
        name: 'MT5 Mock Server',
        version: '5.0.0-mock',
        serverTime: new Date().toISOString(),
      },
    });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  const { refreshToken: token } = req.body;

  if (token) {
    res.json({
      accessToken: `new-${mockToken}-${Date.now()}`,
      refreshToken: `new-${refreshToken}-${Date.now()}`,
      expiresIn: 3600,
    });
  } else {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  await delay(MOCK_DELAY_MS);
  res.json({ success: true });
});

// ==================== New Authentication System (Service Token & API Key) ====================

// Store for mock API keys (simulates database)
const mockApiKeys = new Map();
const revokedApiKeys = new Set();

// Auth middleware - validates Service Token or API Key
const authMiddleware = (requiredScopes = []) => {
  return async (req, res, next) => {
    await delay(MOCK_DELAY_MS / 2);

    // Check Authorization header (Service Token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // Validate JWT structure (mock validation)
      const parts = token.split('.');
      if (parts.length === 3) {
        try {
          // Decode payload
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

          // Check expiration
          if (payload.exp && payload.exp < Date.now() / 1000) {
            return res.status(401).json({ error: 'EXPIRED_TOKEN', message: 'Token has expired' });
          }

          // Set auth context
          req.authContext = {
            type: 'serviceToken',
            tenantId: payload.tenantId,
            instanceId: payload.instanceId,
            scopes: ['*'], // Service tokens have full access
          };
          return next();
        } catch (e) {
          return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid token format' });
        }
      }
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid token format' });
    }

    // Check X-API-Key header
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      // Check if key is revoked
      if (revokedApiKeys.has(apiKey)) {
        return res.status(401).json({ error: 'REVOKED_KEY', message: 'API key has been revoked' });
      }

      // Check if key exists (or accept test keys with specific format)
      const keyInfo = mockApiKeys.get(apiKey) || {
        valid: apiKey.length > 20,
        scopes: ['account:read', 'trade:read', 'market:read'],
        allowedIps: [],
      };

      if (!keyInfo.valid && apiKey.length <= 20) {
        return res.status(401).json({ error: 'INVALID_API_KEY', message: 'Invalid API key' });
      }

      // Check IP whitelist
      if (keyInfo.allowedIps && keyInfo.allowedIps.length > 0) {
        const clientIp = req.ip || req.connection.remoteAddress;
        const isAllowed = keyInfo.allowedIps.some(ip => {
          if (ip.includes('/')) {
            // CIDR check (simplified)
            return true;
          }
          return ip === clientIp || ip === '127.0.0.1' || ip === '::1';
        });
        if (!isAllowed && !keyInfo.allowedIps.includes('127.0.0.1') && !keyInfo.allowedIps.includes('localhost')) {
          return res.status(403).json({ error: 'IP_NOT_ALLOWED', message: 'IP address not in whitelist' });
        }
      }

      // Check scopes
      if (requiredScopes.length > 0) {
        const hasScope = requiredScopes.some(scope => {
          return keyInfo.scopes.includes(scope) || keyInfo.scopes.includes('*');
        });
        if (!hasScope) {
          return res.status(403).json({ error: 'INSUFFICIENT_SCOPES', message: 'Missing required scopes' });
        }
      }

      req.authContext = {
        type: 'apiKey',
        keyId: apiKey.substring(0, 8),
        scopes: keyInfo.scopes,
      };
      return next();
    }

    // No credentials provided
    return res.status(401).json({ error: 'NO_CREDENTIALS', message: 'Authentication required' });
  };
};

// Accounts endpoint with auth
app.get('/api/accounts', authMiddleware(['account:read']), async (req, res) => {
  await delay(MOCK_DELAY_MS);
  res.json({
    accounts: TEST_TRADING_USERS.map(u => ({
      login: u.login,
      name: u.name,
      balance: u.balance,
      equity: u.equity,
    })),
    authContext: req.authContext,
  });
});

// Trades endpoint with auth (requires trade:write for POST)
app.post('/api/trades', authMiddleware(['trade:write']), async (req, res) => {
  await delay(MOCK_DELAY_MS);
  res.status(201).json({
    ticket: Math.floor(Math.random() * 100000),
    status: 'executed',
    ...req.body,
  });
});

app.get('/api/trades', authMiddleware(['trade:read']), async (req, res) => {
  await delay(MOCK_DELAY_MS);
  res.json({ trades: TEST_HISTORY_ORDERS });
});

// Webhook endpoint for cache invalidation
app.post('/api/v1/webhook/cache-invalidate', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  const { type, keyId, apiKey } = req.body;

  if (type === 'api_key_revoked') {
    if (apiKey) {
      revokedApiKeys.add(apiKey);
    }
    console.log(`[Mock] API Key revoked: ${keyId || apiKey}`);
  }

  res.json({ success: true, message: 'Cache invalidated' });
});

// Admin endpoint to register mock API keys (for testing)
app.post('/api/admin/mock-api-keys', async (req, res) => {
  const { key, scopes, allowedIps } = req.body;

  mockApiKeys.set(key, {
    valid: true,
    scopes: scopes || ['account:read'],
    allowedIps: allowedIps || [],
    createdAt: new Date().toISOString(),
  });

  res.status(201).json({ success: true, keyId: key.substring(0, 8) });
});

// Admin endpoint to revoke mock API keys (for testing)
app.delete('/api/admin/mock-api-keys/:key', async (req, res) => {
  const { key } = req.params;
  revokedApiKeys.add(key);
  mockApiKeys.delete(key);
  res.json({ success: true, message: 'API key revoked' });
});

// ==================== User Endpoints ====================

app.get('/api/account/users', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  let users = [...TEST_TRADING_USERS];
  const { search, group, status } = req.query;

  if (search) {
    const searchLower = search.toString().toLowerCase();
    users = users.filter(u =>
      u.name.toLowerCase().includes(searchLower) ||
      u.email.toLowerCase().includes(searchLower) ||
      u.login.toString().includes(searchLower)
    );
  }

  if (group) {
    users = users.filter(u => u.group === group);
  }

  if (status) {
    users = users.filter(u => u.status === status);
  }

  res.json({ users, total: users.length });
});

app.get('/api/v1/account/users', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  let users = [...TEST_TRADING_USERS];
  res.json({ users, total: users.length });
});

app.get('/api/account/users/:login', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  const login = parseInt(req.params.login);
  const user = TEST_TRADING_USERS.find(u => u.login === login);

  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

app.get('/api/account/groups', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  const groups = [...new Set(TEST_TRADING_USERS.map(u => u.group))];
  res.json({
    groups: groups.map(group => ({
      name: group,
      description: `${group} Group`,
      leverage: 100,
    })),
  });
});

app.put('/api/account/users/:login/group', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  const login = parseInt(req.params.login);
  const user = TEST_TRADING_USERS.find(u => u.login === login);

  if (user) {
    res.json({ ...user, group: req.body.group || user.group });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

app.put('/api/account/users/:login/leverage', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  const login = parseInt(req.params.login);
  const user = TEST_TRADING_USERS.find(u => u.login === login);

  if (user) {
    res.json({ ...user, leverage: req.body.leverage || user.leverage });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

app.put('/api/account/users/:login/status', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  const login = parseInt(req.params.login);
  const user = TEST_TRADING_USERS.find(u => u.login === login);

  if (user) {
    res.json({ ...user, status: req.body.status || user.status });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

// ==================== Position Endpoints ====================

app.get('/api/trading/positions', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  let positions = [...TEST_POSITIONS];
  const { symbol, type, login } = req.query;

  if (symbol) {
    positions = positions.filter(p => p.symbol === symbol);
  }

  if (type) {
    positions = positions.filter(p => p.type === type);
  }

  if (login) {
    positions = positions.filter(p => p.login === parseInt(login.toString()));
  }

  res.json({ positions, total: positions.length });
});

app.get('/api/v1/trading/positions', async (req, res) => {
  await delay(MOCK_DELAY_MS);
  res.json({ positions: TEST_POSITIONS, total: TEST_POSITIONS.length });
});

app.get('/api/trading/positions/stats', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  const positions = TEST_POSITIONS;
  const buyPositions = positions.filter(p => p.type === 'buy');
  const sellPositions = positions.filter(p => p.type === 'sell');

  res.json({
    totalPositions: positions.length,
    buyCount: buyPositions.length,
    sellCount: sellPositions.length,
    totalVolume: positions.reduce((sum, p) => sum + p.volume, 0),
    totalProfit: positions.reduce((sum, p) => sum + p.profit, 0),
    buyVolume: buyPositions.reduce((sum, p) => sum + p.volume, 0),
    sellVolume: sellPositions.reduce((sum, p) => sum + p.volume, 0),
  });
});

// ==================== Quote Endpoints ====================

app.get('/api/quotes/symbols', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  let quotes = [...TEST_QUOTES];
  const { search, symbols } = req.query;

  if (search) {
    const searchUpper = search.toString().toUpperCase();
    quotes = quotes.filter(q => q.symbol.includes(searchUpper));
  }

  if (symbols) {
    const symbolList = symbols.toString().split(',');
    quotes = quotes.filter(q => symbolList.includes(q.symbol));
  }

  res.json({ quotes, total: quotes.length });
});

app.get('/api/v1/quotes/symbols', async (req, res) => {
  await delay(MOCK_DELAY_MS);
  res.json({ quotes: TEST_QUOTES, total: TEST_QUOTES.length });
});

app.get('/api/quotes/symbols/:symbol', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  const quote = TEST_QUOTES.find(q => q.symbol === req.params.symbol);

  if (quote) {
    res.json(quote);
  } else {
    res.status(404).json({ message: 'Symbol not found' });
  }
});

app.get('/api/quotes/symbols/:symbol/info', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  const quote = TEST_QUOTES.find(q => q.symbol === req.params.symbol);

  if (quote) {
    res.json({
      symbol: quote.symbol,
      description: `${quote.symbol} Description`,
      digits: 5,
      spread: quote.spread,
      contractSize: 100000,
      tradeMode: 'Full',
      currencyBase: quote.symbol.substring(0, 3),
      currencyProfit: quote.symbol.substring(3, 6),
    });
  } else {
    res.status(404).json({ message: 'Symbol not found' });
  }
});

// ==================== History Endpoints ====================

app.get('/api/history/deals', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  let orders = [...TEST_HISTORY_ORDERS];
  const { from, to, symbol, login } = req.query;

  if (from) {
    const fromDate = new Date(from.toString());
    orders = orders.filter(o => new Date(o.closeTime) >= fromDate);
  }

  if (to) {
    const toDate = new Date(to.toString());
    orders = orders.filter(o => new Date(o.closeTime) <= toDate);
  }

  if (symbol) {
    orders = orders.filter(o => o.symbol === symbol);
  }

  if (login) {
    orders = orders.filter(o => o.login === parseInt(login.toString()));
  }

  res.json({ deals: orders, total: orders.length });
});

app.get('/api/v1/history/deals', async (req, res) => {
  await delay(MOCK_DELAY_MS);
  res.json({ deals: TEST_HISTORY_ORDERS, total: TEST_HISTORY_ORDERS.length });
});

app.get('/api/history/deals/:ticket', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  const ticket = parseInt(req.params.ticket);
  const order = TEST_HISTORY_ORDERS.find(o => o.ticket === ticket);

  if (order) {
    res.json(order);
  } else {
    res.status(404).json({ message: 'Order not found' });
  }
});

// ==================== Monitor Endpoints ====================

app.get('/api/monitor/stats', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  res.json({
    totalUsers: TEST_TRADING_USERS.length,
    activeUsers: TEST_TRADING_USERS.filter(u => u.status === 'active').length,
    totalPositions: TEST_POSITIONS.length,
    totalVolume: TEST_POSITIONS.reduce((sum, p) => sum + p.volume, 0),
    totalProfit: TEST_POSITIONS.reduce((sum, p) => sum + p.profit, 0),
    totalBalance: TEST_TRADING_USERS.reduce((sum, u) => sum + u.balance, 0),
    totalEquity: TEST_TRADING_USERS.reduce((sum, u) => sum + u.equity, 0),
  });
});

app.get('/api/v1/monitor/stats', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  res.json({
    totalUsers: TEST_TRADING_USERS.length,
    activeUsers: TEST_TRADING_USERS.filter(u => u.status === 'active').length,
    totalPositions: TEST_POSITIONS.length,
    totalVolume: TEST_POSITIONS.reduce((sum, p) => sum + p.volume, 0),
    totalProfit: TEST_POSITIONS.reduce((sum, p) => sum + p.profit, 0),
  });
});

app.get('/api/account/info', async (req, res) => {
  await delay(MOCK_DELAY_MS);

  res.json({
    balance: 100000,
    equity: 105000,
    margin: 20000,
    freeMargin: 85000,
    marginLevel: 525,
  });
});

// ==================== Catch-all for unmatched routes ====================

app.all('*', (req, res) => {
  console.log(`[Mock] Unhandled request: ${req.method} ${req.path}`);
  res.status(404).json({
    message: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Mock MT5 Middleware Server running on port ${PORT}`);
  console.log(`Mock delay: ${MOCK_DELAY_MS}ms`);
  console.log(`Mock error rate: ${MOCK_ERROR_RATE * 100}%`);
});
