<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('settings.admins') }}</h1>
      <n-button type="primary" @click="handleCreate">
        <template #icon>
          <span class="i-carbon-add"></span>
        </template>
        {{ t('settings.addAdmin') }}
      </n-button>
    </div>

    <!-- Admins Table -->
    <n-card>
      <n-data-table
        :columns="columns"
        :data="admins"
        :loading="loading"
        :pagination="false"
        :row-key="(row: TenantAdmin) => row.id"
      />
    </n-card>

    <!-- Create/Edit Modal -->
    <n-modal
      v-model:show="showModal"
      :title="editingAdmin ? t('settings.editAdmin') : t('settings.addAdmin')"
      preset="dialog"
      style="width: 500px"
    >
      <n-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-placement="left"
        label-width="80"
      >
        <n-form-item :label="t('settings.name')" path="name">
          <n-input v-model:value="formData.name" :placeholder="t('settings.namePlaceholder')" />
        </n-form-item>

        <n-form-item :label="t('settings.email')" path="email">
          <n-input
            v-model:value="formData.email"
            :placeholder="t('settings.emailPlaceholder')"
            :disabled="!!editingAdmin"
          />
        </n-form-item>

        <n-form-item :label="t('settings.role')" path="role">
          <n-select
            v-model:value="formData.role"
            :options="roleOptions"
            :placeholder="t('settings.rolePlaceholder')"
          />
        </n-form-item>

        <n-form-item v-if="!editingAdmin" :label="t('settings.password')" path="password">
          <n-input
            v-model:value="formData.password"
            type="password"
            show-password-on="click"
            :placeholder="t('settings.passwordPlaceholder')"
          />
        </n-form-item>
      </n-form>

      <template #action>
        <n-space justify="end">
          <n-button @click="showModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="submitting" @click="handleSubmit">
            {{ t('common.confirm') }}
          </n-button>
        </n-space>
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
  NDataTable,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NTag,
  NDropdown,
  useMessage,
  useDialog,
  type DataTableColumns,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { settingsApi } from '@/api/settings'
import { useAuthStore } from '@/stores/auth'
import type { TenantAdmin, TenantAdminRole } from '@/types'

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const authStore = useAuthStore()

const formRef = ref<FormInst | null>(null)
const loading = ref(false)
const showModal = ref(false)
const editingAdmin = ref<TenantAdmin | null>(null)
const submitting = ref(false)
const admins = ref<TenantAdmin[]>([])

const formData = reactive({
  name: '',
  email: '',
  role: 'operator' as TenantAdminRole,
  password: '',
})

const roleOptions = computed(() => [
  { label: t('settings.roleOwner'), value: 'owner', disabled: true },
  { label: t('settings.roleAdmin'), value: 'admin' },
  { label: t('settings.roleOperator'), value: 'operator' },
])

const formRules: FormRules = {
  name: [{ required: true, message: () => t('settings.nameRequired'), trigger: 'blur' }],
  email: [
    { required: true, message: () => t('settings.emailRequired'), trigger: 'blur' },
    { type: 'email', message: () => t('settings.invalidEmail'), trigger: 'blur' },
  ],
  role: [{ required: true, message: () => t('settings.roleRequired'), trigger: 'blur' }],
  password: [
    { required: true, message: () => t('settings.passwordRequired'), trigger: 'blur' },
    { min: 8, message: () => t('settings.passwordMinLength'), trigger: 'blur' },
  ],
}

const columns: DataTableColumns<TenantAdmin> = [
  {
    title: t('settings.name'),
    key: 'name',
    width: 150,
  },
  {
    title: t('settings.email'),
    key: 'email',
    width: 200,
    ellipsis: { tooltip: true },
  },
  {
    title: t('settings.role'),
    key: 'role',
    width: 120,
    render: (row) => {
      const roleConfig: Record<TenantAdminRole, { type: 'error' | 'warning' | 'info'; label: string }> = {
        owner: { type: 'error', label: t('settings.roleOwner') },
        admin: { type: 'warning', label: t('settings.roleAdmin') },
        operator: { type: 'info', label: t('settings.roleOperator') },
      }
      const config = roleConfig[row.role]
      return h(NTag, { size: 'small', type: config.type }, () => config.label)
    },
  },
  {
    title: t('settings.status'),
    key: 'status',
    width: 100,
    render: (row) =>
      h(
        NTag,
        { size: 'small', type: row.status === 'active' ? 'success' : 'default' },
        () => (row.status === 'active' ? t('common.active') : t('common.inactive'))
      ),
  },
  {
    title: t('settings.lastLogin'),
    key: 'lastLoginAt',
    width: 160,
    render: (row) => (row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : '-'),
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
      // Can't edit yourself or owner
      if (row.id === authStore.user?.id || row.role === 'owner') {
        return null
      }

      const options = [
        { label: t('common.edit'), key: 'edit' },
        { label: t('settings.resetPassword'), key: 'resetPassword' },
        { type: 'divider', key: 'd1' },
        { label: row.status === 'active' ? t('settings.disable') : t('settings.enable'), key: 'toggleStatus' },
        { label: t('common.delete'), key: 'delete' },
      ]

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

const loadAdmins = async () => {
  loading.value = true
  try {
    const response = await settingsApi.getAdmins()
    admins.value = (response as any).items || response as any
  } catch (error) {
    console.error('Failed to load admins:', error)
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  editingAdmin.value = null
  Object.assign(formData, {
    name: '',
    email: '',
    role: 'operator',
    password: '',
  })
  showModal.value = true
}

const handleEdit = (admin: TenantAdmin) => {
  editingAdmin.value = admin
  Object.assign(formData, {
    name: admin.name,
    email: admin.email,
    role: admin.role,
    password: '',
  })
  showModal.value = true
}

const handleSubmit = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    if (editingAdmin.value) {
      await settingsApi.updateAdmin(editingAdmin.value.id, {
        name: formData.name,
        role: formData.role,
      })
      message.success(t('settings.updateSuccess'))
    } else {
      await settingsApi.createAdmin(formData)
      message.success(t('settings.createSuccess'))
    }
    showModal.value = false
    loadAdmins()
  } catch (error: any) {
    message.error(error.message || t('common.error'))
  } finally {
    submitting.value = false
  }
}

const handleAction = (key: string, admin: TenantAdmin) => {
  switch (key) {
    case 'edit':
      handleEdit(admin)
      break
    case 'resetPassword':
      handleResetPassword(admin)
      break
    case 'toggleStatus':
      handleToggleStatus(admin)
      break
    case 'delete':
      handleDelete(admin)
      break
  }
}

const handleResetPassword = (admin: TenantAdmin) => {
  dialog.warning({
    title: t('settings.resetPassword'),
    content: t('settings.resetPasswordConfirm', { name: admin.name }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await settingsApi.resetAdminPassword(admin.id)
        message.success(t('settings.resetPasswordSuccess'))
      } catch (error: any) {
        message.error(error.message || t('common.error'))
      }
    },
  })
}

const handleToggleStatus = (admin: TenantAdmin) => {
  const action = admin.status === 'active' ? 'disable' : 'enable'
  const actionText = admin.status === 'active' ? t('settings.disable') : t('settings.enable')

  dialog.warning({
    title: actionText,
    content: t('settings.toggleStatusConfirm', { name: admin.name, action: actionText }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await settingsApi.updateAdmin(admin.id, {
          status: action === 'disable' ? 'inactive' : 'active',
        })
        message.success(t('settings.toggleStatusSuccess'))
        loadAdmins()
      } catch (error: any) {
        message.error(error.message || t('common.error'))
      }
    },
  })
}

const handleDelete = (admin: TenantAdmin) => {
  dialog.error({
    title: t('common.delete'),
    content: t('settings.deleteAdminConfirm', { name: admin.name }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await settingsApi.deleteAdmin(admin.id)
        message.success(t('settings.deleteSuccess'))
        loadAdmins()
      } catch (error: any) {
        message.error(error.message || t('common.error'))
      }
    },
  })
}

onMounted(() => {
  loadAdmins()
})
</script>
