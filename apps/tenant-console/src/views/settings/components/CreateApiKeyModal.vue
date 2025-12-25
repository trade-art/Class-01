<template>
  <n-modal
    :show="show"
    :title="t('settings.createApiKey')"
    preset="dialog"
    style="width: 600px"
    @update:show="handleClose"
  >
    <n-form
      ref="formRef"
      :model="formData"
      :rules="formRules"
      label-placement="left"
      label-width="100"
    >
      <n-form-item :label="t('settings.keyName')" path="name">
        <n-input
          v-model:value="formData.name"
          :placeholder="t('settings.keyNamePlaceholder')"
          maxlength="50"
          show-count
        />
      </n-form-item>

      <n-form-item :label="t('settings.scopes')" path="scopes">
        <n-checkbox-group v-model:value="formData.scopes">
          <n-space vertical>
            <n-checkbox
              v-for="scope in availableScopes"
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
      </n-form-item>

      <n-form-item :label="t('settings.allowedIps')" path="allowedIps">
        <n-dynamic-tags v-model:value="formData.allowedIps" />
        <template #feedback>
          {{ t('settings.allowedIpsHint') }}
        </template>
      </n-form-item>

      <n-form-item :label="t('settings.rateLimit')" path="rateLimit">
        <n-input-number
          v-model:value="formData.rateLimit"
          :min="1"
          :max="10000"
          style="width: 200px"
        >
          <template #suffix>
            {{ t('settings.requestsPerMinute') }}
          </template>
        </n-input-number>
      </n-form-item>

      <n-form-item :label="t('settings.expiresAt')" path="expiresAt">
        <n-date-picker
          v-model:value="formData.expiresAtTs"
          type="datetime"
          :placeholder="t('settings.expiresAtPlaceholder')"
          clearable
          style="width: 100%"
          :is-date-disabled="isDateDisabled"
        />
        <template #feedback>
          {{ t('settings.expiresAtHint') }}
        </template>
      </n-form-item>
    </n-form>

    <template #action>
      <n-space justify="end">
        <n-button @click="handleClose(false)">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ t('common.create') }}
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
/**
 * API Key 创建弹窗
 * middleware-auth-refactor Task 34
 */
import { ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NButton,
  NSpace,
  NCheckboxGroup,
  NCheckbox,
  NDynamicTags,
  NDatePicker,
  useMessage,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import {
  apiKeysApi,
  getAvailableScopes,
  ApiKeyScope,
  type CreateApiKeyRequest,
} from '@/api/api-keys'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'success', apiKey: string): void
}>()

const { t } = useI18n()
const message = useMessage()

const formRef = ref<FormInst | null>(null)
const submitting = ref(false)
const availableScopes = getAvailableScopes()

const formData = reactive({
  name: '',
  scopes: [ApiKeyScope.ALL] as string[],
  allowedIps: [] as string[],
  rateLimit: 60,
  expiresAtTs: null as number | null,
})

const formRules: FormRules = {
  name: [
    { required: true, message: () => t('settings.keyNameRequired'), trigger: 'blur' },
    { min: 2, max: 50, message: () => t('settings.keyNameLength'), trigger: 'blur' },
  ],
  scopes: [
    {
      type: 'array',
      required: true,
      message: () => t('settings.scopesRequired'),
      trigger: 'change',
    },
  ],
  rateLimit: [
    { type: 'number', required: true, message: () => t('settings.rateLimitRequired'), trigger: 'blur' },
  ],
}

// IP 地址验证
const isValidIp = (ip: string): boolean => {
  // 支持 IPv4, IPv4 CIDR, 或 *
  if (ip === '*') return true
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
  if (!ipv4Regex.test(ip)) return false
  const parts = ip.split('/')[0].split('.')
  return parts.every((p) => parseInt(p) >= 0 && parseInt(p) <= 255)
}

// 日期限制：不能选择过去的日期
const isDateDisabled = (ts: number) => {
  return ts < Date.now() - 86400000 // 允许今天
}

// 重置表单
const resetForm = () => {
  Object.assign(formData, {
    name: '',
    scopes: [ApiKeyScope.ALL],
    allowedIps: [],
    rateLimit: 60,
    expiresAtTs: null,
  })
  formRef.value?.restoreValidation()
}

// 监听 show 变化，打开时重置表单
watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      resetForm()
    }
  }
)

const handleClose = (value: boolean) => {
  if (!value && !submitting.value) {
    emit('update:show', false)
  }
}

const handleSubmit = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  // 验证 IP 地址
  if (formData.allowedIps.length > 0) {
    const invalidIps = formData.allowedIps.filter((ip) => !isValidIp(ip))
    if (invalidIps.length > 0) {
      message.error(t('settings.invalidIpFormat', { ips: invalidIps.join(', ') }))
      return
    }
  }

  submitting.value = true
  try {
    const request: CreateApiKeyRequest = {
      name: formData.name.trim(),
      scopes: formData.scopes,
      allowedIps: formData.allowedIps.length > 0 ? formData.allowedIps : undefined,
      rateLimit: formData.rateLimit,
      expiresAt: formData.expiresAtTs
        ? new Date(formData.expiresAtTs).toISOString()
        : undefined,
    }

    const response = await apiKeysApi.create(request)
    message.success(t('settings.createApiKeySuccess'))
    emit('update:show', false)
    emit('success', response.apiKey)
  } catch (error: any) {
    message.error(error.message || t('common.error'))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
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
