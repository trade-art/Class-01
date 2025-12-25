import { defineStore } from 'pinia'
import { ref } from 'vue'
import { reportsApi, type ReportParams } from '@/api/reports'

/** 缓存有效时间（毫秒） - 60秒 */
const CACHE_TTL = 60 * 1000

interface CacheEntry<T> {
  data: T
  timestamp: number
  params: string // JSON 序列化的参数，用于判断是否相同请求
}

/**
 * 标准化日期参数用于缓存比较
 * 将 ISO 字符串截断到分钟级别，避免毫秒差异导致缓存失效
 */
const normalizeParams = (params: ReportParams): string => {
  const normalized = { ...params }
  if (normalized.startDate) {
    // 截断到分钟级别 (YYYY-MM-DDTHH:mm)
    normalized.startDate = normalized.startDate.substring(0, 16)
  }
  if (normalized.endDate) {
    normalized.endDate = normalized.endDate.substring(0, 16)
  }
  return JSON.stringify(normalized)
}

/**
 * 报表数据缓存 Store
 * 使用内存缓存减少重复请求，提升页面切换体验
 */
export const useReportsStore = defineStore('reports', () => {
  // 缓存数据
  const tradingReportCache = ref<CacheEntry<any> | null>(null)
  const usersReportCache = ref<CacheEntry<any> | null>(null)
  const financeReportCache = ref<CacheEntry<any> | null>(null)

  // Loading 状态
  const tradingLoading = ref(false)
  const usersLoading = ref(false)
  const financeLoading = ref(false)

  /**
   * 检查缓存是否有效
   */
  const isCacheValid = (cache: CacheEntry<any> | null, params: ReportParams): boolean => {
    if (!cache) return false
    const now = Date.now()
    const paramsStr = normalizeParams(params)
    // 缓存有效：未过期 且 参数相同
    return now - cache.timestamp < CACHE_TTL && cache.params === paramsStr
  }

  /**
   * 获取交易报表（带缓存）
   * @param params 报表参数
   * @param forceRefresh 强制刷新（后台静默刷新时不显示 loading）
   */
  const getTradingReport = async (params: ReportParams, forceRefresh = false) => {
    const paramsStr = normalizeParams(params)

    // 检查缓存
    if (!forceRefresh && isCacheValid(tradingReportCache.value, params)) {
      console.debug('[Reports Cache] Trading report cache hit')
      return tradingReportCache.value!.data
    }

    console.debug('[Reports Cache] Trading report cache miss, fetching...')
    // 只在非强制刷新时显示 loading（后台刷新不显示 loading）
    if (!forceRefresh) {
      tradingLoading.value = true
    }
    try {
      const data = await reportsApi.getTradingReport(params)
      tradingReportCache.value = {
        data,
        timestamp: Date.now(),
        params: paramsStr,
      }
      return data
    } finally {
      if (!forceRefresh) {
        tradingLoading.value = false
      }
    }
  }

  /**
   * 获取用户报表（带缓存）
   * @param params 报表参数
   * @param forceRefresh 强制刷新（后台静默刷新时不显示 loading）
   */
  const getUsersReport = async (params: ReportParams, forceRefresh = false) => {
    const paramsStr = normalizeParams(params)

    // 检查缓存
    if (!forceRefresh && isCacheValid(usersReportCache.value, params)) {
      console.debug('[Reports Cache] Users report cache hit')
      return usersReportCache.value!.data
    }

    console.debug('[Reports Cache] Users report cache miss, fetching...')
    // 只在非强制刷新时显示 loading（后台刷新不显示 loading）
    if (!forceRefresh) {
      usersLoading.value = true
    }
    try {
      const data = await reportsApi.getUserReport(params)
      usersReportCache.value = {
        data,
        timestamp: Date.now(),
        params: paramsStr,
      }
      return data
    } finally {
      if (!forceRefresh) {
        usersLoading.value = false
      }
    }
  }

  /**
   * 获取财务报表（带缓存）
   * @param params 报表参数
   * @param forceRefresh 强制刷新（后台静默刷新时不显示 loading）
   */
  const getFinanceReport = async (params: ReportParams, forceRefresh = false) => {
    const paramsStr = normalizeParams(params)

    // 检查缓存
    if (!forceRefresh && isCacheValid(financeReportCache.value, params)) {
      console.debug('[Reports Cache] Finance report cache hit')
      return financeReportCache.value!.data
    }

    console.debug('[Reports Cache] Finance report cache miss, fetching...')
    // 只在非强制刷新时显示 loading（后台刷新不显示 loading）
    if (!forceRefresh) {
      financeLoading.value = true
    }
    try {
      const data = await reportsApi.getFinanceReport(params)
      financeReportCache.value = {
        data,
        timestamp: Date.now(),
        params: paramsStr,
      }
      return data
    } finally {
      if (!forceRefresh) {
        financeLoading.value = false
      }
    }
  }

  /**
   * 检查是否有缓存数据（不检查是否过期）
   */
  const hasCachedData = (type: 'trading' | 'users' | 'finance', params: ReportParams): boolean => {
    const paramsStr = normalizeParams(params)
    switch (type) {
      case 'trading':
        return tradingReportCache.value?.params === paramsStr
      case 'users':
        return usersReportCache.value?.params === paramsStr
      case 'finance':
        return financeReportCache.value?.params === paramsStr
      default:
        return false
    }
  }

  /**
   * 直接获取缓存数据（不触发 API 请求）
   * 用于页面初始化时立即显示缓存数据
   */
  const getCachedData = (type: 'trading' | 'users' | 'finance', params: ReportParams): any | null => {
    const paramsStr = normalizeParams(params)
    switch (type) {
      case 'trading':
        return tradingReportCache.value?.params === paramsStr ? tradingReportCache.value.data : null
      case 'users':
        return usersReportCache.value?.params === paramsStr ? usersReportCache.value.data : null
      case 'finance':
        return financeReportCache.value?.params === paramsStr ? financeReportCache.value.data : null
      default:
        return null
    }
  }

  /**
   * 清除所有缓存
   */
  const clearCache = () => {
    tradingReportCache.value = null
    usersReportCache.value = null
    financeReportCache.value = null
  }

  /**
   * 清除指定类型的缓存
   */
  const clearCacheByType = (type: 'trading' | 'users' | 'finance') => {
    switch (type) {
      case 'trading':
        tradingReportCache.value = null
        break
      case 'users':
        usersReportCache.value = null
        break
      case 'finance':
        financeReportCache.value = null
        break
    }
  }

  return {
    // Loading 状态
    tradingLoading,
    usersLoading,
    financeLoading,

    // 缓存操作
    getTradingReport,
    getUsersReport,
    getFinanceReport,
    hasCachedData,
    getCachedData,
    clearCache,
    clearCacheByType,
  }
})
