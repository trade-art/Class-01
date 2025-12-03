// Auth types
export interface LoginRequest {
  email: string
  password: string
  rememberMe?: boolean
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  admin: TenantAdmin
  tenant: Tenant
}

export interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

// Tenant types
export interface Tenant {
  id: string
  code: string
  name: string
  status: TenantStatus
  subscriptionPlan: string
  branding?: TenantBranding
  logoUrl?: string
  faviconUrl?: string
  createdAt: string
  updatedAt: string
}

export type TenantStatus = 'active' | 'pending' | 'suspended' | 'expired' | 'cancelled'

export interface TenantBranding {
  companyName?: string
  logoUrl?: string
  faviconUrl?: string
  primaryColor?: string
  contactEmail?: string
  contactPhone?: string
}

// Tenant Admin types
export interface TenantAdmin {
  id: string
  tenantId: string
  email: string
  name: string
  phone?: string
  role: TenantAdminRole
  isActive: boolean
  status?: 'active' | 'inactive'
  lastLoginAt?: string
  lastLoginIp?: string
  createdAt: string
  updatedAt: string
}

export type TenantAdminRole = 'owner' | 'admin' | 'operator'

// Trading User types
export interface TradingUser {
  id?: string
  login: number
  name: string
  email?: string
  phone?: string
  group: string
  leverage: number
  balance: number
  equity: number
  margin: number
  freeMargin: number
  marginLevel: number
  profit: number
  status: UserStatus
  createdAt: string
  updatedAt: string
}

export type UserStatus = 'active' | 'disabled' | 'readonly' | 'suspended'

// Position types
export interface Position {
  ticket: number
  login: number
  symbol: string
  type: PositionType
  volume: number
  openPrice: number
  currentPrice: number
  profit: number
  swap: number
  stopLoss: number
  takeProfit: number
  sl?: number
  tp?: number
  openTime: string
  comment?: string
}

export type PositionType = 'buy' | 'sell'

// Quote types
export interface Quote {
  symbol: string
  bid: number
  ask: number
  high: number
  low: number
  spread: number
  time: string
  digits: number
  volume?: number
}

// History types
export interface TradeHistory {
  id?: string
  ticket: number
  login: number
  symbol: string
  type: TradeType
  volume: number
  openPrice: number
  closePrice: number
  profit: number
  swap: number
  commission: number
  openTime: string
  closeTime: string
  comment?: string
}

export type TradeType = 'buy' | 'sell' | 'deposit' | 'withdrawal' | 'balance'

// Transaction types
export interface Transaction {
  id: string
  login: number
  type: 'deposit' | 'withdrawal'
  amount: number
  status: 'pending' | 'completed' | 'cancelled'
  createdAt: string
  completedAt?: string
}

// Risk Alert types
export interface RiskAlert {
  id: string
  type: RiskAlertType
  severity: RiskSeverity
  login?: number
  symbol?: string
  message: string
  data?: Record<string, any>
  isRead: boolean
  createdAt: string
}

export type RiskAlertType = 'largeOrder' | 'marginWarning' | 'abnormalTrade' | 'highFrequency'
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical'

// API Key types
export interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  prefix?: string
  permissions: string[]
  isActive: boolean
  status?: 'active' | 'revoked'
  lastUsedAt?: string
  expiresAt?: string
  createdAt: string
  ipWhitelist?: string[]
}

export interface CreateApiKeyRequest {
  name: string
  permissions: string[]
  expiresAt?: string
  ipWhitelist?: string[]
}

export interface CreateApiKeyResponse {
  apiKey: ApiKey
  key: string // Full key, only shown once
}

// Report types
export interface TradingStats {
  totalVolume: number
  totalTrades: number
  totalProfit: number
  activeUsers: number
}

export interface DashboardStats {
  totalUsers: number
  activeUsers: number
  totalVolume: number
  totalProfit: number
  openPositions: number
  todayTrades: number
}

// Pagination types
export interface PaginationParams {
  page: number
  pageSize: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// API Response wrapper
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

// WebSocket message types
export interface WsMessage<T = any> {
  type: string
  data: T
}

export interface QuoteUpdate {
  symbol: string
  bid: number
  ask: number
  time: string
}

export interface PositionUpdate {
  action: 'add' | 'update' | 'remove'
  position: Position
}

// Report params
export interface ReportParams {
  startDate?: string
  endDate?: string
  login?: number
  symbol?: string
  page?: number
  pageSize?: number
}

// Risk threshold types
export interface RiskThresholds {
  maxPositionSize: number
  maxDailyLoss: number
  maxDrawdown: number
  marginWarningLevel: number
}

// Risk alert params
export interface RiskAlertParams extends PaginationParams {
  type?: RiskAlertType
  severity?: RiskSeverity
  isRead?: boolean
}

// User list params
export interface UserListParams extends PaginationParams {
  search?: string
  keyword?: string
  status?: string
  group?: string
}
