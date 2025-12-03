import { get, post, put } from './index'
import type { RiskAlert, PaginatedResponse, PaginationParams } from '@/types'

export interface RiskAlertParams extends PaginationParams {
  type?: string
  severity?: string
  isRead?: boolean
}

export interface RiskThresholds {
  largeOrderVolume: number
  marginWarningLevel: number
  highFrequencyCount: number
  highFrequencyInterval: number
}

export const riskApi = {
  getAlerts(params?: Partial<RiskAlertParams>): Promise<PaginatedResponse<RiskAlert>> {
    return get<PaginatedResponse<RiskAlert>>('/tenant/risk/alerts', params || { page: 1, pageSize: 50 })
  },

  markAsRead(alertId: string): Promise<void> {
    return put(`/tenant/risk/alerts/${alertId}/read`)
  },

  markAllAsRead(): Promise<void> {
    return post('/tenant/risk/alerts/read-all')
  },

  getUnreadCount(): Promise<number> {
    return get<number>('/tenant/risk/alerts/unread-count')
  },

  getThresholds(): Promise<RiskThresholds> {
    return get<RiskThresholds>('/tenant/risk/thresholds')
  },

  updateThresholds(data: Partial<RiskThresholds>): Promise<void> {
    return put('/tenant/risk/thresholds', data)
  },

  getSummary(): Promise<any> {
    return get('/tenant/risk/summary')
  },

  getHighRiskUsers(): Promise<any[]> {
    return get('/tenant/risk/high-risk-users')
  },

  acknowledgeAlert(alertId: string): Promise<void> {
    return put(`/tenant/risk/alerts/${alertId}/acknowledge`)
  },
}
