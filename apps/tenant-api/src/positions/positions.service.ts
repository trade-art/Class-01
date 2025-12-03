import { Injectable, Logger } from '@nestjs/common';
import {
  MiddlewareProxyService,
  PositionDto as MiddlewarePositionDto,
} from '../middleware-proxy';
import {
  PositionListQueryDto,
  PositionListResponseDto,
  PositionStatsDto,
  SymbolPositionStatsDto,
  PositionDto,
  ProfitFilter,
} from './dto';

/**
 * 持仓监控服务
 */
@Injectable()
export class PositionsService {
  private readonly logger = new Logger(PositionsService.name);

  constructor(private readonly middlewareProxy: MiddlewareProxyService) {}

  /**
   * 获取持仓列表
   */
  async getList(
    instanceId: string,
    query: PositionListQueryDto,
  ): Promise<PositionListResponseDto> {
    const { page = 1, limit = 20 } = query;

    // 从中间件获取所有持仓
    const middlewarePositions = await this.middlewareProxy.getPositions(instanceId);

    // 应用过滤条件
    let filtered = this.filterPositions(middlewarePositions, query);

    // 应用排序
    filtered = this.sortPositions(filtered, query.sortBy, query.sortOrder);

    // 计算总数和分页
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paged = filtered.slice(startIndex, startIndex + limit);

    // 映射为响应 DTO
    const positions = paged.map((p) => this.mapToPositionDto(p));

    return {
      positions,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * 映射中间件持仓到响应 DTO
   */
  private mapToPositionDto(pos: MiddlewarePositionDto): PositionDto {
    return {
      ticket: pos.ticket,
      login: 0, // 中间件可能不返回 login，需要根据实际情况处理
      symbol: pos.symbol,
      type: pos.type,
      volume: pos.volume,
      openPrice: pos.openPrice,
      currentPrice: pos.currentPrice,
      sl: pos.stopLoss,
      tp: pos.takeProfit,
      profit: pos.profit,
      swap: 0, // 中间件可能不返回 swap
      commission: 0, // 中间件可能不返回 commission
      openTime: pos.openTime,
      comment: pos.comment,
    };
  }

  /**
   * 获取持仓统计
   */
  async getStats(instanceId: string): Promise<PositionStatsDto> {
    const positions = await this.middlewareProxy.getPositions(instanceId);

    let totalPositions = 0;
    let totalVolume = 0;
    let totalProfit = 0;
    let buyCount = 0;
    let sellCount = 0;
    let buyVolume = 0;
    let sellVolume = 0;
    let buyProfit = 0;
    let sellProfit = 0;

    for (const pos of positions) {
      totalPositions++;
      totalVolume += pos.volume;
      totalProfit += pos.profit;

      if (pos.type === 'buy') {
        buyCount++;
        buyVolume += pos.volume;
        buyProfit += pos.profit;
      } else {
        sellCount++;
        sellVolume += pos.volume;
        sellProfit += pos.profit;
      }
    }

    const longShortRatio =
      sellVolume > 0 ? Math.round((buyVolume / sellVolume) * 100) / 100 : buyVolume > 0 ? Infinity : 1;

    return {
      totalPositions,
      totalVolume,
      totalProfit,
      buyCount,
      sellCount,
      buyVolume,
      sellVolume,
      buyProfit,
      sellProfit,
      longShortRatio,
    };
  }

  /**
   * 按品种统计持仓
   */
  async getStatsBySymbol(instanceId: string): Promise<SymbolPositionStatsDto[]> {
    const positions = await this.middlewareProxy.getPositions(instanceId);

    const symbolMap = new Map<
      string,
      {
        count: number;
        volume: number;
        profit: number;
        buyCount: number;
        sellCount: number;
      }
    >();

    for (const pos of positions) {
      const existing = symbolMap.get(pos.symbol) || {
        count: 0,
        volume: 0,
        profit: 0,
        buyCount: 0,
        sellCount: 0,
      };

      existing.count++;
      existing.volume += pos.volume;
      existing.profit += pos.profit;

      if (pos.type === 'buy') {
        existing.buyCount++;
      } else {
        existing.sellCount++;
      }

      symbolMap.set(pos.symbol, existing);
    }

    return Array.from(symbolMap.entries())
      .map(([symbol, stats]) => ({
        symbol,
        count: stats.count,
        volume: stats.volume,
        profit: stats.profit,
        buyCount: stats.buyCount,
        sellCount: stats.sellCount,
      }))
      .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit));
  }

  /**
   * 过滤持仓
   */
  private filterPositions(
    positions: MiddlewarePositionDto[],
    query: PositionListQueryDto,
  ): MiddlewarePositionDto[] {
    let filtered = [...positions];

    // 按用户筛选 (注意：middleware 可能不返回 login 字段)
    if (query.login !== undefined) {
      // 如果中间件数据包含 login 字段，则进行筛选
      filtered = filtered.filter(
        (p) => (p as MiddlewarePositionDto & { login?: number }).login === query.login,
      );
    }

    // 按品种筛选
    if (query.symbol) {
      filtered = filtered.filter((p) =>
        p.symbol.toLowerCase().includes(query.symbol!.toLowerCase()),
      );
    }

    // 按类型筛选
    if (query.type) {
      filtered = filtered.filter((p) => p.type === query.type);
    }

    // 按盈亏筛选
    if (query.profitFilter) {
      if (query.profitFilter === ProfitFilter.PROFIT) {
        filtered = filtered.filter((p) => p.profit > 0);
      } else if (query.profitFilter === ProfitFilter.LOSS) {
        filtered = filtered.filter((p) => p.profit < 0);
      }
    }

    // 按盈亏范围筛选
    if (query.minProfit !== undefined) {
      filtered = filtered.filter((p) => p.profit >= query.minProfit!);
    }
    if (query.maxProfit !== undefined) {
      filtered = filtered.filter((p) => p.profit <= query.maxProfit!);
    }

    return filtered;
  }

  /**
   * 排序持仓
   */
  private sortPositions(
    positions: MiddlewarePositionDto[],
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
  ): MiddlewarePositionDto[] {
    if (!sortBy) {
      return positions;
    }

    const order = sortOrder === 'desc' ? -1 : 1;

    return positions.sort((a, b) => {
      const aVal = a[sortBy as keyof MiddlewarePositionDto];
      const bVal = b[sortBy as keyof MiddlewarePositionDto];

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * order;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * order;
      }

      return 0;
    });
  }
}
