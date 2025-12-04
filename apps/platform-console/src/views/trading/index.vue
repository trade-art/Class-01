<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('menu.trading') }}</h1>
      <n-space>
        <n-select
          v-model:value="filters.period"
          :options="periodOptions"
          style="width: 150px"
          @update:value="loadData"
        />
      </n-space>
    </div>

    <!-- Overview Stats -->
    <n-grid :cols="4" :x-gap="16" class="mb-6">
      <n-gi>
        <n-card>
          <n-statistic :label="t('trading.stats.totalVolume')" :value="overview.totalVolume">
            <template #suffix>{{ t('trading.lots') }}</template>
          </n-statistic>
        </n-card>
      </n-gi>
      <n-gi>
        <n-card>
          <n-statistic :label="t('trading.stats.totalTrades')" :value="overview.totalTrades" />
        </n-card>
      </n-gi>
      <n-gi>
        <n-card>
          <n-statistic :label="t('trading.stats.totalProfit')" :value="formatProfit(overview.totalProfit)">
            <template #prefix>
              <n-icon :class="overview.totalProfit >= 0 ? 'text-success' : 'text-error'">
                <i :class="overview.totalProfit >= 0 ? 'i-carbon-arrow-up' : 'i-carbon-arrow-down'" />
              </n-icon>
            </template>
          </n-statistic>
        </n-card>
      </n-gi>
      <n-gi>
        <n-card>
          <n-statistic :label="t('trading.stats.activeTenants')" :value="overview.activeTenants" />
        </n-card>
      </n-gi>
    </n-grid>

    <n-grid :cols="2" :x-gap="16" class="mb-6">
      <!-- Tenant Ranking -->
      <n-gi>
        <n-card :title="t('trading.tenantRanking')">
          <n-spin :show="loadingRanking">
            <n-data-table
              :columns="rankingColumns"
              :data="tenantRanking"
              :pagination="false"
              :max-height="300"
            />
            <n-empty v-if="!loadingRanking && tenantRanking.length === 0" :description="t('common.noData')" />
          </n-spin>
        </n-card>
      </n-gi>

      <!-- Symbol Distribution -->
      <n-gi>
        <n-card :title="t('trading.symbolDistribution')">
          <n-spin :show="loadingSymbol">
            <div v-if="symbolDistribution.length > 0" class="space-y-3">
              <div v-for="item in symbolDistribution" :key="item.symbol" class="flex items-center gap-3">
                <span class="w-20 font-medium">{{ item.symbol }}</span>
                <n-progress
                  type="line"
                  :percentage="item.percentage"
                  :show-indicator="false"
                  class="flex-1"
                />
                <span class="w-16 text-right text-secondary">{{ item.percentage.toFixed(1) }}%</span>
              </div>
            </div>
            <n-empty v-else :description="t('common.noData')" />
          </n-spin>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- Tenant Detail Modal -->
    <n-modal
      v-model:show="showDetailModal"
      preset="dialog"
      :title="t('trading.tenantDetail')"
      :style="{ width: '700px' }"
    >
      <template v-if="selectedTenant">
        <n-descriptions :columns="2" bordered class="mb-4">
          <n-descriptions-item :label="t('trading.tenantName')">
            {{ selectedTenant.name }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('trading.stats.totalVolume')">
            {{ selectedTenant.totalVolume }} {{ t('trading.lots') }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('trading.stats.totalTrades')">
            {{ selectedTenant.totalTrades }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('trading.stats.totalProfit')">
            <span :class="selectedTenant.totalProfit >= 0 ? 'text-success' : 'text-error'">
              {{ formatProfit(selectedTenant.totalProfit) }}
            </span>
          </n-descriptions-item>
        </n-descriptions>

        <h4 class="mb-3 font-medium">{{ t('trading.topSymbols') }}</h4>
        <n-data-table
          :columns="symbolColumns"
          :data="selectedTenant.symbols || []"
          :pagination="false"
          :max-height="200"
        />
      </template>

      <template #action>
        <n-button @click="showDetailModal = false">{{ t('common.cancel') }}</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, h, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NIcon,
  NSpace,
  NSelect,
  NDataTable,
  NStatistic,
  NGrid,
  NGi,
  NSpin,
  NEmpty,
  NModal,
  NDescriptions,
  NDescriptionsItem,
  NProgress,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { api } from '@/api'

interface TenantRanking {
  id: string
  name: string
  code: string
  totalVolume: number
  totalTrades: number
  totalProfit: number
  symbols?: { symbol: string; volume: number; trades: number; profit: number }[]
}

interface SymbolDistribution {
  symbol: string
  volume: number
  percentage: number
}

const { t } = useI18n()
const message = useMessage()

const loadingRanking = ref(false)
const loadingSymbol = ref(false)
const showDetailModal = ref(false)
const selectedTenant = ref<TenantRanking | null>(null)

const overview = reactive({
  totalVolume: 0,
  totalTrades: 0,
  totalProfit: 0,
  activeTenants: 0,
})

const tenantRanking = ref<TenantRanking[]>([])
const symbolDistribution = ref<SymbolDistribution[]>([])

const filters = reactive({
  period: 'week',
})

const periodOptions = computed(() => [
  { label: t('trading.period.today'), value: 'today' },
  { label: t('trading.period.week'), value: 'week' },
  { label: t('trading.period.month'), value: 'month' },
  { label: t('trading.period.quarter'), value: 'quarter' },
])

const rankingColumns = computed<DataTableColumns<TenantRanking>>(() => [
  {
    title: '#',
    key: 'rank',
    width: 50,
    render: (_, index) => index + 1,
  },
  { title: t('trading.tenantName'), key: 'name' },
  {
    title: t('trading.volume'),
    key: 'totalVolume',
    width: 120,
    render: (row) => `${row.totalVolume} ${t('trading.lots')}`,
  },
  {
    title: t('trading.trades'),
    key: 'totalTrades',
    width: 80,
  },
  {
    title: t('trading.profit'),
    key: 'totalProfit',
    width: 120,
    render: (row) => h('span', {
      class: row.totalProfit >= 0 ? 'text-success' : 'text-error',
    }, formatProfit(row.totalProfit)),
  },
  {
    title: t('common.actions'),
    key: 'actions',
    width: 80,
    render: (row) => h(NButton, {
      text: true,
      type: 'primary',
      onClick: () => viewTenantDetail(row),
    }, () => t('trading.viewDetail')),
  },
])

const symbolColumns = computed<DataTableColumns<any>>(() => [
  { title: t('trading.symbol'), key: 'symbol' },
  {
    title: t('trading.volume'),
    key: 'volume',
    render: (row) => `${row.volume} ${t('trading.lots')}`,
  },
  { title: t('trading.trades'), key: 'trades' },
  {
    title: t('trading.profit'),
    key: 'profit',
    render: (row) => h('span', {
      class: row.profit >= 0 ? 'text-success' : 'text-error',
    }, formatProfit(row.profit)),
  },
])

function formatProfit(value: number): string {
  const formatted = Math.abs(value).toFixed(2)
  return value >= 0 ? `+${formatted}` : `-${formatted}`
}

async function loadData() {
  await Promise.all([
    loadOverview(),
    loadTenantRanking(),
    loadSymbolDistribution(),
  ])
}

async function loadOverview() {
  try {
    const result = await api.tradingData.getOverview({ period: filters.period }) as any
    overview.totalVolume = result.totalVolume || 0
    overview.totalTrades = result.totalTrades || 0
    overview.totalProfit = result.totalProfit || 0
    overview.activeTenants = result.activeTenants || 0
  } catch {
    // ignore
  }
}

async function loadTenantRanking() {
  loadingRanking.value = true
  try {
    const result = await api.tradingData.getTenantRanking({ period: filters.period, limit: 10 }) as any
    tenantRanking.value = Array.isArray(result) ? result : (result.data || [])
  } catch {
    // API not implemented yet, silently fail with empty data
    tenantRanking.value = []
  } finally {
    loadingRanking.value = false
  }
}

async function loadSymbolDistribution() {
  loadingSymbol.value = true
  try {
    const result = await api.tradingData.getSymbolDistribution({ period: filters.period }) as any
    symbolDistribution.value = Array.isArray(result) ? result : (result.data || [])
  } catch {
    // API not implemented yet, silently fail with empty data
    symbolDistribution.value = []
  } finally {
    loadingSymbol.value = false
  }
}

async function viewTenantDetail(tenant: TenantRanking) {
  try {
    const result = await api.tradingData.getTenantDetail(tenant.id, { period: filters.period }) as any
    selectedTenant.value = {
      ...tenant,
      ...result,
    }
    showDetailModal.value = true
  } catch {
    message.error(t('trading.loadDetailFailed'))
  }
}

onMounted(() => {
  loadData()
})
</script>
