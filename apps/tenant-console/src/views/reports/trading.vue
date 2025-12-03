<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('reports.tradingReport') }}</h1>
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
            <span class="i-carbon-analytics text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.totalTrades') }}</div>
            <div class="stat-value">{{ formatNumber(report.totalTrades) }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background-color: var(--info-color);">
            <span class="i-carbon-chart-line text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.totalVolume') }}</div>
            <div class="stat-value">{{ report.totalVolume.toFixed(2) }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" :style="{ backgroundColor: report.totalProfit >= 0 ? 'var(--profit-color)' : 'var(--loss-color)' }">
            <span class="i-carbon-currency-dollar text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.totalProfit') }}</div>
            <div class="stat-value" :class="report.totalProfit >= 0 ? 'profit' : 'loss'">
              {{ formatCurrency(report.totalProfit, true) }}
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background-color: var(--success-color);">
            <span class="i-carbon-trophy text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.winRate') }}</div>
            <div class="stat-value">{{ report.winRate.toFixed(1) }}%</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background-color: var(--warning-color);">
            <span class="i-carbon-purchase text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.totalCommission') }}</div>
            <div class="stat-value">{{ formatCurrency(report.totalCommission) }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background-color: #8b5cf6;">
            <span class="i-carbon-time text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.totalSwap') }}</div>
            <div class="stat-value">{{ formatCurrency(report.totalSwap) }}</div>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="charts-row">
        <n-card :title="t('reports.tradingTrend')">
          <div class="chart-container">
            <line-chart v-if="trendData.length" :data="trendData" />
            <n-empty v-else :description="t('common.noData')" />
          </div>
        </n-card>

        <n-card :title="t('reports.profitDistribution')">
          <div class="chart-container">
            <bar-chart v-if="profitDistribution.length" :data="profitDistribution" />
            <n-empty v-else :description="t('common.noData')" />
          </div>
        </n-card>
      </div>

      <!-- Symbol Analysis -->
      <n-card :title="t('reports.symbolAnalysis')" class="analysis-card">
        <n-data-table
          :columns="symbolColumns"
          :data="symbolAnalysis"
          :pagination="false"
          size="small"
        />
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
  NDataTable,
  NEmpty,
  NProgress,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { reportsApi } from '@/api/reports'
import LineChart from '@/components/charts/LineChart.vue'
import BarChart from '@/components/charts/BarChart.vue'

interface SymbolAnalysis {
  symbol: string
  trades: number
  volume: number
  profit: number
  winRate: number
}

const { t } = useI18n()
const message = useMessage()

const loading = ref(false)
const dateRange = ref<[number, number] | null>(null)

const report = reactive({
  totalTrades: 0,
  totalVolume: 0,
  totalProfit: 0,
  winRate: 0,
  totalCommission: 0,
  totalSwap: 0,
})

const trendData = ref<{ date: string; value: number }[]>([])
const profitDistribution = ref<{ name: string; value: number }[]>([])
const symbolAnalysis = ref<SymbolAnalysis[]>([])

const symbolColumns: DataTableColumns<SymbolAnalysis> = [
  { title: t('reports.symbol'), key: 'symbol', width: 120 },
  { title: t('reports.trades'), key: 'trades', width: 100, sorter: (a, b) => a.trades - b.trades },
  {
    title: t('reports.volume'),
    key: 'volume',
    width: 120,
    render: (row) => row.volume.toFixed(2),
    sorter: (a, b) => a.volume - b.volume,
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
    sorter: (a, b) => a.profit - b.profit,
  },
  {
    title: t('reports.winRate'),
    key: 'winRate',
    width: 150,
    render: (row) =>
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        [
          h(NProgress, {
            type: 'line',
            percentage: row.winRate,
            status: row.winRate >= 50 ? 'success' : 'warning',
            showIndicator: false,
            style: { width: '80px' },
          }),
          h('span', `${row.winRate.toFixed(1)}%`),
        ]
      ),
    sorter: (a, b) => a.winRate - b.winRate,
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

    const data = await reportsApi.getTradingReport(params)
    Object.assign(report, data.summary)
    trendData.value = data.trend || []
    profitDistribution.value = data.profitDistribution || []
    symbolAnalysis.value = data.symbolAnalysis || []
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
    await reportsApi.exportTradingReport(params)
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

.stat-value.profit {
  color: var(--profit-color);
}

.stat-value.loss {
  color: var(--loss-color);
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

.analysis-card {
  margin-top: 16px;
}

@media (max-width: 1024px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
}
</style>
