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
  bySymbol: Array<{ symbol: string; count: number; volume: number; profit: number }>
  recentDeals: Array<{
    ticket: number
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
  serverStatus: {
    connected: boolean
    serverTime: string
    ping: number
  }
}

// 缓存 dashboard 数据，避免重复请求
let dashboardCache: { data: BackendDashboardData | null; timestamp: number } = {
  data: null,
  timestamp: 0,
}
const CACHE_TTL = 5000 // 5秒缓存

async function getDashboardData(): Promise<BackendDashboardData> {
  const now = Date.now()
  if (dashboardCache.data && now - dashboardCache.timestamp < CACHE_TTL) {
    return dashboardCache.data
  }
  const data = await get<BackendDashboardData>('/tenant/dashboard')
  dashboardCache = { data, timestamp: now }
  return data
}

export const tradingApi = {
  // Dashboard - 从后端获取完整数据并转换为前端格式
  async getDashboardStats(): Promise<DashboardStats> {
    const data = await getDashboardData()
    return {
      totalUsers: 0, // 后端暂不提供用户数据，默认为 0
      activeUsers: 0,
      totalVolume: data.positionsSummary?.totalVolume || 0,
      totalProfit: data.positionsSummary?.totalProfit || 0,
      openPositions: data.positionsSummary?.totalPositions || 0,
      todayTrades: data.recentDeals?.length || 0,
    }
  },

  async getTradingTrend(_days: number = 7): Promise<any[]> {
    // 后端暂不提供趋势数据，返回空数组
    return []
  },

  async getSymbolDistribution(): Promise<any[]> {
    const data = await getDashboardData()
    return (data.bySymbol || []).map(item => ({
      symbol: item.symbol,
      value: item.volume,
      count: item.count,
    }))
  },

  async getUserActivity(_days: number = 7): Promise<any[]> {
    // 后端暂不提供用户活动数据，返回空数组
    return []
  },

  async getRecentTrades(_limit: number = 10): Promise<TradeHistory[]> {
    const data = await getDashboardData()
    return (data.recentDeals || []).map(deal => ({
      ticket: deal.ticket,
      login: 0, // 后端 deal 不含 login
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

  async getSystemStatus(): Promise<any> {
    const data = await getDashboardData()
    return {
      middleware: data.serverStatus?.connected || false,
      mt5: data.serverStatus?.connected || false,
      serverTime: data.serverStatus?.serverTime,
      ping: data.serverStatus?.ping,
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
