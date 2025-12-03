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

export const tradingApi = {
  // Dashboard
  getDashboardStats(): Promise<DashboardStats> {
    return get<DashboardStats>('/tenant/dashboard/stats')
  },

  getTradingTrend(days: number = 7): Promise<any[]> {
    return get('/tenant/dashboard/trading-trend', { days })
  },

  getSymbolDistribution(): Promise<any[]> {
    return get('/tenant/dashboard/symbol-distribution')
  },

  getUserActivity(days: number = 7): Promise<any[]> {
    return get('/tenant/dashboard/user-activity', { days })
  },

  getRecentTrades(limit: number = 10): Promise<TradeHistory[]> {
    return get('/tenant/dashboard/recent-trades', { limit })
  },

  getSystemStatus(): Promise<any> {
    return get('/tenant/dashboard/system-status')
  },

  // Positions
  getPositions(params: PositionListParams): Promise<PaginatedResponse<Position>> {
    return get<PaginatedResponse<Position>>('/tenant/positions', params)
  },

  getUserPositions(login: number, params?: PaginationParams): Promise<PaginatedResponse<Position>> {
    return get<PaginatedResponse<Position>>(`/tenant/users/${login}/positions`, params)
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
    return get<PaginatedResponse<TradeHistory>>('/tenant/history', params)
  },

  getUserHistory(login: number, params?: PaginationParams): Promise<PaginatedResponse<TradeHistory>> {
    return get<PaginatedResponse<TradeHistory>>(`/tenant/users/${login}/history`, params)
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
