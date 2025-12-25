<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">中间件管理</h1>
      <n-button type="primary" @click="showCreateModal = true">
        <template #icon>
          <n-icon><i class="i-carbon-add" /></n-icon>
        </template>
        新建中间件
      </n-button>
    </div>

    <!-- Search & Filter -->
    <n-card class="mb-4">
      <n-space>
        <n-input
          v-model:value="searchQuery"
          placeholder="搜索中间件名称/URL"
          style="width: 300px"
          clearable
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <n-icon><i class="i-carbon-search" /></n-icon>
          </template>
        </n-input>
        <n-select
          v-model:value="statusFilter"
          placeholder="状态筛选"
          style="width: 150px"
          clearable
          :options="statusOptions"
          @update:value="handleSearch"
        />
        <n-button @click="handleSearch">搜索</n-button>
      </n-space>
    </n-card>

    <!-- Table -->
    <n-card>
      <n-data-table
        :columns="columns"
        :data="middlewares"
        :loading="loading"
        :pagination="pagination"
        :row-key="(row: Middleware) => row.id"
        @update:page="handlePageChange"
      />
    </n-card>

    <!-- Create/Edit Modal -->
    <n-modal
      v-model:show="showCreateModal"
      preset="dialog"
      :title="editingMiddleware ? '编辑中间件' : '新建中间件'"
      :style="{ width: '600px' }"
      :mask-closable="false"
    >
      <n-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-placement="top"
      >
        <n-form-item path="name" label="中间件名称">
          <n-input v-model:value="form.name" placeholder="请输入中间件名称，如 mw-prod-001" />
        </n-form-item>

        <n-form-item path="platformType" label="平台类型">
          <n-select v-model:value="form.platformType" :options="platformTypeOptions" />
        </n-form-item>

        <n-form-item path="description" label="描述">
          <n-input
            v-model:value="form.description"
            type="textarea"
            placeholder="请输入描述"
            :maxlength="500"
          />
        </n-form-item>

        <template v-if="editingMiddleware">
          <n-form-item path="url" label="中间件地址">
            <n-input v-model:value="form.url" placeholder="http://localhost:8080" />
          </n-form-item>

          <n-form-item path="serverIp" label="服务器 IP">
            <n-input v-model:value="form.serverIp" placeholder="请输入服务器 IP" />
          </n-form-item>
        </template>

        <n-alert v-else type="info" class="mt-2">
          创建后将生成唯一的注册密钥，用于中间件启动。URL 和 IP 将在中间件注册时自动填充。
        </n-alert>
      </n-form>

      <template #action>
        <n-button @click="resetForm">取消</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">
          {{ editingMiddleware ? '更新' : '创建' }}
        </n-button>
      </template>
    </n-modal>

    <!-- Registration Secret Modal (shown after creation) -->
    <n-modal
      v-model:show="showApiKeyModal"
      preset="dialog"
      title="中间件创建成功"
      :style="{ width: '650px' }"
      :closable="false"
      :mask-closable="false"
    >
      <n-alert type="warning" class="mb-4">
        <template #header>请立即保存注册密钥</template>
        此密钥仅显示一次，关闭后将无法再次查看。中间件启动时需要使用此密钥。
      </n-alert>

      <div class="mb-4">
        <div class="text-sm text-gray-500 mb-2">注册密钥 (Registration Secret)</div>
        <n-input
          :value="newRegistrationSecret"
          readonly
          @click="copyRegistrationSecret"
        >
          <template #suffix>
            <n-button text type="primary" @click="copyRegistrationSecret">
              <n-icon><i class="i-carbon-copy" /></n-icon>
            </n-button>
          </template>
        </n-input>
      </div>

      <div class="mb-4">
        <div class="text-sm text-gray-500 mb-2">启动命令</div>
        <n-input
          :value="startupCommand"
          type="textarea"
          readonly
          :autosize="{ minRows: 2, maxRows: 4 }"
          @click="copyStartupCommand"
        />
      </div>

      <n-alert type="info" class="mb-2">
        <template #header>Docker 环境变量</template>
        <code class="text-xs">REGISTRATION_SECRET={{ newRegistrationSecret }}</code>
      </n-alert>

      <template #action>
        <n-button @click="copyStartupCommand">
          <template #icon>
            <n-icon><i class="i-carbon-copy" /></n-icon>
          </template>
          复制启动命令
        </n-button>
        <n-button type="primary" @click="closeApiKeyModal">
          我已保存密钥
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, h, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard,
  NButton,
  NIcon,
  NSpace,
  NInput,
  NSelect,
  NDataTable,
  NModal,
  NForm,
  NFormItem,
  NTag,
  NAlert,
  useMessage,
  useDialog,
  type DataTableColumns,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { middlewareApi, type Middleware, type PlatformType } from '@/api/middleware'
import dayjs from 'dayjs'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()

const loading = ref(false)
const saving = ref(false)
const middlewares = ref<Middleware[]>([])
const searchQuery = ref('')
const statusFilter = ref<string | null>(null)
const showCreateModal = ref(false)
const showApiKeyModal = ref(false)
const newRegistrationSecret = ref('')
const editingMiddleware = ref<Middleware | null>(null)
const formRef = ref<FormInst | null>(null)

// 计算启动命令
const startupCommand = computed(() => {
  if (!newRegistrationSecret.value) return ''
  return `./MT5Middleware.exe --secret=${newRegistrationSecret.value}`
})

// 自动刷新
const autoRefreshInterval = 10000 // 10秒
let refreshTimer: ReturnType<typeof setInterval> | null = null

const pagination = reactive({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
})

const form = reactive({
  name: '',
  url: '',
  serverIp: '',
  platformType: 'MT5' as PlatformType,
  description: '',
})

const statusOptions = [
  { label: '在线', value: 'ONLINE' },
  { label: '离线', value: 'OFFLINE' },
  { label: '降级', value: 'DEGRADED' },
  { label: '未知', value: 'UNKNOWN' },
]

const platformTypeOptions = [
  { label: 'MT5', value: 'MT5' },
  { label: 'MT4', value: 'MT4' },
]

const rules: FormRules = {
  name: [{ required: true, message: '请输入中间件名称', trigger: 'blur' }],
  url: [
    { pattern: /^https?:\/\/.+/, message: '请输入有效的 URL', trigger: 'blur' },
  ],
}

const columns: DataTableColumns<Middleware> = [
  { title: '服务器IP', key: 'serverIp', width: 100, render: (row) => row.serverIp || '-' },
  { title: 'URL', key: 'url', width: 200, ellipsis: { tooltip: true } },
  {
    title: '类型',
    key: 'platformType',
    width: 80,
    render: (row) => h(NTag, {
      type: row.platformType === 'MT5' ? 'info' : 'warning',
      size: 'small',
    }, () => row.platformType || 'MT5'),
  },
  {
    title: '名称',
    key: 'name',
    width: 140,
    render: (row) => h('a', {
      class: 'text-primary cursor-pointer',
      onClick: () => viewMiddleware(row.id),
    }, row.name),
  },
  {
    title: 'CPU (进程/系统)',
    key: 'cpuUsage',
    width: 120,
    render: (row) => {
      const sysCpu = row.cpuUsage
      const procCpu = row.processCpuUsage
      const sysStr = sysCpu !== undefined && sysCpu !== null ? `${sysCpu.toFixed(1)}%` : '-'
      const procStr = procCpu !== undefined && procCpu !== null ? `${procCpu.toFixed(1)}%` : '-'
      return `${procStr} / ${sysStr}`
    },
  },
  {
    title: '内存 (进程/系统)',
    key: 'memoryUsage',
    width: 180,
    render: (row) => {
      const procMem = row.processMemory
      const sysMem = row.memoryUsage
      const memTotal = row.memoryTotal
      const memPercent = row.memoryUsagePercent
      const procStr = procMem !== undefined && procMem !== null ? `${procMem.toFixed(0)}M` : '-'
      let sysStr = '-'
      if (sysMem !== undefined && sysMem !== null) {
        const usedGB = (sysMem / 1024).toFixed(1)
        const totalGB = memTotal ? (memTotal / 1024).toFixed(0) : null
        const percent = memPercent !== undefined && memPercent !== null ? memPercent.toFixed(0) : null
        if (totalGB && percent) {
          sysStr = `${usedGB}/${totalGB}G`
        } else {
          sysStr = `${sysMem.toFixed(0)}M`
        }
      }
      return `${procStr} / ${sysStr}`
    },
  },
  {
    title: '硬盘(已用/总量)',
    key: 'diskUsage',
    width: 150,
    render: (row) => {
      const disk = row.diskUsage
      const diskPercent = row.diskUsagePercent
      if (disk !== undefined && disk !== null) {
        return diskPercent !== undefined && diskPercent !== null ? `${disk.toFixed(0)}/${row.diskTotal?.toFixed(0) || '?'}G (${diskPercent.toFixed(0)}%)` : `${disk.toFixed(1)}GB`
      }
      return '-'
    },
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (row) => h(NTag, {
      type: getStatusType(row.status),
      size: 'small',
    }, () => getStatusText(row.status)),
  },
  {
    title: '最后心跳',
    key: 'lastHeartbeat',
    width: 160,
    render: (row) => row.lastHeartbeat ? formatDate(row.lastHeartbeat) : '-',
  },
  {
    title: '操作',
    key: 'actions',
    width: 200,
    render: (row) => h(NSpace, null, () => [
      h(NButton, { text: true, type: 'primary', size: 'small', onClick: () => viewMiddleware(row.id) }, () => '详情'),
      h(NButton, { text: true, size: 'small', onClick: () => testConnection(row) }, () => '测试'),
      h(NButton, { text: true, size: 'small', onClick: () => editMiddleware(row) }, () => '编辑'),
      h(NButton, { text: true, type: 'error', size: 'small', onClick: () => deleteMiddleware(row) }, () => '删除'),
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

function formatDate(date: string): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

async function loadMiddlewares() {
  loading.value = true
  try {
    const result = await middlewareApi.list({
      status: statusFilter.value || undefined,
    })
    // Backend returns array directly (after interceptor extracts from { success, data })
    middlewares.value = result
    pagination.itemCount = result.length
  } catch (error) {
    message.error('加载中间件列表失败')
  } finally {
    loading.value = false
  }
}

// 静默刷新（不显示 loading，不显示错误）
async function silentRefresh() {
  try {
    const result = await middlewareApi.list({
      status: statusFilter.value || undefined,
    })
    middlewares.value = result
    pagination.itemCount = result.length
  } catch {
    // 静默失败，不显示错误提示
  }
}

function startAutoRefresh() {
  if (refreshTimer) return
  refreshTimer = setInterval(silentRefresh, autoRefreshInterval)
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

function handleSearch() {
  pagination.page = 1
  loadMiddlewares()
}

function handlePageChange(page: number) {
  pagination.page = page
  loadMiddlewares()
}

function viewMiddleware(id: string) {
  router.push(`/middleware/${id}`)
}

function editMiddleware(middleware: Middleware) {
  editingMiddleware.value = middleware
  Object.assign(form, {
    name: middleware.name,
    url: middleware.url,
    serverIp: middleware.serverIp || '',
    platformType: middleware.platformType || 'MT5',
    description: middleware.description || '',
  })
  showCreateModal.value = true
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    if (editingMiddleware.value) {
      await middlewareApi.update(editingMiddleware.value.id, form)
      message.success('更新成功')
      showCreateModal.value = false
      resetForm()
      loadMiddlewares()
    } else {
      const result = await middlewareApi.create(form)
      message.success('创建成功')
      showCreateModal.value = false
      // 显示注册密钥
      newRegistrationSecret.value = result.registrationSecret
      showApiKeyModal.value = true
      resetForm()
      loadMiddlewares()
    }
  } catch (error: any) {
    message.error(error.message || '操作失败')
  } finally {
    saving.value = false
  }
}

function resetForm() {
  showCreateModal.value = false
  editingMiddleware.value = null
  Object.assign(form, {
    name: '',
    url: '',
    serverIp: '',
    platformType: 'MT5' as PlatformType,
    description: '',
  })
}

async function testConnection(middleware: Middleware) {
  try {
    const result = await middlewareApi.testConnection(middleware.id)
    if (result.success) {
      message.success(`连接成功，延迟: ${result.latency}ms`)
    } else {
      message.warning(result.message)
    }
  } catch {
    message.error('连接测试失败')
  }
}

function deleteMiddleware(middleware: Middleware) {
  const tenantCount = middleware.assignedTenantCount || 0
  if (tenantCount > 0) {
    message.warning(`该中间件还有 ${tenantCount} 个租户分配，请先取消分配`)
    return
  }

  dialog.error({
    title: '确认删除',
    content: `确定要删除中间件 "${middleware.name}" 吗？此操作不可恢复！`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await middlewareApi.delete(middleware.id)
        message.success('删除成功')
        loadMiddlewares()
      } catch {
        message.error('删除失败')
      }
    },
  })
}

function copyRegistrationSecret() {
  navigator.clipboard.writeText(newRegistrationSecret.value)
  message.success('注册密钥已复制到剪贴板')
}

function copyStartupCommand() {
  navigator.clipboard.writeText(startupCommand.value)
  message.success('启动命令已复制到剪贴板')
}

function closeApiKeyModal() {
  showApiKeyModal.value = false
  newRegistrationSecret.value = ''
}

onMounted(() => {
  loadMiddlewares()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>
