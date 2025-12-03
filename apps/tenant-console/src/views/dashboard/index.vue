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
            <span class="i-carbon-refresh"></span>
          </template>
        </n-button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
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
          <div class="stat-value">{{ formatNumber(stats?.totalVolume || 0, 2) }}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" :style="{ backgroundColor: (stats?.totalProfit || 0) >= 0 ? 'var(--profit-color)' : 'var(--loss-color)' }">
          <span class="i-carbon-trending-up text-xl text-white"></span>
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
          <div class="stat-value">{{ formatNumber(stats?.todayTrades || 0) }}</div>
        </div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="charts-row">
      <n-card :title="t('dashboard.tradingTrend')" class="chart-card">
        <div class="chart-container">
          <line-chart v-if="tradingTrend.length" :data="tradingTrend" />
          <n-empty v-else :description="t('common.noData')" />
        </div>
      </n-card>

      <n-card :title="t('dashboard.symbolDistribution')" class="chart-card">
        <div class="chart-container">
          <pie-chart v-if="symbolDistribution.length" :data="symbolDistribution" />
          <n-empty v-else :description="t('common.noData')" />
        </div>
      </n-card>
    </div>

    <!-- Bottom Row -->
    <div class="bottom-row">
      <!-- Recent Trades -->
      <n-card :title="t('dashboard.recentTrades')" class="recent-trades-card">
        <n-data-table
          :columns="tradeColumns"
          :data="recentTrades"
          :loading="loading"
          size="small"
          :bordered="false"
        />
      </n-card>

      <!-- System Status -->
      <n-card :title="t('dashboard.systemStatus')" class="system-status-card">
        <div class="status-items">
          <div class="status-item">
            <span class="status-label">{{ t('dashboard.middlewareStatus') }}</span>
            <n-tag :type="systemStatus?.middleware ? 'success' : 'error'" size="small">
              {{ systemStatus?.middleware ? 'Online' : 'Offline' }}
            </n-tag>
          </div>
          <div class="status-item">
            <span class="status-label">{{ t('dashboard.mt5Connection') }}</span>
            <n-tag :type="systemStatus?.mt5 ? 'success' : 'error'" size="small">
              {{ systemStatus?.mt5 ? 'Connected' : 'Disconnected' }}
            </n-tag>
          </div>
        </div>
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, h } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NSwitch,
  NDataTable,
  NTag,
  NEmpty,
  type DataTableColumns,
} from 'naive-ui'
import { tradingApi } from '@/api/trading'
import type { DashboardStats, TradeHistory } from '@/types'
import LineChart from '@/components/charts/LineChart.vue'
import PieChart from '@/components/charts/PieChart.vue'

const { t } = useI18n()

const loading = ref(false)
const autoRefresh = ref(true)
const stats = ref<DashboardStats | null>(null)
const tradingTrend = ref<any[]>([])
const symbolDistribution = ref<any[]>([])
const recentTrades = ref<TradeHistory[]>([])
const systemStatus = ref<{ middleware: boolean; mt5: boolean } | null>(null)

let refreshInterval: ReturnType<typeof setInterval> | null = null

const tradeColumns: DataTableColumns<TradeHistory> = [
  {
    title: t('history.ticket'),
    key: 'ticket',
    width: 100,
  },
  {
    title: t('history.symbol'),
    key: 'symbol',
    width: 100,
  },
  {
    title: t('history.type'),
    key: 'type',
    width: 80,
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
    width: 80,
    render: (row) => row.volume.toFixed(2),
  },
  {
    title: t('history.profit'),
    key: 'profit',
    width: 100,
    render: (row) => {
      const value = row.profit
      const color = value >= 0 ? 'var(--profit-color)' : 'var(--loss-color)'
      return h('span', { style: { color } }, formatCurrency(value))
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

const loadData = async () => {
  loading.value = true
  try {
    const [statsData, trendData, distributionData, tradesData, statusData] = await Promise.all([
      tradingApi.getDashboardStats(),
      tradingApi.getTradingTrend(7),
      tradingApi.getSymbolDistribution(),
      tradingApi.getRecentTrades(10),
      tradingApi.getSystemStatus(),
    ])

    stats.value = statsData
    tradingTrend.value = trendData
    symbolDistribution.value = distributionData
    recentTrades.value = tradesData
    systemStatus.value = statusData
  } catch (error) {
    console.error('Failed to load dashboard data:', error)
  } finally {
    loading.value = false
  }
}

const refreshData = () => {
  loadData()
}

const startAutoRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
  refreshInterval = setInterval(() => {
    if (autoRefresh.value) {
      loadData()
    }
  }, 30000) // Refresh every 30 seconds
}

onMounted(() => {
  loadData()
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
</style>
