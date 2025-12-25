import { get, post } from './index'
import type { Position, TradeHistory, Quote, PaginatedResponse, PaginationParams, TradingStats, DashboardStats } from '@/types'

export interface PositionListParams extends PaginationParams {
  login?: number
  symbol?: string
  profitFilter?: 'profit' | 'loss'
}

export interface HistoryListParams extends PaginationParams {
  login?: number
  symbol?: string
  type?: string
  startDate?: string
  endDate?: string
}

// 转换前端分页参数为后端格式 (pageSize -> limit)
function convertPaginationParams<T extends Partial<PaginationParams>>(params: T): Omit<T, 'pageSize'> & { limit?: number } {
  const { pageSize, ...rest } = params as any
  return pageSize !== undefined ? { ...rest, limit: pageSize } : rest
}

// 后端 Dashboard 返回的数据结构
interface BackendDashboardData {
  accountSummary: {
    totalBalance: number
    totalEquity: number
    totalProfit: number
    totalMargin: number
    totalFreeMargin: number
    marginLevel: number
  }
  positionsSummary: {
    totalPositions: number
    totalVolume: number
    totalProfit: number
    buyCount: number
    sellCount: number
    buyProfit: number
    sellProfit: number
  }
  usersSummary: {
    totalUsers: number
    activeUsers: number
  }
  bySymbol: Array<{ symbol: string; count: number; volume: number; profit: number }>
  recentDeals: Array<{
    ticket: number
    login?: number
    symbol: string
    type: string
    volume: number
    price: number
    profit: number
    commission: number
    swap: number
    time: string
    comment?: string
  }>
  tradingTrend: Array<{
    date: string
    trades: number
    volume: number
    profit: number
  }>
  serverStatus: {
    connected: boolean
    authenticated: boolean
    serverTime: string
    ping: number
  }
}

// 后端 Dashboard 基础数据结构（快速加载）
interface BackendDashboardBaseData {
  accountSummary: {
    totalBalance: number
    totalEquity: number
    totalProfit: number
    totalMargin: number
    totalFreeMargin: number
    marginLevel: number
  }
  positionsSummary: {
    totalPositions: number
    totalVolume: number
    totalProfit: number
    buyCount: number
    sellCount: number
    buyProfit: number
    sellProfit: number
  }
  usersSummary: {
    totalUsers: number
    activeUsers: number
  }
  serverStatus: {
    connected: boolean
    authenticated: boolean
    serverTime: string
    ping: number
  }
}

// 后端交易统计数据结构（异步加载）
interface BackendTradingStatsData {
  bySymbol: Array<{ symbol: string; count: number; volume: number; profit: number }>
  recentDeals: Array<{
    ticket: number
    login?: number
    symbol: string
    type: string
    volume: number
    profit: number
    time: string
  }>
  tradingTrend: Array<{
    date: string
    trades: number
    volume: number
    profit: number
  }>
  todayTrades: number
  totalVolume: number
  totalProfit: number
}

// 缓存 dashboard 数据，避免重复请求（按 serverId 缓存）
const dashboardCache: Map<string, { data: BackendDashboardData; timestamp: number }> = new Map()
const dashboardBaseCache: Map<string, { data: BackendDashboardBaseData; timestamp: number }> = new Map()
const tradingStatsCache: Map<string, { data: BackendTradingStatsData; timestamp: number }> = new Map()
const CACHE_TTL = 60000 // 60秒缓存，与 Store 层保持一致

async function getDashboardData(serverId?: string): Promise<BackendDashboardData> {
  const cacheKey = serverId || '__default__'
  const now = Date.now()
  const cached = dashboardCache.get(cacheKey)
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  const params = serverId ? { serverId } : undefined
  const data = await get<BackendDashboardData>('/tenant/dashboard', params)
  dashboardCache.set(cacheKey, { data, timestamp: now })
  return data
}

// 获取 Dashboard 基础数据（快速加载，不含交易历史）
async function getDashboardBaseData(serverId?: string): Promise<BackendDashboardBaseData> {
  const cacheKey = serverId || '__default__'
  const now = Date.now()
  const cached = dashboardBaseCache.get(cacheKey)
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  const params = serverId ? { serverId } : undefined
  const data = await get<BackendDashboardBaseData>('/tenant/dashboard/base', params)
  dashboardBaseCache.set(cacheKey, { data, timestamp: now })
  return data
}

// 获取交易统计数据（异步加载）
async function getTradingStatsData(serverId?: string): Promise<BackendTradingStatsData> {
  const cacheKey = serverId || '__default__'
  const now = Date.now()
  const cached = tradingStatsCache.get(cacheKey)
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  const params = serverId ? { serverId } : undefined
  const data = await get<BackendTradingStatsData>('/tenant/dashboard/trading-stats', params)
  tradingStatsCache.set(cacheKey, { data, timestamp: now })
  return data
}

// 清除指定服务器的缓存
export function clearDashboardCache(serverId?: string): void {
  if (serverId) {
    dashboardCache.delete(serverId)
    dashboardBaseCache.delete(serverId)
    tradingStatsCache.delete(serverId)
  } else {
    dashboardCache.clear()
    dashboardBaseCache.clear()
    tradingStatsCache.clear()
  }
}

export const tradingApi = {
  // Dashboard - 从后端获取完整数据并转换为前端格式
  async getDashboardStats(serverId?: string): Promise<DashboardStats> {
    const data = await getDashboardData(serverId)

    // 计算今日交易数量：从 tradingTrend 中获取今天的统计（更准确）
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const todayTrend = (data.tradingTrend || []).find((item) => item.date === today)
    const todayTradesCount = todayTrend?.trades || 0

    return {
      totalUsers: data.usersSummary?.totalUsers || 0,
      activeUsers: data.usersSummary?.activeUsers || 0,
      totalVolume: data.positionsSummary?.totalVolume || 0,
      totalProfit: data.accountSummary?.totalProfit || 0, // 使用账户汇总的盈利
      openPositions: data.positionsSummary?.totalPositions || 0,
      todayTrades: todayTradesCount,
    }
  },

  /**
   * 获取 Dashboard 基础统计数据（快速加载）
   * 不包含交易历史，用于快速显示用户数、持仓等
   */
  async getDashboardBaseStats(serverId?: string): Promise<{
    totalUsers: number
    activeUsers: number
    openPositions: number
    totalProfit: number
    systemStatus: { middleware: boolean; mt5: boolean }
  }> {
    const data = await getDashboardBaseData(serverId)
    return {
      totalUsers: data.usersSummary?.totalUsers || 0,
      activeUsers: data.usersSummary?.activeUsers || 0,
      openPositions: data.positionsSummary?.totalPositions || 0,
      totalProfit: data.accountSummary?.totalProfit || 0,
      systemStatus: {
        middleware: data.serverStatus?.connected || false,
        mt5: data.serverStatus?.authenticated || false,
      },
    }
  },

  /**
   * 获取交易统计数据（异步加载）
   * 包含交易历史相关数据：交易量、今日交易、品种分布、近期交易、交易趋势
   */
  async getTradingStatsAsync(serverId?: string): Promise<{
    totalVolume: number
    todayTrades: number
    totalProfit: number
    tradingTrend: any[]
    symbolDistribution: any[]
    recentTrades: TradeHistory[]
  }> {
    const data = await getTradingStatsData(serverId)
    return {
      totalVolume: data.totalVolume || 0,
      todayTrades: data.todayTrades || 0,
      totalProfit: data.totalProfit || 0,
      tradingTrend: (data.tradingTrend || []).map(item => ({
        date: item.date,
        value: item.trades,
        trades: item.trades,
        volume: item.volume,
        profit: item.profit,
      })),
      symbolDistribution: (data.bySymbol || []).map(item => ({
        name: item.symbol,
        symbol: item.symbol,
        value: item.volume,
        count: item.count,
      })),
      recentTrades: (data.recentDeals || []).map(deal => ({
        ticket: deal.ticket,
        login: deal.login || 0,
        symbol: deal.symbol,
        type: deal.type as 'buy' | 'sell',
        volume: deal.volume,
        openPrice: 0,
        closePrice: 0,
        sl: 0,
        tp: 0,
        profit: deal.profit,
        commission: 0,
        swap: 0,
        openTime: deal.time,
        closeTime: deal.time,
      })),
    }
  },

  async getTradingTrend(_days: number = 7, serverId?: string): Promise<any[]> {
    const data = await getDashboardData(serverId)
    // 返回后端提供的趋势数据，转换为 LineChart 期望的格式
    // LineChart 组件需要 { date: string; value: number } 格式
    // 使用 trades (交易笔数) 作为 value 显示
    return (data.tradingTrend || []).map(item => ({
      date: item.date,
      value: item.trades, // LineChart 需要 value 字段
      trades: item.trades,
      volume: item.volume,
      profit: item.profit,
    }))
  },

  async getSymbolDistribution(serverId?: string): Promise<any[]> {
    const data = await getDashboardData(serverId)
    // PieChart 组件需要 { name: string; value: number } 格式
    return (data.bySymbol || []).map(item => ({
      name: item.symbol, // PieChart 需要 name 字段作为品种名称
      symbol: item.symbol,
      value: item.volume,
      count: item.count,
    }))
  },

  async getUserActivity(_days: number = 7, _serverId?: string): Promise<any[]> {
    // 后端暂不提供用户活动数据，返回空数组
    return []
  },

  async getRecentTrades(_limit: number = 10, serverId?: string): Promise<TradeHistory[]> {
    const data = await getDashboardData(serverId)
    return (data.recentDeals || []).map(deal => ({
      ticket: deal.ticket,
      login: deal.login || 0, // 使用后端返回的 login
      symbol: deal.symbol,
      type: deal.type as 'buy' | 'sell',
      volume: deal.volume,
      openPrice: deal.price,
      closePrice: deal.price,
      sl: 0,
      tp: 0,
      profit: deal.profit,
      commission: deal.commission,
      swap: deal.swap,
      openTime: deal.time,
      closeTime: deal.time,
      comment: deal.comment,
    }))
  },

  /**
   * 获取系统状态（轻量级端点，实时状态）
   * 调用专用的 /tenant/dashboard/status 端点，不获取业务数据
   */
  async getSystemStatus(_serverId?: string): Promise<{ middleware: boolean; mt5: boolean; serverTime: string; ping: number }> {
    try {
      // 调用轻量级状态端点，不需要获取全部 dashboard 数据
      const data = await get<{ middleware: boolean; mt5: boolean; serverTime: string; ping: number }>('/tenant/dashboard/status')
      return {
        middleware: data.middleware,
        mt5: data.mt5,
        serverTime: data.serverTime,
        ping: data.ping,
      }
    } catch (error) {
      // 请求失败时返回离线状态
      console.error('[Trading API] getSystemStatus failed:', error)
      return {
        middleware: false,
        mt5: false,
        serverTime: new Date().toISOString(),
        ping: -1,
      }
    }
  },

  // Positions
  getPositions(params: PositionListParams): Promise<PaginatedResponse<Position>> {
    return get<PaginatedResponse<Position>>('/tenant/positions', convertPaginationParams(params))
  },

  getUserPositions(login: number, params?: PaginationParams): Promise<PaginatedResponse<Position>> {
    return get<PaginatedResponse<Position>>(`/tenant/users/${login}/positions`, params ? convertPaginationParams(params) : undefined)
  },

  getPositionStats(): Promise<{ total: number; volume: number; profit: number; longShortRatio: number }> {
    return get('/tenant/positions/stats')
  },

  // Quotes
  getQuotes(): Promise<Quote[]> {
    return get<Quote[]>('/tenant/quotes')
  },

  getFavorites(): Promise<string[]> {
    return get<string[]>('/tenant/quotes/favorites')
  },

  addFavorite(symbol: string): Promise<void> {
    return post('/tenant/quotes/favorites', { symbol })
  },

  removeFavorite(symbol: string): Promise<void> {
    return post('/tenant/quotes/favorites/remove', { symbol })
  },

  // History
  getHistory(params: HistoryListParams): Promise<PaginatedResponse<TradeHistory>> {
    return get<PaginatedResponse<TradeHistory>>('/tenant/history', convertPaginationParams(params))
  },

  getUserHistory(login: number, params?: PaginationParams): Promise<PaginatedResponse<TradeHistory>> {
    return get<PaginatedResponse<TradeHistory>>(`/tenant/users/${login}/history`, params ? convertPaginationParams(params) : undefined)
  },

  getHistoryStats(params: Omit<HistoryListParams, 'page' | 'pageSize'>): Promise<TradingStats> {
    return get<TradingStats>('/tenant/history/stats', params)
  },

  exportHistory(params: Omit<HistoryListParams, 'page' | 'pageSize'>, format: 'csv' | 'excel' = 'csv'): Promise<Blob> {
    return post('/tenant/history/export', { ...params, format }, {
      responseType: 'blob',
    } as any)
  },
}
