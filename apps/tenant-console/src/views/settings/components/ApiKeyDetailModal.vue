<template>
  <n-modal
    :show="show"
    :title="t('settings.apiKeyDetail')"
    preset="dialog"
    style="width: 650px"
    @update:show="handleClose"
  >
    <template v-if="apiKey">
      <!-- 状态标签 -->
      <div class="status-row">
        <n-tag :type="statusInfo.type" size="medium">
          {{ statusInfo.label }}
        </n-tag>
        <span v-if="apiKey.revokedAt" class="revoked-info">
          {{ t('settings.revokedOn') }}: {{ formatDate(apiKey.revokedAt) }}
        </span>
      </div>

      <!-- 详情信息 -->
      <n-descriptions :column="2" label-placement="left" bordered class="detail-desc">
        <n-descriptions-item :label="t('settings.keyName')">
          <template v-if="!isEditing">
            {{ apiKey.name }}
          </template>
          <n-input
            v-else
            v-model:value="editData.name"
            size="small"
            :placeholder="t('settings.keyNamePlaceholder')"
          />
        </n-descriptions-item>

        <n-descriptions-item :label="t('settings.keyPrefix')" :content-style="{ textAlign: 'left' }">
          <div class="key-prefix-wrapper">
            <code class="key-prefix">{{ apiKey.keyPrefix }}...</code>
            <n-text depth="3" class="key-hint">{{ t('settings.keyPrefixHint') }}</n-text>
          </div>
        </n-descriptions-item>

        <n-descriptions-item :label="t('settings.rateLimit')">
          <template v-if="!isEditing">
            {{ apiKey.rateLimit }} {{ t('settings.requestsPerMinute') }}
          </template>
          <n-input-number
            v-else
            v-model:value="editData.rateLimit"
            size="small"
            :min="1"
            :max="10000"
            style="width: 150px"
          />
        </n-descriptions-item>

        <n-descriptions-item :label="t('settings.usageCount')">
          {{ apiKey.usageCount.toLocaleString() }}
        </n-descriptions-item>

        <n-descriptions-item :label="t('settings.lastUsed')">
          {{ apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : '-' }}
        </n-descriptions-item>

        <n-descriptions-item :label="t('settings.lastUsedIp')">
          {{ apiKey.lastUsedIp || '-' }}
        </n-descriptions-item>

        <n-descriptions-item :label="t('settings.expiresAt')">
          <template v-if="apiKey.expiresAt">
            <span :class="{ 'expired-text': isExpired }">
              {{ formatDate(apiKey.expiresAt) }}
            </span>
          </template>
          <template v-else>
            {{ t('settings.never') }}
          </template>
        </n-descriptions-item>

        <n-descriptions-item :label="t('settings.createdAt')">
          {{ formatDate(apiKey.createdAt) }}
        </n-descriptions-item>
      </n-descriptions>

      <!-- 作用域 -->
      <div class="section">
        <div class="section-title">{{ t('settings.scopes') }}</div>
        <template v-if="!isEditing">
          <n-space>
            <n-tag v-for="scope in apiKey.scopes" :key="scope" type="info" size="small">
              {{ getScopeLabel(scope) }}
            </n-tag>
          </n-space>
        </template>
        <template v-else>
          <!-- 全部权限单独处理 -->
          <n-checkbox
            :checked="isAllSelected"
            @update:checked="handleAllScopesChange"
            class="all-scope-checkbox"
          >
            <div class="scope-item">
              <span class="scope-label">全部权限</span>
              <span class="scope-desc">完整访问所有 API 功能</span>
            </div>
          </n-checkbox>
          <n-divider style="margin: 12px 0" />
          <!-- 其他作用域 -->
          <n-checkbox-group v-model:value="editData.scopes" @update:value="handleScopesChange">
            <n-space vertical>
              <n-checkbox
                v-for="scope in nonAllScopes"
                :key="scope.value"
                :value="scope.value"
              >
                <div class="scope-item">
                  <span class="scope-label">{{ scope.label }}</span>
                  <span class="scope-desc">{{ scope.description }}</span>
                </div>
              </n-checkbox>
            </n-space>
          </n-checkbox-group>
        </template>
      </div>

      <!-- 允许的 IP -->
      <div class="section">
        <div class="section-title">{{ t('settings.allowedIps') }}</div>
        <template v-if="!isEditing">
          <template v-if="apiKey.allowedIps && apiKey.allowedIps.length > 0">
            <n-space>
              <n-tag v-for="ip in apiKey.allowedIps" :key="ip" size="small">
                {{ ip }}
              </n-tag>
            </n-space>
          </template>
          <span v-else class="no-restrict">{{ t('settings.noIpRestriction') }}</span>
        </template>
        <n-dynamic-tags v-else v-model:value="editData.allowedIps" />
      </div>
    </template>

    <template #action>
      <n-space justify="space-between" style="width: 100%">
        <div>
          <n-button
            v-if="!isRevoked && !isEditing"
            type="error"
            ghost
            @click="handleRevoke"
          >
            {{ t('settings.revoke') }}
          </n-button>
        </div>
        <n-space>
          <template v-if="isEditing">
            <n-button @click="cancelEdit">{{ t('common.cancel') }}</n-button>
            <n-button type="primary" :loading="saving" @click="saveEdit">
              {{ t('common.save') }}
            </n-button>
          </template>
          <template v-else>
            <n-button v-if="!isRevoked" @click="startEdit">
              {{ t('common.edit') }}
            </n-button>
            <n-button @click="handleClose(false)">{{ t('common.close') }}</n-button>
          </template>
        </n-space>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
/**
 * API Key 详情/编辑弹窗
 * middleware-auth-refactor Task 35
 */
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NModal,
  NDescriptions,
  NDescriptionsItem,
  NTag,
  NSpace,
  NButton,
  NInput,
  NInputNumber,
  NDynamicTags,
  NCheckboxGroup,
  NCheckbox,
  NDivider,
  NText,
  useMessage,
  useDialog,
} from 'naive-ui'
import {
  apiKeysApi,
  getApiKeyStatus,
  statusConfig,
  scopeLabels,
  getAvailableScopes,
  mapLegacyScopes,
  ApiKeyScope,
  type ApiKeyListItem,
} from '@/api/api-keys'

const props = defineProps<{
  show: boolean
  apiKey: ApiKeyListItem | null
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'update'): void
  (e: 'revoke'): void
}>()

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()

const isEditing = ref(false)
const saving = ref(false)
const availableScopes = getAvailableScopes()

const editData = reactive({
  name: '',
  rateLimit: 60,
  allowedIps: [] as string[],
  scopes: [] as string[],
})

// 计算状态
const status = computed(() => (props.apiKey ? getApiKeyStatus(props.apiKey) : 'active'))
const isRevoked = computed(() => status.value === 'revoked')
const isExpired = computed(() => status.value === 'expired')

const statusInfo = computed(() => {
  const config = statusConfig[status.value]
  return {
    type: config.type,
    label: config.label,
  }
})

// 获取除"全部权限"外的其他作用域选项
const nonAllScopes = computed(() =>
  availableScopes.filter((s) => s.value !== ApiKeyScope.ALL)
)

// 获取所有非 '*' 的作用域值
const allNonAllScopeValues = computed(() =>
  nonAllScopes.value.map((s) => s.value)
)

// 检查是否选择了"全部权限"（包含 '*' 或者所有其他作用域都被选中）
const isAllSelected = computed(() => {
  if (editData.scopes.includes(ApiKeyScope.ALL)) return true
  // 如果所有其他作用域都被选中，也视为"全部权限"
  return allNonAllScopeValues.value.every((v) => editData.scopes.includes(v))
})

// 处理"全部权限"复选框变化
const handleAllScopesChange = (checked: boolean) => {
  if (checked) {
    // 选中"全部权限"时，勾选所有作用域
    editData.scopes = [...allNonAllScopeValues.value]
  } else {
    // 取消"全部权限"时，清空所有选择
    editData.scopes = []
  }
}

// 处理单个作用域复选框变化
const handleScopesChange = (values: string[]) => {
  editData.scopes = values
}

// 格式化日期
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString()
}

// 获取作用域标签
const getScopeLabel = (scope: string) => {
  return scopeLabels[scope]?.label || scope
}

// 监听 apiKey 变化，重置编辑状态
watch(
  () => props.apiKey,
  (newVal) => {
    if (newVal) {
      isEditing.value = false
      Object.assign(editData, {
        name: newVal.name,
        rateLimit: newVal.rateLimit,
        allowedIps: [...(newVal.allowedIps || [])],
        scopes: [...(newVal.scopes || [])],
      })
    }
  },
  { immediate: true }
)

const handleClose = (value: boolean) => {
  if (!value && !saving.value) {
    isEditing.value = false
    emit('update:show', false)
  }
}

const startEdit = () => {
  if (props.apiKey) {
    // 将旧版作用域映射为新版，确保 checkbox 能正确选中
    const mappedScopes = mapLegacyScopes(props.apiKey.scopes || [])
    Object.assign(editData, {
      name: props.apiKey.name,
      rateLimit: props.apiKey.rateLimit,
      allowedIps: [...(props.apiKey.allowedIps || [])],
      scopes: mappedScopes,
    })
    isEditing.value = true
  }
}

const cancelEdit = () => {
  isEditing.value = false
}

// 检查是否有更改
const hasChanges = () => {
  if (!props.apiKey) return false

  const nameChanged = editData.name.trim() !== props.apiKey.name
  const rateLimitChanged = editData.rateLimit !== props.apiKey.rateLimit

  const originalIps = props.apiKey.allowedIps || []
  const ipsChanged = editData.allowedIps.length !== originalIps.length ||
    !editData.allowedIps.every((ip, i) => ip === originalIps[i])

  const originalScopes = props.apiKey.scopes || []
  const scopesChanged = editData.scopes.length !== originalScopes.length ||
    !editData.scopes.every((s) => originalScopes.includes(s))

  return nameChanged || rateLimitChanged || ipsChanged || scopesChanged
}

const saveEdit = async () => {
  if (!props.apiKey) return

  // 验证
  if (!editData.name.trim()) {
    message.error(t('settings.keyNameRequired'))
    return
  }

  // 检查是否有实际更改
  if (!hasChanges()) {
    isEditing.value = false
    return
  }

  saving.value = true
  try {
    await apiKeysApi.update(props.apiKey.id, {
      name: editData.name.trim(),
      rateLimit: editData.rateLimit,
      allowedIps: editData.allowedIps,
      scopes: editData.scopes,
    })
    message.success(t('settings.updateSuccess'))
    isEditing.value = false
    emit('update')
  } catch (error: any) {
    message.error(error.message || t('common.error'))
  } finally {
    saving.value = false
  }
}

const handleRevoke = () => {
  if (!props.apiKey) return

  dialog.warning({
    title: t('settings.revoke'),
    content: t('settings.revokeConfirm', { name: props.apiKey.name }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await apiKeysApi.revoke(props.apiKey!.id)
        message.success(t('settings.revokeSuccess'))
        emit('revoke')
      } catch (error: any) {
        message.error(error.message || t('common.error'))
      }
    },
  })
}
</script>

<style scoped>
.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.revoked-info {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.detail-desc {
  margin-bottom: 16px;
}

/* 强制内容左对齐 */
.detail-desc :deep(td) {
  text-align: left !important;
}

.detail-desc :deep(.n-descriptions-table-content) {
  text-align: left !important;
}

.key-prefix-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-right: auto;
}

.key-prefix {
  font-family: monospace;
  font-size: 12px;
  padding: 2px 6px;
  background: var(--code-color);
  border-radius: 4px;
}

.key-hint {
  font-size: 11px;
  line-height: 1.4;
  padding-left: 6px;
}

.section {
  margin-bottom: 16px;
}

.section-title {
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.no-restrict {
  color: var(--text-color-tertiary);
  font-style: italic;
}

.expired-text {
  color: var(--error-color);
}

.scope-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.scope-label {
  font-weight: 500;
}

.scope-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
}
</style>
