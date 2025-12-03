<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('reports.userReport') }}</h1>
      <n-space>
        <n-date-picker
          v-model:value="dateRange"
          type="daterange"
          :placeholder="[t('reports.startDate'), t('reports.endDate')] as any"
          @update:value="loadReport"
        />
        <n-button @click="handleExport">
          <template #icon>
            <span class="i-carbon-download"></span>
          </template>
          {{ t('reports.export') }}
        </n-button>
      </n-space>
    </div>

    <n-spin :show="loading">
      <!-- Summary Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background-color: var(--primary-color);">
            <span class="i-carbon-user-multiple text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.totalUsers') }}</div>
            <div class="stat-value">{{ formatNumber(report.totalUsers) }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background-color: var(--success-color);">
            <span class="i-carbon-user-activity text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.activeUsers') }}</div>
            <div class="stat-value">{{ formatNumber(report.activeUsers) }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background-color: var(--info-color);">
            <span class="i-carbon-user-follow text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.newUsers') }}</div>
            <div class="stat-value">{{ formatNumber(report.newUsers) }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background-color: var(--warning-color);">
            <span class="i-carbon-percentage text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.activeRate') }}</div>
            <div class="stat-value">{{ report.activeRate.toFixed(1) }}%</div>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="charts-row">
        <n-card :title="t('reports.userGrowth')">
          <div class="chart-container">
            <line-chart v-if="userGrowthData.length" :data="userGrowthData" color="#2080f0" />
            <n-empty v-else :description="t('common.noData')" />
          </div>
        </n-card>

        <n-card :title="t('reports.userDistribution')">
          <div class="chart-container">
            <pie-chart v-if="userDistribution.length" :data="userDistribution" />
            <n-empty v-else :description="t('common.noData')" />
          </div>
        </n-card>
      </div>

      <!-- Top Traders -->
      <n-card :title="t('reports.topTraders')" class="traders-card">
        <n-tabs v-model:value="topTab" type="line">
          <n-tab-pane name="profit" :tab="t('reports.byProfit')">
            <n-data-table
              :columns="traderColumns"
              :data="topByProfit"
              :pagination="false"
              size="small"
            />
          </n-tab-pane>
          <n-tab-pane name="volume" :tab="t('reports.byVolume')">
            <n-data-table
              :columns="traderColumns"
              :data="topByVolume"
              :pagination="false"
              size="small"
            />
          </n-tab-pane>
          <n-tab-pane name="trades" :tab="t('reports.byTrades')">
            <n-data-table
              :columns="traderColumns"
              :data="topByTrades"
              :pagination="false"
              size="small"
            />
          </n-tab-pane>
        </n-tabs>
      </n-card>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, h } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NSpace,
  NDatePicker,
  NSpin,
  NTabs,
  NTabPane,
  NDataTable,
  NEmpty,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { reportsApi } from '@/api/reports'
import LineChart from '@/components/charts/LineChart.vue'
import PieChart from '@/components/charts/PieChart.vue'

interface TopTrader {
  rank: number
  login: number
  name: string
  trades: number
  volume: number
  profit: number
  winRate: number
}

const { t } = useI18n()
const message = useMessage()

const loading = ref(false)
const dateRange = ref<[number, number] | null>(null)
const topTab = ref('profit')

const report = reactive({
  totalUsers: 0,
  activeUsers: 0,
  newUsers: 0,
  activeRate: 0,
})

const userGrowthData = ref<{ date: string; value: number }[]>([])
const userDistribution = ref<{ name: string; value: number }[]>([])
const topByProfit = ref<TopTrader[]>([])
const topByVolume = ref<TopTrader[]>([])
const topByTrades = ref<TopTrader[]>([])

const traderColumns: DataTableColumns<TopTrader> = [
  {
    title: '#',
    key: 'rank',
    width: 60,
    render: (_, index) => index + 1,
  },
  { title: t('reports.login'), key: 'login', width: 100 },
  { title: t('reports.name'), key: 'name', width: 120, ellipsis: { tooltip: true } },
  { title: t('reports.trades'), key: 'trades', width: 80 },
  {
    title: t('reports.volume'),
    key: 'volume',
    width: 100,
    render: (row) => row.volume.toFixed(2),
  },
  {
    title: t('reports.profit'),
    key: 'profit',
    width: 120,
    render: (row) =>
      h(
        'span',
        { style: { color: row.profit >= 0 ? 'var(--profit-color)' : 'var(--loss-color)', fontWeight: '600' } },
        formatCurrency(row.profit, true)
      ),
  },
  {
    title: t('reports.winRate'),
    key: 'winRate',
    width: 100,
    render: (row) => `${row.winRate.toFixed(1)}%`,
  },
]

const formatNumber = (value: number) => {
  return new Intl.NumberFormat().format(value)
}

const formatCurrency = (value: number, showSign = false) => {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Math.abs(value))
  if (showSign) {
    return (value >= 0 ? '+' : '-') + formatted
  }
  return value >= 0 ? formatted : '-' + formatted
}

const loadReport = async () => {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value) {
      params.startDate = new Date(dateRange.value[0]).toISOString()
      params.endDate = new Date(dateRange.value[1]).toISOString()
    }

    const data = await reportsApi.getUserReport(params)
    Object.assign(report, data.summary)
    userGrowthData.value = data.growth || []
    userDistribution.value = data.distribution || []
    topByProfit.value = data.topByProfit || []
    topByVolume.value = data.topByVolume || []
    topByTrades.value = data.topByTrades || []
  } catch (error) {
    console.error('Failed to load report:', error)
  } finally {
    loading.value = false
  }
}

const handleExport = async () => {
  try {
    message.info(t('reports.exporting'))
    const params: any = {}
    if (dateRange.value) {
      params.startDate = new Date(dateRange.value[0]).toISOString()
      params.endDate = new Date(dateRange.value[1]).toISOString()
    }
    await reportsApi.exportUserReport(params)
    message.success(t('reports.exportSuccess'))
  } catch (error) {
    message.error(t('reports.exportError'))
  }
}

onMounted(() => {
  // Default to last 30 days
  const now = Date.now()
  dateRange.value = [now - 30 * 24 * 60 * 60 * 1000, now]
  loadReport()
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
}

.stat-content {
  flex: 1;
}

.stat-label {
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
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}

.chart-container {
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.traders-card {
  margin-top: 16px;
}

@media (max-width: 1024px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
}
</style>
