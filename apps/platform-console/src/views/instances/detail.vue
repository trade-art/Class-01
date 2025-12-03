<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <div class="flex items-center gap-4">
        <n-button text @click="$router.back()">
          <template #icon>
            <n-icon><i class="i-carbon-arrow-left" /></n-icon>
          </template>
          返回
        </n-button>
        <h1 class="page-title">{{ instance?.name }}</h1>
        <n-tag :type="getStatusType(instance?.status)" v-if="instance?.status">
          {{ getStatusText(instance?.status) }}
        </n-tag>
      </div>
      <n-button @click="checkHealth">
        <template #icon>
          <n-icon><i class="i-carbon-renew" /></n-icon>
        </template>
        健康检查
      </n-button>
    </div>

    <n-spin :show="loading">
      <n-grid :cols="24" :x-gap="16">
        <!-- Basic Info -->
        <n-gi :span="16">
          <n-card title="实例信息" class="mb-4">
            <n-descriptions :columns="2">
              <n-descriptions-item label="所属租户">
                <a class="text-primary cursor-pointer" @click="viewTenant">
                  {{ instance?.tenant?.name }}
                </a>
              </n-descriptions-item>
              <n-descriptions-item label="租户代码">{{ instance?.tenant?.code }}</n-descriptions-item>
              <n-descriptions-item label="主机地址">{{ instance?.host }}</n-descriptions-item>
              <n-descriptions-item label="端口">{{ instance?.port }}</n-descriptions-item>
              <n-descriptions-item label="版本">{{ instance?.version || '-' }}</n-descriptions-item>
              <n-descriptions-item label="最后健康检查">
                {{ instance?.lastHealthCheck ? formatDate(instance.lastHealthCheck) : '-' }}
              </n-descriptions-item>
              <n-descriptions-item label="最大会话数">{{ instance?.maxSessions }}</n-descriptions-item>
              <n-descriptions-item label="最大Manager数">{{ instance?.maxManagers }}</n-descriptions-item>
              <n-descriptions-item label="创建时间">
                {{ formatDate(instance?.createdAt) }}
              </n-descriptions-item>
              <n-descriptions-item label="更新时间">
                {{ formatDate(instance?.updatedAt) }}
              </n-descriptions-item>
            </n-descriptions>
          </n-card>

          <!-- API Key -->
          <n-card title="API 密钥" class="mb-4">
            <template #header-extra>
              <n-button size="small" secondary @click="regenerateKey">
                重新生成
              </n-button>
            </template>
            <div class="api-key-box">
              <code class="flex-1">{{ showApiKey ? instance?.apiKey : maskApiKey(instance?.apiKey) }}</code>
              <n-space class="ml-3">
                <n-button text size="small" @click="showApiKey = !showApiKey">
                  <template #icon>
                    <n-icon>
                      <i v-if="!showApiKey" class="i-carbon-view" />
                      <i v-else class="i-carbon-view-off" />
                    </n-icon>
                  </template>
                </n-button>
                <n-button text size="small" @click="copyApiKey">
                  <template #icon>
                    <n-icon><i class="i-carbon-copy" /></n-icon>
                  </template>
                </n-button>
              </n-space>
            </div>
          </n-card>

          <!-- MT5 Servers -->
          <n-card title="MT5 服务器配置">
            <n-data-table
              :columns="mt5Columns"
              :data="instance?.mt5Servers || []"
              :pagination="false"
            />
            <n-empty v-if="!instance?.mt5Servers?.length" description="暂无MT5服务器配置" />
          </n-card>
        </n-gi>

        <!-- Health Data -->
        <n-gi :span="8">
          <n-card title="健康状态" class="mb-4">
            <div v-if="instance?.healthData" class="space-y-3">
              <div class="flex-between py-2 border-b border-base">
                <span class="text-secondary">运行时间</span>
                <span>{{ formatUptime(instance.healthData.uptime) }}</span>
              </div>
              <div class="flex-between py-2 border-b border-base">
                <span class="text-secondary">活跃会话</span>
                <span>{{ instance.healthData.activeSessions || 0 }}</span>
              </div>
              <div class="flex-between py-2 border-b border-base">
                <span class="text-secondary">总连接数</span>
                <span>{{ instance.healthData.totalConnections || 0 }}</span>
              </div>
              <div class="flex-between py-2">
                <span class="text-secondary">内存使用</span>
                <n-progress
                  type="line"
                  :percentage="getMemoryPercent(instance.healthData.memory)"
                  :show-indicator="true"
                  style="width: 120px"
                />
              </div>
            </div>
            <n-empty v-else description="暂无健康数据" />
          </n-card>

          <!-- Quick Actions -->
          <n-card title="快捷操作">
            <n-space vertical :size="12" class="w-full">
              <n-button block @click="viewTenant">
                <template #icon>
                  <n-icon><i class="i-carbon-user-multiple" /></n-icon>
                </template>
                查看所属租户
              </n-button>
              <n-button block type="error" @click="deleteInstance">
                <template #icon>
                  <n-icon><i class="i-carbon-trash-can" /></n-icon>
                </template>
                删除实例
              </n-button>
            </n-space>
          </n-card>
        </n-gi>
      </n-grid>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NCard,
  NButton,
  NIcon,
  NTag,
  NSpin,
  NGrid,
  NGi,
  NDescriptions,
  NDescriptionsItem,
  NDataTable,
  NSpace,
  NProgress,
  NEmpty,
  useMessage,
  useDialog,
  type DataTableColumns,
} from 'naive-ui'
import { api } from '@/api'
import dayjs from 'dayjs'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const instanceId = route.params.id as string

const loading = ref(false)
const instance = ref<any>(null)
const showApiKey = ref(false)

interface MT5Server {
  name: string
  host: string
  port: number
  isDefault: boolean
}

const mt5Columns: DataTableColumns<MT5Server> = [
  { title: '名称', key: 'name' },
  { title: '地址', key: 'host' },
  { title: '端口', key: 'port' },
  {
    title: '默认',
    key: 'isDefault',
    render: (row) => row.isDefault ? h(NTag, { type: 'success', size: 'small' }, () => '默认') : null,
  },
]

function getStatusText(status: string | undefined) {
  if (!status) return ''
  const texts: Record<string, string> = {
    ONLINE: '在线',
    OFFLINE: '离线',
    MAINTENANCE: '维护中',
    ERROR: '错误',
  }
  return texts[status] || status
}

function getStatusType(status: string | undefined): 'default' | 'info' | 'success' | 'warning' | 'error' {
  if (!status) return 'default'
  const types: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
    ONLINE: 'success',
    OFFLINE: 'warning',
    MAINTENANCE: 'info',
    ERROR: 'error',
  }
  return types[status] || 'default'
}

function formatDate(date: string | undefined) {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

function formatUptime(seconds: number | undefined) {
  if (!seconds) return '-'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${days}天 ${hours}小时 ${mins}分`
}

function maskApiKey(key: string | undefined) {
  if (!key) return ''
  return key.substring(0, 8) + '••••••••' + key.substring(key.length - 4)
}

function getMemoryPercent(memory: { used: number; total: number } | undefined) {
  if (!memory || !memory.total) return 0
  return Math.round((memory.used / memory.total) * 100)
}

async function loadInstance() {
  loading.value = true
  try {
    instance.value = await api.instances.get(instanceId)
  } catch {
    message.error('加载实例信息失败')
  } finally {
    loading.value = false
  }
}

async function checkHealth() {
  const loadingMessage = message.loading('正在检查...', { duration: 0 })
  try {
    await api.instances.healthCheck(instanceId)
    loadingMessage.destroy()
    message.success('健康检查完成')
    loadInstance()
  } catch {
    loadingMessage.destroy()
    message.error('健康检查失败')
  }
}

async function regenerateKey() {
  dialog.warning({
    title: '确认重新生成密钥',
    content: '重新生成密钥后，需要更新实例配置。确定要继续吗？',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const result = await api.instances.regenerateKey(instanceId) as any
        instance.value.apiKey = result.apiKey
        message.success('密钥已更新')
      } catch {
        message.error('生成失败')
      }
    },
  })
}

function copyApiKey() {
  if (instance.value?.apiKey) {
    navigator.clipboard.writeText(instance.value.apiKey)
    message.success('已复制到剪贴板')
  }
}

function viewTenant() {
  if (instance.value?.tenant?.id) {
    router.push(`/tenants/${instance.value.tenant.id}`)
  }
}

function deleteInstance() {
  dialog.error({
    title: '确认删除',
    content: `确定要删除实例 "${instance.value?.name}" 吗？此操作不可恢复！`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.instances.delete(instanceId)
        message.success('删除成功')
        router.push('/instances')
      } catch {
        message.error('删除失败')
      }
    },
  })
}

onMounted(() => {
  loadInstance()
})
</script>

<style scoped>
.api-key-box {
  display: flex;
  align-items: center;
  padding: 12px;
  background: var(--body-color);
  border-radius: 4px;
}

.api-key-box code {
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 14px;
}
</style>
