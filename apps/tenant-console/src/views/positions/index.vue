<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('positions.title') }}</h1>
      <div class="flex items-center gap-4">
        <n-switch v-model:value="autoRefresh" size="small">
          <template #checked>{{ t('positions.autoRefresh') }}</template>
          <template #unchecked>{{ t('positions.autoRefresh') }}</template>
        </n-switch>
        <n-button quaternary circle @click="loadPositions">
          <template #icon>
            <span class="i-carbon-refresh"></span>
          </template>
        </n-button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">{{ t('positions.totalPositions') }}</div>
        <div class="summary-value">{{ positions.length }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">{{ t('positions.totalVolume') }}</div>
        <div class="summary-value">{{ totalVolume.toFixed(2) }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">{{ t('positions.totalProfit') }}</div>
        <div class="summary-value" :class="totalProfit >= 0 ? 'profit' : 'loss'">
          {{ formatCurrency(totalProfit, true) }}
        </div>
      </div>
      <div class="summary-card">
        <div class="summary-label">{{ t('positions.buyPositions') }}</div>
        <div class="summary-value text-buy">{{ buyCount }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">{{ t('positions.sellPositions') }}</div>
        <div class="summary-value text-sell">{{ sellCount }}</div>
      </div>
    </div>

    <!-- Filters -->
    <n-card class="filter-card">
      <n-space :wrap="true" :size="16">
        <n-input
          v-model:value="filters.login"
          :placeholder="t('positions.filterByLogin')"
          clearable
          style="width: 160px"
        >
          <template #prefix>
            <span class="i-carbon-user"></span>
          </template>
        </n-input>

        <n-input
          v-model:value="filters.symbol"
          :placeholder="t('positions.filterBySymbol')"
          clearable
          style="width: 140px"
        />

        <n-select
          v-model:value="filters.type"
          :placeholder="t('positions.filterByType')"
          :options="typeOptions"
          clearable
          style="width: 120px"
        />

        <n-button type="primary" @click="handleFilter">
          <template #icon>
            <span class="i-carbon-filter"></span>
          </template>
          {{ t('common.filter') }}
        </n-button>

        <n-button @click="handleReset">
          <template #icon>
            <span class="i-carbon-reset"></span>
          </template>
          {{ t('common.reset') }}
        </n-button>
      </n-space>
    </n-card>

    <!-- Positions Table -->
    <n-card>
      <n-data-table
        :columns="columns"
        :data="filteredPositions"
        :loading="loading"
        :pagination="false"
        :row-key="(row: Position) => row.ticket"
        :scroll-x="1400"
        size="small"
      />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, h } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NInput,
  NSelect,
  NSpace,
  NSwitch,
  NDataTable,
  NTag,
  type DataTableColumns,
} from 'naive-ui'
import { tradingApi } from '@/api/trading'
import type { Position } from '@/types'

const { t } = useI18n()

const loading = ref(false)
const autoRefresh = ref(true)
const positions = ref<Position[]>([])
let refreshInterval: ReturnType<typeof setInterval> | null = null

const filters = reactive({
  login: '',
  symbol: '',
  type: null as string | null,
})

const typeOptions = computed(() => [
  { label: t('history.buy'), value: 'buy' },
  { label: t('history.sell'), value: 'sell' },
])

const filteredPositions = computed(() => {
  return positions.value.filter((p) => {
    if (filters.login && !String(p.login).includes(filters.login)) return false
    if (filters.symbol && !p.symbol.toLowerCase().includes(filters.symbol.toLowerCase())) return false
    if (filters.type && p.type !== filters.type) return false
    return true
  })
})

const totalVolume = computed(() => positions.value.reduce((sum, p) => sum + p.volume, 0))
const totalProfit = computed(() => positions.value.reduce((sum, p) => sum + p.profit, 0))
const buyCount = computed(() => positions.value.filter((p) => p.type === 'buy').length)
const sellCount = computed(() => positions.value.filter((p) => p.type === 'sell').length)

const columns: DataTableColumns<Position> = [
  { title: t('positions.ticket'), key: 'ticket', width: 100, sorter: 'default' as any },
  { title: t('positions.login'), key: 'login', width: 100, sorter: 'default' as any },
  { title: t('positions.symbol'), key: 'symbol', width: 100 },
  {
    title: t('positions.type'),
    key: 'type',
    width: 80,
    render: (row) =>
      h(NTag, { size: 'small', type: row.type === 'buy' ? 'info' : 'error' }, () =>
        row.type === 'buy' ? t('history.buy') : t('history.sell')
      ),
  },
  {
    title: t('positions.volume'),
    key: 'volume',
    width: 80,
    render: (row) => row.volume.toFixed(2),
  },
  {
    title: t('positions.openPrice'),
    key: 'openPrice',
    width: 100,
    render: (row) => row.openPrice.toFixed(5),
  },
  {
    title: t('positions.currentPrice'),
    key: 'currentPrice',
    width: 100,
    render: (row) => h('span', { class: 'price-flash' }, row.currentPrice.toFixed(5)),
  },
  {
    title: t('positions.sl'),
    key: 'sl',
    width: 80,
    render: (row) => (row.sl ? row.sl.toFixed(5) : '-'),
  },
  {
    title: t('positions.tp'),
    key: 'tp',
    width: 80,
    render: (row) => (row.tp ? row.tp.toFixed(5) : '-'),
  },
  {
    title: t('positions.swap'),
    key: 'swap',
    width: 80,
    render: (row) => row.swap?.toFixed(2) || '0.00',
  },
  {
    title: t('positions.profit'),
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
    title: t('positions.openTime'),
    key: 'openTime',
    width: 160,
    render: (row) => new Date(row.openTime).toLocaleString(),
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

const loadPositions = async () => {
  loading.value = true
  try {
    const result = await tradingApi.getPositions({ page: 1, pageSize: 1000 }); positions.value = result.items
  } catch (error) {
    console.error('Failed to load positions:', error)
  } finally {
    loading.value = false
  }
}

const handleFilter = () => {
  // Filtering is done reactively through computed
}

const handleReset = () => {
  filters.login = ''
  filters.symbol = ''
  filters.type = null
}

const startAutoRefresh = () => {
  if (refreshInterval) clearInterval(refreshInterval)
  refreshInterval = setInterval(() => {
    if (autoRefresh.value) {
      loadPositions()
    }
  }, 5000) // Refresh every 5 seconds
}

onMounted(() => {
  loadPositions()
  startAutoRefresh()
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
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

.text-buy {
  color: var(--buy-color);
}

.text-sell {
  color: var(--sell-color);
}

.filter-card {
  margin-bottom: 16px;
}

@media (max-width: 1024px) {
  .summary-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 640px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
