import { get, post } from './index'

export interface ReportParams {
  startDate: string
  endDate: string
  period?: 'daily' | 'weekly' | 'monthly'
}

export const reportsApi = {
  // Trading reports
  getTradingReport(params: ReportParams): Promise<any> {
    return get('/tenant/reports/trading', params)
  },

  getVolumeTrend(params: ReportParams): Promise<any[]> {
    return get('/tenant/reports/trading/volume-trend', params)
  },

  getAmountTrend(params: ReportParams): Promise<any[]> {
    return get('/tenant/reports/trading/amount-trend', params)
  },

  getSymbolAnalysis(params: ReportParams): Promise<any[]> {
    return get('/tenant/reports/trading/symbol-analysis', params)
  },

  getTimeAnalysis(params: ReportParams): Promise<any[]> {
    return get('/tenant/reports/trading/time-analysis', params)
  },

  // User reports
  getUserReport(params: ReportParams): Promise<any> {
    return get('/tenant/reports/users', params)
  },

  getNewUsersTrend(params: ReportParams): Promise<any[]> {
    return get('/tenant/reports/users/new-trend', params)
  },

  getActiveUsersTrend(params: ReportParams): Promise<any[]> {
    return get('/tenant/reports/users/active-trend', params)
  },

  getUserRetention(params: ReportParams): Promise<any> {
    return get('/tenant/reports/users/retention', params)
  },

  getUserValueRanking(limit: number = 10): Promise<any[]> {
    return get('/tenant/reports/users/value-ranking', { limit })
  },

  getGroupStats(): Promise<any[]> {
    return get('/tenant/reports/users/group-stats')
  },

  // Finance reports
  getFinanceReport(params: ReportParams): Promise<any> {
    return get('/tenant/reports/finance', params)
  },

  getDepositWithdrawalStats(params: ReportParams): Promise<any> {
    return get('/tenant/reports/finance/deposit-withdrawal', params)
  },

  getCashFlow(params: ReportParams): Promise<any[]> {
    return get('/tenant/reports/finance/cash-flow', params)
  },

  getCommissionIncome(params: ReportParams): Promise<any[]> {
    return get('/tenant/reports/finance/commission', params)
  },

  getMonthlyComparison(): Promise<any[]> {
    return get('/tenant/reports/finance/monthly-comparison')
  },

  // Quick stats
  getQuickStats(): Promise<any> {
    return get('/tenant/reports/quick-stats')
  },

  // Transactions
  getTransactions(params: ReportParams): Promise<any> {
    return get('/tenant/reports/finance/transactions', params)
  },

  // Export
  exportReport(type: 'trading' | 'users' | 'finance', params: ReportParams, format: 'pdf' | 'excel'): Promise<Blob> {
    return post(`/tenant/reports/${type}/export`, { ...params, format }, {
      responseType: 'blob',
    } as any)
  },

  exportTradingReport(params: ReportParams, format: 'pdf' | 'excel' = 'excel'): Promise<Blob> {
    return post('/tenant/reports/trading/export', { ...params, format }, {
      responseType: 'blob',
    } as any)
  },

  exportFinanceReport(params: ReportParams, format: 'pdf' | 'excel' = 'excel'): Promise<Blob> {
    return post('/tenant/reports/finance/export', { ...params, format }, {
      responseType: 'blob',
    } as any)
  },

  exportUserReport(params: ReportParams, format: 'pdf' | 'excel' = 'excel'): Promise<Blob> {
    return post('/tenant/reports/users/export', { ...params, format }, {
      responseType: 'blob',
    } as any)
  },
}
