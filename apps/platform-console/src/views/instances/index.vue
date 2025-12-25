<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">实例管理</h1>
    </div>

    <!-- Search & Filter -->
    <n-card class="mb-4">
      <n-space>
        <n-input
          v-model:value="searchQuery"
          placeholder="搜索实例名称/地址"
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
        :data="instances"
        :loading="loading"
        :pagination="pagination"
        :row-key="(row: Instance) => row.id"
        @update:page="handlePageChange"
      />
    </n-card>

    <!-- Edit Modal -->
    <n-modal
      v-model:show="showEditModal"
      preset="dialog"
      title="编辑实例"
      :style="{ width: '500px' }"
      :mask-closable="false"
    >
      <n-form
        ref="formRef"
        :model="editForm"
        :rules="rules"
        label-placement="top"
      >
        <n-form-item path="name" label="实例名称">
          <n-input v-model:value="editForm.name" placeholder="请输入实例名称" />
        </n-form-item>

        <n-form-item path="host" label="主机地址">
          <n-input v-model:value="editForm.host" placeholder="请输入主机地址，如 host.docker.internal" />
        </n-form-item>

        <n-form-item path="port" label="端口">
          <n-input-number v-model:value="editForm.port" :min="1" :max="65535" style="width: 100%" />
        </n-form-item>

        <n-form-item path="serverIp" label="服务器IP">
          <n-input v-model:value="editForm.serverIp" placeholder="请输入MT服务器IP地址，如 192.168.1.100" />
        </n-form-item>

        <n-form-item path="description" label="描述">
          <n-input
            v-model:value="editForm.description"
            type="textarea"
            placeholder="请输入描述"
            :maxlength="500"
          />
        </n-form-item>
      </n-form>

      <template #action>
        <n-button @click="showEditModal = false">取消</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">
          保存
        </n-button>
      </template>
    </n-modal>

    <!-- New API Key Modal -->
    <n-modal
      v-model:show="showKeyModal"
      preset="dialog"
      title="新密钥"
      :style="{ width: '500px' }"
    >
      <n-alert type="warning" class="mb-4">
        请立即保存此密钥，关闭后将无法再次查看
      </n-alert>
      <n-input
        :value="newApiKey"
        readonly
        type="textarea"
        :autosize="{ minRows: 2 }"
      />
      <template #action>
        <n-button type="primary" @click="copyKey">
          <template #icon>
            <n-icon><i class="i-carbon-copy" /></n-icon>
          </template>
          复制密钥
        </n-button>
        <n-button @click="showKeyModal = false">关闭</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, h, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard,
  NButton,
  NIcon,
  NSpace,
  NInput,
  NInputNumber,
  NSelect,
  NDataTable,
  NTag,
  NDropdown,
  NModal,
  NAlert,
  NForm,
  NFormItem,
  useMessage,
  useDialog,
  type DataTableColumns,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { api } from '@/api'
import dayjs from 'dayjs'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()

interface Instance {
  id: string
  name: string
  host: string
  port: number
  platformType?: string
  serverIp?: string
  status: string
  managerStatus?: string
  lastHealthCheck?: string
  tenant?: {
    id: string
    name: string
    code: string
  }
}

const loading = ref(false)
const saving = ref(false)
const instances = ref<Instance[]>([])
const searchQuery = ref('')
const statusFilter = ref<string | null>(null)
const showKeyModal = ref(false)
const showEditModal = ref(false)
const newApiKey = ref('')
const editingInstance = ref<Instance | null>(null)
const formRef = ref<FormInst | null>(null)

const editForm = reactive({
  name: '',
  host: '',
  port: 8083,
  serverIp: '',
  description: '',
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入实例名称', trigger: 'blur' }],
  host: [{ required: true, message: '请输入主机地址', trigger: 'blur' }],
  port: [{ required: true, type: 'number', message: '请输入端口', trigger: 'blur' }],
}

const pagination = reactive({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
})

const statusOptions = [
  { label: '在线', value: 'ONLINE' },
  { label: '离线', value: 'OFFLINE' },
  { label: '错误', value: 'ERROR' },
]

const columns: DataTableColumns<Instance> = [
  {
    title: '服务器IP',
    key: 'serverIp',
    width: 140,
    render: (row) => row.serverIp || '-',
  },
  {
    title: '地址',
    key: 'host',
    width: 230,
    render: (row) => `${row.host}:${row.port}`,
  },
  {
    title: '实例类型',
    key: 'platformType',
    width: 130,
    render: (row) => h(NTag, {
      type: row.platformType === 'MT5' ? 'info' : 'warning',
      size: 'small',
    }, () => row.platformType || 'MT5'),
  },
  {
    title: '实例名称',
    key: 'name',
    render: (row) => h('a', {
      class: 'text-primary cursor-pointer',
      onClick: () => viewInstance(row.id),
    }, row.name),
  },
  {
    title: '所属租户',
    key: 'tenant',
    render: (row) => h('div', null, [
      h('a', {
        class: 'text-primary cursor-pointer',
        onClick: () => viewTenant(row.tenant?.id),
      }, row.tenant?.name || '-'),
      h('div', {
        class: 'text-xs text-secondary',
      }, row.tenant?.code || ''),
    ]),
  },
  {
    title: () => h('span', { style: { display: 'inline-block', transform: 'translateX(-30px)' } }, '状态'),
    key: 'status',
    render: (row) => h('div', { style: { transform: 'translateX(-30px)' } }, [
      h(NTag, {
        type: getStatusType(row.status),
        size: 'small',
      }, () => getStatusText(row.status))
    ]),
  },
  {
    title: '连接',
    key: 'managerStatus',
    width: 100,
    render: (row) => {
      const status = row.managerStatus || 'NOT_CONFIGURED'
      return h(NTag, {
        type: getManagerStatusType(status),
        size: 'small',
      }, () => getManagerStatusText(status))
    },
  },
  {
    title: '最后健康检查',
    key: 'lastHealthCheck',
    render: (row) => row.lastHealthCheck ? formatDate(row.lastHealthCheck) : '-',
  },
  {
    title: '操作',
    key: 'actions',
    width: 260,
    render: (row) => h(NSpace, null, () => [
      h(NButton, {
        text: true,
        type: 'primary',
        size: 'small',
        onClick: () => checkHealth(row),
      }, () => '健康检查'),
      h(NButton, {
        text: true,
        type: 'primary',
        size: 'small',
        onClick: () => viewInstance(row.id),
      }, () => '详情'),
      h(NButton, {
        text: true,
        size: 'small',
        onClick: () => editInstance(row),
      }, () => '编辑'),
      h(NDropdown, {
        options: [
          { label: '重新生成密钥', key: 'regenerate' },
          { label: '删除', key: 'delete', props: { style: { color: 'var(--error-color)' } } },
        ],
        onSelect: (key: string) => handleAction(key, row),
      }, () => h(NButton, { text: true, size: 'small' }, () => '更多')),
    ]),
  },
]

function getStatusText(status: string) {
  const texts: Record<string, string> = {
    ONLINE: '在线',
    OFFLINE: '离线',
    MAINTENANCE: '维护中',
    ERROR: '错误',
    DEGRADED: '降级',
    SUSPENDED: '已暂停',
  }
  return texts[status] || status
}

function getStatusType(status: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  const types: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
    ONLINE: 'success',
    OFFLINE: 'warning',
    MAINTENANCE: 'info',
    ERROR: 'error',
    DEGRADED: 'warning',
    SUSPENDED: 'default',
  }
  return types[status] || 'default'
}

function getManagerStatusType(status: string): 'default' | 'success' | 'error' | 'warning' {
  const types: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
    CONNECTED: 'success',
    DISCONNECTED: 'error',
    NOT_CONFIGURED: 'warning',
  }
  return types[status] || 'default'
}

function getManagerStatusText(status: string): string {
  const texts: Record<string, string> = {
    CONNECTED: '已连接',
    DISCONNECTED: '未连接',
    NOT_CONFIGURED: '未设置',
  }
  return texts[status] || status
}

function formatDate(date: string) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

function handleAction(key: string, row: Instance) {
  switch (key) {
    case 'regenerate':
      regenerateKey(row)
      break
    case 'delete':
      deleteInstance(row)
      break
  }
}

async function loadInstances() {
  loading.value = true
  try {
    const result = await api.instances.list({
      page: pagination.page,
      limit: pagination.pageSize,
      search: searchQuery.value || undefined,
      status: statusFilter.value || undefined,
    }) as any
    instances.value = result.data
    pagination.itemCount = result.total
  } catch (error) {
    message.error('加载实例列表失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pagination.page = 1
  loadInstances()
}

function handlePageChange(page: number) {
  pagination.page = page
  loadInstances()
}

function viewInstance(id: string) {
  router.push(`/instances/${id}`)
}

function viewTenant(id: string | undefined) {
  if (id) {
    router.push(`/tenants/${id}`)
  }
}

function editInstance(instance: Instance) {
  editingInstance.value = instance
  Object.assign(editForm, {
    name: instance.name,
    host: instance.host,
    port: instance.port,
    serverIp: instance.serverIp || '',
    description: (instance as any).description || '',
  })
  showEditModal.value = true
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  if (!editingInstance.value) return

  saving.value = true
  try {
    await api.instances.update(editingInstance.value.id, editForm)
    message.success('更新成功')
    showEditModal.value = false
    editingInstance.value = null
    loadInstances()
  } catch (error: any) {
    message.error(error.message || '更新失败')
  } finally {
    saving.value = false
  }
}

async function checkHealth(instance: Instance) {
  const loadingMessage = message.loading('正在检查...', { duration: 0 })
  try {
    const result = await api.instances.healthCheck(instance.id) as any
    loadingMessage.destroy()
    if (result.status === 'online') {
      message.success('实例在线')
    } else if (result.status === 'degraded') {
      message.warning('实例降级运行（部分组件未就绪）')
    } else if (result.status === 'offline') {
      message.warning(`实例离线: ${result.message || '无法连接'}`)
    } else if (result.status === 'error') {
      message.error(`健康检查失败: ${result.message || '未知错误'}`)
    } else {
      message.info(`实例状态: ${result.status}`)
    }
    loadInstances()
  } catch {
    loadingMessage.destroy()
    message.error('健康检查失败')
  }
}

async function regenerateKey(instance: Instance) {
  dialog.warning({
    title: '确认重新生成密钥',
    content: '重新生成密钥后，需要更新实例配置。确定要继续吗？',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const result = await api.instances.regenerateKey(instance.id) as any
        newApiKey.value = result.apiKey
        showKeyModal.value = true
      } catch {
        message.error('生成失败')
      }
    },
  })
}

function copyKey() {
  navigator.clipboard.writeText(newApiKey.value)
  message.success('已复制到剪贴板')
}

function deleteInstance(instance: Instance) {
  // 检查实例状态，在线或降级状态时显示额外警告
  const isActive = ['ONLINE', 'DEGRADED'].includes(instance.status)
  const statusWarning = isActive
    ? `\n\n警告：该实例当前处于 ${getStatusText(instance.status)} 状态，删除可能影响正在使用的服务！`
    : ''

  dialog.error({
    title: isActive ? '危险操作' : '确认删除',
    content: `确定要删除实例 "${instance.name}" 吗？${statusWarning}\n\n此操作不可恢复！`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.instances.delete(instance.id)
        message.success('删除成功')
        loadInstances()
      } catch {
        message.error('删除失败')
      }
    },
  })
}

// 自动刷新
const autoRefreshInterval = 10000 // 10秒
let refreshTimer: ReturnType<typeof setInterval> | null = null

async function silentRefresh() {
  try {
    const result = await api.instances.list({
      page: pagination.page,
      limit: pagination.pageSize,
      search: searchQuery.value || undefined,
      status: statusFilter.value || undefined,
    }) as any
    instances.value = result.data
    pagination.itemCount = result.total
  } catch {
    // 静默失败
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

onMounted(() => {
  loadInstances()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>
