import { Injectable, Logger } from '@nestjs/common';
import { MiddlewareProxyService, DealDto, OrderDto } from '../middleware-proxy';
import {
  DashboardDataDto,
  AccountSummaryDto,
  PositionsSummaryDto,
  SymbolStatDto,
  RecentDealDto,
  QuickStatsDto,
} from './dto';

/**
 * Dashboard 服务
 * 聚合 MT5 数据提供概览信息
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly middlewareProxy: MiddlewareProxyService) {}

  /**
   * 获取 Dashboard 完整数据
   */
  async getDashboardData(instanceId: string): Promise<DashboardDataDto> {
    // 并行获取所有数据
    const [accountInfo, positions, serverStatus, recentDealsResult] =
      await Promise.all([
        this.middlewareProxy.getAccountInfo(instanceId).catch(() => null),
        this.middlewareProxy.getPositions(instanceId).catch(() => []),
        this.middlewareProxy.getServerStatus(instanceId).catch(() => null),
        this.middlewareProxy
          .getDeals(instanceId, { limit: 10 })
          .catch(() => ({ deals: [], total: 0 })),
      ]);

    // 计算账户摘要
    const accountSummary: AccountSummaryDto = accountInfo
      ? {
          totalBalance: accountInfo.balance,
          totalEquity: accountInfo.equity,
          totalProfit: accountInfo.equity - accountInfo.balance,
          totalMargin: accountInfo.margin,
          totalFreeMargin: accountInfo.freeMargin,
          marginLevel: accountInfo.marginLevel,
        }
      : {
          totalBalance: 0,
          totalEquity: 0,
          totalProfit: 0,
          totalMargin: 0,
          totalFreeMargin: 0,
          marginLevel: 0,
        };

    // 计算持仓统计
    const positionsSummary = this.calculatePositionsSummary(positions);

    // 按品种统计
    const bySymbol = this.calculateSymbolStats(positions);

    // 近期交易
    const recentDeals: RecentDealDto[] = recentDealsResult.deals.map(
      (deal) => ({
        ticket: deal.ticket,
        symbol: deal.symbol,
        type: deal.type,
        volume: deal.volume,
        profit: deal.profit,
        time: deal.time,
      }),
    );

    return {
      accountSummary,
      positionsSummary,
      bySymbol,
      recentDeals,
      serverStatus: serverStatus
        ? {
            connected: serverStatus.connected,
            serverTime: serverStatus.serverTime,
            ping: serverStatus.ping,
          }
        : {
            connected: false,
            serverTime: new Date().toISOString(),
            ping: -1,
          },
    };
  }

  /**
   * 获取账户摘要
   */
  async getAccountSummary(instanceId: string): Promise<AccountSummaryDto> {
    const accountInfo = await this.middlewareProxy.getAccountInfo(instanceId);

    return {
      totalBalance: accountInfo.balance,
      totalEquity: accountInfo.equity,
      totalProfit: accountInfo.equity - accountInfo.balance,
      totalMargin: accountInfo.margin,
      totalFreeMargin: accountInfo.freeMargin,
      marginLevel: accountInfo.marginLevel,
    };
  }

  /**
   * 获取持仓统计
   */
  async getPositionsSummary(instanceId: string): Promise<PositionsSummaryDto> {
    const positions = await this.middlewareProxy.getPositions(instanceId);
    return this.calculatePositionsSummary(positions);
  }

  /**
   * 获取快速统计
   */
  async getQuickStats(instanceId: string): Promise<QuickStatsDto> {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const weekStart = new Date(
      now.setDate(now.getDate() - now.getDay()),
    ).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // 并行获取数据
    const [positions, todayDeals, weekDeals, monthDeals, orders] =
      await Promise.all([
        this.middlewareProxy.getPositions(instanceId).catch(() => []),
        this.middlewareProxy
          .getDeals(instanceId, { from: todayStart })
          .catch((): { deals: DealDto[]; total: number } => ({ deals: [], total: 0 })),
        this.middlewareProxy
          .getDeals(instanceId, { from: weekStart })
          .catch((): { deals: DealDto[]; total: number } => ({ deals: [], total: 0 })),
        this.middlewareProxy
          .getDeals(instanceId, { from: monthStart })
          .catch((): { deals: DealDto[]; total: number } => ({ deals: [], total: 0 })),
        this.middlewareProxy
          .getOrders(instanceId, {})
          .catch((): { orders: OrderDto[]; total: number } => ({ orders: [], total: 0 })),
      ]);

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
}
