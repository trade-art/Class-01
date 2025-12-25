/**
 * API Key 管理 API 模块
 * middleware-auth-refactor Task 32
 */
import { get, post, patch, del } from './index'

// ============================================
// Types
// ============================================

/**
 * API Key 作用域 (与后端 ApiKeyScope 枚举保持一致)
 *
 * 命名规范: <category>:<action>
 * - category: users, positions, history, quotes, trading, reports, risk, settings, market, batch, balance
 * - action: read, write, execute, history, export
 */
export enum ApiKeyScope {
  /** 所有权限 */
  ALL = '*',

  // ========== 用户/账户相关 ==========
  /** 读取用户/账户数据 */
  USERS_READ = 'users:read',
  /** 写入用户/账户数据 (创建、修改用户) */
  USERS_WRITE = 'users:write',

  // ========== 持仓相关 ==========
  /** 读取持仓数据 (WebSocket 实时推送) */
  POSITIONS_READ = 'positions:read',

  // ========== 交易历史 ==========
  /** 读取交易历史 (订单、成交记录) */
  HISTORY_READ = 'history:read',

  // ========== 行情相关 ==========
  /** 读取实时报价 (WebSocket 实时行情) */
  QUOTES_READ = 'quotes:read',
  /** 读取市场数据 (品种信息) */
  MARKET_READ = 'market:read',
  /** 读取市场历史数据 (K线、Tick) */
  MARKET_HISTORY = 'market:history',

  // ========== 交易操作 ==========
  /** 执行交易操作 (开仓/平仓/挂单/改单) */
  TRADING_EXECUTE = 'trading:execute',

  // ========== 批量操作 ==========
  /** 执行批量操作 (批量开仓/平仓/查询) */
  BATCH_EXECUTE = 'batch:execute',

  // ========== 报表相关 ==========
  /** 读取报表数据 */
  REPORTS_READ = 'reports:read',
  /** 导出报表 */
  REPORTS_EXPORT = 'reports:export',

  // ========== 风控相关 ==========
  /** 读取风控数据 */
  RISK_READ = 'risk:read',

  // ========== 设置相关 ==========
  /** 读取系统设置 */
  SETTINGS_READ = 'settings:read',
  /** 修改系统设置 */
  SETTINGS_WRITE = 'settings:write',

  // ========== 余额操作 ==========
  /** 余额调整操作 (入金/出金/信用) */
  BALANCE_WRITE = 'balance:write',
}

/** API Key 列表项 */
export interface ApiKeyListItem {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  allowedIps: string[]
  serverId?: string
  rateLimit: number
  usageCount: number
  lastUsedAt?: string
  lastUsedIp?: string
  isActive: boolean
  revokedAt?: string
  revokedBy?: string
  expiresAt?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

/** API Key 详情 (包含租户 ID) */
export interface ApiKeyDetail extends ApiKeyListItem {
  tenantId: string
}

/** 创建 API Key 请求 */
export interface CreateApiKeyRequest {
  name: string
  scopes?: string[]
  allowedIps?: string[]
  serverId?: string
  rateLimit?: number
  expiresAt?: string
}

/** 创建 API Key 响应 */
export interface CreateApiKeyResponse {
  id: string
  name: string
  apiKey: string  // 完整的 API Key，仅显示一次
  keyPrefix: string
  scopes: string[]
  allowedIps: string[]
  serverId?: string
  rateLimit: number
  expiresAt?: string
  createdAt: string
}

/** 更新 API Key 请求 */
export interface UpdateApiKeyRequest {
  name?: string
  allowedIps?: string[]
  scopes?: string[]
  rateLimit?: number
}

/** 撤销 API Key 请求 */
export interface RevokeApiKeyRequest {
  reason?: string
}

/** API Key 查询参数 */
export interface ApiKeyQueryParams {
  page?: number
  pageSize?: number
  search?: string
  status?: 'active' | 'revoked' | 'expired' | 'all'
  serverId?: string
}

/** API Key 列表响应 */
export interface ApiKeyListResponse {
  items: ApiKeyListItem[]
  total: number
  page: number
  pageSize: number
}

// ============================================
// API Functions
// ============================================

export const apiKeysApi = {
  /**
   * 获取 API Key 列表
   */
  getList(params?: ApiKeyQueryParams): Promise<ApiKeyListResponse> {
    return get<ApiKeyListResponse>('/tenant/api-keys', {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 20,
      search: params?.search,
      status: params?.status ?? 'active',
      serverId: params?.serverId,
    })
  },

  /**
   * 获取 API Key 详情
   */
  getDetail(id: string): Promise<ApiKeyDetail> {
    return get<ApiKeyDetail>(`/tenant/api-keys/${id}`)
  },

  /**
   * 创建 API Key
   * @returns 包含完整 API Key 的响应 (apiKey 仅显示一次)
   */
  create(data: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    return post<CreateApiKeyResponse>('/tenant/api-keys', data)
  },

  /**
   * 更新 API Key
   */
  update(id: string, data: UpdateApiKeyRequest): Promise<ApiKeyListItem> {
    return patch<ApiKeyListItem>(`/tenant/api-keys/${id}`, data)
  },

  /**
   * 撤销 API Key
   * @param id API Key ID
   * @param reason 撤销原因 (可选)
   */
  revoke(id: string, reason?: string): Promise<ApiKeyListItem> {
    const body: RevokeApiKeyRequest = reason ? { reason } : {}
    return del<ApiKeyListItem>(`/tenant/api-keys/${id}`, body)
  },

  /**
   * 永久删除 API Key (仅限已吊销的)
   * @param id API Key ID
   */
  delete(id: string): Promise<void> {
    return del<void>(`/tenant/api-keys/${id}/permanent`)
  },
}

// ============================================
// Helper Functions
// ============================================

/** 作用域显示名称映射 (与后端 ApiKeyScope 枚举保持一致) */
export const scopeLabels: Record<string, { label: string; description: string }> = {
  // ========== 新版作用域 ==========
  [ApiKeyScope.ALL]: {
    label: '全部权限',
    description: '完整访问所有 External Trading API 功能',
  },
  // 用户/账户
  [ApiKeyScope.USERS_READ]: {
    label: '账户查询',
    description: '查询用户账户信息、余额、净值等',
  },
  [ApiKeyScope.USERS_WRITE]: {
    label: '账户管理',
    description: '创建用户、修改用户信息、重置密码',
  },
  // 持仓
  [ApiKeyScope.POSITIONS_READ]: {
    label: '持仓查询',
    description: '查询实时持仓数据，支持 WebSocket 推送',
  },
  // 交易历史
  [ApiKeyScope.HISTORY_READ]: {
    label: '交易历史',
    description: '查询历史订单、成交记录、出入金记录',
  },
  // 行情
  [ApiKeyScope.QUOTES_READ]: {
    label: '实时行情',
    description: '获取实时报价数据，支持 WebSocket 订阅',
  },
  [ApiKeyScope.MARKET_READ]: {
    label: '品种信息',
    description: '查询交易品种配置、合约规格等',
  },
  [ApiKeyScope.MARKET_HISTORY]: {
    label: '市场历史',
    description: '查询 K线数据、Tick 历史记录',
  },
  // 交易操作
  [ApiKeyScope.TRADING_EXECUTE]: {
    label: '交易执行',
    description: '开仓、平仓、挂单、改单、撤单操作',
  },
  // 批量操作
  [ApiKeyScope.BATCH_EXECUTE]: {
    label: '批量操作',
    description: '批量开仓、批量平仓、批量账户查询',
  },
  // 报表
  [ApiKeyScope.REPORTS_READ]: {
    label: '报表查询',
    description: '查询交易报表、用户报表、财务报表',
  },
  [ApiKeyScope.REPORTS_EXPORT]: {
    label: '报表导出',
    description: '导出 CSV/Excel 格式报表',
  },
  // 风控
  [ApiKeyScope.RISK_READ]: {
    label: '风控数据',
    description: '查询风险敞口、保证金水平等数据',
  },
  // 设置
  [ApiKeyScope.SETTINGS_READ]: {
    label: '设置查询',
    description: '查询系统和租户配置',
  },
  [ApiKeyScope.SETTINGS_WRITE]: {
    label: '设置管理',
    description: '修改系统和租户配置',
  },
  // 余额操作
  [ApiKeyScope.BALANCE_WRITE]: {
    label: '余额调整',
    description: '执行入金、出金、信用、调整操作',
  },

  // ========== 兼容旧版作用域 (数据库中可能存在的旧数据) ==========
  'account:read': {
    label: '账户查询',
    description: '查询账户信息 (旧版)',
  },
  'account:write': {
    label: '账户管理',
    description: '管理账户信息 (旧版)',
  },
  'trade:read': {
    label: '交易查询',
    description: '查询交易数据 (旧版)',
  },
  'trade:write': {
    label: '交易操作',
    description: '执行交易操作 (旧版)',
  },
  'trading:read': {
    label: '交易查询',
    description: '查询交易数据 (旧版)',
  },
  'trading:write': {
    label: '交易操作',
    description: '执行交易操作 (旧版)',
  },
  // 注: 'market:read' 与 ApiKeyScope.MARKET_READ 相同，无需重复定义
}

/** 新版作用域值列表 (用于创建/编辑时的选项) */
const newScopeValues = Object.values(ApiKeyScope) as string[]

/** 旧版作用域到新版的映射 */
const legacyScopeMap: Record<string, string> = {
  'account:read': ApiKeyScope.USERS_READ,
  'account:write': ApiKeyScope.USERS_WRITE,
  'trade:read': ApiKeyScope.HISTORY_READ,
  'trade:write': ApiKeyScope.TRADING_EXECUTE,
  'trading:read': ApiKeyScope.HISTORY_READ,
  'trading:write': ApiKeyScope.TRADING_EXECUTE,
  'market:read': ApiKeyScope.QUOTES_READ,
}

/**
 * 将旧版作用域映射为新版
 * @param scopes 原始作用域数组
 * @returns 映射后的作用域数组 (去重)
 */
export function mapLegacyScopes(scopes: string[]): string[] {
  const mapped = scopes.map((scope) => legacyScopeMap[scope] || scope)
  // 去重
  return [...new Set(mapped)]
}

/**
 * 获取所有可用的作用域选项 (仅返回新版作用域)
 */
export function getAvailableScopes(): Array<{
  value: string
  label: string
  description: string
}> {
  return newScopeValues
    .filter((value) => scopeLabels[value])
    .map((value) => ({
      value,
      label: scopeLabels[value].label,
      description: scopeLabels[value].description,
    }))
}

/**
 * 格式化作用域显示
 */
export function formatScopes(scopes: string[]): string {
  if (scopes.includes(ApiKeyScope.ALL)) {
    return '所有权限'
  }
  return scopes
    .map((s) => scopeLabels[s]?.label || s)
    .join(', ')
}

/**
 * 获取 API Key 状态
 */
export function getApiKeyStatus(
  item: ApiKeyListItem
): 'active' | 'revoked' | 'expired' {
  if (item.revokedAt) {
    return 'revoked'
  }
  if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
    return 'expired'
  }
  return 'active'
}

/**
 * 状态显示配置
 */
export const statusConfig = {
  active: { label: '正常', type: 'success' as const },
  revoked: { label: '已撤销', type: 'error' as const },
  expired: { label: '已过期', type: 'warning' as const },
}
