import { Injectable, Logger } from '@nestjs/common';
import { MiddlewareProxyService, DealDto, OrderDto } from '../middleware-proxy';
import { CacheService, CacheTTL } from '../common';
import {
  DashboardDataDto,
  DashboardBaseDataDto,
  TradingStatsDto,
  AccountSummaryDto,
  PositionsSummaryDto,
  UsersSummaryDto,
  SymbolStatDto,
  RecentDealDto,
  TradingTrendDto,
  QuickStatsDto,
  SystemStatusDto,
} from './dto';

/**
 * Dashboard 服务
 * 聚合 MT5 数据提供概览信息
 * 使用 Redis 缓存优化响应速度
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly middlewareProxy: MiddlewareProxyService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 获取 Dashboard 完整数据
   * 聚合所有交易者账户数据 (SaaS 模式)
   * 使用 Redis 缓存优化响应速度（缓存30秒）
   * @param instanceId 实例 ID
   * @param serverId MT 服务器 ID (多租户模式)
   * @param tenantId 租户 ID (用于从数据库获取凭证)
   */
  async getDashboardData(
    instanceId: string,
    serverId?: string,
    tenantId?: string,
  ): Promise<DashboardDataDto> {
    // 构建缓存键
    const cacheKey = this.cacheService.buildKey('dashboard', instanceId, serverId || 'default');

    // 并行执行：获取缓存 + serverStatus + 认证状态
    // 这三个操作互不依赖，可以并行执行以减少等待时间
    const [cachedData, serverStatus, authResult] = await Promise.all([
      this.cacheService.get<Omit<DashboardDataDto, 'serverStatus'>>(cacheKey),
      this.middlewareProxy.getServerStatus(instanceId).catch(() => null),
      this.middlewareProxy.testAuthentication(instanceId, tenantId).catch(() => false),
    ]);

    const serverStatusDto = serverStatus
      ? {
          connected: serverStatus.connected,
          authenticated: authResult, // API 认证是否成功
          serverTime: serverStatus.serverTime,
          ping: serverStatus.ping,
        }
      : {
          connected: false,
          authenticated: false,
          serverTime: new Date().toISOString(),
          ping: -1,
        };

    // 如果有缓存，直接返回（合并实时的 serverStatus）
    if (cachedData) {
      this.logger.debug(`Dashboard cache hit for ${instanceId}`);
      return {
        ...cachedData,
        serverStatus: serverStatusDto,
      };
    }

    // 缓存未命中，从 MT5 获取数据
    this.logger.debug(`Dashboard cache miss for ${instanceId}, fetching from MT5`);

    // 跟踪 MT5 数据调用是否成功（用于确定真实的 MT5 连接状态）
    let mt5DataFetchSuccess = false;

    // 顺序获取所有数据 (MT5 IMTManagerAPI 不是线程安全的，不能并行调用)
    // 传递 tenantId 用于从数据库获取 Manager 凭证
    const usersResult = await this.middlewareProxy.getUsers(instanceId, { limit: 1000 }, serverId, tenantId)
      .then((result) => {
        // 如果成功获取到用户数据（即使是空列表），说明 MT5 连接正常
        mt5DataFetchSuccess = true;
        return result;
      })
      .catch((err) => {
        this.logger.warn(`获取用户列表失败: ${err.message}`);
        return { users: [], pagination: { total: 0, page: 1, pages: 0, limit: 0 } };
      });

    const positions = await this.middlewareProxy.getAllPositionsForDashboard(instanceId, serverId, tenantId).catch(() => []);

    // 获取所有 deals (用于 recentDeals 和 tradingTrend)
    // limit = 0 表示获取全部 30 天内的 deals
    const allDealsResult = await this.middlewareProxy
      .getRecentDealsForDashboard(instanceId, 0, serverId, tenantId)
      .catch(() => ({ deals: [] as DealDto[], total: 0, page: 1, page_size: 0 }));

    // 从用户列表聚合账户数据 (SaaS 模式：统计所有交易者)
    const accountSummary: AccountSummaryDto = this.aggregateUserAccounts(usersResult.users);

    // 计算持仓统计
    const positionsSummary = this.calculatePositionsSummary(positions);

    // 计算用户统计
    const usersSummary: UsersSummaryDto = this.calculateUsersSummary(usersResult.users);

    // 按品种统计（基于成交记录，而非持仓）
    const bySymbol = this.calculateSymbolStatsFromDeals(allDealsResult.deals);

    // 近期交易 (取最近10条)
    const recentDeals: RecentDealDto[] = allDealsResult.deals.slice(0, 10).map(
      (deal) => ({
        ticket: deal.ticket,
        login: deal.login, // 添加账号字段
        symbol: deal.symbol,
        type: deal.type,
        volume: deal.volume,
        profit: deal.profit,
        time: deal.time,
      }),
    );

    // 计算交易趋势 (最近7天)
    const tradingTrend: TradingTrendDto[] = this.calculateTradingTrend(allDealsResult.deals);

    // 更新 serverStatus，使用实际的 MT5 数据获取结果
    // authenticated 现在反映的是 MT5 是否真正可用（数据调用是否成功）
    const finalServerStatus = {
      ...serverStatusDto,
      authenticated: mt5DataFetchSuccess, // 使用实际数据获取结果，而不仅仅是认证状态
    };

    // 记录连接状态详情，便于排查问题
    this.logger.debug(
      `Dashboard 连接状态: middleware=${serverStatusDto.connected}, ` +
      `authResult=${authResult}, mt5DataFetch=${mt5DataFetchSuccess}`,
    );

    // 缓存数据（不包含 serverStatus）
    const dataToCache = {
      accountSummary,
      positionsSummary,
      usersSummary,
      bySymbol,
      recentDeals,
      tradingTrend,
    };
    await this.cacheService.set(cacheKey, dataToCache, CacheTTL.DASHBOARD);

    return {
      ...dataToCache,
      serverStatus: finalServerStatus,
    };
  }

  /**
   * 获取 Dashboard 基础数据（不包含交易历史）
   * 用于快速显示用户数、持仓等基础信息
   * 交易相关数据通过 getTradingStats 异步获取
   * @param instanceId 实例 ID
   * @param serverId MT 服务器 ID (多租户模式)
   * @param tenantId 租户 ID (用于从数据库获取凭证)
   */
  async getDashboardBaseData(
    instanceId: string,
    serverId?: string,
    tenantId?: string,
  ): Promise<DashboardBaseDataDto> {
    // 构建缓存键
    const cacheKey = this.cacheService.buildKey('dashboard:base', instanceId, serverId || 'default');

    // 并行执行：获取缓存 + serverStatus + 认证状态
    const [cachedData, serverStatus, authResult] = await Promise.all([
      this.cacheService.get<Omit<DashboardBaseDataDto, 'serverStatus'>>(cacheKey),
      this.middlewareProxy.getServerStatus(instanceId).catch(() => null),
      this.middlewareProxy.testAuthentication(instanceId, tenantId).catch(() => false),
    ]);

    const serverStatusDto = serverStatus
      ? {
          connected: serverStatus.connected,
          authenticated: authResult,
          serverTime: serverStatus.serverTime,
          ping: serverStatus.ping,
        }
      : {
          connected: false,
          authenticated: false,
          serverTime: new Date().toISOString(),
          ping: -1,
        };

    // 如果有缓存，直接返回
    if (cachedData) {
      this.logger.debug(`Dashboard base cache hit for ${instanceId}`);
      return {
        ...cachedData,
        serverStatus: serverStatusDto,
      };
    }

    // 缓存未命中，从 MT5 获取数据
    this.logger.debug(`Dashboard base cache miss for ${instanceId}, fetching from MT5`);

    let mt5DataFetchSuccess = false;

    // 只获取用户和持仓数据（快速）
    const usersResult = await this.middlewareProxy.getUsers(instanceId, { limit: 1000 }, serverId, tenantId)
      .then((result) => {
        mt5DataFetchSuccess = true;
        return result;
      })
      .catch((err) => {
        this.logger.warn(`获取用户列表失败: ${err.message}`);
        return { users: [], pagination: { total: 0, page: 1, pages: 0, limit: 0 } };
      });

    const positions = await this.middlewareProxy.getAllPositionsForDashboard(instanceId, serverId, tenantId).catch(() => []);

    // 计算基础统计
    const accountSummary: AccountSummaryDto = this.aggregateUserAccounts(usersResult.users);
    const positionsSummary = this.calculatePositionsSummary(positions);
    const usersSummary: UsersSummaryDto = this.calculateUsersSummary(usersResult.users);

    const finalServerStatus = {
      ...serverStatusDto,
      authenticated: mt5DataFetchSuccess,
    };

    // 缓存数据
    const dataToCache = {
      accountSummary,
      positionsSummary,
      usersSummary,
    };
    await this.cacheService.set(cacheKey, dataToCache, CacheTTL.DASHBOARD);

    return {
      ...dataToCache,
      serverStatus: finalServerStatus,
    };
  }

  /**
   * 获取交易统计数据（包含交易历史）
   * 单独的端点用于异步加载交易相关数据
   * @param instanceId 实例 ID
   * @param serverId MT 服务器 ID (多租户模式)
   * @param tenantId 租户 ID (用于从数据库获取凭证)
   */
  async getTradingStats(
    instanceId: string,
    serverId?: string,
    tenantId?: string,
  ): Promise<TradingStatsDto> {
    // 构建缓存键
    const cacheKey = this.cacheService.buildKey('dashboard:trading', instanceId, serverId || 'default');

    // 检查缓存
    const cachedData = await this.cacheService.get<TradingStatsDto>(cacheKey);
    if (cachedData) {
      this.logger.debug(`Dashboard trading stats cache hit for ${instanceId}`);
      return cachedData;
    }

    // 缓存未命中，从 MT5 获取数据
    this.logger.debug(`Dashboard trading stats cache miss for ${instanceId}, fetching from MT5`);

    // 获取所有 deals (用于 recentDeals 和 tradingTrend)
    // limit = 0 表示获取全部 30 天内的 deals
    const allDealsResult = await this.middlewareProxy
      .getRecentDealsForDashboard(instanceId, 0, serverId, tenantId)
      .catch(() => ({ deals: [] as DealDto[], total: 0, page: 1, page_size: 0 }));

    // 按品种统计
    const bySymbol = this.calculateSymbolStatsFromDeals(allDealsResult.deals);

    // 近期交易 (取最近10条)
    const recentDeals: RecentDealDto[] = allDealsResult.deals.slice(0, 10).map(
      (deal) => ({
        ticket: deal.ticket,
        login: deal.login,
        symbol: deal.symbol,
        type: deal.type,
        volume: deal.volume,
        profit: deal.profit,
        time: deal.time,
      }),
    );

    // 计算交易趋势 (最近7天)
    const tradingTrend: TradingTrendDto[] = this.calculateTradingTrend(allDealsResult.deals);

    // 计算今日交易数
    const today = new Date().toISOString().split('T')[0];
    const todayTrend = tradingTrend.find(t => t.date === today);
    const todayTrades = todayTrend?.trades || 0;

    // 计算总交易量（30天）
    const totalVolume = allDealsResult.deals.reduce((sum, deal) => sum + (deal.volume || 0), 0);

    // 计算总盈亏（30天）
    const totalProfit = allDealsResult.deals.reduce((sum, deal) => sum + (deal.profit || 0), 0);

    const result: TradingStatsDto = {
      bySymbol,
      recentDeals,
      tradingTrend,
      todayTrades,
      totalVolume: Math.round(totalVolume * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
    };

    // 缓存数据
    await this.cacheService.set(cacheKey, result, CacheTTL.DASHBOARD);

    return result;
  }

  /**
   * 获取系统状态（轻量级，不获取业务数据）
   * 用于前端实时检查中间件和 MT5 连接状态
   * @param instanceId 实例 ID
   * @param tenantId 租户 ID
   */
  async getSystemStatus(instanceId: string, tenantId?: string): Promise<SystemStatusDto> {
    // 并行检查：中间件健康状态 + MT5 真实连接状态
    const [serverStatus, mt5ConnectionStatus] = await Promise.all([
      this.middlewareProxy.getServerStatus(instanceId).catch(() => null),
      this.middlewareProxy.checkMt5ConnectionStatus(instanceId).catch(() => ({
        connected: false,
        activeConnections: 0,
        totalSessions: 0,
        message: 'Failed to check MT5 status',
      })),
    ]);

    // 记录连接状态详情，便于排查问题
    this.logger.debug(
      `系统状态检查: middleware=${serverStatus?.connected}, ` +
      `mt5Connected=${mt5ConnectionStatus.connected}, ` +
      `activeSessions=${mt5ConnectionStatus.totalSessions}, ` +
      `activeConnections=${mt5ConnectionStatus.activeConnections}`,
    );

    // 返回轻量级状态数据
    // mt5 状态使用真实的 MT5 连接状态，而不是仅检查 API 认证
    return {
      middleware: serverStatus?.connected || false,
      mt5: mt5ConnectionStatus.connected,
      serverTime: serverStatus?.serverTime || new Date().toISOString(),
      ping: serverStatus?.ping ?? -1,
    };
  }

  /**
   * 获取账户摘要 (SaaS 模式：聚合所有交易者)
   * @param instanceId 实例 ID
   * @param serverId MT 服务器 ID (多租户模式)
   * @param tenantId 租户 ID (用于从数据库获取凭证)
   */
  async getAccountSummary(instanceId: string, serverId?: string, tenantId?: string): Promise<AccountSummaryDto> {
    const usersResult = await this.middlewareProxy.getUsers(instanceId, { limit: 1000 }, serverId, tenantId);
    return this.aggregateUserAccounts(usersResult.users);
  }

  /**
   * 获取持仓统计
   * @param instanceId 实例 ID
   * @param serverId MT 服务器 ID (多租户模式)
   * @param tenantId 租户 ID (用于从数据库获取凭证)
   */
  async getPositionsSummary(instanceId: string, serverId?: string, tenantId?: string): Promise<PositionsSummaryDto> {
    const positions = await this.middlewareProxy.getAllPositionsForDashboard(instanceId, serverId, tenantId);
    return this.calculatePositionsSummary(positions);
  }

  /**
   * 获取快速统计
   * @param instanceId 实例 ID
   * @param serverId MT 服务器 ID (多租户模式)
   * @param tenantId 租户 ID (用于从数据库获取凭证)
   */
  async getQuickStats(instanceId: string, serverId?: string, tenantId?: string): Promise<QuickStatsDto> {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const weekStart = new Date(
      now.setDate(now.getDate() - now.getDay()),
    ).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // 顺序获取数据 (MT5 IMTManagerAPI 不是线程安全的，不能并行调用)
    // 传递 tenantId 用于从数据库获取 Manager 凭证
    const positions = await this.middlewareProxy.getAllPositionsForDashboard(instanceId, serverId, tenantId).catch(() => []);

    const todayDeals = await this.middlewareProxy
      .getDeals(instanceId, { from: todayStart }, serverId, tenantId)
      .catch((): { deals: DealDto[]; total: number } => ({ deals: [], total: 0 }));

    const weekDeals = await this.middlewareProxy
      .getDeals(instanceId, { from: weekStart }, serverId, tenantId)
      .catch((): { deals: DealDto[]; total: number } => ({ deals: [], total: 0 }));

    const monthDeals = await this.middlewareProxy
      .getDeals(instanceId, { from: monthStart }, serverId, tenantId)
      .catch((): { deals: DealDto[]; total: number } => ({ deals: [], total: 0 }));

    const orders = await this.middlewareProxy
      .getOrders(instanceId, {}, serverId, tenantId)
      .catch((): { orders: OrderDto[]; total: number } => ({ orders: [], total: 0 }));

    // 计算各时段盈亏
    const todayProfit = todayDeals.deals.reduce(
      (sum, deal) => sum + deal.profit,
      0,
    );
    const weekProfit = weekDeals.deals.reduce(
      (sum, deal) => sum + deal.profit,
      0,
    );
    const monthProfit = monthDeals.deals.reduce(
      (sum, deal) => sum + deal.profit,
      0,
    );

    return {
      todayProfit,
      weekProfit,
      monthProfit,
      todayTrades: todayDeals.total,
      activePositions: positions.length,
      pendingOrders: orders.total,
    };
  }

  /**
   * 计算持仓统计
   */
  private calculatePositionsSummary(
    positions: { type: string; volume: number; profit: number }[],
  ): PositionsSummaryDto {
    let buyCount = 0;
    let sellCount = 0;
    let buyProfit = 0;
    let sellProfit = 0;
    let totalVolume = 0;
    let totalProfit = 0;

    for (const pos of positions) {
      totalVolume += pos.volume;
      totalProfit += pos.profit;

      if (pos.type === 'buy') {
        buyCount++;
        buyProfit += pos.profit;
      } else {
        sellCount++;
        sellProfit += pos.profit;
      }
    }

    return {
      totalPositions: positions.length,
      totalVolume,
      totalProfit,
      buyCount,
      sellCount,
      buyProfit,
      sellProfit,
    };
  }

  /**
   * 按品种统计持仓
   */
  private calculateSymbolStats(
    positions: { symbol: string; volume: number; profit: number }[],
  ): SymbolStatDto[] {
    const symbolMap = new Map<
      string,
      { count: number; volume: number; profit: number }
    >();

    for (const pos of positions) {
      const existing = symbolMap.get(pos.symbol) || {
        count: 0,
        volume: 0,
        profit: 0,
      };
      symbolMap.set(pos.symbol, {
        count: existing.count + 1,
        volume: existing.volume + pos.volume,
        profit: existing.profit + pos.profit,
      });
    }

    return Array.from(symbolMap.entries())
      .map(([symbol, stats]) => ({
        symbol,
        count: stats.count,
        volume: stats.volume,
        profit: stats.profit,
      }))
      .sort((a, b) => b.profit - a.profit);
  }

  /**
   * 按品种统计成交记录
   * 基于历史成交计算品种分布（交易次数、总手数、总盈亏）
   */
  private calculateSymbolStatsFromDeals(
    deals: Array<{ symbol: string; volume: number; profit: number }>,
  ): SymbolStatDto[] {
    const symbolMap = new Map<
      string,
      { count: number; volume: number; profit: number }
    >();

    for (const deal of deals) {
      // 跳过没有品种的成交记录（如余额操作）
      if (!deal.symbol) continue;

      const existing = symbolMap.get(deal.symbol) || {
        count: 0,
        volume: 0,
        profit: 0,
      };
      symbolMap.set(deal.symbol, {
        count: existing.count + 1,
        volume: existing.volume + (deal.volume || 0),
        profit: existing.profit + (deal.profit || 0),
      });
    }

    return Array.from(symbolMap.entries())
      .map(([symbol, stats]) => ({
        symbol,
        count: stats.count,
        volume: Math.round(stats.volume * 100) / 100, // 保留2位小数
        profit: Math.round(stats.profit * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count); // 按交易次数排序
  }

  /**
   * 计算用户统计 (SaaS 模式)
   * 统计总用户数和活跃用户数
   */
  private calculateUsersSummary(
    users: Array<{
      balance: number;
      equity: number;
    }>,
  ): UsersSummaryDto {
    const totalUsers = users.length;
    // 活跃用户：有余额或有净值的用户
    const activeUsers = users.filter(
      (user) => (user.balance || 0) > 0 || (user.equity || 0) > 0,
    ).length;

    return {
      totalUsers,
      activeUsers,
    };
  }

  /**
   * 聚合用户账户数据 (SaaS 模式)
   * 从所有交易者账户汇总余额、净值等统计数据
   */
  private aggregateUserAccounts(
    users: Array<{
      balance: number;
      equity: number;
      credit: number;
      margin: number;
      margin_free: number;
      margin_level: number;
    }>,
  ): AccountSummaryDto {
    if (!users || users.length === 0) {
      return {
        totalBalance: 0,
        totalEquity: 0,
        totalProfit: 0,
        totalMargin: 0,
        totalFreeMargin: 0,
        marginLevel: 0,
      };
    }

    let totalBalance = 0;
    let totalEquity = 0;
    let totalMargin = 0;
    let totalFreeMargin = 0;

    for (const user of users) {
      totalBalance += user.balance || 0;
      totalEquity += user.equity || 0;
      totalMargin += user.margin || 0;
      totalFreeMargin += user.margin_free || 0;
    }

    // 计算总利润和平均保证金比例
    const totalProfit = totalEquity - totalBalance;
    const marginLevel = totalMargin > 0 ? (totalEquity / totalMargin) * 100 : 0;

    this.logger.debug(`聚合 ${users.length} 个用户账户: 余额=${totalBalance.toFixed(2)}, 净值=${totalEquity.toFixed(2)}`);

    return {
      totalBalance,
      totalEquity,
      totalProfit,
      totalMargin,
      totalFreeMargin,
      marginLevel,
    };
  }

  /**
   * 计算交易趋势 (最近30天，但只返回有数据的最近7天区间)
   * 按日期聚合交易数据
   */
  private calculateTradingTrend(
    deals: Array<{
      volume: number;
      profit: number;
      time: string;
    }>,
  ): TradingTrendDto[] {
    // 创建最近30天的日期映射
    const trendMap = new Map<string, { trades: number; volume: number; profit: number }>();

    // 初始化最近30天的数据
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      trendMap.set(dateStr, { trades: 0, volume: 0, profit: 0 });
    }

    // 聚合交易数据
    for (const deal of deals) {
      const dealDate = new Date(deal.time).toISOString().split('T')[0];
      const existing = trendMap.get(dealDate);
      if (existing) {
        existing.trades += 1;
        existing.volume += deal.volume;
        existing.profit += deal.profit;
      }
    }

    // 转换为数组并排序
    const allTrends = Array.from(trendMap.entries())
      .map(([date, stats]) => ({
        date,
        trades: stats.trades,
        volume: Math.round(stats.volume * 100) / 100, // 保留2位小数
        profit: Math.round(stats.profit * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 找到最后一个有交易的日期
    let lastTradingIndex = allTrends.length - 1;
    for (let i = allTrends.length - 1; i >= 0; i--) {
      if (allTrends[i].trades > 0) {
        lastTradingIndex = i;
        break;
      }
    }

    // 返回从最后交易日往前7天的数据（包含最后交易日）
    // 如果没有交易数据，返回最近7天
    const startIndex = Math.max(0, lastTradingIndex - 6);
    return allTrends.slice(startIndex, lastTradingIndex + 1);
  }
}
