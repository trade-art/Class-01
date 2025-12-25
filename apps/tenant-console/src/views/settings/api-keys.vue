<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('settings.apiKeys') }}</h1>
      <n-button type="primary" @click="handleCreate">
        <template #icon>
          <span class="i-carbon-add"></span>
        </template>
        {{ t('settings.createApiKey') }}
      </n-button>
    </div>

    <!-- API Keys Info -->
    <n-alert type="info" class="info-alert">
      {{ t('settings.apiKeysInfo') }}
    </n-alert>

    <!-- Search and Filter -->
    <n-card class="filter-card">
      <n-space>
        <n-input
          v-model:value="searchKeyword"
          :placeholder="t('settings.searchApiKey')"
          clearable
          style="width: 200px"
          @update:value="handleSearch"
        >
          <template #prefix>
            <span class="i-carbon-search"></span>
          </template>
        </n-input>
        <n-select
          v-model:value="filterStatus"
          :options="statusOptions"
          style="width: 120px"
          @update:value="handleFilter"
        />
      </n-space>
    </n-card>

    <!-- API Keys Table -->
    <n-card>
      <n-data-table
        remote
        :columns="columns"
        :data="apiKeys"
        :loading="loading"
        :pagination="pagination"
        :row-key="(row: ApiKeyListItem) => row.id"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </n-card>

    <!-- Create Modal -->
    <CreateApiKeyModal
      v-model:show="showCreateModal"
      @success="handleCreateSuccess"
    />

    <!-- Detail Modal -->
    <ApiKeyDetailModal
      v-model:show="showDetailModal"
      :api-key="selectedApiKey"
      @update="handleUpdate"
      @revoke="handleRevoke"
    />

    <!-- Show Key Modal (after create) -->
    <n-modal
      v-model:show="showKeyModal"
      :title="t('settings.apiKeyCreated')"
      preset="dialog"
      style="width: 600px"
    >
      <n-alert type="warning" class="key-alert">
        {{ t('settings.apiKeyWarning') }}
      </n-alert>

      <div class="key-display">
        <div class="key-label">{{ t('settings.apiKey') }}</div>
        <div class="key-value">
          <code>{{ newApiKey }}</code>
          <n-button text @click="copyKey">
            <template #icon>
              <span class="i-carbon-copy"></span>
            </template>
          </n-button>
        </div>
      </div>

      <template #action>
        <n-button type="primary" @click="showKeyModal = false">
          {{ t('settings.understood') }}
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NSpace,
  NAlert,
  NDataTable,
  NModal,
  NInput,
  NSelect,
  NTag,
  NDropdown,
  NTooltip,
  useMessage,
  useDialog,
  type DataTableColumns,
  type PaginationProps,
} from 'naive-ui'
import {
  apiKeysApi,
  formatScopes,
  getApiKeyStatus,
  statusConfig,
  type ApiKeyListItem,
} from '@/api/api-keys'
import CreateApiKeyModal from './components/CreateApiKeyModal.vue'
import ApiKeyDetailModal from './components/ApiKeyDetailModal.vue'

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()

// State
const loading = ref(false)
const apiKeys = ref<ApiKeyListItem[]>([])
const searchKeyword = ref('')
const filterStatus = ref<'active' | 'revoked' | 'expired' | 'all'>('active')
const showCreateModal = ref(false)
const showDetailModal = ref(false)
const showKeyModal = ref(false)
const newApiKey = ref('')
const selectedApiKey = ref<ApiKeyListItem | null>(null)

// Pagination
const pagination = reactive<PaginationProps>({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  prefix: ({ itemCount }) => `${t('common.total')} ${itemCount} ${t('common.items')}`,
})

// Status filter options
const statusOptions = computed(() => [
  { label: t('settings.statusActive'), value: 'active' },
  { label: t('settings.statusRevoked'), value: 'revoked' },
  { label: t('settings.statusExpired'), value: 'expired' },
  { label: t('settings.statusAll'), value: 'all' },
])

// Table columns
const columns: DataTableColumns<ApiKeyListItem> = [
  {
    title: () => t('settings.keyName'),
    key: 'name',
    width: 150,
    ellipsis: { tooltip: true },
  },
  {
    title: () => t('settings.keyPrefix'),
    key: 'keyPrefix',
    width: 120,
    render: (row) => h('code', { class: 'key-prefix' }, row.keyPrefix + '...'),
  },
  {
    title: () => t('settings.scopes'),
    key: 'scopes',
    width: 200,
    render: (row) =>
      h(
        NTooltip,
        {},
        {
          trigger: () =>
            h(
              'span',
              { class: 'scopes-text' },
              formatScopes(row.scopes)
            ),
          default: () =>
            h(
              NSpace,
              { vertical: true, size: 'small' },
              {
                default: () =>
                  row.scopes.map((s) =>
                    h(NTag, { size: 'tiny', type: 'info' }, () => s)
                  ),
              }
            ),
        }
      ),
  },
  {
    title: () => t('settings.status'),
    key: 'status',
    width: 100,
    render: (row) => {
      const status = getApiKeyStatus(row)
      const config = statusConfig[status]
      return h(NTag, { size: 'small', type: config.type }, () => config.label)
    },
  },
  {
    title: () => t('settings.usageCount'),
    key: 'usageCount',
    width: 100,
    render: (row) => row.usageCount.toLocaleString(),
  },
  {
    title: () => t('settings.lastUsed'),
    key: 'lastUsedAt',
    width: 160,
    render: (row) =>
      row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : '-',
  },
  {
    title: () => t('settings.expiresAt'),
    key: 'expiresAt',
    width: 160,
    render: (row) => {
      if (!row.expiresAt) return t('settings.never')
      const date = new Date(row.expiresAt)
      const isExpired = date < new Date()
      return h(
        'span',
        { style: { color: isExpired ? 'var(--error-color)' : undefined } },
        date.toLocaleString()
      )
    },
  },
  {
    title: () => t('settings.createdAt'),
    key: 'createdAt',
    width: 160,
    render: (row) => new Date(row.createdAt).toLocaleString(),
  },
  {
    title: () => t('common.actions'),
    key: 'actions',
    width: 100,
    fixed: 'right',
    render: (row) => {
      const status = getApiKeyStatus(row)
      const options: Array<{ label: string; key: string }> = [
        { label: t('common.view'), key: 'view' },
      ]
      if (status === 'active') {
        options.push({ label: t('settings.revoke'), key: 'revoke' })
      }
      // 已吊销或已过期的 API Key 可以删除
      if (status === 'revoked' || status === 'expired') {
        options.push({ label: t('common.delete'), key: 'delete' })
      }

      return h(
        NDropdown,
        {
          trigger: 'click',
          options,
          onSelect: (key: string) => handleAction(key, row),
        },
        {
          default: () =>
            h(
              NButton,
              { size: 'small', quaternary: true },
              { icon: () => h('span', { class: 'i-carbon-overflow-menu-vertical' }) }
            ),
        }
      )
    },
  },
]

// Load API keys
const loadApiKeys = async () => {
  loading.value = true
  try {
    const response = await apiKeysApi.getList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      search: searchKeyword.value || undefined,
      status: filterStatus.value,
    })
    apiKeys.value = response.items
    pagination.itemCount = response.total
  } catch (error: any) {
    console.error('Failed to load API keys:', error)
    message.error(error.message || t('common.error'))
  } finally {
    loading.value = false
  }
}

// Event handlers
const handleSearch = () => {
  pagination.page = 1
  loadApiKeys()
}

const handleFilter = () => {
  pagination.page = 1
  loadApiKeys()
}

const handlePageChange = (page: number) => {
  pagination.page = page
  loadApiKeys()
}

const handlePageSizeChange = (pageSize: number) => {
  pagination.pageSize = pageSize
  pagination.page = 1
  loadApiKeys()
}

const handleCreate = () => {
  showCreateModal.value = true
}

const handleCreateSuccess = (apiKey: string) => {
  newApiKey.value = apiKey
  showKeyModal.value = true
  loadApiKeys()
}

const handleAction = (action: string, row: ApiKeyListItem) => {
  if (action === 'view') {
    selectedApiKey.value = row
    showDetailModal.value = true
  } else if (action === 'revoke') {
    confirmRevoke(row)
  } else if (action === 'delete') {
    confirmDelete(row)
  }
}

const confirmRevoke = (apiKey: ApiKeyListItem) => {
  dialog.warning({
    title: t('settings.revoke'),
    content: t('settings.revokeConfirm', { name: apiKey.name }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await apiKeysApi.revoke(apiKey.id)
        message.success(t('settings.revokeSuccess'))
        loadApiKeys()
      } catch (error: any) {
        message.error(error.message || t('common.error'))
      }
    },
  })
}

const confirmDelete = (apiKey: ApiKeyListItem) => {
  dialog.error({
    title: t('settings.deleteApiKey'),
    content: t('settings.deleteApiKeyConfirm', { name: apiKey.name }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await apiKeysApi.delete(apiKey.id)
        message.success(t('settings.deleteApiKeySuccess'))
        loadApiKeys()
      } catch (error: any) {
        message.error(error.message || t('common.error'))
      }
    },
  })
}

const handleUpdate = () => {
  loadApiKeys()
}

const handleRevoke = () => {
  showDetailModal.value = false
  loadApiKeys()
}

const copyKey = async () => {
  try {
    await navigator.clipboard.writeText(newApiKey.value)
    message.success(t('settings.copied'))
  } catch {
    message.error(t('settings.copyFailed'))
  }
}

onMounted(() => {
  loadApiKeys()
})
</script>

<style scoped>
.info-alert {
  margin-bottom: 16px;
}

.filter-card {
  margin-bottom: 16px;
}

.key-prefix {
  font-family: monospace;
  font-size: 12px;
  padding: 2px 6px;
  background: var(--code-color);
  border-radius: 4px;
}

.scopes-text {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.key-alert {
  margin-bottom: 16px;
}

.key-display {
  padding: 16px;
  background-color: var(--body-color);
  border-radius: 8px;
}

.key-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 8px;
}

.key-value {
  display: flex;
  align-items: center;
  gap: 8px;
}

.key-value code {
  flex: 1;
  padding: 8px 12px;
  background-color: var(--code-color);
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
  word-break: break-all;
}
</style>
