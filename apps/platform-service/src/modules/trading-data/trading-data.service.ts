import { Injectable, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TradingHistoryQueryDto,
  TradingOrderDto,
  AccountBalanceDto,
  TradingStatsDto,
  TenantTradingOverviewDto,
  OpenPositionDto,
  AggregatedTradingDataDto,
  OrderType,
} from './dto/trading-data.dto';
import { firstValueFrom, catchError, timeout } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';

@Injectable()
export class TradingDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 从中间件获取交易历史 (REQ-8)
   */
  async getTradingHistory(query: TradingHistoryQueryDto): Promise<{
    data: TradingOrderDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // 确定要查询的实例
    const instances = await this.getTargetInstances(query.tenantId, query.instanceId);

    if (instances.length === 0) {
      return {
        data: [],
        total: 0,
        page: query.page || 1,
        limit: query.limit || 50,
        totalPages: 0,
      };
    }

    // 从所有实例聚合数据
    const allOrders: TradingOrderDto[] = [];

    for (const instance of instances) {
      try {
        const orders = await this.fetchTradingHistoryFromInstance(
          instance,
          query,
        );
        allOrders.push(...orders);
      } catch (error) {
        console.error(`Failed to fetch from instance ${instance.id}:`, error);
        // 继续处理其他实例
      }
    }

    // 排序和分页
    allOrders.sort((a, b) =>
      new Date(b.openTime).getTime() - new Date(a.openTime).getTime()
    );

    const page = query.page || 1;
    const limit = query.limit || 50;
    const total = allOrders.length;
    const startIndex = (page - 1) * limit;
    const data = allOrders.slice(startIndex, startIndex + limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取实时持仓
   */
  async getOpenPositions(
    tenantId?: string,
    instanceId?: string,
    login?: number,
  ): Promise<OpenPositionDto[]> {
    const instances = await this.getTargetInstances(tenantId, instanceId);

    const allPositions: OpenPositionDto[] = [];

    for (const instance of instances) {
      try {
        const positions = await this.fetchOpenPositionsFromInstance(
          instance,
          login,
        );
        allPositions.push(...positions);
      } catch (error) {
        console.error(`Failed to fetch positions from instance ${instance.id}:`, error);
      }
    }

    return allPositions;
  }

  /**
   * 获取账户余额
   */
  async getAccountBalances(
    tenantId?: string,
    instanceId?: string,
  ): Promise<AccountBalanceDto[]> {
    const instances = await this.getTargetInstances(tenantId, instanceId);

    const allBalances: AccountBalanceDto[] = [];

    for (const instance of instances) {
      try {
        const balances = await this.fetchAccountBalancesFromInstance(instance);
        allBalances.push(...balances);
      } catch (error) {
        console.error(`Failed to fetch balances from instance ${instance.id}:`, error);
      }
    }

    return allBalances;
  }

  /**
   * 获取交易统计
   */
  async getTradingStats(
    tenantId?: string,
    instanceId?: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<TradingStatsDto> {
    const query: TradingHistoryQueryDto = {
      tenantId,
      instanceId,
      fromDate: fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 默认30天
      toDate: toDate || new Date(),
      limit: 10000, // 获取所有数据用于统计
    };

    const { data: orders } = await this.getTradingHistory(query);

    const closedOrders = orders.filter((o) => o.closeTime);
    const winningOrders = closedOrders.filter((o) => o.profit > 0);
    const losingOrders = closedOrders.filter((o) => o.profit < 0);

    const totalProfit = closedOrders.reduce((sum, o) => sum + o.profit, 0);
    const totalWin = winningOrders.reduce((sum, o) => sum + o.profit, 0);
    const totalLoss = Math.abs(losingOrders.reduce((sum, o) => sum + o.profit, 0));

    // 按品种统计
    const symbolMap = new Map<string, { orders: number; volume: number; profit: number }>();
    orders.forEach((order) => {
      const existing = symbolMap.get(order.symbol) || { orders: 0, volume: 0, profit: 0 };
      existing.orders++;
      existing.volume += order.volume;
      existing.profit += order.profit;
      symbolMap.set(order.symbol, existing);
    });

    // 按类型统计
    const typeMap = new Map<OrderType, { orders: number; profit: number }>();
    orders.forEach((order) => {
      const existing = typeMap.get(order.type) || { orders: 0, profit: 0 };
      existing.orders++;
      existing.profit += order.profit;
      typeMap.set(order.type, existing);
    });

    return {
      totalOrders: orders.length,
      openOrders: orders.filter((o) => !o.closeTime).length,
      closedOrders: closedOrders.length,
      totalVolume: orders.reduce((sum, o) => sum + o.volume, 0),
      totalProfit,
      totalCommission: orders.reduce((sum, o) => sum + o.commission, 0),
      totalSwap: orders.reduce((sum, o) => sum + o.swap, 0),
      winRate: closedOrders.length > 0
        ? (winningOrders.length / closedOrders.length) * 100
        : 0,
      averageProfit: winningOrders.length > 0
        ? totalWin / winningOrders.length
        : 0,
      averageLoss: losingOrders.length > 0
        ? totalLoss / losingOrders.length
        : 0,
      profitFactor: totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0,
      bySymbol: Array.from(symbolMap.entries()).map(([symbol, data]) => ({
        symbol,
        ...data,
      })),
      byType: Array.from(typeMap.entries()).map(([type, data]) => ({
        type,
        ...data,
      })),
    };
  }

  /**
   * 获取所有租户的交易概览 (平台管理员视图)
   */
  async getAllTenantsOverview(): Promise<TenantTradingOverviewDto[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      include: {
        instances: {
          where: { status: 'ONLINE' },
          select: {
            id: true,
            name: true,
            status: true,
            host: true,
            port: true,
            apiKey: true,
          },
        },
      },
    });

    const overviews: TenantTradingOverviewDto[] = [];

    for (const tenant of tenants) {
      try {
        const overview = await this.getTenantOverview(tenant.id);
        overviews.push(overview);
      } catch (error) {
        // 如果获取失败，返回基本信息
        overviews.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          totalAccounts: 0,
          activeAccounts: 0,
          totalBalance: 0,
          totalEquity: 0,
          todayOrders: 0,
          todayVolume: 0,
          todayProfit: 0,
          instances: tenant.instances.map((i) => ({
            id: i.id,
            name: i.name,
            status: i.status,
            accounts: 0,
            todayOrders: 0,
          })),
        });
      }
    }

    return overviews;
  }

  /**
   * 获取单个租户的交易概览
   */
  async getTenantOverview(tenantId: string): Promise<TenantTradingOverviewDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        instances: {
          select: {
            id: true,
            name: true,
            status: true,
            host: true,
            port: true,
            apiKey: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    // 获取今日数据
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalAccounts = 0;
    let activeAccounts = 0;
    let totalBalance = 0;
    let totalEquity = 0;
    let todayOrders = 0;
    let todayVolume = 0;
    let todayProfit = 0;

    const instancesData: TenantTradingOverviewDto['instances'] = [];

    for (const instance of tenant.instances) {
      try {
        // 获取账户数据
        const balances = await this.fetchAccountBalancesFromInstance(instance);
        const instanceAccounts = balances.length;
        const instanceActiveAccounts = balances.filter((b) => b.equity > 0).length;
        const instanceBalance = balances.reduce((sum, b) => sum + b.balance, 0);
        const instanceEquity = balances.reduce((sum, b) => sum + b.equity, 0);

        // 获取今日订单
        const todayHistory = await this.fetchTradingHistoryFromInstance(instance, {
          fromDate: today,
          toDate: new Date(),
        });
        const instanceTodayOrders = todayHistory.length;
        const instanceTodayVolume = todayHistory.reduce((sum, o) => sum + o.volume, 0);
        const instanceTodayProfit = todayHistory.reduce((sum, o) => sum + o.profit, 0);

        totalAccounts += instanceAccounts;
        activeAccounts += instanceActiveAccounts;
        totalBalance += instanceBalance;
        totalEquity += instanceEquity;
        todayOrders += instanceTodayOrders;
        todayVolume += instanceTodayVolume;
        todayProfit += instanceTodayProfit;

        instancesData.push({
          id: instance.id,
          name: instance.name,
          status: instance.status,
          accounts: instanceAccounts,
          todayOrders: instanceTodayOrders,
        });
      } catch (error) {
        instancesData.push({
          id: instance.id,
          name: instance.name,
          status: instance.status,
          accounts: 0,
          todayOrders: 0,
        });
      }
    }

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      totalAccounts,
      activeAccounts,
      totalBalance,
      totalEquity,
      todayOrders,
      todayVolume,
      todayProfit,
      instances: instancesData,
    };
  }

  /**
   * 获取聚合交易数据 (按日/周/月)
   */
  async getAggregatedData(
    tenantId: string,
    period: 'daily' | 'weekly' | 'monthly',
    fromDate: Date,
    toDate: Date,
  ): Promise<AggregatedTradingDataDto[]> {
    const { data: orders } = await this.getTradingHistory({
      tenantId,
      fromDate,
      toDate,
      limit: 100000,
    });

    // 按时间段分组
    const grouped = new Map<string, { orders: number; volume: number; profit: number; commission: number }>();

    orders.forEach((order) => {
      const date = new Date(order.openTime);
      let periodKey: string;

      switch (period) {
        case 'daily':
          periodKey = date.toISOString().split('T')[0];
          break;
        case 'weekly':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          periodKey = `Week ${weekStart.toISOString().split('T')[0]}`;
          break;
        case 'monthly':
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }

      const existing = grouped.get(periodKey) || { orders: 0, volume: 0, profit: 0, commission: 0 };
      existing.orders++;
      existing.volume += order.volume;
      existing.profit += order.profit;
      existing.commission += order.commission;
      grouped.set(periodKey, existing);
    });

    return Array.from(grouped.entries())
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 获取目标实例列表
   */
  private async getTargetInstances(
    tenantId?: string,
    instanceId?: string,
  ): Promise<any[]> {
    if (instanceId) {
      const instance = await this.prisma.middlewareInstance.findUnique({
        where: { id: instanceId },
      });
      return instance ? [instance] : [];
    }

    const where: any = { status: 'ONLINE' };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    return this.prisma.middlewareInstance.findMany({ where });
  }

  /**
   * 从实例获取交易历史
   */
  private async fetchTradingHistoryFromInstance(
    instance: any,
    query: Partial<TradingHistoryQueryDto>,
  ): Promise<TradingOrderDto[]> {
    try {
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.get(
          `http://${instance.host}:${instance.port}/api/trading/history`,
          {
            headers: { 'X-API-Key': instance.apiKey },
            params: {
              login: query.login,
              symbol: query.symbol,
              type: query.orderType,
              from: query.fromDate?.toISOString(),
              to: query.toDate?.toISOString(),
            },
          },
        ).pipe(
          timeout(30000),
          catchError((error: AxiosError) => {
            throw error;
          }),
        ),
      );

      return response.data?.orders || [];
    } catch (error) {
      console.error(`Error fetching trading history from ${instance.host}:`, error);
      return [];
    }
  }

  /**
   * 从实例获取持仓
   */
  private async fetchOpenPositionsFromInstance(
    instance: any,
    login?: number,
  ): Promise<OpenPositionDto[]> {
    try {
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.get(
          `http://${instance.host}:${instance.port}/api/trading/positions`,
          {
            headers: { 'X-API-Key': instance.apiKey },
            params: { login },
          },
        ).pipe(
          timeout(10000),
          catchError((error: AxiosError) => {
            throw error;
          }),
        ),
      );

      return response.data?.positions || [];
    } catch (error) {
      console.error(`Error fetching positions from ${instance.host}:`, error);
      return [];
    }
  }

  /**
   * 从实例获取账户余额
   */
  private async fetchAccountBalancesFromInstance(
    instance: any,
  ): Promise<AccountBalanceDto[]> {
    try {
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.get(
          `http://${instance.host}:${instance.port}/api/accounts/balances`,
          {
            headers: { 'X-API-Key': instance.apiKey },
          },
        ).pipe(
          timeout(10000),
          catchError((error: AxiosError) => {
            throw error;
          }),
        ),
      );

      return response.data?.accounts || [];
    } catch (error) {
      console.error(`Error fetching balances from ${instance.host}:`, error);
      return [];
    }
  }
}
