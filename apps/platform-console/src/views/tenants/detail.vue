<template>
  <div class="page-container">
    <div class="page-header flex items-center gap-4">
      <n-button text @click="$router.back()">
        <template #icon>
          <n-icon><i class="i-carbon-arrow-left" /></n-icon>
        </template>
        {{ t('common.back') }}
      </n-button>
      <h1 class="page-title">{{ tenant?.name }}</h1>
      <n-tag :type="getStatusType(tenant?.status)" v-if="tenant?.status">
        {{ t(`tenant.status.${tenant?.status?.toLowerCase()}`) }}
      </n-tag>
    </div>

    <n-spin :show="loading">
      <n-tabs type="line" animated>
        <!-- Basic Info Tab -->
        <n-tab-pane name="info" :tab="t('tenant.basicInfo')">
          <n-grid :cols="24" :x-gap="16">
            <!-- Basic Info & Instances -->
            <n-gi :span="16">
              <n-card :title="t('tenant.basicInfo')" class="mb-4">
                <n-descriptions :columns="2">
                  <n-descriptions-item :label="t('tenant.code')">{{ tenant?.code }}</n-descriptions-item>
                  <n-descriptions-item :label="t('tenant.plan')">
                    <n-space align="center">
                      <n-tag :type="getPlanType(tenant?.plan)" size="small">
                        {{ t(`tenant.plans.${tenant?.plan?.toLowerCase()}`) }}
                      </n-tag>
                      <n-button text type="primary" size="small" @click="showSubscriptionModal = true">
                        {{ t('tenant.subscription.change') }}
                      </n-button>
                    </n-space>
                  </n-descriptions-item>
                  <n-descriptions-item :label="t('common.email')">{{ tenant?.email }}</n-descriptions-item>
                  <n-descriptions-item :label="t('common.phone')">{{ tenant?.phone || '-' }}</n-descriptions-item>
                  <n-descriptions-item :label="t('common.company')">{{ tenant?.company || '-' }}</n-descriptions-item>
                  <n-descriptions-item :label="t('common.createdAt')">
                    {{ formatDate(tenant?.createdAt) }}
                  </n-descriptions-item>
                  <n-descriptions-item :label="t('tenant.maxInstances')">
                    {{ tenant?.maxInstances }}
                  </n-descriptions-item>
                  <n-descriptions-item :label="t('tenant.maxAdmins')">
                    {{ tenant?.maxAdmins }}
                  </n-descriptions-item>
                </n-descriptions>
              </n-card>

              <n-card :title="t('tenant.instances.title')">
                <template #header-extra>
                  <n-button type="primary" size="small" @click="showInstanceModal = true">
                    <template #icon>
                      <n-icon><i class="i-carbon-add" /></n-icon>
                    </template>
                    {{ t('tenant.instances.add') }}
                  </n-button>
                </template>

                <n-data-table
                  :columns="instanceColumns"
                  :data="tenant?.instances || []"
                  :pagination="false"
                />
              </n-card>
            </n-gi>

            <!-- Stats -->
            <n-gi :span="8">
              <n-card :title="t('tenant.stats.title')">
                <div class="space-y-3">
                  <div class="flex-between py-2 border-b border-base">
                    <span class="text-secondary">{{ t('tenant.stats.adminCount') }}</span>
                    <span>{{ tenant?._count?.admins || 0 }} / {{ tenant?.maxAdmins }}</span>
                  </div>
                  <div class="flex-between py-2 border-b border-base">
                    <span class="text-secondary">{{ t('tenant.stats.instanceCount') }}</span>
                    <span>{{ tenant?._count?.instances || 0 }} / {{ tenant?.maxInstances }}</span>
                  </div>
                  <div class="flex-between py-2">
                    <span class="text-secondary">{{ t('tenant.stats.invoiceCount') }}</span>
                    <span>{{ tenant?._count?.invoices || 0 }}</span>
                  </div>
                </div>
              </n-card>
            </n-gi>
          </n-grid>
        </n-tab-pane>

        <!-- White-label Config Tab -->
        <n-tab-pane name="whitelabel" :tab="t('tenant.whitelabel.title')">
          <n-card>
            <n-form :model="whitelabelForm" label-placement="top">
              <n-grid :cols="24" :x-gap="16">
                <n-gi :span="12">
                  <n-form-item :label="t('tenant.whitelabel.companyName')">
                    <n-input
                      v-model:value="whitelabelForm.companyName"
                      :placeholder="t('tenant.whitelabel.companyNamePlaceholder')"
                    />
                  </n-form-item>
                </n-gi>
                <n-gi :span="12">
                  <n-form-item :label="t('tenant.whitelabel.primaryColor')">
                    <n-color-picker
                      v-model:value="whitelabelForm.primaryColor"
                      :show-alpha="false"
                      :modes="['hex']"
                    />
                  </n-form-item>
                </n-gi>
                <n-gi :span="24">
                  <n-form-item :label="t('tenant.whitelabel.logoUrl')">
                    <n-space vertical style="width: 100%">
                      <n-input
                        v-model:value="whitelabelForm.logoUrl"
                        :placeholder="t('tenant.whitelabel.logoUrlPlaceholder')"
                      />
                      <div v-if="whitelabelForm.logoUrl" class="logo-preview">
                        <img
                          :src="whitelabelForm.logoUrl"
                          :alt="t('tenant.whitelabel.logoPreview')"
                          @error="handleLogoError"
                        />
                      </div>
                      <n-upload
                        :max="1"
                        accept="image/*"
                        :custom-request="handleLogoUpload"
                        :show-file-list="false"
                      >
                        <n-button>
                          <template #icon>
                            <n-icon><i class="i-carbon-upload" /></n-icon>
                          </template>
                          {{ t('tenant.whitelabel.uploadLogo') }}
                        </n-button>
                      </n-upload>
                    </n-space>
                  </n-form-item>
                </n-gi>
              </n-grid>

              <div class="mt-4">
                <n-button type="primary" :loading="savingWhitelabel" @click="handleSaveWhitelabel">
                  {{ t('common.save') }}
                </n-button>
              </div>
            </n-form>

            <!-- Preview Card -->
            <n-divider>{{ t('tenant.whitelabel.preview') }}</n-divider>
            <div class="whitelabel-preview" :style="{ '--preview-primary': whitelabelForm.primaryColor }">
              <div class="preview-header">
                <img
                  v-if="whitelabelForm.logoUrl"
                  :src="whitelabelForm.logoUrl"
                  class="preview-logo"
                  @error="handleLogoError"
                />
                <span class="preview-company">{{ whitelabelForm.companyName || tenant?.name }}</span>
              </div>
              <div class="preview-button">{{ t('tenant.whitelabel.sampleButton') }}</div>
            </div>
          </n-card>
        </n-tab-pane>

        <!-- Admins Tab -->
        <n-tab-pane name="admins" :tab="t('tenant.admins.title')">
          <n-card>
            <template #header>
              <div class="flex-between">
                <span>{{ t('tenant.admins.title') }}</span>
                <n-button type="primary" size="small" @click="openAdminModal()">
                  <template #icon>
                    <n-icon><i class="i-carbon-add" /></n-icon>
                  </template>
                  {{ t('tenantAdmin.create') }}
                </n-button>
              </div>
            </template>

            <n-data-table
              :columns="adminColumns"
              :data="tenant?.admins || []"
              :pagination="false"
            />
            <n-empty v-if="!tenant?.admins?.length" :description="t('tenant.admins.noAdmins')" />
          </n-card>
        </n-tab-pane>
      </n-tabs>
    </n-spin>

    <!-- Add Instance Modal -->
    <n-modal
      v-model:show="showInstanceModal"
      preset="dialog"
      :title="t('tenant.instances.add')"
      :style="{ width: '500px' }"
      :mask-closable="false"
    >
      <n-form :model="instanceForm" label-placement="top">
        <n-form-item :label="t('instance.name')" required>
          <n-input v-model:value="instanceForm.name" :placeholder="t('instance.validation.nameRequired')" />
        </n-form-item>
        <n-grid :cols="3" :x-gap="16">
          <n-gi :span="2">
            <n-form-item :label="t('instance.host')" required>
              <n-input v-model:value="instanceForm.host" placeholder="middleware.example.com" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item :label="t('instance.port')" required>
              <n-input-number v-model:value="instanceForm.port" :min="1" :max="65535" style="width: 100%" />
            </n-form-item>
          </n-gi>
        </n-grid>
        <n-form-item :label="t('common.description')">
          <n-input
            v-model:value="instanceForm.description"
            type="textarea"
            :placeholder="t('common.description')"
          />
        </n-form-item>
      </n-form>

      <template #action>
        <n-button @click="showInstanceModal = false">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="saving" @click="handleAddInstance">
          {{ t('common.create') }}
        </n-button>
      </template>
    </n-modal>

    <!-- Admin Create/Edit Modal -->
    <n-modal
      v-model:show="showAdminModal"
      preset="dialog"
      :title="editingAdmin ? t('tenantAdmin.edit') : t('tenantAdmin.create')"
      :style="{ width: '500px' }"
      :mask-closable="false"
    >
      <n-form ref="adminFormRef" :model="adminForm" :rules="adminRules" label-placement="top">
        <n-form-item path="name" :label="t('tenantAdmin.name')">
          <n-input v-model:value="adminForm.name" :placeholder="t('tenantAdmin.namePlaceholder')" />
        </n-form-item>
        <n-form-item path="email" :label="t('tenantAdmin.email')">
          <n-input v-model:value="adminForm.email" :placeholder="t('tenantAdmin.emailPlaceholder')" :disabled="!!editingAdmin" />
        </n-form-item>
        <n-form-item v-if="!editingAdmin" path="password" :label="t('tenantAdmin.password')">
          <n-input
            v-model:value="adminForm.password"
            type="password"
            show-password-on="click"
            :placeholder="t('tenantAdmin.passwordPlaceholder')"
          />
        </n-form-item>
        <n-form-item path="isActive" :label="t('common.status')">
          <n-switch v-model:value="adminForm.isActive">
            <template #checked>{{ t('common.active') }}</template>
            <template #unchecked>{{ t('common.inactive') }}</template>
          </n-switch>
        </n-form-item>
      </n-form>

      <template #action>
        <n-button @click="resetAdminForm">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="saving" @click="handleSaveAdmin">
          {{ editingAdmin ? t('common.update') : t('common.create') }}
        </n-button>
      </template>
    </n-modal>

    <!-- Reset Password Modal -->
    <n-modal
      v-model:show="showPasswordModal"
      preset="dialog"
      :title="t('tenantAdmin.resetPassword')"
      :style="{ width: '400px' }"
      :mask-closable="false"
    >
      <n-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-placement="top">
        <n-form-item path="newPassword" :label="t('tenantAdmin.newPassword')">
          <n-input
            v-model:value="passwordForm.newPassword"
            type="password"
            show-password-on="click"
            :placeholder="t('tenantAdmin.newPasswordPlaceholder')"
          />
        </n-form-item>
        <n-form-item path="confirmPassword" :label="t('tenantAdmin.confirmPassword')">
          <n-input
            v-model:value="passwordForm.confirmPassword"
            type="password"
            show-password-on="click"
            :placeholder="t('tenantAdmin.confirmPasswordPlaceholder')"
          />
        </n-form-item>
      </n-form>

      <template #action>
        <n-button @click="showPasswordModal = false">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="saving" @click="handleResetPassword">
          {{ t('common.confirm') }}
        </n-button>
      </template>
    </n-modal>

    <!-- Subscription Change Modal -->
    <n-modal
      v-model:show="showSubscriptionModal"
      preset="dialog"
      :title="t('tenant.subscription.changeTitle')"
      :style="{ width: '600px' }"
      :mask-closable="false"
    >
      <n-spin :show="loadingPlans">
        <div class="subscription-plans">
          <n-grid :cols="2" :x-gap="16" :y-gap="16">
            <n-gi v-for="plan in subscriptionPlans" :key="plan.id">
              <div
                class="plan-card"
                :class="{ 'plan-selected': selectedPlan === plan.code, 'plan-current': tenant?.plan === plan.code }"
                @click="selectedPlan = plan.code"
              >
                <div class="plan-header">
                  <span class="plan-name">{{ plan.name }}</span>
                  <n-tag v-if="tenant?.plan === plan.code" type="info" size="small">
                    {{ t('tenant.subscription.current') }}
                  </n-tag>
                </div>
                <div class="plan-price">
                  <span class="price-amount">¥{{ plan.price }}</span>
                  <span class="price-cycle">/{{ t('subscription.month') }}</span>
                </div>
                <div class="plan-features">
                  <div class="feature-item">
                    <n-icon><i class="i-carbon-server-dns" /></n-icon>
                    <span>{{ t('subscription.maxInstances') }}: {{ plan.maxInstances === -1 ? t('common.unlimited') : plan.maxInstances }}</span>
                  </div>
                  <div class="feature-item">
                    <n-icon><i class="i-carbon-user-admin" /></n-icon>
                    <span>{{ t('subscription.maxAdmins') }}: {{ plan.maxAdmins === -1 ? t('common.unlimited') : plan.maxAdmins }}</span>
                  </div>
                </div>
              </div>
            </n-gi>
          </n-grid>
        </div>
      </n-spin>

      <template #action>
        <n-button @click="showSubscriptionModal = false">{{ t('common.cancel') }}</n-button>
        <n-button
          type="primary"
          :loading="changingPlan"
          :disabled="!selectedPlan || selectedPlan === tenant?.plan"
          @click="handleChangePlan"
        >
          {{ t('tenant.subscription.confirm') }}
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, h, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NIcon,
  NTag,
  NSpin,
  NGrid,
  NGi,
  NDescriptions,
  NDescriptionsItem,
  NDataTable,
  NEmpty,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSwitch,
  NTabs,
  NTabPane,
  NDropdown,
  NColorPicker,
  NUpload,
  NSpace,
  NDivider,
  useMessage,
  useDialog,
  type DataTableColumns,
  type FormInst,
  type FormRules,
  type UploadCustomRequestOptions,
} from 'naive-ui'
import { api } from '@/api'
import dayjs from 'dayjs'

interface TenantAdmin {
  id: string
  name: string
  email: string
  isActive: boolean
  lastLoginAt?: string
  createdAt: string
}

const { t } = useI18n()
const route = useRoute()
const message = useMessage()
const dialog = useDialog()
const tenantId = route.params.id as string

const loading = ref(false)
const saving = ref(false)
const tenant = ref<any>(null)
const showInstanceModal = ref(false)
const showAdminModal = ref(false)
const showPasswordModal = ref(false)
const editingAdmin = ref<TenantAdmin | null>(null)
const resetPasswordAdmin = ref<TenantAdmin | null>(null)
const adminFormRef = ref<FormInst | null>(null)
const passwordFormRef = ref<FormInst | null>(null)

const instanceForm = reactive({
  name: '',
  host: '',
  port: 8080,
  description: '',
})

const adminForm = reactive({
  name: '',
  email: '',
  password: '',
  isActive: true,
})

const passwordForm = reactive({
  newPassword: '',
  confirmPassword: '',
})

const whitelabelForm = reactive({
  companyName: '',
  primaryColor: '#18a058',
  logoUrl: '',
})

const savingWhitelabel = ref(false)

// Subscription change
const showSubscriptionModal = ref(false)
const loadingPlans = ref(false)
const changingPlan = ref(false)
const subscriptionPlans = ref<any[]>([])
const selectedPlan = ref<string | null>(null)

const adminRules = computed<FormRules>(() => ({
  name: [{ required: true, message: t('tenantAdmin.nameRequired'), trigger: 'blur' }],
  email: [
    { required: true, message: t('tenantAdmin.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('tenantAdmin.emailInvalid'), trigger: 'blur' },
  ],
  password: editingAdmin.value ? [] : [
    { required: true, message: t('tenantAdmin.passwordRequired'), trigger: 'blur' },
    { min: 8, message: t('tenantAdmin.passwordMinLength'), trigger: 'blur' },
  ],
}))

const passwordRules = computed<FormRules>(() => ({
  newPassword: [
    { required: true, message: t('tenantAdmin.passwordRequired'), trigger: 'blur' },
    { min: 8, message: t('tenantAdmin.passwordMinLength'), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: t('tenantAdmin.confirmPasswordRequired'), trigger: 'blur' },
    {
      validator: (_: any, value: string) => value === passwordForm.newPassword,
      message: t('tenantAdmin.passwordMismatch'),
      trigger: 'blur',
    },
  ],
}))

const instanceColumns = computed<DataTableColumns<any>>(() => [
  { title: t('instance.name'), key: 'name' },
  {
    title: t('instance.host'),
    key: 'host',
    render: (row) => `${row.host}:${row.port}`,
  },
  {
    title: t('common.status'),
    key: 'status',
    render: (row) => h(NTag, {
      type: row.status === 'ONLINE' ? 'success' : row.status === 'OFFLINE' ? 'warning' : 'error',
      size: 'small',
    }, () => t(`instance.status.${row.status?.toLowerCase()}`)),
  },
  {
    title: t('instance.lastHealthCheck'),
    key: 'lastHealthCheck',
    render: (row) => row.lastHealthCheck ? formatDate(row.lastHealthCheck) : '-',
  },
])

const adminColumns = computed<DataTableColumns<TenantAdmin>>(() => [
  { title: t('tenantAdmin.name'), key: 'name' },
  { title: t('tenantAdmin.email'), key: 'email' },
  {
    title: t('common.status'),
    key: 'isActive',
    render: (row) => h(NTag, {
      type: row.isActive ? 'success' : 'default',
      size: 'small',
    }, () => row.isActive ? t('common.active') : t('common.inactive')),
  },
  {
    title: t('tenantAdmin.lastLogin'),
    key: 'lastLoginAt',
    render: (row) => row.lastLoginAt ? formatDate(row.lastLoginAt) : '-',
  },
  {
    title: t('common.actions'),
    key: 'actions',
    width: 150,
    render: (row) => h(NDropdown, {
      trigger: 'click',
      options: [
        { label: t('common.edit'), key: 'edit' },
        { label: t('tenantAdmin.resetPassword'), key: 'resetPassword' },
        { type: 'divider', key: 'd1' },
        { label: t('common.delete'), key: 'delete' },
      ],
      onSelect: (key: string) => handleAdminAction(key, row),
    }, () => h(NButton, { text: true, type: 'primary' }, () => t('common.actions'))),
  },
])

function getStatusType(status: string | undefined): 'default' | 'info' | 'success' | 'warning' | 'error' {
  if (!status) return 'default'
  const types: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
    ACTIVE: 'success',
    PENDING: 'warning',
    SUSPENDED: 'error',
  }
  return types[status] || 'default'
}

function getPlanType(plan: string | undefined): 'default' | 'info' | 'success' | 'warning' | 'error' {
  if (!plan) return 'default'
  const types: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
    TRIAL: 'default',
    BASIC: 'info',
    PROFESSIONAL: 'success',
    ENTERPRISE: 'warning',
  }
  return types[plan] || 'default'
}

function formatDate(date: string | undefined) {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

async function loadTenant() {
  loading.value = true
  try {
    tenant.value = await api.tenants.get(tenantId)
    initWhitelabelForm()
  } catch {
    message.error(t('tenant.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function handleAddInstance() {
  if (!instanceForm.name || !instanceForm.host) {
    message.warning(t('instance.validation.fillRequired'))
    return
  }

  saving.value = true
  try {
    await api.instances.create({
      tenantId,
      ...instanceForm,
    })
    message.success(t('instance.addSuccess'))
    showInstanceModal.value = false
    loadTenant()

    // Reset form
    instanceForm.name = ''
    instanceForm.host = ''
    instanceForm.port = 8080
    instanceForm.description = ''
  } catch (error: any) {
    message.error(error.message || t('instance.addFailed'))
  } finally {
    saving.value = false
  }
}

function openAdminModal(admin?: TenantAdmin) {
  editingAdmin.value = admin || null
  if (admin) {
    adminForm.name = admin.name
    adminForm.email = admin.email
    adminForm.password = ''
    adminForm.isActive = admin.isActive
  } else {
    adminForm.name = ''
    adminForm.email = ''
    adminForm.password = ''
    adminForm.isActive = true
  }
  showAdminModal.value = true
}

function resetAdminForm() {
  showAdminModal.value = false
  editingAdmin.value = null
  adminForm.name = ''
  adminForm.email = ''
  adminForm.password = ''
  adminForm.isActive = true
}

async function handleSaveAdmin() {
  try {
    await adminFormRef.value?.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    if (editingAdmin.value) {
      await api.tenantAdmins.update(tenantId, editingAdmin.value.id, {
        name: adminForm.name,
        isActive: adminForm.isActive,
      })
      message.success(t('common.updateSuccess'))
    } else {
      await api.tenantAdmins.create(tenantId, {
        name: adminForm.name,
        email: adminForm.email,
        password: adminForm.password,
        isActive: adminForm.isActive,
      })
      message.success(t('common.createSuccess'))
    }
    resetAdminForm()
    loadTenant()
  } catch (error: any) {
    message.error(error.message || t('common.operationFailed'))
  } finally {
    saving.value = false
  }
}

function handleAdminAction(key: string, admin: TenantAdmin) {
  if (key === 'edit') {
    openAdminModal(admin)
  } else if (key === 'resetPassword') {
    resetPasswordAdmin.value = admin
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
    showPasswordModal.value = true
  } else if (key === 'delete') {
    dialog.error({
      title: t('common.confirmDelete'),
      content: t('tenantAdmin.deleteConfirm', { name: admin.name }),
      positiveText: t('common.delete'),
      negativeText: t('common.cancel'),
      onPositiveClick: async () => {
        try {
          await api.tenantAdmins.delete(tenantId, admin.id)
          message.success(t('common.deleteSuccess'))
          loadTenant()
        } catch {
          message.error(t('common.deleteFailed'))
        }
      },
    })
  }
}

async function handleResetPassword() {
  try {
    await passwordFormRef.value?.validate()
  } catch {
    return
  }

  if (!resetPasswordAdmin.value) return

  saving.value = true
  try {
    await api.tenantAdmins.resetPassword(tenantId, resetPasswordAdmin.value.id, {
      newPassword: passwordForm.newPassword,
    })
    message.success(t('tenantAdmin.passwordChanged'))
    showPasswordModal.value = false
    resetPasswordAdmin.value = null
  } catch (error: any) {
    message.error(error.message || t('common.operationFailed'))
  } finally {
    saving.value = false
  }
}

function initWhitelabelForm() {
  if (tenant.value?.whitelabelConfig) {
    whitelabelForm.companyName = tenant.value.whitelabelConfig.companyName || ''
    whitelabelForm.primaryColor = tenant.value.whitelabelConfig.primaryColor || '#18a058'
    whitelabelForm.logoUrl = tenant.value.whitelabelConfig.logoUrl || ''
  }
}

function handleLogoError(e: Event) {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}

async function handleLogoUpload({ file }: UploadCustomRequestOptions) {
  // In a real implementation, this would upload to a file server
  // For now, we'll create a local URL or accept external URLs
  if (file.file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      whitelabelForm.logoUrl = e.target?.result as string
    }
    reader.readAsDataURL(file.file)
  }
}

async function handleSaveWhitelabel() {
  savingWhitelabel.value = true
  try {
    await api.tenants.update(tenantId, {
      whitelabelConfig: {
        companyName: whitelabelForm.companyName,
        primaryColor: whitelabelForm.primaryColor,
        logoUrl: whitelabelForm.logoUrl,
      },
    })
    message.success(t('common.updateSuccess'))
    loadTenant()
  } catch (error: any) {
    message.error(error.message || t('common.operationFailed'))
  } finally {
    savingWhitelabel.value = false
  }
}

async function loadSubscriptionPlans() {
  loadingPlans.value = true
  try {
    const result = await api.subscriptions.list() as any
    subscriptionPlans.value = Array.isArray(result) ? result : (result.data || [])
    selectedPlan.value = tenant.value?.plan || null
  } catch {
    subscriptionPlans.value = []
  } finally {
    loadingPlans.value = false
  }
}

async function handleChangePlan() {
  if (!selectedPlan.value || selectedPlan.value === tenant.value?.plan) return

  changingPlan.value = true
  try {
    await api.tenants.update(tenantId, { plan: selectedPlan.value })
    message.success(t('tenant.subscription.changeSuccess'))
    showSubscriptionModal.value = false
    loadTenant()
  } catch (error: any) {
    message.error(error.message || t('common.operationFailed'))
  } finally {
    changingPlan.value = false
  }
}

// Watch for subscription modal open to load plans
watch(showSubscriptionModal, (val) => {
  if (val) {
    loadSubscriptionPlans()
  }
})

onMounted(() => {
  loadTenant()
})
</script>

<style scoped>
.logo-preview {
  width: 200px;
  height: 80px;
  border: 1px dashed var(--border-color);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.logo-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.whitelabel-preview {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  background: var(--card-color);
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 16px;
}

.preview-logo {
  height: 32px;
  max-width: 120px;
  object-fit: contain;
}

.preview-company {
  font-weight: 600;
  font-size: 16px;
}

.preview-button {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 4px;
  background: var(--preview-primary, #18a058);
  color: white;
  font-size: 14px;
}

/* Subscription Plans */
.subscription-plans {
  padding: 8px 0;
}

.plan-card {
  border: 2px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.plan-card:hover {
  border-color: var(--primary-color);
}

.plan-card.plan-selected {
  border-color: var(--primary-color);
  background: var(--primary-color-hover);
}

.plan-card.plan-current {
  background: var(--info-color-suppl);
}

.plan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.plan-name {
  font-weight: 600;
  font-size: 16px;
}

.plan-price {
  margin-bottom: 12px;
}

.price-amount {
  font-size: 24px;
  font-weight: 700;
  color: var(--primary-color);
}

.price-cycle {
  font-size: 14px;
  color: var(--text-color-3);
}

.plan-features {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color-2);
}
</style>
