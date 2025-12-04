/**
 * MiddlewareProxyService Mock
 * 模拟 MT5 中间件 API 响应
 */

import { Injectable } from '@nestjs/common';
import {
  TEST_TRADING_USERS,
  TEST_POSITIONS,
  TEST_QUOTES,
  TEST_HISTORY_ORDERS,
  TEST_DASHBOARD_STATS,
} from '../fixtures/test-data';

@Injectable()
export class MockMiddlewareProxyService {
  // 模拟服务状态
  private isConnected = true;

  /**
   * 通用请求方法
   */
  request = jest.fn().mockImplementation(
    async (
      method: string,
      path: string,
      instanceId: string,
      options?: { params?: any; data?: any },
    ) => {
      // 模拟服务不可用
      if (!this.isConnected) {
        throw new Error('Middleware service unavailable');
      }

      const params = options?.params;

      // 根据路径返回不同的模拟数据
      if (path.includes('/health')) {
        return this.getMockHealth();
      }

      if (path.includes('/monitor/stats')) {
        return TEST_DASHBOARD_STATS;
      }

      // 用户组别 - /account/groups
      if (path.match(/\/account\/groups$/)) {
        return { groups: this.getMockGroups() };
      }

      // 用户交易记录 - /account/users/:login/transactions
      const transactionsMatch = path.match(/\/account\/users\/(\d+)\/transactions$/);
      if (transactionsMatch) {
        return { transactions: [], total: 0 };
      }

      // 用户操作日志 - /account/users/:login/logs
      const logsMatch = path.match(/\/account\/users\/(\d+)\/logs$/);
      if (logsMatch) {
        return { logs: [], total: 0 };
      }

      // 用户详情 - /account/users/:login
      const userDetailMatch = path.match(/\/account\/users\/(\d+)$/);
      if (userDetailMatch && method === 'get') {
        const login = parseInt(userDetailMatch[1]);
        const user = TEST_TRADING_USERS.find((u) => u.login === login);
        if (!user) {
          const notFoundError = new Error('User not found') as any;
          notFoundError.response = { status: 404 };
          throw notFoundError;
        }
        return {
          ...user,
          leverage: user.leverage || 100,
          equity: user.equity || user.balance,
        };
      }

      // 用户组别更新 - /account/users/:login/group
      const userGroupMatch = path.match(/\/account\/users\/(\d+)\/group$/);
      if (userGroupMatch && method === 'put') {
        const login = parseInt(userGroupMatch[1]);
        const user = TEST_TRADING_USERS.find((u) => u.login === login);
        if (!user) {
          const notFoundError = new Error('User not found') as any;
          notFoundError.response = { status: 404 };
          throw notFoundError;
        }
        return { ...user, group: options?.data?.group || user.group };
      }

      // 用户杠杆更新 - /account/users/:login/leverage
      const userLeverageMatch = path.match(/\/account\/users\/(\d+)\/leverage$/);
      if (userLeverageMatch && method === 'put') {
        const login = parseInt(userLeverageMatch[1]);
        const user = TEST_TRADING_USERS.find((u) => u.login === login);
        if (!user) {
          const notFoundError = new Error('User not found') as any;
          notFoundError.response = { status: 404 };
          throw notFoundError;
        }
        return { ...user, leverage: options?.data?.leverage || user.leverage || 100 };
      }

      // 用户状态更新 - /account/users/:login/status
      const userStatusMatch = path.match(/\/account\/users\/(\d+)\/status$/);
      if (userStatusMatch && method === 'put') {
        const login = parseInt(userStatusMatch[1]);
        const user = TEST_TRADING_USERS.find((u) => u.login === login);
        if (!user) {
          const notFoundError = new Error('User not found') as any;
          notFoundError.response = { status: 404 };
          throw notFoundError;
        }
        return { ...user, status: options?.data?.status || user.status };
      }

      // 用户列表 - /account/users
      if (path.includes('/account/users')) {
        return this.getMockUsers(params);
      }

      if (path.includes('/trading/positions/stats')) {
        return this.getMockPositionStats();
      }

      if (path.includes('/trading/positions')) {
        return this.getMockPositions(params);
      }

      if (path.includes('/quotes/symbols')) {
        return this.getMockQuotes(params);
      }

      // 历史订单 - /history/deals/:ticket (单个订单详情)
      const dealDetailMatch = path.match(/\/history\/deals\/(\d+)$/);
      if (dealDetailMatch) {
        const ticket = parseInt(dealDetailMatch[1]);
        const order = TEST_HISTORY_ORDERS.find((o) => o.ticket === ticket);
        if (!order) {
          const notFoundError = new Error('Order not found') as any;
          notFoundError.response = { status: 404 };
          throw notFoundError;
        }
        return order;
      }

      // 历史订单 - /history/deals (列表)
      if (path.includes('/history/deals')) {
        return this.getMockHistory(params);
      }

      if (path.includes('/trading/history')) {
        return this.getMockHistory(params);
      }

      // 默认返回空对象
      return {};
    },
  );

  /**
   * 获取服务器状态
   */
  getServerStatus = jest.fn().mockImplementation(async (instanceId: string) => {
    return {
      connected: this.isConnected,
      serverTime: new Date().toISOString(),
      ping: 50,
      version: '5.0.0',
    };
  });

  /**
   * 获取账户信息
   */
  getAccountInfo = jest.fn().mockImplementation(async (instanceId: string) => {
    return {
      balance: 100000,
      equity: 105000,
      margin: 20000,
      freeMargin: 85000,
      marginLevel: 525,
    };
  });

  /**
   * 获取持仓列表
   */
  getPositions = jest.fn().mockImplementation(async (instanceId: string) => {
    return TEST_POSITIONS;
  });

  /**
   * 获取报价列表
   */
  getQuotes = jest.fn().mockImplementation(async (instanceId: string) => {
    return TEST_QUOTES;
  });

  /**
   * 获取所有报价 (用于 QuotesService)
   */
  getAllQuotes = jest.fn().mockImplementation(async (instanceId: string) => {
    if (!this.isConnected) {
      throw new Error('Middleware service unavailable');
    }
    return TEST_QUOTES;
  });

  /**
   * 获取指定品种列表的报价 (用于 QuotesService 自选功能)
   */
  getQuotesBySymbols = jest.fn().mockImplementation(
    async (instanceId: string, symbols: string[]) => {
      if (!this.isConnected) {
        throw new Error('Middleware service unavailable');
      }
      return TEST_QUOTES.filter((q) => symbols.includes(q.symbol));
    },
  );

  /**
   * 获取交易历史
   */
  getDeals = jest.fn().mockImplementation(
    async (instanceId: string, params?: any) => {
      return {
        deals: TEST_HISTORY_ORDERS,
        total: TEST_HISTORY_ORDERS.length,
      };
    },
  );

  /**
   * 获取历史订单
   */
  getOrders = jest.fn().mockImplementation(
    async (instanceId: string, params?: any) => {
      if (!this.isConnected) {
        throw new Error('Middleware service unavailable');
      }
      let orders = [...TEST_HISTORY_ORDERS];
      // 时间范围过滤
      if (params?.from) {
        const fromDate = new Date(params.from);
        orders = orders.filter((o) => new Date(o.closeTime) >= fromDate);
      }
      if (params?.to) {
        const toDate = new Date(params.to);
        orders = orders.filter((o) => new Date(o.closeTime) <= toDate);
      }
      // 品种过滤
      if (params?.symbol) {
        orders = orders.filter((o) => o.symbol === params.symbol);
      }
      // 用户过滤
      if (params?.login) {
        orders = orders.filter((o) => o.login === parseInt(params.login));
      }
      return {
        orders,
        total: orders.length,
      };
    },
  );

  /**
   * 获取品种列表
   */
  getSymbols = jest.fn().mockImplementation(async (instanceId: string) => {
    if (!this.isConnected) {
      throw new Error('Middleware service unavailable');
    }
    return TEST_QUOTES.map((q) => ({
      symbol: q.symbol,
      description: `${q.symbol} Description`,
      digits: 5,
      spread: q.spread,
      contractSize: 100000,
      tradeMode: 'Full',
    }));
  });

  /**
   * 获取单个品种报价
   */
  getSymbolQuote = jest.fn().mockImplementation(
    async (instanceId: string, symbol: string) => {
      if (!this.isConnected) {
        throw new Error('Middleware service unavailable');
      }
      return TEST_QUOTES.find((q) => q.symbol === symbol) || null;
    },
  );

  /**
   * 获取单个品种报价 (别名，用于 QuotesService)
   */
  getQuoteBySymbol = jest.fn().mockImplementation(
    async (instanceId: string, symbol: string) => {
      if (!this.isConnected) {
        throw new Error('Middleware service unavailable');
      }
      const quote = TEST_QUOTES.find((q) => q.symbol === symbol);
      if (!quote) {
        throw new Error('Symbol not found');
      }
      return quote;
    },
  );

  /**
   * 获取品种详细信息
   */
  getSymbolInfo = jest.fn().mockImplementation(
    async (instanceId: string, symbol: string) => {
      if (!this.isConnected) {
        throw new Error('Middleware service unavailable');
      }
      const quote = TEST_QUOTES.find((q) => q.symbol === symbol);
      if (!quote) {
        throw new Error('Symbol not found');
      }
      return {
        symbol: quote.symbol,
        description: `${quote.symbol} Description`,
        digits: 5,
        spread: quote.spread,
        contractSize: 100000,
        tradeMode: 'Full',
        currencyBase: quote.symbol.substring(0, 3),
        currencyProfit: quote.symbol.substring(3, 6),
      };
    },
  );

  /**
   * 测试连接
   */
  testConnection = jest.fn().mockImplementation(async (instanceId: string) => {
    return this.isConnected;
  });

  // ==================== 私有辅助方法 ====================

  private getMockHealth() {
    return {
      serverName: 'MT5 Test Server',
      connected: this.isConnected,
      lastHeartbeat: new Date().toISOString(),
      latency: 50,
      version: '5.0.0',
    };
  }

  private getMockGroups() {
    const groups = [...new Set(TEST_TRADING_USERS.map((u) => u.group))];
    return groups.map((group) => ({
      name: group,
      description: `${group} Group`,
      leverage: 100,
    }));
  }

  private getMockUsers(params?: any) {
    let users = [...TEST_TRADING_USERS];

    // 搜索过滤
    if (params?.search) {
      const search = params.search.toLowerCase();
      users = users.filter(
        (u) =>
          u.name.toLowerCase().includes(search) ||
          u.email.toLowerCase().includes(search) ||
          u.login.toString().includes(search),
      );
    }

    // 组别过滤
    if (params?.group) {
      users = users.filter((u) => u.group === params.group);
    }

    // 状态过滤
    if (params?.status) {
      users = users.filter((u) => u.status === params.status);
    }

    return {
      users,
      total: users.length,
    };
  }

  private getMockPositions(params?: any) {
    let positions = [...TEST_POSITIONS];

    // 品种过滤
    if (params?.symbol) {
      positions = positions.filter((p) => p.symbol === params.symbol);
    }

    // 类型过滤
    if (params?.type) {
      positions = positions.filter((p) => p.type === params.type);
    }

    // 用户过滤
    if (params?.login) {
      positions = positions.filter((p) => p.login === parseInt(params.login));
    }

    return positions;
  }

  private getMockPositionStats() {
    const positions = TEST_POSITIONS;
    const buyPositions = positions.filter((p) => p.type === 'buy');
    const sellPositions = positions.filter((p) => p.type === 'sell');

    return {
      totalPositions: positions.length,
      buyCount: buyPositions.length,
      sellCount: sellPositions.length,
      totalVolume: positions.reduce((sum, p) => sum + p.volume, 0),
      totalProfit: positions.reduce((sum, p) => sum + p.profit, 0),
      buyVolume: buyPositions.reduce((sum, p) => sum + p.volume, 0),
      sellVolume: sellPositions.reduce((sum, p) => sum + p.volume, 0),
    };
  }

  private getMockQuotes(params?: any) {
    let quotes = [...TEST_QUOTES];

    // 搜索过滤
    if (params?.search) {
      const search = params.search.toUpperCase();
      quotes = quotes.filter((q) => q.symbol.includes(search));
    }

    return quotes;
  }

  private getMockHistory(params?: any) {
    let orders = [...TEST_HISTORY_ORDERS];

    // 时间范围过滤
    if (params?.from) {
      const fromDate = new Date(params.from);
      orders = orders.filter((o) => new Date(o.closeTime) >= fromDate);
    }

    if (params?.to) {
      const toDate = new Date(params.to);
      orders = orders.filter((o) => new Date(o.closeTime) <= toDate);
    }

    // 品种过滤
    if (params?.symbol) {
      orders = orders.filter((o) => o.symbol === params.symbol);
    }

    // 用户过滤
    if (params?.login) {
      orders = orders.filter((o) => o.login === parseInt(params.login));
    }

    // 返回格式必须是 { deals, total } 以匹配 HistoryService 期望
    return {
      deals: orders,
      total: orders.length,
    };
  }

  // ==================== 测试辅助方法 ====================

  /**
   * 设置连接状态 (用于测试)
   */
  setConnected(connected: boolean) {
    this.isConnected = connected;
  }

  /**
   * 重置所有 Mock
   */
  resetMocks() {
    this.isConnected = true;
    jest.clearAllMocks();
  }
}
