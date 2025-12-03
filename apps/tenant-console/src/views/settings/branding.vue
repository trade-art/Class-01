<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('settings.branding') }}</h1>
      <n-button type="primary" :loading="saving" @click="handleSave">
        <template #icon>
          <span class="i-carbon-save"></span>
        </template>
        {{ t('common.save') }}
      </n-button>
    </div>

    <n-spin :show="loading">
      <div class="settings-grid">
        <!-- Logo Settings -->
        <n-card :title="t('settings.logoSettings')">
          <div class="upload-section">
            <div class="upload-item">
              <div class="upload-label">{{ t('settings.logo') }}</div>
              <div class="upload-preview">
                <img v-if="formData.logoUrl" :src="formData.logoUrl" alt="Logo" class="preview-image" />
                <div v-else class="preview-placeholder">
                  <span class="i-carbon-image text-3xl"></span>
                </div>
              </div>
              <n-upload
                :max="1"
                accept="image/*"
                :custom-request="handleLogoUpload"
                :show-file-list="false"
              >
                <n-button size="small">
                  <template #icon>
                    <span class="i-carbon-upload"></span>
                  </template>
                  {{ t('settings.uploadLogo') }}
                </n-button>
              </n-upload>
              <div class="upload-hint">{{ t('settings.logoHint') }}</div>
            </div>

            <div class="upload-item">
              <div class="upload-label">{{ t('settings.favicon') }}</div>
              <div class="upload-preview small">
                <img v-if="formData.faviconUrl" :src="formData.faviconUrl" alt="Favicon" class="preview-image" />
                <div v-else class="preview-placeholder">
                  <span class="i-carbon-image text-xl"></span>
                </div>
              </div>
              <n-upload
                :max="1"
                accept="image/x-icon,image/png"
                :custom-request="handleFaviconUpload"
                :show-file-list="false"
              >
                <n-button size="small">
                  <template #icon>
                    <span class="i-carbon-upload"></span>
                  </template>
                  {{ t('settings.uploadFavicon') }}
                </n-button>
              </n-upload>
              <div class="upload-hint">{{ t('settings.faviconHint') }}</div>
            </div>
          </div>
        </n-card>

        <!-- Company Info -->
        <n-card :title="t('settings.companyInfo')">
          <n-form
            ref="formRef"
            :model="formData"
            :rules="formRules"
            label-placement="left"
            label-width="120"
          >
            <n-form-item :label="t('settings.companyName')" path="companyName">
              <n-input v-model:value="formData.companyName" :placeholder="t('settings.companyNamePlaceholder')" />
            </n-form-item>

            <n-form-item :label="t('settings.companyEmail')" path="companyEmail">
              <n-input v-model:value="formData.companyEmail" :placeholder="t('settings.companyEmailPlaceholder')" />
            </n-form-item>

            <n-form-item :label="t('settings.companyPhone')" path="companyPhone">
              <n-input v-model:value="formData.companyPhone" :placeholder="t('settings.companyPhonePlaceholder')" />
            </n-form-item>

            <n-form-item :label="t('settings.companyAddress')" path="companyAddress">
              <n-input
                v-model:value="formData.companyAddress"
                type="textarea"
                :rows="3"
                :placeholder="t('settings.companyAddressPlaceholder')"
              />
            </n-form-item>

            <n-form-item :label="t('settings.website')" path="website">
              <n-input v-model:value="formData.website" :placeholder="t('settings.websitePlaceholder')" />
            </n-form-item>
          </n-form>
        </n-card>

        <!-- Theme Settings -->
        <n-card :title="t('settings.themeSettings')">
          <n-form label-placement="left" label-width="120">
            <n-form-item :label="t('settings.primaryColor')">
              <div class="color-picker-wrapper">
                <n-color-picker
                  v-model:value="formData.primaryColor"
                  :swatches="colorSwatches"
                />
                <span class="color-value">{{ formData.primaryColor }}</span>
              </div>
            </n-form-item>

            <n-form-item :label="t('settings.defaultTheme')">
              <n-radio-group v-model:value="formData.defaultTheme">
                <n-space>
                  <n-radio value="light">{{ t('settings.lightTheme') }}</n-radio>
                  <n-radio value="dark">{{ t('settings.darkTheme') }}</n-radio>
                  <n-radio value="system">{{ t('settings.systemTheme') }}</n-radio>
                </n-space>
              </n-radio-group>
            </n-form-item>

            <n-form-item :label="t('settings.defaultLanguage')">
              <n-select
                v-model:value="formData.defaultLanguage"
                :options="languageOptions"
                style="width: 200px"
              />
            </n-form-item>
          </n-form>
        </n-card>

        <!-- Preview -->
        <n-card :title="t('settings.preview')">
          <div class="preview-container" :style="previewStyle">
            <div class="preview-header">
              <img v-if="formData.logoUrl" :src="formData.logoUrl" alt="Logo" class="preview-logo" />
              <div v-else class="preview-logo-placeholder">
                <span class="i-carbon-enterprise"></span>
              </div>
              <span class="preview-company">{{ formData.companyName || 'Company Name' }}</span>
            </div>
            <div class="preview-content">
              <div class="preview-button" :style="{ backgroundColor: formData.primaryColor }">
                {{ t('settings.sampleButton') }}
              </div>
            </div>
          </div>
        </n-card>
      </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NSpin,
  NForm,
  NFormItem,
  NInput,
  NUpload,
  NColorPicker,
  NRadioGroup,
  NRadio,
  NSpace,
  NSelect,
  useMessage,
  type FormInst,
  type FormRules,
  type UploadCustomRequestOptions,
} from 'naive-ui'
import { settingsApi } from '@/api/settings'
import { useTenantStore } from '@/stores/tenant'

const { t } = useI18n()
const message = useMessage()
const tenantStore = useTenantStore()

const formRef = ref<FormInst | null>(null)
const loading = ref(false)
const saving = ref(false)

const formData = reactive({
  logoUrl: '',
  faviconUrl: '',
  companyName: '',
  companyEmail: '',
  companyPhone: '',
  companyAddress: '',
  website: '',
  primaryColor: '#18a058',
  defaultTheme: 'light' as 'light' | 'dark' | 'system',
  defaultLanguage: 'zh-CN',
})

const formRules: FormRules = {
  companyName: [{ required: true, message: () => t('settings.companyNameRequired'), trigger: 'blur' }],
  companyEmail: [{ type: 'email', message: () => t('settings.invalidEmail'), trigger: 'blur' }],
}

const colorSwatches = [
  '#18a058',
  '#2080f0',
  '#f0a020',
  '#d03050',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#ec4899',
]

const languageOptions = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
]

const previewStyle = computed(() => ({
  '--preview-primary': formData.primaryColor,
}))

const loadBranding = async () => {
  loading.value = true
  try {
    const data = await settingsApi.getBranding()
    Object.assign(formData, data)
  } catch (error) {
    console.error('Failed to load branding:', error)
  } finally {
    loading.value = false
  }
}

const handleLogoUpload = async ({ file }: UploadCustomRequestOptions) => {
  try {
    const formDataUpload = new FormData()
    formDataUpload.append('file', file.file as File)
    const result = await settingsApi.uploadLogo(formDataUpload)
    formData.logoUrl = result.url
    message.success(t('settings.uploadSuccess'))
  } catch (error: any) {
    message.error(error.message || t('settings.uploadError'))
  }
}

const handleFaviconUpload = async ({ file }: UploadCustomRequestOptions) => {
  try {
    const formDataUpload = new FormData()
    formDataUpload.append('file', file.file as File)
    const result = await settingsApi.uploadFavicon(formDataUpload)
    formData.faviconUrl = result.url
    message.success(t('settings.uploadSuccess'))
  } catch (error: any) {
    message.error(error.message || t('settings.uploadError'))
  }
}

const handleSave = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    await settingsApi.updateBranding(formData)
    // Update tenant store
    tenantStore.updateBranding({
      logoUrl: formData.logoUrl,
      faviconUrl: formData.faviconUrl,
      companyName: formData.companyName,
      primaryColor: formData.primaryColor,
    })
    message.success(t('settings.saveSuccess'))
  } catch (error: any) {
    message.error(error.message || t('settings.saveError'))
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadBranding()
})
</script>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.upload-section {
  display: flex;
  gap: 32px;
}

.upload-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.upload-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color-base);
}

.upload-preview {
  width: 120px;
  height: 120px;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.upload-preview.small {
  width: 64px;
  height: 64px;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.preview-placeholder {
  color: var(--text-color-disabled);
}

.upload-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  text-align: center;
}

.color-picker-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-value {
  font-family: monospace;
  font-size: 14px;
  color: var(--text-color-secondary);
}

.preview-container {
  padding: 24px;
  background-color: var(--body-color);
  border-radius: 8px;
  min-height: 200px;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 24px;
}

.preview-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
}

.preview-logo-placeholder {
  width: 40px;
  height: 40px;
  background-color: var(--preview-primary, var(--primary-color));
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
}

.preview-company {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color-base);
}

.preview-content {
  display: flex;
  justify-content: center;
}

.preview-button {
  padding: 8px 24px;
  color: white;
  border-radius: 4px;
  font-size: 14px;
}

@media (max-width: 1024px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .upload-section {
    flex-direction: column;
    align-items: center;
  }
}
</style>
