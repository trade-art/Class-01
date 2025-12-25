import { SetMetadata } from '@nestjs/common';

/**
 * 作用域元数据 Key
 */
export const REQUIRED_SCOPES_KEY = 'required_scopes';

/**
 * 声明 API 端点需要的作用域
 *
 * @example
 * // 需要读取交易数据权限
 * @RequireScopes('trading:read')
 * @Get('positions')
 * getPositions() {}
 *
 * @example
 * // 需要执行交易权限
 * @RequireScopes('trading:write')
 * @Post('orders')
 * createOrder() {}
 *
 * @example
 * // 需要多个权限 (满足任一即可)
 * @RequireScopes('trading:read', 'account:read')
 * @Get('summary')
 * getSummary() {}
 */
export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(REQUIRED_SCOPES_KEY, scopes);

/**
 * API Key 作用域枚举
 * 与前端 api-keys.ts 保持一致
 *
 * 命名规范: <category>:<action>
 * - category: users, positions, history, quotes, trading, reports, risk, settings, market, batch
 * - action: read, write, execute
 */
export enum ApiKeyScope {
  /** 所有权限 */
  ALL = '*',

  // ========== 用户/账户相关 ==========
  /** 读取用户/账户数据 */
  USERS_READ = 'users:read',
  /** 写入用户/账户数据 (创建、修改用户) */
  USERS_WRITE = 'users:write',

  // ========== 持仓相关 ==========
  /** 读取持仓数据 (WebSocket 实时推送) */
  POSITIONS_READ = 'positions:read',

  // ========== 交易历史 ==========
  /** 读取交易历史 (订单、成交记录) */
  HISTORY_READ = 'history:read',

  // ========== 行情相关 ==========
  /** 读取实时报价 (WebSocket 实时行情) */
  QUOTES_READ = 'quotes:read',
  /** 读取市场数据 (品种信息) */
  MARKET_READ = 'market:read',
  /** 读取市场历史数据 (K线、Tick) */
  MARKET_HISTORY = 'market:history',

  // ========== 交易操作 ==========
  /** 执行交易操作 (开仓/平仓/挂单/改单) */
  TRADING_EXECUTE = 'trading:execute',

  // ========== 批量操作 ==========
  /** 执行批量操作 (批量开仓/平仓/查询) */
  BATCH_EXECUTE = 'batch:execute',

  // ========== 报表相关 ==========
  /** 读取报表数据 */
  REPORTS_READ = 'reports:read',
  /** 导出报表 */
  REPORTS_EXPORT = 'reports:export',

  // ========== 风控相关 ==========
  /** 读取风控数据 */
  RISK_READ = 'risk:read',

  // ========== 设置相关 ==========
  /** 读取系统设置 */
  SETTINGS_READ = 'settings:read',
  /** 修改系统设置 */
  SETTINGS_WRITE = 'settings:write',

  // ========== 余额操作 ==========
  /** 余额调整操作 (入金/出金/信用) */
  BALANCE_WRITE = 'balance:write',

  // ========== 兼容旧版 (用于后端内部映射) ==========
  /** @deprecated 使用 USERS_READ */
  ACCOUNT_READ = 'account:read',
  /** @deprecated 使用 USERS_WRITE */
  ACCOUNT_WRITE = 'account:write',
  /** @deprecated 使用 HISTORY_READ + POSITIONS_READ */
  TRADING_READ = 'trading:read',
  /** @deprecated 使用 TRADING_EXECUTE */
  TRADING_WRITE = 'trading:write',
}
