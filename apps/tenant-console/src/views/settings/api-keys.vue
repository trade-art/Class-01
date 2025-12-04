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

    <!-- API Keys Table -->
    <n-card>
      <n-data-table
        :columns="columns"
        :data="apiKeys"
        :loading="loading"
        :pagination="false"
        :row-key="(row: ApiKey) => row.id"
      />
    </n-card>

    <!-- Create Modal -->
    <n-modal
      v-model:show="showCreateModal"
      :title="t('settings.createApiKey')"
      preset="dialog"
      style="width: 500px"
    >
      <n-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-placement="left"
        label-width="100"
      >
        <n-form-item :label="t('settings.keyName')" path="name">
          <n-input v-model:value="formData.name" :placeholder="t('settings.keyNamePlaceholder')" />
        </n-form-item>

        <n-form-item :label="t('settings.permissions')" path="permissions">
          <n-checkbox-group v-model:value="formData.permissions">
            <n-space vertical>
              <n-checkbox value="read:users">{{ t('settings.permReadUsers') }}</n-checkbox>
              <n-checkbox value="write:users">{{ t('settings.permWriteUsers') }}</n-checkbox>
              <n-checkbox value="read:trading">{{ t('settings.permReadTrading') }}</n-checkbox>
              <n-checkbox value="read:reports">{{ t('settings.permReadReports') }}</n-checkbox>
            </n-space>
          </n-checkbox-group>
        </n-form-item>

        <n-form-item :label="t('settings.expiresAt')" path="expiresAt">
          <n-date-picker
            v-model:value="formData.expiresAt"
            type="datetime"
            clearable
            :placeholder="t('settings.expiresAtPlaceholder')"
            style="width: 100%"
          />
        </n-form-item>

        <n-form-item :label="t('settings.ipWhitelist')" path="ipWhitelist">
          <n-dynamic-tags v-model:value="formData.ipWhitelist" />
          <div class="hint">{{ t('settings.ipWhitelistHint') }}</div>
        </n-form-item>
      </n-form>

      <template #action>
        <n-space justify="end">
          <n-button @click="showCreateModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="submitting" @click="handleSubmit">
            {{ t('common.create') }}
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Show Key Modal -->
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
import { ref, reactive, onMounted, h } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NSpace,
  NAlert,
  NDataTable,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NCheckboxGroup,
  NCheckbox,
  NDatePicker,
  NDynamicTags,
  NTag,
  NDropdown,
  useMessage,
  useDialog,
  type DataTableColumns,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { settingsApi } from '@/api/settings'
import type { ApiKey } from '@/types'

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()

const formRef = ref<FormInst | null>(null)
const loading = ref(false)
const showCreateModal = ref(false)
const showKeyModal = ref(false)
const submitting = ref(false)
const apiKeys = ref<ApiKey[]>([])
const newApiKey = ref('')

const formData = reactive({
  name: '',
  permissions: [] as string[],
  expiresAt: null as number | null,
  ipWhitelist: [] as string[],
})

const formRules: FormRules = {
  name: [{ required: true, message: () => t('settings.keyNameRequired'), trigger: 'blur' }],
  permissions: [
    {
      type: 'array',
      required: true,
      message: () => t('settings.permissionsRequired'),
      trigger: 'change',
    },
  ],
}

const columns: DataTableColumns<ApiKey> = [
  {
    title: t('settings.keyName'),
    key: 'name',
    width: 150,
  },
  {
    title: t('settings.keyPrefix'),
    key: 'prefix',
    width: 120,
    render: (row) => h('code', {}, row.prefix + '...'),
  },
  {
    title: t('settings.permissions'),
    key: 'permissions',
    width: 200,
    render: (row) =>
      h(
        NSpace,
        { size: 'small' },
        {
          default: () =>
            row.permissions.map((p) =>
              h(NTag, { size: 'tiny', type: 'info' }, () => p)
            ),
        }
      ),
  },
  {
    title: t('settings.status'),
    key: 'status',
    width: 100,
    render: (row) =>
      h(
        NTag,
        { size: 'small', type: row.status === 'active' ? 'success' : 'default' },
        () => (row.status === 'active' ? t('common.active') : t('settings.revoked'))
      ),
  },
  {
    title: t('settings.lastUsed'),
    key: 'lastUsedAt',
    width: 160,
    render: (row) => (row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : '-'),
  },
  {
    title: t('settings.expiresAt'),
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
    title: t('settings.createdAt'),
    key: 'createdAt',
    width: 160,
    render: (row) => new Date(row.createdAt).toLocaleString(),
  },
  {
    title: t('common.actions'),
    key: 'actions',
    width: 100,
    render: (row) => {
      if (row.status !== 'active') return null

      const options = [{ label: t('settings.revoke'), key: 'revoke' }]

      return h(
        NDropdown,
        {
          trigger: 'click',
          options,
          onSelect: () => handleRevoke(row),
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

const loadApiKeys = async () => {
  loading.value = true
  try {
    const response = await settingsApi.getApiKeys()
    // 后端返回 { apiKeys: [...], total: number } 格式
    const data = response as any
    const keyList = data.apiKeys || data.items || (Array.isArray(data) ? data : [])
    // 映射字段名差异
    apiKeys.value = keyList.map((key: any) => ({
      ...key,
      // 兼容后端字段名
      prefix: key.prefix || key.keyPrefix,
      status: key.status || (key.isActive ? 'active' : 'revoked'),
    }))
  } catch (error) {
    console.error('Failed to load API keys:', error)
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  Object.assign(formData, {
    name: '',
    permissions: [],
    expiresAt: null,
    ipWhitelist: [],
  })
  showCreateModal.value = true
}

const handleSubmit = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    const result = await settingsApi.createApiKey({
      name: formData.name,
      permissions: formData.permissions,
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : undefined,
      ipWhitelist: formData.ipWhitelist.length > 0 ? formData.ipWhitelist : undefined,
    })
    newApiKey.value = result.key
    showCreateModal.value = false
    showKeyModal.value = true
    loadApiKeys()
  } catch (error: any) {
    message.error(error.message || t('common.error'))
  } finally {
    submitting.value = false
  }
}

const handleRevoke = (apiKey: ApiKey) => {
  dialog.warning({
    title: t('settings.revoke'),
    content: t('settings.revokeConfirm', { name: apiKey.name }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await settingsApi.revokeApiKey(apiKey.id)
        message.success(t('settings.revokeSuccess'))
        loadApiKeys()
      } catch (error: any) {
        message.error(error.message || t('common.error'))
      }
    },
  })
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

.hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}
</style>
