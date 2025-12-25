<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <div class="flex items-center gap-4">
        <n-button quaternary circle @click="router.back()">
          <template #icon>
            <n-icon><i class="i-carbon-arrow-left" /></n-icon>
          </template>
        </n-button>
        <h1 class="page-title">{{ middleware?.name || '中间件' }} - 运行时配置</h1>
      </div>
      <n-space>
        <n-button @click="resetConfig" :loading="resetting">
          <template #icon>
            <n-icon><i class="i-carbon-reset" /></n-icon>
          </template>
          重置为默认值
        </n-button>
        <n-button type="primary" @click="saveConfig" :loading="saving" :disabled="!hasChanges">
          <template #icon>
            <n-icon><i class="i-carbon-save" /></n-icon>
          </template>
          保存配置
        </n-button>
      </n-space>
    </div>

    <n-spin :show="loading">
      <n-alert type="info" class="mb-4">
        运行时配置用于控制中间件的行为参数。修改后中间件会在下次心跳时自动拉取新配置。
      </n-alert>

      <n-grid :cols="24" :x-gap="16" :y-gap="16">
        <!-- Rate Limit -->
        <n-gi :span="12">
          <n-card title="速率限制">
            <template #header-extra>
              <n-switch v-model:value="config.rateLimitEnabled" @update:value="markChanged" />
            </template>
            <n-form label-placement="left" label-width="140px" :disabled="!config.rateLimitEnabled">
              <n-form-item label="每分钟请求数">
                <n-input-number
                  v-model:value="config.rateLimitRequestsPerMin"
                  :min="1"
                  :max="10000"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="突发请求数">
                <n-input-number
                  v-model:value="config.rateLimitBurstSize"
                  :min="1"
                  :max="10000"
                  @update:value="markChanged"
                />
              </n-form-item>
            </n-form>
          </n-card>
        </n-gi>

        <!-- Circuit Breaker -->
        <n-gi :span="12">
          <n-card title="熔断器">
            <template #header-extra>
              <n-switch v-model:value="config.circuitBreakerEnabled" @update:value="markChanged" />
            </template>
            <n-form label-placement="left" label-width="140px" :disabled="!config.circuitBreakerEnabled">
              <n-form-item label="失败阈值">
                <n-input-number
                  v-model:value="config.circuitBreakerFailureThreshold"
                  :min="1"
                  :max="100"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="打开超时(秒)">
                <n-input-number
                  v-model:value="config.circuitBreakerOpenTimeoutSec"
                  :min="1"
                  :max="3600"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="半开请求数">
                <n-input-number
                  v-model:value="config.circuitBreakerHalfOpenRequests"
                  :min="1"
                  :max="100"
                  @update:value="markChanged"
                />
              </n-form-item>
            </n-form>
          </n-card>
        </n-gi>

        <!-- Retry -->
        <n-gi :span="12">
          <n-card title="重试策略">
            <template #header-extra>
              <n-switch v-model:value="config.retryEnabled" @update:value="markChanged" />
            </template>
            <n-form label-placement="left" label-width="140px" :disabled="!config.retryEnabled">
              <n-form-item label="最大重试次数">
                <n-input-number
                  v-model:value="config.retryMaxRetries"
                  :min="0"
                  :max="10"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="基础延迟(ms)">
                <n-input-number
                  v-model:value="config.retryBaseDelayMs"
                  :min="100"
                  :max="60000"
                  :step="100"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="最大延迟(ms)">
                <n-input-number
                  v-model:value="config.retryMaxDelayMs"
                  :min="1000"
                  :max="300000"
                  :step="1000"
                  @update:value="markChanged"
                />
              </n-form-item>
            </n-form>
          </n-card>
        </n-gi>

        <!-- Cache TTL -->
        <n-gi :span="12">
          <n-card title="缓存 TTL">
            <n-form label-placement="left" label-width="140px">
              <n-form-item label="用户缓存(秒)">
                <n-input-number
                  v-model:value="config.cacheUserTtl"
                  :min="1"
                  :max="86400"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="行情缓存(秒)">
                <n-input-number
                  v-model:value="config.cacheQuoteTtl"
                  :min="1"
                  :max="60"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="余额缓存(秒)">
                <n-input-number
                  v-model:value="config.cacheBalanceTtl"
                  :min="1"
                  :max="300"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="品种缓存(秒)">
                <n-input-number
                  v-model:value="config.cacheSymbolTtl"
                  :min="60"
                  :max="604800"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="K线缓存(秒)">
                <n-input-number
                  v-model:value="config.cacheBarsTtl"
                  :min="1"
                  :max="3600"
                  @update:value="markChanged"
                />
              </n-form-item>
            </n-form>
          </n-card>
        </n-gi>

        <!-- WebSocket -->
        <n-gi :span="12">
          <n-card title="WebSocket">
            <n-form label-placement="left" label-width="140px">
              <n-form-item label="心跳间隔(秒)">
                <n-input-number
                  v-model:value="config.wsHeartbeatIntervalSec"
                  :min="5"
                  :max="120"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="Ping超时(秒)">
                <n-input-number
                  v-model:value="config.wsPingTimeoutSec"
                  :min="5"
                  :max="60"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="最大连接数">
                <n-input-number
                  v-model:value="config.wsMaxConnections"
                  :min="100"
                  :max="100000"
                  :step="100"
                  @update:value="markChanged"
                />
              </n-form-item>
            </n-form>
          </n-card>
        </n-gi>

        <!-- Security -->
        <n-gi :span="12">
          <n-card title="安全设置">
            <n-form label-placement="left" label-width="140px">
              <n-form-item label="最大登录尝试">
                <n-input-number
                  v-model:value="config.securityMaxLoginAttempts"
                  :min="1"
                  :max="20"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="锁定时长(分钟)">
                <n-input-number
                  v-model:value="config.securityLockoutDurationMin"
                  :min="1"
                  :max="1440"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="会话超时(分钟)">
                <n-input-number
                  v-model:value="config.securitySessionTimeoutMin"
                  :min="5"
                  :max="1440"
                  @update:value="markChanged"
                />
              </n-form-item>
            </n-form>
          </n-card>
        </n-gi>

        <!-- CORS -->
        <n-gi :span="12">
          <n-card title="CORS 跨域">
            <template #header-extra>
              <n-switch v-model:value="config.corsEnabled" @update:value="markChanged" />
            </template>
            <n-form label-placement="left" label-width="140px" :disabled="!config.corsEnabled">
              <n-form-item label="允许的来源">
                <n-input
                  v-model:value="config.corsAllowedOrigins"
                  placeholder="多个用逗号分隔，* 表示全部"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="允许的方法">
                <n-input
                  v-model:value="config.corsAllowedMethods"
                  placeholder="例如: GET,POST,PUT,DELETE"
                  @update:value="markChanged"
                />
              </n-form-item>
            </n-form>
          </n-card>
        </n-gi>

        <!-- Request Queue -->
        <n-gi :span="12">
          <n-card title="请求队列">
            <template #header-extra>
              <n-switch v-model:value="config.requestQueueEnabled" @update:value="markChanged" />
            </template>
            <n-form label-placement="left" label-width="140px" :disabled="!config.requestQueueEnabled">
              <n-form-item label="队列最大大小">
                <n-input-number
                  v-model:value="config.requestQueueMaxSize"
                  :min="100"
                  :max="100000"
                  :step="100"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="超时(ms)">
                <n-input-number
                  v-model:value="config.requestQueueTimeoutMs"
                  :min="1000"
                  :max="300000"
                  :step="1000"
                  @update:value="markChanged"
                />
              </n-form-item>
              <n-form-item label="工作线程数">
                <n-input-number
                  v-model:value="config.requestQueueWorkerCount"
                  :min="1"
                  :max="32"
                  @update:value="markChanged"
                />
              </n-form-item>
            </n-form>
          </n-card>
        </n-gi>

        <!-- Batch -->
        <n-gi :span="12">
          <n-card title="批量处理">
            <n-form label-placement="left" label-width="140px">
              <n-form-item label="并发限制">
                <n-input-number
                  v-model:value="config.batchConcurrencyLimit"
                  :min="1"
                  :max="100"
                  @update:value="markChanged"
                />
              </n-form-item>
            </n-form>
          </n-card>
        </n-gi>
      </n-grid>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NCard,
  NButton,
  NIcon,
  NSpace,
  NForm,
  NFormItem,
  NInputNumber,
  NInput,
  NSwitch,
  NGrid,
  NGi,
  NAlert,
  NSpin,
  useMessage,
  useDialog,
} from 'naive-ui'
import { middlewareApi, type Middleware, type MiddlewareConfig } from '@/api/middleware'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()

const middlewareId = route.params.id as string

const loading = ref(false)
const saving = ref(false)
const resetting = ref(false)
const hasChanges = ref(false)
const middleware = ref<Middleware | null>(null)

// 配置数据
const config = reactive<MiddlewareConfig>({
  id: '',
  middlewareId: '',
  rateLimitEnabled: true,
  rateLimitRequestsPerMin: 60,
  rateLimitBurstSize: 100,
  circuitBreakerEnabled: true,
  circuitBreakerFailureThreshold: 5,
  circuitBreakerOpenTimeoutSec: 30,
  circuitBreakerHalfOpenRequests: 3,
  retryEnabled: true,
  retryMaxRetries: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 10000,
  cacheUserTtl: 300,
  cacheQuoteTtl: 1,
  cacheBalanceTtl: 5,
  cacheSymbolTtl: 86400,
  cacheBarsTtl: 60,
  wsHeartbeatIntervalSec: 30,
  wsPingTimeoutSec: 10,
  wsMaxConnections: 10000,
  corsEnabled: true,
  corsAllowedOrigins: '*',
  corsAllowedMethods: 'GET,POST,PUT,DELETE,OPTIONS',
  securityMaxLoginAttempts: 5,
  securityLockoutDurationMin: 30,
  securitySessionTimeoutMin: 30,
  requestQueueEnabled: true,
  requestQueueMaxSize: 1000,
  requestQueueTimeoutMs: 30000,
  requestQueueWorkerCount: 4,
  batchConcurrencyLimit: 10,
  createdAt: '',
  updatedAt: '',
})

function markChanged() {
  hasChanges.value = true
}

async function loadMiddleware() {
  try {
    middleware.value = await middlewareApi.get(middlewareId)
  } catch {
    message.error('加载中间件信息失败')
  }
}

async function loadConfig() {
  loading.value = true
  try {
    const data = await middlewareApi.getConfig(middlewareId)
    Object.assign(config, data)
    hasChanges.value = false
  } catch {
    message.error('加载配置失败')
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  saving.value = true
  try {
    const data = await middlewareApi.updateConfig(middlewareId, {
      rateLimitEnabled: config.rateLimitEnabled,
      rateLimitRequestsPerMin: config.rateLimitRequestsPerMin,
      rateLimitBurstSize: config.rateLimitBurstSize,
      circuitBreakerEnabled: config.circuitBreakerEnabled,
      circuitBreakerFailureThreshold: config.circuitBreakerFailureThreshold,
      circuitBreakerOpenTimeoutSec: config.circuitBreakerOpenTimeoutSec,
      circuitBreakerHalfOpenRequests: config.circuitBreakerHalfOpenRequests,
      retryEnabled: config.retryEnabled,
      retryMaxRetries: config.retryMaxRetries,
      retryBaseDelayMs: config.retryBaseDelayMs,
      retryMaxDelayMs: config.retryMaxDelayMs,
      cacheUserTtl: config.cacheUserTtl,
      cacheQuoteTtl: config.cacheQuoteTtl,
      cacheBalanceTtl: config.cacheBalanceTtl,
      cacheSymbolTtl: config.cacheSymbolTtl,
      cacheBarsTtl: config.cacheBarsTtl,
      wsHeartbeatIntervalSec: config.wsHeartbeatIntervalSec,
      wsPingTimeoutSec: config.wsPingTimeoutSec,
      wsMaxConnections: config.wsMaxConnections,
      corsEnabled: config.corsEnabled,
      corsAllowedOrigins: config.corsAllowedOrigins,
      corsAllowedMethods: config.corsAllowedMethods,
      securityMaxLoginAttempts: config.securityMaxLoginAttempts,
      securityLockoutDurationMin: config.securityLockoutDurationMin,
      securitySessionTimeoutMin: config.securitySessionTimeoutMin,
      requestQueueEnabled: config.requestQueueEnabled,
      requestQueueMaxSize: config.requestQueueMaxSize,
      requestQueueTimeoutMs: config.requestQueueTimeoutMs,
      requestQueueWorkerCount: config.requestQueueWorkerCount,
      batchConcurrencyLimit: config.batchConcurrencyLimit,
    })
    Object.assign(config, data)
    hasChanges.value = false
    message.success('配置已保存')
  } catch {
    message.error('保存配置失败')
  } finally {
    saving.value = false
  }
}

function resetConfig() {
  dialog.warning({
    title: '确认重置',
    content: '确定要将所有配置重置为默认值吗？此操作不可撤销。',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      resetting.value = true
      try {
        const data = await middlewareApi.resetConfig(middlewareId)
        Object.assign(config, data)
        hasChanges.value = false
        message.success('配置已重置为默认值')
      } catch {
        message.error('重置配置失败')
      } finally {
        resetting.value = false
      }
    },
  })
}

onMounted(() => {
  loadMiddleware()
  loadConfig()
})
</script>
