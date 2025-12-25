import { defineStore } from 'pinia'
import { ref } from 'vue'
import { tradingApi, clearDashboardCache } from '@/api/trading'
import { settingsApi, type SubscriptionStatus } from '@/api/settings'
import type { DashboardStats, TradeHistory } from '@/types'

/** 缓存有效时间（毫秒） - 60秒 */
const CACHE_TTL = 60 * 1000

interface DashboardCache {
  stats: DashboardStats | null
  tradingTrend: any[]
  symbolDistribution: any[]
  recentTrades: TradeHistory[]
  systemStatus: { middleware: boolean; mt5: boolean } | null
  timestamp: number
  // 新增：交易数据是否已加载
  tradingStatsLoaded: boolean
}

interface ServerDashboardCache {
  [serverId: string]: DashboardCache
}

interface DashboardData {
  stats: DashboardStats | null
  tradingTrend: any[]
  symbolDistribution: any[]
  recentTrades: TradeHistory[]
  systemStatus: { middleware: boolean; mt5: boolean } | null
  quotaData: SubscriptionStatus | null
}

/**
 * Dashboard 数据缓存 Store
 * 使用内存缓存减少重复请求，提升页面切换体验
 * 支持按服务器 ID 分别缓存数据
 *
 * 优化策略：先显示缓存数据，后台静默刷新
 */
export const useDashboardStore = defineStore('dashboard', () => {
  // 按服务器 ID 缓存数据
  const serverCache = ref<ServerDashboardCache>({})

  // 全局配额数据（不按服务器分）
  const quotaData = ref<SubscriptionStatus | null>(null)
  const quotaTimestamp = ref(0)

  // 当前选中的服务器 ID
  const currentServerId = ref<string>('')

  // Loading 状态 - 仅首次加载时为 true
  const loading = ref(false)

  // 后台刷新状态（用于显示刷新指示器，可选）
  const refreshing = ref(false)

  // 交易统计数据加载状态（异步加载）
  const tradingStatsLoading = ref(false)

  /**
   * 获取缓存键
   */
  const getCacheKey = (serverId?: string): string => {
    return serverId || '__default__'
  }

  /**
   * 检查是否有缓存数据（不检查是否过期）
   */
  const hasCachedData = (serverId?: string): boolean => {
    const key = getCacheKey(serverId)
    const cache = serverCache.value[key]
    return !!cache?.stats
  }

  /**
   * 检查指定服务器的缓存是否有效（未过期）
   */
  const isCacheValid = (serverId?: string): boolean => {
    const key = getCacheKey(serverId)
    const cache = serverCache.value[key]
    if (!cache?.stats) return false
    const now = Date.now()
    return now - cache.timestamp < CACHE_TTL
  }

  /**
   * 检查配额数据缓存是否有效
   */
  const isQuotaCacheValid = (): boolean => {
    if (!quotaData.value) return false
    const now = Date.now()
    return now - quotaTimestamp.value < CACHE_TTL
  }

  /**
   * 独立加载配额数据（不依赖 MT5 服务器）
   * 用于页面加载时立即显示配额信息
   */
  const loadQuotaData = async (forceRefresh = false): Promise<SubscriptionStatus | null> => {
    // 如果缓存有效且非强制刷新，直接返回
    if (!forceRefresh && isQuotaCacheValid()) {
      return quotaData.value
    }

    try {
      quotaData.value = await settingsApi.getSubscriptionStatus()
      quotaTimestamp.value = Date.now()
      return quotaData.value
    } catch (error) {
      console.error('[Dashboard] Failed to load quota data:', error)
      return quotaData.value
    }
  }

  /**
   * 获取缓存的数据
   */
  const getCachedData = (serverId?: string): DashboardData | null => {
    const key = getCacheKey(serverId)
    const cache = serverCache.value[key]
    if (!cache?.stats) return null
    return {
      stats: cache.stats,
      tradingTrend: cache.tradingTrend,
      symbolDistribution: cache.symbolDistribution,
      recentTrades: cache.recentTrades,
      systemStatus: cache.systemStatus,
      quotaData: quotaData.value,
    }
  }

  /**
   * 从 API 获取数据并更新缓存
   * 使用 Promise.all 并行获取所有数据，提升加载速度
   */
  const fetchFromApi = async (serverId?: string): Promise<DashboardData> => {
    const cacheKey = getCacheKey(serverId)

    // 并行获取所有数据（API 层有内存缓存，实际只发起一次 HTTP 请求）
    const [statsData, trendData, distributionData, tradesData, statusData] = await Promise.all([
      tradingApi.getDashboardStats(serverId),
      tradingApi.getTradingTrend(7, serverId),
      tradingApi.getSymbolDistribution(serverId),
      tradingApi.getRecentTrades(10, serverId),
      tradingApi.getSystemStatus(serverId),
    ])

    // 配额数据只需获取一次（不按服务器分）
    if (!isQuotaCacheValid()) {
      quotaData.value = await settingsApi.getSubscriptionStatus()
      quotaTimestamp.value = Date.now()
    }

    // 更新服务器缓存
    serverCache.value[cacheKey] = {
      stats: statsData,
      tradingTrend: trendData,
      symbolDistribution: distributionData,
      recentTrades: tradesData,
      systemStatus: statusData,
      timestamp: Date.now(),
      tradingStatsLoaded: true,
    }

    return {
      stats: statsData,
      tradingTrend: trendData,
      symbolDistribution: distributionData,
      recentTrades: tradesData,
      systemStatus: statusData,
      quotaData: quotaData.value,
    }
  }

  /**
   * 分步加载：先获取基础数据，再异步获取交易统计
   * 优化首屏加载速度
   */
  const fetchBaseDataFirst = async (serverId?: string): Promise<DashboardData> => {
    const cacheKey = getCacheKey(serverId)

    // 第一步：获取基础数据（快速）
    const baseData = await tradingApi.getDashboardBaseStats(serverId)

    // 配额数据
    if (!isQuotaCacheValid()) {
      quotaData.value = await settingsApi.getSubscriptionStatus()
      quotaTimestamp.value = Date.now()
    }

    // 创建初始 stats（交易相关数据暂时为 0 或加载中状态）
    const initialStats: DashboardStats = {
      totalUsers: baseData.totalUsers,
      activeUsers: baseData.activeUsers,
      totalVolume: 0, // 等待异步加载
      totalProfit: baseData.totalProfit,
      openPositions: baseData.openPositions,
      todayTrades: 0, // 等待异步加载
    }

    // 更新缓存（标记交易数据未加载）
    serverCache.value[cacheKey] = {
      stats: initialStats,
      tradingTrend: [],
      symbolDistribution: [],
      recentTrades: [],
      systemStatus: baseData.systemStatus,
      timestamp: Date.now(),
      tradingStatsLoaded: false,
    }

    // 第二步：异步加载交易统计数据（不阻塞返回）
    tradingStatsLoading.value = true
    tradingApi.getTradingStatsAsync(serverId)
      .then((tradingData) => {
        // 更新缓存中的交易数据
        const cache = serverCache.value[cacheKey]
        if (cache) {
          serverCache.value[cacheKey] = {
            ...cache,
            stats: {
              ...cache.stats!,
              totalVolume: tradingData.totalVolume,
              todayTrades: tradingData.todayTrades,
            },
            tradingTrend: tradingData.tradingTrend,
            symbolDistribution: tradingData.symbolDistribution,
            recentTrades: tradingData.recentTrades,
            tradingStatsLoaded: true,
          }
        }
        console.debug(`[Dashboard] Trading stats loaded for: ${cacheKey}`)
      })
      .catch((err) => {
        console.error(`[Dashboard] Failed to load trading stats:`, err)
      })
      .finally(() => {
        tradingStatsLoading.value = false
      })

    return {
      stats: initialStats,
      tradingTrend: [],
      symbolDistribution: [],
      recentTrades: [],
      systemStatus: baseData.systemStatus,
      quotaData: quotaData.value,
    }
  }

  /**
   * 获取 Dashboard 数据（带缓存优化）
   *
   * 策略：
   * - 无缓存：显示 loading，获取数据
   * - 有缓存 + 非强制刷新 + 缓存有效：直接返回缓存
   * - 有缓存 + 强制刷新：先返回缓存（无 loading），后台静默刷新
   *
   * @param serverId 服务器 ID（可选）
   * @param forceRefresh 强制刷新缓存
   * @returns Dashboard 数据 + 可选的后台刷新 Promise
   */
  const loadDashboardData = async (
    serverId?: string,
    forceRefresh = false
  ): Promise<DashboardData> => {
    const cacheKey = getCacheKey(serverId)
    const hasCache = hasCachedData(serverId)
    const cacheValid = isCacheValid(serverId)

    // 情况 1: 缓存有效且非强制刷新 - 直接返回缓存
    if (!forceRefresh && cacheValid) {
      console.debug(`[Dashboard] Cache hit for server: ${cacheKey}`)
      return getCachedData(serverId)!
    }

    // 情况 2: 有缓存但需要刷新 - 先返回缓存，后台静默刷新
    if (hasCache && forceRefresh) {
      console.debug(`[Dashboard] Returning cached data, refreshing in background for: ${cacheKey}`)
      const cachedData = getCachedData(serverId)!

      // 后台静默刷新（不阻塞返回）
      refreshing.value = true
      clearDashboardCache(serverId) // 清除 API 层缓存以获取最新数据
      fetchFromApi(serverId)
        .then(() => {
          console.debug(`[Dashboard] Background refresh completed for: ${cacheKey}`)
        })
        .catch((err) => {
          console.error(`[Dashboard] Background refresh failed:`, err)
          // 刷新失败时，更新 systemStatus 为离线状态
          // 这样用户能看到正确的连接状态
          const existingCache = serverCache.value[cacheKey]
          if (existingCache) {
            serverCache.value[cacheKey] = {
              ...existingCache,
              systemStatus: { middleware: false, mt5: false },
              timestamp: Date.now(),
            }
          }
        })
        .finally(() => {
          refreshing.value = false
        })

      return cachedData
    }

    // 情况 3: 无缓存 - 使用分步加载策略，先显示基础数据
    console.debug(`[Dashboard] No cache, fetching base data first for: ${cacheKey}`)
    loading.value = true
    try {
      clearDashboardCache(serverId) // 确保获取最新数据
      // 使用分步加载：基础数据立即返回，交易数据异步加载
      return await fetchBaseDataFirst(serverId)
    } catch (err) {
      console.error(`[Dashboard] Initial load failed:`, err)
      // 首次加载失败时，返回离线状态数据
      const offlineData: DashboardData = {
        stats: null,
        tradingTrend: [],
        symbolDistribution: [],
        recentTrades: [],
        systemStatus: { middleware: false, mt5: false },
        quotaData: quotaData.value,
      }
      // 缓存离线状态，避免重复请求
      serverCache.value[cacheKey] = {
        stats: null,
        tradingTrend: [],
        symbolDistribution: [],
        recentTrades: [],
        systemStatus: { middleware: false, mt5: false },
        timestamp: Date.now(),
        tradingStatsLoaded: false,
      }
      return offlineData
    } finally {
      loading.value = false
    }
  }

  /**
   * 清除指定服务器的缓存
   */
  const clearServerCache = (serverId?: string) => {
    const key = getCacheKey(serverId)
    delete serverCache.value[key]
    // 同时清除 API 层的缓存
    clearDashboardCache(serverId)
  }

  /**
   * 清除所有缓存
   */
  const clearCache = () => {
    serverCache.value = {}
    quotaData.value = null
    quotaTimestamp.value = 0
    // 清除 API 层的全部缓存
    clearDashboardCache()
  }

  /**
   * 设置当前选中的服务器
   */
  const setCurrentServer = (serverId: string) => {
    currentServerId.value = serverId
  }

  /**
   * 获取当前服务器的缓存数据
   */
  const getCurrentServerCache = () => {
    const key = getCacheKey(currentServerId.value)
    return serverCache.value[key] || null
  }

  return {
    // 状态
    loading,
    refreshing,
    tradingStatsLoading,
    serverCache,
    quotaData,
    currentServerId,

    // 方法
    loadDashboardData,
    loadQuotaData,
    clearCache,
    clearServerCache,
    isCacheValid,
    hasCachedData,
    getCachedData,
    setCurrentServer,
    getCurrentServerCache,
  }
})
