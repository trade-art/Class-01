<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('dashboard.title') }}</h1>
      <div class="flex items-center gap-4">
        <n-switch v-model:value="autoRefresh" size="small">
          <template #checked>{{ t('dashboard.autoRefresh') }}</template>
          <template #unchecked>{{ t('dashboard.autoRefresh') }}</template>
        </n-switch>
        <n-button quaternary circle @click="refreshData">
          <template #icon>
            <span class="i-carbon-renew"></span>
          </template>
        </n-button>
      </div>
    </div>

    <!-- Resource Quota (放在标签页之上) -->
    <n-card :title="t('dashboard.resourceQuota')" class="quota-card-top">
      <div v-if="quotaData" class="quota-grid">
        <div class="quota-item">
          <div class="quota-header">
            <span class="i-carbon-user-admin quota-icon" style="color: var(--warning-color);"></span>
            <span class="quota-label">{{ t('settings.adminsQuota') }}</span>
          </div>
          <n-progress
            type="line"
            :percentage="quotaData.admins.percentage"
            :status="getQuotaStatus(quotaData.admins.percentage)"
            :height="10"
            :indicator-placement="'inside'"
          />
          <div class="quota-numbers">{{ quotaData.admins.used }} / {{ quotaData.admins.max === -1 ? t('subscription.unlimited') : quotaData.admins.max }}</div>
        </div>

        <div class="quota-item">
          <div class="quota-header">
            <span class="i-carbon-server quota-icon" style="color: var(--primary-color);"></span>
            <span class="quota-label">{{ t('settings.mtServersQuota') }}</span>
          </div>
          <n-progress
            type="line"
            :percentage="quotaData.mtServers.percentage"
            :status="getQuotaStatus(quotaData.mtServers.percentage)"
            :height="10"
            :indicator-placement="'inside'"
          />
          <div class="quota-numbers">{{ quotaData.mtServers.used }} / {{ quotaData.mtServers.max === -1 ? t('subscription.unlimited') : quotaData.mtServers.max }}</div>
        </div>

        <div class="quota-item">
          <div class="quota-header">
            <span class="i-carbon-user-multiple quota-icon" style="color: var(--info-color);"></span>
            <span class="quota-label">{{ t('settings.managerAccountsQuota') }}</span>
          </div>
          <n-progress
            type="line"
            :percentage="quotaData.managerAccounts.percentage"
            :status="getQuotaStatus(quotaData.managerAccounts.percentage)"
            :height="10"
            :indicator-placement="'inside'"
          />
          <div class="quota-numbers">{{ quotaData.managerAccounts.used }} / {{ quotaData.managerAccounts.max === -1 ? t('subscription.unlimited') : quotaData.managerAccounts.max }}</div>
        </div>

        <div class="quota-item">
          <div class="quota-header">
            <span class="i-carbon-cube quota-icon" style="color: #722ed1;"></span>
            <span class="quota-label">{{ t('settings.instancesQuota') }}</span>
          </div>
          <n-progress
            type="line"
            :percentage="quotaData.instances.percentage"
            :status="getQuotaStatus(quotaData.instances.percentage)"
            :height="10"
            :indicator-placement="'inside'"
          />
          <div class="quota-numbers">{{ quotaData.instances.used }} / {{ quotaData.instances.max === -1 ? t('subscription.unlimited') : quotaData.instances.max }}</div>
        </div>
      </div>
      <!-- 加载中显示骨架屏，加载完成但无数据显示空状态 -->
      <n-skeleton v-else-if="!quotaLoaded" text :repeat="4" />
      <n-empty v-else :description="t('common.loadFailed')" size="small" />
      <template #footer>
        <router-link to="/settings/subscription" class="view-more-link">
          {{ t('dashboard.viewQuotaDetails') }} <span class="i-carbon-arrow-right"></span>
        </router-link>
      </template>
    </n-card>

    <!-- MT Server Tabs -->
    <n-card class="server-tabs-card" v-if="mtServers.length > 0">
      <n-tabs
        v-model:value="selectedServerId"
        type="card"
        size="small"
        @update:value="handleServerChange"
      >
        <n-tab-pane
          v-for="(server, index) in mtServers"
          :key="server.serverId"
          :name="server.serverId"
        >
          <template #tab>
            <div class="server-tab">
              <span class="i-carbon-server server-tab-icon" :class="getServerIconClass(server)"></span>
              <span>{{ server.defaultManagerLogin || t('dashboard.noManager') }}: {{ server.displayName || server.serverId }}</span>
              <n-tag
                v-if="server.serverId === selectedServerId && getConnectionStatus(server)"
                :type="getConnectionStatus(server)?.type"
                size="small"
                round
                class="ml-2"
              >
                {{ getConnectionStatus(server)?.label }}
              </n-tag>
            </div>
          </template>
        </n-tab-pane>
      </n-tabs>
    </n-card>

    <!-- No Server Warning -->
    <n-alert v-if="mtServers.length === 0 && !serversLoading" type="warning" :title="t('dashboard.noServerTitle')" class="mb-4">
      {{ t('dashboard.noServerDescription') }}
      <template #icon>
        <span class="i-carbon-warning"></span>
      </template>
    </n-alert>

    <!-- Offline Alert -->
    <n-alert v-if="isOffline" type="warning" :title="t('dashboard.offlineTitle')" class="mb-4">
      {{ t('dashboard.offlineDescription') }}
      <template #icon>
        <span class="i-carbon-cloud-offline"></span>
      </template>
    </n-alert>

    <!-- Stats Cards (only show when online) -->
    <div v-if="!isOffline" class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background-color: var(--info-color);">
          <span class="i-carbon-user-multiple text-xl text-white"></span>
        </div>
        <div class="stat-content">
          <div class="stat-title">{{ t('dashboard.totalUsers') }}</div>
          <div class="stat-value">{{ formatNumber(stats?.totalUsers || 0) }}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background-color: var(--success-color);">
          <span class="i-carbon-activity text-xl text-white"></span>
        </div>
        <div class="stat-content">
          <div class="stat-title">{{ t('dashboard.activeUsers') }}</div>
          <div class="stat-value">{{ formatNumber(stats?.activeUsers || 0) }}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background-color: var(--warning-color);">
          <span class="i-carbon-currency-dollar text-xl text-white"></span>
        </div>
        <div class="stat-content">
          <div class="stat-title">{{ t('dashboard.totalVolume') }}</div>
          <div class="stat-value">
            <n-spin v-if="tradingStatsLoading && !stats?.totalVolume" :size="16" />
            <span v-else>{{ formatNumber(stats?.totalVolume || 0, 2) }}</span>
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" :style="{ backgroundColor: (stats?.totalProfit || 0) >= 0 ? 'var(--profit-color)' : 'var(--loss-color)' }">
          <span class="i-carbon-growth text-xl text-white"></span>
        </div>
        <div class="stat-content">
          <div class="stat-title">{{ t('dashboard.totalProfit') }}</div>
          <div class="stat-value" :class="(stats?.totalProfit || 0) >= 0 ? 'profit' : 'loss'">
            {{ formatCurrency(stats?.totalProfit || 0) }}
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background-color: var(--primary-color);">
          <span class="i-carbon-chart-line text-xl text-white"></span>
        </div>
        <div class="stat-content">
          <div class="stat-title">{{ t('dashboard.openPositions') }}</div>
          <div class="stat-value">{{ formatNumber(stats?.openPositions || 0) }}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background-color: #8b5cf6;">
          <span class="i-carbon-document text-xl text-white"></span>
        </div>
        <div class="stat-content">
          <div class="stat-title">{{ t('dashboard.todayTrades') }}</div>
          <div class="stat-value">
            <n-spin v-if="tradingStatsLoading && !stats?.todayTrades" :size="16" />
            <span v-else>{{ formatNumber(stats?.todayTrades || 0) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts Row (only show when online) -->
    <div v-if="!isOffline" class="charts-row">
      <n-card :title="t('dashboard.tradingTrend')" class="chart-card">
        <div class="chart-container">
          <n-spin v-if="tradingStatsLoading && !tradingTrend.length" :size="24" />
          <line-chart v-else-if="tradingTrend.length" :data="tradingTrend" />
          <n-empty v-else :description="t('common.noData')" />
        </div>
      </n-card>

      <n-card :title="t('dashboard.symbolDistribution')" class="chart-card">
        <div class="chart-container">
          <n-spin v-if="tradingStatsLoading && !symbolDistribution.length" :size="24" />
          <pie-chart v-else-if="symbolDistribution.length" :data="symbolDistribution" />
          <n-empty v-else :description="t('common.noData')" />
        </div>
      </n-card>
    </div>

    <!-- Bottom Row -->
    <div class="bottom-row">
      <!-- Recent Trades (only show when online) -->
      <n-card v-if="!isOffline" :title="t('dashboard.recentTrades')" class="recent-trades-card">
        <n-data-table
          :columns="tradeColumns"
          :data="recentTrades"
          :loading="loading || tradingStatsLoading"
          size="small"
          :bordered="false"
        />
      </n-card>

      <!-- System Status -->
      <n-card :title="t('dashboard.systemStatus')" :class="isOffline ? 'system-status-card-full' : 'system-status-card'">
        <div class="status-items">
          <div class="status-item">
            <span class="status-label">{{ t('dashboard.middlewareStatus') }}</span>
            <n-tag :type="systemStatus?.middleware ? 'success' : 'error'" size="small">
              {{ systemStatus?.middleware ? t('dashboard.statusOnline') : t('dashboard.statusOffline') }}
            </n-tag>
          </div>
          <div class="status-item">
            <span class="status-label">{{ t('dashboard.mt5Connection') }}</span>
            <n-tag :type="getMt5StatusType()" size="small">
              {{ getMt5StatusLabel() }}
            </n-tag>
          </div>
        </div>
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, h, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NSwitch,
  NDataTable,
  NTag,
  NEmpty,
  NSkeleton,
  NProgress,
  NTabs,
  NTabPane,
  NAlert,
  NSpin,
  type DataTableColumns,
} from 'naive-ui'
import { useDashboardStore } from '@/stores/dashboard'
import { mtServersApi } from '@/api/mt-servers'
import type { DashboardStats, TradeHistory, MtServer } from '@/types'
import type { SubscriptionStatus } from '@/api/settings'
import LineChart from '@/components/charts/LineChart.vue'
import PieChart from '@/components/charts/PieChart.vue'

const { t } = useI18n()
const dashboardStore = useDashboardStore()

// 使用 Store 的 loading 状态
const loading = computed(() => dashboardStore.loading)
// 交易统计数据加载状态（异步加载）
const tradingStatsLoading = computed(() => dashboardStore.tradingStatsLoading)
const autoRefresh = ref(true)

// 判断是否离线（中间件不可用）
const isOffline = computed(() => {
  // 如果 systemStatus 还未加载，不显示离线状态
  if (systemStatus.value === null) return false
  // 中间件离线则认为是离线状态
  return !systemStatus.value.middleware
})
const stats = ref<DashboardStats | null>(null)
const tradingTrend = ref<any[]>([])
const symbolDistribution = ref<any[]>([])
const recentTrades = ref<TradeHistory[]>([])
const systemStatus = ref<{ middleware: boolean; mt5: boolean } | null>(null)
const quotaData = ref<SubscriptionStatus | null>(null)
const quotaLoaded = ref(false) // 标记配额数据是否已加载完成（无论成功或失败）

// MT 服务器列表和选中状态
const mtServers = ref<MtServer[]>([])
const selectedServerId = ref<string>('')
const serversLoading = ref(false)

let refreshInterval: ReturnType<typeof setInterval> | null = null

const getQuotaStatus = (percentage: number): 'success' | 'warning' | 'error' => {
  if (percentage >= 90) return 'error'
  if (percentage >= 70) return 'warning'
  return 'success'
}

// MT5连接状态类型：中间件离线时MT5也显示离线
const getMt5StatusType = (): 'success' | 'warning' | 'error' => {
  if (!systemStatus.value?.middleware) return 'error' // 中间件离线，MT5也离线
  if (!systemStatus.value?.mt5) return 'warning' // 中间件在线但MT5未连接
  return 'success' // 全部正常
}

// MT5连接状态标签
const getMt5StatusLabel = (): string => {
  if (!systemStatus.value?.middleware) return t('dashboard.statusDisconnected') // 中间件离线时MT5也未连接
  if (!systemStatus.value?.mt5) return t('dashboard.statusDisconnected') // 未连接
  return t('dashboard.statusConnected') // 已连接
}

const tradeColumns: DataTableColumns<TradeHistory> = [
  {
    title: t('history.login'),
    key: 'login',
    width: 90,
  },
  {
    title: t('history.ticket'),
    key: 'ticket',
    width: 100,
  },
  {
    title: t('history.symbol'),
    key: 'symbol',
    width: 80,
  },
  {
    title: t('history.type'),
    key: 'type',
    width: 70,
    render: (row) => {
      const typeMap: Record<string, { label: string; type: 'info' | 'error' }> = {
        buy: { label: t('history.buy'), type: 'info' },
        sell: { label: t('history.sell'), type: 'error' },
      }
      const config = typeMap[row.type] || { label: row.type, type: 'info' as const }
      return h(NTag, { size: 'small', type: config.type }, () => config.label)
    },
  },
  {
    title: t('history.volume'),
    key: 'volume',
    width: 70,
    render: (row) => row.volume.toFixed(2),
  },
  {
    title: t('history.profit'),
    key: 'profit',
    width: 90,
    render: (row) => {
      const value = row.profit
      const color = value >= 0 ? 'var(--profit-color)' : 'var(--loss-color)'
      return h('span', { style: { color } }, formatCurrency(value))
    },
  },
  {
    title: t('history.commission'),
    key: 'commission',
    width: 80,
    render: (row) => (row.commission || 0).toFixed(2),
  },
  {
    title: t('history.swap'),
    key: 'swap',
    width: 80,
    render: (row) => (row.swap || 0).toFixed(2),
  },
  {
    title: t('history.time'),
    key: 'closeTime',
    width: 140,
    render: (row) => {
      if (!row.closeTime) return '-'
      const date = new Date(row.closeTime)
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    },
  },
]

const formatNumber = (value: number, decimals: number = 0) => {
  return new Intl.NumberFormat().format(Number(value.toFixed(decimals)))
}

const formatCurrency = (value: number) => {
  const sign = value >= 0 ? '+' : ''
  return sign + new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

/**
 * 获取服务器标签显示文本
 */
const getServerTabLabel = (server: MtServer) => {
  return server.displayName || server.serverId
}

/**
 * 获取服务器图标的样式类
 */
const getServerIconClass = (server: MtServer) => {
  if (server.serverId !== selectedServerId.value) {
    return server.isActive ? 'text-success' : 'text-gray'
  }
  // 选中的服务器根据连接状态显示颜色
  if (!systemStatus.value?.middleware) {
    return 'text-gray' // 中间件离线
  }
  if (!systemStatus.value?.mt5) {
    return 'text-warning' // MT5 未连接
  }
  return 'text-success' // 全部在线
}

/**
 * 获取服务器连接状态
 */
const getConnectionStatus = (server: MtServer) => {
  if (server.serverId !== selectedServerId.value) {
    return null // 非选中服务器不显示状态
  }
  if (!systemStatus.value) {
    return null // 状态未加载
  }
  if (!systemStatus.value.middleware) {
    return { type: 'error' as const, label: t('dashboard.statusOffline') } // 离线
  }
  if (!systemStatus.value.mt5) {
    return { type: 'warning' as const, label: t('dashboard.statusDisconnected') } // 未连接
  }
  return { type: 'success' as const, label: t('dashboard.statusConnected') } // 已连接
}

/**
 * 加载 MT 服务器列表
 */
const loadServers = async () => {
  serversLoading.value = true
  try {
    const response = await mtServersApi.getServers()
    mtServers.value = response.servers || []

    // 如果没有选中的服务器，默认选中第一个默认服务器或第一个服务器
    if (!selectedServerId.value && mtServers.value.length > 0) {
      const defaultServer = mtServers.value.find(s => s.isDefault)
      selectedServerId.value = defaultServer?.serverId || mtServers.value[0].serverId
    }
  } catch (error) {
    console.error('Failed to load MT servers:', error)
  } finally {
    serversLoading.value = false
  }
}

/**
 * 处理服务器切换
 */
const handleServerChange = async (serverId: string) => {
  selectedServerId.value = serverId
  dashboardStore.setCurrentServer(serverId)
  await loadData(true) // 切换服务器时强制刷新数据
}

const loadData = async (forceRefresh = false) => {
  try {
    // 使用带缓存的 Store 方法，传入当前选中的服务器 ID
    const serverId = selectedServerId.value || undefined
    const data = await dashboardStore.loadDashboardData(serverId, forceRefresh)

    stats.value = data.stats
    tradingTrend.value = data.tradingTrend
    symbolDistribution.value = data.symbolDistribution
    recentTrades.value = data.recentTrades
    systemStatus.value = data.systemStatus
    quotaData.value = data.quotaData
  } catch (error) {
    console.error('Failed to load dashboard data:', error)
  }
}

const refreshData = () => {
  loadData(true) // 手动刷新强制获取新数据
}

const startAutoRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
  refreshInterval = setInterval(() => {
    if (autoRefresh.value) {
      loadData(true) // 自动刷新强制获取新数据
    }
  }, 30000) // Refresh every 30 seconds (与 Platform Dashboard 一致)
}

// 监听 Store 缓存更新，当后台静默刷新完成时自动更新视图
watch(
  () => dashboardStore.serverCache,
  (newCache) => {
    const serverId = selectedServerId.value || '__default__'
    const cache = newCache[serverId]
    if (cache?.stats) {
      // 更新本地数据为最新缓存
      stats.value = cache.stats
      tradingTrend.value = cache.tradingTrend
      symbolDistribution.value = cache.symbolDistribution
      recentTrades.value = cache.recentTrades
      systemStatus.value = cache.systemStatus
      // quotaData 从 store 的 quotaData 获取
      quotaData.value = dashboardStore.quotaData
    }
  },
  { deep: true }
)

onMounted(() => {
  // 优化：UI 立即渲染，所有数据加载都是非阻塞的
  // 即使中间件不可用，页面也能正常显示

  // 1. 先尝试显示缓存数据（立即响应，无 loading）
  const cachedData = dashboardStore.getCachedData()
  if (cachedData) {
    stats.value = cachedData.stats
    tradingTrend.value = cachedData.tradingTrend
    symbolDistribution.value = cachedData.symbolDistribution
    recentTrades.value = cachedData.recentTrades
    systemStatus.value = cachedData.systemStatus
    quotaData.value = cachedData.quotaData
  }

  // 2. 非阻塞加载：服务器列表（独立于中间件）
  loadServers().then(() => {
    // 服务器列表加载完成后，加载 Dashboard 数据
    loadData(!cachedData)
  }).catch((err) => {
    console.error('Failed to load servers:', err)
    // 即使加载失败，也尝试加载 dashboard 数据（使用默认服务器）
    loadData(!cachedData)
  })

  // 3. 非阻塞加载：配额数据（独立于中间件）
  dashboardStore.loadQuotaData().then((result) => {
    if (result) {
      quotaData.value = result
    }
  }).catch((err) => {
    console.error('Failed to load quota data:', err)
  }).finally(() => {
    quotaLoaded.value = true
  })

  // 4. 启动自动刷新
  startAutoRefresh()
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background-color: var(--card-color);
  border-radius: var(--border-radius-base);
  box-shadow: var(--box-shadow-1);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-title {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color-base);
}

.charts-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}

.chart-card {
  height: 350px;
}

.chart-container {
  height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bottom-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
}

.recent-trades-card {
  min-height: 300px;
}

.system-status-card {
  min-height: 300px;
}

.system-status-card-full {
  min-height: 200px;
  grid-column: 1 / -1;
}

.status-items {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background-color: var(--body-color);
  border-radius: var(--border-radius-base);
}

.status-label {
  font-size: 14px;
  color: var(--text-color-secondary);
}

@media (max-width: 1024px) {
  .charts-row,
  .bottom-row {
    grid-template-columns: 1fr;
  }
}

.quota-card-top {
  margin-bottom: 24px;
}

.quota-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
}

.quota-item {
  padding: 16px;
  background-color: var(--body-color);
  border-radius: var(--border-radius-base);
}

.quota-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.quota-icon {
  font-size: 18px;
}

.quota-label {
  font-size: 14px;
  color: var(--text-color-secondary);
}

.quota-numbers {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-color-tertiary);
  text-align: right;
}

.view-more-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--primary-color);
  text-decoration: none;
  font-size: 14px;
  transition: opacity 0.2s;
}

.view-more-link:hover {
  opacity: 0.8;
}

/* Server Tabs Styles */
.server-tabs-card {
  margin-bottom: 24px;
}

.server-tabs-card :deep(.n-card__content) {
  padding: 12px 16px;
}

.server-tab {
  display: flex;
  align-items: center;
  gap: 6px;
}

.server-tab-icon {
  font-size: 14px;
}

.text-success {
  color: var(--success-color);
}

.text-gray {
  color: var(--text-color-disabled);
}

.text-warning {
  color: var(--warning-color);
}

.ml-2 {
  margin-left: 8px;
}

.mb-4 {
  margin-bottom: 16px;
}
</style>
