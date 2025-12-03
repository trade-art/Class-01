import { Injectable, Logger } from '@nestjs/common';
import { MiddlewareProxyService, DealDto } from '../middleware-proxy';
import {
  ReportQueryDto,
  ReportPeriod,
  TradingReportDto,
  UsersReportDto,
  FinanceReportDto,
  ExportReportDto,
  TrendDataPointDto,
  SymbolAnalysisDto,
  HourlyAnalysisDto,
  UserValueRankDto,
  GroupStatsDto,
  MonthlyCompareDto,
} from './dto';

/**
 * 报表服务
 * 提供交易、用户、财务报表数据聚合和导出功能
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly middlewareProxy: MiddlewareProxyService) {}

  /**
   * 获取交易报表
   */
  async getTradingReport(
    instanceId: string,
    query: ReportQueryDto,
  ): Promise<TradingReportDto> {
    const { startDate, endDate } = this.getDateRange(query);

    // 获取历史订单数据
    const deals = await this.fetchDeals(instanceId, startDate, endDate);

    // 计算统计数据
    const totalVolume = deals.reduce((sum, d) => sum + d.volume, 0);
    const totalAmount = deals.reduce((sum, d) => sum + Math.abs(d.profit), 0);

    // 生成趋势数据
    const volumeTrend = this.generateTrend(deals, 'volume', query.period ?? ReportPeriod.DAY);
    const amountTrend = this.generateTrend(deals, 'amount', query.period ?? ReportPeriod.DAY);

    // 品种分析
    const symbolAnalysis = this.analyzeBySymbol(deals);

    // 时段分析
    const hourlyAnalysis = this.analyzeByHour(deals);

    return {
      period: query.period ?? ReportPeriod.DAY,
      startDate,
      endDate,
      totalVolume: Math.round(totalVolume * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalOrders: deals.length,
      volumeTrend,
      amountTrend,
      symbolAnalysis,
      hourlyAnalysis,
    };
  }

  /**
   * 获取用户报表
   */
  async getUsersReport(
    instanceId: string,
    query: ReportQueryDto,
  ): Promise<UsersReportDto> {
    const { startDate, endDate } = this.getDateRange(query);

    // 获取用户数据 (通过中间件)
    const usersResult = await this.middlewareProxy.request<{
      users: Array<{
        login: number;
        name: string;
        group: string;
        balance: number;
        registrationTime?: string;
      }>;
      total: number;
    }>('get', '/account/users', instanceId, {
      params: { limit: 10000 },
    });

    const users = usersResult.users;

    // 获取交易数据计算活跃用户
    const deals = await this.fetchDeals(instanceId, startDate, endDate);

    // 计算统计
    const activeUserLogins = new Set(deals.map(() => 0)); // 简化：实际需要从deal关联用户
    const totalUsers = users.length;
    const activeUsers = activeUserLogins.size;

    // 生成趋势 (简化版本)
    const newUsersTrend = this.generateEmptyTrend(query.period ?? ReportPeriod.DAY, startDate, endDate);
    const activeUsersTrend = this.generateEmptyTrend(query.period ?? ReportPeriod.DAY, startDate, endDate);

    // 用户价值排名 (基于交易量)
    const userValueRanking = this.calculateUserValueRanking(deals, users);

    // 分组统计
    const groupStats = this.calculateGroupStats(users);

    return {
      period: query.period ?? ReportPeriod.DAY,
      startDate,
      endDate,
      totalUsers,
      newUsers: 0, // 需要 registrationTime 字段
      activeUsers,
      newUsersTrend,
      activeUsersTrend,
      userValueRanking,
      groupStats,
    };
  }

  /**
   * 获取财务报表
   */
  async getFinanceReport(
    instanceId: string,
    query: ReportQueryDto,
  ): Promise<FinanceReportDto> {
    const { startDate, endDate } = this.getDateRange(query);

    // 获取交易历史数据
    const deals = await this.fetchDeals(instanceId, startDate, endDate);

    // 计算财务统计
    const totalCommission = deals.reduce((sum, d) => sum + d.commission, 0);
    const totalSwap = deals.reduce((sum, d) => sum + d.swap, 0);

    // 出入金数据需要专门的 API (此处简化)
    const totalDeposit = 0;
    const totalWithdraw = 0;

    // 生成趋势
    const depositTrend = this.generateEmptyTrend(query.period ?? ReportPeriod.DAY, startDate, endDate);
    const withdrawTrend = this.generateEmptyTrend(query.period ?? ReportPeriod.DAY, startDate, endDate);
    const commissionTrend = this.generateTrend(deals, 'commission', query.period ?? ReportPeriod.DAY);

    // 月度对比
    const monthlyComparison = this.generateMonthlyComparison(deals);

    return {
      period: query.period ?? ReportPeriod.DAY,
      startDate,
      endDate,
      totalDeposit,
      totalWithdraw,
      netDeposit: totalDeposit - totalWithdraw,
      totalCommission: Math.round(totalCommission * 100) / 100,
      totalSwap: Math.round(totalSwap * 100) / 100,
      depositTrend,
      withdrawTrend,
      commissionTrend,
      monthlyComparison,
    };
  }

  /**
   * 导出报表
   */
  async exportReport(
    instanceId: string,
    reportType: string,
    query: ExportReportDto,
  ): Promise<{ data: string; filename: string; contentType: string }> {
    let reportData: unknown;

    switch (reportType) {
      case 'trading':
        reportData = await this.getTradingReport(instanceId, query);
        break;
      case 'users':
        reportData = await this.getUsersReport(instanceId, query);
        break;
      case 'finance':
        reportData = await this.getFinanceReport(instanceId, query);
        break;
      default:
        throw new Error(`不支持的报表类型: ${reportType}`);
    }

    const format = query.format ?? 'csv';
    const timestamp = new Date().toISOString().split('T')[0];

    // 暂时只支持 CSV 格式
    const csv = this.convertToCsv(reportData);

    return {
      data: csv,
      filename: `${reportType}_report_${timestamp}.csv`,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  /**
   * 获取日期范围
   */
  private getDateRange(query: ReportQueryDto): {
    startDate: string;
    endDate: string;
  } {
    const endDate = query.endDate ?? new Date().toISOString().split('T')[0];
    let startDate = query.startDate;

    if (!startDate) {
      const end = new Date(endDate);
      const start = new Date(end);

      switch (query.period) {
        case ReportPeriod.WEEK:
          start.setDate(end.getDate() - 7);
          break;
        case ReportPeriod.MONTH:
          start.setMonth(end.getMonth() - 1);
          break;
        default: // DAY
          start.setDate(end.getDate() - 30);
      }

      startDate = start.toISOString().split('T')[0];
    }

    return { startDate, endDate };
  }

  /**
   * 获取历史交易数据
   */
  private async fetchDeals(
    instanceId: string,
    startDate: string,
    endDate: string,
  ): Promise<DealDto[]> {
    try {
      const result = await this.middlewareProxy.request<{
        deals: DealDto[];
        total: number;
      }>('get', '/history/deals', instanceId, {
        params: {
          from: startDate,
          to: endDate,
          limit: 10000,
        },
      });
      return result.deals;
    } catch (error) {
      this.logger.warn('获取历史数据失败，返回空数组', error);
      return [];
    }
  }

  /**
   * 生成趋势数据
   */
  private generateTrend(
    deals: DealDto[],
    field: 'volume' | 'amount' | 'commission',
    period: ReportPeriod,
  ): TrendDataPointDto[] {
    const grouped = new Map<string, number>();

    for (const deal of deals) {
      const date = this.formatDateByPeriod(deal.time, period);
      const currentValue = grouped.get(date) ?? 0;

      let value = 0;
      switch (field) {
        case 'volume':
          value = deal.volume;
          break;
        case 'amount':
          value = Math.abs(deal.profit);
          break;
        case 'commission':
          value = deal.commission;
          break;
      }

      grouped.set(date, currentValue + value);
    }

    return Array.from(grouped.entries())
      .map(([date, value]) => ({
        date,
        value: Math.round(value * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 生成空趋势数据
   */
  private generateEmptyTrend(
    period: ReportPeriod,
    startDate: string,
    endDate: string,
  ): TrendDataPointDto[] {
    const trend: TrendDataPointDto[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    const current = new Date(start);
    while (current <= end) {
      trend.push({
        date: current.toISOString().split('T')[0],
        value: 0,
      });

      switch (period) {
        case ReportPeriod.WEEK:
          current.setDate(current.getDate() + 7);
          break;
        case ReportPeriod.MONTH:
          current.setMonth(current.getMonth() + 1);
          break;
        default:
          current.setDate(current.getDate() + 1);
      }
    }

    return trend;
  }

  /**
   * 按周期格式化日期
   */
  private formatDateByPeriod(dateStr: string, period: ReportPeriod): string {
    const date = new Date(dateStr);

    switch (period) {
      case ReportPeriod.WEEK: {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return weekStart.toISOString().split('T')[0];
      }
      case ReportPeriod.MONTH:
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      default:
        return date.toISOString().split('T')[0];
    }
  }

  /**
   * 按品种分析
   */
  private analyzeBySymbol(deals: DealDto[]): SymbolAnalysisDto[] {
    const grouped = new Map<string, { volume: number; count: number }>();
    let totalVolume = 0;

    for (const deal of deals) {
      const current = grouped.get(deal.symbol) ?? { volume: 0, count: 0 };
      current.volume += deal.volume;
      current.count += 1;
      totalVolume += deal.volume;
      grouped.set(deal.symbol, current);
    }

    return Array.from(grouped.entries())
      .map(([symbol, data]) => ({
        symbol,
        volume: Math.round(data.volume * 100) / 100,
        orderCount: data.count,
        percentage:
          totalVolume > 0
            ? Math.round((data.volume / totalVolume) * 10000) / 100
            : 0,
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);
  }

  /**
   * 按小时分析
   */
  private analyzeByHour(deals: DealDto[]): HourlyAnalysisDto[] {
    const hourlyData = new Array(24).fill(null).map((_, hour) => ({
      hour,
      orderCount: 0,
      volume: 0,
    }));

    for (const deal of deals) {
      const hour = new Date(deal.time).getHours();
      hourlyData[hour].orderCount += 1;
      hourlyData[hour].volume += deal.volume;
    }

    return hourlyData.map((data) => ({
      ...data,
      volume: Math.round(data.volume * 100) / 100,
    }));
  }

  /**
   * 计算用户价值排名
   */
  private calculateUserValueRanking(
    deals: DealDto[],
    users: Array<{ login: number; name: string }>,
  ): UserValueRankDto[] {
    // 简化实现：基于交易统计
    // 实际需要按用户关联交易
    return users.slice(0, 10).map((user) => ({
      login: user.login,
      name: user.name,
      volume: 0,
      profit: 0,
      commission: 0,
    }));
  }

  /**
   * 计算分组统计
   */
  private calculateGroupStats(
    users: Array<{ login: number; group: string }>,
  ): GroupStatsDto[] {
    const grouped = new Map<string, number>();

    for (const user of users) {
      const count = grouped.get(user.group) ?? 0;
      grouped.set(user.group, count + 1);
    }

    return Array.from(grouped.entries())
      .map(([group, userCount]) => ({
        group,
        userCount,
        volume: 0,
        profit: 0,
      }))
      .sort((a, b) => b.userCount - a.userCount);
  }

  /**
   * 生成月度对比
   */
  private generateMonthlyComparison(deals: DealDto[]): MonthlyCompareDto[] {
    const grouped = new Map<string, { commission: number }>();

    for (const deal of deals) {
      const month = deal.time.substring(0, 7); // YYYY-MM
      const current = grouped.get(month) ?? { commission: 0 };
      current.commission += deal.commission;
      grouped.set(month, current);
    }

    return Array.from(grouped.entries())
      .map(([month, data]) => ({
        month,
        deposit: 0,
        withdraw: 0,
        commission: Math.round(data.commission * 100) / 100,
        netDeposit: 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);
  }

  /**
   * 转换为 CSV 格式
   */
  private convertToCsv(data: unknown): string {
    const json = JSON.stringify(data, null, 2);
    // 简单实现：返回 JSON 格式
    // 实际应该根据数据结构生成正确的 CSV
    return json;
  }
}
