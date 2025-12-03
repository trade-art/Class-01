<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">{{ t('reports.title') }}</h1>
    </div>

    <!-- Report Cards -->
    <div class="reports-grid">
      <n-card hoverable class="report-card" @click="navigateTo('/reports/trading')">
        <div class="report-icon" style="background-color: var(--primary-color);">
          <span class="i-carbon-analytics text-white text-2xl"></span>
        </div>
        <div class="report-content">
          <h3 class="report-title">{{ t('reports.tradingReport') }}</h3>
          <p class="report-desc">{{ t('reports.tradingReportDesc') }}</p>
        </div>
        <div class="report-arrow">
          <span class="i-carbon-arrow-right"></span>
        </div>
      </n-card>

      <n-card hoverable class="report-card" @click="navigateTo('/reports/users')">
        <div class="report-icon" style="background-color: var(--info-color);">
          <span class="i-carbon-user-analytics text-white text-2xl"></span>
        </div>
        <div class="report-content">
          <h3 class="report-title">{{ t('reports.userReport') }}</h3>
          <p class="report-desc">{{ t('reports.userReportDesc') }}</p>
        </div>
        <div class="report-arrow">
          <span class="i-carbon-arrow-right"></span>
        </div>
      </n-card>

      <n-card hoverable class="report-card" @click="navigateTo('/reports/finance')">
        <div class="report-icon" style="background-color: var(--success-color);">
          <span class="i-carbon-finance text-white text-2xl"></span>
        </div>
        <div class="report-content">
          <h3 class="report-title">{{ t('reports.financeReport') }}</h3>
          <p class="report-desc">{{ t('reports.financeReportDesc') }}</p>
        </div>
        <div class="report-arrow">
          <span class="i-carbon-arrow-right"></span>
        </div>
      </n-card>
    </div>

    <!-- Quick Stats -->
    <n-card :title="t('reports.quickStats')" class="quick-stats-card">
      <n-spin :show="loading">
        <div class="quick-stats-grid">
          <div class="quick-stat">
            <div class="quick-stat-label">{{ t('reports.todayTrades') }}</div>
            <div class="quick-stat-value">{{ quickStats.todayTrades }}</div>
          </div>
          <div class="quick-stat">
            <div class="quick-stat-label">{{ t('reports.todayVolume') }}</div>
            <div class="quick-stat-value">{{ quickStats.todayVolume.toFixed(2) }}</div>
          </div>
          <div class="quick-stat">
            <div class="quick-stat-label">{{ t('reports.todayProfit') }}</div>
            <div class="quick-stat-value" :class="quickStats.todayProfit >= 0 ? 'profit' : 'loss'">
              {{ formatCurrency(quickStats.todayProfit, true) }}
            </div>
          </div>
          <div class="quick-stat">
            <div class="quick-stat-label">{{ t('reports.todayDeposits') }}</div>
            <div class="quick-stat-value profit">{{ formatCurrency(quickStats.todayDeposits) }}</div>
          </div>
          <div class="quick-stat">
            <div class="quick-stat-label">{{ t('reports.todayWithdrawals') }}</div>
            <div class="quick-stat-value loss">{{ formatCurrency(quickStats.todayWithdrawals) }}</div>
          </div>
          <div class="quick-stat">
            <div class="quick-stat-label">{{ t('reports.todayNewUsers') }}</div>
            <div class="quick-stat-value">{{ quickStats.todayNewUsers }}</div>
          </div>
        </div>
      </n-spin>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NCard, NSpin } from 'naive-ui'
import { reportsApi } from '@/api/reports'

const { t } = useI18n()
const router = useRouter()

const loading = ref(false)

const quickStats = reactive({
  todayTrades: 0,
  todayVolume: 0,
  todayProfit: 0,
  todayDeposits: 0,
  todayWithdrawals: 0,
  todayNewUsers: 0,
})

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

const navigateTo = (path: string) => {
  router.push(path)
}

const loadQuickStats = async () => {
  loading.value = true
  try {
    const data = await reportsApi.getQuickStats()
    Object.assign(quickStats, data)
  } catch (error) {
    console.error('Failed to load quick stats:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadQuickStats()
})
</script>

<style scoped>
.reports-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.report-card {
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.report-card:hover {
  transform: translateY(-2px);
}

.report-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.report-content {
  flex: 1;
}

.report-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--text-color-base);
}

.report-desc {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin: 0;
}

.report-arrow {
  font-size: 20px;
  color: var(--text-color-secondary);
  transition: transform 0.2s ease;
}

.report-card:hover .report-arrow {
  transform: translateX(4px);
}

.quick-stats-card {
  margin-top: 16px;
}

.quick-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 24px;
}

.quick-stat {
  text-align: center;
  padding: 16px;
  background-color: var(--body-color);
  border-radius: var(--border-radius-base);
}

.quick-stat-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 8px;
}

.quick-stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color-base);
}

.quick-stat-value.profit {
  color: var(--profit-color);
}

.quick-stat-value.loss {
  color: var(--loss-color);
}
</style>
