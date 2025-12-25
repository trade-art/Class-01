<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">{{ t('middlewareInstance.title') }}</h1>
      <p class="page-desc">{{ t('middlewareInstance.description') }}</p>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <n-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon" style="background-color: var(--primary-color);">
            <span class="i-carbon-cloud-services text-white text-xl"></span>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ middlewares.length }}</div>
            <div class="stat-label">{{ t('middlewareInstance.totalInstances') }}</div>
          </div>
        </div>
      </n-card>
      <n-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon" style="background-color: var(--success-color);">
            <span class="i-carbon-checkmark-filled text-white text-xl"></span>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ onlineCount }}</div>
            <div class="stat-label">{{ t('middlewareInstance.onlineCount') }}</div>
          </div>
        </div>
      </n-card>
      <n-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon" style="background-color: var(--error-color);">
            <span class="i-carbon-close-filled text-white text-xl"></span>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ offlineCount }}</div>
            <div class="stat-label">{{ t('middlewareInstance.offlineCount') }}</div>
          </div>
        </div>
      </n-card>
    </div>

    <!-- 中间件列表 -->
    <n-card>
      <template #header>
        <div class="card-header">
          <span>{{ t('middlewareInstance.instanceList') }}</span>
          <div class="header-actions">
            <div class="auto-refresh-toggle">
              <span class="toggle-label">{{ t('middlewareInstance.autoRefresh') }}</span>
              <n-switch :value="autoRefresh" @update:value="toggleAutoRefresh" size="small" />
            </div>
            <n-button text @click="() => loadMiddlewares()">
              <template #icon>
                <span class="i-carbon-refresh"></span>
              </template>
              {{ t('common.refresh') }}
            </n-button>
          </div>
        </div>
      </template>

      <n-spin :show="loading">
        <n-empty v-if="!loading && middlewares.length === 0" :description="t('middlewareInstance.noInstances')" />

        <div v-else class="middleware-grid">
          <n-card
            v-for="middleware in middlewares"
            :key="middleware.id"
            class="middleware-card"
            :class="{ 'middleware-offline': middleware.status !== 'ONLINE' }"
          >
            <div class="middleware-header">
              <div class="middleware-name">{{ middleware.name }}</div>
              <div class="middleware-tags">
                <n-tag :type="getPlatformTagType(middleware.platformType)" size="small">
                  {{ middleware.platformType }}
                </n-tag>
                <n-tag :type="getStatusType(middleware.status)" size="small">
                  {{ t(`middlewareInstance.status.${middleware.status}`) }}
                </n-tag>
              </div>
            </div>

            <div v-if="middleware.description" class="middleware-desc">
              {{ middleware.description }}
            </div>

            <n-divider />

            <div class="middleware-stats">
              <div class="stat-item">
                <span class="stat-label">{{ t('middlewareInstance.connection') }}</span>
                <n-tag :type="getManagerStatusType(middleware.managerStatus)" size="small">
                  {{ t(`middlewareInstance.managerStatus.${middleware.managerStatus}`) }}
                </n-tag>
              </div>
              <div class="stat-item">
                <span class="stat-label">{{ t('middlewareInstance.activeSessions') }}</span>
                <span class="stat-value">{{ middleware.status === 'ONLINE' ? (middleware.activeSessions ?? '-') : '-' }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">{{ t('middlewareInstance.memoryUsage') }}</span>
                <span class="stat-value">{{ formatMetric(middleware.memoryUsagePercent, middleware.status, '%') }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">{{ t('middlewareInstance.cpuUsage') }}</span>
                <span class="stat-value">{{ formatMetric(middleware.cpuUsage, middleware.status, '%') }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">{{ t('middlewareInstance.lastHeartbeat') }}</span>
                <span class="stat-value">{{ formatHeartbeat(middleware.lastHeartbeat, middleware.status) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">{{ t('middlewareInstance.assignedAt') }}</span>
                <span class="stat-value">{{ formatDate(middleware.assignedAt) }}</span>
              </div>
            </div>
          </n-card>
        </div>
      </n-spin>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NCard, NButton, NTag, NDivider, NSpin, NEmpty, NSwitch, useMessage } from 'naive-ui'
import { middlewareInstancesApi, type MiddlewareInstance } from '@/api/middleware-instances'

const { t } = useI18n()
const message = useMessage()

const loading = ref(false)
const middlewares = ref<MiddlewareInstance[]>([])
const autoRefresh = ref(true)
const refreshInterval = ref<ReturnType<typeof setInterval> | null>(null)
const REFRESH_INTERVAL_MS = 30000 // 30 seconds

const onlineCount = computed(() => middlewares.value.filter((m) => m.status === 'ONLINE').length)
const offlineCount = computed(() => middlewares.value.filter((m) => m.status !== 'ONLINE').length)

const getStatusType = (status: string) => {
  switch (status.toUpperCase()) {
    case 'ONLINE':
      return 'success'
    case 'OFFLINE':
      return 'error'
    case 'DEGRADED':
    case 'MAINTENANCE':
      return 'warning'
    default:
      return 'default'
  }
}

const getPlatformTagType = (platformType: string) => {
  return platformType === 'MT5' ? 'info' : 'warning'
}

const getManagerStatusType = (status: string) => {
  switch (status) {
    case 'CONNECTED':
      return 'success'
    case 'DISCONNECTED':
      return 'error'
    case 'NOT_CONFIGURED':
      return 'warning'
    default:
      return 'default'
  }
}

const formatTime = (time?: string) => {
  if (!time) return '-'
  const date = new Date(time)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return t('time.justNow')
  if (diff < 3600000) return `${Math.floor(diff / 60000)} ${t('time.minutes')} ${t('time.ago')}`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${t('time.hours')} ${t('time.ago')}`
  return `${Math.floor(diff / 86400000)} ${t('time.days')} ${t('time.ago')}`
}

// 格式化心跳时间：在线时显示实际时间值，离线时显示 "-"
const formatHeartbeat = (time?: string, status?: string) => {
  // 如果中间件不在线，显示 "-"
  if (status !== 'ONLINE') {
    return '-'
  }

  if (!time) return '-'

  // 显示实际的时间值 (HH:mm:ss 格式)
  const date = new Date(time)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

// 格式化实时指标：离线时显示 "-"
const formatMetric = (value: number | undefined | null, status?: string, suffix = '') => {
  // 如果中间件不在线，显示 "-"
  if (status !== 'ONLINE') {
    return '-'
  }

  if (value === undefined || value === null) {
    return '-'
  }

  return `${value.toFixed(1)}${suffix}`
}

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString()
}

const loadMiddlewares = async (showLoading = true) => {
  if (showLoading) loading.value = true
  try {
    const response = await middlewareInstancesApi.getInstances()
    middlewares.value = response.middlewares
  } catch (error) {
    console.error('Failed to load middleware instances:', error)
    if (showLoading) message.error(t('middlewareInstance.loadFailed'))
  } finally {
    if (showLoading) loading.value = false
  }
}

const startAutoRefresh = () => {
  if (refreshInterval.value) return
  refreshInterval.value = setInterval(() => {
    loadMiddlewares(false) // Silent refresh
  }, REFRESH_INTERVAL_MS)
}

const stopAutoRefresh = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
    refreshInterval.value = null
  }
}

const toggleAutoRefresh = (value: boolean) => {
  autoRefresh.value = value
  if (value) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

onMounted(() => {
  loadMiddlewares()
  if (autoRefresh.value) {
    startAutoRefresh()
  }
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.page-desc {
  color: var(--text-color-secondary);
  margin-top: 4px;
  font-size: 14px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  padding: 0;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-info {
  flex: 1;
}

.stat-info .stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color-base);
}

.stat-info .stat-label {
  font-size: 13px;
  color: var(--text-color-secondary);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.auto-refresh-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-label {
  font-size: 13px;
  color: var(--text-color-secondary);
}

.middleware-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}

.middleware-card {
  transition: all 0.2s ease;
}

.middleware-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.middleware-offline {
  opacity: 0.7;
}

.middleware-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.middleware-tags {
  display: flex;
  gap: 6px;
}

.middleware-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color-base);
}

.middleware-desc {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin-top: 8px;
}

.middleware-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.middleware-stats .stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.middleware-stats .stat-label {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.middleware-stats .stat-value {
  font-size: 13px;
  color: var(--text-color-base);
}

@media (max-width: 768px) {
  .stats-row {
    grid-template-columns: 1fr;
  }

  .middleware-grid {
    grid-template-columns: 1fr;
  }
}
</style>
