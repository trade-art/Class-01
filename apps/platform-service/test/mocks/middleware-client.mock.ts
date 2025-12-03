/**
 * Middleware Client Service Mock
 * 用于 E2E 测试的模拟中间件客户端
 */

import { Injectable } from '@nestjs/common';

/**
 * 模拟的中间件健康数据
 */
export const MOCK_HEALTH_DATA = {
  status: 'healthy',
  version: '1.0.0',
  uptime: 86400,
  connections: {
    mt5: 5,
    websocket: 10,
  },
  memory: {
    used: 256,
    total: 512,
  },
  cpu: 25,
};

/**
 * 模拟的交易用户数据
 */
export const MOCK_TRADING_USERS = [
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
  },
];

/**
 * 模拟的持仓数据
 */
export const MOCK_POSITIONS = [
  {
    ticket: 12345,
    login: 1001,
    symbol: 'EURUSD',
    type: 'buy',
    volume: 1.0,
    openPrice: 1.085,
    currentPrice: 1.0875,
    profit: 250,
    swap: -2.5,
    commission: -7,
    openTime: '2024-01-15T10:30:00Z',
  },
];

/**
 * 模拟的报价数据
 */
export const MOCK_QUOTES = [
  {
    symbol: 'EURUSD',
    bid: 1.085,
    ask: 1.0852,
    last: 1.0851,
    volume: 1000,
    time: '2024-01-15T10:30:00Z',
    spread: 2,
  },
  {
    symbol: 'GBPUSD',
    bid: 1.265,
    ask: 1.2652,
    last: 1.2651,
    volume: 800,
    time: '2024-01-15T10:30:00Z',
    spread: 2,
  },
];

/**
 * 模拟的历史订单数据
 */
export const MOCK_HISTORY_ORDERS = [
  {
    ticket: 11111,
    login: 1001,
    symbol: 'EURUSD',
    type: 'buy',
    volume: 1.0,
    price: 1.085,
    profit: 500,
    swap: -5,
    commission: -7,
    time: '2024-01-12T15:00:00Z',
  },
];

@Injectable()
export class MockMiddlewareClientService {
  private shouldFail = false;
  private errorMessage = 'Connection refused';

  /**
   * 发送 GET 请求到中间件实例
   */
  async get<T>(instance: any, path: string, config?: any): Promise<T> {
    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }

    // 根据路径返回不同的模拟数据
    if (path === '/health') {
      return MOCK_HEALTH_DATA as T;
    }
    if (path.includes('/users') && !path.includes('/')) {
      return { users: MOCK_TRADING_USERS, total: MOCK_TRADING_USERS.length } as T;
    }
    if (path.includes('/positions')) {
      return { positions: MOCK_POSITIONS, total: MOCK_POSITIONS.length } as T;
    }
    if (path.includes('/quotes')) {
      return { quotes: MOCK_QUOTES } as T;
    }
    if (path.includes('/history')) {
      return { orders: MOCK_HISTORY_ORDERS, total: MOCK_HISTORY_ORDERS.length } as T;
    }

    return {} as T;
  }

  /**
   * 发送 POST 请求到中间件实例
   */
  async post<T>(instance: any, path: string, data?: any, config?: any): Promise<T> {
    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }

    return { success: true, data } as T;
  }

  /**
   * 发送 PUT 请求到中间件实例
   */
  async put<T>(instance: any, path: string, data?: any, config?: any): Promise<T> {
    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }

    return { success: true, data } as T;
  }

  /**
   * 发送 DELETE 请求到中间件实例
   */
  async delete<T>(instance: any, path: string, config?: any): Promise<T> {
    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }

    return { success: true } as T;
  }

  /**
   * 测试中间件连接
   */
  async testConnection(instance: any): Promise<{
    success: boolean;
    latencyMs: number;
    message?: string;
  }> {
    if (this.shouldFail) {
      return {
        success: false,
        latencyMs: 0,
        message: this.errorMessage,
      };
    }

    return {
      success: true,
      latencyMs: 45,
    };
  }

  // ==================== 测试辅助方法 ====================

  /**
   * 设置 Mock 失败
   */
  setFail(shouldFail: boolean, errorMessage?: string) {
    this.shouldFail = shouldFail;
    if (errorMessage) {
      this.errorMessage = errorMessage;
    }
  }

  /**
   * 重置 Mock
   */
  reset() {
    this.shouldFail = false;
    this.errorMessage = 'Connection refused';
  }
}
