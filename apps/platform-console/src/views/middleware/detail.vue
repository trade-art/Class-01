<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <div class="flex items-center gap-4">
        <n-button quaternary circle @click="router.back()">
          <template #icon>
            <n-icon><i class="i-carbon-arrow-left" /></n-icon>
          </template>
        </n-button>
        <h1 class="page-title">{{ middleware?.name || '中间件详情' }}</h1>
        <n-tag v-if="middleware" :type="getStatusType(middleware.status)" size="small">
          {{ getStatusText(middleware.status) }}
        </n-tag>
      </div>
      <n-space align="center">
        <n-switch v-model:value="autoRefreshEnabled" size="small">
          <template #checked>自动刷新</template>
          <template #unchecked>自动刷新</template>
        </n-switch>
        <n-button @click="refreshHealth">
          <template #icon>
            <n-icon><i class="i-carbon-renew" /></n-icon>
          </template>
          刷新状态
        </n-button>
        <n-button type="primary" @click="testConnection">
          <template #icon>
            <n-icon><i class="i-carbon-connection-signal" /></n-icon>
          </template>
          测试连接
        </n-button>
        <n-button @click="router.push(`/middleware/${middlewareId}/config`)">
          <template #icon>
            <n-icon><i class="i-carbon-settings" /></n-icon>
          </template>
          运行时配置
        </n-button>
      </n-space>
    </div>

    <n-spin :show="loading">
      <n-grid :cols="24" :x-gap="16" :y-gap="16">
        <!-- Basic Info -->
        <n-gi :span="16">
          <n-card title="基本信息">
            <n-descriptions :column="2" label-placement="left">
              <n-descriptions-item label="名称">{{ middleware?.name }}</n-descriptions-item>
              <n-descriptions-item label="平台类型">
                <n-tag :type="middleware?.platformType === 'MT5' ? 'info' : 'warning'" size="small">
                  {{ middleware?.platformType || 'MT5' }}
                </n-tag>
              </n-descriptions-item>
              <n-descriptions-item label="URL">{{ middleware?.url }}</n-descriptions-item>
              <n-descriptions-item label="分配模式">
                <n-tag :type="middleware?.assignmentMode === 'DEDICATED' ? 'warning' : 'info'" size="small">
                  {{ middleware?.assignmentMode === 'DEDICATED' ? '专用' : '共享' }}
                </n-tag>
              </n-descriptions-item>
              <n-descriptions-item label="当前租户数">{{ middleware?.assignedTenantCount ?? 0 }}</n-descriptions-item>
              <n-descriptions-item label="描述" :span="2">{{ middleware?.description || '-' }}</n-descriptions-item>
              <n-descriptions-item label="创建时间">{{ formatDate(middleware?.createdAt) }}</n-descriptions-item>
              <n-descriptions-item label="更新时间">{{ formatDate(middleware?.updatedAt) }}</n-descriptions-item>
            </n-descriptions>
          </n-card>
        </n-gi>

        <!-- Health Status -->
        <n-gi :span="8">
          <n-card title="健康状态">
            <n-descriptions :column="1" label-placement="left">
              <n-descriptions-item label="状态">
                <n-tag :type="getStatusType(middleware?.status || 'UNKNOWN')" size="small">
                  {{ getStatusText(middleware?.status || 'UNKNOWN') }}
                </n-tag>
              </n-descriptions-item>
              <n-descriptions-item label="服务器 IP">{{ middleware?.serverIp || '-' }}</n-descriptions-item>
              <n-descriptions-item label="活跃会话">{{ middleware?.activeSessions ?? '-' }}</n-descriptions-item>
              <n-descriptions-item label="内存 (进程)">
                {{ middleware?.processMemory != null ? `${middleware.processMemory.toFixed(1)}MB` : '-' }}
              </n-descriptions-item>
              <n-descriptions-item label="内存 (系统)">
                {{ formatMemoryUsage(middleware) }}
              </n-descriptions-item>
              <n-descriptions-item label="CPU (进程)">
                {{ middleware?.processCpuUsage != null ? `${middleware.processCpuUsage.toFixed(1)}%` : '-' }}
              </n-descriptions-item>
              <n-descriptions-item label="CPU (系统)">
                {{ middleware?.cpuUsage != null ? `${middleware.cpuUsage.toFixed(1)}%` : '-' }}
              </n-descriptions-item>
              <n-descriptions-item label="硬盘使用">
                {{ formatDiskUsage(middleware) }}
              </n-descriptions-item>
              <n-descriptions-item label="缓存命中率">
                {{ middleware?.cacheHitRate != null ? `${middleware.cacheHitRate}%` : '-' }}
              </n-descriptions-item>
              <n-descriptions-item label="最后心跳">
                {{ middleware?.lastHeartbeat ? formatDate(middleware.lastHeartbeat) : '-' }}
              </n-descriptions-item>
            </n-descriptions>
          </n-card>
        </n-gi>

        <!-- API Key -->
        <n-gi :span="24">
          <n-card title="API Key">
            <template #header-extra>
              <n-button size="small" @click="regenerateApiKey">
                <template #icon>
                  <n-icon><i class="i-carbon-renew" /></n-icon>
                </template>
                重新生成
              </n-button>
            </template>
            <n-alert type="info" class="mb-4">
              API Key 用于中间件与平台服务之间的认证。如果需要重新生成，请点击"重新生成"按钮。
            </n-alert>
            <p class="text-secondary">API Key 已加密存储，如需查看请重新生成。</p>
          </n-card>
        </n-gi>

        <!-- Assigned Tenants -->
        <n-gi :span="24">
          <n-card title="已分配租户">
            <template #header-extra>
              <n-button
                type="primary"
                size="small"
                :disabled="!canAssignMore"
                @click="showAssignModal = true"
              >
                <template #icon>
                  <n-icon><i class="i-carbon-add" /></n-icon>
                </template>
                分配租户
              </n-button>
            </template>
            <n-data-table
              :columns="assignmentColumns"
              :data="assignments"
              :loading="assignmentsLoading"
              :row-key="(row: Assignment) => row.id"
            />
          </n-card>
        </n-gi>
      </n-grid>
    </n-spin>

    <!-- Assign Tenant Modal -->
    <n-modal
      v-model:show="showAssignModal"
      preset="dialog"
      title="分配租户"
      :style="{ width: '500px' }"
    >
      <n-form label-placement="top">
        <n-form-item label="选择租户">
          <n-select
            v-model:value="selectedTenantId"
            placeholder="请选择租户"
            :options="availableTenants"
            :loading="tenantsLoading"
            filterable
          />
        </n-form-item>
        <n-form-item label="备注">
          <n-input v-model:value="assignNotes" type="textarea" placeholder="可选备注" />
        </n-form-item>
      </n-form>

      <template #action>
        <n-button @click="showAssignModal = false">取消</n-button>
        <n-button type="primary" :loading="assigning" :disabled="!selectedTenantId" @click="handleAssign">
          分配
        </n-button>
      </template>
    </n-modal>

    <!-- New API Key Modal -->
    <n-modal
      v-model:show="showNewApiKeyModal"
      preset="dialog"
      title="新 API Key"
      :style="{ width: '500px' }"
      :closable="false"
      :mask-closable="false"
    >
      <n-alert type="warning" class="mb-4">
        <template #header>请立即保存此 API Key</template>
        此密钥仅显示一次，关闭后将无法再次查看。
      </n-alert>

      <n-input :value="newApiKey" type="textarea" readonly :autosize="{ minRows: 2 }" />

      <template #action>
        <n-button @click="copyApiKey">
          <template #icon>
            <n-icon><i class="i-carbon-copy" /></n-icon>
          </template>
          复制密钥
        </n-button>
        <n-button type="primary" @click="closeNewApiKeyModal">
          我已保存密钥
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NCard,
  NButton,
  NIcon,
  NSpace,
  NTag,
  NDescriptions,
  NDescriptionsItem,
  NDataTable,
  NGrid,
  NGi,
  NModal,
  NForm,
  NFormItem,
  NSelect,
  NInput,
  NAlert,
  NSpin,
  NSwitch,
  useMessage,
  useDialog,
  type DataTableColumns,
} from 'naive-ui'
import { middlewareApi, type Middleware } from '@/api/middleware'
import { middlewareAssignmentApi, type MiddlewareAssignment } from '@/api/middleware-assignment'
import { api } from '@/api'
import dayjs from 'dayjs'

interface Assignment extends MiddlewareAssignment {}

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()

const middlewareId = route.params.id as string

const loading = ref(false)
const middleware = ref<Middleware | null>(null)
const assignments = ref<Assignment[]>([])
const assignmentsLoading = ref(false)
const showAssignModal = ref(false)
const showNewApiKeyModal = ref(false)
const newApiKey = ref('')
const selectedTenantId = ref<string | null>(null)
const assignNotes = ref('')
const assigning = ref(false)
const availableTenants = ref<{ label: string; value: string }[]>([])
const tenantsLoading = ref(false)

// 自动刷新
const autoRefreshEnabled = ref(true)
const autoRefreshInterval = 10000 // 10秒
let refreshTimer: ReturnType<typeof setInterval> | null = null

const canAssignMore = computed(() => {
  if (!middleware.value) return false
  if (middleware.value.assignmentMode === 'DEDICATED') {
    return assignments.value.length === 0
  }
  return assignments.value.length < middleware.value.maxTenants
})

const assignmentColumns: DataTableColumns<Assignment> = [
  {
    title: '租户名称',
    key: 'tenant.name',
    render: (row) => row.tenant?.name || '-',
  },
  {
    title: '租户代码',
    key: 'tenant.code',
    render: (row) => row.tenant?.code || '-',
  },
  {
    title: '分配时间',
    key: 'assignedAt',
    render: (row) => formatDate(row.assignedAt),
  },
  {
    title: '备注',
    key: 'notes',
    render: (row) => row.notes || '-',
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    render: (row) => h('div', { class: 'flex gap-2' }, [
      h(NButton, {
        text: true,
        type: 'primary',
        size: 'small',
        onClick: () => router.push(`/tenants/${row.tenantId}`),
      }, () => '查看租户'),
      h(NButton, {
        text: true,
        type: 'error',
        size: 'small',
        onClick: () => unassignTenant(row),
      }, () => '取消分配'),
    ]),
  },
]

function getStatusType(status: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  const types: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
    ONLINE: 'success',
    OFFLINE: 'error',
    DEGRADED: 'warning',
    UNKNOWN: 'default',
  }
  return types[status] || 'default'
}

function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    ONLINE: '在线',
    OFFLINE: '离线',
    DEGRADED: '降级',
    UNKNOWN: '未知',
  }
  return texts[status] || status
}

function formatDate(date?: string): string {
  return date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-'
}

function formatMemoryUsage(mw: Middleware | null): string {
  if (!mw) return '-'
  const memUsed = mw.memoryUsage
  const memTotal = mw.memoryTotal
  const memPercent = mw.memoryUsagePercent
  if (memUsed != null) {
    const usedGB = (memUsed / 1024).toFixed(1)
    const totalGB = memTotal ? (memTotal / 1024).toFixed(0) : null
    const percent = memPercent != null ? memPercent.toFixed(0) : null
    if (totalGB && percent) {
      return `${usedGB}/${totalGB}G (${percent}%)`
    }
    return `${memUsed.toFixed(0)}MB`
  }
  return '-'
}

function formatDiskUsage(mw: Middleware | null): string {
  if (!mw) return '-'
  const disk = mw.diskUsage
  const diskPercent = mw.diskUsagePercent
  const diskTotal = mw.diskTotal
  if (disk != null) {
    if (diskTotal != null && diskPercent != null) {
      return `${disk.toFixed(0)}/${diskTotal.toFixed(0)}G (${diskPercent.toFixed(0)}%)`
    }
    return `${disk.toFixed(1)}GB`
  }
  return '-'
}

async function loadMiddleware() {
  loading.value = true
  try {
    middleware.value = await middlewareApi.get(middlewareId)
  } catch (error) {
    message.error('加载中间件信息失败')
  } finally {
    loading.value = false
  }
}

async function loadAssignments() {
  assignmentsLoading.value = true
  try {
    assignments.value = await middlewareAssignmentApi.getByMiddleware(middlewareId)
  } catch (error) {
    message.error('加载分配列表失败')
  } finally {
    assignmentsLoading.value = false
  }
}

async function loadAvailableTenants() {
  tenantsLoading.value = true
  try {
    const result = await api.tenants.list({ limit: 1000, status: 'ACTIVE' }) as any
    const assignedTenantIds = new Set(assignments.value.map(a => a.tenantId))
    availableTenants.value = result.data
      .filter((t: any) => !assignedTenantIds.has(t.id))
      .map((t: any) => ({ label: `${t.name} (${t.code})`, value: t.id }))
  } catch {
    message.error('加载租户列表失败')
  } finally {
    tenantsLoading.value = false
  }
}

async function refreshHealth() {
  try {
    const health = await middlewareApi.getHealth(middlewareId)
    if (middleware.value) {
      middleware.value = { ...middleware.value, ...health }
    }
    message.success('状态已刷新')
  } catch {
    message.error('刷新状态失败')
  }
}

async function testConnection() {
  try {
    const result = await middlewareApi.testConnection(middlewareId)
    if (result.success) {
      message.success(`连接成功，延迟: ${result.latency}ms`)
    } else {
      message.warning(result.message)
    }
  } catch {
    message.error('连接测试失败')
  }
}

function regenerateApiKey() {
  dialog.warning({
    title: '确认重新生成',
    content: '重新生成 API Key 后，中间件需要更新配置才能继续连接。确定要继续吗？',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const result = await middlewareApi.regenerateRegistrationSecret(middlewareId)
        newApiKey.value = result.registrationSecret
        showNewApiKeyModal.value = true
        message.success('API Key 已重新生成')
      } catch {
        message.error('重新生成失败')
      }
    },
  })
}

function copyApiKey() {
  navigator.clipboard.writeText(newApiKey.value)
  message.success('已复制到剪贴板')
}

function closeNewApiKeyModal() {
  showNewApiKeyModal.value = false
  newApiKey.value = ''
}

async function handleAssign() {
  if (!selectedTenantId.value) return

  assigning.value = true
  try {
    await middlewareAssignmentApi.assign(middlewareId, {
      tenantId: selectedTenantId.value,
      notes: assignNotes.value || undefined,
    })
    message.success('分配成功')
    showAssignModal.value = false
    selectedTenantId.value = null
    assignNotes.value = ''
    loadAssignments()
  } catch (error: any) {
    message.error(error.message || '分配失败')
  } finally {
    assigning.value = false
  }
}

function unassignTenant(assignment: Assignment) {
  dialog.warning({
    title: '确认取消分配',
    content: `确定要取消租户 "${assignment.tenant?.name}" 的分配吗？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await middlewareAssignmentApi.unassign(middlewareId, assignment.tenantId)
        message.success('已取消分配')
        loadAssignments()
      } catch {
        message.error('取消分配失败')
      }
    },
  })
}

// 静默刷新健康数据（不显示 loading）
async function silentRefreshHealth() {
  try {
    const health = await middlewareApi.getHealth(middlewareId)
    if (middleware.value) {
      middleware.value = { ...middleware.value, ...health }
    }
  } catch {
    // 静默失败，不显示错误提示
  }
}

// 启动自动刷新
function startAutoRefresh() {
  if (refreshTimer) return
  refreshTimer = setInterval(() => {
    if (autoRefreshEnabled.value) {
      silentRefreshHealth()
    }
  }, autoRefreshInterval)
}

// 停止自动刷新
function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

onMounted(() => {
  loadMiddleware()
  loadAssignments()
  loadAvailableTenants()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>
