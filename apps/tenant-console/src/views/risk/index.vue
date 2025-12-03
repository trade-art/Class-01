<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('risk.title') }}</h1>
      <div class="flex items-center gap-4">
        <n-switch v-model:value="autoRefresh" size="small">
          <template #checked>{{ t('risk.autoRefresh') }}</template>
          <template #unchecked>{{ t('risk.autoRefresh') }}</template>
        </n-switch>
        <n-button quaternary circle @click="loadRiskData">
          <template #icon>
            <span class="i-carbon-refresh"></span>
          </template>
        </n-button>
      </div>
    </div>

    <!-- Risk Summary Cards -->
    <div class="risk-summary-grid">
      <div class="risk-card" :class="{ warning: riskSummary.highRiskUsers > 0 }">
        <div class="risk-icon">
          <span class="i-carbon-warning-alt"></span>
        </div>
        <div class="risk-content">
          <div class="risk-label">{{ t('risk.highRiskUsers') }}</div>
          <div class="risk-value">{{ riskSummary.highRiskUsers }}</div>
        </div>
      </div>

      <div class="risk-card">
        <div class="risk-icon info">
          <span class="i-carbon-user-multiple"></span>
        </div>
        <div class="risk-content">
          <div class="risk-label">{{ t('risk.marginCallUsers') }}</div>
          <div class="risk-value">{{ riskSummary.marginCallUsers }}</div>
        </div>
      </div>

      <div class="risk-card">
        <div class="risk-icon success">
          <span class="i-carbon-currency-dollar"></span>
        </div>
        <div class="risk-content">
          <div class="risk-label">{{ t('risk.totalExposure') }}</div>
          <div class="risk-value">{{ formatCurrency(riskSummary.totalExposure) }}</div>
        </div>
      </div>

      <div class="risk-card">
        <div class="risk-icon">
          <span class="i-carbon-chart-line"></span>
        </div>
        <div class="risk-content">
          <div class="risk-label">{{ t('risk.averageMarginLevel') }}</div>
          <div class="risk-value">{{ riskSummary.averageMarginLevel.toFixed(2) }}%</div>
        </div>
      </div>
    </div>

    <!-- Risk Alerts -->
    <n-card :title="t('risk.alerts')" class="alerts-card">
      <template #header-extra>
        <n-badge :value="alerts.length" :max="99" type="error" />
      </template>

      <n-empty v-if="alerts.length === 0" :description="t('risk.noAlerts')" />

      <div v-else class="alerts-list">
        <div
          v-for="alert in alerts"
          :key="alert.id"
          class="alert-item"
          :class="alert.severity"
        >
          <div class="alert-icon">
            <span :class="getAlertIcon(alert.severity)"></span>
          </div>
          <div class="alert-content">
            <div class="alert-header">
              <span class="alert-type">{{ getAlertTypeText(alert.type) }}</span>
              <span class="alert-time">{{ formatTime(alert.createdAt) }}</span>
            </div>
            <div class="alert-message">{{ alert.message }}</div>
            <div class="alert-details">
              <span>{{ t('risk.login') }}: {{ alert.login }}</span>
              <span v-if="alert.symbol">{{ t('risk.symbol') }}: {{ alert.symbol }}</span>
            </div>
          </div>
          <div class="alert-actions">
            <n-button size="small" @click="handleAcknowledge(alert)">
              {{ t('risk.acknowledge') }}
            </n-button>
          </div>
        </div>
      </div>
    </n-card>

    <!-- High Risk Users Table -->
    <n-card :title="t('risk.highRiskUsersTable')" class="users-card">
      <n-data-table
        :columns="riskColumns"
        :data="highRiskUsers"
        :loading="loading"
        :pagination="false"
        size="small"
        :row-class-name="getRowClassName"
      />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, h } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NSwitch,
  NBadge,
  NEmpty,
  NDataTable,
  NTag,
  NProgress,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { riskApi } from '@/api/risk'
import type { RiskAlert } from '@/types'

interface HighRiskUser {
  id: string
  login: number
  name: string
  balance: number
  equity: number
  margin: number
  marginLevel: number
  profit: number
  openPositions: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

const { t } = useI18n()
const message = useMessage()

const loading = ref(false)
const autoRefresh = ref(true)
const alerts = ref<RiskAlert[]>([])
const highRiskUsers = ref<HighRiskUser[]>([])
let refreshInterval: ReturnType<typeof setInterval> | null = null

const riskSummary = reactive({
  highRiskUsers: 0,
  marginCallUsers: 0,
  totalExposure: 0,
  averageMarginLevel: 0,
})

const riskColumns: DataTableColumns<HighRiskUser> = [
  { title: t('risk.login'), key: 'login', width: 100 },
  { title: t('risk.name'), key: 'name', width: 120, ellipsis: { tooltip: true } },
  {
    title: t('risk.balance'),
    key: 'balance',
    width: 120,
    render: (row) => formatCurrency(row.balance),
  },
  {
    title: t('risk.equity'),
    key: 'equity',
    width: 120,
    render: (row) => formatCurrency(row.equity),
  },
  {
    title: t('risk.margin'),
    key: 'margin',
    width: 100,
    render: (row) => formatCurrency(row.margin),
  },
  {
    title: t('risk.marginLevel'),
    key: 'marginLevel',
    width: 150,
    render: (row) => {
      const percentage = Math.min(row.marginLevel, 500) / 5
      const status = row.marginLevel < 100 ? 'error' : row.marginLevel < 150 ? 'warning' : 'success'
      return h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        [
          h(NProgress, {
            type: 'line',
            percentage,
            status,
            showIndicator: false,
            style: { width: '80px' },
          }),
          h('span', `${row.marginLevel.toFixed(2)}%`),
        ]
      )
    },
  },
  {
    title: t('risk.profit'),
    key: 'profit',
    width: 100,
    render: (row) =>
      h(
        'span',
        { style: { color: row.profit >= 0 ? 'var(--profit-color)' : 'var(--loss-color)' } },
        formatCurrency(row.profit, true)
      ),
  },
  {
    title: t('risk.openPositions'),
    key: 'openPositions',
    width: 80,
  },
  {
    title: t('risk.riskLevel'),
    key: 'riskLevel',
    width: 100,
    render: (row) => {
      const typeMap: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
        low: 'success',
        medium: 'warning',
        high: 'error',
        critical: 'error',
      }
      return h(
        NTag,
        { size: 'small', type: typeMap[row.riskLevel] || 'default' },
        () => t(`risk.${row.riskLevel}`)
      )
    },
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

const formatTime = (time: string) => {
  return new Date(time).toLocaleString()
}

const getAlertIcon = (severity: string) => {
  const iconMap: Record<string, string> = {
    critical: 'i-carbon-warning-alt-filled text-red-500',
    high: 'i-carbon-warning-filled text-orange-500',
    medium: 'i-carbon-warning text-yellow-500',
    low: 'i-carbon-information text-blue-500',
  }
  return iconMap[severity] || 'i-carbon-information'
}

const getAlertTypeText = (type: string) => {
  const typeMap: Record<string, string> = {
    margin_call: t('risk.marginCall'),
    stop_out: t('risk.stopOut'),
    large_position: t('risk.largePosition'),
    rapid_loss: t('risk.rapidLoss'),
    high_exposure: t('risk.highExposure'),
  }
  return typeMap[type] || type
}

const getRowClassName = (row: HighRiskUser) => {
  if (row.riskLevel === 'critical') return 'row-critical'
  if (row.riskLevel === 'high') return 'row-high-risk'
  return ''
}

const loadRiskData = async () => {
  loading.value = true
  try {
    const [alertsData, summaryData, usersData] = await Promise.all([
      riskApi.getAlerts(),
      riskApi.getSummary(),
      riskApi.getHighRiskUsers(),
    ])

    alerts.value = (alertsData as any).items || alertsData as any
    Object.assign(riskSummary, summaryData)
    highRiskUsers.value = usersData
  } catch (error) {
    console.error('Failed to load risk data:', error)
  } finally {
    loading.value = false
  }
}

const handleAcknowledge = async (alert: RiskAlert) => {
  try {
    await riskApi.acknowledgeAlert(alert.id)
    alerts.value = alerts.value.filter((a) => a.id !== alert.id)
    message.success(t('risk.alertAcknowledged'))
  } catch (error: any) {
    message.error(error.message || t('common.error'))
  }
}

const startAutoRefresh = () => {
  if (refreshInterval) clearInterval(refreshInterval)
  refreshInterval = setInterval(() => {
    if (autoRefresh.value) {
      loadRiskData()
    }
  }, 10000) // Refresh every 10 seconds
}

onMounted(() => {
  loadRiskData()
  startAutoRefresh()
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<style scoped>
.risk-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.risk-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background-color: var(--card-color);
  border-radius: var(--border-radius-base);
  box-shadow: var(--box-shadow-1);
  border-left: 4px solid var(--primary-color);
}

.risk-card.warning {
  border-left-color: var(--error-color);
  background-color: rgba(208, 48, 80, 0.05);
}

.risk-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background-color: rgba(208, 48, 80, 0.1);
  color: var(--error-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.risk-icon.info {
  background-color: rgba(32, 128, 240, 0.1);
  color: var(--info-color);
}

.risk-icon.success {
  background-color: rgba(24, 160, 88, 0.1);
  color: var(--success-color);
}

.risk-content {
  flex: 1;
}

.risk-label {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin-bottom: 4px;
}

.risk-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color-base);
}

.alerts-card {
  margin-bottom: 16px;
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.alert-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background-color: var(--body-color);
  border-radius: var(--border-radius-base);
  border-left: 3px solid var(--border-color);
}

.alert-item.critical {
  border-left-color: #d03050;
  background-color: rgba(208, 48, 80, 0.05);
}

.alert-item.high {
  border-left-color: #f0a020;
  background-color: rgba(240, 160, 32, 0.05);
}

.alert-item.medium {
  border-left-color: #f0c020;
}

.alert-item.low {
  border-left-color: #2080f0;
}

.alert-icon {
  font-size: 20px;
}

.alert-content {
  flex: 1;
}

.alert-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.alert-type {
  font-weight: 600;
  font-size: 13px;
}

.alert-time {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.alert-message {
  font-size: 14px;
  margin-bottom: 4px;
}

.alert-details {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.alert-actions {
  flex-shrink: 0;
}

.users-card :deep(.row-critical) {
  background-color: rgba(208, 48, 80, 0.1);
}

.users-card :deep(.row-high-risk) {
  background-color: rgba(240, 160, 32, 0.05);
}

@media (max-width: 1024px) {
  .risk-summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .risk-summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
