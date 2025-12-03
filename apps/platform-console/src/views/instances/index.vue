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
import { ref, reactive, h, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard,
  NButton,
  NIcon,
  NSpace,
  NInput,
  NSelect,
  NDataTable,
  NTag,
  NDropdown,
  NModal,
  NAlert,
  useMessage,
  useDialog,
  type DataTableColumns,
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
  status: string
  lastHealthCheck?: string
  tenant?: {
    id: string
    name: string
    code: string
  }
}

const loading = ref(false)
const instances = ref<Instance[]>([])
const searchQuery = ref('')
const statusFilter = ref<string | null>(null)
const showKeyModal = ref(false)
const newApiKey = ref('')

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
    title: '地址',
    key: 'host',
    render: (row) => `${row.host}:${row.port}`,
  },
  {
    title: '状态',
    key: 'status',
    render: (row) => h(NTag, {
      type: getStatusType(row.status),
      size: 'small',
    }, () => getStatusText(row.status)),
  },
  {
    title: '最后健康检查',
    key: 'lastHealthCheck',
    render: (row) => row.lastHealthCheck ? formatDate(row.lastHealthCheck) : '-',
  },
  {
    title: '操作',
    key: 'actions',
    width: 220,
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
  }
  return texts[status] || status
}

function getStatusType(status: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  const types: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
    ONLINE: 'success',
    OFFLINE: 'warning',
    MAINTENANCE: 'info',
    ERROR: 'error',
  }
  return types[status] || 'default'
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

async function checkHealth(instance: Instance) {
  const loadingMessage = message.loading('正在检查...', { duration: 0 })
  try {
    const result = await api.instances.healthCheck(instance.id) as any
    loadingMessage.destroy()
    if (result.status === 'offline') {
      message.warning(`实例离线: ${result.message}`)
    } else if (result.status === 'error') {
      message.error('健康检查失败')
    } else {
      message.success('实例在线')
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
  dialog.error({
    title: '确认删除',
    content: `确定要删除实例 "${instance.name}" 吗？此操作不可恢复！`,
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

onMounted(() => {
  loadInstances()
})
</script>
