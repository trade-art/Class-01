import { faker } from '@faker-js/faker';

/**
 * Trading user (MT5/MT4 account) test data interface
 */
export interface TradingUserData {
  login: number;
  group: string;
  name: string;
  email: string;
  phone?: string;
  country?: string;
  leverage: number;
  balance: number;
  credit: number;
  equity: number;
  margin: number;
  marginFree: number;
  marginLevel: number;
  profit: number;
  status: 'active' | 'disabled' | 'readonly';
  registration: string;
  lastAccess?: string;
  comment?: string;
}

/**
 * Trading position test data interface
 */
export interface TradingPositionData {
  ticket: number;
  login: number;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  openTime: string;
  comment?: string;
}

/**
 * Trading order test data interface
 */
export interface TradingOrderData {
  ticket: number;
  login: number;
  symbol: string;
  type: 'buy_limit' | 'sell_limit' | 'buy_stop' | 'sell_stop';
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  state: 'pending' | 'filled' | 'cancelled' | 'expired';
  timeSetup: string;
  expiration?: string;
  comment?: string;
}

/**
 * Factory for generating trading user test data
 */
export class TradingUserFactory {
  private static loginCounter = 100000;

  /**
   * Create a single trading user with default or custom data
   */
  static create(overrides: Partial<TradingUserData> = {}): TradingUserData {
    const balance = overrides.balance ?? faker.number.float({ min: 1000, max: 100000, fractionDigits: 2 });
    const credit = overrides.credit ?? 0;
    const profit = overrides.profit ?? faker.number.float({ min: -1000, max: 5000, fractionDigits: 2 });
    const equity = balance + credit + profit;
    const margin = overrides.margin ?? faker.number.float({ min: 0, max: equity * 0.5, fractionDigits: 2 });
    const marginFree = equity - margin;
    const marginLevel = margin > 0 ? (equity / margin) * 100 : 0;

    return {
      login: overrides.login ?? this.loginCounter++,
      group: overrides.group || 'demo\\standard',
      name: overrides.name || faker.person.fullName(),
      email: overrides.email || faker.internet.email(),
      phone: overrides.phone || faker.phone.number(),
      country: overrides.country || faker.location.country(),
      leverage: overrides.leverage ?? 100,
      balance,
      credit,
      equity,
      margin,
      marginFree,
      marginLevel: parseFloat(marginLevel.toFixed(2)),
      profit,
      status: overrides.status || 'active',
      registration: overrides.registration || faker.date.past({ years: 2 }).toISOString(),
      lastAccess: overrides.lastAccess || faker.date.recent().toISOString(),
      comment: overrides.comment,
    };
  }

  /**
   * Create multiple trading users
   */
  static createMany(count: number, overrides: Partial<TradingUserData> = {}): TradingUserData[] {
    return Array.from({ length: count }, () => this.create(overrides));
  }

  /**
   * Create a trading user with large balance
   */
  static createVIP(overrides: Partial<TradingUserData> = {}): TradingUserData {
    return this.create({
      ...overrides,
      group: 'real\\vip',
      balance: faker.number.float({ min: 100000, max: 1000000, fractionDigits: 2 }),
      leverage: 200,
    });
  }

  /**
   * Create a trading user with margin call
   */
  static createMarginCall(overrides: Partial<TradingUserData> = {}): TradingUserData {
    const balance = 1000;
    const margin = 900;
    const profit = -800;

    return this.create({
      ...overrides,
      balance,
      margin,
      profit,
      marginLevel: ((balance + profit) / margin) * 100,
    });
  }

  /**
   * Create a disabled trading user
   */
  static createDisabled(overrides: Partial<TradingUserData> = {}): TradingUserData {
    return this.create({
      ...overrides,
      status: 'disabled',
    });
  }

  /**
   * Create a position for a trading user
   */
  static createPosition(login: number, overrides: Partial<TradingPositionData> = {}): TradingPositionData {
    const type = overrides.type || (faker.datatype.boolean() ? 'buy' : 'sell');
    const openPrice = overrides.openPrice ?? faker.number.float({ min: 1.0, max: 2.0, fractionDigits: 5 });
    const currentPrice = overrides.currentPrice ?? openPrice * (1 + faker.number.float({ min: -0.01, max: 0.01 }));
    const volume = overrides.volume ?? faker.number.float({ min: 0.01, max: 10, fractionDigits: 2 });
    const profit = type === 'buy'
      ? (currentPrice - openPrice) * volume * 100000
      : (openPrice - currentPrice) * volume * 100000;

    return {
      ticket: overrides.ticket ?? faker.number.int({ min: 10000000, max: 99999999 }),
      login,
      symbol: overrides.symbol || faker.helpers.arrayElement(['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD']),
      type,
      volume,
      openPrice,
      currentPrice,
      sl: overrides.sl ?? 0,
      tp: overrides.tp ?? 0,
      profit: parseFloat(profit.toFixed(2)),
      swap: overrides.swap ?? faker.number.float({ min: -10, max: 10, fractionDigits: 2 }),
      openTime: overrides.openTime || faker.date.recent().toISOString(),
      comment: overrides.comment,
    };
  }

  /**
   * Create multiple positions for a trading user
   */
  static createPositions(login: number, count: number): TradingPositionData[] {
    return Array.from({ length: count }, () => this.createPosition(login));
  }

  /**
   * Create a pending order for a trading user
   */
  static createOrder(login: number, overrides: Partial<TradingOrderData> = {}): TradingOrderData {
    const type = overrides.type || faker.helpers.arrayElement(['buy_limit', 'sell_limit', 'buy_stop', 'sell_stop']);
    const currentPrice = overrides.currentPrice ?? faker.number.float({ min: 1.0, max: 2.0, fractionDigits: 5 });

    let openPrice: number;
    if (type.includes('limit')) {
      openPrice = type === 'buy_limit' ? currentPrice * 0.99 : currentPrice * 1.01;
    } else {
      openPrice = type === 'buy_stop' ? currentPrice * 1.01 : currentPrice * 0.99;
    }

    return {
      ticket: overrides.ticket ?? faker.number.int({ min: 10000000, max: 99999999 }),
      login,
      symbol: overrides.symbol || faker.helpers.arrayElement(['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD']),
      type,
      volume: overrides.volume ?? faker.number.float({ min: 0.01, max: 10, fractionDigits: 2 }),
      openPrice: parseFloat(openPrice.toFixed(5)),
      currentPrice,
      sl: overrides.sl ?? 0,
      tp: overrides.tp ?? 0,
      state: overrides.state || 'pending',
      timeSetup: overrides.timeSetup || faker.date.recent().toISOString(),
      expiration: overrides.expiration,
      comment: overrides.comment,
    };
  }

  /**
   * Create multiple orders for a trading user
   */
  static createOrders(login: number, count: number): TradingOrderData[] {
    return Array.from({ length: count }, () => this.createOrder(login));
  }
}
