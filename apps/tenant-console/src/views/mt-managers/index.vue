<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <div>
        <h1 class="page-title">{{ t('mtManager.title') }}</h1>
        <n-text depth="3" style="margin-top: 4px;">
          {{ t('mtManager.description') }}
        </n-text>
      </div>
      <n-button
        type="primary"
        :disabled="servers.length === 0"
        @click="openCreateModal"
      >
        <template #icon>
          <n-icon><span class="i-carbon-add" /></n-icon>
        </template>
        {{ t('mtManager.addManager') }}
      </n-button>
    </div>

    <!-- No Server Warning -->
    <n-alert
      v-if="!loading && servers.length === 0"
      type="warning"
      class="mb-4"
    >
      {{ t('mtManager.noServerWarning') }}
    </n-alert>

    <!-- Empty State -->
    <n-card v-if="!loading && managers.length === 0 && servers.length > 0" class="empty-state-card">
      <n-empty :description="t('mtManager.noManagers')">
        <template #icon>
          <span class="i-carbon-user-admin" style="font-size: 48px; color: var(--n-text-color-3)"></span>
        </template>
        <template #extra>
          <n-button type="primary" @click="openCreateModal">
            {{ t('mtManager.addFirstManager') }}
          </n-button>
        </template>
      </n-empty>
    </n-card>

    <!-- Managers Table -->
    <n-card v-else-if="servers.length > 0">
      <n-data-table
        :columns="columns"
        :data="managers"
        :loading="loading"
        :row-key="(row: MtManager) => row.id"
        :scroll-x="1200"
      />
    </n-card>

    <!-- Create/Edit Modal -->
    <n-modal
      v-model:show="showFormModal"
      :title="editingManager ? t('mtManager.editManager') : t('mtManager.addManager')"
      preset="dialog"
      style="width: 500px"
      :mask-closable="false"
    >
      <n-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-placement="top"
      >
        <n-form-item path="mtServerId" :label="t('mtManager.selectServer')">
          <n-select
            v-model:value="formData.mtServerId"
            :options="serverOptions"
            :placeholder="t('mtManager.selectServerPlaceholder')"
            :disabled="!!editingManager"
          />
        </n-form-item>

        <n-form-item path="managerLogin" :label="t('mtManager.managerLogin')">
          <n-input-number
            v-model:value="formData.managerLogin"
            :show-button="false"
            :placeholder="t('mtManager.managerLoginPlaceholder')"
            style="width: 100%"
            :disabled="!!editingManager"
          />
        </n-form-item>

        <!-- 新建时显示密码输入框 -->
        <n-form-item
          v-if="!editingManager"
          path="managerPassword"
          :label="t('mtManager.managerPassword')"
        >
          <n-input
            v-model:value="formData.managerPassword"
            type="password"
            show-password-on="click"
            :placeholder="t('mtManager.passwordPlaceholder')"
          />
        </n-form-item>

        <!-- 编辑时显示密码状态和修改开关 -->
        <n-form-item v-else :label="t('mtManager.managerPassword')">
          <div style="width: 100%;">
            <!-- 密码状态显示 -->
            <div class="password-status">
              <n-tag type="success" size="small">
                <template #icon>
                  <span class="i-carbon-checkmark-filled"></span>
                </template>
                {{ t('mtManager.passwordConfigured') }}
              </n-tag>
              <n-button
                text
                type="primary"
                size="small"
                @click="showPasswordInput = !showPasswordInput"
              >
                {{ showPasswordInput ? t('mtManager.cancelChangePassword') : t('mtManager.changePassword') }}
              </n-button>
            </div>
            <!-- 密码输入框（仅在点击修改后显示） -->
            <div v-if="showPasswordInput" style="margin-top: 8px;">
              <n-input
                v-model:value="formData.managerPassword"
                type="password"
                show-password-on="click"
                :placeholder="t('mtManager.newPasswordPlaceholder')"
              />
              <n-text depth="3" style="font-size: 12px; margin-top: 4px; display: block;">
                {{ t('mtManager.passwordChangeHint') }}
              </n-text>
            </div>
          </div>
        </n-form-item>

        <n-form-item path="displayName" :label="t('mtManager.displayName')">
          <n-input
            v-model:value="formData.displayName"
            :placeholder="t('mtManager.displayNamePlaceholder')"
          />
        </n-form-item>
      </n-form>

      <template #action>
        <n-button @click="closeFormModal">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">
          {{ editingManager ? t('common.save') : t('common.create') }}
        </n-button>
      </template>
    </n-modal>

    <!-- Connection Test Result Modal -->
    <n-modal
      v-model:show="showTestResult"
      :title="t('mtManager.testResultTitle')"
      preset="dialog"
      style="width: 400px"
    >
      <div v-if="testResult">
        <n-descriptions :column="1" label-placement="left">
          <n-descriptions-item :label="t('common.status')">
            <n-tag :type="testResult.success ? 'success' : 'error'">
              {{ testResult.success ? t('mtManager.connectSuccess') : t('mtManager.connectFailed') }}
            </n-tag>
          </n-descriptions-item>
          <n-descriptions-item v-if="testResult.latency" :label="t('mtManager.latency')">
            {{ testResult.latency }} ms
          </n-descriptions-item>
          <n-descriptions-item v-if="testResult.serverVersion" :label="t('mtManager.serverVersion')">
            {{ testResult.serverVersion }}
          </n-descriptions-item>
          <n-descriptions-item v-if="testResult.serverTime" :label="t('mtManager.serverTime')">
            {{ testResult.serverTime }}
          </n-descriptions-item>
          <n-descriptions-item v-if="testResult.error" :label="t('mtManager.errorInfo')">
            <n-text type="error">{{ testResult.error }}</n-text>
          </n-descriptions-item>
        </n-descriptions>
      </div>
      <template #action>
        <n-button @click="showTestResult = false">{{ t('common.close') }}</n-button>
      </template>
    </n-modal>

    <!-- API Key Management Modal -->
    <n-modal
      v-model:show="showApiKeyModal"
      :title="t('mtManager.manageApiKey')"
      preset="dialog"
      style="width: 500px"
      :mask-closable="false"
    >
      <n-spin :show="apiKeyLoading">
        <div v-if="apiKeyManager" class="api-key-modal-content">
          <n-alert type="info" :show-icon="false" class="mb-4">
            {{ t('mtManager.apiKeyInfo') }}
          </n-alert>

          <n-descriptions :column="1" label-placement="left" bordered>
            <n-descriptions-item :label="t('mtManager.managerLogin')">
              {{ apiKeyManager.managerLogin }}
            </n-descriptions-item>
            <n-descriptions-item :label="t('mtManager.apiKeyStatus')">
              <n-tag v-if="!apiKeyStatus?.hasApiKey" size="small" type="default">
                {{ t('mtManager.apiKeyNotConfigured') }}
              </n-tag>
              <n-tag v-else size="small" :type="apiKeyStatus.apiKeyEnabled ? 'success' : 'warning'">
                {{ apiKeyStatus.apiKeyEnabled ? t('mtManager.apiKeyEnabled') : t('mtManager.apiKeyDisabled') }}
              </n-tag>
            </n-descriptions-item>
            <n-descriptions-item v-if="apiKeyStatus?.hasApiKey" :label="t('mtManager.apiKeyId')">
              <div class="secret-display">
                <code v-if="showApiSecret && apiKeyValue" class="secret-value">{{ apiKeyValue }}</code>
                <code v-else>{{ apiKeyStatus.apiKeyId }}</code>
                <n-button
                  v-if="showApiSecret && apiKeyValue"
                  size="small"
                  text
                  type="info"
                  @click="copyToClipboard(apiKeyValue)"
                >
                  {{ t('common.copy') }}
                </n-button>
              </div>
            </n-descriptions-item>
            <n-descriptions-item v-if="apiKeyStatus?.hasApiKey" :label="t('mtManager.apiKeyCreatedAt')">
              {{ formatDateTime(apiKeyStatus.apiKeyCreatedAt) }}
            </n-descriptions-item>
            <n-descriptions-item v-if="apiKeyStatus?.hasApiKey" :label="t('mtManager.apiKeyLastUsedAt')">
              {{ formatDateTime(apiKeyStatus.apiKeyLastUsedAt) }}
            </n-descriptions-item>
            <n-descriptions-item v-if="apiKeyStatus?.apiKeyLastUsedIp" :label="t('mtManager.apiKeyLastUsedIp')">
              {{ apiKeyStatus.apiKeyLastUsedIp }}
            </n-descriptions-item>
            <n-descriptions-item v-if="apiKeyStatus?.hasApiKey" :label="t('mtManager.apiSecret')">
              <div class="secret-display">
                <code v-if="showApiSecret && apiSecretValue" class="secret-value">{{ apiSecretValue }}</code>
                <span v-else class="secret-masked">••••••••••••••••••••••••••••••••</span>
                <n-button
                  size="small"
                  text
                  type="primary"
                  :loading="apiSecretLoading"
                  @click="toggleApiSecretVisibility"
                >
                  {{ showApiSecret ? t('mtManager.hideSecret') : t('mtManager.showSecret') }}
                </n-button>
                <n-button
                  v-if="showApiSecret && apiSecretValue"
                  size="small"
                  text
                  type="info"
                  @click="copyToClipboard(apiSecretValue)"
                >
                  {{ t('common.copy') }}
                </n-button>
              </div>
            </n-descriptions-item>
          </n-descriptions>

          <!-- IP 白名单编辑区域 -->
          <template v-if="apiKeyStatus?.hasApiKey">
            <n-divider style="margin: 16px 0 12px 0">
              {{ t('settings.allowedIps') }}
            </n-divider>
            <div class="ip-whitelist-section">
              <n-text depth="3" style="font-size: 12px; display: block; margin-bottom: 8px;">
                {{ t('settings.allowedIpsHint') }}
              </n-text>
              <n-dynamic-tags
                v-model:value="editingAllowedIps"
                :disabled="allowedIpsSaving"
              />
              <div class="ip-whitelist-actions" style="margin-top: 12px;">
                <n-button
                  size="small"
                  type="primary"
                  :loading="allowedIpsSaving"
                  :disabled="!hasAllowedIpsChanged"
                  @click="handleSaveAllowedIps"
                >
                  {{ t('common.save') }}
                </n-button>
                <n-button
                  size="small"
                  :disabled="allowedIpsSaving || !hasAllowedIpsChanged"
                  @click="resetAllowedIps"
                >
                  {{ t('common.reset') }}
                </n-button>
              </div>
            </div>

            <!-- 作用域编辑区域 -->
            <n-divider style="margin: 16px 0 12px 0">
              {{ t('mtManager.scopes') }}
            </n-divider>
            <div class="scopes-section">
              <n-text depth="3" style="font-size: 12px; display: block; margin-bottom: 8px;">
                {{ t('mtManager.scopesHint') }}
              </n-text>
              <n-select
                v-model:value="editingScopes"
                multiple
                :options="scopeOptions"
                :disabled="scopesSaving"
                :placeholder="t('mtManager.selectScopes')"
              />
              <div class="scopes-actions" style="margin-top: 12px;">
                <n-button
                  size="small"
                  type="primary"
                  :loading="scopesSaving"
                  :disabled="!hasScopesChanged"
                  @click="handleSaveScopes"
                >
                  {{ t('common.save') }}
                </n-button>
                <n-button
                  size="small"
                  :disabled="scopesSaving || !hasScopesChanged"
                  @click="resetScopes"
                >
                  {{ t('common.reset') }}
                </n-button>
              </div>
            </div>
          </template>
        </div>
      </n-spin>
      <template #action>
        <n-space>
          <n-button @click="closeApiKeyModal">{{ t('common.cancel') }}</n-button>
          <n-popconfirm
            v-if="apiKeyStatus?.hasApiKey"
            @positive-click="handleToggleApiKey"
          >
            <template #trigger>
              <n-button
                :type="apiKeyStatus?.apiKeyEnabled ? 'warning' : 'success'"
                :loading="apiKeyOperating"
              >
                {{ apiKeyStatus?.apiKeyEnabled ? t('mtManager.disableApiKey') : t('mtManager.enableApiKey') }}
              </n-button>
            </template>
            {{ t('mtManager.toggleApiKeyConfirm', {
              action: apiKeyStatus?.apiKeyEnabled ? t('mtManager.disableApiKey') : t('mtManager.enableApiKey'),
              login: apiKeyManager?.managerLogin
            }) }}
          </n-popconfirm>
          <n-popconfirm
            v-if="apiKeyStatus?.hasApiKey"
            @positive-click="handleRevokeApiKey"
          >
            <template #trigger>
              <n-button type="error" :loading="apiKeyOperating">
                {{ t('mtManager.revokeApiKey') }}
              </n-button>
            </template>
            <div>
              {{ t('mtManager.revokeApiKeyConfirm', { login: apiKeyManager?.managerLogin }) }}
              <br />
              <n-text type="warning">{{ t('mtManager.revokeApiKeyWarning') }}</n-text>
            </div>
          </n-popconfirm>
          <n-button
            type="primary"
            :loading="apiKeyOperating"
            @click="openGenerateApiKeyModal"
          >
            {{ t('mtManager.generateApiKey') }}
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Generate API Key Modal (with Scopes Selection) -->
    <n-modal
      v-model:show="showGenerateApiKeyModal"
      :title="t('mtManager.generateApiKey')"
      preset="dialog"
      style="width: 500px"
      :mask-closable="false"
    >
      <div class="generate-api-key-content">
        <n-alert type="info" class="mb-4">
          {{ t('mtManager.generateApiKeyInfo') }}
        </n-alert>

        <div class="scope-selection">
          <div class="scope-label">{{ t('mtManager.selectScopes') }}</div>
          <n-text depth="3" style="font-size: 12px; display: block; margin-bottom: 8px;">
            {{ t('mtManager.scopesHint') }}
          </n-text>
          <n-select
            v-model:value="generateScopes"
            multiple
            :options="scopeOptions"
            :placeholder="t('mtManager.selectScopes')"
          />
        </div>

        <n-alert v-if="apiKeyStatus?.hasApiKey" type="warning" class="mt-4">
          {{ t('mtManager.generateApiKeyWarning') }}
        </n-alert>
      </div>
      <template #action>
        <n-button @click="showGenerateApiKeyModal = false">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="apiKeyOperating" @click="handleGenerateApiKey">
          {{ t('mtManager.confirmGenerate') }}
        </n-button>
      </template>
    </n-modal>

    <!-- API Key Generated Result Modal -->
    <n-modal
      v-model:show="showApiKeyResultModal"
      :title="t('mtManager.apiKeyGeneratedTitle')"
      preset="dialog"
      style="width: 550px"
      :mask-closable="false"
      :close-on-esc="false"
    >
      <div v-if="apiKeyResult" class="api-key-result-content">
        <n-alert type="warning" class="mb-4">
          {{ t('mtManager.apiKeyGeneratedWarning') }}
        </n-alert>

        <div class="credential-item">
          <div class="credential-label">{{ t('mtManager.apiKeyId') }}</div>
          <div class="credential-value">
            <n-input
              :value="apiKeyResult.apiKeyId"
              readonly
              class="credential-input"
            />
            <n-button
              size="small"
              @click="copyToClipboard(apiKeyResult.apiKeyId)"
            >
              {{ t('mtManager.copyApiKeyId') }}
            </n-button>
          </div>
        </div>

        <div class="credential-item">
          <div class="credential-label">{{ t('mtManager.apiSecret') }}</div>
          <div class="credential-value">
            <n-input
              :value="apiKeyResult.apiSecret"
              readonly
              class="credential-input"
            />
            <n-button
              size="small"
              type="primary"
              @click="copyToClipboard(apiKeyResult.apiSecret)"
            >
              {{ t('mtManager.copyApiSecret') }}
            </n-button>
          </div>
        </div>
      </div>
      <template #action>
        <n-button type="primary" @click="closeApiKeyResultModal">
          {{ t('common.close') }}
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, h, onMounted, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NIcon,
  NDataTable,
  NModal,
  NTag,
  NTooltip,
  NDescriptions,
  NDescriptionsItem,
  NText,
  NEmpty,
  NAlert,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSpace,
  NPopconfirm,
  NSpin,
  NDynamicTags,
  NDivider,
  useMessage,
  type DataTableColumns,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { mtManagersApi } from '@/api/mt-managers'
import { mtServersApi } from '@/api/mt-servers'
import type { MtManager, MtServer, ConnectionTestResult, MtManagerApiKeyStatus, GenerateMtManagerApiKeyResponse, ApiKeyScopeOption } from '@/types'

const { t } = useI18n()
const message = useMessage()
const authStore = useAuthStore()

// State
const loading = ref(false)
const saving = ref(false)
const managers = ref<MtManager[]>([])
const servers = ref<MtServer[]>([])
const showFormModal = ref(false)
const showTestResult = ref(false)
const showPasswordInput = ref(false)
const editingManager = ref<MtManager | null>(null)
const testingManagerId = ref<string | null>(null)
const testResult = ref<ConnectionTestResult | null>(null)
const formRef = ref<FormInst | null>(null)

// API Key 管理状态
const showApiKeyModal = ref(false)
const showApiKeyResultModal = ref(false)
const apiKeyManager = ref<MtManager | null>(null)
const apiKeyStatus = ref<MtManagerApiKeyStatus | null>(null)
const apiKeyResult = ref<GenerateMtManagerApiKeyResponse | null>(null)
const apiKeyLoading = ref(false)
const apiKeyOperating = ref(false)

// API Key/Secret 显示状态
const showApiSecret = ref(false)
const apiKeyValue = ref<string | null>(null)
const apiSecretValue = ref<string | null>(null)
const apiSecretLoading = ref(false)

// IP 白名单编辑状态
const editingAllowedIps = ref<string[]>([])
const allowedIpsSaving = ref(false)

// 作用域编辑状态
const availableScopes = ref<ApiKeyScopeOption[]>([])
const editingScopes = ref<string[]>([])
const scopesSaving = ref(false)
const showGenerateApiKeyModal = ref(false)
const generateScopes = ref<string[]>(['*'])

// Check if user has write permission (owner or admin)
const canEdit = computed(() => {
  const role = authStore.admin?.role
  return role === 'owner' || role === 'admin'
})

// 检查 IP 白名单是否有变化
const hasAllowedIpsChanged = computed(() => {
  if (!apiKeyStatus.value) return false
  const original = apiKeyStatus.value.apiKeyAllowedIps || []
  if (original.length !== editingAllowedIps.value.length) return true
  return !original.every((ip, i) => ip === editingAllowedIps.value[i])
})

// 检查作用域是否有变化
const hasScopesChanged = computed(() => {
  if (!apiKeyStatus.value) return false
  const original = apiKeyStatus.value.apiKeyScopes || ['*']
  if (original.length !== editingScopes.value.length) return true
  const sortedOriginal = [...original].sort()
  const sortedEditing = [...editingScopes.value].sort()
  return !sortedOriginal.every((scope, i) => scope === sortedEditing[i])
})

// 作用域选项（用于选择器）
const scopeOptions = computed(() => {
  return availableScopes.value.map(s => ({
    label: s.label,
    value: s.value,
  }))
})

// 监听作用域选择变化，实现"全部权限"与其他权限互斥
watch(editingScopes, (newValue, oldValue) => {
  if (!newValue || newValue.length === 0) return

  const hadWildcard = oldValue?.includes('*') ?? false
  const hasWildcard = newValue.includes('*')
  const hasOtherScopes = newValue.some(s => s !== '*')

  if (hasWildcard && hasOtherScopes) {
    if (!hadWildcard) {
      // 之前没有 *，现在选择了 *，清除其他权限
      editingScopes.value = ['*']
    } else {
      // 之前有 *，现在选择了其他权限，清除 *
      editingScopes.value = newValue.filter(s => s !== '*')
    }
  }
})

watch(generateScopes, (newValue, oldValue) => {
  if (!newValue || newValue.length === 0) return

  const hadWildcard = oldValue?.includes('*') ?? false
  const hasWildcard = newValue.includes('*')
  const hasOtherScopes = newValue.some(s => s !== '*')

  if (hasWildcard && hasOtherScopes) {
    if (!hadWildcard) {
      // 之前没有 *，现在选择了 *，清除其他权限
      generateScopes.value = ['*']
    } else {
      // 之前有 *，现在选择了其他权限，清除 *
      generateScopes.value = newValue.filter(s => s !== '*')
    }
  }
})

// Server options for select
const serverOptions = computed(() => {
  return servers.value
    .filter(s => s.isActive)
    .map(s => ({
      label: `${s.displayName || s.serverId} (${s.platformType})`,
      value: s.id,
    }))
})

// Form data
const formData = ref({
  mtServerId: null as string | null,
  managerLogin: null as number | null,
  managerPassword: '',
  displayName: '',
})

// Form validation rules
const formRules = computed<FormRules>(() => ({
  mtServerId: [
    { required: true, message: t('mtManager.serverRequired'), trigger: 'change' },
  ],
  managerLogin: [
    { required: true, type: 'number', message: t('mtManager.loginRequired'), trigger: 'blur' },
  ],
  managerPassword: [
    {
      required: true,
      message: t('mtManager.passwordRequired'),
      trigger: 'blur',
      validator: (_rule, value) => {
        // Only required for new managers
        if (!editingManager.value && !value) {
          return new Error(t('mtManager.passwordRequired'))
        }
        return true
      },
    },
  ],
}))

// Table columns
const columns = computed<DataTableColumns<MtManager>>(() => [
  {
    title: t('mtManager.serverColumn'),
    key: 'serverName',
    width: 150,
    render: (row) => row.serverName || row.serverId,
  },
  {
    title: t('mtManager.platformColumn'),
    key: 'platformType',
    width: 80,
    render: (row) => h(NTag, { size: 'small', type: 'info' }, () => row.platformType),
  },
  {
    title: t('mtManager.loginColumn'),
    key: 'managerLogin',
    width: 120,
  },
  {
    title: t('mtManager.displayNameColumn'),
    key: 'displayName',
    width: 150,
    ellipsis: { tooltip: true },
    render: (row) => row.displayName || '-',
  },
  {
    title: t('common.status'),
    key: 'isActive',
    width: 80,
    render: (row) =>
      h(
        NTag,
        { size: 'small', type: row.isActive ? 'success' : 'default' },
        () => (row.isActive ? t('common.enabled') : t('common.disabled'))
      ),
  },
  {
    title: t('mtManager.apiKeyColumn'),
    key: 'apiKey',
    width: 100,
    render: (row) => {
      // 简单显示 API Key 状态
      if (!row.apiKeyId) {
        return h(NTag, { size: 'small', type: 'default' }, () => t('mtManager.apiKeyNotConfigured'))
      }
      return h(
        NTag,
        { size: 'small', type: row.apiKeyEnabled ? 'success' : 'warning' },
        () => row.apiKeyEnabled ? t('mtManager.apiKeyEnabled') : t('mtManager.apiKeyDisabled')
      )
    },
  },
  {
    title: t('common.actions'),
    key: 'actions',
    width: 300,
    fixed: 'right',
    render: (row) => {
      const buttons = [
        h(
          NTooltip,
          { disabled: row.isActive },
          {
            trigger: () =>
              h(
                NButton,
                {
                  size: 'small',
                  quaternary: true,
                  disabled: !row.isActive,
                  loading: testingManagerId.value === row.id,
                  onClick: () => handleTestConnection(row),
                },
                () => t('mtManager.test')
              ),
            default: () => t('mtManager.disabledCannotTest'),
          }
        ),
      ]

      if (canEdit.value) {
        // API Key 管理按钮
        buttons.push(
          h(
            NButton,
            {
              size: 'small',
              quaternary: true,
              type: 'info',
              style: { fontSize: '13px' },
              onClick: () => openApiKeyModal(row),
            },
            () => t('mtManager.apiKey')
          )
        )

        buttons.push(
          h(
            NButton,
            {
              size: 'small',
              quaternary: true,
              onClick: () => openEditModal(row),
            },
            () => t('common.edit')
          )
        )

        buttons.push(
          h(
            NButton,
            {
              size: 'small',
              quaternary: true,
              type: row.isActive ? 'warning' : 'success',
              onClick: () => handleToggleStatus(row),
            },
            () => (row.isActive ? t('common.disabled') : t('common.enabled'))
          )
        )

        buttons.push(
          h(
            NPopconfirm,
            {
              onPositiveClick: () => handleDelete(row),
            },
            {
              trigger: () =>
                h(
                  NButton,
                  {
                    size: 'small',
                    quaternary: true,
                    type: 'error',
                  },
                  () => t('common.delete')
                ),
              default: () => t('mtManager.deleteConfirm', { login: row.managerLogin }),
            }
          )
        )
      }

      return h(NSpace, { size: 'small' }, () => buttons)
    },
  },
])

// Methods
const fetchData = async () => {
  loading.value = true
  try {
    const [managersResponse, serversResponse] = await Promise.all([
      mtManagersApi.getManagers(),
      mtServersApi.getServers(),
    ])
    managers.value = managersResponse.managers
    servers.value = serversResponse.servers
  } catch (error: any) {
    message.error(error.message || t('mtManager.loadFailed'))
  } finally {
    loading.value = false
  }
}

const openCreateModal = () => {
  editingManager.value = null
  formData.value = {
    mtServerId: serverOptions.value.length > 0 ? serverOptions.value[0].value : null,
    managerLogin: null,
    managerPassword: '',
    displayName: '',
  }
  showFormModal.value = true
}

const openEditModal = (manager: MtManager) => {
  editingManager.value = manager
  showPasswordInput.value = false // 重置密码输入状态
  formData.value = {
    mtServerId: manager.mtServerId,
    managerLogin: parseInt(manager.managerLogin),
    managerPassword: '',
    displayName: manager.displayName || '',
  }
  showFormModal.value = true
}

const closeFormModal = () => {
  showFormModal.value = false
  editingManager.value = null
}

const handleSave = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    if (editingManager.value) {
      // Update existing manager
      const updateData: any = {}
      if (formData.value.managerPassword) {
        updateData.managerPassword = formData.value.managerPassword
      }
      if (formData.value.displayName !== editingManager.value.displayName) {
        updateData.displayName = formData.value.displayName || undefined
      }
      await mtManagersApi.updateManager(editingManager.value.id, updateData)
      message.success(t('common.success'))
    } else {
      // Create new manager
      await mtManagersApi.createManager({
        mtServerId: formData.value.mtServerId!,
        managerLogin: formData.value.managerLogin!,
        managerPassword: formData.value.managerPassword,
        displayName: formData.value.displayName || undefined,
      })
      message.success(t('common.success'))
    }
    closeFormModal()
    fetchData()
  } catch (error: any) {
    message.error(error.message || t('common.failed'))
  } finally {
    saving.value = false
  }
}

const handleTestConnection = async (manager: MtManager) => {
  testingManagerId.value = manager.id
  try {
    testResult.value = await mtManagersApi.testConnection(manager.id)
    showTestResult.value = true
  } catch (error: any) {
    message.error(error.message || t('mtManager.testFailed'))
  } finally {
    testingManagerId.value = null
  }
}

const handleToggleStatus = async (manager: MtManager) => {
  const newStatus = !manager.isActive
  try {
    await mtManagersApi.toggleStatus(manager.id, newStatus)
    message.success(t('common.success'))
    fetchData()
  } catch (error: any) {
    message.error(error.message || t('common.failed'))
  }
}

const handleDelete = async (manager: MtManager) => {
  try {
    await mtManagersApi.deleteManager(manager.id)
    message.success(t('common.success'))
    fetchData()
  } catch (error: any) {
    message.error(error.message || t('common.failed'))
  }
}

// ==================== API Key 管理方法 ====================

const openApiKeyModal = async (manager: MtManager) => {
  apiKeyManager.value = manager
  apiKeyLoading.value = true
  showApiKeyModal.value = true

  try {
    // 并行加载 API Key 状态和可用作用域
    const [statusResult, scopesResult] = await Promise.all([
      mtManagersApi.getApiKeyStatus(manager.id),
      mtManagersApi.getAvailableScopes(),
    ])
    apiKeyStatus.value = statusResult
    availableScopes.value = scopesResult.scopes
    // 初始化 IP 白名单编辑状态
    editingAllowedIps.value = [...(apiKeyStatus.value.apiKeyAllowedIps || [])]
    // 初始化作用域编辑状态
    editingScopes.value = [...(apiKeyStatus.value.apiKeyScopes || ['*'])]
  } catch (error: any) {
    message.error(error.message || t('common.failed'))
  } finally {
    apiKeyLoading.value = false
  }
}

const closeApiKeyModal = () => {
  showApiKeyModal.value = false
  apiKeyManager.value = null
  apiKeyStatus.value = null
  // 重置 API Key/Secret 显示状态
  showApiSecret.value = false
  apiKeyValue.value = null
  apiSecretValue.value = null
  // 重置 IP 白名单编辑状态
  editingAllowedIps.value = []
  // 重置作用域编辑状态
  editingScopes.value = []
}

const toggleApiSecretVisibility = async () => {
  if (!apiKeyManager.value) return

  if (showApiSecret.value) {
    // 当前是显示状态，切换为隐藏
    showApiSecret.value = false
    return
  }

  // 当前是隐藏状态，需要获取并显示
  if (apiSecretValue.value && apiKeyValue.value) {
    // 已经获取过，直接显示
    showApiSecret.value = true
    return
  }

  // 首次获取
  apiSecretLoading.value = true
  try {
    const result = await mtManagersApi.getApiSecret(apiKeyManager.value.id)
    apiKeyValue.value = result.apiKeyId
    apiSecretValue.value = result.apiSecret
    showApiSecret.value = true
  } catch (error: any) {
    message.error(error.message || t('mtManager.getSecretFailed'))
  } finally {
    apiSecretLoading.value = false
  }
}

// 打开生成 API Key 模态框（带作用域选择）
const openGenerateApiKeyModal = async () => {
  // 如果还没有加载可用作用域，先加载
  if (availableScopes.value.length === 0) {
    try {
      const result = await mtManagersApi.getAvailableScopes()
      availableScopes.value = result.scopes
    } catch (error: any) {
      message.error(error.message || t('common.failed'))
      return
    }
  }
  generateScopes.value = ['*'] // 默认选择所有权限
  showGenerateApiKeyModal.value = true
}

// 确认生成 API Key
const handleGenerateApiKey = async () => {
  if (!apiKeyManager.value) return

  apiKeyOperating.value = true
  try {
    const scopes = generateScopes.value.length > 0 ? generateScopes.value : ['*']
    apiKeyResult.value = await mtManagersApi.generateApiKey(apiKeyManager.value.id, { scopes })
    message.success(t('mtManager.generateSuccess'))
    showGenerateApiKeyModal.value = false
    showApiKeyModal.value = false
    showApiKeyResultModal.value = true
    fetchData() // 刷新列表以更新 API Key 状态
  } catch (error: any) {
    message.error(error.message || t('common.failed'))
  } finally {
    apiKeyOperating.value = false
  }
}

// 保存作用域
const handleSaveScopes = async () => {
  if (!apiKeyManager.value) return

  scopesSaving.value = true
  try {
    const scopes = editingScopes.value.length > 0 ? editingScopes.value : ['*']
    await mtManagersApi.updateScopes(apiKeyManager.value.id, scopes)
    message.success(t('common.success'))
    // 刷新状态
    apiKeyStatus.value = await mtManagersApi.getApiKeyStatus(apiKeyManager.value.id)
    editingScopes.value = [...(apiKeyStatus.value.apiKeyScopes || ['*'])]
  } catch (error: any) {
    message.error(error.message || t('common.failed'))
  } finally {
    scopesSaving.value = false
  }
}

// 重置作用域
const resetScopes = () => {
  if (apiKeyStatus.value) {
    editingScopes.value = [...(apiKeyStatus.value.apiKeyScopes || ['*'])]
  }
}

const handleRevokeApiKey = async () => {
  if (!apiKeyManager.value) return

  apiKeyOperating.value = true
  try {
    await mtManagersApi.revokeApiKey(apiKeyManager.value.id)
    message.success(t('mtManager.revokeSuccess'))
    // 刷新状态
    apiKeyStatus.value = await mtManagersApi.getApiKeyStatus(apiKeyManager.value.id)
    fetchData() // 刷新列表
  } catch (error: any) {
    message.error(error.message || t('common.failed'))
  } finally {
    apiKeyOperating.value = false
  }
}

const handleToggleApiKey = async () => {
  if (!apiKeyManager.value || !apiKeyStatus.value) return

  const newEnabled = !apiKeyStatus.value.apiKeyEnabled
  apiKeyOperating.value = true
  try {
    await mtManagersApi.toggleApiKey(apiKeyManager.value.id, newEnabled)
    message.success(t('mtManager.toggleSuccess'))
    // 刷新状态
    apiKeyStatus.value = await mtManagersApi.getApiKeyStatus(apiKeyManager.value.id)
    fetchData() // 刷新列表
  } catch (error: any) {
    message.error(error.message || t('common.failed'))
  } finally {
    apiKeyOperating.value = false
  }
}

// 保存 IP 白名单
const handleSaveAllowedIps = async () => {
  if (!apiKeyManager.value) return

  allowedIpsSaving.value = true
  try {
    await mtManagersApi.updateAllowedIps(apiKeyManager.value.id, editingAllowedIps.value)
    message.success(t('common.success'))
    // 刷新状态
    apiKeyStatus.value = await mtManagersApi.getApiKeyStatus(apiKeyManager.value.id)
    editingAllowedIps.value = [...(apiKeyStatus.value.apiKeyAllowedIps || [])]
  } catch (error: any) {
    message.error(error.message || t('common.failed'))
  } finally {
    allowedIpsSaving.value = false
  }
}

// 重置 IP 白名单
const resetAllowedIps = () => {
  if (apiKeyStatus.value) {
    editingAllowedIps.value = [...(apiKeyStatus.value.apiKeyAllowedIps || [])]
  }
}

const closeApiKeyResultModal = () => {
  showApiKeyResultModal.value = false
  apiKeyResult.value = null
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    message.success(t('mtManager.copiedToClipboard'))
  } catch {
    message.error(t('mtManager.copyFailed'))
  }
}

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return t('mtManager.neverUsed')
  return new Date(dateStr).toLocaleString()
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.page-container {
  padding: 0;
}

.page-header {
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.mb-4 {
  margin-bottom: 16px;
}

.empty-state-card {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state-card :deep(.n-card__content) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.password-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--n-color-target);
  border-radius: 4px;
  border: 1px solid var(--n-border-color);
}

/* API Key Modal Styles */
.api-key-modal-content {
  min-height: 100px;
}

.api-key-result-content {
  padding: 8px 0;
}

.credential-item {
  margin-bottom: 16px;
}

.credential-item:last-child {
  margin-bottom: 0;
}

.credential-label {
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--n-text-color-2);
}

.credential-value {
  display: flex;
  gap: 8px;
  align-items: center;
}

.credential-input {
  flex: 1;
  font-family: monospace;
}

/* Secret Display Styles */
.secret-display {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.secret-value {
  font-family: monospace;
  font-size: 12px;
  padding: 2px 6px;
  background: var(--n-color-target);
  border-radius: 4px;
  word-break: break-all;
}

.secret-masked {
  font-family: monospace;
  color: var(--n-text-color-3);
  letter-spacing: 2px;
}

/* IP Whitelist Section Styles */
.ip-whitelist-section {
  padding: 0 4px;
}

.ip-whitelist-actions {
  display: flex;
  gap: 8px;
}

/* Scopes Section Styles */
.scopes-section {
  padding: 0 4px;
}

.scopes-actions {
  display: flex;
  gap: 8px;
}

/* Generate API Key Modal Styles */
.generate-api-key-content {
  padding: 8px 0;
}

.scope-selection {
  margin-top: 16px;
}

.scope-label {
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--n-text-color-2);
}

.mt-4 {
  margin-top: 16px;
}
</style>
