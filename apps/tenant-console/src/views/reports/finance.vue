<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('reports.financeReport') }}</h1>
      <n-space>
        <n-date-picker
          v-model:value="dateRange"
          type="daterange"
          :placeholder="[t('reports.startDate'), t('reports.endDate')] as any"
          @update:value="() => loadReport(true)"
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
          <div class="stat-icon" style="background-color: var(--success-color);">
            <span class="i-carbon-arrow-down text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.totalDeposits') }}</div>
            <div class="stat-value profit">{{ formatCurrency(report.totalDeposits) }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background-color: var(--error-color);">
            <span class="i-carbon-arrow-up text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.totalWithdrawals') }}</div>
            <div class="stat-value loss">{{ formatCurrency(report.totalWithdrawals) }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" :style="{ backgroundColor: report.netDeposits >= 0 ? 'var(--profit-color)' : 'var(--loss-color)' }">
            <span class="i-carbon-arrows-vertical text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.netDeposits') }}</div>
            <div class="stat-value" :class="report.netDeposits >= 0 ? 'profit' : 'loss'">
              {{ formatCurrency(report.netDeposits, true) }}
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background-color: var(--warning-color);">
            <span class="i-carbon-money text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.totalCommission') }}</div>
            <div class="stat-value">{{ formatCurrency(report.totalCommission) }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background-color: var(--info-color);">
            <span class="i-carbon-wallet text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.totalBalance') }}</div>
            <div class="stat-value">{{ formatCurrency(report.totalBalance) }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background-color: #8b5cf6;">
            <span class="i-carbon-chart-area text-white text-xl"></span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ t('reports.totalEquity') }}</div>
            <div class="stat-value">{{ formatCurrency(report.totalEquity) }}</div>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="charts-row">
        <n-card :title="t('reports.depositWithdrawalTrend')">
          <div class="chart-container">
            <line-chart v-if="trendData.length" :data="trendData" color="#18a058" />
            <n-empty v-else :description="t('common.noData')" />
          </div>
        </n-card>

        <n-card :title="t('reports.commissionTrend')">
          <div class="chart-container">
            <bar-chart v-if="commissionData.length" :data="commissionData" color="#f0a020" />
            <n-empty v-else :description="t('common.noData')" />
          </div>
        </n-card>
      </div>

      <!-- Transaction History -->
      <n-card :title="t('reports.recentTransactions')" class="transactions-card">
        <n-data-table
          :columns="transactionColumns"
          :data="transactions"
          :pagination="paginationConfig"
          :loading="transactionsLoading"
          size="small"
          @update:page="handlePageChange"
        />
      </n-card>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NSpace,
  NDatePicker,
  NSpin,
  NDataTable,
  NEmpty,
  NTag,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { reportsApi } from '@/api/reports'
import { useReportsStore } from '@/stores/reports'
import LineChart from '@/components/charts/LineChart.vue'
import BarChart from '@/components/charts/BarChart.vue'

interface Transaction {
  id: string
  login: number
  type: 'deposit' | 'withdrawal' | 'commission' | 'swap'
  amount: number
  time: string
  comment: string
}

const { t } = useI18n()
const message = useMessage()
const reportsStore = useReportsStore()

// 使用 Store 的 loading 状态
const loading = computed(() => reportsStore.financeLoading)
const transactionsLoading = ref(false)
const dateRange = ref<[number, number] | null>(null)

const report = reactive({
  totalDeposits: 0,
  totalWithdrawals: 0,
  netDeposits: 0,
  totalCommission: 0,
  totalBalance: 0,
  totalEquity: 0,
})

const trendData = ref<{ date: string; value: number }[]>([])
const commissionData = ref<{ name: string; value: number }[]>([])
const transactions = ref<Transaction[]>([])

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
})

const paginationConfig = computed(() => ({
  page: pagination.page,
  pageSize: pagination.pageSize,
  pageCount: Math.ceil(pagination.total / pagination.pageSize),
  itemCount: pagination.total,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
}))

const transactionColumns: DataTableColumns<Transaction> = [
  {
    title: t('reports.time'),
    key: 'time',
    width: 160,
    render: (row) => new Date(row.time).toLocaleString(),
  },
  { title: t('reports.login'), key: 'login', width: 100 },
  {
    title: t('reports.type'),
    key: 'type',
    width: 120,
    render: (row) => {
      const typeConfig: Record<string, { type: 'success' | 'error' | 'warning' | 'info'; label: string }> = {
        deposit: { type: 'success', label: t('reports.deposit') },
        withdrawal: { type: 'error', label: t('reports.withdrawal') },
        commission: { type: 'warning', label: t('reports.commission') },
        swap: { type: 'info', label: t('reports.swap') },
      }
      const config = typeConfig[row.type] || { type: 'info', label: row.type }
      return h(NTag, { size: 'small', type: config.type }, () => config.label)
    },
  },
  {
    title: t('reports.amount'),
    key: 'amount',
    width: 120,
    render: (row) =>
      h(
        'span',
        { style: { color: row.amount >= 0 ? 'var(--profit-color)' : 'var(--loss-color)', fontWeight: '600' } },
        formatCurrency(row.amount, true)
      ),
  },
  {
    title: t('reports.comment'),
    key: 'comment',
    ellipsis: { tooltip: true },
  },
]

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

const loadReport = async (forceRefresh = false) => {
  try {
    const params: any = {}
    if (dateRange.value) {
      // 截断到秒级，避免毫秒差异导致缓存失效
      params.startDate = new Date(dateRange.value[0]).toISOString().split('.')[0] + 'Z'
      params.endDate = new Date(dateRange.value[1]).toISOString().split('.')[0] + 'Z'
    }

    // 使用带缓存的 Store 方法
    const data = await reportsStore.getFinanceReport(params, forceRefresh)
    Object.assign(report, data.summary)
    trendData.value = data.trend || []
    commissionData.value = data.commissionTrend || []
  } catch (error) {
    console.error('Failed to load report:', error)
  }
}

const loadTransactions = async () => {
  transactionsLoading.value = true
  try {
    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize,
    }
    if (dateRange.value) {
      // 截断到秒级，避免毫秒差异导致缓存失效
      params.startDate = new Date(dateRange.value[0]).toISOString().split('.')[0] + 'Z'
      params.endDate = new Date(dateRange.value[1]).toISOString().split('.')[0] + 'Z'
    }

    const data = await reportsApi.getTransactions(params)
    transactions.value = data.items
    pagination.total = data.total
  } catch (error) {
    console.error('Failed to load transactions:', error)
  } finally {
    transactionsLoading.value = false
  }
}

const handlePageChange = (page: number) => {
  pagination.page = page
  loadTransactions()
}

const handleExport = async () => {
  try {
    message.info(t('reports.exporting'))
    const params: any = {}
    if (dateRange.value) {
      // 截断到秒级，保持一致性
      params.startDate = new Date(dateRange.value[0]).toISOString().split('.')[0] + 'Z'
      params.endDate = new Date(dateRange.value[1]).toISOString().split('.')[0] + 'Z'
    }
    await reportsApi.exportFinanceReport(params)
    message.success(t('reports.exportSuccess'))
  } catch (error) {
    message.error(t('reports.exportError'))
  }
}

onMounted(async () => {
  // Default to last 30 days
  const now = Date.now()
  dateRange.value = [now - 30 * 24 * 60 * 60 * 1000, now]

  // 构建参数
  const params: any = {
    startDate: new Date(dateRange.value[0]).toISOString().split('.')[0] + 'Z',
    endDate: new Date(dateRange.value[1]).toISOString().split('.')[0] + 'Z',
  }

  // 1. 先尝试显示缓存数据（立即响应，无 loading）
  const cachedData = reportsStore.getCachedData('finance', params)
  if (cachedData) {
    Object.assign(report, cachedData.summary)
    trendData.value = cachedData.trend || []
    commissionData.value = cachedData.commissionTrend || []

    // 并行：后台刷新报表 + 加载交易记录
    Promise.all([
      loadReport(true),
      loadTransactions(),
    ])
  } else {
    // 无缓存，并行加载报表和交易记录
    await Promise.all([
      loadReport(),
      loadTransactions(),
    ])
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

.transactions-card {
  margin-top: 16px;
}

@media (max-width: 1024px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
}
</style>
