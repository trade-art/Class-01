import { Injectable, Logger } from '@nestjs/common';
import { MiddlewareProxyService, DealDto } from '../middleware-proxy';
import {
  HistoryQueryDto,
  HistoryOrderDto,
  HistoryListResponseDto,
  HistoryStatsDto,
  ExportHistoryDto,
} from './dto';

/**
 * 历史交易服务
 * 提供历史订单查询、统计和导出功能
 */
@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(private readonly middlewareProxy: MiddlewareProxyService) {}

  /**
   * 获取历史订单列表
   */
  async getList(
    instanceId: string,
    query: HistoryQueryDto,
  ): Promise<HistoryListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const params: Record<string, unknown> = {
      page,
      limit,
    };

    // 添加可选查询参数
    if (query.login) params.login = query.login;
    if (query.symbol) params.symbol = query.symbol;
    if (query.type) params.type = query.type;
    if (query.from) params.from = query.from;
    if (query.to) params.to = query.to;
    if (query.minProfit !== undefined) params.minProfit = query.minProfit;
    if (query.maxProfit !== undefined) params.maxProfit = query.maxProfit;
    if (query.sortBy) params.sortBy = query.sortBy;
    if (query.sortOrder) params.sortOrder = query.sortOrder;

    const result = await this.middlewareProxy.request<{
      deals: DealDto[];
      total: number;
    }>('get', '/history/deals', instanceId, { params });

    const orders = result.deals.map((deal) => this.mapToHistoryOrderDto(deal));

    return {
      orders,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  /**
   * 获取单个历史订单详情
   */
  async getOrderDetail(
    instanceId: string,
    ticket: number,
  ): Promise<HistoryOrderDto> {
    const deal = await this.middlewareProxy.request<DealDto>(
      'get',
      `/history/deals/${ticket}`,
      instanceId,
    );

    return this.mapToHistoryOrderDto(deal);
  }

  /**
   * 获取交易统计
   */
  async getStats(
    instanceId: string,
    login?: number,
    from?: string,
    to?: string,
  ): Promise<HistoryStatsDto> {
    const params: Record<string, unknown> = {};
    if (login) params.login = login;
    if (from) params.from = from;
    if (to) params.to = to;

    // 先获取历史数据
    const result = await this.middlewareProxy.request<{
      deals: DealDto[];
      total: number;
    }>('get', '/history/deals', instanceId, {
      params: { ...params, limit: 10000 },
    });

    // 本地计算统计数据
    return this.calculateStats(result.deals);
  }

  /**
   * 获取指定用户的交易统计
   */
  async getUserStats(
    instanceId: string,
    login: number,
    from?: string,
    to?: string,
  ): Promise<HistoryStatsDto> {
    return this.getStats(instanceId, login, from, to);
  }

  /**
   * 导出历史数据
   */
  async exportHistory(
    instanceId: string,
    query: ExportHistoryDto,
  ): Promise<{ data: string; filename: string; contentType: string }> {
    const format = query.format ?? 'csv';

    // 获取所有符合条件的数据
    const params: Record<string, unknown> = {
      limit: 10000, // 最多导出 10000 条
    };

    if (query.login) params.login = query.login;
    if (query.symbol) params.symbol = query.symbol;
    if (query.type) params.type = query.type;
    if (query.from) params.from = query.from;
    if (query.to) params.to = query.to;
    if (query.minProfit !== undefined) params.minProfit = query.minProfit;
    if (query.maxProfit !== undefined) params.maxProfit = query.maxProfit;

    const result = await this.middlewareProxy.request<{
      deals: DealDto[];
      total: number;
    }>('get', '/history/deals', instanceId, { params });

    const orders = result.deals.map((deal) => this.mapToHistoryOrderDto(deal));

    if (format === 'csv') {
      return this.generateCsv(orders);
    } else {
      // XLSX 格式暂时返回 CSV，实际需要引入 xlsx 库
      this.logger.warn('XLSX 格式暂不支持，返回 CSV 格式');
      return this.generateCsv(orders);
    }
  }

  /**
   * 计算统计数据
   */
  private calculateStats(deals: DealDto[]): HistoryStatsDto {
    if (deals.length === 0) {
      return {
        totalOrders: 0,
        totalProfit: 0,
        profitableOrders: 0,
        losingOrders: 0,
        winRate: 0,
        avgProfit: 0,
        avgLoss: 0,
        totalCommission: 0,
        totalSwap: 0,
        avgHoldingTime: 0,
        maxProfit: 0,
        maxLoss: 0,
      };
    }

    const profitableDeals = deals.filter((d) => d.profit > 0);
    const losingDeals = deals.filter((d) => d.profit < 0);

    const totalProfit = deals.reduce((sum, d) => sum + d.profit, 0);
    const totalCommission = deals.reduce((sum, d) => sum + d.commission, 0);
    const totalSwap = deals.reduce((sum, d) => sum + d.swap, 0);

    const avgProfit =
      profitableDeals.length > 0
        ? profitableDeals.reduce((sum, d) => sum + d.profit, 0) /
          profitableDeals.length
        : 0;

    const avgLoss =
      losingDeals.length > 0
        ? losingDeals.reduce((sum, d) => sum + d.profit, 0) / losingDeals.length
        : 0;

    const profits = deals.map((d) => d.profit);
    const maxProfit = Math.max(...profits, 0);
    const maxLoss = Math.min(...profits, 0);

    return {
      totalOrders: deals.length,
      totalProfit: Math.round(totalProfit * 100) / 100,
      profitableOrders: profitableDeals.length,
      losingOrders: losingDeals.length,
      winRate:
        deals.length > 0
          ? Math.round((profitableDeals.length / deals.length) * 10000) / 100
          : 0,
      avgProfit: Math.round(avgProfit * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      totalSwap: Math.round(totalSwap * 100) / 100,
      avgHoldingTime: 0, // 需要开仓/平仓时间计算，暂不支持
      maxProfit: Math.round(maxProfit * 100) / 100,
      maxLoss: Math.round(maxLoss * 100) / 100,
    };
  }

  /**
   * 生成 CSV 文件
   */
  private generateCsv(orders: HistoryOrderDto[]): {
    data: string;
    filename: string;
    contentType: string;
  } {
    const headers = [
      '订单号',
      '用户登录号',
      '交易品种',
      '类型',
      '手数',
      '开仓价',
      '平仓价',
      '止损',
      '止盈',
      '盈亏',
      '手续费',
      '库存费',
      '开仓时间',
      '平仓时间',
      '备注',
    ];

    const rows = orders.map((order) =>
      [
        order.ticket,
        order.login ?? '',
        order.symbol,
        order.type,
        order.volume,
        order.openPrice,
        order.closePrice,
        order.sl,
        order.tp,
        order.profit,
        order.commission,
        order.swap,
        order.openTime,
        order.closeTime,
        order.comment ?? '',
      ].join(','),
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const timestamp = new Date().toISOString().split('T')[0];

    return {
      data: csv,
      filename: `history_${timestamp}.csv`,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  /**
   * 将中间件 DealDto 映射为 HistoryOrderDto
   */
  private mapToHistoryOrderDto(deal: DealDto): HistoryOrderDto {
    return {
      ticket: deal.ticket,
      login: undefined, // 中间件 DealDto 没有 login 字段
      symbol: deal.symbol,
      type: deal.type,
      volume: deal.volume,
      openPrice: deal.price, // DealDto 只有成交价
      closePrice: deal.price,
      sl: 0,
      tp: 0,
      profit: deal.profit,
      commission: deal.commission,
      swap: deal.swap,
      openTime: deal.time,
      closeTime: deal.time,
      comment: deal.comment,
    };
  }
}
