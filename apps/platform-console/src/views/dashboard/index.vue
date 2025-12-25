<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('menu.dashboard') }}</h1>
      <n-space align="center">
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
    <div class="grid grid-cols-4 gap-6 mb-6">
      <n-card class="stat-card">
        <n-statistic :label="t('dashboard.totalTenants')" :value="tenantStats?.total || 0">
          <template #prefix>
            <n-icon class="stat-icon text-primary" size="24"><i class="i-carbon-enterprise" /></n-icon>
          </template>
        </n-statistic>
      </n-card>
      <n-card class="stat-card">
        <n-statistic :label="t('dashboard.activeTenants')" :value="tenantStats?.active || 0">
          <template #prefix>
            <n-icon class="stat-icon text-success" size="24"><i class="i-carbon-checkmark-filled" /></n-icon>
          </template>
        </n-statistic>
      </n-card>
      <n-card class="stat-card">
        <n-statistic :label="t('dashboard.totalInstances')" :value="instanceStats?.total || 0">
          <template #prefix>
            <n-icon class="stat-icon text-primary" size="24"><i class="i-carbon-server-dns" /></n-icon>
          </template>
        </n-statistic>
      </n-card>
      <n-card class="stat-card">
        <n-statistic :label="t('dashboard.onlineInstances')" :value="instanceStats?.online || 0">
          <template #prefix>
            <n-icon class="stat-icon text-success" size="24"><i class="i-carbon-cloud" /></n-icon>
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

      <!-- Subscription Distribution (按套餐分布的租户数量) -->
      <n-gi>
        <n-card :title="t('dashboard.subscriptionDistribution')">
          <PieChart
            :data="subscriptionData"
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
          <div class="status-distribution">
            <!-- 堆叠进度条 -->
            <div class="stacked-bar">
              <div
                v-if="tenantStats?.active"
                class="bar-segment bg-success"
                :style="{ width: getPercent(tenantStats?.active, tenantStats?.total) + '%' }"
                :title="`${t('tenant.status.active')}: ${tenantStats?.active}`"
              />
              <div
                v-if="tenantStats?.pending"
                class="bar-segment bg-warning"
                :style="{ width: getPercent(tenantStats?.pending, tenantStats?.total) + '%' }"
                :title="`${t('tenant.status.pending')}: ${tenantStats?.pending}`"
              />
              <div
                v-if="tenantStats?.suspended"
                class="bar-segment bg-error"
                :style="{ width: getPercent(tenantStats?.suspended, tenantStats?.total) + '%' }"
                :title="`${t('tenant.status.suspended')}: ${tenantStats?.suspended}`"
              />
            </div>
            <!-- 图例 -->
            <div class="legend">
              <div class="legend-item">
                <span class="legend-dot bg-success" />
                <span class="legend-label">{{ t('tenant.status.active') }}</span>
                <span class="legend-value">{{ tenantStats?.active || 0 }}</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot bg-warning" />
                <span class="legend-label">{{ t('tenant.status.pending') }}</span>
                <span class="legend-value">{{ tenantStats?.pending || 0 }}</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot bg-error" />
                <span class="legend-label">{{ t('tenant.status.suspended') }}</span>
                <span class="legend-value">{{ tenantStats?.suspended || 0 }}</span>
              </div>
            </div>
          </div>
        </n-card>
      </n-gi>

      <!-- Instance Status -->
      <n-gi>
        <n-card :title="t('dashboard.instanceStatus')">
          <div class="status-distribution">
            <!-- 堆叠进度条 -->
            <div class="stacked-bar">
              <div
                v-if="instanceStats?.online"
                class="bar-segment bg-success"
                :style="{ width: getPercent(instanceStats?.online, instanceStats?.total) + '%' }"
                :title="`${t('instance.status.online')}: ${instanceStats?.online}`"
              />
              <div
                v-if="instanceStats?.degraded"
                class="bar-segment bg-degraded"
                :style="{ width: getPercent(instanceStats?.degraded, instanceStats?.total) + '%' }"
                :title="`${t('instance.status.degraded')}: ${instanceStats?.degraded}`"
              />
              <div
                v-if="instanceStats?.offline"
                class="bar-segment bg-offline"
                :style="{ width: getPercent(instanceStats?.offline, instanceStats?.total) + '%' }"
                :title="`${t('instance.status.offline')}: ${instanceStats?.offline}`"
              />
              <div
                v-if="instanceStats?.error"
                class="bar-segment bg-error"
                :style="{ width: getPercent(instanceStats?.error, instanceStats?.total) + '%' }"
                :title="`${t('instance.status.error')}: ${instanceStats?.error}`"
              />
              <div
                v-if="instanceStats?.suspended"
                class="bar-segment bg-suspended"
                :style="{ width: getPercent(instanceStats?.suspended, instanceStats?.total) + '%' }"
                :title="`${t('instance.status.suspended')}: ${instanceStats?.suspended}`"
              />
            </div>
            <!-- 图例 -->
            <div class="legend">
              <div class="legend-item">
                <span class="legend-dot bg-success" />
                <span class="legend-label">{{ t('instance.status.online') }}</span>
                <span class="legend-value">{{ instanceStats?.online || 0 }}</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot bg-degraded" />
                <span class="legend-label">{{ t('instance.status.degraded') }}</span>
                <span class="legend-value">{{ instanceStats?.degraded || 0 }}</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot bg-offline" />
                <span class="legend-label">{{ t('instance.status.offline') }}</span>
                <span class="legend-value">{{ instanceStats?.offline || 0 }}</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot bg-error" />
                <span class="legend-label">{{ t('instance.status.error') }}</span>
                <span class="legend-value">{{ instanceStats?.error || 0 }}</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot bg-suspended" />
                <span class="legend-label">{{ t('instance.status.suspended') }}</span>
                <span class="legend-value">{{ instanceStats?.suspended || 0 }}</span>
              </div>
            </div>
          </div>
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
  byPlan?: Record<string, number>
}

interface InstanceStats {
  total: number
  online: number
  offline: number
  degraded: number
  error: number
  suspended: number
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
    // 更新订阅分布（基于 tenantStats.byPlan）
    updateSubscriptionDistribution()
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

function updateSubscriptionDistribution() {
  // 使用 tenantStats.byPlan 数据构建订阅分布
  const byPlan = tenantStats.value?.byPlan || {}

  // 套餐配置：名称、颜色
  const planConfig: Record<string, { label: string; color: string }> = {
    TRIAL: { label: t('tenant.plans.trial'), color: '#909399' },
    BASIC: { label: t('tenant.plans.basic'), color: '#18a058' },
    PROFESSIONAL: { label: t('tenant.plans.professional'), color: '#2080f0' },
    ENTERPRISE: { label: t('tenant.plans.enterprise'), color: '#f0a020' },
  }

  // 构建饼图数据，只包含有租户的套餐
  const data: { name: string; value: number; color: string }[] = []
  for (const [plan, count] of Object.entries(byPlan)) {
    if (count > 0) {
      const config = planConfig[plan] || { label: plan, color: '#666' }
      data.push({
        name: config.label,
        value: count,
        color: config.color,
      })
    }
  }

  // 如果没有数据，显示空状态提示
  if (data.length === 0) {
    subscriptionData.value = [
      { name: t('common.noData'), value: 1, color: '#e0e0e0' },
    ]
  } else {
    subscriptionData.value = data
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
    loadStats(),  // 包含订阅分布更新
    loadTradingTrend(),
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
/* 统计卡片样式 */
.stat-card :deep(.n-statistic) {
  display: flex;
  flex-direction: column;
}

.stat-card :deep(.n-statistic-value) {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-card :deep(.n-statistic-value__prefix) {
  display: flex;
  align-items: center;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

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

/* 堆叠进度条样式 */
.status-distribution {
  padding: 8px 0;
}

.stacked-bar {
  display: flex;
  height: 24px;
  border-radius: 4px;
  overflow: hidden;
  background-color: var(--n-border-color, #e0e0e6);
}

.bar-segment {
  height: 100%;
  transition: width 0.3s ease;
  min-width: 2px;
}

.bar-segment:first-child {
  border-radius: 4px 0 0 4px;
}

.bar-segment:last-child {
  border-radius: 0 4px 4px 0;
}

.bar-segment:only-child {
  border-radius: 4px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  font-size: 13px;
  color: var(--n-text-color-2, #666);
}

.legend-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--n-text-color-1, #333);
}

.bg-success {
  background-color: var(--success-color, #18a058);
}

.bg-warning {
  background-color: var(--warning-color, #f0a020);
}

.bg-error {
  background-color: var(--error-color, #d03050);
}

.bg-degraded {
  background-color: #e6a23c; /* 橙色 - 降级 */
}

.bg-offline {
  background-color: #909399; /* 灰色 - 离线 */
}

.bg-suspended {
  background-color: #a0a0a0; /* 浅灰色 - 已暂停 */
}
</style>
