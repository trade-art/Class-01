<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('history.title') }}</h1>
      <n-button @click="handleExport">
        <template #icon>
          <span class="i-carbon-download"></span>
        </template>
        {{ t('history.export') }}
      </n-button>
    </div>

    <!-- Summary Stats -->
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">{{ t('history.totalTrades') }}</div>
        <div class="summary-value">{{ statistics.totalTrades }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">{{ t('history.totalVolume') }}</div>
        <div class="summary-value">{{ statistics.totalVolume.toFixed(2) }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">{{ t('history.totalProfit') }}</div>
        <div class="summary-value" :class="statistics.totalProfit >= 0 ? 'profit' : 'loss'">
          {{ formatCurrency(statistics.totalProfit, true) }}
        </div>
      </div>
      <div class="summary-card">
        <div class="summary-label">{{ t('history.winRate') }}</div>
        <div class="summary-value">{{ statistics.winRate.toFixed(1) }}%</div>
      </div>
    </div>

    <!-- Filters -->
    <n-card class="filter-card">
      <n-space :wrap="true" :size="16">
        <n-input
          v-model:value="filters.login"
          :placeholder="t('history.filterByLogin')"
          clearable
          style="width: 160px"
        >
          <template #prefix>
            <span class="i-carbon-user"></span>
          </template>
        </n-input>

        <n-input
          v-model:value="filters.symbol"
          :placeholder="t('history.filterBySymbol')"
          clearable
          style="width: 140px"
        />

        <n-select
          v-model:value="filters.type"
          :placeholder="t('history.filterByType')"
          :options="typeOptions"
          clearable
          style="width: 120px"
        />

        <n-date-picker
          v-model:value="dateRange"
          type="daterange"
          :placeholder="t('history.dateRange')"
          clearable
          style="width: 280px"
        />

        <n-button type="primary" @click="handleSearch">
          <template #icon>
            <span class="i-carbon-search"></span>
          </template>
          {{ t('common.search') }}
        </n-button>

        <n-button @click="handleReset">
          <template #icon>
            <span class="i-carbon-reset"></span>
          </template>
          {{ t('common.reset') }}
        </n-button>
      </n-space>
    </n-card>

    <!-- History Table -->
    <n-card>
      <n-data-table
        :columns="columns"
        :data="history"
        :loading="loading"
        :pagination="paginationConfig"
        :row-key="(row: TradeHistory) => row.ticket"
        :scroll-x="1400"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NInput,
  NSelect,
  NSpace,
  NDatePicker,
  NDataTable,
  NTag,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { tradingApi } from '@/api/trading'
import type { TradeHistory } from '@/types'

const { t } = useI18n()
const message = useMessage()

const loading = ref(false)
const history = ref<TradeHistory[]>([])
const dateRange = ref<[number, number] | null>(null)

const filters = reactive({
  login: '',
  symbol: '',
  type: null as string | null,
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

const statistics = reactive({
  totalTrades: 0,
  totalVolume: 0,
  totalProfit: 0,
  winRate: 0,
})

const typeOptions = computed(() => [
  { label: t('history.buy'), value: 'buy' },
  { label: t('history.sell'), value: 'sell' },
])

const paginationConfig = computed(() => ({
  page: pagination.page,
  pageSize: pagination.pageSize,
  pageCount: Math.ceil(pagination.total / pagination.pageSize),
  itemCount: pagination.total,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  showQuickJumper: true,
}))

const columns: DataTableColumns<TradeHistory> = [
  { title: t('history.ticket'), key: 'ticket', width: 100, sorter: true },
  { title: t('history.login'), key: 'login', width: 100, sorter: true },
  { title: t('history.symbol'), key: 'symbol', width: 100 },
  {
    title: t('history.type'),
    key: 'type',
    width: 80,
    render: (row) =>
      h(NTag, { size: 'small', type: row.type === 'buy' ? 'info' : 'error' }, () =>
        row.type === 'buy' ? t('history.buy') : t('history.sell')
      ),
  },
  {
    title: t('history.volume'),
    key: 'volume',
    width: 80,
    render: (row) => row.volume.toFixed(2),
  },
  {
    title: t('history.openPrice'),
    key: 'openPrice',
    width: 100,
    render: (row) => row.openPrice.toFixed(5),
  },
  {
    title: t('history.closePrice'),
    key: 'closePrice',
    width: 100,
    render: (row) => row.closePrice.toFixed(5),
  },
  {
    title: t('history.swap'),
    key: 'swap',
    width: 80,
    render: (row) => row.swap?.toFixed(2) || '0.00',
  },
  {
    title: t('history.commission'),
    key: 'commission',
    width: 80,
    render: (row) => row.commission?.toFixed(2) || '0.00',
  },
  {
    title: t('history.profit'),
    key: 'profit',
    width: 100,
    sorter: (a, b) => a.profit - b.profit,
    render: (row) =>
      h(
        'span',
        { style: { color: row.profit >= 0 ? 'var(--profit-color)' : 'var(--loss-color)', fontWeight: '600' } },
        formatCurrency(row.profit, true)
      ),
  },
  {
    title: t('history.openTime'),
    key: 'openTime',
    width: 160,
    sorter: true,
    render: (row) => new Date(row.openTime).toLocaleString(),
  },
  {
    title: t('history.closeTime'),
    key: 'closeTime',
    width: 160,
    sorter: true,
    render: (row) => new Date(row.closeTime).toLocaleString(),
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

const loadHistory = async () => {
  loading.value = true
  try {
    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize,
    }

    if (filters.login) params.login = filters.login
    if (filters.symbol) params.symbol = filters.symbol
    if (filters.type) params.type = filters.type
    if (dateRange.value) {
      params.startDate = new Date(dateRange.value[0]).toISOString()
      params.endDate = new Date(dateRange.value[1]).toISOString()
    }

    const result = await tradingApi.getHistory(params)
    history.value = result.items
    pagination.total = result.total

    // Calculate statistics
    calculateStatistics()
  } catch (error) {
    console.error('Failed to load history:', error)
  } finally {
    loading.value = false
  }
}

const calculateStatistics = () => {
  statistics.totalTrades = pagination.total
  statistics.totalVolume = history.value.reduce((sum, h) => sum + h.volume, 0)
  statistics.totalProfit = history.value.reduce((sum, h) => sum + h.profit, 0)

  const winningTrades = history.value.filter((h) => h.profit > 0).length
  statistics.winRate = history.value.length > 0 ? (winningTrades / history.value.length) * 100 : 0
}

const handleSearch = () => {
  pagination.page = 1
  loadHistory()
}

const handleReset = () => {
  filters.login = ''
  filters.symbol = ''
  filters.type = null
  dateRange.value = null
  handleSearch()
}

const handlePageChange = (page: number) => {
  pagination.page = page
  loadHistory()
}

const handlePageSizeChange = (pageSize: number) => {
  pagination.pageSize = pageSize
  pagination.page = 1
  loadHistory()
}

const handleExport = async () => {
  try {
    message.info(t('history.exporting'))
    // Export logic would go here
    message.success(t('history.exportSuccess'))
  } catch (error) {
    message.error(t('history.exportError'))
  }
}

onMounted(() => {
  loadHistory()
})
</script>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.summary-card {
  padding: 16px;
  background-color: var(--card-color);
  border-radius: var(--border-radius-base);
  box-shadow: var(--box-shadow-1);
  text-align: center;
}

.summary-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 4px;
}

.summary-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color-base);
}

.summary-value.profit {
  color: var(--profit-color);
}

.summary-value.loss {
  color: var(--loss-color);
}

.filter-card {
  margin-bottom: 16px;
}

@media (max-width: 768px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
