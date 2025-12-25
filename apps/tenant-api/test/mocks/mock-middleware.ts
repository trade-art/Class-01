/**
 * Mock Middleware HTTP Server
 * 使用 nock 模拟 MT5 中间件 API 响应
 */

import * as nock from 'nock';
import {
  TEST_TRADING_USERS,
  TEST_POSITIONS,
  TEST_QUOTES,
  TEST_HISTORY_ORDERS,
  TEST_DASHBOARD_STATS,
} from '../fixtures/test-data';

// 默认中间件 URL
const DEFAULT_MIDDLEWARE_URL = 'http://localhost:3001';

/**
 * Mock 中间件服务器类
 * 提供对 MT5 中间件 HTTP API 的模拟
 */
export class MockMiddlewareServer {
  private middlewareUrl: string;
  private isConnected = true;
  private mockToken = 'mock-jwt-token-12345';
  private refreshToken = 'mock-refresh-token-67890';

  constructor(middlewareUrl: string = DEFAULT_MIDDLEWARE_URL) {
    this.middlewareUrl = middlewareUrl;
  }

  /**
   * 设置所有中间件端点的 Mock
   */
  setup(): void {
    // 清除之前的 nock 拦截器
    nock.cleanAll();

    // 创建基础拦截器
    const scope = nock(this.middlewareUrl)
      .persist();

    // ==================== 认证端点 ====================
    this.setupAuthEndpoints(scope);

    // ==================== 健康检查端点 ====================
    this.setupHealthEndpoints(scope);

    // ==================== 用户管理端点 ====================
    this.setupUserEndpoints(scope);

    // ==================== 持仓端点 ====================
    this.setupPositionEndpoints(scope);

    // ==================== 报价端点 ====================
    this.setupQuoteEndpoints(scope);

    // ==================== 历史订单端点 ====================
    this.setupHistoryEndpoints(scope);

    // ==================== 监控统计端点 ====================
    this.setupMonitorEndpoints(scope);
  }

  /**
   * 认证相关端点
   */
  private setupAuthEndpoints(scope: nock.Scope): void {
    // 登录
    scope
      .post('/api/auth/login')
      .reply((uri, body: any) => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        // 模拟认证
        if (body.managerLogin && body.managerPassword) {
          return [200, {
            accessToken: this.mockToken,
            refreshToken: this.refreshToken,
            expiresIn: 3600,
            serverInfo: {
              name: 'MT5 Test Server',
              version: '5.0.0',
              serverTime: new Date().toISOString(),
            },
          }];
        }

        return [401, { message: 'Invalid credentials' }];
      });

    // 刷新令牌
    scope
      .post('/api/auth/refresh')
      .reply((uri, body: any) => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        if (body.refreshToken === this.refreshToken) {
          return [200, {
            accessToken: `new-${this.mockToken}-${Date.now()}`,
            refreshToken: `new-${this.refreshToken}-${Date.now()}`,
            expiresIn: 3600,
          }];
        }

        return [401, { message: 'Invalid refresh token' }];
      });

    // 登出
    scope
      .post('/api/auth/logout')
      .reply(() => {
        return [200, { success: true }];
      });
  }

  /**
   * 健康检查端点
   */
  private setupHealthEndpoints(scope: nock.Scope): void {
    // 健康检查
    scope
      .get('/api/health')
      .reply(() => {
        if (!this.isConnected) {
          return [503, { status: 'error', message: 'Service unavailable' }];
        }
        return [200, {
          status: 'ok',
          serverName: 'MT5 Test Server',
          connected: true,
          lastHeartbeat: new Date().toISOString(),
          latency: 50,
          version: '5.0.0',
        }];
      });

    // 连接测试
    scope
      .get('/api/test-connection')
      .reply(() => {
        if (!this.isConnected) {
          return [503, { success: false, error: 'Connection failed' }];
        }
        return [200, {
          success: true,
          latency: 45,
          serverVersion: '5.0.0',
          serverTime: new Date().toISOString(),
        }];
      });

    // 服务器状态
    scope
      .get('/api/server/status')
      .reply(() => {
        return [200, {
          connected: this.isConnected,
          serverTime: new Date().toISOString(),
          ping: 50,
          version: '5.0.0',
        }];
      });
  }

  /**
   * 用户管理端点
   */
  private setupUserEndpoints(scope: nock.Scope): void {
    // 用户列表
    scope
      .get('/api/account/users')
      .query(true)
      .reply((uri) => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        const url = new URL(uri, this.middlewareUrl);
        const params = Object.fromEntries(url.searchParams);
        let users = [...TEST_TRADING_USERS];

        // 搜索过滤
        if (params.search) {
          const search = params.search.toLowerCase();
          users = users.filter(
            (u) =>
              u.name.toLowerCase().includes(search) ||
              u.email.toLowerCase().includes(search) ||
              u.login.toString().includes(search),
          );
        }

        // 组别过滤
        if (params.group) {
          users = users.filter((u) => u.group === params.group);
        }

        // 状态过滤
        if (params.status) {
          users = users.filter((u) => u.status === params.status);
        }

        return [200, { users, total: users.length }];
      });

    // 用户详情
    scope
      .get(/\/api\/account\/users\/(\d+)$/)
      .reply((uri) => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        const match = uri.match(/\/api\/account\/users\/(\d+)$/);
        if (match) {
          const login = parseInt(match[1]);
          const user = TEST_TRADING_USERS.find((u) => u.login === login);
          if (user) {
            return [200, { ...user, leverage: user.leverage || 100 }];
          }
        }
        return [404, { message: 'User not found' }];
      });

    // 用户组别列表
    scope
      .get('/api/account/groups')
      .reply(() => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        const groups = Array.from(new Set(TEST_TRADING_USERS.map((u) => u.group)));
        return [200, {
          groups: groups.map((group) => ({
            name: group,
            description: `${group} Group`,
            leverage: 100,
          })),
        }];
      });

    // 更新用户组别
    scope
      .put(/\/api\/account\/users\/(\d+)\/group$/)
      .reply((uri, body: any) => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        const match = uri.match(/\/api\/account\/users\/(\d+)\/group$/);
        if (match) {
          const login = parseInt(match[1]);
          const user = TEST_TRADING_USERS.find((u) => u.login === login);
          if (user) {
            return [200, { ...user, group: body.group || user.group }];
          }
        }
        return [404, { message: 'User not found' }];
      });

    // 更新用户杠杆
    scope
      .put(/\/api\/account\/users\/(\d+)\/leverage$/)
      .reply((uri, body: any) => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        const match = uri.match(/\/api\/account\/users\/(\d+)\/leverage$/);
        if (match) {
          const login = parseInt(match[1]);
          const user = TEST_TRADING_USERS.find((u) => u.login === login);
          if (user) {
            return [200, { ...user, leverage: body.leverage || user.leverage || 100 }];
          }
        }
        return [404, { message: 'User not found' }];
      });

    // 更新用户状态
    scope
      .put(/\/api\/account\/users\/(\d+)\/status$/)
      .reply((uri, body: any) => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        const match = uri.match(/\/api\/account\/users\/(\d+)\/status$/);
        if (match) {
          const login = parseInt(match[1]);
          const user = TEST_TRADING_USERS.find((u) => u.login === login);
          if (user) {
            return [200, { ...user, status: body.status || user.status }];
          }
        }
        return [404, { message: 'User not found' }];
      });
  }

  /**
   * 持仓相关端点
   */
  private setupPositionEndpoints(scope: nock.Scope): void {
    // 持仓列表
    scope
      .get('/api/trading/positions')
      .query(true)
      .reply((uri) => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        const url = new URL(uri, this.middlewareUrl);
        const params = Object.fromEntries(url.searchParams);
        let positions = [...TEST_POSITIONS];

        // 品种过滤
        if (params.symbol) {
          positions = positions.filter((p) => p.symbol === params.symbol);
        }

        // 类型过滤
        if (params.type) {
          positions = positions.filter((p) => p.type === params.type);
        }

        // 用户过滤
        if (params.login) {
          positions = positions.filter((p) => p.login === parseInt(params.login));
        }

        return [200, { positions, total: positions.length }];
      });

    // 持仓统计
    scope
      .get('/api/trading/positions/stats')
      .reply(() => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        const positions = TEST_POSITIONS;
        const buyPositions = positions.filter((p) => p.type === 'buy');
        const sellPositions = positions.filter((p) => p.type === 'sell');

        return [200, {
          totalPositions: positions.length,
          buyCount: buyPositions.length,
          sellCount: sellPositions.length,
          totalVolume: positions.reduce((sum, p) => sum + p.volume, 0),
          totalProfit: positions.reduce((sum, p) => sum + p.profit, 0),
          buyVolume: buyPositions.reduce((sum, p) => sum + p.volume, 0),
          sellVolume: sellPositions.reduce((sum, p) => sum + p.volume, 0),
        }];
      });
  }

  /**
   * 报价相关端点
   */
  private setupQuoteEndpoints(scope: nock.Scope): void {
    // 所有报价
    scope
      .get('/api/quotes/symbols')
      .query(true)
      .reply((uri) => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        const url = new URL(uri, this.middlewareUrl);
        const params = Object.fromEntries(url.searchParams);
        let quotes = [...TEST_QUOTES];

        // 搜索过滤
        if (params.search) {
          const search = params.search.toUpperCase();
          quotes = quotes.filter((q) => q.symbol.includes(search));
        }

        // 品种列表过滤
        if (params.symbols) {
          const symbols = params.symbols.split(',');
          quotes = quotes.filter((q) => symbols.includes(q.symbol));
        }

        return [200, { quotes, total: quotes.length }];
      });

    // 单个品种报价
    scope
      .get(/\/api\/quotes\/symbols\/([A-Z]+)$/)
      .reply((uri) => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        const match = uri.match(/\/api\/quotes\/symbols\/([A-Z]+)$/);
        if (match) {
          const symbol = match[1];
          const quote = TEST_QUOTES.find((q) => q.symbol === symbol);
          if (quote) {
            return [200, quote];
          }
        }
        return [404, { message: 'Symbol not found' }];
      });

    // 品种详细信息
    scope
      .get(/\/api\/quotes\/symbols\/([A-Z]+)\/info$/)
      .reply((uri) => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        const match = uri.match(/\/api\/quotes\/symbols\/([A-Z]+)\/info$/);
        if (match) {
          const symbol = match[1];
          const quote = TEST_QUOTES.find((q) => q.symbol === symbol);
          if (quote) {
            return [200, {
              symbol: quote.symbol,
              description: `${quote.symbol} Description`,
              digits: 5,
              spread: quote.spread,
              contractSize: 100000,
              tradeMode: 'Full',
              currencyBase: quote.symbol.substring(0, 3),
              currencyProfit: quote.symbol.substring(3, 6),
            }];
          }
        }
        return [404, { message: 'Symbol not found' }];
      });
  }

  /**
   * 历史订单端点
   */
  private setupHistoryEndpoints(scope: nock.Scope): void {
    // 历史订单列表
    scope
      .get('/api/history/deals')
      .query(true)
      .reply((uri) => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        const url = new URL(uri, this.middlewareUrl);
        const params = Object.fromEntries(url.searchParams);
        let orders = [...TEST_HISTORY_ORDERS];

        // 时间范围过滤
        if (params.from) {
          const fromDate = new Date(params.from);
          orders = orders.filter((o) => new Date(o.closeTime) >= fromDate);
        }

        if (params.to) {
          const toDate = new Date(params.to);
          orders = orders.filter((o) => new Date(o.closeTime) <= toDate);
        }

        // 品种过滤
        if (params.symbol) {
          orders = orders.filter((o) => o.symbol === params.symbol);
        }

        // 用户过滤
        if (params.login) {
          orders = orders.filter((o) => o.login === parseInt(params.login));
        }

        return [200, { deals: orders, total: orders.length }];
      });

    // 单个订单详情
    scope
      .get(/\/api\/history\/deals\/(\d+)$/)
      .reply((uri) => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }

        const match = uri.match(/\/api\/history\/deals\/(\d+)$/);
        if (match) {
          const ticket = parseInt(match[1]);
          const order = TEST_HISTORY_ORDERS.find((o) => o.ticket === ticket);
          if (order) {
            return [200, order];
          }
        }
        return [404, { message: 'Order not found' }];
      });
  }

  /**
   * 监控统计端点
   */
  private setupMonitorEndpoints(scope: nock.Scope): void {
    // 仪表盘统计
    scope
      .get('/api/monitor/stats')
      .reply(() => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }
        return [200, TEST_DASHBOARD_STATS];
      });

    // 账户信息
    scope
      .get('/api/account/info')
      .reply(() => {
        if (!this.isConnected) {
          return [503, { message: 'Service unavailable' }];
        }
        return [200, {
          balance: 100000,
          equity: 105000,
          margin: 20000,
          freeMargin: 85000,
          marginLevel: 525,
        }];
      });
  }

  /**
   * 设置连接状态
   */
  setConnected(connected: boolean): void {
    this.isConnected = connected;
  }

  /**
   * 获取连接状态
   */
  getConnected(): boolean {
    return this.isConnected;
  }

  /**
   * 设置 Mock Token
   */
  setMockToken(token: string): void {
    this.mockToken = token;
  }

  /**
   * 获取 Mock Token
   */
  getMockToken(): string {
    return this.mockToken;
  }

  /**
   * 清理所有 Mock
   */
  cleanup(): void {
    nock.cleanAll();
  }

  /**
   * 重置 Mock 服务器状态
   */
  reset(): void {
    this.isConnected = true;
    this.mockToken = 'mock-jwt-token-12345';
    this.refreshToken = 'mock-refresh-token-67890';
    this.cleanup();
    this.setup();
  }

  /**
   * 模拟认证失败
   */
  simulateAuthFailure(): void {
    nock.cleanAll();
    const scope = nock(this.middlewareUrl).persist();

    scope
      .post('/api/auth/login')
      .reply(401, { message: 'Authentication failed' });

    scope
      .post('/api/auth/refresh')
      .reply(401, { message: 'Refresh token expired' });
  }

  /**
   * 模拟服务不可用
   */
  simulateServiceUnavailable(): void {
    this.setConnected(false);
    this.cleanup();
    this.setup();
  }

  /**
   * 模拟网络延迟
   * 通过在请求处理中添加延迟来模拟网络延迟
   */
  simulateLatency(delayMs: number): void {
    nock.cleanAll();

    // 使用带延迟的健康检查端点作为示例
    nock(this.middlewareUrl)
      .persist()
      .get('/api/health')
      .delay(delayMs)
      .reply(200, {
        status: 'ok',
        serverName: 'MT5 Test Server',
        connected: true,
        lastHeartbeat: new Date().toISOString(),
        latency: delayMs,
        version: '5.0.0',
      });

    // 重新设置其他端点（无延迟）
    const scope = nock(this.middlewareUrl).persist();
    this.setupAuthEndpoints(scope);
    this.setupUserEndpoints(scope);
    this.setupPositionEndpoints(scope);
    this.setupQuoteEndpoints(scope);
    this.setupHistoryEndpoints(scope);
    this.setupMonitorEndpoints(scope);
  }

  /**
   * 添加自定义拦截器
   */
  addCustomInterceptor(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    response: any,
    statusCode: number = 200,
  ): void {
    const scope = nock(this.middlewareUrl).persist();
    scope[method](path).reply(statusCode, response);
  }
}

/**
 * 创建并设置 Mock 中间件服务器
 */
export function createMockMiddlewareServer(
  middlewareUrl: string = DEFAULT_MIDDLEWARE_URL,
): MockMiddlewareServer {
  const server = new MockMiddlewareServer(middlewareUrl);
  server.setup();
  return server;
}

/**
 * 快速设置 Mock 中间件（适用于简单测试）
 */
export function setupMockMiddleware(middlewareUrl: string = DEFAULT_MIDDLEWARE_URL): void {
  const server = new MockMiddlewareServer(middlewareUrl);
  server.setup();
}

/**
 * 清理所有 Mock
 */
export function cleanupMockMiddleware(): void {
  nock.cleanAll();
}
