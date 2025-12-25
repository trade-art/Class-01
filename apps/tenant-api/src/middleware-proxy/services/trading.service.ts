import { Injectable, Logger } from '@nestjs/common';
import { MtServerService } from './mt-server.service';
import { AdapterFactory } from '../adapters/adapter.factory';
import { TradingPlatformAdapter } from '../adapters/trading-platform.adapter';
import {
  TradingUser,
  TradingPosition,
  TradingOrder,
  TradingDeal,
  TradingSymbol,
  TradingQuote,
  PaginatedResult,
  GetUsersParams,
  GetPositionsParams,
  GetOrdersParams,
  GetDealsParams,
  GetSymbolsParams,
  ServerStatus,
  MtServerConfig,
  // 交易操作类型
  OpenOrderParams,
  ClosePositionParams,
  ModifyPositionParams,
  PendingOrderParams,
  ModifyOrderParams,
  CancelOrderParams,
  BalanceOperationParams,
  TradeResult,
  // 用户管理类型
  CreateUserParams,
  UpdateUserParams,
  ChangePasswordParams,
  CreateUserResult,
  // 市场数据类型
  CandleData,
  TickData,
  GetCandlesParams,
  GetTicksParams,
  // 批量操作类型
  BatchOpenOrderParams,
  BatchClosePositionParams,
  BatchOperationResult,
} from '../adapters/types';
import { MiddlewareUnavailableException } from '../exceptions';

/**
 * 租户上下文
 * 用于标识请求的租户和可选的服务器
 */
export interface TenantContext {
  tenantId: string;
  serverId?: string; // 可选，不传则使用默认服务器
}

/**
 * 交易服务
 * 提供多租户路由的统一交易接口
 * 自动解析租户的 MT 服务器配置并路由到相应的适配器
 */
@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(
    private readonly mtServerService: MtServerService,
    private readonly adapterFactory: AdapterFactory,
  ) {}

  // ============================================================
  // 适配器获取
  // ============================================================

  /**
   * 获取租户的交易适配器
   * 如果指定了 serverId，使用指定服务器；否则使用默认服务器
   * 会先检查熔断器状态，如果熔断器打开则抛出异常
   */
  async getAdapter(ctx: TenantContext): Promise<TradingPlatformAdapter> {
    const serverConfig = await this.getServerConfig(ctx);

    // 检查熔断器状态
    this.checkCircuitBreaker(ctx.tenantId, serverConfig.serverId);

    return this.adapterFactory.getAdapter(serverConfig);
  }

  /**
   * 获取租户的服务器配置
   */
  private async getServerConfig(ctx: TenantContext): Promise<MtServerConfig> {
    if (ctx.serverId) {
      return this.mtServerService.getServerConfig(ctx.tenantId, ctx.serverId);
    }
    return this.mtServerService.getDefaultServerConfig(ctx.tenantId);
  }

  // ============================================================
  // 认证方法
  // ============================================================

  /**
   * 认证适配器
   * 使用服务器配置的管理员凭证进行认证
   */
  async authenticate(ctx: TenantContext): Promise<string> {
    const serverConfig = await this.getServerConfig(ctx);
    const adapter = await this.adapterFactory.getAdapter(serverConfig);

    return adapter.authenticate(
      serverConfig.managerLogin,
      serverConfig.managerPassword,
    );
  }

  /**
   * 刷新认证令牌
   */
  async refreshToken(ctx: TenantContext): Promise<string> {
    const adapter = await this.getAdapter(ctx);
    return adapter.refreshToken();
  }

  // ============================================================
  // 用户管理
  // ============================================================

  /**
   * 获取用户列表
   */
  async getUsers(
    ctx: TenantContext,
    params?: GetUsersParams,
  ): Promise<PaginatedResult<TradingUser>> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);
    return adapter.getUsers(params);
  }

  /**
   * 获取单个用户
   */
  async getUser(ctx: TenantContext, login: number): Promise<TradingUser | null> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);
    return adapter.getUser(login);
  }

  /**
   * 更新用户组
   */
  async updateUserGroup(
    ctx: TenantContext,
    login: number,
    newGroup: string,
  ): Promise<boolean> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);
    return adapter.updateUserGroup(login, newGroup);
  }

  // ============================================================
  // 持仓管理
  // ============================================================

  /**
   * 获取持仓列表
   */
  async getPositions(
    ctx: TenantContext,
    params?: GetPositionsParams,
  ): Promise<TradingPosition[]> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);
    return adapter.getPositions(params);
  }

  /**
   * 获取用户持仓
   */
  async getUserPositions(
    ctx: TenantContext,
    login: number,
  ): Promise<TradingPosition[]> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);
    return adapter.getUserPositions(login);
  }

  // ============================================================
  // 订单管理
  // ============================================================

  /**
   * 获取订单列表
   */
  async getOrders(
    ctx: TenantContext,
    params?: GetOrdersParams,
  ): Promise<TradingOrder[]> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);
    return adapter.getOrders(params);
  }

  /**
   * 获取用户订单
   */
  async getUserOrders(
    ctx: TenantContext,
    login: number,
  ): Promise<TradingOrder[]> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);
    return adapter.getUserOrders(login);
  }

  // ============================================================
  // 成交记录
  // ============================================================

  /**
   * 获取成交列表
   */
  async getDeals(
    ctx: TenantContext,
    params?: GetDealsParams,
  ): Promise<PaginatedResult<TradingDeal>> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);
    return adapter.getDeals(params);
  }

  /**
   * 获取用户成交记录
   */
  async getUserDeals(
    ctx: TenantContext,
    login: number,
    from?: Date,
    to?: Date,
  ): Promise<TradingDeal[]> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);
    return adapter.getUserDeals(login, from, to);
  }

  // ============================================================
  // 品种和报价
  // ============================================================

  /**
   * 获取品种列表
   */
  async getSymbols(
    ctx: TenantContext,
    params?: GetSymbolsParams,
  ): Promise<TradingSymbol[]> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);
    return adapter.getSymbols(params);
  }

  /**
   * 获取单个品种
   */
  async getSymbol(
    ctx: TenantContext,
    symbol: string,
  ): Promise<TradingSymbol | null> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);
    return adapter.getSymbol(symbol);
  }

  /**
   * 获取单个品种报价
   */
  async getQuote(ctx: TenantContext, symbol: string): Promise<TradingQuote | null> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);
    return adapter.getQuote(symbol);
  }

  /**
   * 批量获取品种报价
   */
  async getQuotes(ctx: TenantContext, symbols: string[]): Promise<TradingQuote[]> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);
    return adapter.getQuotes(symbols);
  }

  // ============================================================
  // 服务器状态
  // ============================================================

  /**
   * 获取服务器状态
   */
  async getServerStatus(ctx: TenantContext): Promise<ServerStatus> {
    const adapter = await this.getAdapter(ctx);
    return adapter.getServerStatus();
  }

  /**
   * 测试服务器连接
   */
  async testConnection(ctx: TenantContext): Promise<boolean> {
    const adapter = await this.getAdapter(ctx);
    return adapter.testConnection();
  }

  // ============================================================
  // 统计和汇总
  // ============================================================

  /**
   * 获取账户摘要统计
   */
  async getAccountSummary(
    ctx: TenantContext,
    login: number,
  ): Promise<{
    user: TradingUser | null;
    positionsCount: number;
    totalProfit: number;
    totalVolume: number;
  }> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);

    const [user, positions] = await Promise.all([
      adapter.getUser(login),
      adapter.getUserPositions(login),
    ]);

    const totalProfit = positions.reduce((sum, p) => sum + p.profit, 0);
    const totalVolume = positions.reduce((sum, p) => sum + p.volume, 0);

    return {
      user,
      positionsCount: positions.length,
      totalProfit,
      totalVolume,
    };
  }

  /**
   * 获取持仓统计（按品种分组）
   */
  async getPositionsSummary(
    ctx: TenantContext,
    login?: number,
  ): Promise<{
    totalPositions: number;
    totalVolume: number;
    totalProfit: number;
    bySymbol: { symbol: string; count: number; profit: number; volume: number }[];
  }> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);

    const positions = login
      ? await adapter.getUserPositions(login)
      : await adapter.getPositions();

    // 按品种分组统计
    const bySymbolMap = new Map<
      string,
      { count: number; profit: number; volume: number }
    >();

    for (const pos of positions) {
      const existing = bySymbolMap.get(pos.symbol) || {
        count: 0,
        profit: 0,
        volume: 0,
      };
      bySymbolMap.set(pos.symbol, {
        count: existing.count + 1,
        profit: existing.profit + pos.profit,
        volume: existing.volume + pos.volume,
      });
    }

    const bySymbol = Array.from(bySymbolMap.entries()).map(([symbol, stats]) => ({
      symbol,
      ...stats,
    }));

    return {
      totalPositions: positions.length,
      totalVolume: positions.reduce((sum, p) => sum + p.volume, 0),
      totalProfit: positions.reduce((sum, p) => sum + p.profit, 0),
      bySymbol,
    };
  }

  // ============================================================
  // 批量操作
  // ============================================================

  /**
   * 批量获取多个用户的持仓
   */
  async getBatchUserPositions(
    ctx: TenantContext,
    logins: number[],
  ): Promise<Map<number, TradingPosition[]>> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);

    const results = new Map<number, TradingPosition[]>();

    // 并发获取，但限制并发数
    const batchSize = 10;
    for (let i = 0; i < logins.length; i += batchSize) {
      const batch = logins.slice(i, i + batchSize);
      const promises = batch.map(async (login) => {
        try {
          const positions = await adapter.getUserPositions(login);
          return { login, positions };
        } catch (error) {
          this.logger.warn(`获取用户 ${login} 持仓失败`, error);
          return { login, positions: [] };
        }
      });

      const batchResults = await Promise.all(promises);
      for (const { login, positions } of batchResults) {
        results.set(login, positions);
      }
    }

    return results;
  }

  /**
   * 批量获取多个用户的订单
   */
  async getBatchUserOrders(
    ctx: TenantContext,
    logins: number[],
  ): Promise<Map<number, TradingOrder[]>> {
    const adapter = await this.getAdapter(ctx);
    await this.ensureAuthenticated(ctx, adapter);

    const results = new Map<number, TradingOrder[]>();

    const batchSize = 10;
    for (let i = 0; i < logins.length; i += batchSize) {
      const batch = logins.slice(i, i + batchSize);
      const promises = batch.map(async (login) => {
        try {
          const orders = await adapter.getUserOrders(login);
          return { login, orders };
        } catch (error) {
          this.logger.warn(`获取用户 ${login} 订单失败`, error);
          return { login, orders: [] };
        }
      });

      const batchResults = await Promise.all(promises);
      for (const { login, orders } of batchResults) {
        results.set(login, orders);
      }
    }

    return results;
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 确保适配器已认证
   * 如果未认证或令牌即将过期（5分钟内），自动进行认证或刷新
   */
  private async ensureAuthenticated(
    ctx: TenantContext,
    adapter: TradingPlatformAdapter,
  ): Promise<void> {
    // 如果未认证，执行完整认证流程
    if (!adapter.isAuthenticated()) {
      const serverConfig = await this.getServerConfig(ctx);
      await adapter.authenticate(
        serverConfig.managerLogin,
        serverConfig.managerPassword,
      );
      return;
    }

    // 如果令牌即将过期（5分钟内），主动刷新令牌
    if (adapter.isTokenExpiring(5)) {
      try {
        this.logger.log(
          `令牌即将过期，主动刷新 (租户: ${ctx.tenantId}, 服务器: ${ctx.serverId || 'default'})`,
        );
        await adapter.refreshToken();
        this.logger.log(
          `令牌刷新成功 (租户: ${ctx.tenantId}, 服务器: ${ctx.serverId || 'default'})`,
        );
      } catch (error) {
        // 刷新失败时，尝试重新认证
        this.logger.warn(
          `令牌刷新失败，尝试重新认证 (租户: ${ctx.tenantId}, 错误: ${error instanceof Error ? error.message : '未知错误'})`,
        );
        const serverConfig = await this.getServerConfig(ctx);
        await adapter.authenticate(
          serverConfig.managerLogin,
          serverConfig.managerPassword,
        );
      }
    }
  }

  /**
   * 检查熔断器状态
   * 如果熔断器打开，抛出 MiddlewareUnavailableException
   */
  private checkCircuitBreaker(tenantId: string, serverId: string): void {
    if (this.adapterFactory.isCircuitBreakerOpen(tenantId, serverId)) {
      this.logger.warn(
        `熔断器已打开，拒绝请求 (租户: ${tenantId}, 服务器: ${serverId})`,
      );
      throw new MiddlewareUnavailableException({
        tenantId,
        serverId,
        message: `MT 服务器 ${serverId} 暂时不可用，熔断器已打开`,
        retryAfter: 30,
      });
    }
  }

  /**
   * 记录请求成功
   */
  private recordSuccess(tenantId: string, serverId: string): void {
    this.adapterFactory.recordSuccess(tenantId, serverId);
  }

  /**
   * 记录请求失败
   */
  private recordFailure(tenantId: string, serverId: string): void {
    this.adapterFactory.recordFailure(tenantId, serverId);
  }

  /**
   * 执行带熔断器保护的适配器操作
   * @param ctx 租户上下文
   * @param operation 要执行的操作
   * @returns 操作结果
   */
  async executeWithCircuitBreaker<T>(
    ctx: TenantContext,
    operation: (adapter: TradingPlatformAdapter) => Promise<T>,
  ): Promise<T> {
    const serverConfig = await this.getServerConfig(ctx);
    const serverId = serverConfig.serverId;

    // 检查熔断器
    this.checkCircuitBreaker(ctx.tenantId, serverId);

    const adapter = await this.adapterFactory.getAdapter(serverConfig);
    await this.ensureAuthenticated(ctx, adapter);

    try {
      const result = await operation(adapter);
      this.recordSuccess(ctx.tenantId, serverId);
      return result;
    } catch (error) {
      this.recordFailure(ctx.tenantId, serverId);
      throw error;
    }
  }

  // ============================================================
  // 交易操作
  // ============================================================

  /**
   * 开仓 (市价单)
   */
  async openOrder(ctx: TenantContext, params: OpenOrderParams): Promise<TradeResult> {
    return this.executeWithCircuitBreaker(ctx, (adapter) => adapter.openOrder(params));
  }

  /**
   * 平仓
   */
  async closePosition(
    ctx: TenantContext,
    params: ClosePositionParams,
  ): Promise<TradeResult> {
    return this.executeWithCircuitBreaker(ctx, (adapter) =>
      adapter.closePosition(params),
    );
  }

  /**
   * 修改持仓 (止损/止盈)
   */
  async modifyPosition(
    ctx: TenantContext,
    params: ModifyPositionParams,
  ): Promise<TradeResult> {
    return this.executeWithCircuitBreaker(ctx, (adapter) =>
      adapter.modifyPosition(params),
    );
  }

  /**
   * 挂单
   */
  async placePendingOrder(
    ctx: TenantContext,
    params: PendingOrderParams,
  ): Promise<TradeResult> {
    return this.executeWithCircuitBreaker(ctx, (adapter) =>
      adapter.placePendingOrder(params),
    );
  }

  /**
   * 修改挂单
   */
  async modifyOrder(
    ctx: TenantContext,
    params: ModifyOrderParams,
  ): Promise<TradeResult> {
    return this.executeWithCircuitBreaker(ctx, (adapter) => adapter.modifyOrder(params));
  }

  /**
   * 取消挂单
   */
  async cancelOrder(
    ctx: TenantContext,
    params: CancelOrderParams,
  ): Promise<TradeResult> {
    return this.executeWithCircuitBreaker(ctx, (adapter) => adapter.cancelOrder(params));
  }

  /**
   * 余额操作 (入金/出金/信用/调整)
   */
  async balanceOperation(
    ctx: TenantContext,
    params: BalanceOperationParams,
  ): Promise<TradeResult> {
    return this.executeWithCircuitBreaker(ctx, (adapter) =>
      adapter.balanceOperation(params),
    );
  }

  // ============================================================
  // 用户管理 (扩展)
  // ============================================================

  /**
   * 创建用户
   */
  async createUser(
    ctx: TenantContext,
    params: CreateUserParams,
  ): Promise<CreateUserResult> {
    return this.executeWithCircuitBreaker(ctx, (adapter) => adapter.createUser(params));
  }

  /**
   * 更新用户信息
   */
  async updateUser(ctx: TenantContext, params: UpdateUserParams): Promise<boolean> {
    return this.executeWithCircuitBreaker(ctx, (adapter) => adapter.updateUser(params));
  }

  /**
   * 修改用户密码
   */
  async changePassword(
    ctx: TenantContext,
    params: ChangePasswordParams,
  ): Promise<boolean> {
    return this.executeWithCircuitBreaker(ctx, (adapter) =>
      adapter.changePassword(params),
    );
  }

  // ============================================================
  // 市场数据
  // ============================================================

  /**
   * 获取 K 线数据
   */
  async getCandles(ctx: TenantContext, params: GetCandlesParams): Promise<CandleData[]> {
    return this.executeWithCircuitBreaker(ctx, (adapter) => adapter.getCandles(params));
  }

  /**
   * 获取 Tick 数据
   */
  async getTicks(ctx: TenantContext, params: GetTicksParams): Promise<TickData[]> {
    return this.executeWithCircuitBreaker(ctx, (adapter) => adapter.getTicks(params));
  }

  // ============================================================
  // 批量交易操作
  // ============================================================

  /**
   * 批量开仓
   */
  async batchOpenOrders(
    ctx: TenantContext,
    params: BatchOpenOrderParams,
  ): Promise<BatchOperationResult> {
    return this.executeWithCircuitBreaker(ctx, (adapter) =>
      adapter.batchOpenOrders(params),
    );
  }

  /**
   * 批量平仓
   */
  async batchClosePositions(
    ctx: TenantContext,
    params: BatchClosePositionParams,
  ): Promise<BatchOperationResult> {
    return this.executeWithCircuitBreaker(ctx, (adapter) =>
      adapter.batchClosePositions(params),
    );
  }
}
