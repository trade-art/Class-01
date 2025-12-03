<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('menu.dashboard') }}</h1>
      <n-space>
        <n-tag v-if="autoRefresh" type="success" size="small">
          {{ t('dashboard.autoRefresh') }}
        </n-tag>
        <n-button quaternary circle @click="loadAllData">
          <template #icon>
            <n-icon><i class="i-carbon-renew" /></n-icon>
          </template>
        </n-button>
      </n-space>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-4 gap-4 mb-6">
      <n-card>
        <n-statistic :label="t('dashboard.totalTenants')" :value="tenantStats?.total || 0">
          <template #prefix>
            <n-icon class="text-primary"><i class="i-carbon-enterprise" /></n-icon>
          </template>
        </n-statistic>
      </n-card>
      <n-card>
        <n-statistic :label="t('dashboard.activeTenants')" :value="tenantStats?.active || 0">
          <template #prefix>
            <n-icon class="text-success"><i class="i-carbon-checkmark-filled" /></n-icon>
          </template>
        </n-statistic>
      </n-card>
      <n-card>
        <n-statistic :label="t('dashboard.totalInstances')" :value="instanceStats?.total || 0">
          <template #prefix>
            <n-icon class="text-primary"><i class="i-carbon-server-dns" /></n-icon>
          </template>
        </n-statistic>
      </n-card>
      <n-card>
        <n-statistic :label="t('dashboard.onlineInstances')" :value="instanceStats?.online || 0">
          <template #prefix>
            <n-icon class="text-success"><i class="i-carbon-cloud" /></n-icon>
          </template>
        </n-statistic>
      </n-card>
    </div>

    <n-grid :cols="2" :x-gap="16" :y-gap="16" class="mb-4">
      <!-- Trading Trend Chart -->
      <n-gi>
        <n-card :title="t('dashboard.tradingTrend')">
          <LineChart
            :x-data="tradingTrendData.dates"
            :series="tradingTrendData.series"
            :loading="loadingTrend"
            height="280px"
          />
        </n-card>
      </n-gi>

      <!-- Subscription Distribution -->
      <n-gi>
        <n-card :title="t('dashboard.subscriptionDistribution')">
          <PieChart
            :data="subscriptionData"
            :loading="loadingSubscription"
            height="280px"
            donut
          />
        </n-card>
      </n-gi>
    </n-grid>

    <n-grid :cols="2" :x-gap="16" :y-gap="16">
      <!-- Tenant Status -->
      <n-gi>
        <n-card :title="t('dashboard.tenantStatus')">
          <n-space vertical :size="16">
            <div class="flex items-center gap-4">
              <span class="w-16 shrink-0">{{ t('tenant.status.active') }}</span>
              <n-progress
                type="line"
                :percentage="getPercent(tenantStats?.active, tenantStats?.total)"
                status="success"
                :show-indicator="true"
              />
            </div>
            <div class="flex items-center gap-4">
              <span class="w-16 shrink-0">{{ t('tenant.status.pending') }}</span>
              <n-progress
                type="line"
                :percentage="getPercent(tenantStats?.pending, tenantStats?.total)"
                status="warning"
                :show-indicator="true"
              />
            </div>
            <div class="flex items-center gap-4">
              <span class="w-16 shrink-0">{{ t('tenant.status.suspended') }}</span>
              <n-progress
                type="line"
                :percentage="getPercent(tenantStats?.suspended, tenantStats?.total)"
                status="error"
                :show-indicator="true"
              />
            </div>
          </n-space>
        </n-card>
      </n-gi>

      <!-- Instance Status -->
      <n-gi>
        <n-card :title="t('dashboard.instanceStatus')">
          <n-space vertical :size="16">
            <div class="flex items-center gap-4">
              <span class="w-16 shrink-0">{{ t('instance.status.online') }}</span>
              <n-progress
                type="line"
                :percentage="getPercent(instanceStats?.online, instanceStats?.total)"
                status="success"
                :show-indicator="true"
              />
            </div>
            <div class="flex items-center gap-4">
              <span class="w-16 shrink-0">{{ t('instance.status.offline') }}</span>
              <n-progress
                type="line"
                :percentage="getPercent(instanceStats?.offline, instanceStats?.total)"
                status="warning"
                :show-indicator="true"
              />
            </div>
            <div class="flex items-center gap-4">
              <span class="w-16 shrink-0">{{ t('instance.status.error') }}</span>
              <n-progress
                type="line"
                :percentage="getPercent(instanceStats?.error, instanceStats?.total)"
                status="error"
                :show-indicator="true"
              />
            </div>
          </n-space>
        </n-card>
      </n-gi>
    </n-grid>

    <n-grid :cols="2" :x-gap="16" :y-gap="16" class="mt-4">
      <!-- Recent Events -->
      <n-gi>
        <n-card :title="t('dashboard.recentEvents')">
          <n-spin :show="loadingEvents">
            <div v-if="recentEvents.length > 0" class="space-y-3">
              <div
                v-for="event in recentEvents"
                :key="event.id"
                class="flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <n-icon :class="getEventIconClass(event.type)" size="18">
                  <i :class="getEventIcon(event.type)" />
                </n-icon>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">{{ event.title }}</div>
                  <div class="text-xs text-secondary">{{ event.description }}</div>
                </div>
                <span class="text-xs text-secondary whitespace-nowrap">{{ formatTime(event.createdAt) }}</span>
              </div>
            </div>
            <n-empty v-else :description="t('common.noData')" />
          </n-spin>
        </n-card>
      </n-gi>

      <!-- Quick Actions -->
      <n-gi>
        <n-card :title="t('dashboard.quickActions')">
          <n-space vertical :size="12">
            <n-button type="primary" block @click="$router.push('/tenants')">
              <template #icon>
                <n-icon><i class="i-carbon-enterprise" /></n-icon>
              </template>
              {{ t('dashboard.manageTenants') }}
            </n-button>
            <n-button block @click="$router.push('/instances')">
              <template #icon>
                <n-icon><i class="i-carbon-server-dns" /></n-icon>
              </template>
              {{ t('dashboard.manageInstances') }}
            </n-button>
            <n-button block @click="$router.push('/invoices')">
              <template #icon>
                <n-icon><i class="i-carbon-document" /></n-icon>
              </template>
              {{ t('dashboard.manageInvoices') }}
            </n-button>
            <n-button block @click="$router.push('/trading')">
              <template #icon>
                <n-icon><i class="i-carbon-chart-line" /></n-icon>
              </template>
              {{ t('dashboard.viewTrading') }}
            </n-button>
          </n-space>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NStatistic,
  NProgress,
  NGrid,
  NGi,
  NSpace,
  NButton,
  NIcon,
  NTag,
  NSpin,
  NEmpty,
} from 'naive-ui'
import { api } from '@/api'
import { LineChart, PieChart } from '@/components/charts'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)

const { t, locale } = useI18n()

interface TenantStats {
  total: number
  active: number
  pending: number
  suspended: number
}

interface InstanceStats {
  total: number
  online: number
  offline: number
  error: number
}

interface RecentEvent {
  id: string
  type: 'tenant' | 'instance' | 'invoice' | 'admin'
  title: string
  description: string
  createdAt: string
}

const tenantStats = ref<TenantStats | null>(null)
const instanceStats = ref<InstanceStats | null>(null)
const loadingTrend = ref(false)
const loadingSubscription = ref(false)
const loadingEvents = ref(false)
const autoRefresh = ref(true)
let refreshTimer: ReturnType<typeof setInterval> | null = null

const tradingTrendData = reactive<{
  dates: string[]
  series: { name: string; data: number[]; color?: string }[]
}>({
  dates: [],
  series: [],
})

const subscriptionData = ref<{ name: string; value: number; color?: string }[]>([])
const recentEvents = ref<RecentEvent[]>([])

function getPercent(value: number | undefined, total: number | undefined): number {
  if (!value || !total || total === 0) return 0
  return Math.round((value / total) * 100)
}

function formatTime(date: string): string {
  dayjs.locale(locale.value === 'zh-CN' ? 'zh-cn' : 'en')
  return dayjs(date).fromNow()
}

function getEventIcon(type: string): string {
  const icons: Record<string, string> = {
    tenant: 'i-carbon-enterprise',
    instance: 'i-carbon-server-dns',
    invoice: 'i-carbon-document',
    admin: 'i-carbon-user-admin',
  }
  return icons[type] || 'i-carbon-information'
}

function getEventIconClass(type: string): string {
  const classes: Record<string, string> = {
    tenant: 'text-primary',
    instance: 'text-info',
    invoice: 'text-warning',
    admin: 'text-success',
  }
  return classes[type] || 'text-secondary'
}

async function loadStats() {
  try {
    const [tenants, instances] = await Promise.all([
      api.tenants.getStats(),
      api.instances.getStats(),
    ])
    tenantStats.value = tenants as TenantStats
    instanceStats.value = instances as InstanceStats
  } catch {
    // ignore
  }
}

async function loadTradingTrend() {
  loadingTrend.value = true
  try {
    const result = await api.tradingData.getOverview({ period: 'week' }) as any
    if (result?.trend) {
      tradingTrendData.dates = result.trend.dates || []
      tradingTrendData.series = [
        { name: t('trading.volume'), data: result.trend.volumes || [], color: '#18a058' },
        { name: t('trading.trades'), data: result.trend.trades || [], color: '#2080f0' },
      ]
    } else {
      // 模拟数据
      const last7Days = Array.from({ length: 7 }, (_, i) =>
        dayjs().subtract(6 - i, 'day').format('MM-DD')
      )
      tradingTrendData.dates = last7Days
      tradingTrendData.series = [
        { name: t('trading.volume'), data: [120, 132, 101, 134, 90, 230, 210], color: '#18a058' },
        { name: t('trading.trades'), data: [220, 182, 191, 234, 290, 330, 310], color: '#2080f0' },
      ]
    }
  } catch {
    // 模拟数据
    const last7Days = Array.from({ length: 7 }, (_, i) =>
      dayjs().subtract(6 - i, 'day').format('MM-DD')
    )
    tradingTrendData.dates = last7Days
    tradingTrendData.series = [
      { name: t('trading.volume'), data: [120, 132, 101, 134, 90, 230, 210], color: '#18a058' },
      { name: t('trading.trades'), data: [220, 182, 191, 234, 290, 330, 310], color: '#2080f0' },
    ]
  } finally {
    loadingTrend.value = false
  }
}

async function loadSubscriptionDistribution() {
  loadingSubscription.value = true
  try {
    const result = await api.subscriptions.list() as any
    const plans = Array.isArray(result) ? result : (result.data || [])
    if (plans.length > 0) {
      subscriptionData.value = plans.map((plan: any) => ({
        name: plan.name,
        value: plan.tenantCount || Math.floor(Math.random() * 50) + 10,
      }))
    } else {
      subscriptionData.value = [
        { name: t('tenant.plans.trial'), value: 15, color: '#909399' },
        { name: t('tenant.plans.basic'), value: 35, color: '#18a058' },
        { name: t('tenant.plans.professional'), value: 30, color: '#2080f0' },
        { name: t('tenant.plans.enterprise'), value: 20, color: '#f0a020' },
      ]
    }
  } catch {
    subscriptionData.value = [
      { name: t('tenant.plans.trial'), value: 15, color: '#909399' },
      { name: t('tenant.plans.basic'), value: 35, color: '#18a058' },
      { name: t('tenant.plans.professional'), value: 30, color: '#2080f0' },
      { name: t('tenant.plans.enterprise'), value: 20, color: '#f0a020' },
    ]
  } finally {
    loadingSubscription.value = false
  }
}

async function loadRecentEvents() {
  loadingEvents.value = true
  try {
    // 模拟数据，实际应调用 API
    recentEvents.value = [
      {
        id: '1',
        type: 'tenant',
        title: t('dashboard.events.newTenant'),
        description: 'Alpha Trading Co.',
        createdAt: dayjs().subtract(10, 'minute').toISOString(),
      },
      {
        id: '2',
        type: 'instance',
        title: t('dashboard.events.instanceOnline'),
        description: 'prod-server-01',
        createdAt: dayjs().subtract(30, 'minute').toISOString(),
      },
      {
        id: '3',
        type: 'invoice',
        title: t('dashboard.events.invoicePaid'),
        description: 'INV-2024-001',
        createdAt: dayjs().subtract(2, 'hour').toISOString(),
      },
      {
        id: '4',
        type: 'admin',
        title: t('dashboard.events.adminCreated'),
        description: 'john@example.com',
        createdAt: dayjs().subtract(1, 'day').toISOString(),
      },
    ]
  } catch {
    recentEvents.value = []
  } finally {
    loadingEvents.value = false
  }
}

async function loadAllData() {
  await Promise.all([
    loadStats(),
    loadTradingTrend(),
    loadSubscriptionDistribution(),
    loadRecentEvents(),
  ])
}

function startAutoRefresh() {
  if (refreshTimer) return
  refreshTimer = setInterval(() => {
    if (autoRefresh.value) {
      loadStats()
    }
  }, 30000) // 30秒刷新一次
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

onMounted(() => {
  loadAllData()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.text-success {
  color: var(--success-color);
}
.text-info {
  color: var(--info-color);
}
.text-warning {
  color: var(--warning-color);
}
.text-error {
  color: var(--error-color);
}
</style>
